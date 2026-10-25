// Runs inside VS Code, against the workspace `run.ts` prepared.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const workspace = process.env.HAPPYVIEW_TEST_WORKSPACE ?? "";
const at = (rel: string) => vscode.Uri.file(path.join(workspace, rel));
const runs = () => fs.readFileSync(path.join(workspace, "runs.log"), "utf8").trim().split("\n").length;

async function until<T>(what: string, probe: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function lensTitles(rel: string): Promise<string[]> {
  // The command answers "Illegal argument" for a document no editor has
  // loaded yet.
  await vscode.workspace.openTextDocument(at(rel));
  const lenses =
    (await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", at(rel))) ?? [];
  return lenses.map((l) => l.command?.title ?? "").sort();
}

export async function run(): Promise<void> {
  try {
    await steps();
  } catch (e) {
    // VS Code prints only the message of what a suite throws.
    console.error((e as Error).stack ?? e);
    throw e;
  }
}

async function steps(): Promise<void> {
  const ext = vscode.extensions.getExtension("happyproto.happyview");
  assert.ok(ext, "the extension is installed");
  await ext.activate();

  // The check ran at activation and its error reached the Problems panel.
  const diagnostics = await until("the check's diagnostics", () => {
    const found = vscode.languages.getDiagnostics(at("src/lexicons/com/example/getThing.lua"));
    return found.length > 0 ? found : undefined;
  });
  assert.equal(diagnostics[0].message, "lua: unexpected symbol near 'end'");
  assert.equal(diagnostics[0].range.start.line, 2);
  assert.equal(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);
  assert.equal(diagnostics[0].source, "happyview");
  assert.match(fs.readFileSync(path.join(workspace, "runs.log"), "utf8"), /^happyview check --json --no-input\n/);

  // Lexicons lead to their handlers, and handlers back.
  assert.deepEqual(await lensTitles("src/lexicons/com/example/getThing.json"), ["Handler: getThing.lua"]);
  assert.deepEqual(await lensTitles("src/lexicons/com/example/post.json"), [
    "Create handler",
    "Handler (create): post.create.lua",
  ]);
  assert.deepEqual(await lensTitles("src/lexicons/com/example/post.create.lua"), ["Lexicon: com.example.post"]);
  assert.deepEqual(await lensTitles("src/lexicons/com/example/listThings.json"), ["Create handler"]);

  await vscode.window.showTextDocument(at("src/lexicons/com/example/getThing.lua"));
  await vscode.commands.executeCommand("happyview.goToCounterpart");
  assert.equal(
    vscode.window.activeTextEditor?.document.uri.fsPath,
    at("src/lexicons/com/example/getThing.json").fsPath,
  );

  // With one language and a query, creating a handler asks nothing.
  await vscode.commands.executeCommand("happyview.createHandler", workspace, "com.example.listThings");
  const created = path.join(workspace, "src/lexicons/com/example/listThings.lua");
  assert.match(fs.readFileSync(created, "utf8"), /---@param input lexicons\.com\.example\.listThings\.Params\n/);
  assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, created);
  // A new file is a change to the project, so it is checked.
  await until("the check a new handler starts", () => (runs() >= 2 ? true : undefined));

  // A file that is there is opened, never overwritten.
  fs.writeFileSync(created, "-- mine\n");
  await vscode.commands.executeCommand("happyview.createHandler", workspace, "com.example.listThings");
  assert.equal(fs.readFileSync(created, "utf8"), "-- mine\n");

  // A save under src/ runs the check again.
  const before = runs();
  const doc = await vscode.workspace.openTextDocument(at("src/lexicons/com/example/post.create.lua"));
  const editor = await vscode.window.showTextDocument(doc);
  await editor.edit((e) => e.insert(new vscode.Position(0, 0), "-- edited\n"));
  await doc.save();
  await until("the check a save starts", () => (runs() > before ? true : undefined));
}
