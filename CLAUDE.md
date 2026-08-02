# CLAUDE.md — sample-harness

## Intent

Node.js port of the `carbon` course (https://github.com/thecarbonlayer/carbon, checked out locally
at `../carbon`), which builds an agent harness from scratch, one primitive per chapter, on the
thesis **Agent = Model + Harness**. The course is a `ch-00`..`ch-14` spine (see `../carbon/AGENTS.md`
/ `README.md` for the full chapter list); this repo ports it chapter by chapter into Node.js.
Currently implemented: `ch-01` (one model call behind a swappable provider seam), `ch-02`
(conversation history — the harness keeps a `messages` list and replays it in full on every turn;
the model itself is still stateless), `ch-03` (instructions — a system prompt, assembled from an optional caller-supplied `system`
plus an `AGENTS.md` auto-loaded from the working directory, is prepended to every call; no
`AGENTS.md` and no `system` means no system prompt at all), `ch-04` (context delivery — the
harness scans each user turn for `@path` references and injects the referenced file's contents as
its own context message ahead of the real turn; the model never opens a file itself, it only sees
what the harness hands it), and `ch-05` (tools — the model returns tool calls, `Agent._run()` runs
them in a bounded loop and feeds each raw result back as a `tool` message until the model produces
a final answer; boundary-crossing tools — `bash`, `write_file`, `edit_file` — must clear an
`approve` callback first and fail closed with no approver wired). No memory yet. More chapters are
expected to land here over time, cumulatively, in the same order as the reference.

## Working in this repo

- **Cumulative, one primitive per chapter.** When porting the next chapter (e.g. `ch-02`'s
  conversation history), read that chapter in the reference repo first (locally at `../carbon`, or
  https://github.com/thecarbonlayer/carbon if the local checkout is stale/unavailable), then add
  only that primitive on top of what's here — don't jump ahead or blend multiple chapters into one
  change.
- **Only backend: Ollama running `gemma4:12b`** at `http://localhost:11434/v1`. Config comes from
  `.env` (see `.env.example`), read via `Provider.fromEnv()` in `model/provider.js`. Real env vars
  always win over `.env` file values.
- **The seam.** Every model call goes through `chat()` in `model/client.js`. Harness code (
  `harness/agent.js`) must never call `completeOpenAI` (`model/openaiCompatible.js`) directly —
  that indirection is what lets `fake()` (`model/fake.js`) swap in a scripted, offline provider for
  tests without touching harness code.
- **`Provider` vs. the `model` field on `Agent`.** `Provider` holds *where* to reach a backend (base
  URL, API key) plus its default model. The `model` passed to `Agent`/`chat()` is a *per-call
  override* of just that field (`model ?? provider.model` in `model/openaiCompatible.js`). It's
  unused today (every `Agent` still gets the default provider), but it's intentional
  forward-compatible plumbing carried over from the reference, not dead code — keep it when
  refactoring, and expect future chapters (multiple agents/subagents sharing one provider) to
  actually exercise it.
- **The REPL's approval prompt uses `question()` exclusively, never the async iterator.** `main()`
  in `harness/agent.js` reads every line — the main prompt and the nested `approve` callback alike —
  through one `rl.question()`-based helper. Mixing that with `for await (const line of rl)` on the
  same `readline` interface is broken: both attach `'line'` listeners, so a line meant to answer the
  approval prompt also gets queued by the iterator and reappears as the next user turn. Don't
  reintroduce the iterator form here.
- **Testing stays offline.** `npm test` runs Node's built-in `node:test` suite against the `fake`
  provider and a local `node:http` mock server — no real network calls. Manual end-to-end
  verification against the live Ollama model is a separate, human-run step (`npm start`), not part
  of the test suite.
- **No runtime dependencies, by design.** Global `fetch`/`AbortController` cover HTTP, `node:test`/
  `node:assert` cover testing. This mirrors the Python reference's minimalism (its only dependency
  is `httpx`) — don't add a library (`dotenv`, `axios`, a test framework) without a clear reason as
  the port grows.
