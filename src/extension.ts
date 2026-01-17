import * as vscode from "vscode";
import { ensureCli } from "./binaryManager";
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

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      void diagnostics.onDidSave(document);
      void preview.onDidSave(document);
    })
  );
}

export function deactivate(): void {}
