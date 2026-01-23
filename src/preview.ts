import { spawn } from "child_process";
import * as vscode from "vscode";
import { CliInfo } from "./binaryManager";

export class PreviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentDoc: vscode.TextDocument | undefined;
  private pendingScrollLine: number | null = null;
  private scrollTimer: NodeJS.Timeout | undefined;
  private warnedMissingSourceMap = false;

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
          enableScripts: true
        }
      );
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleWebviewMessage(message);
      });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.currentDoc = undefined;
        if (this.scrollTimer) {
          clearTimeout(this.scrollTimer);
          this.scrollTimer = undefined;
        }
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



  onEditorSelection(editor: vscode.TextEditor): void {
    if (!this.panel || !this.currentDoc) {
      return;
    }
    if (editor.document.uri.toString() !== this.currentDoc.uri.toString()) {
      return;
    }
    const line = editor.selection.active.line;
    this.pendingScrollLine = line;
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    this.scrollTimer = setTimeout(() => {
      if (!this.panel || this.pendingScrollLine === null) {
        return;
      }
      void this.panel.webview.postMessage({
        type: "scrollToLine",
        line: this.pendingScrollLine
      });
      this.pendingScrollLine = null;
    }, 50);
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
    const sourceMapCount = (html.match(/data-tm-range=/g) || []).length;
    if (sourceMapCount == 0 && !this.warnedMissingSourceMap) {
      this.warnedMissingSourceMap = true;
      void vscode.window.showWarningMessage(
        "TypMark CLI did not output source maps. Update the CLI to enable preview sync.",
      );
    }
    this.panel.webview.html = injectPreviewScript(html);
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== "object") {
      return;
    }
    const payload = message as { type?: string; range?: string };
    if (payload.type !== "revealRange" || !payload.range || !this.currentDoc) {
      return;
    }
    const range = parseRange(payload.range);
    if (!range) {
      return;
    }
    const editor = await vscode.window.showTextDocument(this.currentDoc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: true
    });
    const start = toUtf16Position(editor.document, range.startLine, range.startCol);
    const end = toUtf16Position(editor.document, range.endLine, range.endCol);
    const selection = new vscode.Selection(start, end);
    editor.selection = selection;
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
  }
}

function runTypmark(
  cliPath: string,
  source: string,
  theme: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, ["--render", "--theme", theme, "--source-map"]);
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

function injectPreviewScript(html: string): string {
  const script = `
<style>
  .TypMark-scroll-highlight {
    animation: tm-scroll-highlight 1.2s ease-out;
  }

  @keyframes tm-scroll-highlight {
    0% {
      box-shadow: 0 0 0 2px rgba(255, 200, 0, 0.45);
      background: rgba(255, 200, 0, 0.18);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(255, 200, 0, 0);
      background: transparent;
    }
  }
</style>
<script>
(function () {
  const vscode = acquireVsCodeApi();
  let elements = [];
  let highlightTimer = null;
  let highlightTarget = null;

  function refreshElements() {
    elements = collectRanges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshElements);
  } else {
    refreshElements();
  }
  window.addEventListener("load", refreshElements);

  const blockTags = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "BLOCKQUOTE",
    "PRE",
    "FIGURE",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TH",
    "TD",
    "UL",
    "OL",
    "HR"
  ]);

  function collectRanges() {
    const nodes = Array.from(document.querySelectorAll("[data-tm-range]"));
    return nodes.map((node) => {
      const range = parseRange(node.getAttribute("data-tm-range"));
      if (!range) return null;
      const tag = node.tagName;
      const isBlock = blockTags.has(tag) ||
        (tag === "DIV" && node.classList.contains("TypMark-box")) ||
        (tag === "DIV" && node.classList.contains("TypMark-math-block")) ||
        (tag === "DIV" && node.classList.contains("TypMark-html"));
      return { node, range, isBlock };
    }).filter(Boolean);
  }

  function parseRange(value) {
    if (!value) return null;
    const match = value.match(/^(\\d+):(\\d+)-(\\d+):(\\d+)$/);
    if (!match) return null;
    return {
      startLine: Number(match[1]),
      startCol: Number(match[2]),
      endLine: Number(match[3]),
      endCol: Number(match[4])
    };
  }

  function sortByStart(entries) {
    return entries.slice().sort((a, b) => {
      if (a.range.startLine === b.range.startLine) {
        return a.range.startCol - b.range.startCol;
      }
      return a.range.startLine - b.range.startLine;
    });
  }

  function pickBest(entries, line) {
    if (!entries.length) return null;
    const sorted = sortByStart(entries);
    let candidate = null;
    for (const entry of sorted) {
      if (entry.range.startLine <= line) {
        candidate = entry;
      } else {
        break;
      }
    }
    if (candidate) {
      return candidate.node;
    }
    return sorted[0].node;
  }

  function findElementForLine(line) {
    const blockEntries = elements.filter((entry) => entry.isBlock);
    const blockMatch = pickBest(blockEntries, line);
    if (blockMatch) {
      return blockMatch;
    }
    return pickBest(elements, line);
  }

  function isInView(element) {
    const rect = element.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < viewHeight;
  }

  function highlightElement(element) {
    if (highlightTimer) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
    if (highlightTarget) {
      highlightTarget.classList.remove("TypMark-scroll-highlight");
    }
    highlightTarget = element;
    element.classList.add("TypMark-scroll-highlight");
    highlightTimer = setTimeout(() => {
      element.classList.remove("TypMark-scroll-highlight");
      if (highlightTarget == element) {
        highlightTarget = null;
      }
      highlightTimer = null;
    }, 1200);
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "scrollToLine") {
      return;
    }
    if (!elements.length) {
      refreshElements("message");
    }
    const target = findElementForLine(data.line);
    if (target) {
      if (!isInView(target)) {
        target.scrollIntoView({ block: "center" });
        highlightElement(target);
      }
    }
  });

  document.addEventListener("dblclick", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-tm-range]")
      : null;
    if (!target) return;
    const range = target.getAttribute("data-tm-range");
    if (!range) return;
    vscode.postMessage({ type: "revealRange", range });
  });
})();
</script>`;
  const closingBody = "</body>";
  const index = html.lastIndexOf(closingBody);
  if (index === -1) {
    return html + script;
  }
  return (
    html.slice(0, index) +
    script +
    closingBody +
    html.slice(index + closingBody.length)
  );
}

function parseRange(value: string): {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
} | null {
  const match = value.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    startLine: Number(match[1]),
    startCol: Number(match[2]),
    endLine: Number(match[3]),
    endCol: Number(match[4])
  };
}

function toUtf16Position(
  document: vscode.TextDocument,
  line: number,
  byteCol: number
): vscode.Position {
  const safeLine = Math.max(0, Math.min(line, document.lineCount - 1));
  const text = document.lineAt(safeLine).text;
  const bytes = Buffer.from(text, "utf8");
  const slice = bytes.subarray(0, Math.min(byteCol, bytes.length));
  const utf16Col = slice.toString("utf8").length;
  return new vscode.Position(safeLine, utf16Col);
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
