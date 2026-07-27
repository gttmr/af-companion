import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

export const CONTEXT_SCHEMA_VERSION = 1;
export const TOOL_NAMES = Object.freeze([
  "af_get_context",
  "af_get_pending_work",
  "af_get_asset_or_handbook_context",
  "af_validate_decision_value",
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FORBIDDEN_PATH_PATTERN = /(?:\/tmp\/|\/home\/[^/\s"']+\/|\/Users\/[^/\s"']+\/|\/mnt\/[a-z]\/Users\/[^/\s"']+\/|[A-Za-z]:[\\/])/i;
const FORBIDDEN_KEY_PATTERN = /(?:api[_-]?key|secret|credential|token|session_id|turn_id)/i;

export async function loadContext(contextPath, cwd = process.cwd()) {
  if (!contextPath) throw new Error("--context is required");
  const path = isAbsolute(contextPath) ? resolve(contextPath) : resolve(cwd, contextPath);
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`context file is unavailable: ${path}`, { cause: error });
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error("context file must contain valid JSON", { cause: error });
  }
  return validateContext(value);
}

export async function findProjectContext(cwd = process.cwd()) {
  let directory = await realpath(cwd);
  while (true) {
    const contextPath = join(directory, ".agent-factory", "af-context.json");
    const configPath = join(directory, ".codex", "config.toml");
    const [contextKind, configKind] = await Promise.all([regularFileKind(contextPath), regularFileKind(configPath)]);
    if (contextKind === "regular" && configKind === "regular") return contextPath;
    if (contextKind !== "missing" || configKind !== "missing") {
      throw new Error("project MCP context/config pair is incomplete or unsafe");
    }
    const parent = dirname(directory);
    if (parent === directory || directory === parse(directory).root) break;
    directory = parent;
  }
  throw new Error("project MCP context is unavailable from the current workspace");
}

