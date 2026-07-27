import assert from "node:assert/strict";
import test from "node:test";

import { callTool, createServer, toolDefinitions } from "../src/server.mjs";
import { fixture } from "./fixture.mjs";

test("Tool surface is exactly four read-only operations", () => {
  const tools = toolDefinitions();
  assert.deepEqual(tools.map((tool) => tool.name), [
    "af_get_context",
    "af_get_pending_work",
    "af_get_asset_or_handbook_context",
    "af_validate_decision_value",
  ]);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint === true));
  assert.match(tools[3].description, /Never records, selects, or persists/);
});

test("server can be constructed from a validated context", () => {
  assert.ok(createServer(fixture()));
});

test("Tool results separate protocol completion from domain outcomes", () => {
  const context = fixture();
  const current = callTool(context, { name: "af_get_context", arguments: {} });
  assert.equal(current.isError, false);
  assert.equal(current.structuredContent.domain_outcome, "current");
  assert.equal(current.structuredContent.context_revision, context.context_revision);

  const stale = callTool(context, {
    name: "af_get_pending_work",
    arguments: { expected_context_revision: "f".repeat(64) },
  });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.tool_outcome, "completed");
  assert.equal(stale.structuredContent.domain_outcome, "stale");

  const invalid = callTool(context, {
    name: "af_validate_decision_value",
    arguments: {
      expected_context_revision: context.context_revision,
      decision_id: "decision.tool-disposition.v1",
      value: "CREATE_PROJECT_DRAFT",
    },
  });
  assert.equal(invalid.isError, true);
  assert.equal(invalid.structuredContent.domain_outcome, "invalid");
  assert.equal(invalid.structuredContent.persisted, false);
  assert.deepEqual(invalid.structuredContent.allowed_values, ["create_project_draft", "exclude"]);

  const historical = callTool(context, {
    name: "af_get_pending_work",
    arguments: { expected_context_revision: context.context_revision },
  });
  assert.equal(historical.isError, false);
  assert.equal(historical.structuredContent.historical_handoffs_are_claimable, false);
  assert.equal(historical.structuredContent.historical_handoffs[0].claimable, false);

  const extraArgument = callTool(context, {
    name: "af_get_context",
    arguments: { session_id: "invented" },
  });
  assert.equal(extraArgument.isError, true);
  assert.equal(extraArgument.structuredContent.domain_outcome, "invalid");

  const outOfSchemaLimit = callTool(context, {
    name: "af_get_asset_or_handbook_context",
    arguments: {
      expected_context_revision: context.context_revision,
      kind: "handbook",
      query: "model",
      limit: 0,
    },
  });
  assert.equal(outOfSchemaLimit.isError, true);
  assert.equal(outOfSchemaLimit.structuredContent.domain_outcome, "invalid");
  assert.match(outOfSchemaLimit.structuredContent.reason, /limit/);
});
