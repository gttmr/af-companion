import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startCompanionWeb } from "../../src/server/main.js";

test("startup creates project-contained capability and survives restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "companion-start-")); const first = await startCompanionWeb({ projectRoot: root, port: 0 }); const before = await (await fetch(`${first.origin}/api/companion/v2/workspace`)).json() as { graph_revision: string }; await first.close();
  const capability = JSON.parse(await readFile(join(root, ".agent-factory", "companion-capability.json"), "utf8")) as { origin: string; token: string }; assert.match(capability.origin, /^http:\/\/127\.0\.0\.1:/); assert.match(capability.token, /^[a-f0-9]{64}$/);
  const second = await startCompanionWeb({ projectRoot: root, port: 0 }); const after = await (await fetch(`${second.origin}/api/companion/v2/workspace`)).json() as { graph_revision: string }; assert.equal(after.graph_revision, before.graph_revision); await second.close(); await rm(root, { recursive: true, force: true });
});
