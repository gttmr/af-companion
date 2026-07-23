import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";

import {
  AssetRegistryError,
  AssetRegistryService,
  assetTypes,
  computeContractHash,
  registryStatuses,
  sideEffectClasses,
  validateAssetContract,
  type AssetContractInput,
  type AssetRecord,
  type AssetSearchQuery,
  type AssetType,
  type PublishDecision,
  type RegistryStatus,
  type UserDecision,
} from "../../agent-factory-core/src/assetRegistry";
import { sendJson } from "./httpApi";

type MiddlewareNext = (error?: unknown) => void;

const MAX_JSON_BYTES = 1024 * 1024;
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SEARCH_KEYS = [
  "text",
  "asset_type",
  "required_inputs",
  "required_outputs",
  "side_effect_class",
  "domain_scope",
  "business_domain",
  "owner",
  "binding_kind",
  "exposure_protocol",
  "runtime_requirements",
  "include_deprecated",
  "limit",
] as const;

class AssetRegistryHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AssetRegistryHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Route =
  | { kind: "index" }
  | { kind: "assets" }
  | { kind: "versions"; assetId: string }
  | { kind: "version"; assetId: string; version: number }
  | { kind: "compare"; assetId: string }
  | { kind: "usage"; assetId: string; version: number }
  | { kind: "search" }
  | { kind: "validate" }
  | { kind: "drafts" }
  | { kind: "draft"; assetId: string; version: number }
  | { kind: "review"; assetId: string; version: number }
  | { kind: "publish"; assetId: string; version: number }
  | { kind: "deprecate"; assetId: string; version: number };

interface ParsedRequestTarget {
  pathname: string;
  query: URLSearchParams;
}

