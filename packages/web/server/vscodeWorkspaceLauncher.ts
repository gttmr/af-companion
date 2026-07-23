import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { release as osRelease } from "node:os";
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type { CodexEditorCapabilities, VscodeLaunchReceipt } from "../src/companion/types.ts";
import type { EditorOpenReceipt } from "../src/workspace/types.ts";

const execFileAsync = promisify(execFile);

export const DEFAULT_VSCODE_PROBE_CACHE_MS = 30_000;
export const DEFAULT_VSCODE_COMMAND_TIMEOUT_MS = 1_500;
export const DEFAULT_VSCODE_LAUNCH_TIMEOUT_MS = 10_000;
export const DEFAULT_VSCODE_LAUNCH_COOLDOWN_MS = 2_500;

export interface VscodeWorkspaceLauncherOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  probeCacheMs?: number;
  commandTimeoutMs?: number;
  launchTimeoutMs?: number;
  launchCooldownMs?: number;
}

export class VscodeWorkspaceLauncherError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "VscodeWorkspaceLauncherError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class VscodeWorkspaceLauncher {
  readonly #canonicalRoot: Promise<string>;
  readonly #env: NodeJS.ProcessEnv;
  readonly #now: () => Date;
  readonly #probeCacheMs: number;
  readonly #commandTimeoutMs: number;
  readonly #launchTimeoutMs: number;
  readonly #launchCooldownMs: number;
  #probeCache: { expiresAt: number; value: CodexEditorCapabilities; executable: string | null } | null = null;
  #probeInFlight: Promise<CodexEditorCapabilities> | null = null;
  #launchInFlight = false;
  #lastLaunchAtMs: number | null = null;

  constructor(repoRoot: string, options: VscodeWorkspaceLauncherOptions = {}) {
    this.#canonicalRoot = realpath(repoRoot);
    this.#env = options.env ?? process.env;
    this.#now = options.now ?? (() => new Date());
    this.#probeCacheMs = positiveDuration(options.probeCacheMs, DEFAULT_VSCODE_PROBE_CACHE_MS, "probeCacheMs");
    this.#commandTimeoutMs = positiveDuration(
      options.commandTimeoutMs,
      DEFAULT_VSCODE_COMMAND_TIMEOUT_MS,
      "commandTimeoutMs",
    );
    this.#launchTimeoutMs = positiveDuration(
      options.launchTimeoutMs,
      DEFAULT_VSCODE_LAUNCH_TIMEOUT_MS,
      "launchTimeoutMs",
    );
    this.#launchCooldownMs = positiveDuration(
      options.launchCooldownMs,
      DEFAULT_VSCODE_LAUNCH_COOLDOWN_MS,
      "launchCooldownMs",
    );
  }

  async canonicalRoot(): Promise<string> {
    return this.#canonicalRoot;
  }

  async probe(): Promise<CodexEditorCapabilities> {
    const nowMs = this.#now().getTime();
    if (this.#probeCache && this.#probeCache.expiresAt > nowMs) return structuredClone(this.#probeCache.value);
    if (this.#probeInFlight) return structuredClone(await this.#probeInFlight);

    this.#probeInFlight = this.#probeFresh();
    try {
      const value = await this.#probeInFlight;
      return structuredClone(value);
    } finally {
      this.#probeInFlight = null;
    }
  }

  async launch(): Promise<VscodeLaunchReceipt> {
    const nowMs = this.#now().getTime();
    if (this.#launchInFlight || (this.#lastLaunchAtMs !== null && nowMs - this.#lastLaunchAtMs < this.#launchCooldownMs)) {
      throw new VscodeWorkspaceLauncherError(429, "launch_cooldown", "VS Code launch is cooling down");
    }

    const editor = await this.probe();
    const executable = this.#probeCache?.executable ?? null;
    if (!editor.code_available || !executable) {
      throw new VscodeWorkspaceLauncherError(503, "code_unavailable", "A trusted host VS Code executable is unavailable");
    }

    const canonicalRoot = await this.#canonicalRoot;
    this.#launchInFlight = true;
    try {
      await execFileAsync(executable, ["--new-window", canonicalRoot], {
        cwd: canonicalRoot,
        encoding: "utf8",
        env: this.#env,
        maxBuffer: 64 * 1_024,
        shell: false,
        timeout: this.#launchTimeoutMs,
        windowsHide: true,
      });
      const launchedAt = this.#now();
      this.#lastLaunchAtMs = launchedAt.getTime();
      return {
        status: "accepted",
        workspace_path: canonicalRoot,
        launched_at: launchedAt.toISOString(),
      };
    } catch {
      this.#probeCache = null;
      throw new VscodeWorkspaceLauncherError(503, "code_launch_failed", "VS Code workspace launch failed");
    } finally {
      this.#launchInFlight = false;
    }
  }

  async openFile(relativePath: string, line?: number): Promise<EditorOpenReceipt> {
    const { executable, canonicalRoot } = await this.#trustedExecutable();
    const absolutePath = await resolveContainedWorkspaceFile(canonicalRoot, relativePath, true);
    const normalizedLine = line === undefined ? null : normalizeLine(line);
    const target = normalizedLine === null ? absolutePath : `${absolutePath}:${normalizedLine}`;
    await this.#runOpen(executable, canonicalRoot, ["--reuse-window", "--goto", target]);
    return {
      status: "accepted",
      mode: "file",
      path: relativePath,
      opened_at: this.#now().toISOString(),
    };
  }

  async openDiff(relativePath: string): Promise<EditorOpenReceipt> {
    const { executable, canonicalRoot } = await this.#trustedExecutable();
    const absolutePath = await resolveContainedWorkspaceFile(canonicalRoot, relativePath, false);
    const currentExists = await stat(absolutePath).then((value) => value.isFile(), () => false);
    const base = await readHeadVersion(canonicalRoot, relativePath);
    if (!currentExists && base === null) {
      throw new VscodeWorkspaceLauncherError(404, "file_not_found", "Diff 대상을 찾을 수 없습니다");
    }
    const diffDir = join(canonicalRoot, ".agent-factory", "editor-diffs");
    await mkdir(diffDir, { recursive: true, mode: 0o700 });
    await chmod(diffDir, 0o700);
    const key = createHash("sha256").update(relativePath).digest("hex").slice(0, 16);
    const label = basename(relativePath).replace(/[^A-Za-z0-9_.-]/g, "_") || "file";
    const basePath = join(diffDir, `${key}.HEAD.${label}`);
    const workingPath = currentExists ? absolutePath : join(diffDir, `${key}.WORKTREE.${label}`);
    await writeFile(basePath, base ?? "", { encoding: "utf8", mode: 0o600 });
    if (!currentExists) await writeFile(workingPath, "", { encoding: "utf8", mode: 0o600 });
    await this.#runOpen(executable, canonicalRoot, ["--reuse-window", "--diff", basePath, workingPath]);
    return {
      status: "accepted",
      mode: "diff",
      path: relativePath,
      opened_at: this.#now().toISOString(),
    };
  }

  async #trustedExecutable(): Promise<{ executable: string; canonicalRoot: string }> {
    const editor = await this.probe();
    const executable = this.#probeCache?.executable ?? null;
    if (!editor.code_available || !executable) {
      throw new VscodeWorkspaceLauncherError(503, "code_unavailable", "A trusted host VS Code executable is unavailable");
    }
    return { executable, canonicalRoot: await this.#canonicalRoot };
  }

  async #runOpen(executable: string, canonicalRoot: string, args: string[]): Promise<void> {
    try {
      await execFileAsync(executable, args, {
        cwd: canonicalRoot,
        encoding: "utf8",
        env: this.#env,
        maxBuffer: 64 * 1_024,
        shell: false,
        timeout: this.#launchTimeoutMs,
        windowsHide: true,
      });
    } catch {
      this.#probeCache = null;
      throw new VscodeWorkspaceLauncherError(503, "code_open_failed", "VS Code에서 대상을 열지 못했습니다");
    }
  }

  async #probeFresh(): Promise<CodexEditorCapabilities> {
    const canonicalRoot = await this.#canonicalRoot;
    const executable = await resolveHostCodeExecutable(canonicalRoot, this.#env);
    const probedAt = this.#now();
    let codeAvailable = false;
    let codeVersion: string | null = null;
    let extensionVersion: string | null = null;

    if (executable) {
      try {
        const versionResult = await execFileAsync(executable, ["--version"], {
          cwd: canonicalRoot,
          encoding: "utf8",
          env: this.#env,
          maxBuffer: 64 * 1_024,
          shell: false,
          timeout: this.#commandTimeoutMs,
          windowsHide: true,
        });
        codeAvailable = true;
        codeVersion = firstNonEmptyLine(versionResult.stdout);
        const extensionsResult = await execFileAsync(executable, ["--list-extensions", "--show-versions"], {
          cwd: canonicalRoot,
          encoding: "utf8",
          env: this.#env,
          maxBuffer: 512 * 1_024,
          shell: false,
          timeout: this.#commandTimeoutMs,
          windowsHide: true,
        }).catch(() => null);
        extensionVersion = extensionsResult ? findCodexExtensionVersion(extensionsResult.stdout) : null;
      } catch {
        codeAvailable = false;
      }
    }

    const value: CodexEditorCapabilities = {
      code_available: codeAvailable,
      code_version: codeVersion,
      wsl_environment: Boolean(this.#env.WSL_DISTRO_NAME || this.#env.WSL_INTEROP || /microsoft/i.test(osRelease())),
      codex_extension_installed: extensionVersion !== null,
      codex_extension_version: extensionVersion,
      launch_supported: codeAvailable,
      probed_at: probedAt.toISOString(),
    };
    this.#probeCache = {
      expiresAt: probedAt.getTime() + this.#probeCacheMs,
      value,
      executable: codeAvailable ? executable : null,
    };
    return value;
  }
}

