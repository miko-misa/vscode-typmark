import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { IncomingMessage } from "http";
import { spawn } from "child_process";
import * as vscode from "vscode";

const RELEASES_URL =
  "https://api.github.com/repos/miko-misa/typmark/releases/latest";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface CliInfo {
  path: string;
  managed: boolean;
}

export async function resolveCliPath(
  context: vscode.ExtensionContext,
): Promise<CliInfo> {
  const config = vscode.workspace.getConfiguration("typmark");
  const configured = (config.get("cliPath") as string | undefined) ?? "";
  if (configured.trim().length > 0) {
    return { path: configured, managed: false };
  }

  const storagePath = context.globalStorageUri.fsPath;
  await fs.promises.mkdir(storagePath, { recursive: true });
  const binName =
    process.platform === "win32" ? "typmark-cli.exe" : "typmark-cli";
  return { path: path.join(storagePath, binName), managed: true };
}

export async function ensureCli(
  context: vscode.ExtensionContext,
): Promise<CliInfo> {
  const info = await resolveCliPath(context);
  if (!info.managed) {
    return info;
  }

  const config = vscode.workspace.getConfiguration("typmark");
  const autoUpdate = Boolean(config.get("autoUpdate"));

  if (!fs.existsSync(info.path)) {
    await downloadLatestCli(context, info.path);
    return info;
  }

  if (!autoUpdate) {
    return info;
  }

  const localVersion = await getLocalVersion(info.path);
  const latest = await fetchLatestRelease();
  const latestVersion = normalizeVersion(latest.tag_name);

  if (!localVersion || localVersion !== latestVersion) {
    const choice = await vscode.window.showInformationMessage(
      `TypMark CLI update available (${latestVersion}).`,
      "Update",
      "Skip",
    );
    if (choice == "Update") {
      await downloadLatestCli(context, info.path);
    }
  }

  return info;
}

async function getLocalVersion(cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cliPath, ["--version"]);
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("close", () => {
      resolve(normalizeVersion(out.trim()));
    });
    child.on("error", () => {
      resolve("");
    });
  });
}

async function downloadLatestCli(
  context: vscode.ExtensionContext,
  destPath: string,
): Promise<void> {
  const release = await fetchLatestRelease();
  const asset = pickAsset(release.assets);
  if (!asset) {
    throw new Error("No matching release asset for this platform.");
  }

  const storagePath = context.globalStorageUri.fsPath;
  await fs.promises.mkdir(storagePath, { recursive: true });
  const archivePath = path.join(storagePath, path.basename(asset.name));
  const tempDir = path.join(storagePath, `tmp-${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });

  await downloadFile(asset.browser_download_url, archivePath);
  await extractArchive(archivePath, tempDir);

  const binName =
    process.platform === "win32" ? "typmark-cli.exe" : "typmark-cli";
  const extractedPath = await findCliBinary(tempDir, binName);
  if (!extractedPath) {
    const files = await listFiles(tempDir);
    throw new Error(
      `Extracted CLI binary not found. Files: ${files.join(", ")}`,
    );
  }

  await fs.promises.rename(extractedPath, destPath).catch(async () => {
    await fs.promises.copyFile(extractedPath, destPath);
    await fs.promises.unlink(extractedPath);
  });

  if (process.platform !== "win32") {
    await fs.promises.chmod(destPath, 0o755);
  }

  await fs.promises.rm(tempDir, { recursive: true, force: true });
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      RELEASES_URL,
      {
        headers: {
          "User-Agent": "vscode-typmark",
          Accept: "application/vnd.github+json",
        },
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
            const parsed = JSON.parse(data) as ReleaseInfo;
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
  });
}

function pickAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  const target = targetSuffix();
  if (!target) {
    return undefined;
  }
  return assets.find((asset) => asset.name.includes(target));
}

function targetSuffix(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") {
    return "x86_64-pc-windows-msvc.zip";
  }
  if (platform === "darwin") {
    return arch === "arm64"
      ? "aarch64-apple-darwin.tar.gz"
      : "x86_64-apple-darwin.tar.gz";
  }
  if (platform === "linux") {
    return "x86_64-unknown-linux-gnu.tar.gz";
  }
  return null;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, "");
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const maxRedirects = 5;
  const headers = {
    "User-Agent": "vscode-typmark",
    Accept: "application/octet-stream",
  };

  const download = async (
    currentUrl: string,
    redirects: number,
  ): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const req = https.get(currentUrl, { headers }, (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const nextUrl = res.headers.location;
          res.resume();
          if (!nextUrl) {
            reject(new Error("Download redirect missing location: " + status));
            return;
          }
          if (redirects <= 0) {
            reject(new Error("Download redirect limit exceeded."));
            return;
          }
          file.close();
          void download(nextUrl, redirects - 1).then(resolve, reject);
          return;
        }
        if (status >= 400 || status === 0) {
          reject(new Error("Download failed: " + status));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      });
      req.on("error", reject);
    });
  };

  await download(url, maxRedirects);
}

async function extractArchive(
  archivePath: string,
  destDir: string,
): Promise<void> {
  if (archivePath.endsWith(".zip")) {
    await runCommand(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`,
      ],
      destDir,
    );
    return;
  }

  await runCommand("tar", ["-xzf", archivePath, "-C", destDir], destDir);
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Command failed: ${command}`));
      }
    });
    child.on("error", reject);
  });
}

async function findCliBinary(
  dir: string,
  name: string,
): Promise<string | undefined> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name == name) {
      return fullPath;
    }
    if (entry.isFile() && isLikelyCliBinary(entry.name, name)) {
      candidates.push(fullPath);
    }
    if (entry.isSymbolicLink() && entry.name == name) {
      return fullPath;
    }
    if (entry.isSymbolicLink() && isLikelyCliBinary(entry.name, name)) {
      candidates.push(fullPath);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = await findCliBinary(path.join(dir, entry.name), name);
    if (nested) {
      return nested;
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }
  return undefined;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      out.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      out.push(...nested);
    }
  }
  return out.slice(0, 20);
}

function isLikelyCliBinary(entryName: string, expectedName: string): boolean {
  if (entryName == expectedName) {
    return true;
  }
  if (process.platform === "win32") {
    return (
      entryName.toLowerCase().startsWith("typmark") &&
      entryName.toLowerCase().endsWith(".exe")
    );
  }
  return entryName.startsWith("typmark");
}
