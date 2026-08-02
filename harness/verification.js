// Verification helpers - introduced here, wired into the loop later (ch-12).
//
// ch-08 is the execution environment: the place where untrusted code runs
// behind a boundary. runJs() is the same start-closed posture as the bash
// sandbox - candidate code runs in a fresh process with a *scrubbed*
// environment and a scoped temp workdir, so we never hand model-written code
// our credentials.
//
// The module lands now because the sandbox exercise needs it, but the agent
// loop does not call it yet. Turning this into a self-checking feedback loop
// (run the model's code against an assertion, feed failures back, correct) is
// the verification primitive that lands at ch-12.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FENCE = /```(?:js|javascript)?\s*([\s\S]*?)```/;

// Pull a fenced JS code block from model output, or return the text as-is.
export function extractCode(text) {
  const match = FENCE.exec(text);
  return (match ? match[1] : text).trim();
}

// Run candidate `code` then an assertion `check` in a fresh process.
//
// Model-written code runs with a *scrubbed* environment and a scoped temp
// workdir - the same start-closed posture as the bash sandbox, so we don't
// hand untrusted code our credentials (a real Docker sandbox would also cut
// network).
export function runJs(code, check, { timeoutMs = 10000 } = {}) {
  const script = `${code}\n\n${check}\nconsole.log("VERIFICATION_OK");\n`;
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
  const candidate = path.join(workdir, "candidate.js");
  fs.writeFileSync(candidate, script);
  const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: workdir, LC_ALL: "C" };

  const proc = spawnSync(process.execPath, [candidate], { cwd: workdir, env, encoding: "utf8", timeout: timeoutMs });
  if (proc.error?.code === "ETIMEDOUT") {
    return { passed: false, output: "error: timed out" };
  }
  const output = ((proc.stdout ?? "") + (proc.stderr ?? "")).trim();
  const passed = proc.status === 0 && (proc.stdout ?? "").includes("VERIFICATION_OK");
  return { passed, output };
}
