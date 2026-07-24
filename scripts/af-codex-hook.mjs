#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  minimallyParseHookInput,
  toBridgeHookInput,
  toCodexHookOutput,
} from "./af-codex-hook-protocol.mjs";

const CONTRACT_VERSION = 2;
const STATE_RELATIVE_DIR = join(".agent-factory", "codex-bridge", "v2");
const ENDPOINT_RELATIVE_PATH = join(STATE_RELATIVE_DIR, "endpoint.json");
const LEASE_RELATIVE_DIR = join(STATE_RELATIVE_DIR, "leases");
const MAX_STDIN_BYTES = 256 * 1_024;
const REQUEST_TIMEOUT_MS = 400;
const CURRENT_ADAPTER = await realpath(fileURLToPath(import.meta.url));
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ROLES = new Set(["plan", "materialization"]);
const ACTIVATION_ORIGINS = new Set([
  "af_cli_launch",
  "af_vscode_launch",
  "plan_handoff_capsule",
  "explicit_join_capsule",
  "manual_attach_confirmed",
]);

async function readOneJsonObject() {
  const chunks = [];
  let bytes = 0;
  for await (const rawChunk of process.stdin) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    bytes += chunk.byteLength;
    if (bytes > MAX_STDIN_BYTES) throw new Error("hook input too large");
    chunks.push(chunk);
  }
  if (bytes === 0) throw new Error("empty hook input");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function findEligibleWorkspaceRoot(startDirectory) {
  if (!isAbsolute(startDirectory)) return null;
  let directory;
  try {
    directory = await realpath(startDirectory);
  } catch {
    return null;
  }
  while (true) {
    const candidate = join(directory, "scripts", "af-codex-hook.mjs");
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        const canonicalCandidate = await realpath(candidate);
        if (canonicalCandidate === CURRENT_ADAPTER) return directory;
      }
    } catch {
      // A workspace without this exact adapter is not registered for this Hook process.
    }
    const parent = dirname(directory);
    if (parent === directory || directory === parse(directory).root) return null;
    directory = parent;
  }
}

async function readLease(workspaceRoot, sessionId) {
  const leaseName = `${sha256(sessionId)}.json`;
  const leasesRoot = resolve(workspaceRoot, LEASE_RELATIVE_DIR);
  const leasePath = resolve(leasesRoot, leaseName);
  if (!isContained(workspaceRoot, leasePath)) return null;
  try {
    const info = await lstat(leasePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) return null;
    const [canonicalRoot, canonicalLease] = await Promise.all([realpath(workspaceRoot), realpath(leasePath)]);
    if (!isContained(canonicalRoot, canonicalLease)) return null;
    const value = JSON.parse(await readFile(canonicalLease, "utf8"));
    return validatedLease(value, sessionId, canonicalRoot);
  } catch {
    return null;
  }
}

function validatedLease(value, sessionId, canonicalRoot) {
  if (!isRecord(value) || value.schema_version !== CONTRACT_VERSION || value.session_id !== sessionId) return null;
  const requiredStrings = [
    "lease_id",
    "lease_token",
    "bridge_instance_id",
    "session_id",
    "canonical_cwd_digest",
    "workspace_id",
    "application_id",
    "work_id",
    "activation_origin",
    "issued_at",
    "expires_at",
  ];
  if (requiredStrings.some((key) => typeof value[key] !== "string" || !value[key])) return null;
  if (!ROLES.has(value.role) || !ACTIVATION_ORIGINS.has(value.activation_origin)) return null;
  if (!SHA256_PATTERN.test(value.canonical_cwd_digest) || value.canonical_cwd_digest !== sha256(canonicalRoot)) return null;
  if (!Number.isFinite(Date.parse(value.issued_at)) || !Number.isFinite(Date.parse(value.expires_at))) return null;
  if (Date.parse(value.expires_at) <= Date.now()) return null;
  return value;
}

async function readEndpoint(workspaceRoot) {
  return validatedEndpoint(JSON.parse(await readFile(resolve(workspaceRoot, ENDPOINT_RELATIVE_PATH), "utf8")));
}

function validatedEndpoint(value) {
  if (!isRecord(value) || value.schema_version !== CONTRACT_VERSION
    || typeof value.token !== "string" || value.token.length < 32
    || typeof value.bridge_instance_id !== "string" || !value.bridge_instance_id) {
    throw new Error("invalid endpoint");
  }
  const url = new URL(value.url);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    throw new Error("non-loopback endpoint");
  }
  if (!url.port || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("invalid endpoint URL");
  }
  return { url: url.origin, token: value.token, bridge_instance_id: value.bridge_instance_id };
}

async function run() {
  const parsed = minimallyParseHookInput(await readOneJsonObject());
  if (parsed.ignored) return;
  const workspaceRoot = await findEligibleWorkspaceRoot(parsed.event.cwd);
  if (workspaceRoot === null) return;

  const activationCapsule = parsed.activation_capsule;
  const lease = activationCapsule === null
    ? await readLease(workspaceRoot, parsed.event.session_id)
    : null;
  if (activationCapsule === null && lease === null) return;

  const endpoint = await readEndpoint(workspaceRoot);
  if (lease !== null && lease.bridge_instance_id !== endpoint.bridge_instance_id) return;
  const proof = activationCapsule === null
    ? { kind: "lease", lease_id: lease.lease_id, lease_token: lease.lease_token }
    : { kind: "activation", activation_capsule: activationCapsule };
  const payload = toBridgeHookInput(parsed.event, proof);
  const response = await fetch(`${endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${endpoint.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 204) return;
  if (!response.ok) throw new Error("bridge request failed");
  const output = toCodexHookOutput(await response.json());
  process.stdout.write(JSON.stringify(output));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isContained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

await run().catch(() => undefined);
