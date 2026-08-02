import { test } from "node:test";
import assert from "node:assert/strict";
import { Workspace, editFileTool, writeFileTool } from "../harness/workspace.js";
import { Sandbox, bashTool } from "../harness/sandbox.js";

test("write, read, edit round-trip", () => {
  const ws = new Workspace();
  assert.match(ws.write("calc.js", "function add(a, b) {\n  return a+b;\n}\n"), /wrote/);
  assert.match(ws.read("calc.js"), /function add/);
  assert.match(ws.edit("calc.js", "a+b", "a + b"), /edited/);
  assert.match(ws.read("calc.js"), /a \+ b/);
});

test("path escape is blocked", () => {
  const ws = new Workspace();
  assert.throws(() => ws.write("../escape.js", "nope"), /escapes workspace/);
});

test("tool factories round-trip through the workspace", async () => {
  const ws = new Workspace();
  await writeFileTool(ws).func({ path: "a.txt", content: "hello" });
  assert.equal(ws.read("a.txt"), "hello");
  await editFileTool(ws).func({ path: "a.txt", old: "hello", new: "world" });
  assert.equal(ws.read("a.txt"), "world");
});

test("bash runs in the workspace directory", () => {
  const ws = new Workspace();
  ws.write("hi.txt", "HELLO-WS");
  const bash = bashTool(new Sandbox({ preferDocker: false }), { workdir: ws.root });
  assert.match(bash.func({ command: "cat hi.txt" }), /HELLO-WS/);
});
