// Project instructions - AGENTS.md.
//
// The built-in system prompt sets the agent's baseline behavior. But per-project
// rules ("you are Gemma", "always run the tests", a house style) shouldn't have to
// be typed every turn. So the harness auto-loads AGENTS.md from the working
// directory and layers it onto the system prompt - always on. Same convention as
// Codex, Claude Code, and pi.
//
// It's a layer on top of the built-in system prompt, not a replacement. No file ->
// empty string -> nothing changes.

import fs from "node:fs";
import path from "node:path";

export function loadAgentsMd(directory = ".") {
  const p = path.join(directory, "AGENTS.md");
  return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, "utf8") : "";
}
