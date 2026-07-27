import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { ArtifactRootStore } from "./artifactRootStore.ts";
import { ApplicationRegistryStore } from "./applicationRegistryStore.ts";
import { WorkspaceProjection, WorkspaceProjectionError } from "./workspaceProjection.ts";

const execFileAsync = promisify(execFile);

test("projects Work Items, Git changes, diffs, and metadata-only filesystem activity", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-workspace-projection-"));
  const applicationsRoot = await mkdtemp(join(tmpdir(), "af-workspace-applications-"));
  const applicationRoot = join(applicationsRoot, "projection-app");
  await mkdir(join(repoRoot, "packages", "sample"), { recursive: true });
  await mkdir(applicationRoot, { recursive: true });
  await writeFile(join(repoRoot, "packages", "sample", "tracked.ts"), "export const value = 1;\n", "utf8");
  await writeFile(join(repoRoot, ".gitignore"), ".agent-factory/\n", "utf8");
  const store = new ArtifactRootStore({ repoRoot });
  await store.createWorkItem("req-projection");
  const applicationRegistry = new ApplicationRegistryStore({ repoRoot, applicationsRoot });
  await applicationRegistry.register({
    application_id: "projection-app",
    application_root: applicationRoot,
    work_id: "req-projection",
    created_at: "2030-01-01T00:00:00.000Z",
  });
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "projection@example.invalid"]);
  await git(repoRoot, ["config", "user.name", "Projection Test"]);
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "fixture"]);
  await git(repoRoot, ["branch", "-M", "main"]);
  await writeFile(join(repoRoot, "packages", "sample", "tracked.ts"), "export const value = 2;\n", "utf8");
  await writeFile(join(repoRoot, "packages", "sample", "new.ts"), "export const fresh = true;\n", "utf8");

  const projection = new WorkspaceProjection(repoRoot, {
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    applicationsRoot,
  });
  t.after(async () => {
    await projection.stop();
    await rm(repoRoot, { recursive: true, force: true });
    await rm(applicationsRoot, { recursive: true, force: true });
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

  const releaseApplicationWatch = await projection.watchApplication("req-projection");
  const applicationSourceStartedAt = Date.now();
  const applicationSourcePromise = new Promise<void>((resolveActivity, rejectActivity) => {
    const timer = setTimeout(() => rejectActivity(new Error("application source activity timeout")), 2_000);
    const unsubscribe = projection.subscribe((event) => {
      if (event.activity?.kind === "application_source" && event.activity.path === "src/agent.ts") {
        clearTimeout(timer);
        unsubscribe();
        assert.equal(event.activity.action, "created");
        assert.equal(event.activity.work_id, "req-projection");
        assert.ok(Date.now() - applicationSourceStartedAt < 2_000);
        resolveActivity();
      }
    });
  });
  await mkdir(join(applicationRoot, "src"), { recursive: true });
  await writeFile(join(applicationRoot, "src", "agent.ts"), "export const agent = true;\n", "utf8");
  await applicationSourcePromise;
  let ignoredDependencyActivity = false;
  const unsubscribeIgnored = projection.subscribe((event) => {
    if (event.activity?.kind === "application_source" && event.activity.path?.includes("node_modules")) {
      ignoredDependencyActivity = true;
    }
  });
  await mkdir(join(applicationRoot, "node_modules", "ignored"), { recursive: true });
  await writeFile(join(applicationRoot, "node_modules", "ignored", "index.js"), "ignored\n", "utf8");
  await new Promise((resolve) => setTimeout(resolve, 350));
  unsubscribeIgnored();
  assert.equal(ignoredDependencyActivity, false);
  await releaseApplicationWatch();
  assert.equal((await projection.snapshot()).activities.some((activity) => (
    activity.kind === "application_source"
    && activity.work_id === "req-projection"
    && activity.path === "src/agent.ts"
  )), true);

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

test("refuses a registered application root whose realpath escapes the applications root", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-workspace-projection-escape-"));
  const applicationsRoot = await mkdtemp(join(tmpdir(), "af-workspace-applications-escape-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "af-workspace-outside-"));
  const linkedRoot = join(applicationsRoot, "escaped-app");
  await writeFile(join(repoRoot, ".gitignore"), ".agent-factory/\n", "utf8");
  await symlink(outsideRoot, linkedRoot, "dir");
  const registry = new ApplicationRegistryStore({ repoRoot, applicationsRoot });
  await registry.register({
    application_id: "escaped-app",
    application_root: linkedRoot,
    work_id: "escaped-work",
    created_at: "2030-01-01T00:00:00.000Z",
  });
  const projection = new WorkspaceProjection(repoRoot, { applicationsRoot });
  t.after(async () => {
    await projection.stop();
    await rm(repoRoot, { recursive: true, force: true });
    await rm(applicationsRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  });
  await assert.rejects(
    projection.watchApplication("escaped-work"),
    (error: unknown) => error instanceof WorkspaceProjectionError && error.code === "application_path_outside_root",
  );
});

test("adds a Work Item root created after the projection watcher starts", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-workspace-projection-late-work-"));
  await writeFile(join(repoRoot, ".gitignore"), ".agent-factory/\n", "utf8");
  const projection = new WorkspaceProjection(repoRoot);
  t.after(async () => {
    await projection.stop();
    await rm(repoRoot, { recursive: true, force: true });
  });
  await projection.start();
  const store = new ArtifactRootStore({ repoRoot });
  await store.createWorkItem("late-work");
  await projection.includeWorkItemRoot("late-work");
  await new Promise((resolve) => setTimeout(resolve, 100));

  const activityPromise = new Promise<void>((resolveActivity, rejectActivity) => {
    const timer = setTimeout(() => rejectActivity(new Error("late Work Item activity timeout")), 2_000);
    const unsubscribe = projection.subscribe((event) => {
      if (event.activity?.path === "artifacts/af/late-work/af-work-item.json") {
        clearTimeout(timer);
        unsubscribe();
        assert.equal(event.activity.kind, "artifact");
        assert.equal(event.activity.action, "modified");
        assert.equal(event.activity.work_id, "late-work");
        resolveActivity();
      }
    });
  });
  const workItemPath = join(repoRoot, "artifacts", "af", "late-work", "af-work-item.json");
  const body = await readFile(workItemPath, "utf8");
  await writeFile(workItemPath, body.replace('"ledger_revision": 0', '"ledger_revision": 1'), "utf8");
  await activityPromise;
});

async function git(repoRoot: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8" });
}
