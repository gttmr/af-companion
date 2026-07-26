import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { ArtifactRootStore } from "./artifactRootStore.ts";
import { WorkspaceProjection, WorkspaceProjectionError } from "./workspaceProjection.ts";

const execFileAsync = promisify(execFile);

test("projects Work Items, Git changes, diffs, and metadata-only filesystem activity", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-workspace-projection-"));
  await mkdir(join(repoRoot, "packages", "sample"), { recursive: true });
  await writeFile(join(repoRoot, "packages", "sample", "tracked.ts"), "export const value = 1;\n", "utf8");
  await writeFile(join(repoRoot, ".gitignore"), ".agent-factory/\n", "utf8");
  const store = new ArtifactRootStore({ repoRoot });
  await store.createWorkItem("req-projection");
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "projection@example.invalid"]);
  await git(repoRoot, ["config", "user.name", "Projection Test"]);
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "fixture"]);
  await git(repoRoot, ["branch", "-M", "main"]);
  await writeFile(join(repoRoot, "packages", "sample", "tracked.ts"), "export const value = 2;\n", "utf8");
  await writeFile(join(repoRoot, "packages", "sample", "new.ts"), "export const fresh = true;\n", "utf8");

  const projection = new WorkspaceProjection(repoRoot, { now: () => new Date("2030-01-01T00:00:00.000Z") });
  t.after(async () => {
    await projection.stop();
    await rm(repoRoot, { recursive: true, force: true });
  });
  await projection.start();
  const snapshot = await projection.snapshot();
  assert.equal(snapshot.identity.display_name, repoRoot.split("/").pop());
  assert.equal(snapshot.identity.git_branch, "main");
  assert.deepEqual(snapshot.work_items.map((item) => item.work_id), ["req-projection"]);
  assert.equal(snapshot.changes.find((entry) => entry.path === "packages/sample/tracked.ts")?.status, "modified");
  assert.equal(snapshot.changes.find((entry) => entry.path === "packages/sample/new.ts")?.status, "added");
  assert.match((await projection.diff("packages/sample/tracked.ts")).diff, /value = 2/);
  assert.match((await projection.diff("packages/sample/new.ts")).diff, /fresh = true/);

  const activityPromise = new Promise<void>((resolveActivity, rejectActivity) => {
    const timer = setTimeout(() => rejectActivity(new Error("filesystem activity timeout")), 5_000);
    const unsubscribe = projection.subscribe((event) => {
      if (event.activity?.path === "packages/sample/secret.ts") {
        clearTimeout(timer);
        unsubscribe();
        assert.equal(event.activity.kind, "source");
        assert.equal(JSON.stringify(event.activity).includes("do-not-persist-this-content"), false);
        resolveActivity();
      }
    });
  });
  await writeFile(join(repoRoot, "packages", "sample", "secret.ts"), "do-not-persist-this-content\n", "utf8");
  await activityPromise;

  const codexActivityPromise = new Promise<void>((resolveActivity, rejectActivity) => {
    const timer = setTimeout(() => rejectActivity(new Error("Companion v2 activity timeout")), 5_000);
    const unsubscribe = projection.subscribe((event) => {
      if (event.activity?.kind === "codex") {
        clearTimeout(timer);
        unsubscribe();
        assert.equal(event.activity.action, "Bash · tool_start");
        assert.equal(event.activity.path, null);
        resolveActivity();
      }
    });
  });
  const bridgeStateDir = join(repoRoot, ".agent-factory", "codex-bridge", "v2");
  await mkdir(bridgeStateDir, { recursive: true });
  await writeFile(join(bridgeStateDir, "state.json"), `${JSON.stringify({
    schema_version: 2,
    activities: [{ activity_id: "activity-1", event: "tool_start", tool_name: "Bash" }],
  })}\n`, "utf8");
  await codexActivityPromise;
  await writeFile(join(bridgeStateDir, "state.json"), `${JSON.stringify({
    schema_version: 2,
    activities: [{ activity_id: "activity-1", event: "tool_start", tool_name: "Bash" }],
    handoffs: [],
  })}\n`, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await projection.snapshot()).activities.filter((activity) => activity.kind === "codex").length, 1);

  await assert.rejects(
    projection.diff("../outside"),
    (error: unknown) => error instanceof WorkspaceProjectionError && error.code === "path_outside_workspace",
  );
});

async function git(repoRoot: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8" });
}
