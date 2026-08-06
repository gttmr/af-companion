import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = new Set();
let shuttingDown = false;
let requestedExitCode = 0;
let resolveRun = null;

if (isMainModule()) {
  try { await runLauncher(); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); await shutdown(1); }
}

async function runLauncher() {
  await assertPortAvailable(8890);
  await assertPortAvailable(8894);
  const serverArgs = ["run", "server", "-w", "@agent-factory/companion-web", "--", "--host", "127.0.0.1", "--port", "8894"];
  if (process.env.COMPANION_APPLICATIONS_ROOT) serverArgs.push("--applications-root", resolve(process.env.COMPANION_APPLICATIONS_ROOT));
  const api = launch(serverArgs);
  const web = launch(["run", "dev", "-w", "@agent-factory/companion-web"]);
  process.once("SIGINT", () => requestShutdown(0));
  process.once("SIGTERM", () => requestShutdown(0));
  monitorChild(api); monitorChild(web);
  await waitForServices([
    { label: "Companion API", url: "http://127.0.0.1:8894/api/companion/v2/health", child: api },
    { label: "Companion Web", url: "http://127.0.0.1:8890/", child: web },
  ]);
  process.stdout.write(["", "Companion App Manager 준비 완료", "  Web: http://127.0.0.1:8890/", `  App root: ${resolve(process.env.COMPANION_APPLICATIONS_ROOT ?? `${process.env.HOME}/work/af-companion-apps`)}`, "  화면에서 App을 만들거나 선택한 뒤 VS Code를 여세요.", ""].join("\n"));
  await new Promise((resolvePromise) => { resolveRun = resolvePromise; });
  await shutdown(requestedExitCode);
}

function isMainModule() { return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href; }
function launch(args) { const child = spawn("npm", args, { cwd: workspaceRoot, env: process.env, stdio: "inherit" }); children.add(child); return child; }
function monitorChild(child) { child.once("exit", (code, signal) => { if (shuttingDown) return; process.stderr.write(`Companion child process stopped (${signal ? `signal ${signal}` : `code ${code ?? 1}`}).\n`); requestShutdown(code ?? 1); }); }
function requestShutdown(code) { requestedExitCode = code; if (resolveRun) resolveRun(); else void shutdown(code); }

async function assertPortAvailable(port) {
  await new Promise((resolvePromise, reject) => { const probe = createServer(); probe.unref(); probe.once("error", (error) => reject(error?.code === "EADDRINUSE" ? new Error(`Reserved port ${port} is already in use.`) : error)); probe.listen(port, "127.0.0.1", () => probe.close(resolvePromise)); });
}

export async function waitForServices(services, options = {}) { await Promise.all(services.map((service) => waitForHealth(service, options))); }
async function waitForHealth(service, options) {
  const timeoutMs = options.timeoutMs ?? 15_000; const pollIntervalMs = options.pollIntervalMs ?? 100; const requestTimeoutMs = options.requestTimeoutMs ?? 1_000; const fetchImpl = options.fetchImpl ?? fetch; const now = options.now ?? Date.now; const sleep = options.sleep ?? ((delay) => new Promise((resolvePromise) => setTimeout(resolvePromise, delay))); const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (service.child.exitCode !== null || (service.child.signalCode ?? null) !== null) throw new Error(`${service.label} stopped before becoming healthy.`);
    const remaining = deadline - now();
    try { const response = await fetchImpl(service.url, { signal: AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, remaining))) }); if (response.ok) return; } catch { /* retry until bounded deadline */ }
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - now())));
  }
  throw new Error(`${service.label} did not become healthy: ${service.url}`);
}

async function shutdown(code) {
  if (shuttingDown) return; shuttingDown = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all([...children].map((child) => new Promise((resolvePromise) => { if (child.exitCode !== null) resolvePromise(); else child.once("exit", resolvePromise); })));
  process.exitCode = code;
}
