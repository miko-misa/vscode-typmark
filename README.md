# TypMark VS Code Extension

This extension adds TypMark language support to VS Code. It provides syntax highlighting and prepares the editor for diagnostics and preview features.

## Install
Download the VSIX from GitHub Releases and install it in VS Code.

VS Code UI
- Extensions view
- Install from VSIX

VS Code CLI
```
code --install-extension path/to/vscode-typmark-<version>.vsix
```

## CLI setup
This extension works with the typmark-cli binary.

- Put typmark-cli on your PATH, or
- Set the full path in the setting `typmark.cliPath`
- Leave it empty and the extension will download and manage the CLI

## Usage
Open a `.tmd` file to activate TypMark language support.
Diagnostics run on save.
Run `TypMark: Show Preview` from the command palette to open the preview.

## Settings
- `typmark.cliPath` for the CLI location
- `typmark.autoUpdate` to update the CLI automatically
- `typmark.checkExtensionUpdates` to check for newer VSIX releases

## Releases
This extension is distributed through GitHub Releases.
