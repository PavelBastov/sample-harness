# CLAUDE.md — sample-harness

## Intent

Node.js port of the `carbon` course (https://github.com/thecarbonlayer/carbon, checked out locally
at `../carbon`), which builds an agent harness from scratch, one primitive per chapter, on the
thesis **Agent = Model + Harness**. The course is a `ch-00`..`ch-14` spine (see `../carbon/AGENTS.md`
/ `README.md` for the full chapter list); this repo ports it chapter by chapter into Node.js.
Currently implemented: `ch-01` (one model call behind a swappable provider seam) and `ch-02`
(conversation history — the harness keeps a `messages` list and replays it in full on every turn;
the model itself is still stateless). No system prompt, tools, or memory yet. More chapters are
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
  unused today (`new Agent()` is always called with no args), but it's intentional forward-compatible
  plumbing carried over from the reference, not dead code — keep it when refactoring, and expect
  future chapters (multiple agents/subagents sharing one provider) to actually exercise it.
- **Testing stays offline.** `npm test` runs Node's built-in `node:test` suite against the `fake`
  provider and a local `node:http` mock server — no real network calls. Manual end-to-end
  verification against the live Ollama model is a separate, human-run step (`npm start`), not part
  of the test suite.
- **No runtime dependencies, by design.** Global `fetch`/`AbortController` cover HTTP, `node:test`/
  `node:assert` cover testing. This mirrors the Python reference's minimalism (its only dependency
  is `httpx`) — don't add a library (`dotenv`, `axios`, a test framework) without a clear reason as
  the port grows.
