#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  AssetRegistryError,
  AssetRegistryService,
  computeContractHash,
  resolveExact,
  validateAssetContract,
  validateAssetRecord,
} from "../packages/agent-factory-core/src/assetRegistry.ts";
import {
  createAfWorkItemManifest,
  parseAfWorkItemManifest,
  serializeAfWorkItemManifest,
} from "../packages/web/src/analyzer/afWorkItem.ts";
import { createWorkItemRevision } from "../packages/web/server/workItemRevision.ts";

const EXIT = Object.freeze({
  success: 0,
  internal: 1,
  usage: 2,
  validation: 3,
  notFound: 4,
  conflict: 5,
  io: 6,
  bridge: 7,
});

const ASSET_TYPES = ["agent", "workflow", "tool"];
const SIDE_EFFECT_CLASSES = ["none", "read_only", "write", "external_action"];
const DOMAIN_SCOPES = ["domain_specific", "cross_domain", "domain_neutral"];
const BINDING_KINDS = ["function", "mcp", "built_in", "a2a", "unresolved", "none"];
const EXPOSURE_PROTOCOLS = ["a2a", "none"];
const COMPANION_ROLES = ["plan", "materialization"];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const WORK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMPANION_CONTRACT_VERSION = 2;
const ENDPOINT_PATH = ".agent-factory/codex-bridge/v2/endpoint.json";
const ENROLLMENT_START = "[AF_COMPANION_ENROLLMENT_V2]";
const ENROLLMENT_END = "[/AF_COMPANION_ENROLLMENT_V2]";
const HANDOFF_START = "[AF_COMPANION_HANDOFF_V2]";
const HANDOFF_END = "[/AF_COMPANION_HANDOFF_V2]";
const PUBLIC_TICKET_FIELDS = [
  "ticket_id",
  "workspace_eligibility",
  "workspace_id",
  "application_id",
  "work_id",
  "requested_role",
  "activation_origin",
  "canonical_cwd_digest",
  "issued_at",
  "expires_at",
  "status",
  "claimed_by_session_id",
  "claimed_at",
];
const PUBLIC_HANDOFF_FIELDS = [
  "handoff_id",
  "workspace_id",
  "application_id",
  "work_id",
  "from_session_id",
  "from_turn_id",
  "discovery_revision",
  "decision_revision",
  "plan_body_hash",
  "marker_digest",
  "capsule_digest",
  "target_skill",
  "transport_capability",
  "status",
  "created_at",
  "expires_at",
  "claimed_by_session_id",
  "claimed_by_turn_id",
  "claimed_at",
  "target_session_id",
  "failure_code",
];

class CliError extends Error {
  constructor(code, message, exitCode, details) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

const valueOption = (key) => ({ key, kind: "value" });
const repeatOption = (key) => ({ key, kind: "repeat" });
const booleanOption = (key) => ({ key, kind: "boolean" });

const ROOT_OPTIONS = {
  "--root": valueOption("root"),
};

const REGISTRY_OPTIONS = {
  ...ROOT_OPTIONS,
  "--registry": valueOption("registry"),
};

function usage(message) {
  throw new CliError("usage_error", message, EXIT.usage);
}

function validation(code, message, details) {
  throw new CliError(code, message, EXIT.validation, details);
}

function parseOptions(args, definitions) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const separator = token.indexOf("=");
    const flag = separator === -1 ? token : token.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : token.slice(separator + 1);
    const definition = definitions[flag];
    if (!definition) usage(`unknown option: ${flag}`);
    if (definition.kind === "boolean") {
      if (inlineValue !== undefined) usage(`${flag} does not accept a value`);
      if (Object.hasOwn(options, definition.key)) usage(`duplicate option: ${flag}`);
      options[definition.key] = true;
      continue;
    }
    const value = inlineValue ?? args[++index];
    if (value === undefined || value.startsWith("--")) usage(`${flag} requires a value`);
    if (definition.kind === "repeat") {
      (options[definition.key] ??= []).push(value);
    } else {
      if (Object.hasOwn(options, definition.key)) usage(`duplicate option: ${flag}`);
      options[definition.key] = value;
    }
  }
  return { options, positionals };
}

