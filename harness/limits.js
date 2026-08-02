// Door control (ch-06).
//
// Hard per-item size limits, applied before anything enters the prompt. A
// single huge file or tool output can drown the window (distraction /
// confusion / poisoning); clamping each item at the door is the cheapest
// defense.

export const MAX_ITEM_CHARS = 4000;

export function clamp(text, maxChars = MAX_ITEM_CHARS) {
  if (text.length <= maxChars) return text;
  const dropped = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n…[truncated ${dropped} chars]`;
}
