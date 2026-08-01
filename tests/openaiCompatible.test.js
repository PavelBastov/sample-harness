import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { completeOpenAI } from "../model/openaiCompatible.js";
import { Provider } from "../model/provider.js";

test("completeOpenAI posts the right request and parses an OpenAI-compatible response", async () => {
  let capturedBody, capturedAuth;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      capturedBody = JSON.parse(raw);
      capturedAuth = req.headers.authorization;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: { content: "hello", reasoning_content: "thinking...", tool_calls: [] },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
      );
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const provider = new Provider(`http://127.0.0.1:${port}/v1`, "gemma4:12b", "ollama");
    const result = await completeOpenAI(provider, [{ role: "user", content: "hi" }]);

    assert.equal(capturedAuth, "Bearer ollama");
    assert.equal(capturedBody.model, "gemma4:12b");
    assert.equal(capturedBody.max_tokens, 1024);
    assert.ok(!("tools" in capturedBody));

    assert.equal(result.content, "hello");
    assert.equal(result.reasoning, "thinking...");
    assert.equal(result.finishReason, "stop");
    assert.equal(result.usage.total_tokens, 7);
  } finally {
    server.close();
  }
});

test("completeOpenAI includes tools in the request body when provided", async () => {
  let capturedBody;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      capturedBody = JSON.parse(raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const provider = new Provider(`http://127.0.0.1:${port}/v1`, "gemma4:12b", "ollama");
    const tools = [{ type: "function", function: { name: "noop" } }];
    await completeOpenAI(provider, [{ role: "user", content: "hi" }], { tools });

    assert.deepEqual(capturedBody.tools, tools);
  } finally {
    server.close();
  }
});

test("completeOpenAI throws a clear error on a non-2xx response", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "boom" }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const provider = new Provider(`http://127.0.0.1:${port}/v1`, "gemma4:12b", "ollama");
    await assert.rejects(
      () => completeOpenAI(provider, [{ role: "user", content: "hi" }]),
      /failed: 500/,
    );
  } finally {
    server.close();
  }
});

test("completeOpenAI throws a clear error when the request exceeds the timeout", async () => {
  const server = http.createServer(() => {}); // never responds
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const provider = new Provider(`http://127.0.0.1:${port}/v1`, "gemma4:12b", "ollama");
    await assert.rejects(
      () => completeOpenAI(provider, [{ role: "user", content: "hi" }], { timeoutMs: 50 }),
      /timed out/,
    );
  } finally {
    server.close();
  }
});
