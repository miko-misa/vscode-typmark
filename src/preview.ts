import { spawn } from "child_process";
import * as vscode from "vscode";
import { CliInfo } from "./binaryManager";

export class PreviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentDoc: vscode.TextDocument | undefined;

  constructor(private readonly cli: CliInfo) {}

  isOpen(): boolean {
    return Boolean(this.panel);
  }

  async show(document: vscode.TextDocument): Promise<void> {
    this.currentDoc = document;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "typmarkPreview",
        "TypMark Preview",
        vscode.ViewColumn.Beside,
        {
          enableScripts: false
        }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.currentDoc = undefined;
      });
    }

    await this.render(document);
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  async onDidSave(document: vscode.TextDocument): Promise<void> {
    if (!this.panel || !this.currentDoc) {
      return;
    }
    if (document.uri.toString() !== this.currentDoc.uri.toString()) {
      return;
    }
    await this.render(document);
  }

  async refresh(): Promise<void> {
    if (!this.panel || !this.currentDoc) {
      return;
    }
    await this.render(this.currentDoc);
  }

  private async render(document: vscode.TextDocument): Promise<void> {
    if (!this.panel) {
      return;
    }
    const html = await runTypmark(
      this.cli.path,
      document.getText(),
      themeArg()
    );
    this.panel.webview.html = html;
  }
}

function runTypmark(
  cliPath: string,
  source: string,
  theme: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, ["--render", "--theme", theme]);
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(err || "Preview rendering failed"));
        return;
      }
      resolve(out);
    });
    child.on("error", reject);
    child.stdin.write(source);
    child.stdin.end();
  });
}

function themeArg(): string {
  const config = vscode.workspace.getConfiguration("typmark");
  const selected = (config.get("previewTheme") as string | undefined) ?? "auto";
  if (selected !== "auto") {
    return selected;
  }

  const kind = vscode.window.activeColorTheme.kind;
  if (kind === vscode.ColorThemeKind.Dark) {
    return "dark";
  }
  if (kind === vscode.ColorThemeKind.Light) {
    return "light";
  }
  return "auto";
}
