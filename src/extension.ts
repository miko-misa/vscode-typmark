import * as vscode from "vscode";
import * as https from "https";
import { IncomingMessage } from "http";
import { ensureCli, getCliVersion } from "./binaryManager";
import { DiagnosticsManager } from "./diagnostics";
import { PreviewManager } from "./preview";

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  let cliInfo;
  try {
    cliInfo = await ensureCli(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`TypMark CLI setup failed: ${message}`);
    return;
  }

  const diagnostics = new DiagnosticsManager(cliInfo.path);
  context.subscriptions.push({ dispose: () => diagnostics.dispose() });

  const preview = new PreviewManager(cliInfo);

  const config = vscode.workspace.getConfiguration("typmark");
  const checkUpdates = Boolean(config.get("checkExtensionUpdates"));
  if (checkUpdates) {
    void checkExtensionUpdates();
  }

  const showPreview = vscode.commands.registerCommand(
    "typmark.showPreview",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      await preview.show(editor.document);
    }
  );
  context.subscriptions.push(showPreview);

  const showCliVersion = vscode.commands.registerCommand(
    "typmark.showCliVersion",
    async () => {
      const version = await getCliVersion(cliInfo.path);
      if (!version) {
        vscode.window.showWarningMessage("TypMark CLI version unavailable.");
        return;
      }
      vscode.window.showInformationMessage(`TypMark CLI ${version}`);
    }
  );
  context.subscriptions.push(showCliVersion);

  const selectTheme = vscode.commands.registerCommand(
    "typmark.selectPreviewTheme",
    async () => {
      const options: Array<{ label: string; value: string }> = [
        { label: "Auto (follow VS Code)", value: "auto" },
        { label: "Light", value: "light" },
        { label: "Dark", value: "dark" }
      ];
      const pick = await vscode.window.showQuickPick(
        options.map((option) => option.label),
        { placeHolder: "Select TypMark preview theme" }
      );
      if (!pick) {
        return;
      }
      const selected = options.find((option) => option.label === pick);
      if (!selected) {
        return;
      }
      await vscode.workspace
        .getConfiguration("typmark")
        .update("previewTheme", selected.value, vscode.ConfigurationTarget.Global);
      await preview.refresh();
    }
  );
  context.subscriptions.push(selectTheme);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      void diagnostics.onDidSave(document);
      void preview.onDidSave(document);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      preview.onEditorSelection(event.textEditor);
    })
  );


  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration("typmark.previewTheme")) {
        return;
      }
      if (preview.isOpen()) {
        await preview.refresh();
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "typmark") {
        return;
      }
      await preview.show(editor.document);
    })
  );
}

export function deactivate(): void {}

async function checkExtensionUpdates(): Promise<void> {
  try {
    const latest = await fetchLatestExtensionRelease();
    const latestVersion = normalizeVersion(latest.tag_name);
    const current = normalizeVersion(
      vscode.extensions.getExtension("miko-misa.vscode-typmark")?.packageJSON.version ?? ""
    );
    if (!current || !latestVersion || current == latestVersion) {
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      `TypMark extension update available (${latestVersion}).`,
      "Open Release"
    );
    if (choice == "Open Release") {
      await vscode.env.openExternal(vscode.Uri.parse(latest.html_url));
    }
  } catch {
    // ignore update failures
  }
}

interface ExtensionRelease {
  tag_name: string;
  html_url: string;
}

async function fetchLatestExtensionRelease(): Promise<ExtensionRelease> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      "https://api.github.com/repos/miko-misa/vscode-typmark/releases/latest",
      {
        headers: {
          "User-Agent": "vscode-typmark",
          Accept: "application/vnd.github+json"
        }
      },
      (res: IncomingMessage) => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Failed to fetch releases: ${res.statusCode}`));
          return;
        }
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as ExtensionRelease;
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
  });
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, "");
}
