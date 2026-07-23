export function buildContractTest({
  outputMode,
  packageName,
  a2aProviderEnabled = false,
  rootExecutablePlan,
  solutionControlStrategy,
  assetBindings
}) {
  const rootBinding = assetBindings.find((binding) => binding.asset_id === rootExecutablePlan.assetRef);
  const referencedRoot = rootBinding?.generation_action === "reference_existing" && rootBinding?.source_ref;
  if (outputMode === "runnable") {
    const rootTypeImport = rootExecutablePlan.assetType === "workflow"
      ? "from google.adk.workflow import Workflow"
      : "from google.adk.agents import BaseAgent";
    const rootType = rootExecutablePlan.assetType === "workflow" ? "Workflow" : "BaseAgent";
    const sourceAssertion = referencedRoot
      ? `assert "_load_registry_asset(${JSON.stringify(rootBinding.source_ref)}" in source`
      : rootExecutablePlan.assetType === "workflow"
      ? 'assert "root_executable = Workflow(" in source or "root_executable = _AsyncResumeWorkflow(" in source'
      : `assert "root_executable = ${rootExecutablePlan.rootSymbol}" in source`;
    return `import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


def test_agent_source_declares_selected_root_executable():
    source = (ROOT / "${packageName}" / "agent.py").read_text(encoding="utf-8")
    ${sourceAssertion}
    assert "root_agent = root_executable" in source
    assert "SyntheticRuntimeSmokeAgent" not in source
    if " = LlmAgent(" in source:
        assert "output_key=" in source


def test_manifest_declares_runnable_mode():
    manifest = (ROOT / "${packageName}" / "workflow_manifest.json").read_text(encoding="utf-8")
    assert '"output_mode": "runnable"' in manifest
    assert '"raw_requirement_to_code": false' in manifest
    assert '"private_data_or_endpoints": false' in manifest
    assert '"runtime"' in manifest
    assert '"solution_control_strategy": "${solutionControlStrategy}"' in manifest
    assert '"asset_type": "${rootExecutablePlan.assetType}"' in manifest
    assert '"asset_ref": "${rootExecutablePlan.assetRef}"' in manifest
    assert '"asset_bindings"' in manifest
${assetBindings.map((binding) => `    assert '"decision_id": "${binding.decision_id}"' in manifest`).join("\n")}


def test_runtime_chat_smoke_contract_is_present():
    smoke = (ROOT / "runtime-chat-smoke.json").read_text(encoding="utf-8")
    assert '"appName": "${packageName}"' in smoke
    assert '"port": 8765' in smoke


${a2aProviderEnabled ? `def test_a2a_launcher_forces_new_executor_for_terminal_task_state():
    source = (ROOT / "af_adk_a2a_server.py").read_text(encoding="utf-8")
    assert "force_new_version=True" in source

` : ""}
@pytest.mark.skipif(importlib.util.find_spec("google.adk") is None, reason="google-adk not installed")
def test_root_agent_has_selected_runtime_type_and_identity():
    ${rootTypeImport}

    generated_package = importlib.import_module("${packageName}.agent")
    assert generated_package.root_agent is generated_package.root_executable
    assert isinstance(generated_package.root_agent, ${rootType})
`;
  }
  if (referencedRoot) {
    return `from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_agent_source_references_the_exact_registry_root():
    source = (ROOT / "${packageName}" / "agent.py").read_text(encoding="utf-8")
    assert "_load_registry_asset(${JSON.stringify(rootBinding.source_ref)}" in source
    assert "root_agent = root_executable" in source
    assert "SyntheticRuntimeSmokeAgent" not in source


def test_manifest_preserves_registry_asset_decisions():
    manifest = (ROOT / "${packageName}" / "workflow_manifest.json").read_text(encoding="utf-8")
    assert '"asset_bindings"' in manifest
${assetBindings.map((binding) => `    assert '"decision_id": "${binding.decision_id}"' in manifest`).join("\n")}
`;
  }
  return `from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_agent_source_declares_adk_workflow():
    source = (ROOT / "${packageName}" / "agent.py").read_text(encoding="utf-8")
    assert "from google.adk.agents import BaseAgent" in source
    assert "class SyntheticRuntimeSmokeAgent(BaseAgent)" in source
    assert "TODO_IMPLEMENT_HERE" in source
    assert "synthetic_smoke" in source
    assert "root_agent = root_executable" in source


def test_manifest_uses_scaffold_plan_contract():
    manifest = (ROOT / "${packageName}" / "workflow_manifest.json").read_text(encoding="utf-8")
    assert '"raw_requirement_to_code": false' in manifest
    assert '"generated_business_logic": false' in manifest
    assert '"private_data_or_endpoints": false' in manifest
    assert '"graph_ir"' in manifest
    assert '"catalog_bound_assets"' in manifest
    assert '"new_code_required"' in manifest
    assert '"runtime_contracts"' in manifest
    assert '"asset_bindings"' in manifest
${assetBindings.map((binding) => `    assert '"decision_id": "${binding.decision_id}"' in manifest`).join("\n")}


def test_runtime_chat_smoke_contract_is_present():
    smoke = (ROOT / "runtime-chat-smoke.json").read_text(encoding="utf-8")
    assert '"appName": "${packageName}"' in smoke
    assert '"port": 8765' in smoke
`;
}