export function createAssetRegistryMiddleware(repoRoot: string) {
  const service = new AssetRegistryService(resolve(repoRoot, "catalog", "asset-registry.json"));

  return async function assetRegistryMiddleware(
    request: IncomingMessage,
    response: ServerResponse,
    next: MiddlewareNext,
  ): Promise<void> {
    try {
      const target = parseRequestTarget(request.url);
      const route = matchRoute(target.pathname);
      if (!route) {
        sendJson(response, 404, { error: "Unknown Asset Registry path", code: "not_found" });
        return;
      }

      const method = request.method ?? "GET";
      const allowedMethod = methodForRoute(route);
      if (method !== allowedMethod) {
        response.setHeader("Allow", allowedMethod);
        sendJson(response, 405, { error: `Method ${method} is not allowed for this path`, code: "method_not_allowed" });
        return;
      }

      if (route.kind === "index") {
        requireNoQuery(target.query);
        const snapshot = service.loadSnapshot();
        const latestPublished = new Map<string, AssetRecord>();
        for (const asset of snapshot.assets) {
          if (asset.status !== "published") continue;
          const prior = latestPublished.get(asset.asset_id);
          if (!prior || prior.version < asset.version) latestPublished.set(asset.asset_id, asset);
        }
        const items = [...latestPublished.values()]
          .sort((left, right) => left.asset_id.localeCompare(right.asset_id))
          .map(toL0Card);
        const counts = { agent: 0, workflow: 0, tool: 0 };
        for (const item of items) counts[item.asset_type] += 1;
        sendRevisionJson(response, 200, snapshot.registry_revision, {
          schema_version: snapshot.schema_version,
          registry_revision: snapshot.registry_revision,
          counts,
          items,
        });
        return;
      }

      if (route.kind === "assets") {
        const options = parseListQuery(target.query);
        const snapshot = service.loadSnapshot();
        const items = service.list(options);
        sendRevisionJson(response, 200, snapshot.registry_revision, { registry_revision: snapshot.registry_revision, items });
        return;
      }

      if (route.kind === "versions") {
        requireNoQuery(target.query);
        const snapshot = service.loadSnapshot();
        const records = snapshot.assets
          .filter((asset) => asset.asset_id === route.assetId)
          .sort((left, right) => right.version - left.version);
        if (records.length === 0) {
          throw new AssetRegistryError(404, "asset_not_found", `Asset not found: ${route.assetId}`);
        }
        const items = records.map(toL0Card);
        sendRevisionJson(response, 200, snapshot.registry_revision, { registry_revision: snapshot.registry_revision, items });
        return;
      }

      if (route.kind === "version") {
        const level = parseLevelQuery(target.query);
        const asset = level === 1
          ? service.getL1({ asset_id: route.assetId, version: route.version })
          : service.getL2({ asset_id: route.assetId, version: route.version });
        const revision = service.loadSnapshot().registry_revision;
        sendRevisionJson(response, 200, revision, { registry_revision: revision, asset });
        return;
      }

      if (route.kind === "compare") {
        const { from, to } = parseCompareQuery(target.query);
        const comparison = service.compare(route.assetId, from, to);
        const revision = service.loadSnapshot().registry_revision;
        sendRevisionJson(response, 200, revision, { registry_revision: revision, comparison });
        return;
      }

      if (route.kind === "usage") {
        requireNoQuery(target.query);
        const usage = service.usage({ asset_id: route.assetId, version: route.version });
        const revision = service.loadSnapshot().registry_revision;
        sendRevisionJson(response, 200, revision, { registry_revision: revision, usage });
        return;
      }

      if (route.kind === "search") {
        requireNoQuery(target.query);
        assertJsonContentType(request);
        const query = parseSearchQuery(await readJsonBody(request));
        const bundle = service.search(query);
        sendRevisionJson(response, 200, bundle.registry_revision, bundle);
        return;
      }

      if (route.kind === "validate") {
        requireNoQuery(target.query);
        assertJsonContentType(request);
        const body = expectExactBody(await readJsonBody(request), ["contract"]);
        const contract = validateAssetContract(body.contract);
        sendJson(response, 200, { valid: true, contract_hash: computeContractHash(contract) });
        return;
      }

      requireNoQuery(target.query);
      assertMutationBoundary(request);
      assertJsonContentType(request);
      const expectedRevision = requireIfMatch(request);
      const body = await readJsonBody(request);

      if (route.kind === "drafts") {
        const parsed = expectExactBody(body, ["contract", "created_by"]);
        const snapshot = service.createDraft(
          parsed.contract as AssetContractInput,
          expectedRevision,
          parsed.created_by as string,
        );
        const assetId = (parsed.contract as { asset_id?: unknown }).asset_id;
        const asset = snapshot.assets
          .filter((record) => record.asset_id === assetId)
          .sort((left, right) => right.version - left.version)[0];
        if (!asset) throw new AssetRegistryHttpError(500, "mutation_result_missing", "Created draft was not returned by the registry");
        sendRevisionJson(response, 201, snapshot.registry_revision, mutationPayload(snapshot.registry_revision, asset));
        return;
      }

      if (route.kind === "draft") {
        const parsed = expectExactBody(body, ["contract"]);
        const snapshot = service.updateDraft(
          { asset_id: route.assetId, version: route.version },
          parsed.contract as AssetContractInput,
          expectedRevision,
        );
        const asset = mutatedAsset(snapshot.assets, route.assetId, route.version);
        sendRevisionJson(response, 200, snapshot.registry_revision, mutationPayload(snapshot.registry_revision, asset));
        return;
      }

      if (route.kind === "review") {
        const parsed = expectExactBody(body, ["decision"]);
        const snapshot = service.markReviewed(
          { asset_id: route.assetId, version: route.version },
          parsed.decision as UserDecision,
          expectedRevision,
        );
        const asset = mutatedAsset(snapshot.assets, route.assetId, route.version);
        sendRevisionJson(response, 200, snapshot.registry_revision, mutationPayload(snapshot.registry_revision, asset));
        return;
      }

      if (route.kind === "publish") {
        const parsed = expectExactBody(body, ["decision"]);
        const snapshot = service.publish(
          { asset_id: route.assetId, version: route.version },
          parsed.decision as PublishDecision,
          expectedRevision,
        );
        const asset = mutatedAsset(snapshot.assets, route.assetId, route.version);
        sendRevisionJson(response, 200, snapshot.registry_revision, mutationPayload(snapshot.registry_revision, asset));
        return;
      }

      const parsed = expectExactBody(body, ["decision"]);
      const snapshot = service.deprecate(
        { asset_id: route.assetId, version: route.version },
        parsed.decision as UserDecision,
        expectedRevision,
      );
      const asset = mutatedAsset(snapshot.assets, route.assetId, route.version);
      sendRevisionJson(response, 200, snapshot.registry_revision, mutationPayload(snapshot.registry_revision, asset));
    } catch (error) {
      handleError(error, response, next);
    }
  };
}