async function resolveContainedWorkspaceFile(root: string, relativePath: string, mustExist: boolean): Promise<string> {
  if (typeof relativePath !== "string" || !relativePath.trim() || isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new VscodeWorkspaceLauncherError(400, "invalid_path", "Workspace 상대 경로가 필요합니다");
  }
  const absolutePath = resolve(root, relativePath);
  if (!isContainedPath(root, absolutePath)) {
    throw new VscodeWorkspaceLauncherError(403, "path_outside_workspace", "Workspace 밖의 파일은 열 수 없습니다");
  }
  const info = await stat(absolutePath).catch(() => null);
  if (mustExist && !info?.isFile()) {
    throw new VscodeWorkspaceLauncherError(404, "file_not_found", "파일을 찾을 수 없습니다");
  }
  if (info) {
    const canonicalPath = await realpath(absolutePath);
    if (!isContainedPath(root, canonicalPath)) {
      throw new VscodeWorkspaceLauncherError(403, "path_outside_workspace", "Workspace 밖의 파일은 열 수 없습니다");
    }
  }
  return absolutePath;
}

function normalizeLine(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000_000) {
    throw new VscodeWorkspaceLauncherError(400, "invalid_line", "line은 양의 정수여야 합니다");
  }
  return value;
}

async function readHeadVersion(repoRoot: string, relativePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `HEAD:${relativePath.split(sep).join("/")}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1_024 * 1_024,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function resolveHostCodeExecutable(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const canonicalRoot = await realpath(repoRoot);
  for (const pathEntry of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = isAbsolute(pathEntry)
      ? join(pathEntry, "code")
      : resolve(pathEntry, "code");
    if (isContainedPath(canonicalRoot, candidate)) continue;
    const executable = await access(candidate, fsConstants.X_OK).then(() => true, () => false);
    if (!executable) continue;
    const canonicalCandidate = await realpath(candidate).catch(() => null);
    if (!canonicalCandidate || isContainedPath(canonicalRoot, canonicalCandidate)) continue;
    const candidateStat = await stat(canonicalCandidate).catch(() => null);
    if (candidateStat?.isFile()) return canonicalCandidate;
  }
  return null;
}

function findCodexExtensionVersion(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^openai\.chatgpt@(.+)$/i.exec(line.trim());
    if (match?.[1]) return match[1];
  }
  return null;
}

function firstNonEmptyLine(stdout: string): string | null {
  return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function positiveDuration(value: number | undefined, fallback: number, field: string): number {
  const normalized = value ?? fallback;
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(`${field} must be positive`);
  return normalized;
}

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}
