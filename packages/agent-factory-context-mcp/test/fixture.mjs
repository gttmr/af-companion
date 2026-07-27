import { computeContextRevision } from "../src/context.mjs";

export function fixture(overrides = {}) {
  const value = {
    schema_version: 1,
    application_id: "product-truth-mcp-agent",
    work_id: "product-truth-mcp-production-slice",
    generated_at: "2026-07-26T18:00:00.000Z",
    context_revision: "0".repeat(64),
    current: {
      evidence_status: "current",
      ledger_revision: 1,
      focus_skill: "af-discover-assets",
      skills: {
        "af-discover-assets": "waiting_for_review",
        "af-compose-solution": "not_started",
        "af-scaffold-runtime": "not_started",
        "af-verify-runtime": "not_started",
      },
      active_runs_count: 0,
      verification_outcome: null,
      registry_revision: "1".repeat(64),
    },
    pending_work: {
      actionable: [{ id: "review.discovery", owner_skill: "af-discover-assets", status: "waiting_for_review", reason: "review current discovery evidence" }],
      historical_handoffs: [{ handoff_id: "handoff.phase-a", status: "pending", claimable: false, reason: "belongs to a different historical Work Item" }],
    },
    evidence: {
      assets: [{
        asset_id: "tool.ocr-text-extraction",
        asset_type: "tool",
        version: 1,
        status: "draft",
        name: "OCR text extraction",
        responsibility: "Extract text from an image",
        capability_tags: ["ocr"],
        binding: "mcp:http",
        contract_hash: "2".repeat(64),
      }],
      handbook: [{ id: "operating-model", title: "Operating Model", summary: "Work Skills own canonical lifecycle mutation.", ref: "docs/workbench/operating-model.md" }],
    },
    decisions: [{
      decision_id: "decision.tool-disposition.v1",
      kind: "asset_decision",
      topic: "asset_disposition",
      status: "open",
      allowed_values: ["create_project_draft", "exclude"],
      current_value: null,
      decision_revision: "3".repeat(64),
    }],
    support: {
      cli_wsl: "supported",
      vscode_remote_wsl: "supported",
      native_windows: "unsupported",
      fresh_context: "companion_continue",
      canonical_mutation: "excluded",
    },
    ...overrides,
  };
  value.context_revision = computeContextRevision(value);
  return value;
}
