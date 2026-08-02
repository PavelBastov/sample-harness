import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "../harness/agent.js";
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

test("attached file is injected", async () => {
  const f = path.join(process.cwd(), "notes.txt");
  fs.writeFileSync(f, "SECRET=42");
  const { seen, provider } = capture();

  await new Agent({ provider }).send(`@${f} what is the secret?`);

  const payloadText = seen[0].map((m) => m.content).join(" ");
  assert.match(payloadText, /SECRET=42/);
});

test("no attachment when no reference", async () => {
  const { seen, provider } = capture();
  await new Agent({ provider }).send("just a plain question");

  assert.deepEqual(seen[0], [{ role: "user", content: "just a plain question" }]);
});
