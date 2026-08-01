import { readFileSync } from "node:fs";

export const DEFAULT_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_MODEL = "gemma4:12b";
export const DEFAULT_API_KEY = "ollama";

export class Provider {
  constructor(baseUrl, model, apiKey = "x", responder = null) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.apiKey = apiKey;
    this.responder = responder; // escape hatch for offline/fake providers
  }

  static fromEnv() {
    loadDotEnv();
    return new Provider(
      process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL,
      process.env.LLM_MODEL ?? DEFAULT_MODEL,
      process.env.LLM_API_KEY ?? DEFAULT_API_KEY,
    );
  }
}

export function ollama(model = DEFAULT_MODEL) {
  return new Provider("http://localhost:11434/v1", model, "ollama");
}

// Shared response shape - every provider path (real HTTP or fake) returns this.
export function createLLMResponse({
  content = null,
  reasoning = null,
  toolCalls = [],
  usage = {},
  finishReason = null,
  raw = null,
} = {}) {
  return { content, reasoning, toolCalls, usage, finishReason, raw };
}

function unquote(value) {
  if (
    value.length >= 2 &&
    ((value[0] === '"' && value[value.length - 1] === '"') ||
      (value[0] === "'" && value[value.length - 1] === "'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadDotEnv(path = ".env") {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return; // .env is optional - defaults still apply
    console.error(`warning: could not read ${path}: ${err.message}`);
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = unquote(trimmed.slice(idx + 1).trim());
    if (!(key in process.env)) process.env[key] = value; // real env vars always win
  }
}