async function regularFileKind(path) {
  try {
    const entry = await lstat(path);
    return entry.isFile() && !entry.isSymbolicLink() ? "regular" : "unsafe";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

export function validateContext(value) {
  requireRecord(value, "context");
  requireExactKeys(value, [
    "schema_version",
    "application_id",
    "work_id",
    "generated_at",
    "context_revision",
    "current",
    "pending_work",
    "evidence",
    "decisions",
    "support",
  ], "context");
  if (value.schema_version !== CONTEXT_SCHEMA_VERSION) throw new Error("unsupported context schema_version");
  requireId(value.application_id, "application_id");
  requireId(value.work_id, "work_id");
  if (typeof value.generated_at !== "string" || !ISO_DATE_PATTERN.test(value.generated_at)) {
    throw new Error("generated_at must be an ISO-8601 UTC timestamp");
  }
  if (typeof value.context_revision !== "string" || !SHA256_PATTERN.test(value.context_revision)) {
    throw new Error("context_revision must be a lowercase SHA-256");
  }
  validateCurrent(value.current);
  validatePendingWork(value.pending_work);
  validateEvidence(value.evidence);
  validateDecisions(value.decisions);
  validateSupport(value.support);
  rejectSensitiveOrMachineLocalData(value);
  const expectedRevision = computeContextRevision(value);
  if (expectedRevision !== value.context_revision) {
    throw new Error(`context_revision mismatch: expected ${expectedRevision}`);
  }
  return structuredClone(value);
}

export function computeContextRevision(value) {
  const payload = structuredClone(value);
  delete payload.context_revision;
  delete payload.generated_at;
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function validateCurrent(value) {
  requireRecord(value, "current");
  requireExactKeys(value, [
    "evidence_status",
    "ledger_revision",
    "focus_skill",
    "skills",
    "active_runs_count",
    "verification_outcome",
    "registry_revision",
  ], "current");
  if (!["current", "unverified"].includes(value.evidence_status)) throw new Error("invalid current.evidence_status");
  if (!Number.isInteger(value.ledger_revision) || value.ledger_revision < 0) throw new Error("invalid current.ledger_revision");
  if (typeof value.focus_skill !== "string" || !value.focus_skill) throw new Error("invalid current.focus_skill");
  requireRecord(value.skills, "current.skills");
  for (const [skill, status] of Object.entries(value.skills)) {
    if (!skill.startsWith("af-") || typeof status !== "string" || !status) throw new Error("invalid current.skills entry");
  }
  if (!Number.isInteger(value.active_runs_count) || value.active_runs_count < 0) throw new Error("invalid current.active_runs_count");
  if (value.verification_outcome !== null && !["passed", "failed", "unverified", "stale"].includes(value.verification_outcome)) {
    throw new Error("invalid current.verification_outcome");
  }
  if (value.registry_revision !== null && (typeof value.registry_revision !== "string" || !SHA256_PATTERN.test(value.registry_revision))) {
    throw new Error("invalid current.registry_revision");
  }
}

function validatePendingWork(value) {
  requireRecord(value, "pending_work");
  requireExactKeys(value, ["actionable", "historical_handoffs"], "pending_work");
  requireArray(value.actionable, "pending_work.actionable");
  requireArray(value.historical_handoffs, "pending_work.historical_handoffs");
  for (const item of value.actionable) {
    requireRecord(item, "actionable item");
    requireExactKeys(item, ["id", "owner_skill", "status", "reason"], "actionable item");
    requireId(item.id, "actionable.id");
    if (typeof item.owner_skill !== "string" || !item.owner_skill.startsWith("af-")) throw new Error("invalid actionable.owner_skill");
    if (typeof item.status !== "string" || !item.status) throw new Error("invalid actionable.status");
    if (typeof item.reason !== "string" || !item.reason) throw new Error("invalid actionable.reason");
  }
  for (const handoff of value.historical_handoffs) {
    requireRecord(handoff, "historical handoff");
    requireExactKeys(handoff, ["handoff_id", "status", "claimable", "reason"], "historical handoff");
    requireId(handoff.handoff_id, "historical_handoff.handoff_id");
    if (typeof handoff.status !== "string" || !handoff.status) throw new Error("invalid historical handoff status");
    if (handoff.claimable !== false) throw new Error("historical handoffs must be non-claimable");
    if (typeof handoff.reason !== "string" || !handoff.reason) throw new Error("invalid historical handoff reason");
  }
}

function validateEvidence(value) {
  requireRecord(value, "evidence");
  requireExactKeys(value, ["assets", "handbook"], "evidence");
  requireArray(value.assets, "evidence.assets");
  requireArray(value.handbook, "evidence.handbook");
  if (value.assets.length > 50 || value.handbook.length > 50) throw new Error("evidence exceeds the bounded 50-item limit");
  for (const asset of value.assets) {
    requireRecord(asset, "asset evidence");
    requireExactKeys(asset, ["asset_id", "asset_type", "version", "status", "name", "responsibility", "capability_tags", "binding", "contract_hash"], "asset evidence");
    if (typeof asset.asset_id !== "string" || !asset.asset_id) throw new Error("invalid asset_id");
    if (!["agent", "workflow", "tool"].includes(asset.asset_type)) throw new Error("invalid asset_type");
    if (!Number.isInteger(asset.version) || asset.version < 1) throw new Error("invalid asset version");
    if (typeof asset.status !== "string" || !asset.status) throw new Error("invalid asset status");
    if (typeof asset.name !== "string" || typeof asset.responsibility !== "string") throw new Error("invalid asset text");
    requireArray(asset.capability_tags, "asset.capability_tags");
    if (asset.binding !== null && typeof asset.binding !== "string") throw new Error("invalid asset binding");
    if (typeof asset.contract_hash !== "string" || !SHA256_PATTERN.test(asset.contract_hash)) throw new Error("invalid asset contract_hash");
  }
  for (const entry of value.handbook) {
    requireRecord(entry, "handbook evidence");
    requireExactKeys(entry, ["id", "title", "summary", "ref"], "handbook evidence");
    requireId(entry.id, "handbook.id");
    if ([entry.title, entry.summary, entry.ref].some((item) => typeof item !== "string" || !item)) throw new Error("invalid handbook evidence");
    if (isAbsolute(entry.ref) || entry.ref.split(/[\\/]/).includes("..")) throw new Error("handbook ref must be repository-relative");
  }
}

function validateDecisions(value) {
  requireArray(value, "decisions");
  if (value.length > 100) throw new Error("decision preview exceeds the bounded 100-item limit");
  for (const decision of value) {
    requireRecord(decision, "decision preview");
    requireExactKeys(decision, ["decision_id", "kind", "topic", "status", "allowed_values", "current_value", "decision_revision"], "decision preview");
    requireId(decision.decision_id, "decision_id");
    if (!["decision", "asset_decision"].includes(decision.kind)) throw new Error("invalid decision kind");
    if (typeof decision.topic !== "string" || !decision.topic) throw new Error("invalid decision topic");
    if (typeof decision.status !== "string" || !decision.status) throw new Error("invalid decision status");
    requireArray(decision.allowed_values, "decision.allowed_values");
    if (decision.allowed_values.length === 0 || decision.allowed_values.some((item) => typeof item !== "string" || !item)) {
      throw new Error("decision.allowed_values must contain exact non-empty strings");
    }
    if (decision.current_value !== null && typeof decision.current_value !== "string") throw new Error("invalid decision.current_value");
    if (typeof decision.decision_revision !== "string" || !SHA256_PATTERN.test(decision.decision_revision)) {
      throw new Error("invalid decision.decision_revision");
    }
  }
}

function validateSupport(value) {
  requireRecord(value, "support");
  requireExactKeys(value, ["cli_wsl", "vscode_remote_wsl", "native_windows", "fresh_context", "canonical_mutation"], "support");
  if (value.cli_wsl !== "supported" || value.vscode_remote_wsl !== "supported") throw new Error("invalid supported client contract");
  if (value.native_windows !== "unsupported") throw new Error("Native Windows must remain unsupported");
  if (value.fresh_context !== "companion_continue") throw new Error("Fresh Context must remain Companion Continue");
  if (value.canonical_mutation !== "excluded") throw new Error("canonical mutation must remain excluded");
}

function rejectSensitiveOrMachineLocalData(value, path = "$" ) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveOrMachineLocalData(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_PATH_PATTERN.test(value)) throw new Error(`machine-local path is forbidden at ${path}`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) throw new Error(`sensitive or unsupported provenance key is forbidden at ${path}.${key}`);
    rejectSensitiveOrMachineLocalData(item, `${path}.${key}`);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} must be a lowercase identifier`);
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} keys do not match the strict contract`);
}
