// What `hpy happyview check --json` prints, and reading it.

export type Severity = "error" | "warning";

export interface Diagnostic {
  /** Relative to the project root, with `/` separators. */
  path: string;
  /** 1-based, or null for a problem with the whole file. */
  line: number | null;
  severity: Severity;
  message: string;
}

export type Role = "lexicon" | "handler" | "module" | "test";

export interface FileEntry {
  path: string;
  role: Role;
  trigger?: string;
  lexicon?: string;
  language?: string;
}

export type LexiconKind = "record" | "query" | "procedure" | "space" | "definitions";

export interface LexiconEntry {
  nsid: string;
  path: string;
  kind: LexiconKind;
}

export interface LanguageEntry {
  language_id: string;
  extensions: string[];
}

export interface Report {
  ok: boolean;
  diagnostics: Diagnostic[];
  files: FileEntry[];
  lexicons: LexiconEntry[];
  languages: LanguageEntry[];
}

/** A check that ran and produced a report, one that could not start and
 * said why, or output that was neither. */
export type Parsed =
  | { kind: "report"; report: Report }
  | { kind: "error"; message: string }
  | { kind: "unreadable"; message: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function parseReport(stdout: string): Parsed {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    const first = stdout.trim().split("\n")[0] ?? "";
    return {
      kind: "unreadable",
      message: first ? `hpy printed something other than a report: ${first}` : "hpy printed nothing",
    };
  }
  if (!isObject(value)) {
    return { kind: "unreadable", message: "hpy printed JSON that is not a report" };
  }
  if (typeof value.error === "string") {
    return { kind: "error", message: value.error };
  }
  const list = (key: string): unknown[] => (Array.isArray(value[key]) ? (value[key] as unknown[]) : []);
  if (typeof value.ok !== "boolean" || !Array.isArray(value.diagnostics)) {
    return {
      kind: "unreadable",
      message: "hpy printed JSON without diagnostics; is HappyView older than check --json?",
    };
  }
  return {
    kind: "report",
    report: {
      ok: value.ok,
      diagnostics: list("diagnostics").filter(isObject).map((d) => ({
        path: String(d.path ?? ""),
        line: typeof d.line === "number" ? d.line : null,
        severity: d.severity === "warning" ? "warning" : "error",
        message: String(d.message ?? ""),
      })),
      files: list("files").filter(isObject) as unknown as FileEntry[],
      lexicons: list("lexicons").filter(isObject) as unknown as LexiconEntry[],
      languages: list("languages").filter(isObject) as unknown as LanguageEntry[],
    },
  };
}

/** The diagnostics of a report grouped by file, with each line made 0-based
 * as editors count. A whole-file problem sits on the first line. */
export function diagnosticsByFile(
  report: Report,
): Map<string, { line: number; severity: Severity; message: string }[]> {
  const byFile = new Map<string, { line: number; severity: Severity; message: string }[]>();
  for (const d of report.diagnostics) {
    const entries = byFile.get(d.path) ?? [];
    entries.push({ line: d.line === null ? 0 : Math.max(0, d.line - 1), severity: d.severity, message: d.message });
    byFile.set(d.path, entries);
  }
  return byFile;
}