function requirePositionals(positionals, expected, synopsis) {
  if (positionals.length !== expected) usage(`expected ${synopsis}`);
}

function rootFrom(options) {
  return resolve(options.root ?? process.cwd());
}

function registryPathFrom(options) {
  const root = rootFrom(options);
  return resolve(root, options.registry ?? "catalog/asset-registry.json");
}

function serviceFrom(options) {
  return new AssetRegistryService(registryPathFrom(options));
}

function resolveInputPath(root, inputPath) {
  return isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath);
}

async function readJsonFile(path, label) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw fileError(error, `${label} not found`, path);
  }
  try {
    return JSON.parse(source);
  } catch {
    validation("invalid_json", `${label} must contain valid JSON`, { path });
  }
}

function parseAssetRef(value) {
  const match = /^(.+)@([1-9][0-9]*)$/.exec(value);
  if (!match) usage("asset reference must use <asset-id>@<positive-version>");
  return { asset_id: match[1], version: Number(match[2]) };
}

function parseVersion(value, label) {
  if (!/^[1-9][0-9]*$/.test(value)) usage(`${label} must be a positive integer`);
  return Number(value);
}

function requireEnum(value, allowed, flag) {
  if (value !== undefined && !allowed.includes(value)) {
    usage(`${flag} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function requireExpectedRevision(options) {
  const revision = options.expectedRevision;
  if (revision === undefined) usage("--expected-revision is required");
  if (!SHA256_PATTERN.test(revision)) usage("--expected-revision must be a lowercase SHA-256");
  return revision;
}

function fileError(error, message, path) {
  if (error?.code === "ENOENT") return new CliError("file_not_found", message, EXIT.notFound, { path });
  if (error?.code === "EACCES" || error?.code === "EPERM") {
    return new CliError("file_access_denied", `cannot access file: ${path}`, EXIT.io);
  }
  return new CliError("file_io_error", `file operation failed: ${path}`, EXIT.io);
}

async function workInit(args) {
  const { options, positionals } = parseOptions(args, ROOT_OPTIONS);
  requirePositionals(positionals, 1, "work init <work-id> [--root PATH]");
  const [workId] = positionals;
  if (!WORK_ID_PATTERN.test(workId)) usage("work-id must be a lowercase repository identifier of at most 64 characters");
  const root = rootFrom(options);
  const manifest = createAfWorkItemManifest(workId);
  const path = resolve(root, manifest.artifact_root, "af-work-item.json");
  try {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, serializeAfWorkItemManifest(manifest), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new CliError("work_item_exists", `Work Item already exists: ${workId}`, EXIT.conflict, { path });
    }
    throw fileError(error, "unable to create Work Item", path);
  }
  return { created: true, path, work_item: manifest };
}

async function resolveWorkItemPath(root, value) {
  if (WORK_ID_PATTERN.test(value)) return resolve(root, "artifacts", "af", value, "af-work-item.json");
  const path = resolveInputPath(root, value);
  try {
    return (await stat(path)).isDirectory() ? resolve(path, "af-work-item.json") : path;
  } catch (error) {
    throw fileError(error, "Work Item not found", path);
  }
}

async function requireCompanionWorkItem(root, workId) {
  const path = resolve(root, "artifacts", "af", workId, "af-work-item.json");
  let canonicalRoot;
  let canonicalPath;
  let source;
  try {
    canonicalRoot = await realpath(root);
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      validation("invalid_work_item", "Companion Work Item must be a regular file inside the repository", { path });
    }
    canonicalPath = await realpath(path);
    if (!isContained(canonicalRoot, canonicalPath) || !(await stat(canonicalPath)).isFile()) {
      validation("invalid_work_item", "Companion Work Item must be a regular file inside the repository", { path });
    }
    source = await readFile(canonicalPath, "utf8");
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw fileError(error, "Companion Work Item not found", path);
  }
  let manifest;
  try {
    manifest = parseAfWorkItemManifest(source, canonicalPath);
  } catch (error) {
    validation("work_item_validation_failed", error instanceof Error ? error.message : "Work Item validation failed", { path: canonicalPath });
  }
  if (manifest.work_id !== workId || manifest.artifact_root !== `artifacts/af/${workId}`) {
    validation("invalid_work_item", "Companion Work Item scope does not match --work", { path: canonicalPath });
  }
  return manifest;
}

async function workValidate(args) {
  const { options, positionals } = parseOptions(args, ROOT_OPTIONS);
  requirePositionals(positionals, 1, "work validate <work-id-or-path> [--root PATH]");
  const path = await resolveWorkItemPath(rootFrom(options), positionals[0]);
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw fileError(error, "Work Item not found", path);
  }
  let manifest;
  try {
    manifest = parseAfWorkItemManifest(source, path);
  } catch (error) {
    validation("work_item_validation_failed", error instanceof Error ? error.message : "Work Item validation failed", { path });
  }
  return { valid: true, path, work_item: manifest };
}

function assertRepositoryRelativePath(value, label) {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    usage(`${label} must be repository-relative`);
  }
  if (normalized.split("/").includes("..")) usage(`${label} must not contain traversal segments`);
  return normalized;
}

function isContained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

async function revisionSubject(root, pair) {
  const separator = pair.indexOf("=");
  if (separator <= 0 || separator === pair.length - 1) usage("revision subjects must use ref=path");
  const ref = assertRepositoryRelativePath(pair.slice(0, separator), "revision subject ref");
  const relativePath = assertRepositoryRelativePath(pair.slice(separator + 1), "revision subject path");
  let canonicalRoot;
  let canonicalPath;
  try {
    canonicalRoot = await realpath(root);
    canonicalPath = await realpath(resolve(root, relativePath));
  } catch (error) {
    throw fileError(error, "revision subject file not found", resolve(root, relativePath));
  }
  if (!isContained(canonicalRoot, canonicalPath)) usage("revision subject path must remain inside the repository root");
  let fileStat;
  let content;
  try {
    fileStat = await stat(canonicalPath);
    if (!fileStat.isFile()) usage("revision subjects must identify regular files");
    content = await readFile(canonicalPath);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw fileError(error, "unable to read revision subject", canonicalPath);
  }
  return { ref, content };
}

async function workRevision(args) {
  const { options, positionals } = parseOptions(args, {
    ...ROOT_OPTIONS,
    "--registry-revision": valueOption("registryRevision"),
  });
  if (options.registryRevision === undefined) usage("--registry-revision is required");
  if (positionals.length === 0) usage("work revision requires at least one ref=path subject");
  const registryRevision = options.registryRevision === "null" ? null : options.registryRevision;
  if (registryRevision !== null && !SHA256_PATTERN.test(registryRevision)) {
    usage("--registry-revision must be a lowercase SHA-256 or null");
  }
  const root = rootFrom(options);
  const subjects = await Promise.all(positionals.map((pair) => revisionSubject(root, pair)));
  try {
    return createWorkItemRevision(subjects, registryRevision);
  } catch (error) {
    usage(error instanceof Error ? error.message : "invalid revision subjects");
  }
}

function validatedEndpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) validation("invalid_bridge_endpoint", "bridge endpoint must be an object");
  if (value.schema_version !== COMPANION_CONTRACT_VERSION
    || typeof value.token !== "string" || value.token.length < 32
    || typeof value.bridge_instance_id !== "string" || !value.bridge_instance_id) {
    validation("invalid_bridge_endpoint", "bridge endpoint contract is invalid");
  }
  let url;
  try {
    url = new URL(value.url);
  } catch {
    validation("invalid_bridge_endpoint", "bridge endpoint URL is invalid");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)
    || !url.port || url.username || url.password || url.search || url.hash
    || (url.pathname !== "/" && url.pathname !== "")) {
    validation("invalid_bridge_endpoint", "bridge endpoint must be a loopback HTTP origin");
  }
  return { url: url.origin, token: value.token, bridgeInstanceId: value.bridge_instance_id };
}

function redactSecret(value, secret) {
  if (typeof value === "string") return value.split(secret).join("[redacted]");
  if (Array.isArray(value)) return value.map((entry) => redactSecret(entry, secret));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactSecret(entry, secret)]));
  }
  return value;
}

async function readCompanionEndpoint(root) {
  const endpointPath = resolve(root, ENDPOINT_PATH);
  return validatedEndpoint(await readJsonFile(endpointPath, "Codex Bridge endpoint"));
}

async function bridgePost(endpoint, pathname, payload, fallbackMessage) {
  let response;
  try {
    response = await fetch(`${endpoint.url}${pathname}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${endpoint.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new CliError("bridge_unavailable", fallbackMessage, EXIT.bridge);
  }
  const source = await response.text();
  let body;
  try {
    body = source ? JSON.parse(source) : {};
  } catch {
    throw new CliError("invalid_bridge_response", "Codex Bridge returned invalid JSON", EXIT.bridge);
  }
  const safeBody = redactSecret(body, endpoint.token);
  if (!response.ok) {
    const bridgeError = safeBody?.error;
    const code = typeof bridgeError?.code === "string" ? bridgeError.code : "bridge_request_failed";
    const message = typeof bridgeError?.message === "string" ? bridgeError.message : fallbackMessage;
    const exitCode = response.status === 404 ? EXIT.notFound : response.status === 409 ? EXIT.conflict : EXIT.bridge;
    throw new CliError(code, message, exitCode, { status: response.status });
  }
  return body;
}

function companionScopeOptions(args, synopsis) {
  const { options, positionals } = parseOptions(args, {
    ...ROOT_OPTIONS,
    "--application": valueOption("applicationId"),
    "--work": valueOption("workId"),
    "--role": valueOption("role"),
  });
  requirePositionals(positionals, 0, synopsis);
  if (!options.applicationId || !IDENTIFIER_PATTERN.test(options.applicationId)) {
    usage("--application must be an explicit application identifier");
  }
  if (!options.workId || !WORK_ID_PATTERN.test(options.workId)) {
    usage("--work must be a valid Work Item identifier");
  }
  requireEnum(options.role, COMPANION_ROLES, "--role");
  if (!options.role) usage("--role is required");
  return { options, root: rootFrom(options) };
}

async function companionEnroll(args, mode) {
  const synopsis = `companion ${mode} --application ID --work ID --role plan|materialization [--root PATH]`;
  const { options, root } = companionScopeOptions(args, synopsis);
  await requireCompanionWorkItem(root, options.workId);
  const endpoint = await readCompanionEndpoint(root);
  const activationOrigin = mode === "start" ? "af_cli_launch" : "explicit_join_capsule";
  const receipt = await bridgePost(endpoint, "/v1/enrollments", {
    application_id: options.applicationId,
    work_id: options.workId,
    requested_role: options.role,
    activation_origin: activationOrigin,
  }, "Codex Bridge enrollment request failed");
  const validated = validatedEnrollmentReceipt(receipt, {
    applicationId: options.applicationId,
    workId: options.workId,
    role: options.role,
    activationOrigin,
  });
  const launch = await launchCodex(root, [], validated.activationCapsule);
  return { launched: true, ticket: validated.ticket, command: ["codex"], exit_code: launch.exitCode };
}

async function companionContinue(args) {
  const { options, positionals } = parseOptions(args, {
    ...ROOT_OPTIONS,
    "--handoff": valueOption("handoffId"),
  });
  requirePositionals(positionals, 0, "companion continue --handoff ID [--root PATH]");
  if (!options.handoffId || !IDENTIFIER_PATTERN.test(options.handoffId)) {
    usage("--handoff must be an explicit handoff identifier");
  }
  const root = rootFrom(options);
  const endpoint = await readCompanionEndpoint(root);
  const encodedHandoff = encodeURIComponent(options.handoffId);
  const receipt = await bridgePost(
    endpoint,
    `/v1/handoffs/${encodedHandoff}/continue`,
    { confirmation: "CONTINUE_COMPANION_HANDOFF" },
    "Codex Bridge handoff continuation request failed",
  );
  const validated = validatedContinueReceipt(receipt, options.handoffId);
  const launch = await launchCodex(root, validated.command.slice(1), null);
  return {
    launched: true,
    handoff: validated.handoff,
    command: ["codex", "[handoff-capsule]"],
    exit_code: launch.exitCode,
  };
}

async function companionReset(args) {
  const { options, positionals } = parseOptions(args, {
    ...ROOT_OPTIONS,
    "--confirm": booleanOption("confirm"),
  });
  requirePositionals(positionals, 0, "companion reset --confirm [--root PATH]");
  if (!options.confirm) usage("companion reset requires --confirm");
  const endpoint = await readCompanionEndpoint(rootFrom(options));
  const result = await bridgePost(
    endpoint,
    "/v1/state/reset",
    { confirmation: "RESET_COMPANION_STATE_V2" },
    "Codex Bridge state reset failed",
  );
  return redactSecret(result, endpoint.token);
}

function validatedEnrollmentReceipt(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !value.ticket || typeof value.ticket !== "object" || Array.isArray(value.ticket)) {
    validation("invalid_bridge_response", "Codex Bridge returned an invalid enrollment receipt");
  }
  const ticket = value.ticket;
  if (typeof ticket.ticket_id !== "string" || !ticket.ticket_id
    || ticket.application_id !== expected.applicationId
    || ticket.work_id !== expected.workId
    || ticket.requested_role !== expected.role
    || ticket.activation_origin !== expected.activationOrigin
    || ticket.status !== "pending") {
    validation("invalid_bridge_response", "Codex Bridge enrollment receipt does not match the requested scope");
  }
  const activationCapsule = requireCapsule(value.activation_capsule, ENROLLMENT_START, ENROLLMENT_END);
  requireCommandArray(value.command);
  return { ticket: publicFields(ticket, PUBLIC_TICKET_FIELDS), activationCapsule };
}

function validatedContinueReceipt(value, handoffId) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !value.handoff || typeof value.handoff !== "object" || Array.isArray(value.handoff)
    || value.handoff.handoff_id !== handoffId) {
    validation("invalid_bridge_response", "Codex Bridge returned an invalid handoff receipt");
  }
  const capsule = requireCapsule(value.activation_capsule, HANDOFF_START, HANDOFF_END);
  const command = requireContinueCommand(value.command, capsule);
  return { handoff: publicFields(value.handoff, PUBLIC_HANDOFF_FIELDS), command };
}

