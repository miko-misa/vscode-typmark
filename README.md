# TypMark VS Code Extension

TypMark language support for VS Code.
Syntax highlighting, diagnostics on save, and a live preview powered by the TypMark CLI.
The preview supports embedded Typst figures and theme-aware inline SVGs from TypMark CLI 0.5.1 or later.

## TypMark CLI

This extension relies on the TypMark CLI.
The managed CLI tracks the latest TypMark GitHub release. If you set `typmark.cliPath`, use TypMark CLI 0.5.1 or later.
Use the CLI directly for batch runs, CI, or custom pipelines.

- Repository: <https://github.com/miko-misa/typmark>
- Releases: <https://github.com/miko-misa/typmark/releases>

## Quick start

1. Download the latest VSIX from GitHub Releases.
2. Install the VSIX in VS Code.
   See Install for details.
3. Reload the VS Code window.
4. Open a `.tmd` file and run `TypMark: Show Preview`.

## Install

### VS Code UI

1. Open the Extensions view.
2. Use Install from VSIX.
3. Select the downloaded VSIX.
4. Reload the VS Code window.

### VS Code CLI

```bash
code --install-extension path/to/vscode-typmark-<version>.vsix
```

Then reload the VS Code window.

## Update

Install the new VSIX over the existing one.
VS Code replaces the extension automatically.
Reload the VS Code window after installing.

## CLI setup

This extension uses `typmark-cli`.
If `typmark.cliPath` is empty, the extension downloads and manages the CLI automatically.
You can also provide your own CLI.

- Put `typmark-cli` on your PATH and set `typmark.cliPath` to `typmark-cli`, or
- Set the executable's full path in `typmark.cliPath`

## Usage

- Open a `.tmd` file to activate TypMark language support.
- Diagnostics run on save.
- Run `TypMark: Show Preview` to open the preview.
- Use `TypMark: Select Preview Theme` to choose Auto, Light, or Dark.
- In Auto mode, an open preview refreshes when the VS Code color theme changes.

## Embedded Typst

TypMark CLI 0.5.1 or later renders `typst` fences with `render=svg` as inline figures. A Typst grammar, when installed, also highlights the fenced source.

````typmark
```typst {render=svg caption="Flow diagram"}
#circle(radius: 12pt, fill: red)
```
````

Neutral SVG paints adapt to light and dark previews while chromatic colors retain their hue. Typst fences without `render=svg` remain code blocks.

## Settings

- `typmark.cliPath` for the CLI location
- `typmark.autoUpdate` to update the CLI automatically
- `typmark.checkExtensionUpdates` to check for newer VSIX releases
- `typmark.previewTheme` to select the preview theme

## Releases

This extension is distributed through GitHub Releases.

## Japanese

See `README.ja.md` for Japanese.
