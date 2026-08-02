# sample-harness

A Node.js/JavaScript port of the [`carbon`](https://github.com/thecarbonlayer/carbon) course, which
builds an agent harness from scratch, one primitive per chapter, on the thesis
**Agent = Model + Harness**. This repo re-implements that course chapter by chapter in Node.js,
targeting a local [Ollama](https://ollama.com) instance running `gemma4:12b` as the only backend.

The model rarely changes; the harness (loop, instructions, context, tools, memory, sandbox,
orchestration, subagents, verification, observability, UI) is where the engineering lives — and
where this port is built up incrementally.

## Chapter progress

| Chapter | Primitive                  | Status         |
|---------|-----------------------------|----------------|
| ch-00   | What is an agent? (framing) | not ported     |
| ch-01   | Model only — one call behind a swappable provider seam | ✅ done |
| ch-02   | History — the harness owns the conversation | ✅ done |
| ch-03   | Instructions — set behavior once, prepend it every turn | ✅ done |
| ch-04   | Context delivery — @path references injected into the prompt | ✅ done |
| ch-05   | Tools — the model acts, the harness runs it | ✅ done |
| ch-06   | Context management — compaction + door control | ✅ done |
| ch-07   | Skills — reusable procedures the model loads on demand | ✅ done |
| ch-08   | Execution environment — a hardened sandbox boundary | ✅ done |
| ch-09   | Durable state                | not ported     |
| ch-10   | Orchestration                | not ported     |
| ch-11   | Subagents                    | not ported     |
| ch-12   | Verification                 | not ported     |
| ch-13   | Observability                | not ported     |
| ch-14   | UI                           | not ported     |

Chapters are cumulative: each one builds on the last, matching the reference. See `CLAUDE.md` for
the conventions to follow when porting the next one.

## Prerequisites

- Node.js >= 18 (needed for the global `fetch`/`AbortController` used by the HTTP client)
- [Ollama](https://ollama.com) installed and running (`ollama serve`), with the model pulled:
  ```
  ollama pull gemma4:12b
  ```

## Setup

```
cp .env.example .env
```
Adjust `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` in `.env` if your Ollama setup differs from the
defaults (`http://localhost:11434/v1`, `gemma4:12b`).

## Usage

```
npm start
```
Starts the REPL (Ctrl-D to exit). Each chapter has added a capability on top of the last:

- **ch-02 — History.** The harness keeps a `messages` list and replays it in full on every turn, so
  the agent remembers earlier turns within a session (the model call itself is still stateless — the
  harness is what remembers). History resets when the process exits.
- **ch-03 — Instructions.** An `AGENTS.md` auto-loaded from the working directory (if present) is
  assembled into a system prompt once and prepended to every call, instead of being restated per
  turn. No `AGENTS.md` → no system prompt at all.
- **ch-04 — Context delivery.** Referencing `@path/to/file` anywhere in your message has the harness
  read that file and inject its contents as context ahead of your turn — the model never opens files
  itself, it only sees what the harness hands it.
- **ch-05 — Tools.** The model can call tools (`calculator`, `read_file`, `write_file`, `edit_file`,
  `bash`) — the harness runs them in a bounded loop and feeds each result back until the model
  produces a final answer. `bash`/`write_file`/`edit_file` cross a boundary (a shell, the
  filesystem), so each call needs your explicit `y`/`N` approval at the prompt before it runs;
  refusing (or hitting Enter) denies it. `write_file`/`edit_file` operate over a scratch workspace
  directory that `bash` also runs in, so a shell command can see a file the model just wrote.
- **ch-06 — Context management.** The harness manages a finite window: once the conversation's
  estimated size passes `--context-limit` (default 4000 tokens), it summarizes everything but the
  first couple and last few messages into one checkpoint note before the next model call, so the
  agent stays coherent instead of losing history off the back of the window — watch it happen live
  with a low limit, e.g. `npm start -- --context-limit 400`. Separately, every `@path` file and every
  tool result is clamped to a max size before it enters the prompt, so one huge file or tool output
  can't flood the window on its own.
- **ch-07 — Skills.** Any directory under `skills/` holding a `SKILL.md` (YAML frontmatter with
  `name`/`description`, then a body) is loaded at startup and advertised in the system prompt as a
  one-line menu entry — the body itself is never injected up front. When a skill applies, the model
  reads the full `SKILL.md` on demand with the `read_file` tool and follows it (progressive
  disclosure: the window holds a menu, not every recipe). Try it with `use the sign-off skill` to see
  the model read `skills/sign-off/SKILL.md` and follow its procedure.
- **ch-08 — Execution environment.** The `bash` sandbox is hardened: with Docker available, commands
  run with `--network none`, as a non-root user, with capabilities dropped and a read-only
  filesystem; without Docker, the local fallback runs with a scrubbed environment (no inherited
  credentials) in a fresh workdir, so a command can't read your shell's secrets. `read_file` is now
  confined to the working directory — no more reading `/etc/passwd`. Compaction (ch-06) also gets
  more accurate: instead of only estimating the window from character counts, the harness prefers the
  model's own reported token usage once a call has been made.
- **`token_usage` tool** (not part of the ported chapters). Reports cumulative token spend across
  the session — the sum of every call's reported usage — not the current context window size;
  since the full history is resent on every call, this total isn't what drives compaction (ch-06
  checks the size of the most recent call instead). Ask the agent something like `how many tokens
  have we used?`.

```
npm test
```
Runs the offline unit test suite (`node:test`) — no network calls, no dependency on Ollama being up.

## Project layout

- `model/` — the provider seam: `chat()` (the single choke point every model call goes through),
  `Provider`/`Provider.fromEnv()`, the Ollama/OpenAI-compatible HTTP call, and a `fake` provider for
  offline tests.
- `harness/` — the agent loop itself (`Agent`, `main()`), instruction assembly (`instructions.js`),
  `@path` context delivery (`context.js`), the tool interface (`tools.js`), the hardened `bash`
  sandbox (`sandbox.js`), the agent's workspace directory + file tools (`workspace.js`), context
  management: compaction (`compaction.js`) and per-item door control (`limits.js`), skill loading +
  prompt assembly (`skills.js`), and verification helpers not yet wired into the loop
  (`verification.js`).
- `skills/` — skill directories (`<name>/SKILL.md`) the harness advertises and the model reads on
  demand; ships one example, `skills/sign-off/`.
- `bin/` — the `agent` CLI entry point.
- `tests/` — offline tests exercising both the above.
