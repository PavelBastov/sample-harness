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
| ch-04   | Context delivery            | not ported     |
| ch-05   | Tools                       | not ported     |
| ch-06   | Context management          | not ported     |
| ch-07   | Skills                      | not ported     |
| ch-08   | Execution environment       | not ported     |
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
Starts the REPL. As of `ch-02`, the harness keeps a `messages` list and replays it in full on every
turn, so the agent remembers earlier turns within a session (the model call itself is still
stateless — the harness is what remembers). History resets when the process exits. As of `ch-03`,
an `AGENTS.md` auto-loaded from the working directory (if present) is assembled into a system prompt
once and prepended to every call, instead of being restated per turn. No `AGENTS.md` → no system
prompt at all. Ctrl-D to exit.

```
npm test
```
Runs the offline unit test suite (`node:test`) — no network calls, no dependency on Ollama being up.

## Project layout

- `model/` — the provider seam: `chat()` (the single choke point every model call goes through),
  `Provider`/`Provider.fromEnv()`, the Ollama/OpenAI-compatible HTTP call, and a `fake` provider for
  offline tests.
- `harness/` — the agent loop itself (`Agent`, `main()`), instruction assembly (`instructions.js`),
  and the agent's workspace directory (`workspace.js`).
- `bin/` — the `agent` CLI entry point.
- `tests/` — offline tests exercising both the above.
