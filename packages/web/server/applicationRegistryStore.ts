import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const APPLICATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const APPLICATION_REGISTRY_SCHEMA_VERSION = 1;

export interface ApplicationRegistration {
  application_id: string;
  application_root: string;
  work_id: string;
  created_at: string;
}

export interface ApplicationRegistrySnapshot {
  schema_version: typeof APPLICATION_REGISTRY_SCHEMA_VERSION;
  applications: ApplicationRegistration[];
}

export interface ApplicationRegistryStoreOptions {
  repoRoot: string;
  applicationsRoot?: string;
}

export class ApplicationRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApplicationRegistryError";
    this.code = code;
  }
}

const registryLocks = new Map<string, Promise<void>>();
const heldRegistryLocks = new AsyncLocalStorage<ReadonlySet<string>>();

async function runWithRegistryLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = registryLocks.get(key) ?? Promise.resolve();
  const ready = previous.catch(() => undefined);
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const tail = ready.then(() => gate);
  registryLocks.set(key, tail);
  await ready;
  try {
    return await operation();
  } finally {
    release();
    if (registryLocks.get(key) === tail) registryLocks.delete(key);
  }
}

export class ApplicationRegistryStore {
  readonly applicationsRoot: string;
  readonly registryPath: string;
  private readonly repoRoot: string;
  private readonly stateRoot: string;
  private readonly registryDirectory: string;

  constructor(options: ApplicationRegistryStoreOptions) {
    const configuredRoot = options.applicationsRoot ?? process.env.AF_APPLICATIONS_ROOT;
    if (configuredRoot !== undefined && configuredRoot.trim() === "") {
      throw new ApplicationRegistryError(
        "invalid_applications_root",
        "AF_APPLICATIONS_ROOT는 비어 있지 않은 경로여야 합니다.",
      );
    }
    this.applicationsRoot = resolve(configuredRoot ?? join(homedir(), "work", "af-apps"));
    this.repoRoot = resolve(options.repoRoot);
    this.stateRoot = resolve(this.repoRoot, ".agent-factory");
    this.registryDirectory = resolve(this.stateRoot, "applications");
    this.registryPath = resolve(this.registryDirectory, "registry.json");
  }

  resolveApplicationRoot(applicationId: string): string {
    if (!APPLICATION_ID_PATTERN.test(applicationId)) {
      throw new ApplicationRegistryError(
        "invalid_application_id",
        "application_id는 소문자 영숫자로 시작하는 64자 이하 식별자여야 합니다.",
      );
    }
    const applicationRoot = resolve(this.applicationsRoot, applicationId);
    if (!isContained(this.applicationsRoot, applicationRoot)) {
      throw new ApplicationRegistryError(
        "application_path_escape",
        "application root가 AF_APPLICATIONS_ROOT 밖을 가리킵니다.",
      );
    }
    return applicationRoot;
  }

  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const held = heldRegistryLocks.getStore();
    if (held?.has(this.registryPath)) return operation();
    return runWithRegistryLock(this.registryPath, async () => {
      const nextHeld = new Set(held ?? []);
      nextHeld.add(this.registryPath);
      return heldRegistryLocks.run(nextHeld, operation);
    });
  }

  async loadSnapshot(): Promise<ApplicationRegistrySnapshot> {
    await this.assertRegistryDirectorySafe(false);
    let info;
    try {
      info = await lstat(this.registryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySnapshot();
      throw registryIoError(error, "Application Registry를 확인하지 못했습니다.");
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ApplicationRegistryError(
        "invalid_application_registry",
        "Application Registry는 symlink가 아닌 일반 파일이어야 합니다.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.registryPath, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ApplicationRegistryError(
          "invalid_application_registry",
          "Application Registry JSON이 올바르지 않습니다.",
        );
      }
      throw registryIoError(error, "Application Registry를 읽지 못했습니다.");
    }
    return parseSnapshot(parsed, this);
  }

  async register(registration: ApplicationRegistration): Promise<ApplicationRegistrySnapshot> {
    return this.withLock(async () => {
      const snapshot = await this.loadSnapshot();
      if (snapshot.applications.some((entry) => entry.application_id === registration.application_id)) {
        throw new ApplicationRegistryError(
          "application_id_conflict",
          `이미 등록된 application_id 입니다: ${registration.application_id}`,
        );
      }
      if (snapshot.applications.some((entry) => entry.work_id === registration.work_id)) {
        throw new ApplicationRegistryError(
          "work_id_conflict",
          `이미 등록된 work_id 입니다: ${registration.work_id}`,
        );
      }
      const validated = parseRegistration(registration, this, "registration");
      const next: ApplicationRegistrySnapshot = {
        schema_version: APPLICATION_REGISTRY_SCHEMA_VERSION,
        applications: [...snapshot.applications, validated]
          .sort((left, right) => left.application_id.localeCompare(right.application_id)),
      };
      await this.writeSnapshot(next);
      return next;
    });
  }

  private async writeSnapshot(snapshot: ApplicationRegistrySnapshot): Promise<void> {
    const registryDirectory = dirname(this.registryPath);
    const temporaryPath = join(registryDirectory, `.registry-${process.pid}-${randomUUID()}.tmp`);
    try {
      await this.assertRegistryDirectorySafe(false);
      await mkdir(registryDirectory, { recursive: true, mode: 0o700 });
      await this.assertRegistryDirectorySafe(true);
      await chmod(registryDirectory, 0o700);
      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporaryPath, this.registryPath);
      await chmod(this.registryPath, 0o600);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error instanceof ApplicationRegistryError) throw error;
      throw registryIoError(error, "Application Registry를 기록하지 못했습니다.");
    }
  }

  private async assertRegistryDirectorySafe(required: boolean): Promise<void> {
    const stateInfo = await lstatOrNull(this.stateRoot);
    if (!stateInfo) {
      if (required) {
        throw new ApplicationRegistryError(
          "invalid_application_registry_path",
          "Application Registry state directory가 존재하지 않습니다.",
        );
      }
      return;
    }
    if (stateInfo.isSymbolicLink() || !stateInfo.isDirectory()) {
      throw new ApplicationRegistryError(
        "invalid_application_registry_path",
        ".agent-factory는 symlink가 아닌 directory여야 합니다.",
      );
    }
    const registryInfo = await lstatOrNull(this.registryDirectory);
    if (!registryInfo) {
      if (required) {
        throw new ApplicationRegistryError(
          "invalid_application_registry_path",
          "Application Registry directory가 존재하지 않습니다.",
        );
      }
      return;
    }
    if (registryInfo.isSymbolicLink() || !registryInfo.isDirectory()) {
      throw new ApplicationRegistryError(
        "invalid_application_registry_path",
        "Application Registry parent는 symlink가 아닌 directory여야 합니다.",
      );
    }
    const [canonicalRepoRoot, canonicalRegistryDirectory] = await Promise.all([
      realpath(this.repoRoot),
      realpath(this.registryDirectory),
    ]);
    if (!isContained(canonicalRepoRoot, canonicalRegistryDirectory)) {
      throw new ApplicationRegistryError(
        "invalid_application_registry_path",
        "Application Registry path가 repository 밖을 가리킵니다.",
      );
    }
  }
}

