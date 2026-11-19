import type { Report } from "../../src/report";

/** A report in the shape `happyview check --json` prints. */
export const REPORT: Report = {
  ok: false,
  diagnostics: [
    {
      path: "src/lexicons/com/example/getThing.lua",
      line: 3,
      severity: "error",
      message: "lua: unexpected symbol near 'end'",
    },
    { path: "src/lexicons/com/example/broken.json", line: null, severity: "error", message: "invalid JSON" },
    {
      path: "src/lexicons/com/example/post.index.lua",
      line: null,
      severity: "warning",
      message: "overrides the dashboard script",
    },
  ],
  files: [
    { path: "src/jobs/com.example.post.lua", role: "handler", trigger: "job.run:com.example.post", language: "lua" },
    { path: "src/lexicons/com/example/broken.json", role: "lexicon" },
    {
      path: "src/lexicons/com/example/getThing.lua",
      role: "handler",
      trigger: "xrpc.query:com.example.getThing",
      lexicon: "com.example.getThing",
      language: "lua",
    },
    { path: "src/lexicons/com/example/getThing.json", role: "lexicon" },
    { path: "src/lexicons/com/example/listThings.json", role: "lexicon" },
    {
      path: "src/lexicons/com/example/post.create.lua",
      role: "handler",
      trigger: "record.create:com.example.post",
      lexicon: "com.example.post",
      language: "lua",
    },
    {
      path: "src/lexicons/com/example/post.index.lua",
      role: "handler",
      trigger: "record.index:com.example.post",
      lexicon: "com.example.post",
      language: "lua",
    },
    { path: "src/lexicons/com/example/post.json", role: "lexicon" },
    { path: "src/lib/format.lua", role: "module", language: "lua" },
  ],
  lexicons: [
    { nsid: "com.example.getThing", path: "src/lexicons/com/example/getThing.json", kind: "query" },
    { nsid: "com.example.listThings", path: "src/lexicons/com/example/listThings.json", kind: "query" },
    { nsid: "com.example.post", path: "src/lexicons/com/example/post.json", kind: "record" },
  ],
  languages: [{ language_id: "lua", extensions: ["lua"] }],
};