function requireCapsule(value, start, end) {
  if (typeof value !== "string" || value !== value.trim() || !value.startsWith(start) || !value.endsWith(end)) {
    validation("invalid_bridge_response", "Codex Bridge returned an invalid activation capsule");
  }
  const body = value.slice(start.length, -end.length);
  if (!body.trim()) {
    validation("invalid_bridge_response", "Codex Bridge returned an invalid activation capsule");
  }
  return value;
}

function requireCommandArray(value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) {
    validation("invalid_bridge_response", "Codex Bridge returned an invalid Codex command");
  }
  return value;
}

function requireContinueCommand(value, capsule) {
  requireCommandArray(value);
  if (value.length !== 2 || value[0] !== "codex" || value[1] !== capsule) {
    validation("invalid_bridge_response", "Codex Bridge command does not carry the activation capsule");
  }
  return value;
}

function publicFields(value, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]]));
}

async function launchCodex(root, args, enrollmentCapsule) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("AF_COMPANION_")),
  );
  if (enrollmentCapsule !== null) environment.AF_COMPANION_ENROLLMENT = enrollmentCapsule;
  return new Promise((resolveLaunch, rejectLaunch) => {
    const child = spawn("codex", args, { cwd: root, env: environment, stdio: "inherit" });
    child.once("error", () => rejectLaunch(new CliError(
      "codex_launch_failed",
      "unable to launch Codex",
      EXIT.io,
    )));
    child.once("close", (exitCode, signal) => {
      if (signal || exitCode !== 0) {
        rejectLaunch(new CliError("codex_exit_failed", "Codex exited unsuccessfully", EXIT.io, {
          exit_code: exitCode,
          signal,
        }));
        return;
      }
      resolveLaunch({ exitCode });
    });
  });
}

