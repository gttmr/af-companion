import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 1_500;
const LAUNCH_TIMEOUT_MS = 10_000;
const LAUNCH_COOLDOWN_MS = 2_500;

export interface VscodeLaunchReceipt {
  status: "accepted";
  workspace_path: string;
  launched_at: string;
  codex_extension_installed: boolean;
  codex_extension_version: string | null;
}

export interface VscodeLauncher {
  launch(): Promise<VscodeLaunchReceipt>;
}

export class VscodeLaunchError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "VscodeLaunchError";
  }
}

export class VscodeProjectLauncher implements VscodeLauncher {
  readonly #projectRoot: Promise<string>;
  readonly #env: NodeJS.ProcessEnv;
  readonly #now: () => Date;
  #launching = false;
  #lastLaunchAt: number | null = null;

  constructor(projectRoot: string, options: { env?: NodeJS.ProcessEnv; now?: () => Date } = {}) {
    this.#projectRoot = canonicalDirectory(projectRoot);
    this.#env = options.env ?? process.env;
    this.#now = options.now ?? (() => new Date());
  }

  async launch(): Promise<VscodeLaunchReceipt> {
    const now = this.#now();
    if (this.#launching || (this.#lastLaunchAt !== null && now.getTime() - this.#lastLaunchAt < LAUNCH_COOLDOWN_MS)) {
      throw new VscodeLaunchError(429, "launch_cooldown", "VS Code를 여는 중입니다. 잠시 뒤 다시 시도하세요.");
    }

    const projectRoot = await this.#projectRoot;
    const executable = await resolveHostCodeExecutable(projectRoot, this.#env);
    if (!executable) {
      throw new VscodeLaunchError(503, "code_unavailable", "WSL에서 사용할 수 있는 VS Code code 명령을 찾지 못했습니다.");
    }

    const probe = await probeCode(executable, projectRoot, this.#env);
    this.#launching = true;
    try {
      await execFileAsync(executable, ["--new-window", projectRoot], {
        cwd: projectRoot,
        encoding: "utf8",
        env: this.#env,
        maxBuffer: 64 * 1_024,
        shell: false,
        timeout: LAUNCH_TIMEOUT_MS,
        windowsHide: true,
      });
      this.#lastLaunchAt = now.getTime();
      return {
        status: "accepted",
        workspace_path: projectRoot,
        launched_at: now.toISOString(),
        codex_extension_installed: probe.extensionVersion !== null,
        codex_extension_version: probe.extensionVersion,
      };
    } catch {
      throw new VscodeLaunchError(503, "code_launch_failed", "VS Code workspace를 열지 못했습니다.");
    } finally {
      this.#launching = false;
    }
  }
}

async function canonicalDirectory(path: string): Promise<string> {
  const canonical = await realpath(resolve(path));
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new VscodeLaunchError(500, "invalid_project_root", "Companion project root가 directory가 아닙니다.");
  return canonical;
}

async function probeCode(executable: string, cwd: string, env: NodeJS.ProcessEnv): Promise<{ extensionVersion: string | null }> {
  try {
    await execFileAsync(executable, ["--version"], {
      cwd,
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1_024,
      shell: false,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch {
    throw new VscodeLaunchError(503, "code_unavailable", "VS Code code 명령이 응답하지 않습니다.");
  }
  const extensions = await execFileAsync(executable, ["--list-extensions", "--show-versions"], {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 512 * 1_024,
    shell: false,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  }).catch(() => null);
  return { extensionVersion: extensions ? findCodexExtensionVersion(extensions.stdout) : null };
}

export async function resolveHostCodeExecutable(projectRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const canonicalRoot = await realpath(projectRoot);
  for (const pathEntry of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = isAbsolute(pathEntry) ? join(pathEntry, "code") : resolve(pathEntry, "code");
    if (contained(canonicalRoot, candidate)) continue;
    if (!await access(candidate, fsConstants.X_OK).then(() => true, () => false)) continue;
    const canonicalCandidate = await realpath(candidate).catch(() => null);
    if (!canonicalCandidate || contained(canonicalRoot, canonicalCandidate)) continue;
    if ((await stat(canonicalCandidate).catch(() => null))?.isFile()) return canonicalCandidate;
  }
  return null;
}

function contained(root: string, target: string): boolean {
  const relation = relative(root, target);
  return relation === "" || (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${sep}`));
}

function findCodexExtensionVersion(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^openai\.chatgpt@(.+)$/iu.exec(line.trim());
    if (match?.[1]) return match[1];
  }
  return null;
}