function emptySnapshot(): ApplicationRegistrySnapshot {
  return { schema_version: APPLICATION_REGISTRY_SCHEMA_VERSION, applications: [] };
}

function parseSnapshot(value: unknown, store: ApplicationRegistryStore): ApplicationRegistrySnapshot {
  const record = expectObject(value, "Application Registry");
  expectExactKeys(record, ["schema_version", "applications"], "Application Registry");
  if (record.schema_version !== APPLICATION_REGISTRY_SCHEMA_VERSION || !Array.isArray(record.applications)) {
    throw new ApplicationRegistryError(
      "invalid_application_registry",
      "Application Registry schema_version 또는 applications가 올바르지 않습니다.",
    );
  }
  const applications = record.applications.map((entry, index) =>
    parseRegistration(entry, store, `applications[${index}]`));
  const applicationIds = new Set<string>();
  const workIds = new Set<string>();
  for (const entry of applications) {
    if (applicationIds.has(entry.application_id) || workIds.has(entry.work_id)) {
      throw new ApplicationRegistryError(
        "invalid_application_registry",
        "Application Registry에 중복 application_id 또는 work_id가 있습니다.",
      );
    }
    applicationIds.add(entry.application_id);
    workIds.add(entry.work_id);
  }
  return { schema_version: APPLICATION_REGISTRY_SCHEMA_VERSION, applications };
}

function parseRegistration(
  value: unknown,
  store: ApplicationRegistryStore,
  label: string,
): ApplicationRegistration {
  const record = expectObject(value, label);
  expectExactKeys(record, ["application_id", "application_root", "work_id", "created_at"], label);
  if (typeof record.application_id !== "string" || !APPLICATION_ID_PATTERN.test(record.application_id)
    || typeof record.work_id !== "string" || !APPLICATION_ID_PATTERN.test(record.work_id)) {
    throw new ApplicationRegistryError(
      "invalid_application_registry",
      `${label}의 application_id 또는 work_id가 올바르지 않습니다.`,
    );
  }
  if (typeof record.application_root !== "string" || !isAbsolute(record.application_root)
    || resolve(record.application_root) !== store.resolveApplicationRoot(record.application_id)) {
    throw new ApplicationRegistryError(
      "invalid_application_registry",
      `${label}의 application_root가 등록된 application_id와 일치하지 않습니다.`,
    );
  }
  if (typeof record.created_at !== "string" || !isExactIsoTimestamp(record.created_at)) {
    throw new ApplicationRegistryError(
      "invalid_application_registry",
      `${label}의 created_at이 ISO timestamp가 아닙니다.`,
    );
  }
  return {
    application_id: record.application_id,
    application_root: record.application_root,
    work_id: record.work_id,
    created_at: record.created_at,
  };
}

function isExactIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApplicationRegistryError("invalid_application_registry", `${label}는 JSON 객체여야 합니다.`);
  }
  return value as Record<string, unknown>;
}

function expectExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) {
    throw new ApplicationRegistryError(
      "invalid_application_registry",
      `${label} 필드가 정확한 Application Registry contract와 일치하지 않습니다.`,
    );
  }
}

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw registryIoError(error, `경로를 확인하지 못했습니다: ${path}`);
  }
}

function registryIoError(error: unknown, message: string): ApplicationRegistryError {
  const detail = error instanceof Error ? ` ${error.message}` : "";
  return new ApplicationRegistryError("application_registry_io_error", `${message}${detail}`);
}
