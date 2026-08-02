// Execution environment - the harness runs code, the model never does.
//
// When a tool shells out, the command runs inside this sandbox, not on the
// host shell. The model only ever sees the captured stdout/stderr and exit
// code.
//
// This is the minimal form: it prefers Docker (an isolated container) and
// falls back to a local subprocess when no Docker daemon is around. Give it a
// workdir and the command runs in that persistent directory - so a bash
// command can see a file a write tool just created (the workspace seam)
// instead of a throwaway dir.
//
// The real boundary - no network, a non-root user, a scrubbed environment
// with no inherited credentials - is the hardening that lands at ch-08. Here
// the point is just the seam: code execution goes through one chokepoint the
// harness controls.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class Sandbox {
  constructor({ image = "busybox", timeoutMs = 15000, preferDocker = true } = {}) {
    this.image = image;
    this.timeoutMs = timeoutMs;
    this.preferDocker = preferDocker;
    this._docker = null;
  }

  _dockerUp() {
    if (!this.preferDocker) return false;
    if (this._docker === null) {
      try {
        this._docker = spawnSync("docker", ["info"], { timeout: 5000 }).status === 0;
      } catch {
        this._docker = false;
      }
    }
    return this._docker;
  }

  run(command, { workdir } = {}) {
    // A workdir makes the sandbox operate on a persistent workspace
    // (bind-mounted in docker, cwd locally) instead of a throwaway dir.
    return this._dockerUp() ? this._runDocker(command, workdir) : this._runLocal(command, workdir);
  }

  _runDocker(command, workdir) {
    const mount = workdir ? ["-v", `${workdir}:/work`] : ["--tmpfs", "/work:rw,size=16m"];
    const argv = ["run", "--rm", ...mount, "-w", "/work", this.image, "sh", "-c", command];
    const proc = spawnSync("docker", argv, { encoding: "utf8", timeout: this.timeoutMs });
    return { stdout: proc.stdout ?? "", stderr: proc.stderr ?? "", exitCode: proc.status ?? -1, backend: "docker" };
  }

  _runLocal(command, workdir) {
    const cwd = workdir ?? fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-"));
    const proc = spawnSync("bash", ["-c", command], { cwd, encoding: "utf8", timeout: this.timeoutMs });
    return { stdout: proc.stdout ?? "", stderr: proc.stderr ?? "", exitCode: proc.status ?? -1, backend: "local" };
  }
}

// A bash tool whose commands run inside the sandbox. With a workdir, commands
// run in the persistent workspace (so they see files the edit tools wrote).
export function bashTool(sandbox, { workdir } = {}) {
  return {
    name: "bash",
    description: "Run a shell command in an isolated sandbox and return its output.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    func: ({ command }) => {
      const r = sandbox.run(command, { workdir });
      const body = (r.stdout + r.stderr).trim();
      return `[exit ${r.exitCode} via ${r.backend}]\n${body}`;
    },
  };
}
