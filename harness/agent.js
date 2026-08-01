import readline from "node:readline";
import { chat } from "../model/index.js";

export class Agent {
  constructor({ model, provider } = {}) {
    this.model = model;
    this.provider = provider;
    this.messages = []; // the only new attribute over ch-01 - the harness owns history, not the model
  }

  async send(userText) {
    // append, replay the whole conversation, append the reply - that loop is
    // the entire reason the agent now feels like it remembers.
    this.messages.push({ role: "user", content: userText });
    const resp = await chat(this.messages, { model: this.model, provider: this.provider });
    this.messages.push({ role: "assistant", content: resp.content });
    return resp.content;
  }
}

export async function main() {
  const agent = new Agent();
  console.log("agent ready (ch-02) - it remembers within this session. Ctrl-D to exit.");

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
