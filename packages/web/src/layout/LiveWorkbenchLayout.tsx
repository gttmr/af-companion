import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";

import { useCodexSessions } from "../state/useCodexSessions";
import { useWorkItem, useWorkspaceProjection } from "../workspace/useWorkspaceProjection";
import { LiveRail } from "./LiveRail";
import { WorkSkillRail } from "./WorkSkillRail";

export function LiveWorkbenchLayout({ children }: { children: ReactNode }) {
  const { workId } = useParams<{ workId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useWorkspaceProjection();
  const workItem = useWorkItem(workId);
  const codex = useCodexSessions();
  const snapshot = workspace.data ?? null;
  const manifest = workItem.data?.data ?? null;
  const currentScreen = currentSkillRoute(location.pathname);

  return (
    <div className="live-workbench-shell">
      <header className="workspace-topbar">
        <NavLink to="/" className="workspace-brand" aria-label="Agent Factory home">
          <span className="brand-mark">AF</span>
          <span><strong>Companion</strong><small>external Codex workspace</small></span>
        </NavLink>
        <div className="workspace-context">
          <label>
            <span>Work item</span>
            <select
              value={workId ?? ""}
              onChange={(event) => {
                const next = event.currentTarget.value;
                navigate(next ? `/work/${encodeURIComponent(next)}/${currentScreen}` : "/");
              }}
            >
              <option value="">Workspace overview</option>
              {snapshot?.work_items.map((item) => <option key={item.work_id} value={item.work_id}>{item.work_id}</option>)}
            </select>
          </label>
          <div className="workspace-identity">
            <span>{snapshot?.identity.display_name ?? "workspace"}</span>
            <code>{snapshot?.identity.git_branch || "detached"}</code>
          </div>
        </div>
        <nav className="workspace-global-nav" aria-label="Workspace tools">
          <NavLink to="/assets">Assets</NavLink>
          <NavLink to="/connections">Connections</NavLink>
          <button
            type="button"
            className="open-vscode-button"
            disabled={!codex.snapshot?.editor.launch_supported || codex.launchPending}
            onClick={() => void codex.launchVscode()}
          >
            <span>VS Code</span><i>↗</i>
          </button>
        </nav>
      </header>

      <div className={`workspace-frame${workId ? " has-work-item" : ""}`}>
        {workId ? <WorkSkillRail workId={workId} manifest={manifest} /> : null}
        <main className="skill-workspace">
          {workspace.error ? <div className="workspace-global-error">{(workspace.error as Error).message}</div> : null}
          {children}
        </main>
        <LiveRail snapshot={snapshot} codex={codex.snapshot} live={workspace.live} />
      </div>
    </div>
  );
}

function currentSkillRoute(pathname: string): string {
  const match = /\/(discover|compose|scaffold|verify)(?:\/|$)/.exec(pathname);
  return match?.[1] ?? "discover";
}
