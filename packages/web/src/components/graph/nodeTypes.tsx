import { Handle, Position, type NodeProps } from "reactflow";
import { CategoryBadge, ProtocolBadge } from "../CategoryBadge";
import type { GraphNodeData } from "./layout";

type CliContextNodeData = GraphNodeData & {
  cliContextMode?: boolean;
  cliContextSelected?: boolean;
  cliContextOrder?: number | null;
};

function nodeStateClasses(data: GraphNodeData): string {
  const context = data as CliContextNodeData;
  return [
    data.selected ? "is-selected" : "",
    context.cliContextMode ? "is-cli-context-mode" : "",
    context.cliContextMode && context.cliContextSelected ? "is-cli-context-selected" : ""
  ].filter(Boolean).join(" ");
}

function CliContextOrder({ data }: { data: GraphNodeData }) {
  const order = (data as CliContextNodeData).cliContextOrder;
  if (!(data as CliContextNodeData).cliContextMode || !order) return null;
  return <span className="graph-node-cli-order" title={`CLI Context 선택 순서 ${order}`}>{order}</span>;
}

function CollaborationBadges({ data }: { data: GraphNodeData }) {
  if (!data.commentCount && !data.highlightCount) return null;
  return (
    <span className="graph-node-collab" title={data.commentTooltip}>
      {data.commentCount ? <span className="graph-node-comment-pin">{data.commentCount}</span> : null}
      {data.highlightCount ? <span className="graph-node-highlight-pin">{data.highlightCount}</span> : null}
    </span>
  );
}

function HandleStrip() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="graph-node-handle" />
      <Handle type="source" position={Position.Right} className="graph-node-handle" />
    </>
  );
}

function AssetNode({ data }: NodeProps<GraphNodeData>) {
  const { graphNode, assetType } = data;
  const ref =
    graphNode.node_kind === "agent"
      ? graphNode.agent_ref
      : graphNode.node_kind === "tool"
        ? graphNode.tool_ref
        : graphNode.node_kind === "subworkflow"
          ? graphNode.workflow_ref
          : null;
  return (
    <div
      className={`graph-node graph-node-card cat-${assetType ?? "agent"} ${nodeStateClasses(data)} ${data.highlightCount ? "has-highlight" : ""}`}
    >
      <HandleStrip />
      <CollaborationBadges data={data} />
      <CliContextOrder data={data} />
      <div className="graph-node-head">
        {assetType ? <CategoryBadge category={assetType} /> : null}
        {data.asset?.binding?.kind === "mcp" ? <ProtocolBadge value="mcp" /> : null}
        {data.a2aBoundary ? <ProtocolBadge value="a2a" /> : null}
      </div>
      <strong className="graph-node-label">{graphNode.label}</strong>
      {ref ? <span className="graph-node-mod">{ref}</span> : null}
    </div>
  );
}

function FunctionNode({ data }: NodeProps<GraphNodeData>) {
  const { graphNode } = data;
  const role = graphNode.node_kind === "function" ? graphNode.role : "transform";
  const routes = data.routeMap ?? [];
  return (
    <div
      className={`graph-node ${role === "route" ? "graph-node-router" : "graph-node-square graph-node-function"} ${nodeStateClasses(data)} ${data.highlightCount ? "has-highlight" : ""}`}
    >
      <HandleStrip />
      <CollaborationBadges data={data} />
      <CliContextOrder data={data} />
      <span className="graph-node-eyebrow">function · {role}</span>
      <strong className="graph-node-label graph-node-mono">{graphNode.label}</strong>
      {data.upstreamHumanPrompt ? <span className="graph-node-route-prompt">{data.upstreamHumanPrompt}</span> : null}
      {routes.length ? (
        <div className="graph-node-route-map" aria-label="조건 분기">
          {routes.map((route) => (
            <div key={`${route.value}:${route.targetNodeId}`} className="graph-node-route-row">
              <span className="graph-node-route-value">{route.value}</span>
              <span className="graph-node-route-target">→ {route.targetLabel}</span>
              {route.isDefault ? <span className="graph-node-route-default">default</span> : null}
              {route.aliases.length ? <span className="graph-node-route-aliases">{route.aliases.join(", ")}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HumanInputNode({ data }: NodeProps<GraphNodeData>) {
  const { graphNode } = data;
  const contract = graphNode.node_kind === "human_input" ? graphNode.human_input_contract : null;
  return (
    <div className={`graph-node graph-node-card graph-node-human ${nodeStateClasses(data)}`}>
      <HandleStrip />
      <CollaborationBadges data={data} />
      <CliContextOrder data={data} />
      <span className="graph-node-eyebrow">사람 입력</span>
      <strong className="graph-node-label">{graphNode.label}</strong>
      {contract?.choice_options?.length ? <span className="graph-node-route-hint">{contract.choice_options.join(" / ")}</span> : null}
    </div>
  );
}

function JoinNode({ data }: NodeProps<GraphNodeData>) {
  return (
    <div className={`graph-node graph-node-join ${nodeStateClasses(data)}`}>
      <HandleStrip />
      <CollaborationBadges data={data} />
      <CliContextOrder data={data} />
      <span className="graph-node-join-dot" aria-hidden />
      <span className="graph-node-join-label">{data.graphNode.label}</span>
    </div>
  );
}

function PillNode({ data, kind }: NodeProps<GraphNodeData> & { kind: "input" | "output" }) {
  return (
    <div className={`graph-node graph-node-pill graph-node-${kind} ${nodeStateClasses(data)}`}>
      <HandleStrip />
      <CollaborationBadges data={data} />
      <CliContextOrder data={data} />
      <strong className="graph-node-label">{data.graphNode.label}</strong>
    </div>
  );
}

export const nodeTypes = {
  input: (props: NodeProps<GraphNodeData>) => <PillNode {...props} kind="input" />,
  agent: AssetNode,
  tool: AssetNode,
  function: FunctionNode,
  human_input: HumanInputNode,
  subworkflow: AssetNode,
  join: JoinNode,
  output: (props: NodeProps<GraphNodeData>) => <PillNode {...props} kind="output" />
};
