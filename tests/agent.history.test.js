import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "../harness/agent.js";
import { fake } from "../model/fake.js";

// Isolate cwd so an ambient AGENTS.md can't leak a system prompt into these
// history-only assertions.
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "sample-harness-test-")));
});

afterEach(() => {
  process.chdir(prevCwd);
});

test("Agent.send replays the full history on every call", async () => {
  const seen = [];
  const provider = fake({
    scripted: (messages) => {
      seen.push(messages.map((m) => m.content));
      return "ok";
    },
  });
  const agent = new Agent({ provider });

  await agent.send("first");
  await agent.send("second");

  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], ["first"]);
  // second call sees user1, assistant1, user2 - not just "second" in isolation
  assert.deepEqual(seen[1], ["first", "ok", "second"]);
});

test("the model can use history the harness replays", async () => {
  // Simulates a model that answers from whatever context it is given.
  const provider = fake({
    scripted: (messages) => {
      const joined = messages.map((m) => m.content).join(" ");
      return joined.includes("Gemma") ? "Your name is Gemma." : "Your name is unknown.";
    },
  });
  const agent = new Agent({ provider });

  await agent.send("Your name is Gemma.");
  const reply = await agent.send("What is your name?");

  assert.match(reply, /Gemma/);
});

test("fake() scripted list is consumed in order, then repeats the last entry", async () => {
  const agent = new Agent({ provider: fake({ scripted: ["a", "b"] }) });
  assert.equal(await agent.send("x"), "a");
  assert.equal(await agent.send("x"), "b");
  assert.equal(await agent.send("x"), "b");
});

test("fake() with no scripted option always returns the default reply", async () => {
  const agent = new Agent({ provider: fake() });
  assert.equal(await agent.send("x"), "ok");
  assert.equal(await agent.send("y"), "ok");
});
