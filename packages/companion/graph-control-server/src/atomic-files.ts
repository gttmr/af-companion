import { constants, watch, type FSWatcher } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

export class SafeFileError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "SafeFileError"; }
}

export async function ensureContainedDirectory(projectRoot: string, relativePath: string): Promise<string> {
  const root = await realpath(projectRoot);
  const target = resolveContained(root, relativePath);
  const segments = relative(root, target).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    await mkdir(cursor, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const info = await lstat(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new SafeFileError("symlink_not_allowed", `${cursor} must be a real directory`);
  }
  return target;
}

export async function readContainedFile(projectRoot: string, relativePath: string, maximumBytes: number): Promise<Buffer> {
  const root = await realpath(projectRoot);
  const path = resolveContained(root, relativePath);
  await assertNoSymlinkSegments(root, path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n) throw new SafeFileError("not_regular_file", "Expected a single-link regular file");
    if (before.size > BigInt(maximumBytes)) throw new SafeFileError("file_too_large", `File exceeds ${maximumBytes} bytes`);
    const buffer = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw new SafeFileError("file_changed_during_read", "File changed while reading");
    return buffer.subarray(0, offset);
  } catch (error) {
    if (isCode(error, "ELOOP")) throw new SafeFileError("symlink_not_allowed", "Symlinks are not allowed");
    throw error;
  } finally { await handle.close(); }
}

export async function readStableContainedFile(projectRoot: string, relativePath: string, maximumBytes: number): Promise<Buffer> {
  try { return await readContainedFile(projectRoot, relativePath, maximumBytes); }
  catch (error) {
    if (!(error instanceof SafeFileError) || error.code !== "file_changed_during_read") throw error;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    return readContainedFile(projectRoot, relativePath, maximumBytes);
  }
}

export async function writeAtomicJson(projectRoot: string, relativePath: string, value: unknown, mode = 0o600): Promise<void> {
  const root = await realpath(projectRoot);
  const target = resolveContained(root, relativePath);
  await ensureContainedDirectory(root, relative(root, dirname(target)) || ".");
  const existing = await lstat(target).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new SafeFileError("symlink_not_allowed", "Target must be a regular file");
  const temporary = resolve(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    await handle.writeFile(bytes, "utf8"); await handle.chmod(mode); await handle.sync(); await handle.close(); handle = undefined;
    await rename(temporary, target);
    const readback = await readContainedFile(root, relative(root, target), Buffer.byteLength(bytes) + 1);
    if (readback.toString("utf8") !== bytes) throw new SafeFileError("readback_mismatch", "Atomic write readback did not match");
    const directory = await open(dirname(target), constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
  } finally { await handle?.close(); await rm(temporary, { force: true }).catch(() => undefined); }
}

export function watchDirectory(path: string, onHint: () => void): FSWatcher {
  return watch(path, { persistent: false }, () => onHint());
}

function resolveContained(root: string, relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").some((part) => part === "..")) throw new SafeFileError("invalid_relative_path", "Path must be project-relative");
  const target = resolve(root, relativePath);
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new SafeFileError("path_outside_project", "Path is outside project");
  return target;
}

async function assertNoSymlinkSegments(root: string, target: string): Promise<void> {
  let cursor = root;
  for (const segment of relative(root, target).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new SafeFileError("symlink_not_allowed", "Symlink path segment is not allowed");
  }
  const rootInfo = await stat(root); if (!rootInfo.isDirectory()) throw new SafeFileError("project_root_not_directory", "Project root is not a directory");
}

function isCode(error: unknown, code: string): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error && error.code === code; }