function parseRequestTarget(rawUrl: string | undefined): ParsedRequestTarget {
  const value = rawUrl ?? "/";
  if (!value.startsWith("/") || value.includes("#")) {
    throw badRequest("invalid_request_target", "Request target must be an absolute path without a fragment");
  }
  const separator = value.indexOf("?");
  const rawPath = separator === -1 ? value : value.slice(0, separator);
  const rawQuery = separator === -1 ? "" : value.slice(separator + 1);
  assertValidPercentEncoding(rawPath, "path");
  assertValidPercentEncoding(rawQuery, "query");
  let decodedSegments: string[];
  try {
    decodedSegments = rawPath.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    throw badRequest("invalid_path", "Request path contains invalid percent encoding");
  }
  if (decodedSegments.some((segment) => segment.includes("/") || segment.includes("\\") || /[\u0000-\u001f\u007f]/.test(segment))) {
    throw badRequest("invalid_path", "Request path contains an invalid segment");
  }
  const pathname = decodedSegments.join("/");
  return { pathname, query: new URLSearchParams(rawQuery) };
}

function assertValidPercentEncoding(value: string, field: string): void {
  for (let index = value.indexOf("%"); index !== -1; index = value.indexOf("%", index + 1)) {
    if (!/^[a-f0-9]{2}$/i.test(value.slice(index + 1, index + 3))) {
      throw badRequest(`invalid_${field}`, `Request ${field} contains invalid percent encoding`);
    }
  }
}

function matchRoute(pathname: string): Route | null {
  if (pathname === "/") return { kind: "index" };
  if (pathname === "/assets") return { kind: "assets" };
  if (pathname === "/search") return { kind: "search" };
  if (pathname === "/validate") return { kind: "validate" };
  if (pathname === "/drafts") return { kind: "drafts" };

  let match = /^\/assets\/([^/]+)\/versions$/.exec(pathname);
  if (match) return { kind: "versions", assetId: match[1] };
  match = /^\/assets\/([^/]+)\/compare$/.exec(pathname);
  if (match) return { kind: "compare", assetId: match[1] };
  match = /^\/assets\/([^/]+)\/versions\/([^/]+)\/usage$/.exec(pathname);
  if (match) return { kind: "usage", assetId: match[1], version: parsePositiveInteger(match[2], "version") };
  match = /^\/assets\/([^/]+)\/versions\/([^/]+)\/publish$/.exec(pathname);
  if (match) return { kind: "publish", assetId: match[1], version: parsePositiveInteger(match[2], "version") };
  match = /^\/assets\/([^/]+)\/versions\/([^/]+)\/deprecate$/.exec(pathname);
  if (match) return { kind: "deprecate", assetId: match[1], version: parsePositiveInteger(match[2], "version") };
  match = /^\/assets\/([^/]+)\/versions\/([^/]+)$/.exec(pathname);
  if (match) return { kind: "version", assetId: match[1], version: parsePositiveInteger(match[2], "version") };
  match = /^\/drafts\/([^/]+)\/versions\/([^/]+)\/review$/.exec(pathname);
  if (match) return { kind: "review", assetId: match[1], version: parsePositiveInteger(match[2], "version") };
  match = /^\/drafts\/([^/]+)\/versions\/([^/]+)$/.exec(pathname);
  if (match) return { kind: "draft", assetId: match[1], version: parsePositiveInteger(match[2], "version") };
  return null;
}

function methodForRoute(route: Route): "GET" | "POST" | "PUT" {
  if (["index", "assets", "versions", "version", "compare", "usage"].includes(route.kind)) return "GET";
  if (route.kind === "draft") return "PUT";
  return "POST";
}

function parseListQuery(query: URLSearchParams): {
  asset_type?: AssetType;
  statuses?: RegistryStatus[];
  all_versions?: boolean;
  limit?: number;
} {
  assertQueryKeys(query, ["asset_type", "statuses", "all_versions", "limit"]);
  const result: {
    asset_type?: AssetType;
    statuses?: RegistryStatus[];
    all_versions?: boolean;
    limit?: number;
  } = {};
  const assetType = query.get("asset_type");
  if (assetType !== null) result.asset_type = parseEnum(assetType, assetTypes, "asset_type");
  const statuses = query.get("statuses");
  if (statuses !== null) {
    const values = statuses.split(",");
    if (values.length === 0 || values.some((value) => value.length === 0) || new Set(values).size !== values.length) {
      throw badRequest("invalid_query", "statuses must be a non-empty comma-separated list without duplicates");
    }
    result.statuses = values.map((value) => parseEnum(value, registryStatuses, "statuses"));
  }
  const allVersions = query.get("all_versions");
  if (allVersions !== null) {
    if (allVersions !== "true" && allVersions !== "false") throw badRequest("invalid_query", "all_versions must be true or false");
    result.all_versions = allVersions === "true";
  }
  const limit = query.get("limit");
  if (limit !== null) result.limit = parsePositiveInteger(limit, "limit");
  return result;
}

