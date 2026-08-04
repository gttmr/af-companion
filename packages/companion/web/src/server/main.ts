import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ActiveAppWorkspaceController,
  createGraphControlServer,
  GraphControlWorkspace,
  type AssetCatalog,
  type GraphWorkspaceController,
} from "@agent-factory/companion-graph-control-server";
import type { VscodeLauncher } from "./vscode-launcher.js";
import { createReadOnlyAssetCatalog } from "./asset-catalog.js";
import { createCompanionWebRequestHandler } from "./web-routes.js";

export async function startCompanionWeb(options: {
  projectRoot?: string;
  applicationsRoot?: string;
  repoRoot?: string;
  mcpBinPath?: string;
  assetCatalog?: AssetCatalog;
  host?: string;
  port?: number;
  staticRoot?: string;
  vscodeLauncher?: VscodeLauncher;
}): Promise<{ origin: string; close(): Promise<void> }> {
  const companionRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  const repoRoot = resolve(options.repoRoot ?? resolve(companionRoot, "../.."));
  let workspace: GraphWorkspaceController;
  let appController: ActiveAppWorkspaceController | undefined;
  if (options.projectRoot) workspace = new GraphControlWorkspace({ projectRoot: options.projectRoot });
  else {
    const assetCatalog = options.assetCatalog ?? await createReadOnlyAssetCatalog(
      resolve(repoRoot, "catalog/asset-registry.json"),
      resolve(repoRoot, "packages/agent-factory-core/src/assetRegistry.ts"),
    );
    appController = new ActiveAppWorkspaceController({
      ...(options.applicationsRoot ? { applicationsRoot: options.applicationsRoot } : {}),
      mcpBinPath: options.mcpBinPath ?? resolve(companionRoot, "mcp-plane/dist/bin.js"),
      assetCatalog,
    });
    workspace = appController;
  }
  const server = createGraphControlServer({
    workspace,
    staticRoot: options.staticRoot,
    additionalRequestHandler: createCompanionWebRequestHandler({
      ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
      ...(appController ? { appController, getProjectRoot: () => appController!.activeProjectRoot() } : {}),
      ...(options.vscodeLauncher ? { vscodeLauncher: options.vscodeLauncher } : {}),
    }),
  });
  const listening = await server.listen(options.port ?? 8890, options.host ?? "127.0.0.1");
  return { origin: listening.origin, close: () => server.close() };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const running = await startCompanionWeb({
    ...(args.get("project-root") || process.env.COMPANION_PROJECT_ROOT ? { projectRoot: args.get("project-root") ?? process.env.COMPANION_PROJECT_ROOT } : {}),
    ...(args.get("applications-root") || process.env.COMPANION_APPLICATIONS_ROOT ? { applicationsRoot: args.get("applications-root") ?? process.env.COMPANION_APPLICATIONS_ROOT } : {}),
    repoRoot: args.get("repo-root") ?? process.env.COMPANION_REPO_ROOT ?? resolve(fileURLToPath(new URL("../../../../../", import.meta.url))),
    host: args.get("host") ?? process.env.COMPANION_HOST ?? "127.0.0.1",
    port: Number(args.get("port") ?? process.env.COMPANION_PORT ?? 8890),
    staticRoot: args.get("static-root") ?? resolve(fileURLToPath(new URL("../../browser", import.meta.url))),
  });
  process.stdout.write(`Companion Graph Control: ${running.origin}\n`);
  const shutdown = async () => { await running.close(); process.exitCode = 0; };
  process.once("SIGINT", () => void shutdown()); process.once("SIGTERM", () => void shutdown());
}

function parseArgs(args: string[]): Map<string, string> { const result = new Map<string, string>(); for (let index = 0; index < args.length; index += 2) { const key = args[index]; const value = args[index + 1]; if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`Expected --name value, received ${key ?? "<end>"}`); result.set(key.slice(2), value); } return result; }
const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entry === import.meta.url) await main();
