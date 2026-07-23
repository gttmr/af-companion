import { useMemo, useState } from "react";

import type { AssetType } from "../analyzer/types";
import type { CatalogHubEntry } from "../catalog/catalogIndex";
import { useCatalog } from "../state/useCatalog";

const tabs: AssetType[] = ["agent", "workflow", "tool"];

export default function AssetsPage() {
  const catalog = useCatalog();
  const [type, setType] = useState<AssetType>("agent");
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const source = type === "agent" ? catalog.data?.agents : type === "workflow" ? catalog.data?.workflows : catalog.data?.tools;
    const search = query.trim().toLowerCase();
    return (source ?? []).filter((entry) => !search || [entry.name, entry.asset_id, entry.owner, ...entry.capability_tags].join(" ").toLowerCase().includes(search));
  }, [catalog.data, query, type]);
  return (
    <div className="assets-page">
      <header className="standalone-page-header">
        <div><span>Assets</span><h1>Catalog projection</h1><p>Agent, Workflow, Tool만 표시하는 읽기 전용 register입니다. A2A는 Agent binding 또는 exposure로만 나타납니다.</p></div>
        <span className="read-only-badge">Read only</span>
      </header>
      <section className="asset-toolbar">
        <nav role="tablist">{tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={tab === type} onClick={() => setType(tab)}>{titleCase(tab)}<em>{countFor(catalog.data, tab)}</em></button>)}</nav>
        <label><span>Search catalog</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="name, id, owner, capability" /></label>
      </section>
      {catalog.isLoading ? <p className="table-message">Catalog를 읽는 중…</p> : catalog.error ? <p className="table-message is-error">{(catalog.error as Error).message}</p> : (
        <section className="asset-register">
          <div className="asset-register-head"><span>{type}</span><strong>{entries.length} assets</strong><p>Catalog write와 publish는 외부 Work Skill의 검증된 artifact 흐름에서만 수행합니다.</p></div>
          {entries.length ? <table><thead><tr><th>Asset</th><th>Owner / scope</th><th>Binding</th><th>Capabilities</th><th>Reuse</th></tr></thead><tbody>{entries.map((entry) => <AssetRow key={entry.asset_id} entry={entry} />)}</tbody></table> : <p className="table-message">조건에 맞는 asset이 없습니다.</p>}
        </section>
      )}
    </div>
  );
}

function AssetRow({ entry }: { entry: CatalogHubEntry }) {
  return <tr>
    <td><strong>{entry.name}</strong><code>{entry.asset_id}</code><small>{entry.responsibility || entry.notes || "—"}</small></td>
    <td>{entry.owner}<small>{entry.domain_scope} · {entry.business_domains.join(", ")}</small></td>
    <td>{binding(entry)}<small>{entry.connection?.transport ?? "—"}</small></td>
    <td><div className="capability-tags">{entry.capability_tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div></td>
    <td><span className="reuse-label">{entry.reuse_status}</span><small>{entry.version ? `v${entry.version}` : ""}</small></td>
  </tr>;
}

function binding(entry: CatalogHubEntry): string {
  if (entry.binding?.kind === "mcp") return `MCP · ${entry.binding.tool_name}`;
  if (entry.binding?.kind === "a2a") return `A2A · ${entry.binding.contract_ref}`;
  if (entry.binding) return entry.binding.kind;
  if (entry.workflow_profile) return `${entry.workflow_profile.representation} · ${entry.workflow_profile.coordination}`;
  return "—";
}

function countFor(data: ReturnType<typeof useCatalog>["data"], type: AssetType): number {
  if (!data) return 0;
  return type === "agent" ? data.agents.length : type === "workflow" ? data.workflows.length : data.tools.length;
}

function titleCase(value: string): string { return value[0].toUpperCase() + value.slice(1); }
