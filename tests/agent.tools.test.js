import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, tokenUsageTool } from "../harness/agent.js";
import { MAX_ITEM_CHARS } from "../harness/limits.js";
import { calculator, defaultTools, readFile, ToolRegistry } from "../harness/tools.js";
import { fake } from "../model/fake.js";

// Isolate cwd so an ambient AGENTS.md can't leak a system prompt in here.
let prevCwd;

beforeEach(() => {
  prevCwd = process.cwd();
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "sample-harness-test-")));
});

afterEach(() => {
  process.chdir(prevCwd);
});

test("calculator tool", () => {
  assert.equal(calculator("47 * 89"), "4183");
  assert.equal(calculator("2 ** 10"), "1024");
});

// --- read_file workspace scoping (ch-08) -------------------------------------
test("read_file blocks paths outside the workspace", () => {
  assert.match(readFile("/etc/passwd"), /^error: path outside/);
});

test("read_file allows paths inside the workspace", () => {
  fs.writeFileSync(path.join(process.cwd(), "notes.txt"), "hello");
  assert.equal(readFile("notes.txt"), "hello");
});

// --- token_usage tool ---------------------------------------------------------
test("token_usage tool reports the running total across turns", async () => {
  const provider = fake({
    scripted: [
      { content: "ok", usage: { total_tokens: 100 } },
      { content: "ok again", usage: { total_tokens: 50 } },
    ],
  });
  const tools = new ToolRegistry();
  const agent = new Agent({ provider, tools });
  tools.register(tokenUsageTool(agent));

  await agent.send("hi");
  await agent.send("hi again");

  assert.equal(agent.totalTokens, 150);
  assert.match(await tools.call("token_usage", "{}"), /150/);
});

test("tool call loop executes and returns", async () => {
  const provider = fake({
    scripted: [
      {
        content: "",
        toolCalls: [{ id: "1", function: { name: "calculator", arguments: '{"expression": "6 * 7"}' } }],
      },
      { content: "The answer is 42." },
    ],
  });

  const agent = new Agent({ provider, tools: defaultTools() });
  const out = await agent.send("what is 6 * 7?");

  assert.match(out, /42/);
  const toolMsgs = agent.messages.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 1);
  assert.equal(toolMsgs[0].content, "42");
});

test("a huge tool result is clamped at the door", async () => {
  const reg = new ToolRegistry();
  reg.register({
    name: "dump",
    description: "Return a large blob of text.",
    parameters: { type: "object", properties: {}, required: [] },
    func: () => "Z".repeat(MAX_ITEM_CHARS * 4),
  });
  const provider = fake({
    scripted: [{ content: "", toolCalls: [{ id: "1", function: { name: "dump", arguments: "{}" } }] }, { content: "done" }],
  });

  const agent = new Agent({ provider, tools: reg });
  await agent.send("dump it");

  const toolMsg = agent.messages.find((m) => m.role === "tool");
  assert.ok(toolMsg.content.length <= MAX_ITEM_CHARS + 100);
  assert.match(toolMsg.content, /truncated/);
});

// --- approval gate -----------------------------------------------------------
function dangerRegistry(ran) {
  const reg = new ToolRegistry();
  reg.register({
    name: "danger",
    description: "a boundary-crossing action",
    parameters: { type: "object", properties: {}, required: [] },
    func: () => {
      ran.push(1);
      return "executed";
    },
  });
  return reg;
}

async function runWith({ approve, approvalRequired }) {
  const ran = [];
  const provider = fake({
    scripted: [
      { content: "", toolCalls: [{ id: "1", function: { name: "danger", arguments: "{}" } }] },
      { content: "done" },
    ],
  });
  const agent = new Agent({ provider, tools: dangerRegistry(ran), approve, approvalRequired });
  await agent.send("do the danger");
  const toolMsgs = agent.messages.filter((m) => m.role === "tool");
  return { ran, toolMsgs };
}

test("denied tool does not execute", async () => {
  const { ran, toolMsgs } = await runWith({ approve: () => false, approvalRequired: new Set(["danger"]) });
  assert.deepEqual(ran, []);
  assert.ok(toolMsgs.some((m) => m.content.includes("[denied")));
});

test("approved tool executes", async () => {
  const { ran, toolMsgs } = await runWith({ approve: () => true, approvalRequired: new Set(["danger"]) });
  assert.deepEqual(ran, [1]);
  assert.ok(toolMsgs.some((m) => m.content.includes("executed")));
});

test("no approver fails closed", async () => {
  const { ran, toolMsgs } = await runWith({ approve: undefined, approvalRequired: new Set(["danger"]) });
  assert.deepEqual(ran, []);
  assert.ok(toolMsgs.some((m) => m.content.includes("[denied")));
});

test("ungated tool runs freely", async () => {
  const { ran } = await runWith({ approve: () => false, approvalRequired: new Set() });
  assert.deepEqual(ran, [1]); // not in approvalRequired -> not gated
});
