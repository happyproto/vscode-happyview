// Runs the extension in a real VS Code over a copy of the fixture project,
// with a fake hpy that prints a canned report.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const repo = path.resolve(__dirname, "../../..");
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-happyview-"));
  fs.cpSync(path.join(repo, "test/fixture"), workspace, { recursive: true });
  fs.mkdirSync(path.join(workspace, ".vscode"));
  fs.writeFileSync(
    path.join(workspace, ".vscode/settings.json"),
    JSON.stringify({ "happyview.hpyPath": path.join(workspace, "fake-hpy") }),
  );
  // VS Code listens on a socket inside its user data directory, and a path
  // past about a hundred characters is refused, so it gets a short one.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "vh-"));
  try {
    await runTests({
      extensionDevelopmentPath: repo,
      extensionTestsPath: path.join(__dirname, "suite.js"),
      launchArgs: [workspace, `--user-data-dir=${userData}`, "--disable-extensions", "--skip-welcome", "--skip-release-notes"],
      extensionTestsEnv: { HAPPYVIEW_TEST_WORKSPACE: workspace },
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
