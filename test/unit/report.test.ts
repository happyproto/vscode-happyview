import assert from "node:assert/strict";
import { test } from "node:test";

import { diagnosticsByFile, parseReport } from "../../src/report";
import { handlerPath, handlersOf, lexiconAt, lexiconOf, takesHandler, triggerLabel } from "../../src/project";
import { starter } from "../../src/starters";
import { REPORT } from "./sample";

test("a report is read", () => {
  const parsed = parseReport(JSON.stringify(REPORT));
  assert.equal(parsed.kind, "report");
  if (parsed.kind !== "report") return;
  assert.equal(parsed.report.ok, false);
  assert.equal(parsed.report.files.length, REPORT.files.length);
});

test("a check that could not start says why", () => {
  assert.deepEqual(parseReport('{"ok":false,"error":"plugins/lua: could not load the plugin"}\n'), {
    kind: "error",
    message: "plugins/lua: could not load the plugin",
  });
});

test("output that is not a report is named, not trusted", () => {
  const plain = parseReport("ok: 1 lexicon, 1 script, 0 modules\n");
  assert.equal(plain.kind, "unreadable");
  assert.match(plain.kind === "unreadable" ? plain.message : "", /ok: 1 lexicon/);
  assert.equal(parseReport("").kind, "unreadable");
  // hpy's own --json shape for something else, without diagnostics.
  const other = parseReport('{"ok": true}');
  assert.match(other.kind === "unreadable" ? other.message : "", /older than check --json/);
});

test("diagnostics are grouped by file and counted from zero", () => {
  const parsed = parseReport(JSON.stringify(REPORT));
  if (parsed.kind !== "report") throw new Error("not a report");
  const byFile = diagnosticsByFile(parsed.report);
  assert.deepEqual(byFile.get("src/lexicons/com/example/getThing.lua"), [
    { line: 2, severity: "error", message: "lua: unexpected symbol near 'end'" },
  ]);
  // A whole-file problem sits on the first line.
  assert.deepEqual(byFile.get("src/lexicons/com/example/broken.json"), [
    { line: 0, severity: "error", message: "invalid JSON" },
  ]);
  assert.equal(byFile.get("src/lexicons/com/example/post.index.lua")?.[0].severity, "warning");
});

test("a lexicon finds its handlers and a handler its lexicon", () => {
  const post = lexiconAt(REPORT, "src/lexicons/com/example/post.json");
  assert.equal(post?.nsid, "com.example.post");
  assert.deepEqual(
    handlersOf(REPORT, "com.example.post").map((h) => h.path),
    ["src/lexicons/com/example/post.create.lua", "src/lexicons/com/example/post.index.lua"],
  );
  assert.equal(lexiconOf(REPORT, "src/lexicons/com/example/post.create.lua")?.path, "src/lexicons/com/example/post.json");
  // A job handler answers no lexicon, and a module is no handler.
  assert.equal(lexiconOf(REPORT, "src/jobs/com.example.post.lua"), undefined);
  assert.equal(lexiconOf(REPORT, "src/lib/format.lua"), undefined);
  assert.deepEqual(handlersOf(REPORT, "com.example.listThings"), []);
});

test("trigger labels and which lexicons take a handler", () => {
  assert.equal(triggerLabel("record.create:com.example.post"), "create");
  assert.equal(triggerLabel("xrpc.query:com.example.getThing"), "query");
  assert.equal(triggerLabel(undefined), "");
  assert.ok(takesHandler("record") && takesHandler("query") && takesHandler("procedure"));
  assert.ok(!takesHandler("definitions") && !takesHandler("space"));
});

test("a new handler is named beside its lexicon", () => {
  const query = { nsid: "com.example.getThing", path: "src/lexicons/com/example/getThing.json", kind: "query" } as const;
  const record = { nsid: "com.example.post", path: "src/lexicons/com/example/post.json", kind: "record" } as const;
  assert.equal(handlerPath(query, "ts"), "src/lexicons/com/example/getThing.ts");
  assert.equal(handlerPath(record, "lua", "delete"), "src/lexicons/com/example/post.delete.lua");
  assert.equal(handlerPath(record, "lua"), "src/lexicons/com/example/post.index.lua");
});

test("starters name the types for their kind", () => {
  const query = { nsid: "com.example.getThing", path: "", kind: "query" } as const;
  const procedure = { nsid: "com.example.putThing", path: "", kind: "procedure" } as const;
  const record = { nsid: "com.example.post", path: "", kind: "record" } as const;

  const lua = starter("lua", query);
  assert.match(lua, /^-- Answers com\.example\.getThing\./);
  assert.match(lua, /---@param input lexicons\.com\.example\.getThing\.Params\n/);
  assert.match(lua, /---@param ctx happyview\.QueryCtx\n/);
  assert.match(lua, /---@return lexicons\.com\.example\.getThing\.Output\nfunction handle\(input, ctx\)/);

  const ts = starter("typescript", procedure);
  assert.match(ts, /import type \{ Input, Output \} from "happyview:lexicons\/com\.example\.putThing";/);
  assert.match(ts, /handle\(input: Input, ctx: ProcedureCtx\): Promise<Output>/);

  const js = starter("javascript", record, "update");
  assert.match(js, /^\/\/ Runs when a com\.example\.post record is updated\./);
  assert.match(js, /import\("happyview:lexicons\/com\.example\.post"\)\.Event\} input/);
  assert.doesNotMatch(js, /@returns/);
  assert.match(starter("lua", record, "create"), /record is created\./);
  assert.match(starter("lua", record, "index"), /every change to a com\.example\.post record/);

  // A language this extension has no starter for gets an empty file.
  assert.equal(starter("python", query), "");
});
