// Execution environment (ch-08) - the harness runs code, the model never does.
//
// The model only ever asks; the harness executes, inside a boundary. The
// sandbox prefers hardened Docker (--network none, non-root, scoped workdir)
// and falls back to a scoped local subprocess when no Docker daemon is
// available.
//
// "Start closed": no network, a fresh isolated workdir, and a scrubbed
// environment (no inherited credentials), so untrusted code never sees the
// host's secrets. The sandbox is the backstop, not the only defense.
//
// The seam was introduced minimal at ch-05 (one chokepoint for code
// execution); this is the hardening - the boundary that makes that chokepoint
// trustworthy. Give it a workdir and the command runs in that persistent
// directory, so a bash command can see a file a write tool just created (the
// workspace seam).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Minimal environment handed to sandboxed commands - note the absence of secrets.
const SCRUBBED_ENV = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LC_ALL: "C" };

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
    // Hardened: no network, non-root, capabilities dropped, writable only in
    // /work. /work is a throwaway tmpfs unless a workspace is bind-mounted.
    const mount = workdir ? ["-v", `${workdir}:/work`] : ["--tmpfs", "/work:rw,size=16m"];
    const argv = [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "65534:65534",
      "--cap-drop",
      "ALL",
      "--memory",
      "256m",
      "--pids-limit",
      "128",
      "--read-only",
      ...mount,
      "-w",
      "/work",
      this.image,
      "sh",
      "-c",
      command,
    ];
    const proc = spawnSync("docker", argv, { encoding: "utf8", timeout: this.timeoutMs });
    return { stdout: proc.stdout ?? "", stderr: proc.stderr ?? "", exitCode: proc.status ?? -1, backend: "docker" };
  }

  _runLocal(command, workdir) {
    // Fallback: scrubbed env + timeout. Uses the persistent workspace if
    // given, else a fresh throwaway dir. (network is NOT isolated here - that
    // needs Docker.)
    const cwd = workdir ?? fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-"));
    const env = { ...SCRUBBED_ENV, HOME: cwd, TMPDIR: cwd };
    const proc = spawnSync("bash", ["-c", command], { cwd, env, encoding: "utf8", timeout: this.timeoutMs });
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
