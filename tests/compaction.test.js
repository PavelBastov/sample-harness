import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "../harness/agent.js";
import { compact, estimateTokens } from "../harness/compaction.js";
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

test("estimateTokens is a ~chars/4 estimate", () => {
  assert.equal(estimateTokens([{ role: "user", content: "x".repeat(40) }]), 10);
});

test("compact keeps head and tail, summarizes the middle", async () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `m${i}` }));
  const provider = fake({ scripted: () => "SUMMARY" });

  const out = await compact(msgs, { keepHead: 2, keepTail: 2, provider });

  assert.deepEqual(out[0], msgs[0]);
  assert.deepEqual(out[1], msgs[1]);
  assert.deepEqual(out[out.length - 1], msgs[msgs.length - 1]);
  assert.deepEqual(out[out.length - 2], msgs[msgs.length - 2]);
  assert.ok(out.some((m) => m.content.includes("SUMMARY")));
  assert.ok(out.length < msgs.length);
});

test("agent compacts when the window is over budget", async () => {
  const provider = fake({
    scripted: (messages) => {
      const first = messages[0] ?? {};
      const isSummarize = first.role === "system" && String(first.content).toLowerCase().includes("summar");
      return isSummarize ? "SUMMARY" : "ok";
    },
  });

  const agent = new Agent({ provider, contextLimit: 20 });
  for (let i = 0; i < 8; i++) {
    await agent.send(`a reasonably long message number ${i} with some filler text`);
  }

  assert.ok(agent.messages.some((m) => String(m.content ?? "").startsWith("[summary")));
});

// --- reported usage drives compaction (ch-08) --------------------------------
test("agent tracks the model's reported usage", async () => {
  const provider = fake({ scripted: [{ content: "ok", usage: { total_tokens: 1234 } }] });

  const agent = new Agent({ provider });
  await agent.send("hi");

  assert.equal(agent._lastTokens, 1234);
});

test("compaction triggers on reported usage even when the char estimate is tiny", async () => {
  const provider = fake({
    scripted: (messages) => {
      const first = messages[0] ?? {};
      const isSummarize = first.role === "system" && String(first.content).toLowerCase().includes("summar");
      return isSummarize ? "SUMMARY" : { content: "ok", usage: { total_tokens: 99999 } };
    },
  });

  const agent = new Agent({ provider, contextLimit: 500 }); // char estimate of short msgs stays well under this
  for (let i = 0; i < 8; i++) {
    await agent.send("x");
  }

  assert.ok(agent.messages.some((m) => String(m.content ?? "").startsWith("[summary")));
});
