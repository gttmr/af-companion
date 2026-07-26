import type { AssetCandidate, AssetType, GraphIR, GraphNode } from "../analyzer/types";
import {
  SELECTION_BUNDLE_SCHEMA_VERSION,
  type SelectionBundleV1,
  type SelectionRelatedAsset,
  type SelectionSourceRevision
} from "./types";

const MAX_SELECTED_NODES = 20;
const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /(\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*)[^\s,;]+/gi
];

export interface SelectionBundleSourceMetadata {
  workspaceId: string;
  artifactRootId: string;
  graphEtag: string;
  gitHead: string | null;
  dirtyHash: string | null;
}

export interface BuildSelectionBundleV1Input {
  graph: GraphIR;
  assetCandidates: readonly AssetCandidate[];
  selectedNodeIds: readonly string[];
  source: SelectionBundleSourceMetadata;
  userIntent?: string | null;
  now: string | Date;
  expiresAt: string | Date;
}

export function buildSelectionBundleV1({
  graph,
  assetCandidates,
  selectedNodeIds,
  source,
  userIntent,
  now,
  expiresAt
}: BuildSelectionBundleV1Input): SelectionBundleV1 {
  const workspaceId = secretFreeReference(source?.workspaceId, "source.workspaceId");
  const artifactRootId = secretFreeReference(source?.artifactRootId, "source.artifactRootId");
  const graphEtag = secretFreeReference(source?.graphEtag, "source.graphEtag");
  const graphId = secretFreeReference(graph?.graph_id, "graph.graph_id");
  const sourceRequirementId = secretFreeReference(graph?.source_requirement_id, "graph.source_requirement_id");
  const head = optionalRevisionText(source?.gitHead, "source.gitHead");
  const dirtyHash = optionalRevisionText(source?.dirtyHash, "source.dirtyHash");
  if (head === null && dirtyHash === null) {
    throw validationError("source", "gitHead 또는 dirtyHash 중 하나는 안정적인 source revision 식별자로 필요합니다.");
  }

  if (!Array.isArray(selectedNodeIds) || selectedNodeIds.length === 0) {
    throw validationError("selectedNodeIds", "선택한 Graph node가 하나 이상 필요합니다.");
  }
  if (selectedNodeIds.length > MAX_SELECTED_NODES) {
    throw validationError("selectedNodeIds", `최대 ${MAX_SELECTED_NODES}개까지 선택할 수 있습니다. 현재 ${selectedNodeIds.length}개입니다.`);
  }

  const selectionIds = selectedNodeIds.map((nodeId, index) => secretFreeReference(nodeId, `selectedNodeIds[${index}]`));
  const duplicateSelectionId = firstDuplicate(selectionIds);
  if (duplicateSelectionId) {
    throw validationError("selectedNodeIds", `중복 node ID '${duplicateSelectionId}'를 제거해 주세요.`);
  }

  const nodesById = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) {
      throw validationError("graph.nodes", `Graph IR에 중복 node ID '${node.id}'가 있어 선택을 확정할 수 없습니다.`);
    }
    nodesById.set(node.id, node);
  }

  const selectedNodes = selectionIds.map((nodeId) => {
    const node = nodesById.get(nodeId);
    if (!node) {
      throw validationError("selectedNodeIds", `Graph '${graphId}'에서 node ID '${nodeId}'를 찾을 수 없습니다.`);
    }
    return node;
  });

  const candidatesById = new Map<string, AssetCandidate>();
  for (const candidate of assetCandidates) {
    if (candidatesById.has(candidate.asset_id)) {
      throw validationError("assetCandidates", `중복 asset_id '${candidate.asset_id}'가 있어 관련 자산을 확정할 수 없습니다.`);
    }
    candidatesById.set(candidate.asset_id, candidate);
  }

  const relatedAssets: SelectionRelatedAsset[] = [];
  const relatedAssetIds = new Set<string>();
  const selectedObjects = selectedNodes.map((node) => {
    const assetReference = nodeAssetReference(node);
    let artifactRef: string | null = null;
    if (assetReference) {
      const relatedAsset = resolveRelatedAsset(assetReference, candidatesById);
      artifactRef = relatedAsset.asset_id;
      if (!relatedAssetIds.has(assetReference.assetId)) {
        relatedAssets.push(relatedAsset);
        relatedAssetIds.add(assetReference.assetId);
      }
    }
    return {
      kind: "graph_node" as const,
      id: node.id,
      label: redactSecrets(node.label),
      node_kind: node.node_kind,
      artifact_ref: artifactRef,
      source_refs: []
    };
  });

  const selectedIdSet = new Set(selectionIds);
  const connectingEdges = graph.edges
    .filter((edge) => selectedIdSet.has(edge.from) && selectedIdSet.has(edge.to))
    .map((edge) => ({
      id: secretFreeReference(edge.id, `graph.edges[${edge.id}].id`),
      from: secretFreeReference(edge.from, `graph.edges[${edge.id}].from`),
      to: secretFreeReference(edge.to, `graph.edges[${edge.id}].to`),
      control_kind: edge.control.kind,
      channel: edge.channel
    }));

  const createdAt = validTimestamp(now, "now");
  const expiresAtIso = validTimestamp(expiresAt, "expiresAt");
  if (Date.parse(expiresAtIso) <= Date.parse(createdAt)) {
    throw validationError("expiresAt", "만료 시각은 now보다 이후여야 합니다.");
  }

  const intentText = optionalIntent(userIntent);
  const sourceRevision: SelectionSourceRevision = {
    head,
    dirty_hash: dirtyHash,
    graph_etag: graphEtag
  };
  const selectionId = `selection_v1_${fnv1a64(JSON.stringify({
    schema_version: SELECTION_BUNDLE_SCHEMA_VERSION,
    workspace_id: workspaceId,
    artifact_root_id: artifactRootId,
    graph_id: graphId,
    source_requirement_id: sourceRequirementId,
    source_revision: sourceRevision,
    selected_node_ids: selectionIds,
    user_intent: intentText
  }))}`;

  return {
    schema_version: SELECTION_BUNDLE_SCHEMA_VERSION,
    selection_id: selectionId,
    workspace_id: workspaceId,
    artifact_root_id: artifactRootId,
    graph_id: graphId,
    source_revision: sourceRevision,
    selected_objects: selectedObjects,
    derived_context: {
      connecting_edges: connectingEdges,
      related_assets: relatedAssets
    },
    user_intent: { text: intentText },
    created_at: createdAt,
    expires_at: expiresAtIso
  };
}

