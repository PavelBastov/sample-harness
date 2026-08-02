import { Provider, createLLMResponse } from "./provider.js";

// scripted entries are usually plain content strings; returning a
// { content, toolCalls } object instead lets a test script a tool-call
// response, e.g. to exercise Agent's tool loop offline.
function toResponse(value) {
  if (value && typeof value === "object") return createLLMResponse({ finishReason: "stop", raw: { fake: true }, ...value });
  return createLLMResponse({ content: value, finishReason: "stop", raw: { fake: true } });
}

function makeResponder({ scripted, default: defaultText = "ok" } = {}) {
  let i = 0;
  return async (messages) => {
    let value;
    if (typeof scripted === "function") {
      value = scripted(messages);
    } else if (Array.isArray(scripted) && scripted.length > 0) {
      value = scripted[Math.min(i, scripted.length - 1)]; // consume in order, then repeat last
      i += 1;
    } else {
      value = defaultText; // also covers scripted === [] (empty list)
    }
    return toResponse(value);
  };
}

export function fake({ scripted, default: defaultText = "ok" } = {}) {
  return new Provider("fake://local", "fake", "x", makeResponder({ scripted, default: defaultText }));
}
