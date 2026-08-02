import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "../harness/agent.js";
import { loadSkills, skillsPrompt } from "../harness/skills.js";
import { fake } from "../model/fake.js";

// Isolate cwd per test so an ambient AGENTS.md can't leak into the payload.
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "sample-harness-test-")));
});

afterEach(() => {
  process.chdir(prevCwd);
});

function writeSkill(root, name, description, body = "body here") {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n${body}`);
}

test("load and prompt", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sample-harness-skills-"));
  writeSkill(root, "foo", "does foo");

  const skills = loadSkills(root);
  assert.equal(skills[0].name, "foo");
  assert.match(skills[0].description, /does foo/);

  const prompt = skillsPrompt(skills);
  assert.match(prompt, /read_file/);
  assert.match(prompt, /foo/);
  assert.doesNotMatch(prompt, /body here/); // the body is NOT advertised - only the description
});

test("agent advertises skills in the system prompt", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sample-harness-skills-"));
  writeSkill(root, "foo", "does foo");
  const skills = loadSkills(root);

  const seen = [];
  const provider = fake({
    scripted: (messages) => {
      seen.push(messages);
      return "ok";
    },
  });

  await new Agent({ provider, system: "base", skills }).send("hi");

  const sysMsg = seen[0][0];
  assert.equal(sysMsg.role, "system");
  assert.match(sysMsg.content, /base/);
  assert.match(sysMsg.content, /foo/);
});
