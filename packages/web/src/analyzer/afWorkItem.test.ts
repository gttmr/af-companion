import assert from "node:assert/strict";
import test from "node:test";

import {
  createAfWorkItemManifest,
  parseAfWorkItemManifest,
  serializeAfWorkItemManifest,
} from "./afWorkItem.ts";

test("creates a strict four-skill Work Item with no implicit approval", () => {
  const manifest = createAfWorkItemManifest("req-live", new Date("2030-01-01T00:00:00.000Z"));
  assert.equal(manifest.work_id, "req-live");
  assert.equal(manifest.artifact_root, "artifacts/af/req-live");
  assert.equal(manifest.active_skill, null);
  assert.deepEqual(Object.keys(manifest.skills), [
    "af-discover-assets",
    "af-compose-solution",
    "af-scaffold-runtime",
    "af-verify-runtime",
  ]);
  assert.equal(manifest.review_gates.discovery.status, "pending");
  assert.equal(manifest.review_gates.composition.status, "pending");
  assert.equal(manifest.verification.outcome, null);
  assert.deepEqual(parseAfWorkItemManifest(serializeAfWorkItemManifest(manifest)), manifest);
});

test("requires decision metadata for a reviewed gate", () => {
  const manifest = createAfWorkItemManifest("req-gate");
  manifest.review_gates.discovery.status = "approved";
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /artifact_etag, decided_at, session_id, turn_id/,
  );
});

test("refuses Compose before discovery approval", () => {
  const manifest = createAfWorkItemManifest("req-order");
  manifest.active_skill = "af-compose-solution";
  manifest.skills["af-compose-solution"].status = "active";
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /Compose 시작에는 approved discovery/);
});

test("refuses unknown lifecycle fields instead of backfilling legacy state", () => {
  const manifest = createAfWorkItemManifest("req-legacy") as unknown as Record<string, unknown>;
  manifest.current_stage = "design";
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /알 수 없는 필드.*current_stage/);
});

test("requires a complete scaffold before Verify starts", () => {
  const manifest = createAfWorkItemManifest("req-verify-order");
  const at = "2030-01-01T00:00:00.000Z";
  const complete = (skill: "af-discover-assets" | "af-compose-solution") => {
    manifest.skills[skill] = {
      ...manifest.skills[skill],
      status: "complete",
      started_at: at,
      updated_at: at,
      completed_at: at,
      input_revision: "input",
      output_revision: "output",
    };
  };
  const approved = { status: "approved" as const, artifact_etag: "a".repeat(64), decided_at: at, session_id: "session", turn_id: "turn" };
  complete("af-discover-assets");
  complete("af-compose-solution");
  manifest.review_gates.discovery = approved;
  manifest.review_gates.composition = approved;
  manifest.active_skill = "af-verify-runtime";
  manifest.skills["af-verify-runtime"] = { ...manifest.skills["af-verify-runtime"], status: "active", started_at: at, updated_at: at };
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /Verify 시작에는 complete af-scaffold-runtime/);
});

test("requires passed evidence for a complete Verify skill", () => {
  const manifest = createAfWorkItemManifest("req-verify-outcome");
  const at = "2030-01-01T00:00:00.000Z";
  const complete = (skill: "af-discover-assets" | "af-compose-solution" | "af-scaffold-runtime" | "af-verify-runtime") => {
    manifest.skills[skill] = {
      ...manifest.skills[skill],
      status: "complete",
      started_at: at,
      updated_at: at,
      completed_at: at,
      input_revision: "input",
      output_revision: "output",
    };
  };
  complete("af-discover-assets");
  complete("af-compose-solution");
  complete("af-scaffold-runtime");
  complete("af-verify-runtime");
  const approved = { status: "approved" as const, artifact_etag: "a".repeat(64), decided_at: at, session_id: "session", turn_id: "turn" };
  manifest.review_gates.discovery = approved;
  manifest.review_gates.composition = approved;
  manifest.active_skill = "af-verify-runtime";
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /complete af-verify-runtime에는 passed/);
});
