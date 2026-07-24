import { buildRegistryReferenceHelper, registryBindingFor } from "./registry-reference.mjs";
import { toPyStr } from "./python-literals.mjs";

export function hasPythonReferencedRoot(context) {
  const binding = registryBindingFor(context, context.rootExecutablePlan.assetRef);
  return binding?.generation_action === "reference_existing" && typeof binding.source_ref === "string";
}

export function buildReferencedRootPy(context) {
  const binding = registryBindingFor(context, context.rootExecutablePlan.assetRef);
  if (!binding?.source_ref) {
    throw new Error(`Referenced Root Executable ${context.rootExecutablePlan.assetRef} has no executable source ref.`);
  }
  return `from __future__ import annotations

${buildRegistryReferenceHelper()}

root_executable = _load_registry_asset(${toPyStr(binding.source_ref)}, ${toPyStr(context.rootExecutablePlan.assetType)})
root_agent = root_executable
`;
}
