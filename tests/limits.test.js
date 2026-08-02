import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp } from "../harness/limits.js";

test("clamp truncates with marker", () => {
  const out = clamp("A".repeat(10_000), 100);
  assert.ok(out.length < 10_000);
  assert.match(out, /truncated/);
});

test("clamp leaves small text alone", () => {
  assert.equal(clamp("short"), "short");
});
