import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const assetTypes = ["agent", "workflow", "tool"] as const;
export const registryStatuses = ["draft", "reviewed", "published", "deprecated"] as const;
export const sideEffectClasses = ["none", "read_only", "write", "external_action"] as const;
export const matchGrades = ["exact", "compatible", "partial", "none"] as const;

export type AssetType = (typeof assetTypes)[number];
export type RegistryStatus = (typeof registryStatuses)[number];
export type SideEffectClass = (typeof sideEffectClasses)[number];
export type MatchGrade = (typeof matchGrades)[number];

export interface ContractField {
  name: string;
  type: string;
  required: boolean;
  schema?: Record<string, unknown>;
}

export type AssetBinding =
  | { kind: "function" | "built_in" | "unresolved" }
  | { kind: "mcp"; server_ref: string; tool_name: string }
  | { kind: "a2a"; contract_ref: string };

export interface AssetConnection {
  transport: "in_process" | "stdio" | "http" | "unknown";
}

export interface WorkflowProfile {
  representation: "graph" | "dynamic" | "unresolved";
  coordination: "explicit" | "agent_delegation" | "mixed";
  template_ref: string | null;
}

export interface AssetExposure {
  protocol: "a2a";
  contract_ref: string;
}

export interface AssetRef {
  asset_id: string;
  version: number;
}

export interface UserDecision {
  decision_id: string;
  selected_by: "user";
  rationale: string;
}

export interface PublishDecision extends UserDecision {
  owner_confirmed: true;
  domain_confirmed: true;
  reuse_confirmed: true;
}

export interface SeedPublication {
  kind: "repository_seed";
  source_ref: string;
  rationale: string;
}

export interface AssetLifecycle {
  created_by: string;
  seed_publication?: SeedPublication;
  review_decision?: UserDecision;
  publish_decision?: PublishDecision;
  deprecation_decision?: UserDecision;
}

export interface AssetContractInput {
  asset_id: string;
  asset_type: AssetType;
  name: string;
  responsibility: string;
  capability_tags: string[];
  inputs: ContractField[];
  outputs: ContractField[];
  side_effect_class: SideEffectClass;
  domain_scope: "domain_specific" | "cross_domain" | "domain_neutral";
  business_domains: string[];
  owner: string;
  reuse_status: "not_reviewed" | "reuse_existing" | "publish_candidate" | "project_only" | "excluded";
  binding: AssetBinding | null;
  connection: AssetConnection | null;
  workflow_profile: WorkflowProfile | null;
  exposure: AssetExposure | null;
  runtime_requirements: string[];
  source_refs: string[];
  handbook_refs: string[];
  depends_on: AssetRef[];
  contract_status: string;
  risk_signals: string[];
  runtime_mock: Record<string, unknown>;
  composition: string[];
  notes: string;
}

export interface AssetRecord extends AssetContractInput {
  version: number;
  status: RegistryStatus;
  contract_hash: string;
  lifecycle: AssetLifecycle;
}

export interface AssetRegistryDocument {
  schema_version: 1;
  assets: AssetRecord[];
}

export interface AssetRegistrySnapshot {
  schema_version: 1;
  registry_revision: string;
  assets: readonly AssetRecord[];
}

export interface L0AssetCard {
  asset_id: string;
  asset_type: AssetType;
  version: number;
  status: RegistryStatus;
  name: string;
  responsibility: string;
  capability_tags: string[];
  side_effect_class: SideEffectClass;
  contract_hash: string;
}

export interface L1AssetCard extends L0AssetCard {
  inputs: ContractField[];
  outputs: ContractField[];
  domain_scope: AssetContractInput["domain_scope"];
  business_domains: string[];
  owner: string;
  reuse_status: AssetContractInput["reuse_status"];
  binding: AssetBinding | null;
  connection: AssetConnection | null;
  workflow_profile: WorkflowProfile | null;
  exposure: AssetExposure | null;
  runtime_requirements: string[];
  source_refs: string[];
  handbook_refs: string[];
  usage_count: number;
  dependents: AssetRef[];
}

export interface ContractRequirement {
  name: string;
  type: string;
  required?: boolean;
}

export interface AssetSearchQuery {
  text?: string;
  asset_type?: AssetType;
  required_inputs?: ContractRequirement[];
  required_outputs?: ContractRequirement[];
  side_effect_class?: SideEffectClass;
  domain_scope?: AssetContractInput["domain_scope"];
  business_domain?: string;
  owner?: string;
  binding_kind?: AssetBinding["kind"] | "none";
  exposure_protocol?: "a2a" | "none";
  runtime_requirements?: string[];
  include_deprecated?: boolean;
  limit?: number;
}

export interface CompatibilityFact {
  fact: string;
  matched: boolean;
  required: boolean;
  detail: string;
}

export interface SearchCandidateEvidence {
  asset_id: string;
  version: number;
  accepted: boolean;
  match_grade: MatchGrade;
  compatibility_facts: CompatibilityFact[];
  rejection_reasons: string[];
}

export interface AssetSearchResult {
  card: L0AssetCard;
  match_grade: Exclude<MatchGrade, "none">;
  compatibility_facts: CompatibilityFact[];
  lexical_score: number;
  warnings: string[];
}

export interface AssetSearchBundle {
  registry_revision: string;
  query: AssetSearchQuery;
  candidates_considered_count: number;
  candidates_considered: SearchCandidateEvidence[];
  results: AssetSearchResult[];
}

