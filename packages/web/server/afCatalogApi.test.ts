import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the legacy Catalog HTTP adapter and three-bucket payload are absent", () => {
  const viteConfig = readFileSync(resolve(webRoot, "vite.config.ts"), "utf8");
  const registryAdapter = readFileSync(resolve(webRoot, "server", "assetRegistryApi.ts"), "utf8");
  const artifactStore = readFileSync(resolve(webRoot, "server", "artifactRootStore.ts"), "utf8");
  const packageManifest = readFileSync(resolve(webRoot, "package.json"), "utf8");

  assert.equal(existsSync(resolve(webRoot, "server", "afCatalogApi.ts")), false);
  for (const retiredPath of [
    "src/catalog/catalogIndex.ts",
    "src/catalog/seed.ts",
    "src/state/useCatalog.ts",
    "src/analyzer/nestedWorkflowInsert.ts",
  ]) {
    assert.equal(existsSync(resolve(webRoot, retiredPath)), false, `${retiredPath} must stay removed`);
  }
  assert.doesNotMatch(viteConfig, /\/api\/catalog/);
  assert.doesNotMatch(viteConfig, /createAfCatalogMiddleware/);
  assert.match(viteConfig, /\/api\/asset-registry/);
  assert.doesNotMatch(registryAdapter, /agents\.yaml|workflows\.yaml|tools\.yaml|parseCatalogIndexPayload/);
  assert.doesNotMatch(artifactStore, /catalog-delta\.yaml/);
  assert.doesNotMatch(packageManifest, /js-yaml/);
});
