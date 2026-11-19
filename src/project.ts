// Which file answers which lexicon, read off the last report.

import type { FileEntry, LexiconEntry, LexiconKind, Report } from "./report";

/** A record lexicon's four triggers, as the file name spells them. */
export const RECORD_ACTIONS = ["index", "create", "update", "delete"] as const;
export type RecordAction = (typeof RECORD_ACTIONS)[number];

export function lexiconAt(report: Report, path: string): LexiconEntry | undefined {
  return report.lexicons.find((l) => l.path === path);
}

export function fileAt(report: Report, path: string): FileEntry | undefined {
  return report.files.find((f) => f.path === path);
}

export function handlersOf(report: Report, nsid: string): FileEntry[] {
  return report.files.filter((f) => f.role === "handler" && f.lexicon === nsid);
}

/** The lexicon a handler answers, when it answers one. */
export function lexiconOf(report: Report, path: string): LexiconEntry | undefined {
  const file = fileAt(report, path);
  if (!file?.lexicon) return undefined;
  return report.lexicons.find((l) => l.nsid === file.lexicon);
}

/** The word a trigger's kind is called by, for a lens: `create`, `query`. */
export function triggerLabel(trigger: string | undefined): string {
  const prefix = trigger?.split(":")[0] ?? "";
  return prefix.split(".")[1] ?? prefix;
}

/** Whether a lexicon of this kind runs a script. */
export function takesHandler(kind: LexiconKind): boolean {
  return kind === "query" || kind === "procedure" || kind === "record";
}

/** Where a handler for `lexicon` goes: beside it, named by its stem, and for
 * a record by the action too. */
export function handlerPath(lexicon: LexiconEntry, extension: string, action?: RecordAction): string {
  const stem = lexicon.path.replace(/\.json$/, "");
  if (lexicon.kind === "record") {
    return `${stem}.${action ?? "index"}.${extension}`;
  }
  return `${stem}.${extension}`;
}
