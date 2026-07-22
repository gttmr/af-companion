import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { startCodexBridgeServer, type RunningCodexBridgeServer } from "./codexBridgeServer.ts";

const execFileAsync = promisify(execFile);

export async function probeInstalledCodexVersion(
  command = "codex",
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  try {
    const executable = await resolveExternalCodexCommand(command, env);
    const { stdout } = await execFileAsync(executable, ["--version"], {
      encoding: "utf8",
      maxBuffer: 16 * 1_024,
      shell: false,
      timeout: 1_000,
      windowsHide: true,
    });
    const match = /^codex-cli\s+(\S+)\s*$/i.exec(stdout.trim());
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseRepoRoot(argv: string[]): string {
  if (argv.length === 1 && !argv[0].startsWith("-")) return resolve(argv[0]);
  const index = argv.indexOf("--repo-root");
  if (index >= 0 && typeof argv[index + 1] === "string" && argv[index + 1].length > 0) return resolve(argv[index + 1]);
  throw new Error("Usage: codexBridgeMain.ts --repo-root <absolute-repository-path>");
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return 0;
  if (!/^\d+$/.test(value)) throw new Error("AF_CODEX_BRIDGE_PORT must be an integer from 0 to 65535");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) throw new Error("AF_CODEX_BRIDGE_PORT must be an integer from 0 to 65535");
  return port;
}

export async function runCodexBridgeMain(argv = process.argv.slice(2), env = process.env): Promise<RunningCodexBridgeServer> {
  const codexVersion = await probeInstalledCodexVersion(env.AF_CODEX_BIN ?? "codex", env);
  return startCodexBridgeServer({
    repoRoot: parseRepoRoot(argv),
    port: parsePort(env.AF_CODEX_BRIDGE_PORT),
    codexVersion,
  });
}

async function resolveExternalCodexCommand(command: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) return command;
  const candidates: string[] = [];
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    if (await access(candidate, fsConstants.X_OK).then(() => true, () => false)) candidates.push(candidate);
  }
  if (candidates.length === 0) return command;
  return candidates.find((candidate) => !candidate.includes(`${sep}node_modules${sep}.bin${sep}`)) ?? candidates[0];
}

async function main(): Promise<void> {
  const running = await runCodexBridgeMain();
  process.stdout.write(
    `Codex Bridge ready at ${running.endpoint.url} (Codex ${running.store.capabilities().codex_version ?? "unknown"})\n`,
  );
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void running.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Codex Bridge failed to start: ${message}\n`);
    process.exitCode = 1;
  });
}
