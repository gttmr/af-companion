import { componentContracts } from "./agent-contracts.mjs";
import { collectGenerationNodes } from "./graph/collector.mjs";
import { assertNoSymbolCollisions } from "./graph/guards.mjs";
import { emitRunnableNodeBlocks } from "./emitters/node-registry.mjs";
import { buildRuntimeHelperSection } from "./emitters/runtime-helpers.mjs";
import { hasAgentOwnedTools } from "./tools.mjs";
import { toPythonLiteral } from "./python-literals.mjs";
import {
  assertRemoteA2aSupported,
  usesRemoteA2a,
  usesRemoteA2aAuthInterceptor
} from "./remote-a2a.mjs";

export function buildAgentRootPy(context) {
  const { analysisResult, assets, graphContext, rootExecutablePlan } = context;
  const collection = collectGenerationNodes(graphContext, { mode: "static" });
  assertNoSymbolCollisions(collection.collisionTargets);
  assertRemoteA2aSupported({ analysisResult, assets });
  const orderedNodeSpecs = orderRootAgentLast(
    collection.assetSpecsInDeclarationOrder.filter((target) => target.asset.asset_type === "agent"),
    rootExecutablePlan.rootNodeId
  );
  const { nodeBlocks } = emitRunnableNodeBlocks(context, {
    mode: "static",
    orderedNodeSpecs,
    functionNodes: [],
    humanInputNodes: [],
    routeNodes: [],
    terminalOutputNodes: []
  });
  const usesRemoteAuth = usesRemoteA2aAuthInterceptor({ analysisResult, assets });
  const remoteConfigImport = usesRemoteAuth
    ? "from google.adk.a2a.agent.config import A2aRemoteAgentConfig, RequestInterceptor\n"
    : "";
  const remoteImport = usesRemoteA2a(assets)
    ? "from google.adk.agents.remote_a2a_agent import RemoteA2aAgent\n"
    : "";
  const eventImport = usesRemoteAuth ? "from google.adk.events import Event\n" : "";
  const mcpToolsetImport = hasAgentOwnedTools(graphContext)
    ? "from google.adk.tools import McpToolset\nfrom google.adk.tools.mcp_tool import StreamableHTTPConnectionParams\n"
    : "";

  return `from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import yaml

from google.adk import Context
from google.adk.agents import LlmAgent
${remoteConfigImport}${remoteImport}${eventImport}${mcpToolsetImport}
${buildRuntimeHelperSection({ componentContractLiteral: toPythonLiteral(componentContracts(context)), assets })}

${nodeBlocks.join("\n\n")}

root_executable = ${rootExecutablePlan.rootSymbol}
root_agent = root_executable
`;
}

function orderRootAgentLast(targets, rootNodeId) {
  return [
    ...targets.filter((target) => target.node.id !== rootNodeId),
    ...targets.filter((target) => target.node.id === rootNodeId)
  ];
}
