import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { probeInstalledCodexVersion } from "./codexBridgeMain.ts";

test("installed Codex version probe uses an argv-only process and fails safely", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fakeCodex = join(root, "codex");
  await writeFile(fakeCodex, "#!/bin/sh\nprintf 'codex-cli 9.8.7\\n'\n", { mode: 0o700 });
  await chmod(fakeCodex, 0o700);

  assert.equal(await probeInstalledCodexVersion(fakeCodex), "9.8.7");
  assert.equal(await probeInstalledCodexVersion(join(root, "missing-codex")), null);

  const localBin = join(root, "node_modules/.bin");
  const externalBin = join(root, "bin");
  await mkdir(localBin, { recursive: true });
  await mkdir(externalBin, { recursive: true });
  await writeFile(join(localBin, "codex"), "#!/bin/sh\nprintf 'codex-cli 0.1.0\\n'\n", { mode: 0o700 });
  await writeFile(join(externalBin, "codex"), "#!/bin/sh\nprintf 'codex-cli 9.8.7\\n'\n", { mode: 0o700 });
  assert.equal(
    await probeInstalledCodexVersion("codex", { PATH: `${localBin}:${externalBin}` }),
    "9.8.7",
    "npm-local Codex binaries must not masquerade as the external CLI capability",
  );
});
