import { spawn } from "child_process";
import * as vscode from "vscode";

export class DiagnosticsManager {
  private readonly collection: vscode.DiagnosticCollection;

  constructor(private readonly cliPath: string) {
    this.collection = vscode.languages.createDiagnosticCollection("typmark");
  }

  dispose(): void {
    this.collection.dispose();
  }

  async onDidSave(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== "typmark") {
      return;
    }
    const diagnostics = await runDiagnostics(this.cliPath, document.getText());
    this.collection.set(document.uri, diagnostics);
  }
}

interface RawDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

async function runDiagnostics(
  cliPath: string,
  source: string
): Promise<vscode.Diagnostic[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, ["--diagnostics", "json"]);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", () => {
      if (!stderr.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stderr) as RawDiagnostic[];
        const mapped = parsed.map((diag) => {
          const range = new vscode.Range(
            diag.range.start.line,
            diag.range.start.character,
            diag.range.end.line,
            diag.range.end.character
          );
          const severity =
            diag.severity === "error"
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning;
          const out = new vscode.Diagnostic(range, diag.message, severity);
          out.code = diag.code;
          return out;
        });
        resolve(mapped);
      } catch {
        vscode.window.showWarningMessage("TypMark diagnostics parse failed.");
        resolve([]);
      }
    });
    child.on("error", reject);
    child.stdin.write(source);
    child.stdin.end();
  });
}
