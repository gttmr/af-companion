#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

import { toBridgeHookInput, toCodexHookOutput } from "./af-codex-hook-protocol.mjs";

const ENDPOINT_RELATIVE_PATH = join(".agent-factory", "codex-bridge", "v1", "endpoint.json");
const MAX_STDIN_BYTES = 256 * 1_024;
const REQUEST_TIMEOUT_MS = 400;

async function readOneJsonObject() {
  const chunks = [];
  let bytes = 0;
  for await (const rawChunk of process.stdin) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    bytes += chunk.byteLength;
    if (bytes > MAX_STDIN_BYTES) throw new Error("hook input too large");
    chunks.push(chunk);
  }
  if (bytes === 0) throw new Error("empty hook input");
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("hook input must be an object");
  return value;
}

async function findNearestEndpoint(startDirectory) {
  let directory = resolve(startDirectory);
  while (true) {
    const candidate = join(directory, ENDPOINT_RELATIVE_PATH);
    try {
      return JSON.parse(await readFile(candidate, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    if (parent === directory || directory === parse(directory).root) return null;
    directory = parent;
  }
}

function validatedEndpoint(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid endpoint");
  if (value.schema_version !== 1 || typeof value.token !== "string" || value.token.length < 32) throw new Error("invalid endpoint");
  const url = new URL(value.url);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) throw new Error("non-loopback endpoint");
  if (!url.port || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("invalid endpoint URL");
  }
  return { url: url.origin, token: value.token };
}

async function run() {
  const payload = toBridgeHookInput(await readOneJsonObject());
  const payloadCwd = typeof payload.cwd === "string" && isAbsolute(payload.cwd) ? payload.cwd : process.cwd();
  const rawEndpoint = await findNearestEndpoint(payloadCwd);
  if (rawEndpoint === null) return;
  const endpoint = validatedEndpoint(rawEndpoint);
  const response = await fetch(`${endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${endpoint.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 204) return;
  if (!response.ok) throw new Error("bridge request failed");
  const output = toCodexHookOutput(await response.json());
  process.stdout.write(JSON.stringify(output));
}

await run().catch(() => undefined);
