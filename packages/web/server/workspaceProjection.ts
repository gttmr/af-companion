import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";

import { COMPANION_STATE_RELATIVE_DIR } from "../src/companion/sessionContract";
import type {
  WorkspaceActivity,
  WorkspaceActivityKind,
  WorkspaceChange,
  WorkspaceChangeStatus,
  WorkspaceDiff,
  WorkspaceProjectionEvent,
  WorkspaceProjectionSnapshot,
} from "../src/workspace/types";
import { WORKSPACE_PROJECTION_SCHEMA_VERSION } from "../src/workspace/types";
import { ArtifactRootStore } from "./artifactRootStore";

const execFileAsync = promisify(execFile);
const MAX_ACTIVITY = 200;
const MAX_DIFF_BYTES = 256 * 1_024;
const STATE_RELATIVE_DIR = ".agent-factory/workspace-projection";
const STATE_FILE = "activity.json";
const CODEX_STATE_RELATIVE_PATH = `${COMPANION_STATE_RELATIVE_DIR}/state.json`;

interface PersistedProjectionState {
  schema_version: 1;
  sequence: number;
  activities: WorkspaceActivity[];
}

export class WorkspaceProjection {
  readonly #repoRootPromise: Promise<string>;
  readonly #store: ArtifactRootStore;
  readonly #listeners = new Set<(event: WorkspaceProjectionEvent) => void>();
  readonly #now: () => Date;
  #repoRoot: string | null = null;
  #watcher: FSWatcher | null = null;
  #startPromise: Promise<void> | null = null;
  #sequence = 0;
  #activities: WorkspaceActivity[] = [];
  #persistChain: Promise<void> = Promise.resolve();

  constructor(repoRoot: string, options: { now?: () => Date } = {}) {
    this.#repoRootPromise = realpath(repoRoot);
    this.#store = new ArtifactRootStore({ repoRoot });
    this.#now = options.now ?? (() => new Date());
  }

  async start(): Promise<void> {
    this.#startPromise ??= this.#start();
    return this.#startPromise;
  }

  async stop(): Promise<void> {
    await this.#watcher?.close();
    this.#watcher = null;
    await this.#persistChain.catch(() => undefined);
  }