function parseContractRequirement(value, flag) {
  const parts = value.split(":");
  if (parts.length < 2 || !parts[0] || !parts[1] || parts.length > 3) usage(`${flag} must use name:type[:required|optional]`);
  let required = true;
  if (parts[2] !== undefined) {
    if (parts[2] === "optional") required = false;
    else if (parts[2] !== "required") usage(`${flag} must end with required or optional when a third field is supplied`);
  }
  return { name: parts[0], type: parts[1], required };
}

function parsePositiveLimit(value) {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) usage("--limit must be a positive integer");
  return Number(value);
}

function assetSearch(args) {
  const { options, positionals } = parseOptions(args, {
    ...REGISTRY_OPTIONS,
    "--text": valueOption("text"),
    "--type": valueOption("type"),
    "--required-input": repeatOption("requiredInputs"),
    "--input": repeatOption("requiredInputs"),
    "--required-output": repeatOption("requiredOutputs"),
    "--output": repeatOption("requiredOutputs"),
    "--side-effect-class": valueOption("sideEffectClass"),
    "--domain-scope": valueOption("domainScope"),
    "--business-domain": valueOption("businessDomain"),
    "--owner": valueOption("owner"),
    "--binding-kind": valueOption("bindingKind"),
    "--exposure-protocol": valueOption("exposureProtocol"),
    "--runtime-requirement": repeatOption("runtimeRequirements"),
    "--include-deprecated": booleanOption("includeDeprecated"),
    "--limit": valueOption("limit"),
  });
  requirePositionals(positionals, 0, "asset search [filters] [--root PATH|--registry PATH]");
  const query = {
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(options.type === undefined ? {} : { asset_type: requireEnum(options.type, ASSET_TYPES, "--type") }),
    ...(options.requiredInputs === undefined ? {} : { required_inputs: options.requiredInputs.map((value) => parseContractRequirement(value, "--required-input")) }),
    ...(options.requiredOutputs === undefined ? {} : { required_outputs: options.requiredOutputs.map((value) => parseContractRequirement(value, "--required-output")) }),
    ...(options.sideEffectClass === undefined ? {} : { side_effect_class: requireEnum(options.sideEffectClass, SIDE_EFFECT_CLASSES, "--side-effect-class") }),
    ...(options.domainScope === undefined ? {} : { domain_scope: requireEnum(options.domainScope, DOMAIN_SCOPES, "--domain-scope") }),
    ...(options.businessDomain === undefined ? {} : { business_domain: options.businessDomain }),
    ...(options.owner === undefined ? {} : { owner: options.owner }),
    ...(options.bindingKind === undefined ? {} : { binding_kind: requireEnum(options.bindingKind, BINDING_KINDS, "--binding-kind") }),
    ...(options.exposureProtocol === undefined ? {} : { exposure_protocol: requireEnum(options.exposureProtocol, EXPOSURE_PROTOCOLS, "--exposure-protocol") }),
    ...(options.runtimeRequirements === undefined ? {} : { runtime_requirements: options.runtimeRequirements }),
    ...(options.includeDeprecated ? { include_deprecated: true } : {}),
    ...(options.limit === undefined ? {} : { limit: parsePositiveLimit(options.limit) }),
  };
  return serviceFrom(options).search(query);
}