function parseLevelQuery(query: URLSearchParams): 1 | 2 {
  assertQueryKeys(query, ["level"]);
  const value = query.get("level");
  if (value !== "1" && value !== "2") throw badRequest("invalid_query", "level must be 1 or 2");
  return value === "1" ? 1 : 2;
}

function parseCompareQuery(query: URLSearchParams): { from: number; to: number } {
  assertQueryKeys(query, ["from", "to"]);
  const from = query.get("from");
  const to = query.get("to");
  if (from === null || to === null) throw badRequest("invalid_query", "from and to are required");
  return { from: parsePositiveInteger(from, "from"), to: parsePositiveInteger(to, "to") };
}

function assertQueryKeys(query: URLSearchParams, allowed: readonly string[]): void {
  const seen = new Set<string>();
  for (const key of query.keys()) {
    if (!allowed.includes(key)) throw badRequest("invalid_query", `Unknown query parameter: ${key}`);
    if (seen.has(key)) throw badRequest("invalid_query", `Duplicate query parameter: ${key}`);
    seen.add(key);
  }
}

function requireNoQuery(query: URLSearchParams): void {
  assertQueryKeys(query, []);
}

function parsePositiveInteger(value: string, field: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw badRequest("invalid_query", `${field} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw badRequest("invalid_query", `${field} must be a safe positive integer`);
  return parsed;
}

function parseSearchQuery(value: unknown): AssetSearchQuery {
  const body = expectObject(value, "search query");
  expectExactKeys(body, SEARCH_KEYS, []);
  const result: AssetSearchQuery = {};
  if (body.text !== undefined) result.text = expectString(body.text, "text", true);
  if (body.asset_type !== undefined) result.asset_type = parseEnumValue(body.asset_type, assetTypes, "asset_type");
  if (body.required_inputs !== undefined) result.required_inputs = parseRequirements(body.required_inputs, "required_inputs");
  if (body.required_outputs !== undefined) result.required_outputs = parseRequirements(body.required_outputs, "required_outputs");
  if (body.side_effect_class !== undefined) result.side_effect_class = parseEnumValue(body.side_effect_class, sideEffectClasses, "side_effect_class");
  if (body.domain_scope !== undefined) result.domain_scope = parseEnumValue(body.domain_scope, ["domain_specific", "cross_domain", "domain_neutral"] as const, "domain_scope");
  if (body.business_domain !== undefined) result.business_domain = expectString(body.business_domain, "business_domain", true);
  if (body.owner !== undefined) result.owner = expectString(body.owner, "owner", true);
  if (body.binding_kind !== undefined) result.binding_kind = parseEnumValue(body.binding_kind, ["function", "mcp", "built_in", "a2a", "unresolved", "none"] as const, "binding_kind");
  if (body.exposure_protocol !== undefined) result.exposure_protocol = parseEnumValue(body.exposure_protocol, ["a2a", "none"] as const, "exposure_protocol");
  if (body.runtime_requirements !== undefined) result.runtime_requirements = parseStringArray(body.runtime_requirements, "runtime_requirements");
  if (body.include_deprecated !== undefined) result.include_deprecated = expectBoolean(body.include_deprecated, "include_deprecated");
  if (body.limit !== undefined) {
    if (!Number.isSafeInteger(body.limit) || (body.limit as number) <= 0) throw badRequest("invalid_request", "limit must be a positive integer");
    result.limit = body.limit as number;
  }
  return result;
}

function parseRequirements(value: unknown, field: string): Array<{ name: string; type: string; required?: boolean }> {
  if (!Array.isArray(value)) throw badRequest("invalid_request", `${field} must be an array`);
  return value.map((entry, index) => {
    const object = expectObject(entry, `${field}[${index}]`);
    expectExactKeys(object, ["name", "type", "required"], ["name", "type"]);
    return {
      name: expectString(object.name, `${field}[${index}].name`),
      type: expectString(object.type, `${field}[${index}].type`),
      ...(object.required === undefined ? {} : { required: expectBoolean(object.required, `${field}[${index}].required`) }),
    };
  });
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw badRequest("invalid_request", `${field} must be an array`);
  return value.map((entry, index) => expectString(entry, `${field}[${index}]`));
}

function expectExactBody(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const body = expectObject(value, "request body");
  expectExactKeys(body, keys, keys);
  return body;
}

function expectObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("invalid_request", `${field} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function expectExactKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw badRequest("invalid_request", "Request contains unknown fields", { fields: unknown });
  const missing = required.filter((key) => !(key in value));
  if (missing.length > 0) throw badRequest("invalid_request", "Request is missing required fields", { fields: missing });
}

function expectString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    throw badRequest("invalid_request", `${field} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  return value;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw badRequest("invalid_request", `${field} must be boolean`);
  return value;
}

function parseEnum<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw badRequest("invalid_query", `${field} has an unsupported value`);
  return value as T;
}

function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest("invalid_request", `${field} has an unsupported value`);
  }
  return value as T;
}

function assertMutationBoundary(request: IncomingMessage): void {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    throw new AssetRegistryHttpError(403, "loopback_required", "Asset Registry mutations require a loopback peer");
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") {
    throw new AssetRegistryHttpError(403, "same_origin_required", "Asset Registry mutations require a same-origin request");
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AssetRegistryHttpError(403, "same_origin_required", "Asset Registry mutations require a same-origin request");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.host.toLowerCase() !== host.toLowerCase()
    || !LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new AssetRegistryHttpError(403, "same_origin_required", "Asset Registry mutations require a same-origin request");
  }
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin") {
    throw new AssetRegistryHttpError(403, "same_origin_required", "Cross-site Asset Registry mutations are not allowed");
  }
}

function assertJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new AssetRegistryHttpError(415, "json_content_type_required", "application/json is required");
  }
}

function requireIfMatch(request: IncomingMessage): string {
  const value = request.headers["if-match"];
  if (value === undefined || value === "") {
    throw new AssetRegistryHttpError(428, "if_match_required", "Asset Registry mutations require the latest registry revision");
  }
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new AssetRegistryError(400, "invalid_registry_revision", "expected registry revision must be a lowercase SHA-256");
  }
  return value;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    if (typeof contentLength !== "string" || !/^(0|[1-9][0-9]*)$/.test(contentLength)) {
      throw badRequest("invalid_content_length", "Content-Length must be a non-negative integer");
    }
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed)) throw badRequest("invalid_content_length", "Content-Length is too large");
    if (parsed > MAX_JSON_BYTES) throw new AssetRegistryHttpError(413, "body_too_large", "JSON body must not exceed 1 MiB");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
    size += chunk.byteLength;
    if (size <= MAX_JSON_BYTES) chunks.push(chunk);
  }
  if (size > MAX_JSON_BYTES) throw new AssetRegistryHttpError(413, "body_too_large", "JSON body must not exceed 1 MiB");
  if (size === 0) throw badRequest("invalid_json", "Request body must contain JSON");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("invalid_json", "Request body must contain valid JSON");
  }
}

function toL0Card(record: AssetRecord) {
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

function mutatedAsset(assets: readonly AssetRecord[], assetId: string, version: number): AssetRecord {
  const asset = assets.find((record) => record.asset_id === assetId && record.version === version);
  if (!asset) throw new AssetRegistryHttpError(500, "mutation_result_missing", "Mutated asset was not returned by the registry");
  return asset;
}

function mutationPayload(registryRevision: string, asset: AssetRecord) {
  return { registry_revision: registryRevision, asset };
}

function sendRevisionJson(response: ServerResponse, status: number, revision: string, body: unknown): void {
  response.setHeader("ETag", revision);
  sendJson(response, status, body);
}

function badRequest(code: string, message: string, details?: unknown): AssetRegistryHttpError {
  return new AssetRegistryHttpError(400, code, message, details);
}

function handleError(error: unknown, response: ServerResponse, next: MiddlewareNext): void {
  if (error instanceof AssetRegistryError || error instanceof AssetRegistryHttpError) {
    sendJson(response, error.status, {
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  if (error instanceof Error) {
    console.error("[asset-registry] request failed:", error);
    sendJson(response, 500, { error: "Asset Registry request failed", code: "internal_error" });
    return;
  }
  next(error);
}
