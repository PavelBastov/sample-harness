// Context delivery (ch-04).
//
// The model can't read files; the harness does. deliver() scans user text for
// @path references, reads those files, and returns them as context blocks the
// agent injects into the prompt - turning "look at @notes.txt" into the file's
// actual contents in the window.
//
// Each block is clamped (ch-06 door control): a single huge file can't be
// allowed to flood the window, so it is truncated at the door before it ever
// enters the prompt. The harness, not the model, opens the file - and decides
// how much fits.

import fs from "node:fs";
import { clamp } from "./limits.js";

const ATTACH = /@(\S+)/g;

export function deliver(userText) {
  const blocks = [];
  for (const match of userText.matchAll(ATTACH)) {
    const p = match[1];
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      try {
        const body = fs.readFileSync(p, "utf8");
        blocks.push(clamp(`--- ${p} ---\n${body}`));
      } catch {
        continue;
      }
    }
  }
  return blocks;
}