export interface VersionComparison {
  asset_id: string;
  from_version: number;
  to_version: number;
  same_contract: boolean;
  from_contract_hash: string;
  to_contract_hash: string;
  changed_fields: string[];
}

export interface UsageResult {
  target: AssetRef;
  usage_count: number;
  dependents: AssetRef[];
}

export class AssetRegistryError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AssetRegistryError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const CONTRACT_KEYS = [
  "asset_id", "asset_type", "name", "responsibility", "capability_tags", "inputs", "outputs",
  "side_effect_class", "domain_scope", "business_domains", "owner", "reuse_status", "binding",
  "connection", "workflow_profile", "exposure", "runtime_requirements", "source_refs", "handbook_refs",
  "depends_on", "contract_status", "risk_signals", "runtime_mock", "composition", "notes",
] as const;

const RECORD_KEYS = [...CONTRACT_KEYS, "version", "status", "contract_hash", "lifecycle"] as const;
const DOCUMENT_KEYS = ["schema_version", "assets"] as const;
const FIELD_KEYS = ["name", "type", "required", "schema"] as const;
const REF_KEYS = ["asset_id", "version"] as const;
const LIFECYCLE_KEYS = ["created_by", "seed_publication", "review_decision", "publish_decision", "deprecation_decision"] as const;
const DECISION_KEYS = ["decision_id", "selected_by", "rationale"] as const;
const PUBLISH_DECISION_KEYS = [...DECISION_KEYS, "owner_confirmed", "domain_confirmed", "reuse_confirmed"] as const;
const SEED_PUBLICATION_KEYS = ["kind", "source_ref", "rationale"] as const;

function fail(code: string, message: string, details?: unknown): never {
  throw new AssetRegistryError(422, code, message, details);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateJsonValue(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("registry_validation_failed", `${path} must contain only finite JSON numbers`);
    return;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail("registry_validation_failed", `${path} must not contain cycles`);
    const next = new Set(ancestors).add(value);
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, next));
    return;
  }
  if (isObject(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    if (ancestors.has(value)) fail("registry_validation_failed", `${path} must not contain cycles`);
    const next = new Set(ancestors).add(value);
    for (const [key, entry] of Object.entries(value)) validateJsonValue(entry, `${path}.${key}`, next);
    return;
  }
  fail("registry_validation_failed", `${path} must contain only JSON values`);
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) fail("registry_validation_failed", `${path} must be an object`);
  return value;
}

function expectExactKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail("registry_validation_failed", `${path} contains unknown fields`, { fields: unknown });
  const missing = required.filter((key) => !(key in value));
  if (missing.length > 0) fail("registry_validation_failed", `${path} is missing required fields`, { fields: missing });
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail("registry_validation_failed", `${path} must be a non-empty string`);
  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail("registry_validation_failed", `${path} must be an array`);
  return value.map((item, index) => expectString(item, `${path}[${index}]`));
}

function expectEnum<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail("registry_validation_failed", `${path} must be one of ${values.join(", ")}`);
  }
  return value as T;
}

function expectPositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) fail("registry_validation_failed", `${path} must be a positive integer`);
  return value as number;
}

function validateField(value: unknown, path: string): ContractField {
  const object = expectObject(value, path);
  expectExactKeys(object, FIELD_KEYS, ["name", "type", "required"], path);
  expectString(object.name, `${path}.name`);
  expectString(object.type, `${path}.type`);
  if (typeof object.required !== "boolean") fail("registry_validation_failed", `${path}.required must be boolean`);
  if (object.schema !== undefined) {
    if (!isObject(object.schema)) fail("registry_validation_failed", `${path}.schema must be an object`);
    validateJsonValue(object.schema, `${path}.schema`);
  }
  return object as unknown as ContractField;
}

function validateBinding(value: unknown, assetType: AssetType, path: string): AssetBinding | null {
  if (value === null) {
    if (assetType === "tool") fail("registry_validation_failed", `${path} is required for Tool assets`);
    return null;
  }
  const object = expectObject(value, path);
  const kind = expectEnum(object.kind, ["function", "mcp", "built_in", "a2a", "unresolved"] as const, `${path}.kind`);
  if (kind === "mcp") {
    expectExactKeys(object, ["kind", "server_ref", "tool_name"], ["kind", "server_ref", "tool_name"], path);
    expectString(object.server_ref, `${path}.server_ref`);
    expectString(object.tool_name, `${path}.tool_name`);
  } else if (kind === "a2a") {
    expectExactKeys(object, ["kind", "contract_ref"], ["kind", "contract_ref"], path);
    expectString(object.contract_ref, `${path}.contract_ref`);
  } else {
    expectExactKeys(object, ["kind"], ["kind"], path);
  }
  if (assetType === "workflow") fail("registry_validation_failed", `${path} must be null for Workflow assets`);
  if (assetType === "agent" && kind !== "a2a") fail("registry_validation_failed", `${path} only supports A2A for Agent assets`);
  if (assetType === "tool" && kind === "a2a") fail("registry_validation_failed", `${path} does not support A2A for Tool assets`);
  return object as unknown as AssetBinding;
}