function assetGet(args) {
  const { options, positionals } = parseOptions(args, {
    ...REGISTRY_OPTIONS,
    "--level": valueOption("level"),
  });
  requirePositionals(positionals, 1, "asset get <asset-id>@<version> [--level 1|2]");
  const ref = parseAssetRef(positionals[0]);
  const level = options.level ?? "1";
  if (!["1", "2"].includes(level)) usage("--level must be 1 or 2");
  const service = serviceFrom(options);
  return level === "1" ? service.getL1(ref) : service.getL2(ref);
}

function assetCompare(args) {
  const { options, positionals } = parseOptions(args, REGISTRY_OPTIONS);
  requirePositionals(positionals, 3, "asset compare <asset-id> <from-version> <to-version>");
  return serviceFrom(options).compare(
    positionals[0],
    parseVersion(positionals[1], "from-version"),
    parseVersion(positionals[2], "to-version"),
  );
}

function assetUsage(args) {
  const { options, positionals } = parseOptions(args, REGISTRY_OPTIONS);
  requirePositionals(positionals, 1, "asset usage <asset-id>@<version>");
  return serviceFrom(options).usage(parseAssetRef(positionals[0]));
}

async function assetValidate(args) {
  const { options, positionals } = parseOptions(args, {
    ...REGISTRY_OPTIONS,
    "--contract": valueOption("contract"),
  });
  if (options.contract !== undefined) {
    requirePositionals(positionals, 0, "asset validate --contract FILE");
    const contract = validateAssetContract(await readJsonFile(resolveInputPath(rootFrom(options), options.contract), "Asset contract"));
    return {
      valid: true,
      asset_id: contract.asset_id,
      asset_type: contract.asset_type,
      contract_hash: computeContractHash(contract),
    };
  }
  requirePositionals(positionals, 1, "asset validate <asset-id>@<version>");
  const ref = parseAssetRef(positionals[0]);
  const service = serviceFrom(options);
  const snapshot = service.loadSnapshot();
  const record = validateAssetRecord(resolveExact(snapshot, ref.asset_id, ref.version));
  return {
    valid: true,
    registry_revision: snapshot.registry_revision,
    asset_id: record.asset_id,
    version: record.version,
    contract_hash: record.contract_hash,
    status: record.status,
  };
}

