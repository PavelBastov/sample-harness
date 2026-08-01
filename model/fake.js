import { Provider, createLLMResponse } from "./provider.js";

function makeResponder({ scripted, default: defaultText = "ok" } = {}) {
  let i = 0;
  return async (messages) => {
    let content;
    if (typeof scripted === "function") {
      content = scripted(messages);
    } else if (Array.isArray(scripted) && scripted.length > 0) {
      content = scripted[Math.min(i, scripted.length - 1)]; // consume in order, then repeat last
      i += 1;
    } else {
      content = defaultText; // also covers scripted === [] (empty list)
    }
    return createLLMResponse({ content, finishReason: "stop", raw: { fake: true } });
  };
}

export function fake({ scripted, default: defaultText = "ok" } = {}) {
  return new Provider("fake://local", "fake", "x", makeResponder({ scripted, default: defaultText }));
}