function validateConnection(value: unknown, assetType: AssetType, binding: AssetBinding | null, path: string): AssetConnection | null {
  if (value === null) {
    if (assetType === "tool" || binding?.kind === "a2a") fail("registry_validation_failed", `${path} is required by this binding`);
    return null;
  }
  const object = expectObject(value, path);
  expectExactKeys(object, ["transport"], ["transport"], path);
  const transport = expectEnum(object.transport, ["in_process", "stdio", "http", "unknown"] as const, `${path}.transport`);
  if (assetType === "workflow") fail("registry_validation_failed", `${path} must be null for Workflow assets`);
  if (binding?.kind === "a2a" && transport !== "http") fail("registry_validation_failed", `${path}.transport must be http for A2A`);
  return object as unknown as AssetConnection;
}

function validateWorkflowProfile(value: unknown, assetType: AssetType, path: string): WorkflowProfile | null {
  if (value === null) {
    if (assetType === "workflow") fail("registry_validation_failed", `${path} is required for Workflow assets`);
    return null;
  }
  if (assetType !== "workflow") fail("registry_validation_failed", `${path} is only allowed for Workflow assets`);
  const object = expectObject(value, path);
  expectExactKeys(object, ["representation", "coordination", "template_ref"], ["representation", "coordination", "template_ref"], path);
  expectEnum(object.representation, ["graph", "dynamic", "unresolved"] as const, `${path}.representation`);
  expectEnum(object.coordination, ["explicit", "agent_delegation", "mixed"] as const, `${path}.coordination`);
  if (object.template_ref !== null) expectString(object.template_ref, `${path}.template_ref`);
  return object as unknown as WorkflowProfile;
}

function validateExposure(value: unknown, assetType: AssetType, path: string): AssetExposure | null {
  if (value === null) return null;
  if (assetType !== "agent") fail("registry_validation_failed", `${path} is only allowed for Agent assets`);
  const object = expectObject(value, path);
  expectExactKeys(object, ["protocol", "contract_ref"], ["protocol", "contract_ref"], path);
  if (object.protocol !== "a2a") fail("registry_validation_failed", `${path}.protocol must be a2a`);
  expectString(object.contract_ref, `${path}.contract_ref`);
  return object as unknown as AssetExposure;
}

function validateRef(value: unknown, path: string): AssetRef {
  const object = expectObject(value, path);
  expectExactKeys(object, REF_KEYS, REF_KEYS, path);
  expectString(object.asset_id, `${path}.asset_id`);
  expectPositiveInteger(object.version, `${path}.version`);
  return object as unknown as AssetRef;
}

function validateDecision(value: unknown, path: string, publish = false): UserDecision | PublishDecision {
  const object = expectObject(value, path);
  const keys = publish ? PUBLISH_DECISION_KEYS : DECISION_KEYS;
  expectExactKeys(object, keys, keys, path);
  expectString(object.decision_id, `${path}.decision_id`);
  if (object.selected_by !== "user") fail("registry_validation_failed", `${path}.selected_by must be user`);
  expectString(object.rationale, `${path}.rationale`);
  if (publish) {
    for (const key of ["owner_confirmed", "domain_confirmed", "reuse_confirmed"] as const) {
      if (object[key] !== true) fail("registry_validation_failed", `${path}.${key} must be true`);
    }
  }
  return object as unknown as UserDecision | PublishDecision;
}

function validateSeedPublication(value: unknown, path: string): SeedPublication {
  const object = expectObject(value, path);
  expectExactKeys(object, SEED_PUBLICATION_KEYS, SEED_PUBLICATION_KEYS, path);
  if (object.kind !== "repository_seed") {
    fail("registry_validation_failed", `${path}.kind must be repository_seed`);
  }
  expectString(object.source_ref, `${path}.source_ref`);
  expectString(object.rationale, `${path}.rationale`);
  return object as unknown as SeedPublication;
}

function validateLifecycle(value: unknown, status: RegistryStatus, path: string): AssetLifecycle {
  const object = expectObject(value, path);
  expectExactKeys(object, LIFECYCLE_KEYS, ["created_by"], path);
  expectString(object.created_by, `${path}.created_by`);
  const seed = object.seed_publication === undefined
    ? undefined
    : validateSeedPublication(object.seed_publication, `${path}.seed_publication`);
  const review = object.review_decision === undefined ? undefined : validateDecision(object.review_decision, `${path}.review_decision`);
  const publish = object.publish_decision === undefined ? undefined : validateDecision(object.publish_decision, `${path}.publish_decision`, true);
  const deprecation = object.deprecation_decision === undefined ? undefined : validateDecision(object.deprecation_decision, `${path}.deprecation_decision`);
  const coherent =
    (status === "draft" && !seed && !review && !publish && !deprecation) ||
    (status === "reviewed" && !seed && !!review && !publish && !deprecation) ||
    (status === "published" && !deprecation && ((!!seed && !review && !publish) || (!seed && !!review && !!publish))) ||
    (status === "deprecated" && !!deprecation && ((!!seed && !review && !publish) || (!seed && !!review && !!publish)));
  if (!coherent) fail("registry_validation_failed", `${path} is incoherent with status ${status}`);
  return object as unknown as AssetLifecycle;
}

