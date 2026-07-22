import { access } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";

const adapter = await findWorkspaceAdapter(process.cwd());
if (adapter) {
  await import(pathToFileURL(adapter).href);
}

async function findWorkspaceAdapter(start) {
  let current = start;
  while (true) {
    const candidate = join(current, "scripts", "af-codex-hook.mjs");
    if (await isReadable(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return null;
    current = parent;
  }
}

async function isReadable(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
