// Context management - compaction (ch-06).
//
// When the conversation outgrows a budget, summarize the middle into one note
// and keep the head and tail intact (models read the start and end most
// reliably - "present is not the same as used"). A good summary preserves what
// the *next* turn needs, not merely fewer words.

import { chat } from "../model/index.js";

const COMPACTION_PROMPT =
  "You are a context summarizer. Compress the conversation below into a short " +
  "checkpoint another model will use to continue. Preserve, verbatim, every " +
  "concrete fact, code, name, decision, file path, and the current goal and " +
  "next step. Drop chit-chat. Be terse but lose nothing the next turn needs.";

// Cheap ~4-chars-per-token estimate over message contents.
export function estimateTokens(messages) {
  return Math.floor(messages.reduce((sum, m) => sum + String(m.content ?? "").length, 0) / 4);
}

// Summarize the middle of `messages` into a single note; keep head + tail.
export async function compact(messages, { keepHead = 2, keepTail = 4, model, provider } = {}) {
  if (messages.length <= keepHead + keepTail) return messages;

  const head = messages.slice(0, keepHead);
  const tail = messages.slice(messages.length - keepTail);
  const middle = messages.slice(keepHead, messages.length - keepTail);

  const transcript = middle.map((m) => `${m.role}: ${m.content ?? ""}`).join("\n");
  const resp = await chat(
    [
      { role: "system", content: COMPACTION_PROMPT },
      { role: "user", content: transcript },
    ],
    { model, provider, maxTokens: 512 },
  );

  const note = { role: "system", content: `[summary of earlier conversation]\n${resp.content}` };
  return [...head, note, ...tail];
}