function validateContractShape(object: Record<string, unknown>, path: string): AssetContractInput {
  expectExactKeys(object, CONTRACT_KEYS, CONTRACT_KEYS, path);
  const assetType = expectEnum(object.asset_type, assetTypes, `${path}.asset_type`);
  expectString(object.asset_id, `${path}.asset_id`);
  expectString(object.name, `${path}.name`);
  expectString(object.responsibility, `${path}.responsibility`);
  expectStringArray(object.capability_tags, `${path}.capability_tags`);
  if (!Array.isArray(object.inputs)) fail("registry_validation_failed", `${path}.inputs must be an array`);
  object.inputs.forEach((field, index) => validateField(field, `${path}.inputs[${index}]`));
  if (!Array.isArray(object.outputs)) fail("registry_validation_failed", `${path}.outputs must be an array`);
  object.outputs.forEach((field, index) => validateField(field, `${path}.outputs[${index}]`));
  expectEnum(object.side_effect_class, sideEffectClasses, `${path}.side_effect_class`);
  expectEnum(object.domain_scope, ["domain_specific", "cross_domain", "domain_neutral"] as const, `${path}.domain_scope`);
  expectStringArray(object.business_domains, `${path}.business_domains`);
  expectString(object.owner, `${path}.owner`);
  expectEnum(object.reuse_status, ["not_reviewed", "reuse_existing", "publish_candidate", "project_only", "excluded"] as const, `${path}.reuse_status`);
  const binding = validateBinding(object.binding, assetType, `${path}.binding`);
  validateConnection(object.connection, assetType, binding, `${path}.connection`);
  validateWorkflowProfile(object.workflow_profile, assetType, `${path}.workflow_profile`);
  validateExposure(object.exposure, assetType, `${path}.exposure`);
  expectStringArray(object.runtime_requirements, `${path}.runtime_requirements`);
  expectStringArray(object.source_refs, `${path}.source_refs`);
  expectStringArray(object.handbook_refs, `${path}.handbook_refs`);
  if (!Array.isArray(object.depends_on)) fail("registry_validation_failed", `${path}.depends_on must be an array`);
  object.depends_on.forEach((ref, index) => validateRef(ref, `${path}.depends_on[${index}]`));
  expectString(object.contract_status, `${path}.contract_status`);
  expectStringArray(object.risk_signals, `${path}.risk_signals`);
  expectObject(object.runtime_mock, `${path}.runtime_mock`);
  validateJsonValue(object.runtime_mock, `${path}.runtime_mock`);
  expectStringArray(object.composition, `${path}.composition`);
  expectString(object.notes, `${path}.notes`);
  return object as unknown as AssetContractInput;
}

export function contractContent(record: AssetRecord | AssetContractInput): AssetContractInput {
  return Object.fromEntries(CONTRACT_KEYS.map((key) => [key, structuredClone(record[key])])) as unknown as AssetContractInput;
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) fail("registry_validation_failed", "Value is not JSON serializable");
  return serialized;
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalize(value)).digest("hex");
}

export function computeContractHash(record: AssetRecord | AssetContractInput): string {
  return sha256(contractContent(record));
}

function normalizeDocument(document: AssetRegistryDocument): AssetRegistryDocument {
  return {
    schema_version: 1,
    assets: [...document.assets]
      .sort((a, b) => a.asset_id.localeCompare(b.asset_id) || a.version - b.version)
      .map((asset) => structuredClone(asset)),
  };
}

export function computeRegistryRevision(document: AssetRegistryDocument): string {
  return sha256(normalizeDocument(document));
}

export function canonicalRegistryBytes(document: AssetRegistryDocument): string {
  return `${JSON.stringify(JSON.parse(canonicalize(normalizeDocument(document))), null, 2)}\n`;
}

export function validateAssetRecord(value: unknown, path = "asset"): AssetRecord {
  const object = expectObject(value, path);
  expectExactKeys(object, RECORD_KEYS, RECORD_KEYS, path);
  validateContractShape(Object.fromEntries(CONTRACT_KEYS.map((key) => [key, object[key]])), path);
  expectPositiveInteger(object.version, `${path}.version`);
  const status = expectEnum(object.status, registryStatuses, `${path}.status`);
  if (typeof object.contract_hash !== "string" || !/^[a-f0-9]{64}$/.test(object.contract_hash)) {
    fail("registry_validation_failed", `${path}.contract_hash must be a lowercase SHA-256`);
  }
  validateLifecycle(object.lifecycle, status, `${path}.lifecycle`);
  const record = object as unknown as AssetRecord;
  const expectedHash = computeContractHash(record);
  if (record.contract_hash !== expectedHash) {
    fail("contract_hash_mismatch", `${path}.contract_hash does not match contract content`, { expected: expectedHash, actual: record.contract_hash });
  }
  return record;
}

export function validateRegistryDocument(value: unknown): AssetRegistryDocument {
  const object = expectObject(value, "registry");
  expectExactKeys(object, DOCUMENT_KEYS, DOCUMENT_KEYS, "registry");
  if (object.schema_version !== 1) fail("unsupported_registry_schema", "registry.schema_version must be 1");
  if (!Array.isArray(object.assets)) fail("registry_validation_failed", "registry.assets must be an array");
  const assets = object.assets.map((asset, index) => validateAssetRecord(asset, `registry.assets[${index}]`));
  const keys = new Set<string>();
  const types = new Map<string, AssetType>();
  for (const asset of assets) {
    const key = `${asset.asset_id}@${asset.version}`;
    if (keys.has(key)) fail("duplicate_asset_version", `duplicate asset version ${key}`);
    keys.add(key);
    const priorType = types.get(asset.asset_id);
    if (priorType && priorType !== asset.asset_type) fail("asset_type_changed", `${asset.asset_id} changes type across versions`);
    types.set(asset.asset_id, asset.asset_type);
  }
  for (const asset of assets) {
    for (const dependency of asset.depends_on) {
      const key = `${dependency.asset_id}@${dependency.version}`;
      if (!keys.has(key)) fail("missing_asset_dependency", `${asset.asset_id}@${asset.version} depends on missing ${key}`);
    }
  }
  return { schema_version: 1, assets };
}

