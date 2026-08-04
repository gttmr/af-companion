import { useState } from "react";
import type { GraphEditOperation, GraphIR } from "@agent-factory/companion-graph-domain";

const localNodeKinds = ["input", "function", "human_input", "join", "output"] as const;
type LocalNodeKind = typeof localNodeKinds[number];

export function CreationPanel({ graph, onStage }: { graph: GraphIR; onStage(operations: GraphEditOperation[]): void }) {
  const [nodeKind, setNodeKind] = useState<LocalNodeKind>("function");
  const [nodeLabel, setNodeLabel] = useState("새 Function");
  const [from, setFrom] = useState(graph.nodes[0]?.id ?? "");
  const [to, setTo] = useState(graph.nodes[1]?.id ?? "");
  const [regionMembers, setRegionMembers] = useState<string[]>([]);
  function addNode() { const id = uniqueId(`node.${slug(nodeLabel) || nodeKind}`, graph.nodes.map((node) => node.id)); onStage([{ op: "add", target: "node", value: createNode(id, nodeLabel, nodeKind) }]); }
  function addEdge() { if (!from || !to || from === to) return; const id = uniqueId(`edge.${slug(from.replace("node.", ""))}-to-${slug(to.replace("node.", ""))}`, graph.edges.map((edge) => edge.id)); onStage([{ op: "add", target: "edge", value: { id, from, to, control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: null } }]); }
  function addRegion() { if (!regionMembers.length) return; const id = uniqueId("region.parallel", graph.regions.map((region) => region.id)); onStage([{ op: "add", target: "region", value: { id, kind: "parallel", node_ids: regionMembers, entry_node_ids: [regionMembers[0]!], exit_node_ids: [regionMembers.at(-1)!], parent_region_id: null } }]); }
  return <details className="creation-panel"><summary>Local Node · Edge · Region 추가</summary><div className="creation-grid"><section><h3>Local Node</h3><label>Kind<select value={nodeKind} onChange={(event) => setNodeKind(event.target.value as LocalNodeKind)}>{localNodeKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label><label>Label<input value={nodeLabel} onChange={(event) => setNodeLabel(event.target.value)} /></label><button type="button" onClick={addNode} disabled={!nodeLabel.trim()}>Node 추가</button></section><section><h3>Edge</h3><label>From<select value={from} onChange={(event) => setFrom(event.target.value)}>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>To<select value={to} onChange={(event) => setTo(event.target.value)}>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><button type="button" onClick={addEdge} disabled={!from || !to || from === to}>Edge 추가</button></section><section><h3>Region</h3><div className="compact-checks">{graph.nodes.map((node) => <label key={node.id}><input type="checkbox" checked={regionMembers.includes(node.id)} onChange={(event) => setRegionMembers(event.target.checked ? [...regionMembers, node.id] : regionMembers.filter((id) => id !== node.id))} />{node.label}</label>)}</div><button type="button" onClick={addRegion} disabled={!regionMembers.length}>Region 추가</button></section></div></details>;
}

function createNode(id: string, label: string, kind: LocalNodeKind): GraphIR["nodes"][number] {
  if (kind === "function") return { id, label, node_kind: kind, role: "transform" };
  if (kind === "human_input") return { id, label, node_kind: kind, human_input_contract: { message: label, payload_schema_ref: null, response_schema_ref: null, response_mapping: null, choice_options: null, accepted_aliases: null, default_choice: null } };
  return { id, label, node_kind: kind };
}
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9가-힣]+/gu, "-").replace(/^-|-$/gu, ""); }
function uniqueId(base: string, ids: string[]): string { if (!ids.includes(base)) return base; let index = 2; while (ids.includes(`${base}-${index}`)) index += 1; return `${base}-${index}`; }