  subscribe(listener: (event: WorkspaceProjectionEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async snapshot(): Promise<WorkspaceProjectionSnapshot> {
    await this.start();
    const repoRoot = await this.canonicalRoot();
    const [git, workItems, changes] = await Promise.all([
      readGitIdentity(repoRoot),
      this.#store.listRoots(),
      readWorkspaceChanges(repoRoot),
    ]);
    return {
      schema_version: WORKSPACE_PROJECTION_SCHEMA_VERSION,
      sequence: this.#sequence,
      generated_at: this.#now().toISOString(),
      identity: {
        workspace_id: workspaceId(repoRoot),
        canonical_path: repoRoot,
        display_name: basename(repoRoot) || repoRoot,
        git_head: git.head,
        git_branch: git.branch,
      },
      work_items: workItems,
      activities: structuredClone(this.#activities),
      changes,
    };
  }

  async identity(): Promise<WorkspaceProjectionSnapshot["identity"]> {
    const snapshot = await this.snapshot();
    return snapshot.identity;
  }

  async changes(): Promise<WorkspaceChange[]> {
    await this.start();
    return readWorkspaceChanges(await this.canonicalRoot());
  }

  async diff(path: string): Promise<WorkspaceDiff> {
    await this.start();
    const repoRoot = await this.canonicalRoot();
    const relativePath = await this.assertWorkspacePath(path, { mustExist: false });
    const changes = await readWorkspaceChanges(repoRoot);
    const change = changes.find((entry) => entry.path === relativePath);
    if (!change) throw new WorkspaceProjectionError(404, "not_changed", "변경된 파일이 아닙니다.");

    let output = "";
    if (change.status === "added" && change.index_status === "?" && change.worktree_status === "?") {
      const absolute = resolve(repoRoot, relativePath);
      const exists = await stat(absolute).then((value) => value.isFile(), () => false);
      if (!exists) throw new WorkspaceProjectionError(404, "file_not_found", "파일을 찾을 수 없습니다.");
      output = await gitOutputAllowingDiffExit(repoRoot, ["diff", "--no-index", "--", "/dev/null", absolute]);
    } else {
      output = await gitOutputAllowingDiffExit(repoRoot, ["diff", "--no-ext-diff", "HEAD", "--", relativePath]);
    }
    output = output.split(repoRoot).join(".");
    const bytes = Buffer.byteLength(output, "utf8");
    const truncated = bytes > MAX_DIFF_BYTES;
    if (truncated) output = Buffer.from(output, "utf8").subarray(0, MAX_DIFF_BYTES).toString("utf8") + "\n[diff truncated]\n";
    return {
      path: relativePath,
      status: change.status,
      diff: output,
      truncated,
      binary: /Binary files .* differ|GIT binary patch/.test(output),
    };
  }

  async assertWorkspacePath(path: string, options: { mustExist?: boolean } = {}): Promise<string> {
    if (typeof path !== "string" || !path.trim() || isAbsolute(path) || path.includes("\0")) {
      throw new WorkspaceProjectionError(400, "invalid_path", "workspace 상대 경로가 필요합니다.");
    }
    const repoRoot = await this.canonicalRoot();
    const absolute = resolve(repoRoot, path);
    if (!isContainedPath(repoRoot, absolute)) {
      throw new WorkspaceProjectionError(403, "path_outside_workspace", "workspace 밖의 경로는 열 수 없습니다.");
    }
    if (options.mustExist !== false) {
      const info = await stat(absolute).catch(() => null);
      if (!info?.isFile()) throw new WorkspaceProjectionError(404, "file_not_found", "파일을 찾을 수 없습니다.");
      const canonical = await realpath(absolute);
      if (!isContainedPath(repoRoot, canonical)) {
        throw new WorkspaceProjectionError(403, "path_outside_workspace", "workspace 밖의 경로는 열 수 없습니다.");
      }
    }
    return normalizeRelative(repoRoot, absolute);
  }

  record(
    kind: WorkspaceActivityKind,
    action: string,
    path: string | null,
    reason: WorkspaceProjectionEvent["reason"],
  ): WorkspaceActivity {
    const at = this.#now().toISOString();
    const workId = path ? workIdFromPath(path) : null;
    const previous = this.#activities[this.#activities.length - 1];
    if (previous && previous.kind === kind && previous.action === action && previous.path === path
      && Date.parse(at) - Date.parse(previous.at) < 250) {
      previous.at = at;
      this.#emit({ sequence: this.#sequence, reason, activity: structuredClone(previous), at });
      this.#queuePersist();
      return structuredClone(previous);
    }
    const activity: WorkspaceActivity = {
      id: ++this.#sequence,
      kind,
      action,
      path,
      work_id: workId,
      at,
    };
    this.#activities.push(activity);
    if (this.#activities.length > MAX_ACTIVITY) this.#activities.splice(0, this.#activities.length - MAX_ACTIVITY);
    this.#emit({ sequence: this.#sequence, reason, activity: structuredClone(activity), at });
    this.#queuePersist();
    return structuredClone(activity);
  }

  async canonicalRoot(): Promise<string> {
    this.#repoRoot ??= await this.#repoRootPromise;
    return this.#repoRoot;
  }

  async #start(): Promise<void> {
    const repoRoot = await this.canonicalRoot();
    await this.#loadState(repoRoot);
    const localStateRoot = join(repoRoot, ".agent-factory");
    await mkdir(localStateRoot, { recursive: true, mode: 0o700 });
    await chmod(localStateRoot, 0o700);
    const watched = [
      join(repoRoot, "artifacts", "af"),
      join(repoRoot, "packages"),
      join(repoRoot, ".agents"),
      join(repoRoot, "schemas"),
      join(repoRoot, "templates"),
      join(repoRoot, "scripts"),
      join(repoRoot, "docs"),
      join(repoRoot, ".codex", "hooks.json"),
      localStateRoot,
      join(repoRoot, "AGENTS.md"),
      join(repoRoot, "CLAUDE.md"),
      join(repoRoot, "STATUS.md"),
    ];
    this.#watcher = chokidar.watch(watched, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 25 },
      ignored: (path) => isIgnoredWatchPath(path),
    });
    const onChange = (action: string, absolutePath: string) => {
      const relativePath = normalizeRelative(repoRoot, absolutePath);
      const isCodexState = relativePath === CODEX_STATE_RELATIVE_PATH;
      if (isCodexState) {
        void readLatestCodexAction(absolutePath).then((codexAction) => {
          this.record("codex", codexAction, null, "codex");
        });
        return;
      }
      if (relativePath === ".agent-factory" || relativePath.startsWith(".agent-factory/")) return;
      const kind = relativePath.startsWith("artifacts/af/") ? "artifact" : "source";
      this.record(kind, action, relativePath, "filesystem");
    };
    this.#watcher.on("add", (path) => onChange("created", path));
    this.#watcher.on("change", (path) => onChange("modified", path));
    this.#watcher.on("unlink", (path) => onChange("deleted", path));
    this.#watcher.on("addDir", (path) => onChange("directory created", path));
    this.#watcher.on("unlinkDir", (path) => onChange("directory deleted", path));
  }

  async #loadState(repoRoot: string): Promise<void> {
    const statePath = join(repoRoot, STATE_RELATIVE_DIR, STATE_FILE);
    const parsed = await readFile(statePath, "utf8").then((text) => JSON.parse(text) as unknown, () => null);
    if (!isPersistedState(parsed)) return;
    this.#sequence = parsed.sequence;
    this.#activities = parsed.activities.slice(-MAX_ACTIVITY);
  }