export function parseRegistryJson(text: string): AssetRegistryDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new AssetRegistryError(422, "invalid_registry_json", "Asset Registry is not valid JSON", { cause: String(error) });
  }
  return validateRegistryDocument(value);
}

export function loadSnapshot(registryPath: string): AssetRegistrySnapshot {
  let text: string;
  try {
    text = readFileSync(registryPath, "utf8");
  } catch (error) {
    throw new AssetRegistryError(404, "registry_not_found", `Asset Registry not found: ${registryPath}`, { cause: String(error) });
  }
  const document = validateRegistryDocument(parseRegistryJson(text));
  return {
    schema_version: 1,
    registry_revision: computeRegistryRevision(document),
    assets: normalizeDocument(document).assets,
  };
}

function refKey(ref: AssetRef): string {
  return `${ref.asset_id}@${ref.version}`;
}

function recordRef(record: AssetRecord): AssetRef {
  return { asset_id: record.asset_id, version: record.version };
}

function recordByRef(snapshot: AssetRegistrySnapshot, ref: AssetRef): AssetRecord {
  const record = snapshot.assets.find((asset) => asset.asset_id === ref.asset_id && asset.version === ref.version);
  if (!record) throw new AssetRegistryError(404, "asset_not_found", `Asset not found: ${refKey(ref)}`);
  return structuredClone(record);
}

export function resolveExact(snapshot: AssetRegistrySnapshot, assetId: string, version: number): AssetRecord {
  return recordByRef(snapshot, { asset_id: assetId, version });
}

export function resolveActive(snapshot: AssetRegistrySnapshot, assetId: string): AssetRecord {
  const record = snapshot.assets
    .filter((asset) => asset.asset_id === assetId && asset.status === "published")
    .sort((a, b) => b.version - a.version)[0];
  if (!record) throw new AssetRegistryError(404, "active_asset_not_found", `No published version exists for ${assetId}`);
  return structuredClone(record);
}

export function usage(snapshot: AssetRegistrySnapshot, target: AssetRef): UsageResult {
  recordByRef(snapshot, target);
  const dependents = snapshot.assets
    .filter((asset) => asset.depends_on.some((dependency) => refKey(dependency) === refKey(target)))
    .map(recordRef)
    .sort((a, b) => a.asset_id.localeCompare(b.asset_id) || a.version - b.version);
  return { target: structuredClone(target), usage_count: dependents.length, dependents };
}

function toL0(record: AssetRecord): L0AssetCard {
  return {
    asset_id: record.asset_id,
    asset_type: record.asset_type,
    version: record.version,
    status: record.status,
    name: record.name,
    responsibility: record.responsibility,
    capability_tags: [...record.capability_tags],
    side_effect_class: record.side_effect_class,
    contract_hash: record.contract_hash,
  };
}

export function list(snapshot: AssetRegistrySnapshot, options: { asset_type?: AssetType; statuses?: RegistryStatus[]; all_versions?: boolean; limit?: number } = {}): L0AssetCard[] {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 20);
  const statuses = options.statuses ?? ["published"];
  let assets = snapshot.assets.filter((asset) => statuses.includes(asset.status) && (!options.asset_type || asset.asset_type === options.asset_type));
  if (!options.all_versions) {
    const latest = new Map<string, AssetRecord>();
    for (const asset of assets) {
      const prior = latest.get(asset.asset_id);
      if (!prior || prior.version < asset.version) latest.set(asset.asset_id, asset);
    }
    assets = [...latest.values()];
  }
  return assets.sort((a, b) => a.asset_id.localeCompare(b.asset_id) || b.version - a.version).slice(0, limit).map(toL0);
}

export function getL1Card(snapshot: AssetRegistrySnapshot, ref: AssetRef): L1AssetCard {
  const record = recordByRef(snapshot, ref);
  const usageResult = usage(snapshot, ref);
  return {
    ...toL0(record),
    inputs: structuredClone(record.inputs),
    outputs: structuredClone(record.outputs),
    domain_scope: record.domain_scope,
    business_domains: [...record.business_domains],
    owner: record.owner,
    reuse_status: record.reuse_status,
    binding: structuredClone(record.binding),
    connection: structuredClone(record.connection),
    workflow_profile: structuredClone(record.workflow_profile),
    exposure: structuredClone(record.exposure),
    runtime_requirements: [...record.runtime_requirements],
    source_refs: [...record.source_refs],
    handbook_refs: [...record.handbook_refs],
    usage_count: usageResult.usage_count,
    dependents: usageResult.dependents,
  };
}

export function getL2Contract(snapshot: AssetRegistrySnapshot, ref: AssetRef): AssetRecord {
  return recordByRef(snapshot, ref);
}

