import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the legacy Catalog HTTP adapter and three-bucket payload are absent", () => {
  const viteConfig = readFileSync(resolve(webRoot, "vite.config.ts"), "utf8");
  const registryAdapter = readFileSync(resolve(webRoot, "server", "assetRegistryApi.ts"), "utf8");

  assert.equal(existsSync(resolve(webRoot, "server", "afCatalogApi.ts")), false);
  assert.doesNotMatch(viteConfig, /\/api\/catalog/);
  assert.doesNotMatch(viteConfig, /createAfCatalogMiddleware/);
  assert.match(viteConfig, /\/api\/asset-registry/);
  assert.doesNotMatch(registryAdapter, /agents\.yaml|workflows\.yaml|tools\.yaml|parseCatalogIndexPayload/);
});
