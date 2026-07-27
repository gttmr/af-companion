import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeContextRevision, findProjectContext, validateContext } from "../src/context.mjs";
import { fixture } from "./fixture.mjs";

test("strict context accepts a portable current snapshot", () => {
  const value = fixture();
  assert.deepEqual(validateContext(value), value);
});

test("context revision identifies evidence rather than export time", () => {
  const first = fixture();
  const second = fixture({ generated_at: "2026-07-27T01:00:00.000Z" });
  assert.equal(first.context_revision, second.context_revision);
});

test("context rejects stale bytes and machine-local paths", () => {
  const stale = fixture();
  stale.current.ledger_revision = 2;
  assert.throws(() => validateContext(stale), /context_revision mismatch/);

  const localPath = fixture();
  localPath.evidence.handbook[0].summary = "read /tmp/private-state";
  localPath.context_revision = computeContextRevision(localPath);
  assert.throws(() => validateContext(localPath), /machine-local path is forbidden/);

  for (const candidate of [
    "file:///tmp/private-state",
    "path=/home/alice/private-state",
    "/mnt/c/Users/alice/private-state",
  ]) {
    const encodedLocalPath = fixture();
    encodedLocalPath.evidence.handbook[0].summary = candidate;
    encodedLocalPath.context_revision = computeContextRevision(encodedLocalPath);
    assert.throws(() => validateContext(encodedLocalPath), /machine-local path is forbidden/);
  }
});

test("context rejects session or turn provenance fields", () => {
  const value = fixture();
  value.current.session_id = "invented";
  value.context_revision = computeContextRevision(value);
  assert.throws(() => validateContext(value), /strict contract|unsupported provenance/);
});

test("project context discovery supports descendants and fails closed on an unsafe pair", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-context-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".agent-factory"));
  await mkdir(join(root, ".codex"));
  await mkdir(join(root, "src", "nested"), { recursive: true });
  await writeFile(join(root, ".agent-factory", "af-context.json"), "{}\n");
  await writeFile(join(root, ".codex", "config.toml"), "[mcp_servers.agent_factory]\n");
  assert.equal(await findProjectContext(join(root, "src", "nested")), join(root, ".agent-factory", "af-context.json"));

  const unsafe = join(root, "unsafe");
  await mkdir(join(unsafe, ".agent-factory"), { recursive: true });
  await mkdir(join(unsafe, ".codex"));
  await symlink(join(root, ".agent-factory", "af-context.json"), join(unsafe, ".agent-factory", "af-context.json"));
  await writeFile(join(unsafe, ".codex", "config.toml"), "[mcp_servers.agent_factory]\n");
  await assert.rejects(() => findProjectContext(unsafe), /incomplete or unsafe/);
});