const MUTATION_OPTIONS = {
  ...REGISTRY_OPTIONS,
  "--contract": valueOption("contract"),
  "--decision": valueOption("decision"),
  "--created-by": valueOption("createdBy"),
  "--expected-revision": valueOption("expectedRevision"),
};

function mutationOutput(snapshot, ref) {
  return {
    registry_revision: snapshot.registry_revision,
    asset: resolveExact(snapshot, ref.asset_id, ref.version),
  };
}

async function assetCreateDraft(args) {
  const { options, positionals } = parseOptions(args, MUTATION_OPTIONS);
  requirePositionals(positionals, 0, "asset create-draft --contract FILE --created-by ID --expected-revision SHA");
  if (!options.contract) usage("--contract is required");
  if (!options.createdBy) usage("--created-by is required");
  if (options.decision !== undefined) usage("--decision is not valid for asset create-draft");
  const contract = validateAssetContract(await readJsonFile(resolveInputPath(rootFrom(options), options.contract), "Asset contract"));
  const snapshot = serviceFrom(options).createDraft(contract, requireExpectedRevision(options), options.createdBy);
  const version = Math.max(...snapshot.assets.filter((asset) => asset.asset_id === contract.asset_id).map((asset) => asset.version));
  return mutationOutput(snapshot, { asset_id: contract.asset_id, version });
}

