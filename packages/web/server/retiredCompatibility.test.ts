import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("retired lifecycle, importer, and Catalog compatibility surfaces stay absent", () => {
  const viteConfig = readFileSync(resolve(webRoot, "vite.config.ts"), "utf8");
  const registryAdapter = readFileSync(resolve(webRoot, "server", "assetRegistryApi.ts"), "utf8");
  const artifactStore = readFileSync(resolve(webRoot, "server", "artifactRootStore.ts"), "utf8");
  const packageManifest = readFileSync(resolve(webRoot, "package.json"), "utf8");

  for (const retiredPath of [
    "server/afCatalogApi.ts",
    "server/stageRunner.ts",
    "src/catalog/catalogIndex.ts",
    "src/catalog/seed.ts",
    "src/state/useCatalog.ts",
    "src/analyzer/analysisArtifactImport.ts",
    "src/analyzer/analysisReviewGate.ts",
    "src/analyzer/assetReview.ts",
    "src/analyzer/nestedWorkflowInsert.ts",
    "src/analyzer/localA2aProvider.ts",
  ]) {
    assert.equal(existsSync(resolve(webRoot, retiredPath)), false, `${retiredPath} must stay removed`);
  }
  assert.doesNotMatch(viteConfig, /\/api\/(?:af|catalog)(?:\/|["'])/);
  assert.doesNotMatch(viteConfig, /createAfCatalogMiddleware|stageRunner/);
  assert.match(viteConfig, /\/api\/asset-registry/);
  assert.doesNotMatch(registryAdapter, /agents\.yaml|workflows\.yaml|tools\.yaml|parseCatalogIndexPayload/);
  assert.doesNotMatch(artifactStore, /catalog-delta\.yaml/);
  assert.doesNotMatch(packageManifest, /js-yaml/);
});
