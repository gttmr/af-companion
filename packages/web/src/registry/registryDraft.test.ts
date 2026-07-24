import assert from "node:assert/strict";
import test from "node:test";

import {
  createRegistryDraftContract,
  parseRegistryContractEditor,
  serializeRegistryContract,
} from "./registryDraft.ts";

test("creates strict type-aware Registry draft contracts", () => {
  const agent = createRegistryDraftContract("agent");
  const workflow = createRegistryDraftContract("workflow");
  const tool = createRegistryDraftContract("tool");

  assert.equal(agent.binding, null);
  assert.equal(agent.workflow_profile, null);
  assert.equal(workflow.workflow_profile?.coordination, "explicit");
  assert.equal(tool.binding?.kind, "unresolved");
  assert.equal(tool.connection?.transport, "unknown");
  assert.deepEqual(parseRegistryContractEditor(serializeRegistryContract(tool)), tool);
});

test("rejects record metadata and incomplete editor payloads", () => {
  const contract = createRegistryDraftContract("agent");
  assert.throws(
    () => parseRegistryContractEditor(JSON.stringify({ ...contract, status: "draft" })),
    /지원하지 않는 필드.*status/,
  );
  const { owner: _owner, ...missingOwner } = contract;
  assert.throws(
    () => parseRegistryContractEditor(JSON.stringify(missingOwner)),
    /필수 필드.*owner/,
  );
});
