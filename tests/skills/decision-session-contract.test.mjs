import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = path.join(root, ".agents", "skills");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const sharedReferences = [
  "companion-session-participation.md",
  "decision-input-adapter.md",
  "fresh-context-handoff.md",
  "session-and-work-item-provenance.md",
];

const canonicalSkills = [
  "af-workflow",
  "af-discover-assets",
  "af-compose-solution",
  "af-scaffold-runtime",
  "af-verify-runtime",
];

test("canonical session and decision references exist and are linked by every skill", () => {
  for (const reference of sharedReferences) {
    const referencePath = path.join(skillsRoot, "_shared", reference);
    assert.equal(fs.existsSync(referencePath), true, `${reference} must exist`);
    assert.match(fs.readFileSync(referencePath, "utf8"), /Checked date: 2026-07-24/);
  }

  for (const skill of canonicalSkills) {
    const skillText = fs.readFileSync(path.join(skillsRoot, skill, "SKILL.md"), "utf8");
    for (const reference of sharedReferences) {
      assert.match(skillText, new RegExp(`_shared/${reference.replaceAll(".", "\\.")}`), `${skill} must link ${reference}`);
    }
  }
});

test("decision adapter is turn-capability based and path independent", () => {
  const adapter = read(".agents/skills/_shared/decision-input-adapter.md");
  const discoveryReference = read(".agents/skills/af-discover-assets/references/evidence-and-candidate-discovery.md");
  assert.match(adapter, /tools actually available in that turn/);
  assert.match(adapter, /Never infer availability from a Codex version/);
  assert.match(adapter, /Ask exactly one interactive question per turn/);
  assert.match(adapter, /mark `waiting_for_input`/);
  assert.match(adapter, /perform no materialization, Compose work/);
  assert.match(adapter, /same schema-valid Decision Record semantics/);
  assert.match(adapter, /never resolves a hard, credential, deployment, security, or irreversible gate/);
  assert.match(adapter, /required decision has no default or assumption path/);
  assert.doesNotMatch(discoveryReference, /request_user_input` in small groups/);
  assert.match(discoveryReference, /Ask exactly one question per turn/);
});

test("fresh-context handoff hashes only the canonical Plan body and fails closed", () => {
  const handoff = read(".agents/skills/_shared/fresh-context-handoff.md");
  assert.match(handoff, /canonical Plan body excludes every Companion enrollment or handoff capsule/);
  assert.match(handoff, /`plan_body_hash`/);
  assert.match(handoff, /`session_handoffs\[\]\.plan_hash` must equal/);
  assert.match(handoff, /Companion Continue/);
  assert.match(handoff, /Copy Capsule/);
  assert.match(handoff, /Exact confirmed attach/);
  assert.match(handoff, /built-in fresh-context carriage as `unverified`/);
  assert.match(handoff, /Never auto-claim the sole pending candidate/);
});

test("durable work and evidence require exact enrolled materialization scope", () => {
  const participation = read(".agents/skills/_shared/companion-session-participation.md");
  const provenance = read(".agents/skills/_shared/session-and-work-item-provenance.md");
  const scaffold = read(".agents/skills/af-scaffold-runtime/SKILL.md");
  const verify = read(".agents/skills/af-verify-runtime/SKILL.md");

  assert.match(participation, /Ordinary Codex sessions.*not Agent Factory lifecycle actors/);
  assert.match(participation, /`workspace_id`, `application_id`, and `work_id` exactly match/);
  assert.match(provenance, /Return-to-Discover preserves `workspace_id`, `application_id`, `work_id`/);
  assert.match(provenance, /open and resolved decision refs/);
  assert.match(provenance, /recommendation revision/);
  assert.match(scaffold, /exact `workspace_id`, `application_id`, `work_id`, `role: materialization` attachment/);
  assert.match(verify, /Never auto-import commands, observations, approvals, or evidence from an ordinary/);
});