export function renderSelectionBundlePreview(bundle: SelectionBundleV1): string {
  const labelsById = new Map(bundle.selected_objects.map((object) => [object.id, singleLine(object.label)]));
  const selectedObjects = bundle.selected_objects
    .map((object) => `${singleLine(object.label)} (${object.node_kind} · ${object.id})`)
    .join(", ");
  const connectingEdges = bundle.derived_context.connecting_edges.length
    ? bundle.derived_context.connecting_edges.map((edge) => {
      const from = labelsById.get(edge.from) ?? edge.from;
      const to = labelsById.get(edge.to) ?? edge.to;
      const channel = edge.channel ? ` · ${edge.channel}` : "";
      return `${from} → ${to} (${edge.control_kind}${channel})`;
    }).join(", ")
    : "없음";
  const relatedAssets = bundle.derived_context.related_assets.length
    ? bundle.derived_context.related_assets.map((asset) => {
      const binding = asset.binding_kind ? ` · ${asset.binding_kind}` : "";
      return `${asset.asset_id} (${asset.asset_type} · ${singleLine(asset.owner)} · ${asset.domain_scope}${binding})`;
    }).join(", ")
    : "없음";
  const revision = [
    `Graph ${bundle.source_revision.graph_etag}`,
    `Git ${bundle.source_revision.head ?? "없음"}`,
    `dirty ${bundle.source_revision.dirty_hash ?? "clean"}`
  ].join(" · ");

  return [
    `선택 객체 ${bundle.selected_objects.length}개: ${selectedObjects}`,
    `직접 연결 Edge: ${connectingEdges}`,
    `관련 자산: ${relatedAssets}`,
    `Revision: ${revision}`,
    `만료: ${bundle.expires_at}`,
    `사용자 의도: ${bundle.user_intent.text ? singleLine(bundle.user_intent.text) : "없음"}`
  ].join("\n");
}

interface TypedAssetReference {
  assetId: string;
  assetType: AssetType;
}

function nodeAssetReference(node: GraphNode): TypedAssetReference | null {
  if (node.node_kind === "agent") return { assetId: node.agent_ref, assetType: "agent" };
  if (node.node_kind === "tool") return { assetId: node.tool_ref, assetType: "tool" };
  if (node.node_kind === "subworkflow") return { assetId: node.workflow_ref, assetType: "workflow" };
  return null;
}

function resolveRelatedAsset(
  reference: TypedAssetReference,
  candidatesById: ReadonlyMap<string, AssetCandidate>
): SelectionRelatedAsset {
  const assetId = secretFreeReference(reference.assetId, `asset ref '${reference.assetId}'`);
  const candidate = candidatesById.get(reference.assetId);
  if (!candidate) {
    throw validationError("assetCandidates", `선택한 ${reference.assetType} node의 asset ref '${reference.assetId}'를 찾을 수 없습니다.`);
  }
  if (candidate.asset_type !== reference.assetType) {
    throw validationError(
      "assetCandidates",
      `asset ref '${reference.assetId}'는 ${reference.assetType}이어야 하지만 ${candidate.asset_type} 후보를 가리킵니다.`
    );
  }
  return {
    asset_id: assetId,
    asset_type: candidate.asset_type,
    owner: redactSecrets(candidate.owner),
    domain_scope: redactSecrets(candidate.domain_scope),
    binding_kind: candidate.binding ? redactSecrets(candidate.binding.kind) : null
  };
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError(field, "비어 있지 않은 문자열이 필요합니다.");
  }
  return value.trim();
}

function secretFreeReference(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (redactSecrets(text) !== text) {
    throw validationError(field, "stable reference에 secret pattern을 포함할 수 없습니다.");
  }
  return text;
}

function optionalRevisionText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredText(value, field);
}

function optionalIntent(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw validationError("userIntent", "문자열 또는 null이어야 합니다.");
  const trimmed = value.trim();
  if (!trimmed) return null;
  return redactSecrets(trimmed);
}

function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (match, prefix: string | undefined) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]"),
    value
  );
}

function validTimestamp(value: unknown, field: string): string {
  const timestamp = value instanceof Date
    ? value
    : typeof value === "string" && value.trim()
      ? new Date(value)
      : null;
  if (!timestamp || !Number.isFinite(timestamp.getTime())) {
    throw validationError(field, "유효한 날짜/시간 문자열 또는 Date가 필요합니다.");
  }
  return timestamp.toISOString();
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function fnv1a64(value: string): string {
  let hash = FNV64_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV64_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function validationError(field: string, message: string): Error {
  return new Error(`Selection Bundle 검증 실패 (${field}): ${message}`);
}
