import type { GraphIR, GraphPresentation } from "./types.js";

export function createMinimalAppGraph(applicationId: string): GraphIR {
  return {
    graph_id: `graph.${applicationId}`,
    source_requirement_id: `application.${applicationId}`,
    workflow_ref: null,
    nodes: [
      { id: "node.input", label: "입력", node_kind: "input" },
      { id: "node.output", label: "출력", node_kind: "output" },
    ],
    edges: [{
      id: "edge.input-output",
      from: "node.input",
      to: "node.output",
      control: { kind: "next", condition: null, accepted_aliases: [], default: true },
      channel: null,
    }],
    regions: [],
  };
}

export function createMinimalAppPresentation(): GraphPresentation {
  return {
    positions: {
      "node.input": { x: 100, y: 180, pinned: false },
      "node.output": { x: 430, y: 180, pinned: false },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function createDemoGraph(): GraphIR {
  return {
    graph_id: "graph.document-review",
    source_requirement_id: "document-review-demo",
    workflow_ref: "workflow.document-review",
    nodes: [
      { id: "node.input", label: "문서 입력", node_kind: "input" },
      { id: "node.reviewer", label: "검토 Agent", node_kind: "agent", agent_ref: "agent.document-reviewer", available_tools: [] },
      { id: "node.evidence", label: "근거 정리", node_kind: "function", role: "format_output" },
      { id: "node.output", label: "결과 정리", node_kind: "output" },
    ],
    edges: [
      { id: "edge.input-review", from: "node.input", to: "node.reviewer", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "artifact" },
      { id: "edge.review-evidence", from: "node.reviewer", to: "node.evidence", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "state" },
      { id: "edge.evidence-output", from: "node.evidence", to: "node.output", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "artifact" },
    ],
    regions: [],
  };
}

export function createDemoPresentation(): GraphPresentation {
  return {
    positions: {
      "node.input": { x: 60, y: 170, pinned: false },
      "node.reviewer": { x: 310, y: 90, pinned: false },
      "node.evidence": { x: 560, y: 220, pinned: false },
      "node.output": { x: 810, y: 130, pinned: false },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
