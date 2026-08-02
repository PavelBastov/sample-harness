// The workspace - a directory the agent owns.
//
// A small, path-safe wrapper around a directory: write, read, and edit files whose
// contents survive across calls. Every path is confined to the workspace root, so a
// bad write can't escape to the host. By default it's a fresh scratch dir, so an
// experiment can't touch your real project; point `root` at a real repo only if
// you mean it.
//
// At ch-03 this is just the class - the accept check stages an AGENTS.md here to
// prove auto-loaded instructions work. The write/edit *tools* that let the model
// build a multi-file project arrive at ch-05, once the agent has a tool interface.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class Workspace {
  constructor(root) {
    this.root = path.resolve(root ?? fs.mkdtempSync(path.join(os.tmpdir(), "workspace-")));
    fs.mkdirSync(this.root, { recursive: true });
  }

  _safe(relPath) {
    const p = path.resolve(this.root, relPath);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) {
      throw new Error(`path escapes workspace: ${relPath}`);
    }
    return p;
  }

  write(relPath, content) {
    const p = this._safe(relPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    return `wrote ${relPath} (${content.length} chars)`;
  }

  read(relPath) {
    const p = this._safe(relPath);
    return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, "utf8") : `error: no such file: ${relPath}`;
  }

  edit(relPath, oldText, newText) {
    const p = this._safe(relPath);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return `error: no such file: ${relPath}`;
    const text = fs.readFileSync(p, "utf8");
    if (!text.includes(oldText)) return `error: text to replace not found in ${relPath}`;
    fs.writeFileSync(p, text.replace(oldText, newText));
    return `edited ${relPath}`;
  }
}
