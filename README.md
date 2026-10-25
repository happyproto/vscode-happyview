# HappyView for VS Code

Editor support for [HappyView](https://github.com/gamesgamesgamesgamesgames/happyview) projects: the folders holding a `happyview.toml`.

- **Build diagnostics.** The extension runs `hpy happyview check --json` when it opens a project and again after each save under `src/` or to `happyview.toml`. The build's errors and warnings show up in the Problems panel. The status bar shows whether the project builds; click it for the check's output.
- **Lexicon ↔ handler links.**
  - A lexicon file shows a lens for each of its handlers, plus **Create handler** when one is missing.
  - A handler shows a lens back to its lexicon.
  - **HappyView: Go to lexicon / handler** jumps between the two.
- **Create handler.** This writes the handler beside its lexicon, with the name HappyView expects, in one of the project's installed languages. For a record, it asks which action the handler runs for. The new file starts with `handle` already typed against the declarations `happyview types` writes. A file that already exists is opened, not overwritten.

Completions and hover come from your language server (LuaLS, or TypeScript), reading the declarations `hpy happyview types` writes into `.happyview/types/`.

## Requirements

- **hpy** on your `PATH`, or the `happyview.hpyPath` setting pointing at it.
- **A HappyView release with `check --json`.**

## Development

```sh
npm install
npm test           # unit tests
npm run test:e2e   # a real VS Code over test/fixture, with a fake hpy
npm run package    # happyview-<version>.vsix
```
