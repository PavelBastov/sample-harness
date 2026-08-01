import { Provider } from "./provider.js";
import { completeOpenAI } from "./openaiCompatible.js";

export async function chat(messages, options = {}) {
  const { model, tools, temperature = 0.0, maxTokens = 1024, timeoutMs = 180000, provider } = options;
  const resolvedProvider = provider ?? Provider.fromEnv();

  if (resolvedProvider.responder) {
    return await resolvedProvider.responder(messages, { model, tools, temperature, maxTokens, timeoutMs });
  }
  return await completeOpenAI(resolvedProvider, messages, { model, tools, temperature, maxTokens, timeoutMs });
}