export function compareVersions(snapshot: AssetRegistrySnapshot, assetId: string, fromVersion: number, toVersion: number): VersionComparison {
  const from = resolveExact(snapshot, assetId, fromVersion);
  const to = resolveExact(snapshot, assetId, toVersion);
  const changedFields = CONTRACT_KEYS.filter((key) => canonicalize(from[key]) !== canonicalize(to[key]));
  return {
    asset_id: assetId,
    from_version: fromVersion,
    to_version: toVersion,
    same_contract: changedFields.length === 0,
    from_contract_hash: from.contract_hash,
    to_contract_hash: to.contract_hash,
    changed_fields: [...changedFields],
  };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim();
}

function fieldFacts(kind: "input" | "output", requested: ContractRequirement[] | undefined, actual: ContractField[]): CompatibilityFact[] {
  return (requested ?? []).map((requirement) => {
    const exact = actual.find((field) => normalizeText(field.name) === normalizeText(requirement.name) && normalizeText(field.type) === normalizeText(requirement.type));
    const sameName = actual.find((field) => normalizeText(field.name) === normalizeText(requirement.name));
    const required = requirement.required !== false;
    return {
      fact: `${kind}:${requirement.name}:${requirement.type}`,
      matched: !!exact,
      required,
      detail: exact ? "name and type match" : sameName ? `type mismatch: ${sameName.type}` : `${kind} missing`,
    };
  });
}

function scalarFact(fact: string, requested: string | undefined, actual: string, required = true): CompatibilityFact[] {
  if (requested === undefined) return [];
  const matched = normalizeText(requested) === normalizeText(actual);
  return [{ fact, matched, required, detail: matched ? `${fact} matches` : `expected ${requested}, found ${actual}` }];
}

function evaluateCandidate(record: AssetRecord, query: AssetSearchQuery): { facts: CompatibilityFact[]; rejections: string[]; grade: MatchGrade; lexical: number } {
  const facts: CompatibilityFact[] = [
    ...scalarFact("asset_type", query.asset_type, record.asset_type),
    ...fieldFacts("input", query.required_inputs, record.inputs),
    ...fieldFacts("output", query.required_outputs, record.outputs),
    ...scalarFact("side_effect_class", query.side_effect_class, record.side_effect_class),
    ...scalarFact("domain_scope", query.domain_scope, record.domain_scope),
    ...scalarFact("business_domain", query.business_domain, record.business_domains.find((domain) => normalizeText(domain) === normalizeText(query.business_domain ?? "")) ?? "none"),
    ...scalarFact("owner", query.owner, record.owner),
    ...scalarFact("binding_kind", query.binding_kind, record.binding?.kind ?? "none"),
    ...scalarFact("exposure_protocol", query.exposure_protocol, record.exposure?.protocol ?? "none"),
    ...(query.runtime_requirements ?? []).map((requirement) => {
      const matched = record.runtime_requirements.some((actual) => normalizeText(actual).includes(normalizeText(requirement)));
      return { fact: `runtime:${requirement}`, matched, required: true, detail: matched ? "runtime boundary matches" : "runtime boundary missing" };
    }),
  ];
  const rejections = facts.filter((fact) => fact.required && !fact.matched).map((fact) => `${fact.fact}: ${fact.detail}`);
  if (record.status === "deprecated" && !query.include_deprecated) rejections.push("status: deprecated versions are excluded by default");

  const text = normalizeText(query.text ?? "");
  const haystack = [record.asset_id, record.name, record.responsibility, ...record.capability_tags].map(normalizeText);
  let lexical = 0;
  if (text) {
    if (normalizeText(record.asset_id) === text || normalizeText(record.name) === text || record.capability_tags.some((tag) => normalizeText(tag) === text)) lexical = 100;
    else {
      const tokens = text.split(/\s+/).filter(Boolean);
      lexical = tokens.reduce((score, token) => score + (haystack.some((value) => value.includes(token)) ? 10 : 0), 0);
    }
  }
  if (text && lexical === 0 && facts.every((fact) => !fact.required)) {
    rejections.push("text: no lexical or capability-tag match");
  }
  if (rejections.length > 0) return { facts, rejections, grade: "none", lexical };

  const optionalMismatches = facts.filter((fact) => !fact.required && !fact.matched).length;
  const requestedRequired = facts.filter((fact) => fact.required).length;
  const exactShape = (query.required_inputs?.length ?? 0) === record.inputs.length
    && (query.required_outputs?.length ?? 0) === record.outputs.length
    && facts.every((fact) => fact.matched);
  const grade: MatchGrade = exactShape && (text === "" || lexical === 100)
    ? "exact"
    : optionalMismatches > 0 || (text !== "" && lexical === 0 && requestedRequired === 0)
      ? "partial"
      : "compatible";
  return { facts, rejections, grade, lexical };
}

