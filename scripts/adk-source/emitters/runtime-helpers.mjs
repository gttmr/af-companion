import { buildRuntimeConfigSection } from "./runtime-config.mjs";
import { buildRuntimeToolInputsSection } from "./runtime-tool-inputs.mjs";
import { buildRegistryReferenceHelper, hasPythonRegistryReferences } from "../registry-reference.mjs";

export function buildRuntimeHelperSection({ componentContractLiteral, assets, assetBindings }) {
  const context = { assetBindings };
  const registryReferences = hasPythonRegistryReferences(context) ? buildRegistryReferenceHelper() : "";
  return `${buildRuntimeConfigSection({ componentContractLiteral })}${buildRuntimeToolInputsSection({ assets })}${registryReferences}`;
}
