import { useEffect, useMemo, useState } from "react";
import type { CompanionAppAssetSnapshot, CompanionAssetCard, CompanionAssetSearchResult } from "@agent-factory/companion-contracts";
import type { GraphEditOperation, GraphIR } from "@agent-factory/companion-graph-domain";
import type { CompanionApi } from "../api/CompanionApi.js";

export function AssetLibrary({ api, graph, appAssets, onAssetsChange, onStage }: {
  api: CompanionApi;
  graph: GraphIR;
  appAssets: CompanionAppAssetSnapshot;
  onAssetsChange(value: CompanionAppAssetSnapshot): void;
  onStage(operations: GraphEditOperation[]): void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"agent" | "workflow" | "tool" | "">("");
  const [search, setSearch] = useState<CompanionAssetSearchResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void api.searchAssets({ ...(query.trim() ? { q: query.trim() } : {}), ...(type ? { asset_type: type } : {}) }, controller.signal).then(setSearch).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Asset을 검색하지 못했습니다."); }); }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, type]);
  const bound = useMemo(() => new Map(appAssets.bindings.map((binding) => [binding.asset_id, binding])), [appAssets]);
  async function add(card: CompanionAssetCard) {
    setBusy(card.asset_id); setNotice(null);
    try {
      let nextAssets = appAssets;
      const current = bound.get(card.asset_id);
      if (!current || current.version !== card.version || current.contract_hash !== card.contract_hash) {
        nextAssets = await api.bindAsset({ asset_id: card.asset_id, version: card.version, registry_revision: search!.registry_revision, base_assets_revision: appAssets.assets_revision });
        onAssetsChange(nextAssets);
      }
      onStage([{ op: "add", target: "node", value: assetNode(card, graph) }]);
      setNotice(`${card.name} binding과 Node를 추가했습니다.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Asset을 추가하지 못했습니다."); }
    finally { setBusy(null); }
  }
  return <details className="asset-library" open><summary><span>Published Assets</span><small>검색 → 정확한 version binding → typed Node</small></summary><div className="asset-search"><input aria-label="Published Asset 검색" placeholder="이름, 책임, capability 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Asset type" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="">전체</option><option value="agent">Agent</option><option value="workflow">Workflow</option><option value="tool">Tool</option></select><span>{appAssets.bindings.length} bound</span></div><div className="asset-results">{search?.results.map((card) => { const current = bound.get(card.asset_id); return <div className="asset-row" key={`${card.asset_id}@${card.version}`}><span className={`asset-kind asset-kind--${card.asset_type}`}>{card.asset_type}</span><div><strong>{card.name}</strong><code>{card.asset_id}@{card.version}</code><p>{card.responsibility}</p></div><button type="button" disabled={busy !== null} onClick={() => void add(card)}>{busy === card.asset_id ? "추가 중…" : current ? "Node 추가" : "App + Node 추가"}</button></div>; })}{search && search.results.length === 0 ? <p className="empty-assets">조건에 맞는 published Asset이 없습니다.</p> : null}</div>{notice ? <p className="asset-notice" role="status">{notice}</p> : null}</details>;
}

function assetNode(card: CompanionAssetCard, graph: GraphIR): GraphIR["nodes"][number] {
  const id = uniqueId(`node.${card.asset_id}`, graph.nodes.map((node) => node.id));
  if (card.asset_type === "agent") return { id, label: card.name, node_kind: "agent", agent_ref: card.asset_id, available_tools: [] };
  if (card.asset_type === "tool") return { id, label: card.name, node_kind: "tool", tool_ref: card.asset_id, invocation_control: "workflow" };
  return { id, label: card.name, node_kind: "subworkflow", workflow_ref: card.asset_id };
}
function uniqueId(base: string, ids: string[]): string { if (!ids.includes(base)) return base; let index = 2; while (ids.includes(`${base}-${index}`)) index += 1; return `${base}-${index}`; }
