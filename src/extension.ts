import * as path from "node:path";
import * as vscode from "vscode";

import {
  RECORD_ACTIONS,
  fileAt,
  handlerPath,
  handlersOf,
  lexiconAt,
  lexiconOf,
  takesHandler,
  triggerLabel,
  type RecordAction,
} from "./project";
import { diagnosticsByFile, type LexiconEntry, type Report } from "./report";
import { Debounced, NotFound, runCheck } from "./run";
import { starter } from "./starters";

const PROJECT_FILE = "happyview.toml";
const INSTALL_URL = "https://github.com/happyproto/cli#install";

type State = "idle" | "running" | "done" | "failed" | "missing";

/** One HappyView project: the folder holding a `happyview.toml`. */
class Project {
  report: Report | undefined;
  state: State = "idle";
  private readonly checker: Debounced;

  constructor(
    readonly root: string,
    private readonly ext: Extension,
  ) {
    this.checker = new Debounced(300, (signal) => this.check(signal));
  }

  /** The path HappyView reports for `fsPath`, or undefined outside it. */
  relative(fsPath: string): string | undefined {
    const rel = path.relative(this.root, fsPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return rel.split(path.sep).join("/");
  }

  watches(fsPath: string): boolean {
    const rel = this.relative(fsPath);
    return rel !== undefined && (rel === PROJECT_FILE || rel.startsWith("src/"));
  }

  trigger(): void {
    this.checker.trigger();
  }

  dispose(): void {
    this.checker.dispose();
  }

  private async check(signal: AbortSignal): Promise<void> {
    this.state = "running";
    this.ext.render();
    const hpy = vscode.workspace.getConfiguration("happyview").get<string>("hpyPath") || "hpy";
    const out = this.ext.output;
    try {
      const run = await runCheck(hpy, this.root, signal);
      out.appendLine(`$ ${hpy} happyview check --json  (in ${this.root}, exit ${run.code})`);
      if (run.stderr.trim()) out.appendLine(run.stderr.trimEnd());
      switch (run.parsed.kind) {
        case "report":
          this.report = run.parsed.report;
          this.state = "done";
          this.ext.publish(this);
          break;
        case "error":
        case "unreadable":
          // Whatever the last good report said still stands.
          out.appendLine(run.parsed.message);
          this.state = "failed";
          break;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      out.appendLine(String((e as Error).message ?? e));
      this.state = e instanceof NotFound ? "missing" : "failed";
    }
    this.ext.render();
  }
}

class Extension implements vscode.CodeLensProvider {
  readonly output = vscode.window.createOutputChannel("HappyView");
  private readonly diagnostics = vscode.languages.createDiagnosticCollection("happyview");
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  private readonly lensesChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.lensesChanged.event;
  /** What each project last published, so a new report clears what it fixed. */
  private readonly published = new Map<string, vscode.Uri[]>();
  projects: Project[] = [];

  constructor() {
    this.status.command = "happyview.showOutput";
    this.status.name = "HappyView";
  }

  disposables(): vscode.Disposable[] {
    return [this.output, this.diagnostics, this.status, this.lensesChanged];
  }

  async discover(): Promise<void> {
    const found = await vscode.workspace.findFiles(`**/${PROJECT_FILE}`, "**/{node_modules,.happyview}/**");
    const roots = [...new Set(found.map((uri) => path.dirname(uri.fsPath)))].sort();
    for (const project of this.projects) project.dispose();
    this.projects = roots.map((root) => new Project(root, this));
    for (const project of this.projects) project.trigger();
    this.render();
  }

  projectOf(fsPath: string): Project | undefined {
    // The deepest root wins, for a project nested in another.
    return this.projects
      .filter((p) => p.relative(fsPath) !== undefined)
      .sort((a, b) => b.root.length - a.root.length)[0];
  }

  publish(project: Project): void {
    const report = project.report;
    if (!report) return;
    for (const uri of this.published.get(project.root) ?? []) this.diagnostics.delete(uri);
    const uris: vscode.Uri[] = [];
    for (const [file, entries] of diagnosticsByFile(report)) {
      const uri = vscode.Uri.file(path.join(project.root, file));
      uris.push(uri);
      this.diagnostics.set(
        uri,
        entries.map((d) => {
          const range = new vscode.Range(d.line, 0, d.line, Number.MAX_SAFE_INTEGER);
          const severity =
            d.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
          const diagnostic = new vscode.Diagnostic(range, d.message, severity);
          diagnostic.source = "happyview";
          return diagnostic;
        }),
      );
    }
    this.published.set(project.root, uris);
    this.lensesChanged.fire();
  }

  render(): void {
    if (this.projects.length === 0) {
      this.status.hide();
      return;
    }
    const states = this.projects.map((p) => p.state);
    const errors = this.projects
      .flatMap((p) => p.report?.diagnostics ?? [])
      .filter((d) => d.severity === "error").length;
    if (states.includes("missing")) {
      this.status.text = "$(warning) hpy not found";
      this.status.tooltip = `Install hpy (${INSTALL_URL}) or set happyview.hpyPath`;
    } else if (states.includes("running")) {
      this.status.text = "$(sync~spin) HappyView";
      this.status.tooltip = "Checking the project";
    } else if (states.includes("failed")) {
      this.status.text = "$(error) HappyView";
      this.status.tooltip = "The check did not run; see the output";
    } else if (errors > 0) {
      this.status.text = `$(error) ${errors}`;
      this.status.tooltip = `The project does not build: ${errors} ${errors === 1 ? "error" : "errors"}`;
    } else {
      this.status.text = "$(check) HappyView";
      this.status.tooltip = "The project builds";
    }
    this.status.show();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const project = this.projectOf(document.uri.fsPath);
    const report = project?.report;
    const rel = project?.relative(document.uri.fsPath);
    if (!project || !report || !rel) return [];
    const top = new vscode.Range(0, 0, 0, 0);
    const open = (file: string, title: string) =>
      new vscode.CodeLens(top, {
        title,
        command: "vscode.open",
        arguments: [vscode.Uri.file(path.join(project.root, file))],
      });

    const lexicon = lexiconAt(report, rel);
    if (lexicon) {
      if (!takesHandler(lexicon.kind)) return [];
      const handlers = handlersOf(report, lexicon.nsid);
      const lenses = handlers.map((h) => {
        const name = path.posix.basename(h.path);
        const title = lexicon.kind === "record" ? `Handler (${triggerLabel(h.trigger)}): ${name}` : `Handler: ${name}`;
        return open(h.path, title);
      });
      // A record takes one handler per action, so there may be more to add.
      if (handlers.length === 0 || (lexicon.kind === "record" && handlers.length < RECORD_ACTIONS.length)) {
        lenses.push(
          new vscode.CodeLens(top, {
            title: "Create handler",
            command: "happyview.createHandler",
            arguments: [project.root, lexicon.nsid],
          }),
        );
      }
      return lenses;
    }
    const answers = lexiconOf(report, rel);
    return answers ? [open(answers.path, `Lexicon: ${answers.nsid}`)] : [];
  }

  async goToCounterpart(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const project = editor && this.projectOf(editor.document.uri.fsPath);
    const report = project?.report;
    const rel = editor && project?.relative(editor.document.uri.fsPath);
    if (!project || !report || !rel) {
      void vscode.window.showInformationMessage("This file is not part of a checked HappyView project.");
      return;
    }
    const openFile = (file: string) =>
      vscode.window.showTextDocument(vscode.Uri.file(path.join(project.root, file)));

    const lexicon = lexiconAt(report, rel);
    if (lexicon) {
      const handlers = handlersOf(report, lexicon.nsid);
      if (handlers.length === 1) {
        await openFile(handlers[0].path);
      } else if (handlers.length > 1) {
        const pick = await vscode.window.showQuickPick(
          handlers.map((h) => ({ label: path.posix.basename(h.path), description: h.trigger, file: h.path })),
          { placeHolder: `Handlers of ${lexicon.nsid}` },
        );
        if (pick) await openFile(pick.file);
      } else if (takesHandler(lexicon.kind)) {
        await this.createHandler(project.root, lexicon.nsid);
      } else {
        void vscode.window.showInformationMessage(`${lexicon.nsid} is a ${lexicon.kind} lexicon, which runs no script.`);
      }
      return;
    }
    const answers = lexiconOf(report, rel);
    if (answers) {
      await openFile(answers.path);
      return;
    }
    const role = fileAt(report, rel)?.role;
    void vscode.window.showInformationMessage(
      role === "handler" ? "This handler answers no lexicon of the project." : "This file is not a lexicon or a handler.",
    );
  }

  async createHandler(root?: string, nsid?: string): Promise<void> {
    const project = root ? this.projects.find((p) => p.root === root) : this.activeProject();
    const report = project?.report;
    if (!project || !report) return;
    let lexicon: LexiconEntry | undefined = report.lexicons.find((l) => l.nsid === nsid);
    if (!lexicon) {
      const pick = await vscode.window.showQuickPick(
        report.lexicons.filter((l) => takesHandler(l.kind)).map((l) => ({ label: l.nsid, description: l.kind, l })),
        { placeHolder: "The lexicon to handle" },
      );
      lexicon = pick?.l;
    }
    if (!lexicon) return;

    let action: RecordAction | undefined;
    if (lexicon.kind === "record") {
      const taken = new Set(handlersOf(report, lexicon.nsid).map((h) => triggerLabel(h.trigger)));
      const pick = await vscode.window.showQuickPick(
        RECORD_ACTIONS.filter((a) => !taken.has(a)).map((a) => ({
          label: a,
          description: a === "index" ? "every create, update and delete" : `each ${a}`,
        })),
        { placeHolder: `When the handler of ${lexicon.nsid} runs` },
      );
      if (!pick) return;
      action = pick.label as RecordAction;
    }

    const languages = report.languages.filter((l) => l.extensions.length > 0);
    if (languages.length === 0) {
      void vscode.window.showWarningMessage("No interpreter is installed; add one to happyview.toml.");
      return;
    }
    const language =
      languages.length === 1
        ? languages[0]
        : (
            await vscode.window.showQuickPick(
              languages.map((l) => ({ label: l.language_id, description: `.${l.extensions[0]}`, l })),
              { placeHolder: "The handler's language" },
            )
          )?.l;
    if (!language) return;

    const file = handlerPath(lexicon, language.extensions[0], action);
    const uri = vscode.Uri.file(path.join(project.root, file));
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(starter(language.language_id, lexicon, action)));
      project.trigger();
    }
    await vscode.window.showTextDocument(uri);
  }

