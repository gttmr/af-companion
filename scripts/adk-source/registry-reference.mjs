import { nodeSymbol, pyNodeName } from "./naming.mjs";
import { toPyStr } from "./python-literals.mjs";

export function registryBindingFor(context, assetId) {
  return context.assetBindings?.find((binding) => binding.asset_id === assetId) ?? null;
}

export function isPythonRegistryReference(context, assetId) {
  const binding = registryBindingFor(context, assetId);
  return binding?.generation_action === "reference_existing" && typeof binding.source_ref === "string";
}

export function hasPythonRegistryReferences(context) {
  return context.assetBindings?.some(
    (binding) => binding.generation_action === "reference_existing" && typeof binding.source_ref === "string"
  ) ?? false;
}

export function emitRegistryReferenceDecl(target, context) {
  const asset = target.asset ?? target;
  const binding = registryBindingFor(context, asset.asset_id);
  if (!binding?.source_ref) {
    throw new Error(`Registry reference lowering requires an executable source ref for ${asset.asset_id}.`);
  }
  const loaded = `_load_registry_asset(${toPyStr(binding.source_ref)}, ${toPyStr(asset.asset_type)})`;
  if (asset.asset_type === "tool") {
    return `${nodeSymbol(target)} = FunctionNode(func=${loaded}, name=${toPyStr(pyNodeName(target))})`;
  }
  return `${nodeSymbol(target)} = ${loaded}`;
}

export function buildRegistryReferenceHelper() {
  return `\n\ndef _load_registry_asset(source_ref: str, expected_kind: str):
    prefix = "python:"
    if not source_ref.startswith(prefix) or "#" not in source_ref:
        raise RuntimeError(f"Unsupported Registry executable source ref: {source_ref}")
    module_name, symbol_name = source_ref[len(prefix):].split("#", 1)
    module = __import__(module_name, fromlist=[symbol_name])
    value = getattr(module, symbol_name)
    if expected_kind == "agent":
        from google.adk.agents import BaseAgent

        if not isinstance(value, BaseAgent):
            raise TypeError(f"Registry source {source_ref} must export a BaseAgent object")
    elif expected_kind == "workflow":
        from google.adk.workflow import Workflow

        if not isinstance(value, Workflow):
            raise TypeError(f"Registry source {source_ref} must export a Workflow object")
    elif expected_kind == "tool" and not callable(value):
        raise TypeError(f"Registry source {source_ref} must export a callable Tool implementation")
    return value
`;
}
