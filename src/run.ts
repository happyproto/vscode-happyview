// Running `hpy happyview check --json`, one run at a time.

import { spawn } from "node:child_process";

import { parseReport, type Parsed } from "./report";

export interface RunResult {
  parsed: Parsed;
  stdout: string;
  stderr: string;
  code: number | null;
}

/** hpy itself could not be started: not installed, or not where the setting
 * says. */
export class NotFound extends Error {}

export function runCheck(hpy: string, root: string, signal: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(hpy, ["happyview", "check", "--json", "--no-input"], {
      cwd: root,
      signal,
      // hpy never prompts here, but a Keychain dialog would still wait on a
      // terminal that is not there.
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (e.name === "AbortError") reject(e);
      else if (e.code === "ENOENT" || e.code === "EACCES") reject(new NotFound(`could not run ${hpy}: ${e.message}`));
      else reject(e);
    });
    child.on("close", (code) => resolve({ parsed: parseReport(stdout), stdout, stderr, code }));
  });
}

/** Calls `fn` once things go quiet for `ms`, aborting the run before it. */
export class Debounced {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: AbortController | undefined;

  constructor(
    private readonly ms: number,
    private readonly fn: (signal: AbortSignal) => Promise<void>,
  ) {}

  trigger(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.running?.abort();
      const controller = new AbortController();
      this.running = controller;
      void this.fn(controller.signal).finally(() => {
        if (this.running === controller) this.running = undefined;
      });
    }, this.ms);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.running?.abort();
  }
}
