import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createAfWorkItemManifest,
  serializeAfWorkItemManifest,
  type AfRevisionRef,
} from "../src/analyzer/afWorkItem.ts";
import type { SelectionSourceRevision } from "../src/companion/types.ts";

export const TEST_DISCOVERY_REVISION = "a".repeat(64);
export const TEST_DECISION_REVISION = "b".repeat(64);
export const TEST_PLAN_HASH = "c".repeat(64);
export const TEST_GRAPH_ETAG = "etag-1";
export const TEST_SOURCE_REVISION: SelectionSourceRevision = {
  head: "abc123",
  dirty_hash: null,
  graph_etag: TEST_GRAPH_ETAG,
};

function revision(ref: string, digest: string): AfRevisionRef {
  return {
    digest,
    subjects: [{ ref, sha256: digest }],
    registry_revision: null,
  };
}

export async function writeCompanionWorkItems(root: string): Promise<void> {
  for (const workId of ["work-1", "work-2", "work-plan"]) {
    const manifest = createAfWorkItemManifest(workId, new Date("2030-01-01T00:00:00.000Z"));
    if (workId === "work-plan") {
      manifest.revisions.discovery = revision("analysis-result.json", TEST_DISCOVERY_REVISION);
      manifest.revisions.decision = revision("af-work-item.json#decisions", TEST_DECISION_REVISION);
      manifest.session_handoffs.push({
        handoff_id: "ledger-handoff-plan",
        work_id: workId,
        from_session_id: "plan-session",
        from_turn_id: "plan-turn",
        discovery_revision: manifest.revisions.discovery,
        decision_revision: manifest.revisions.decision,
        plan_hash: TEST_PLAN_HASH,
        target_skill: "af-discover-assets.materialize",
        status: "pending",
        created_at: "2030-01-01T00:00:00.000Z",
        expires_at: "2030-01-01T00:10:00.000Z",
        marker_digest: "d".repeat(64),
        claimed_by_session_id: null,
        claimed_turn_id: null,
        claimed_at: null,
        superseded_by_handoff_id: null,
      });
    }
    const workRoot = join(root, "artifacts", "af", workId);
    await mkdir(workRoot, { recursive: true });
    await writeFile(join(workRoot, "af-work-item.json"), serializeAfWorkItemManifest(manifest), "utf8");
    await writeFile(join(workRoot, "analysis-result.json"), "{}\n", "utf8");
  }
}
