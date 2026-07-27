#!/usr/bin/env node

import { runServer } from "../src/server.mjs";

try {
  await runServer(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown startup failure";
  process.stderr.write(`Agent Factory context MCP startup failed: ${message}\n`);
  process.exitCode = 1;
}