async function assetUpdateDraft(args) {
  const { options, positionals } = parseOptions(args, MUTATION_OPTIONS);
  requirePositionals(positionals, 1, "asset update-draft <asset-id>@<version> --contract FILE --expected-revision SHA");
  if (!options.contract) usage("--contract is required");
  if (options.decision !== undefined || options.createdBy !== undefined) usage("--decision and --created-by are not valid for asset update-draft");
  const ref = parseAssetRef(positionals[0]);
  const contract = validateAssetContract(await readJsonFile(resolveInputPath(rootFrom(options), options.contract), "Asset contract"));
  return mutationOutput(serviceFrom(options).updateDraft(ref, contract, requireExpectedRevision(options)), ref);
}

async function assetDecisionMutation(args, operation) {
  const { options, positionals } = parseOptions(args, MUTATION_OPTIONS);
  requirePositionals(positionals, 1, `asset ${operation} <asset-id>@<version> --decision FILE --expected-revision SHA`);
  if (!options.decision) usage("--decision is required");
  if (options.contract !== undefined || options.createdBy !== undefined) usage(`--contract and --created-by are not valid for asset ${operation}`);
  const ref = parseAssetRef(positionals[0]);
  const decision = await readJsonFile(resolveInputPath(rootFrom(options), options.decision), "Asset decision");
  const service = serviceFrom(options);
  const expectedRevision = requireExpectedRevision(options);
  const snapshot = operation === "review"
    ? service.markReviewed(ref, decision, expectedRevision)
    : operation === "publish"
      ? service.publish(ref, decision, expectedRevision)
      : service.deprecate(ref, decision, expectedRevision);
  return mutationOutput(snapshot, ref);
}

