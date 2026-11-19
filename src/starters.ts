// The first text of a new handler, in the shape `hpy happyview create`
// gives its starter: a comment saying what the file answers, and the types
// `happyview types` writes named once on `handle`.

import type { LexiconEntry } from "./report";
import type { RecordAction } from "./project";

interface Shape {
  input: string;
  ctx: string;
  output?: string;
}

function shape(kind: LexiconEntry["kind"]): Shape {
  switch (kind) {
    case "query":
      return { input: "Params", ctx: "QueryCtx", output: "Output" };
    case "procedure":
      return { input: "Input", ctx: "ProcedureCtx", output: "Output" };
    default:
      return { input: "Event", ctx: "RecordCtx" };
  }
}

function what(lexicon: LexiconEntry, action?: RecordAction): string {
  if (lexicon.kind !== "record") return `Answers ${lexicon.nsid}.`;
  return action === "index" || action === undefined
    ? `Runs for every change to a ${lexicon.nsid} record.`
    : `Runs when a ${lexicon.nsid} record is ${action === "create" ? "created" : `${action}d`}.`;
}

export function starter(language: string, lexicon: LexiconEntry, action?: RecordAction): string {
  const s = shape(lexicon.kind);
  const nsid = lexicon.nsid;
  const lead = what(lexicon, action);
  switch (language) {
    case "lua":
      return [
        `-- ${lead}`,
        "",
        `---@param input lexicons.${nsid}.${s.input}`,
        `---@param ctx happyview.${s.ctx}`,
        ...(s.output ? [`---@return lexicons.${nsid}.${s.output}`] : []),
        "function handle(input, ctx)",
        "end",
        "",
      ].join("\n");
    case "typescript": {
      const names = [s.input, ...(s.output ? [s.output] : [])].join(", ");
      const returns = s.output ? `Promise<${s.output}>` : "Promise<void>";
      return [
        `// ${lead}`,
        `import type { ${names} } from "happyview:lexicons/${nsid}";`,
        `import type { ${s.ctx} } from "happyview:ctx";`,
        "",
        `export default async function handle(input: ${s.input}, ctx: ${s.ctx}): ${returns} {`,
        "}",
        "",
      ].join("\n");
    }
    case "javascript":
      return [
        `// ${lead}`,
        "",
        "/**",
        ` * @param {import("happyview:lexicons/${nsid}").${s.input}} input`,
        ` * @param {import("happyview:ctx").${s.ctx}} ctx`,
        ...(s.output ? [` * @returns {Promise<import("happyview:lexicons/${nsid}").${s.output}>}`] : []),
        " */",
        "export default async function handle(input, ctx) {",
        "}",
        "",
      ].join("\n");
    default:
      return "";
  }
}
