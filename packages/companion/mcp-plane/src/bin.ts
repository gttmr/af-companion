#!/usr/bin/env node
import { resolve } from "node:path";
import { runStdioServer } from "./server.js";

const args = parseArgs(process.argv.slice(2));
await runStdioServer({ projectRoot: resolve(args.get("project-root") ?? process.cwd()), capabilityPath: args.get("capability-path") });

function parseArgs(values: string[]): Map<string, string> { const result = new Map<string, string>(); for (let index = 0; index < values.length; index += 2) { const key = values[index]; const value = values[index + 1]; if (!key?.startsWith("--") || !value) throw new Error(`Expected --name value, received ${key ?? "<end>"}`); result.set(key.slice(2), value); } return result; }