  #queuePersist(): void {
    this.#persistChain = this.#persistChain.then(async () => {
      const repoRoot = await this.canonicalRoot();
      const stateDir = join(repoRoot, STATE_RELATIVE_DIR);
      const statePath = join(stateDir, STATE_FILE);
      const tempPath = join(stateDir, `.${STATE_FILE}.${process.pid}.${randomUUID()}.tmp`);
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      await chmod(stateDir, 0o700);
      const body = `${JSON.stringify({
        schema_version: 1,
        sequence: this.#sequence,
        activities: this.#activities,
      } satisfies PersistedProjectionState, null, 2)}\n`;
      try {
        await writeFile(tempPath, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await rename(tempPath, statePath);
        await chmod(statePath, 0o600);
      } finally {
        await rm(tempPath, { force: true }).catch(() => undefined);
      }
    }).catch(() => undefined);
  }

  #emit(event: WorkspaceProjectionEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

async function readLatestCodexAction(path: string): Promise<string> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as {
      activities?: Array<{ event?: unknown; tool_name?: unknown }>;
    };
    const activities = value.activities ?? [];
    const latest = activities[activities.length - 1];
    if (!latest || typeof latest.event !== "string") return "session activity";
    if (typeof latest.tool_name === "string" && latest.tool_name) {
      return `${latest.tool_name} · ${latest.event}`;
    }
    return latest.event;
  } catch {
    return "session activity";
  }
}

export class WorkspaceProjectionError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "WorkspaceProjectionError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function readGitIdentity(repoRoot: string): Promise<{ head: string | null; branch: string | null }> {
  const [head, branch] = await Promise.all([
    gitText(repoRoot, ["rev-parse", "HEAD"]),
    gitText(repoRoot, ["branch", "--show-current"]),
  ]);
  return { head: head || null, branch: branch || null };
}

export async function readWorkspaceChanges(repoRoot: string): Promise<WorkspaceChange[]> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1_024 * 1_024,
  });
  const records = stdout.split("\0");
  const changes: WorkspaceChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const indexStatus = record[0];
    const worktreeStatus = record[1];
    const path = record.slice(3);
    let previousPath: string | null = null;
    if (indexStatus === "R" || indexStatus === "C") previousPath = records[++index] || null;
    changes.push({
      path,
      status: changeStatus(indexStatus, worktreeStatus),
      index_status: indexStatus,
      worktree_status: worktreeStatus,
      previous_path: previousPath,
      area: classifyArea(path),
    });
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function changeStatus(indexStatus: string, worktreeStatus: string): WorkspaceChangeStatus {
  const codes = `${indexStatus}${worktreeStatus}`;
  if (codes === "??" || codes.includes("A")) return "added";
  if (codes.includes("U") || codes === "AA" || codes === "DD") return "conflicted";
  if (codes.includes("R") || codes.includes("C")) return "renamed";
  if (codes.includes("D")) return "deleted";
  if (codes.includes("M") || codes.includes("T")) return "modified";
  return "unknown";
}

function classifyArea(path: string): WorkspaceChange["area"] {
  if (path.startsWith("artifacts/")) return "artifact";
  if (path.startsWith("docs/") || /(^|\/)README\.md$/.test(path)) return "documentation";
  if (path.startsWith(".codex/") || path.startsWith("schemas/") || path.startsWith("templates/")) return "configuration";
  if (path.startsWith("packages/") || path.startsWith("scripts/") || path.startsWith(".agents/")) return "source";
  return "other";
}

function workIdFromPath(path: string): string | null {
  const match = /^artifacts\/af\/([^/]+)(?:\/|$)/.exec(path);
  return match?.[1] ?? null;
}

function workspaceId(canonicalRoot: string): string {
  return `workspace-${createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 16)}`;
}

function normalizeRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function isIgnoredWatchPath(path: string): boolean {
  const normalized = path.split(sep).join("/");
  const bridgeRootSuffix = "/.agent-factory/codex-bridge";
  if (
    normalized.endsWith(bridgeRootSuffix)
    || normalized.endsWith(`${bridgeRootSuffix}/v2`)
    || normalized.endsWith(`/${CODEX_STATE_RELATIVE_PATH}`)
  ) {
    return false;
  }
  if (normalized.includes(`${bridgeRootSuffix}/`)) {
    return true;
  }
  return /\/(?:\.git|node_modules|dist|\.vite|\.venv|__pycache__|\.pytest_cache)(?:\/|$)/.test(normalized)
    || normalized.includes("/.agent-factory/workspace-projection/")
    || normalized.includes("/.agent-factory/editor-diffs/")
    || normalized.includes("/.agent-factory/runtime/");
}

function isPersistedState(value: unknown): value is PersistedProjectionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.schema_version !== 1 || !Number.isSafeInteger(state.sequence) || !Array.isArray(state.activities)) return false;
  return state.activities.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const activity = entry as Record<string, unknown>;
    return Number.isSafeInteger(activity.id)
      && ["codex", "artifact", "source", "git", "system"].includes(String(activity.kind))
      && typeof activity.action === "string"
      && (activity.path === null || typeof activity.path === "string")
      && (activity.work_id === null || typeof activity.work_id === "string")
      && typeof activity.at === "string";
  });
}

async function gitText(repoRoot: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 512 * 1_024 });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function gitOutputAllowingDiffExit(repoRoot: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 2 * 1_024 * 1_024 });
    return stdout;
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === "string") return stdout;
    throw error;
  }
}
