import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { createAfCatalogMiddleware } from "./server/afCatalogApi";
import { createCodexCompanionMiddleware } from "./server/codexCompanionApi";
import { createWorkItemMiddleware } from "./server/workItemApi";
import { createWorkspaceApi } from "./server/workspaceApi";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(webRoot, "../..");

export default defineConfig({
  plugins: [react(), agentFactoryServerPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  server: {
    host: true,
    allowedHosts: true
  },
  preview: {
    host: true,
    allowedHosts: true
  }
});

function agentFactoryServerPlugin(): Plugin {
  const workspaceApi = createWorkspaceApi(repoRoot);
  const register = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use("/api/workspace", workspaceApi.middleware);
    server.middlewares.use("/api/work-items", createWorkItemMiddleware(repoRoot, workspaceApi.projection));
    server.middlewares.use("/api/codex-companion", createCodexCompanionMiddleware(repoRoot));
    server.middlewares.use("/api/catalog", createAfCatalogMiddleware(repoRoot));
    server.httpServer?.once("close", () => { void workspaceApi.close(); });
  };
  return {
    name: "agent-factory-server",
    configureServer(server) {
      register(server);
    },
    configurePreviewServer(server) {
      register(server);
    }
  };
}
