import { test } from "node:test";
import assert from "node:assert/strict";
import { Agent } from "../harness/agent.js";
import { fake } from "../model/fake.js";

test("Agent.send is stateless - never accumulates history across turns", async () => {
  const seen = [];
  const provider = fake({
    scripted: (messages) => {
      seen.push(messages);
      return `echo:${messages[messages.length - 1].content}`;
    },
  });
  const agent = new Agent({ provider });

  assert.equal(await agent.send("first"), "echo:first");
  assert.equal(await agent.send("second"), "echo:second");

  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], [{ role: "user", content: "first" }]);
  assert.deepEqual(seen[1], [{ role: "user", content: "second" }]); // not seen[0] + new turn
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
