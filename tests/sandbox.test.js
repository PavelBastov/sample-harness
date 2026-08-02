import { test } from "node:test";
import assert from "node:assert/strict";
import { bashTool, Sandbox } from "../harness/sandbox.js";

test("command runs and returns output", () => {
  const r = new Sandbox({ preferDocker: false }).run("echo hello-from-sandbox");
  assert.equal(r.backend, "local");
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /hello-from-sandbox/);
});

test("environment is scrubbed", () => {
  process.env.SANDBOX_SECRET = "POULTRY-FARM";
  let r;
  try {
    r = new Sandbox({ preferDocker: false }).run("printenv SANDBOX_SECRET || echo CLEAN");
  } finally {
    delete process.env.SANDBOX_SECRET;
  }
  assert.doesNotMatch(r.stdout, /POULTRY-FARM/);
  assert.match(r.stdout, /CLEAN/);
});

test("runs in an isolated workdir", () => {
  const r = new Sandbox({ preferDocker: false }).run("pwd");
  assert.match(r.stdout, /sandbox-/); // the fresh temp workdir, not the repo
});

test("bash tool wraps the sandbox", () => {
  const tool = bashTool(new Sandbox({ preferDocker: false }));
  const out = tool.func({ command: "echo hi" });
  assert.match(out, /hi/);
  assert.match(out, /via local/);
});
