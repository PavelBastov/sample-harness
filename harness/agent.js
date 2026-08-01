import readline from "node:readline";
import { chat } from "../model/index.js";

export class Agent {
  constructor({ model, provider } = {}) {
    this.model = model;
    this.provider = provider;
    // NO this.messages / history - ch-01 is stateless by design
  }

  async send(userText) {
    const resp = await chat([{ role: "user", content: userText }], {
      model: this.model,
      provider: this.provider,
    });
    return resp.content; // the whole array is built fresh and discarded every call
  }
}

export async function main() {
  const agent = new Agent();
  console.log("agent ready (ch-01) - stateless: no history, no system prompt, no tools. Ctrl-D to exit.");

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
