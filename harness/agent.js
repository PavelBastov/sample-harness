import readline from "node:readline";
import { chat } from "../model/index.js";
import { loadAgentsMd } from "./instructions.js";

export class Agent {
  constructor({ model, provider, system, agentsDir = "." } = {}) {
    this.model = model;
    this.provider = provider;
    this.system = system;
    this.agentsDir = agentsDir; // where AGENTS.md is auto-loaded from
    this.messages = [];
  }

  _systemText() {
    // instruction layer = optional caller-supplied system prompt + project AGENTS.md
    return [this.system, loadAgentsMd(this.agentsDir)].filter(Boolean).join("\n\n");
  }

  _payload() {
    // system prompt first (if any), then the full conversation history
    const sysText = this._systemText();
    const head = sysText ? [{ role: "system", content: sysText }] : [];
    return [...head, ...this.messages];
  }

  async send(userText) {
    // append, replay history behind the system prompt, append the reply - that
    // loop is the entire reason the agent now feels like it remembers.
    this.messages.push({ role: "user", content: userText });
    const resp = await chat(this._payload(), { model: this.model, provider: this.provider });
    this.messages.push({ role: "assistant", content: resp.content });
    return resp.content;
  }
}

export async function main() {
  const agent = new Agent();
  console.log("agent ready (ch-03) - auto-loads AGENTS.md from the cwd, if present. Ctrl-D to exit.");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
  rl.prompt();

  for await (const line of rl) {
    const user = line.trim();
    if (user) {
      try {
        console.log("bot>", await agent.send(user));
      } catch (err) {
        console.error("bot> [error]", err.message);
      }
    }
    // stdin can close while the await above is in flight (e.g. piped input
    // ending mid-request) - prompting a closed interface throws, so guard it.
    if (!rl.closed) rl.prompt();
  }
  console.log();
}
