import readline from "node:readline";
import { chat } from "../model/index.js";
import { compact, estimateTokens } from "./compaction.js";
import { deliver } from "./context.js";
import { loadAgentsMd } from "./instructions.js";
import { clamp } from "./limits.js";
import { bashTool, Sandbox } from "./sandbox.js";
import { defaultTools } from "./tools.js";
import { editFileTool, Workspace, writeFileTool } from "./workspace.js";

const MAX_TOOL_STEPS = 6;
const DEFAULT_CONTEXT_LIMIT = 4000; // ~tokens; compact the history above this

export class Agent {
  constructor({
    model,
    provider,
    system,
    agentsDir = ".",
    tools,
    approve,
    approvalRequired,
    contextLimit = DEFAULT_CONTEXT_LIMIT,
  } = {}) {
    this.model = model;
    this.provider = provider;
    this.system = system;
    this.agentsDir = agentsDir; // where AGENTS.md is auto-loaded from
    this.tools = tools;
    this.approve = approve;
    this.approvalRequired = approvalRequired ?? new Set();
    this.contextLimit = contextLimit;
    this.messages = [];
    // Set true whenever the last turn triggered compaction - the REPL reads
    // this to surface that the window was managed (a demoable, visible event).
    this.justCompacted = false;
  }

  _approved(name, args) {
    // Fail closed: a tool marked as requiring approval with no approver wired is denied.
    return this.approve ? this.approve(name, args) : false;
  }

  async _maybeCompact() {
    // Estimate the window cheaply; compact only when it overruns the budget.
    this.justCompacted = false;
    if (estimateTokens(this.messages) > this.contextLimit) {
      this.messages = await compact(this.messages, { model: this.model, provider: this.provider });
      this.justCompacted = true;
    }
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
    // inject any @path files, append the turn, then drive the tool loop.
    for (const block of deliver(userText)) {
      this.messages.push({ role: "user", content: `Context file:\n${block}` });
    }
    this.messages.push({ role: "user", content: userText });
    return this._run();
  }

  async _run() {
    // Drive the model, executing tool calls until it produces a final answer.
    await this._maybeCompact();
    const specs = this.tools ? this.tools.specs() : undefined;
    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const resp = await chat(this._payload(), { model: this.model, tools: specs, provider: this.provider });
      if (resp.toolCalls?.length && this.tools) {
        this.messages.push({ role: "assistant", content: resp.content ?? "", tool_calls: resp.toolCalls });
        for (const tc of resp.toolCalls) {
          const fn = tc.function ?? {};
          const name = fn.name ?? "";
          const args = fn.arguments ?? "";
          // A boundary-crossing tool must clear the approval gate first.
          const result =
            this.approvalRequired.has(name) && !this._approved(name, args)
              ? "[denied by approval gate]"
              : await this.tools.call(name, args);
          this.messages.push({ role: "tool", tool_call_id: tc.id ?? "", content: clamp(result) });
        }
        continue;
      }
      this.messages.push({ role: "assistant", content: resp.content });
      return resp.content;
    }
    return "error: exceeded tool-step budget";
  }
}

function parseContextLimit(argv) {
  const flag = argv.indexOf("--context-limit");
  if (flag === -1) return DEFAULT_CONTEXT_LIMIT;
  const value = Number(argv[flag + 1]);
  if (!Number.isFinite(value)) {
    throw new Error("--context-limit requires a numeric argument");
  }
  return value;
}

export async function main() {
  // The REPL owns a scratch workspace: the file tools write into it and bash
  // runs over the same dir, so a command sees the file the model just wrote.
  const workspace = new Workspace();
  const tools = defaultTools();
  tools.register(writeFileTool(workspace));
  tools.register(editFileTool(workspace));
  tools.register(bashTool(new Sandbox(), { workdir: workspace.root }));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("close", () => console.log()); // trailing newline on Ctrl-D
  // A nested approval prompt has to share one line-reading mechanism with the
  // main loop below - mixing this question() helper with rl's async iterator
  // on the same interface causes lines to be consumed by the wrong listener.
  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  async function approve(name, args) {
    const answer = await question(`  approve ${name}(${args})? [y/N] `);
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  }

  const contextLimit = parseContextLimit(process.argv.slice(2));
  const agent = new Agent({
    tools,
    approve,
    approvalRequired: new Set(["bash", "write_file", "edit_file"]),
    contextLimit,
  });
  console.log(
    `agent ready (ch-06) - tools + an approval gate + a managed window ` +
      `(context limit ${agent.contextLimit}). Ctrl-D to exit.`,
  );
  console.log(`workspace: ${workspace.root} (scratch dir, discarded on exit)`);

  for (;;) {
    const user = (await question("you> ")).trim();
    if (user) {
      try {
        const reply = await agent.send(user);
        if (agent.justCompacted) {
          console.log("[context compacted - kept the start and end, summarized the middle]");
        }
        console.log("bot>", reply);
      } catch (err) {
        console.error("bot> [error]", err.message);
      }
    }
  }
}
