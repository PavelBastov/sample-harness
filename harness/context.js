// Context delivery (ch-04).
//
// The model can't read files; the harness does. deliver() scans user text for
// @path references, reads those files, and returns them as context blocks the
// agent injects into the prompt - turning "look at @notes.txt" into the file's
// actual contents in the window.
//
// The blocks here are raw and uncapped. A huge file would flood the window;
// that's a real problem, and door control (clamping each block) is the job of
// a later chapter. Right now the point is just: the harness, not the model,
// opens the file.

import fs from "node:fs";

const ATTACH = /@(\S+)/g;

export function deliver(userText) {
  const blocks = [];
  for (const match of userText.matchAll(ATTACH)) {
    const p = match[1];
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      try {
        const body = fs.readFileSync(p, "utf8");
        blocks.push(`--- ${p} ---\n${body}`);
      } catch {
        continue;
      }
    }
  }
  return blocks;
}
