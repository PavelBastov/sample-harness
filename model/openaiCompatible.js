import { createLLMResponse } from "./provider.js";

export async function completeOpenAI(provider, messages, options = {}) {
  const { model, tools, temperature = 0.0, maxTokens = 1024, timeoutMs = 180000 } = options;
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = { model: model ?? provider.model, messages, temperature, max_tokens: maxTokens };
  if (tools) body.tools = tools; // never populated in ch-01; kept for forward compatibility

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Could not reach ${url} (${err.message}) - is Ollama running?`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM request to ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = await res.json();
  const choice = data.choices[0];
  const message = choice.message ?? {};
  return createLLMResponse({
    content: message.content ?? null,
    reasoning: message.reasoning_content ?? null,
    toolCalls: message.tool_calls ?? [],
    usage: data.usage ?? {},
    finishReason: choice.finish_reason ?? null,
    raw: data,
  });
}
