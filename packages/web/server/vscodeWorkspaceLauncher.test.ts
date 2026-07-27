import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveHostCodeExecutable,
  VscodeWorkspaceLauncher,
} from "./vscodeWorkspaceLauncher.ts";

test("probes a trusted host executable once per cache window and launches with fixed argv", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "af-vscode-launcher-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const repoRoot = join(base, "repo");
  const binDir = join(base, "host-bin");
  const logPath = join(base, "code-argv.jsonl");
  await mkdir(repoRoot);
  await mkdir(binDir);
  await writeFile(join(repoRoot, "agent.py"), "print('hello')\n", "utf8");
  const executable = join(binDir, "code");
  await writeFile(executable, `#!${process.execPath}\n`
    + `const { appendFileSync } = require("node:fs");\n`
    + `appendFileSync(process.env.CODE_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\n`
    + `if (process.argv[2] === "--version") process.stdout.write("1.99.0\\ncommit\\nx64\\n");\n`
    + `if (process.argv[2] === "--list-extensions") process.stdout.write("openai.chatgpt@0.4.2\\nother.extension@1.0.0\\n");\n`
    + `if (process.argv[2] === "--new-window") setTimeout(() => {}, 500);\n`, "utf8");
  await chmod(executable, 0o755);
  const env = {
    ...process.env,
    PATH: binDir,
    CODE_ARGV_LOG: logPath,
    WSL_DISTRO_NAME: "Ubuntu",
  };
  const launcher = new VscodeWorkspaceLauncher(repoRoot, {
    env,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    probeCacheMs: 60_000,
    commandTimeoutMs: 250,
    launchTimeoutMs: 2_000,
    launchCooldownMs: 10_000,
  });

  const firstProbe = await launcher.probe();
  const cachedProbe = await launcher.probe();
  assert.deepEqual(cachedProbe, firstProbe);
  assert.deepEqual(firstProbe, {
    code_available: true,
    code_version: "1.99.0",
    wsl_environment: true,
    codex_extension_installed: true,
    codex_extension_version: "0.4.2",
    launch_supported: true,
    probed_at: "2030-01-01T00:00:00.000Z",
  });

  const receipt = await launcher.launch();
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.workspace_path, repoRoot);
  const fileReceipt = await launcher.openFile("agent.py", 7);
  assert.equal(fileReceipt.mode, "file");
  const diffReceipt = await launcher.openDiff("agent.py");
  assert.equal(diffReceipt.mode, "diff");
  const invocations = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(invocations.slice(0, 3), [
    ["--version"],
    ["--list-extensions", "--show-versions"],
    ["--new-window", repoRoot],
  ]);
  assert.deepEqual(invocations[3], ["--reuse-window", "--goto", join(repoRoot, "agent.py") + ":7"]);
  assert.equal(invocations[4][0], "--reuse-window");
  assert.equal(invocations[4][1], "--diff");
  assert.match(invocations[4][2], /\.agent-factory\/editor-diffs\/.*\.HEAD\.agent\.py$/);
  assert.equal(invocations[4][3], join(repoRoot, "agent.py"));
  await assert.rejects(launcher.launch(), /cooling down/);
  await assert.rejects(launcher.openFile("../outside.py"), /Workspace 밖/);
});

test("rejects a code executable contained inside the repository", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-vscode-repo-bin-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const binDir = join(repoRoot, "bin");
  const markerPath = join(repoRoot, "executed");
  await mkdir(binDir);
  const executable = join(binDir, "code");
  await writeFile(executable, `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "bad");\n`, "utf8");
  await chmod(executable, 0o755);
  const env = { ...process.env, PATH: binDir };

  assert.equal(await resolveHostCodeExecutable(repoRoot, env), null);
  const probe = await new VscodeWorkspaceLauncher(repoRoot, { env }).probe();
  assert.equal(probe.code_available, false);
  assert.equal(probe.launch_supported, false);
  await assert.rejects(readFile(markerPath), /ENOENT/);
});

test("generates a private multi-root session workspace and launches only that descriptor", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "af-vscode-session-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const repoRoot = join(base, "factory");
  const applicationsRoot = join(base, "applications");
  const applicationRoot = join(applicationsRoot, "sample-app");
  const binDir = join(base, "host-bin");
  const logPath = join(base, "code-argv.jsonl");
  await mkdir(repoRoot);
  await mkdir(applicationRoot, { recursive: true });
  await mkdir(binDir);
  const executable = join(binDir, "code");
  await writeFile(executable, `#!${process.execPath}\n`
    + `const { appendFileSync } = require("node:fs");\n`
    + `appendFileSync(process.env.CODE_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\n`
    + `if (process.argv[2] === "--version") process.stdout.write("1.130.0\\ncommit\\nx64\\n");\n`, "utf8");
  await chmod(executable, 0o755);
  const launcher = new VscodeWorkspaceLauncher(repoRoot, {
    env: {
      ...process.env,
      PATH: binDir,
      CODE_ARGV_LOG: logPath,
      WSL_DISTRO_NAME: "Ubuntu",
    },
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });

  const receipt = await launcher.launchSessionWorkspace({
    applicationId: "sample-app",
    applicationRoot,
    applicationsRoot,
    workId: "sample-work",
    role: "plan",
  });

  assert.equal(receipt.workspace_path, join(repoRoot, ".agent-factory", "vscode", "sample-work.code-workspace"));
  assert.equal((await lstat(receipt.workspace_path)).mode & 0o777, 0o600);
  assert.equal((await lstat(join(repoRoot, ".agent-factory", "vscode"))).mode & 0o777, 0o700);
  const descriptor = JSON.parse(await readFile(receipt.workspace_path, "utf8"));
  assert.deepEqual(descriptor.folders, [
    { name: "sample-app", path: applicationRoot },
    { name: "Agent Factory (factory)", path: repoRoot },
  ]);
  assert.deepEqual(descriptor.settings, { "task.allowAutomaticTasks": "on" });
  assert.deepEqual(descriptor.tasks, {
    version: "2.0.0",
    tasks: [{
      label: "Start AF Session",
      type: "shell",
      command: "node",
      args: [
        join(repoRoot, "scripts", "af.mjs"),
        "companion",
        "vscode-start",
        "--application",
        "sample-app",
        "--work",
        "sample-work",
        "--role",
        "plan",
        "--application-root",
        applicationRoot,
      ],
      options: { cwd: repoRoot },
      presentation: { reveal: "always", panel: "dedicated", focus: true },
      runOptions: { runOn: "folderOpen" },
      group: { kind: "build", isDefault: true },
      problemMatcher: [],
    }],
  });
  const invocations = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(invocations, [
    ["--version"],
    ["--list-extensions", "--show-versions"],
    ["--new-window", receipt.workspace_path],
  ]);
});
