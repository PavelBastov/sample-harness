import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "../harness/agent.js";
import { Workspace } from "../harness/workspace.js";
import { fake } from "../model/fake.js";

// From ch-03 the agent auto-loads AGENTS.md from its (cwd-relative, by default)
// agentsDir. Isolate cwd per test so an ambient AGENTS.md - e.g. this repo's own
// CLAUDE.md sibling, or one added later - can't leak into these assertions.
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "sample-harness-test-")));
});

afterEach(() => {
  process.chdir(prevCwd);
});

function capture() {
  const seen = [];
  const provider = fake({
    scripted: (messages) => {
      seen.push(messages.map((m) => ({ role: m.role, content: m.content })));
      return "ok";
    },
  });
  return { seen, provider };
}

test("system message is prepended", async () => {
  const { seen, provider } = capture();
  await new Agent({ provider, system: "You are terse." }).send("hi");
  assert.deepEqual(seen[0][0], { role: "system", content: "You are terse." });
});

test("no system message by default", async () => {
  const { seen, provider } = capture();
  await new Agent({ provider }).send("hi");
  assert.ok(seen[0].every((m) => m.role !== "system"));
});

test("AGENTS.md layers onto the system prompt", async () => {
  const ws = new Workspace();
  ws.write("AGENTS.md", "Project rule: be terse.");
  const { seen, provider } = capture();
  await new Agent({ provider, system: "You are helpful.", agentsDir: ws.root }).send("hi");

  const systemText = seen[0][0].content;
  assert.match(systemText, /You are helpful\./);
  assert.match(systemText, /Project rule: be terse\./);
});
