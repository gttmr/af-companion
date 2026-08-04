import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { VscodeLaunchError, VscodeProjectLauncher } from "../../src/server/vscode-launcher.js";

test("launches a trusted external code executable with the canonical project root", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "companion-code-"));
  const projectRoot = join(base, "project");
  const binRoot = join(base, "host-bin");
  const logPath = join(base, "code.log");
  await mkdir(projectRoot);
  await mkdir(binRoot);
  const executable = join(binRoot, "code");
  await writeFile(executable, `#!${process.execPath}\n`
    + `const fs = require("node:fs");\n`
    + `if (process.argv[2] === "--version") process.stdout.write("1.99.0\\n");\n`
    + `else if (process.argv[2] === "--list-extensions") process.stdout.write("openai.chatgpt@9.8.7\\n");\n`
    + `else fs.appendFileSync(process.env.CODE_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\n`, "utf8");
  await chmod(executable, 0o755);
  t.after(() => rm(base, { recursive: true, force: true }));

  const launcher = new VscodeProjectLauncher(projectRoot, {
    env: { ...process.env, PATH: `${binRoot}${delimiter}${process.env.PATH ?? ""}`, CODE_LOG: logPath },
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
  const receipt = await launcher.launch();

  assert.equal(receipt.workspace_path, projectRoot);
  assert.equal(receipt.codex_extension_installed, true);
  assert.equal(receipt.codex_extension_version, "9.8.7");
  assert.deepEqual(JSON.parse((await readFile(logPath, "utf8")).trim()), ["--new-window", projectRoot]);
});

test("does not trust a code executable contained by the project", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "companion-contained-code-"));
  const binRoot = join(projectRoot, "bin");
  await mkdir(binRoot);
  const executable = join(binRoot, "code");
  await writeFile(executable, `#!${process.execPath}\n`, "utf8");
  await chmod(executable, 0o755);
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const launcher = new VscodeProjectLauncher(projectRoot, { env: { PATH: binRoot } });
  await assert.rejects(() => launcher.launch(), (error: unknown) => {
    assert.ok(error instanceof VscodeLaunchError);
    assert.equal(error.code, "code_unavailable");
    return true;
  });
});
