import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from "react";
import type { GraphIR, GraphPresentation, GraphSelection } from "@agent-factory/companion-graph-domain";

interface Props {
  graph: GraphIR;
  presentation: GraphPresentation;
  selection: GraphSelection | null;
  changed: { nodes: Set<string>; edges: Set<string>; regions: Set<string> };
  onSelectionChange(selection: GraphSelection | null): void;
  onPositionChange(nodeId: string, x: number, y: number): void;
}

export function GraphCanvas({ graph, presentation, selection, changed, onSelectionChange, onPositionChange }: Props) {
  const positions = presentation.positions;
  return (
    <section className="graph-canvas" aria-labelledby="graph-canvas-title">
      <div className="surface-heading">
        <div><p className="eyebrow">Canonical Graph IR</p><h2 id="graph-canvas-title">{graph.workflow_ref ?? graph.graph_id}</h2></div>
        <span>{graph.nodes.length} Nodes · {graph.edges.length} Edges · {graph.regions.length} Regions</span>
      </div>
      <div className="graph-stage" onClick={(event) => { if (event.target === event.currentTarget) onSelectionChange(null); }}>
        {graph.regions.map((region) => {
          const bounds = regionBounds(region.node_ids, positions); if (!bounds) return null;
          const selected = selection?.kind === "region" && selection.id === region.id;
          return <button key={region.id} type="button" className={`graph-region graph-region--${region.kind}${selected ? " is-selected" : ""}${changed.regions.has(region.id) ? " is-changed" : ""}`} style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }} onClick={(event) => { event.stopPropagation(); onSelectionChange({ kind: "region", id: region.id }); }} aria-label={`${region.id}, ${region.kind} Region 선택`}><span>{region.kind} · {region.id}</span></button>;
        })}
        <svg className="graph-edges" viewBox="0 0 1100 600" aria-label="Graph 연결">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" /></marker></defs>
          {graph.edges.map((edge) => {
            const from = positions[edge.from]; const to = positions[edge.to]; if (!from || !to) return null;
            const selected = selection?.kind === "edge" && selection.id === edge.id; const path = edgePath(from.x + 184, from.y + 45, to.x, to.y + 45);
            return <g key={edge.id} role="button" tabIndex={0} aria-label={`Edge ${edge.id} 선택`} aria-pressed={selected} className={`graph-edge${selected ? " is-selected" : ""}${changed.edges.has(edge.id) ? " is-changed" : ""}`} onClick={(event) => { event.stopPropagation(); onSelectionChange({ kind: "edge", id: edge.id }); }} onKeyDown={(event) => activate(event, () => onSelectionChange({ kind: "edge", id: edge.id }))}><path className="edge-hit" d={path} /><path className="edge-line" d={path} markerEnd="url(#arrow)" /><text x={(from.x + to.x + 184) / 2} y={(from.y + to.y) / 2 + 28}>{edge.control.kind}{edge.channel ? ` · ${edge.channel}` : ""}</text></g>;
          })}
        </svg>
        {graph.nodes.map((node) => {
          const position = positions[node.id] ?? { x: 40, y: 40, pinned: false }; const selected = selection?.kind === "node" && selection.id === node.id;
          return <button key={node.id} type="button" data-node-id={node.id} className={`graph-node graph-node--${node.node_kind}${selected ? " is-selected" : ""}${changed.nodes.has(node.id) ? " is-changed" : ""}`} style={{ left: position.x, top: position.y }} aria-pressed={selected} aria-label={`${node.label}, ${node.node_kind} Node 선택`} onClick={(event) => { event.stopPropagation(); onSelectionChange({ kind: "node", id: node.id }); }} onPointerDown={(event) => startDrag(event, position.x, position.y, (x, y) => onPositionChange(node.id, x, y))}><span className="node-kind">{node.node_kind}</span><strong>{node.label}</strong><code>{assetRef(node)}</code>{position.pinned ? <span className="pin-mark">고정</span> : null}</button>;
        })}
      </div>
    </section>
  );
}

function startDrag(event: ReactPointerEvent<HTMLButtonElement>, startX: number, startY: number, move: (x: number, y: number) => void): void {
  if (event.button !== 0) return; const originX = event.clientX; const originY = event.clientY; const target = event.currentTarget; target.setPointerCapture(event.pointerId);
  const onMove = (next: PointerEvent) => { if (Math.abs(next.clientX - originX) + Math.abs(next.clientY - originY) < 3) return; move(Math.max(8, startX + next.clientX - originX), Math.max(8, startY + next.clientY - originY)); };
  const finish = () => { target.removeEventListener("pointermove", onMove); target.removeEventListener("pointerup", finish); };
  target.addEventListener("pointermove", onMove); target.addEventListener("pointerup", finish);
}
function regionBounds(ids: string[], positions: GraphPresentation["positions"]): { x: number; y: number; width: number; height: number } | null { const points = ids.map((id) => positions[id]).filter((value): value is NonNullable<typeof value> => Boolean(value)); if (!points.length) return null; const left = Math.min(...points.map((p) => p.x)) - 28; const top = Math.min(...points.map((p) => p.y)) - 42; const right = Math.max(...points.map((p) => p.x)) + 212; const bottom = Math.max(...points.map((p) => p.y)) + 120; return { x: left, y: top, width: right - left, height: bottom - top }; }
function edgePath(x1: number, y1: number, x2: number, y2: number): string { const bend = Math.max(50, Math.abs(x2 - x1) * 0.42); return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`; }
function activate(event: KeyboardEvent<SVGGElement>, callback: () => void): void { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); callback(); } }
function assetRef(node: GraphIR["nodes"][number]): string { if (node.node_kind === "agent") return node.agent_ref; if (node.node_kind === "tool") return node.tool_ref; if (node.node_kind === "subworkflow") return node.workflow_ref; if (node.node_kind === "function") return node.role; return node.id; }
