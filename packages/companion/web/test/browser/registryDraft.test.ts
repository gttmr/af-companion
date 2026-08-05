import assert from "node:assert/strict";
import test from "node:test";
import type { CompanionRegistryRecord } from "@agent-factory/companion-contracts";
import {
  contractFromRegistryRecord,
  createRegistryDraftContract,
  parseRegistryContract,
  serializeRegistryContract,
} from "../../src/browser/assets/registryDraft.js";

test("draft templates preserve the three canonical Asset type boundaries", () => {
  const agent = createRegistryDraftContract("agent");
  const workflow = createRegistryDraftContract("workflow");
  const tool = createRegistryDraftContract("tool");
  assert.equal(agent.binding, null);
  assert.equal(workflow.workflow_profile?.coordination, "explicit");
  assert.deepEqual(tool.binding, { kind: "unresolved" });
  assert.deepEqual(tool.connection, { transport: "unknown" });
});

test("a published record becomes a contract-only new-version draft source", () => {
  const contract = createRegistryDraftContract("agent");
  const record: CompanionRegistryRecord = { ...contract, version: 3, status: "published", contract_hash: "a".repeat(64), lifecycle: { created_by: "user:test" } };
  const next = contractFromRegistryRecord(record);
  const parsed = parseRegistryContract(serializeRegistryContract(next));
  assert.deepEqual(parsed, contract);
  assert.equal("version" in parsed, false);
  assert.equal("lifecycle" in parsed, false);
});

test("contract editor rejects non-object JSON before the Registry request", () => {
  assert.throws(() => parseRegistryContract("[]"), /JSON object/);
  assert.throws(() => parseRegistryContract("{"), /파싱 실패/);
});