export function search(snapshot: AssetRegistrySnapshot, query: AssetSearchQuery): AssetSearchBundle {
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit <= 0)) {
    throw new AssetRegistryError(400, "invalid_search_limit", "Search limit must be a positive integer");
  }
  const limit = Math.min(query.limit ?? 20, 20);
  const latest = new Map<string, AssetRecord>();
  for (const asset of snapshot.assets) {
    if (!query.include_deprecated && asset.status !== "published") continue;
    if (query.include_deprecated && !["published", "deprecated"].includes(asset.status)) continue;
    const prior = latest.get(asset.asset_id);
    if (!prior || prior.version < asset.version) latest.set(asset.asset_id, asset);
  }
  const evaluated = [...latest.values()]
    .sort((a, b) => a.asset_id.localeCompare(b.asset_id))
    .map((record) => ({ record, ...evaluateCandidate(record, query) }));
  const results = evaluated
    .filter((candidate) => candidate.grade !== "none")
    .sort((a, b) => {
      const gradeScore = { exact: 3, compatible: 2, partial: 1, none: 0 } as const;
      return gradeScore[b.grade] - gradeScore[a.grade] || b.lexical - a.lexical || a.record.asset_id.localeCompare(b.record.asset_id);
    })
    .slice(0, limit)
    .map((candidate): AssetSearchResult => ({
      card: toL0(candidate.record),
      match_grade: candidate.grade as Exclude<MatchGrade, "none">,
      compatibility_facts: candidate.facts,
      lexical_score: candidate.lexical,
      warnings: candidate.record.status === "deprecated" ? ["deprecated version"] : [],
    }));
  return {
    registry_revision: snapshot.registry_revision,
    query: structuredClone(query),
    candidates_considered_count: evaluated.length,
    candidates_considered: evaluated.slice(0, 20).map((candidate) => ({
      asset_id: candidate.record.asset_id,
      version: candidate.record.version,
      accepted: candidate.grade !== "none",
      match_grade: candidate.grade,
      compatibility_facts: candidate.facts,
      rejection_reasons: candidate.rejections,
    })),
    results,
  };
}

function documentFromSnapshot(snapshot: AssetRegistrySnapshot): AssetRegistryDocument {
  return { schema_version: 1, assets: snapshot.assets.map((asset) => structuredClone(asset)) };
}

function findMutableRecord(document: AssetRegistryDocument, ref: AssetRef): AssetRecord {
  const record = document.assets.find((asset) => asset.asset_id === ref.asset_id && asset.version === ref.version);
  if (!record) throw new AssetRegistryError(404, "asset_not_found", `Asset not found: ${refKey(ref)}`);
  return record;
}

function ensureExpectedRevision(snapshot: AssetRegistrySnapshot, expectedRevision: string): void {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) throw new AssetRegistryError(400, "invalid_registry_revision", "expected registry revision must be a lowercase SHA-256");
  if (snapshot.registry_revision !== expectedRevision) {
    throw new AssetRegistryError(409, "registry_revision_conflict", "Asset Registry changed since it was read", {
      expected: expectedRevision,
      actual: snapshot.registry_revision,
    });
  }
}

function prepareContract(input: AssetContractInput): AssetContractInput {
  const object = expectObject(input as unknown, "contract");
  validateContractShape(object, "contract");
  return structuredClone(input);
}

function wait(milliseconds: number): void {
  const array = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(array, 0, 0, milliseconds);
}

function acquireLock(lockPath: string, timeoutMs: number): number {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeFileSync(fd, `${process.pid}\n`, "utf8");
      fsyncSync(fd);
      return fd;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw new AssetRegistryError(500, "registry_lock_failed", "Unable to acquire Asset Registry lock", { cause: String(error) });
      if (Date.now() >= deadline) throw new AssetRegistryError(423, "registry_lock_timeout", "Timed out waiting for Asset Registry lock");
      wait(20);
    }
  }
}

