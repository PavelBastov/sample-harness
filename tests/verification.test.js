import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCode, runJs } from "../harness/verification.js";

test("extractCode pulls a fenced code block", () => {
  const text = "here you go:\n```js\nconst x = 1;\n```\nhope that helps";
  assert.equal(extractCode(text), "const x = 1;");
});

test("extractCode returns the text as-is when there's no fence", () => {
  assert.equal(extractCode("const x = 1;"), "const x = 1;");
});

test("passing code and assertion report passed", () => {
  const res = runJs("const answer = 42;", "require('node:assert').strict(answer === 42);");
  assert.equal(res.passed, true);
});

test("a failing assertion reports not passed", () => {
  const res = runJs("const answer = 41;", "require('node:assert').strict(answer === 42);");
  assert.equal(res.passed, false);
});

test("the verifier does not inherit the host environment", () => {
  process.env.LEAKY_SECRET = "SHOULD-NOT-LEAK";
  let res;
  try {
    res = runJs("", "require('node:assert').strict(process.env.LEAKY_SECRET === undefined);");
  } finally {
    delete process.env.LEAKY_SECRET;
  }
  assert.equal(res.passed, true);
});
