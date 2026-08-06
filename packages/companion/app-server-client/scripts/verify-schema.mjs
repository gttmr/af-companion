#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(packageRoot, "schemas", "codex-0.146.0", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const codex = process.env.CODEX_BIN || "codex";

try {
  verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function verify() {
  const version = run(codex, ["--version"]).trim();
  const expectedVersion = `codex-cli ${manifest.codex_cli_version}`;
  if (version !== expectedVersion) {
    fail(`Codex CLI version mismatch: expected ${expectedVersion}, received ${version}`);
  }
  if (manifest.experimental_api !== false || manifest.schema_channel !== "non-experimental") {
    fail("Schema manifest must pin the non-experimental channel");
  }

  const outputDirectory = mkdtempSync(join(tmpdir(), "codex-app-server-schema-"));
  try {
    run(codex, ["app-server", "generate-json-schema", "--out", outputDirectory]);
    const artifactPath = join(outputDirectory, manifest.generated_schema_artifact);
    const generatedSchema = JSON.parse(readFileSync(artifactPath, "utf8"));
    const canonicalBytes = JSON.stringify(sortObjectKeys(generatedSchema));
    const actualHash = createHash("sha256").update(canonicalBytes, "utf8").digest("hex");
    if (actualHash !== manifest.generated_schema_sha256) {
      fail(
        `Schema hash mismatch for ${manifest.generated_schema_artifact}: `
        + `expected ${manifest.generated_schema_sha256}, received ${actualHash}`,
      );
    }
    console.log(
      `Verified ${expectedVersion} ${manifest.generated_schema_artifact} canonical-sha256=${actualHash}`,
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]),
    );
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) fail(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    fail(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout;
}

function fail(message) {
  throw new Error(message);
}