function dispatchWork(command, args) {
  if (command === "init") return workInit(args);
  if (command === "validate") return workValidate(args);
  if (command === "revision") return workRevision(args);
  usage(`unknown work command: ${command ?? "(missing)"}`);
}

function dispatchCompanion(command, args) {
  if (command === "start" || command === "join") return companionEnroll(args, command);
  if (command === "continue") return companionContinue(args);
  if (command === "reset") return companionReset(args);
  usage(`unknown companion command: ${command ?? "(missing)"}`);
}

function dispatchAsset(command, args) {
  if (command === "search") return assetSearch(args);
  if (command === "get") return assetGet(args);
  if (command === "compare") return assetCompare(args);
  if (command === "create-draft") return assetCreateDraft(args);
  if (command === "update-draft") return assetUpdateDraft(args);
  if (command === "validate") return assetValidate(args);
  if (["review", "publish", "deprecate"].includes(command)) return assetDecisionMutation(args, command);
  if (command === "usage") return assetUsage(args);
  usage(`unknown asset command: ${command ?? "(missing)"}`);
}

async function dispatch(args) {
  const [group, command, ...rest] = args;
  if (group === "work") return dispatchWork(command, rest);
  if (group === "asset") return dispatchAsset(command, rest);
  if (group === "companion") return dispatchCompanion(command, rest);
  usage("expected command group: work, asset, or companion");
}

function normalizeError(error) {
  if (error instanceof CliError) return error;
  if (error instanceof AssetRegistryError) {
    const exitCode = error.status === 404
      ? EXIT.notFound
      : [409, 423].includes(error.status)
        ? EXIT.conflict
        : error.status >= 500
          ? EXIT.io
          : error.status === 422
            ? EXIT.validation
            : EXIT.usage;
    return new CliError(error.code, error.message, exitCode, error.details);
  }
  return new CliError("internal_error", "unexpected CLI failure", EXIT.internal);
}

try {
  const result = await dispatch(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (rawError) {
  const error = normalizeError(rawError);
  const body = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  process.stderr.write(`${JSON.stringify(body)}\n`);
  process.exitCode = error.exitCode;
}