  private activeProject(): Project | undefined {
    const editor = vscode.window.activeTextEditor;
    return (editor && this.projectOf(editor.document.uri.fsPath)) ?? this.projects[0];
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<Extension> {
  const ext = new Extension();
  context.subscriptions.push(
    ...ext.disposables(),
    vscode.languages.registerCodeLensProvider([{ scheme: "file", pattern: "**/src/**" }], ext),
    vscode.commands.registerCommand("happyview.showOutput", () => ext.output.show(true)),
    vscode.commands.registerCommand("happyview.check", () => ext.projects.forEach((p) => p.trigger())),
    vscode.commands.registerCommand("happyview.goToCounterpart", () => ext.goToCounterpart()),
    vscode.commands.registerCommand("happyview.createHandler", (root?: string, nsid?: string) =>
      ext.createHandler(root, nsid),
    ),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (path.basename(doc.uri.fsPath) === PROJECT_FILE && !ext.projectOf(doc.uri.fsPath)?.watches(doc.uri.fsPath)) {
        void ext.discover();
        return;
      }
      const project = ext.projectOf(doc.uri.fsPath);
      if (project?.watches(doc.uri.fsPath)) project.trigger();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void ext.discover()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("happyview.hpyPath")) ext.projects.forEach((p) => p.trigger());
    }),
    { dispose: () => ext.projects.forEach((p) => p.dispose()) },
  );
  await ext.discover();
  // Returned for the integration tests, which read the projects' state.
  return ext;
}

export function deactivate(): void {}