function atomicWrite(registryPath: string, document: AssetRegistryDocument): void {
  const bytes = canonicalRegistryBytes(document);
  const directory = dirname(registryPath);
  const tempPath = join(directory, `.${process.pid}.${Date.now()}.asset-registry.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, "wx", 0o644);
    writeFileSync(fd, bytes, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tempPath, registryPath);
    const directoryFd = openSync(directory, "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(tempPath)) rmSync(tempPath, { force: true });
    throw error instanceof AssetRegistryError
      ? error
      : new AssetRegistryError(500, "registry_write_failed", "Unable to atomically write Asset Registry", { cause: String(error) });
  }
}

export interface AssetRegistryServiceOptions {
  lock_path?: string;
  lock_timeout_ms?: number;
}

export class AssetRegistryService {
  readonly registryPath: string;
  readonly lockPath: string;
  readonly lockTimeoutMs: number;

  constructor(registryPath: string, options: AssetRegistryServiceOptions = {}) {
    this.registryPath = resolve(registryPath);
    const repositoryRoot = resolve(dirname(this.registryPath), "..");
    this.lockPath = resolve(options.lock_path ?? join(repositoryRoot, ".agent-factory", "workspace-projection", "asset-registry.lock"));
    this.lockTimeoutMs = options.lock_timeout_ms ?? 5_000;
    const stateDirectory = dirname(this.lockPath);
    mkdirSync(stateDirectory, { recursive: true });
  }

  loadSnapshot(): AssetRegistrySnapshot { return loadSnapshot(this.registryPath); }
  list(options: Parameters<typeof list>[1] = {}): L0AssetCard[] { return list(this.loadSnapshot(), options); }
  getL1(ref: AssetRef): L1AssetCard { return getL1Card(this.loadSnapshot(), ref); }
  getL2(ref: AssetRef): AssetRecord { return getL2Contract(this.loadSnapshot(), ref); }
  resolveExact(assetId: string, version: number): AssetRecord { return resolveExact(this.loadSnapshot(), assetId, version); }
  resolveActive(assetId: string): AssetRecord { return resolveActive(this.loadSnapshot(), assetId); }
  compare(assetId: string, fromVersion: number, toVersion: number): VersionComparison { return compareVersions(this.loadSnapshot(), assetId, fromVersion, toVersion); }
  usage(ref: AssetRef): UsageResult { return usage(this.loadSnapshot(), ref); }
  search(query: AssetSearchQuery): AssetSearchBundle { return search(this.loadSnapshot(), query); }

  private mutate(expectedRevision: string, operation: (document: AssetRegistryDocument) => void): AssetRegistrySnapshot {
    const lockFd = acquireLock(this.lockPath, this.lockTimeoutMs);
    try {
      const snapshot = loadSnapshot(this.registryPath);
      ensureExpectedRevision(snapshot, expectedRevision);
      const document = documentFromSnapshot(snapshot);
      operation(document);
      const validated = validateRegistryDocument(document);
      atomicWrite(this.registryPath, validated);
      return loadSnapshot(this.registryPath);
    } finally {
      closeSync(lockFd);
      unlinkSync(this.lockPath);
    }
  }

  createDraft(input: AssetContractInput, expectedRevision: string, createdBy: string): AssetRegistrySnapshot {
    const contract = prepareContract(input);
    expectString(createdBy, "created_by");
    return this.mutate(expectedRevision, (document) => {
      const existing = document.assets.filter((asset) => asset.asset_id === contract.asset_id);
      if (existing.some((asset) => asset.status === "draft" || asset.status === "reviewed")) {
        throw new AssetRegistryError(409, "draft_conflict", `An unpublished version already exists for ${contract.asset_id}`);
      }
      if (existing.some((asset) => asset.asset_type !== contract.asset_type)) {
        throw new AssetRegistryError(409, "asset_type_changed", `${contract.asset_id} cannot change asset type`);
      }
      const version = existing.length === 0 ? 1 : Math.max(...existing.map((asset) => asset.version)) + 1;
      const record: AssetRecord = {
        ...contract,
        version,
        status: "draft",
        contract_hash: computeContractHash(contract),
        lifecycle: { created_by: createdBy },
      };
      document.assets.push(record);
    });
  }

  updateDraft(ref: AssetRef, input: AssetContractInput, expectedRevision: string): AssetRegistrySnapshot {
    const contract = prepareContract(input);
    if (contract.asset_id !== ref.asset_id) throw new AssetRegistryError(409, "asset_identity_changed", "Draft asset_id cannot change");
    return this.mutate(expectedRevision, (document) => {
      const record = findMutableRecord(document, ref);
      if (record.status !== "draft") throw new AssetRegistryError(409, "published_contract_immutable", "Only draft contracts can be updated");
      if (record.asset_type !== contract.asset_type) throw new AssetRegistryError(409, "asset_type_changed", "Asset type cannot change across versions");
      const lifecycle = record.lifecycle;
      Object.assign(record, contract, { version: ref.version, status: "draft", contract_hash: computeContractHash(contract), lifecycle });
    });
  }

  markReviewed(ref: AssetRef, decision: UserDecision, expectedRevision: string): AssetRegistrySnapshot {
    const validatedDecision = validateDecision(structuredClone(decision), "review_decision") as UserDecision;
    return this.mutate(expectedRevision, (document) => {
      const record = findMutableRecord(document, ref);
      if (record.status !== "draft") throw new AssetRegistryError(409, "invalid_asset_transition", "Only draft assets can be reviewed");
      record.status = "reviewed";
      record.lifecycle.review_decision = validatedDecision;
    });
  }

  publish(ref: AssetRef, decision: PublishDecision, expectedRevision: string): AssetRegistrySnapshot {
    const validatedDecision = validateDecision(structuredClone(decision), "publish_decision", true) as PublishDecision;
    return this.mutate(expectedRevision, (document) => {
      const record = findMutableRecord(document, ref);
      if (record.status !== "reviewed") throw new AssetRegistryError(409, "invalid_asset_transition", "Only reviewed assets can be published");
      const unavailableDependencies = record.depends_on.filter((dependency) => {
        const target = document.assets.find((asset) => (
          asset.asset_id === dependency.asset_id && asset.version === dependency.version
        ));
        return target?.status !== "published";
      });
      if (unavailableDependencies.length > 0) {
        throw new AssetRegistryError(
          409,
          "dependency_not_published",
          "Published assets may depend only on published asset versions",
          { dependencies: unavailableDependencies },
        );
      }
      if (document.assets.some((asset) => asset.asset_id === ref.asset_id && asset.version === ref.version && asset !== record && asset.status === "published")) {
        throw new AssetRegistryError(409, "version_conflict", `Published version already exists: ${refKey(ref)}`);
      }
      record.status = "published";
      record.lifecycle.publish_decision = validatedDecision;
    });
  }

  deprecate(ref: AssetRef, decision: UserDecision, expectedRevision: string): AssetRegistrySnapshot {
    const validatedDecision = validateDecision(structuredClone(decision), "deprecation_decision") as UserDecision;
    return this.mutate(expectedRevision, (document) => {
      const record = findMutableRecord(document, ref);
      if (record.status !== "published") throw new AssetRegistryError(409, "invalid_asset_transition", "Only published assets can be deprecated");
      record.status = "deprecated";
      record.lifecycle.deprecation_decision = validatedDecision;
    });
  }
}
