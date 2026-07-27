import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { afWorkSkillIds, afWorkSkillLabels } from "../analyzer/afWorkItem";
import { JourneyGuideDialog } from "../components/JourneyGuideDialog";
import { JourneyRecoveryPanel } from "../components/JourneyRecoveryPanel";
import {
  classifyJourneyRecovery,
  type JourneyRecoveryAction,
} from "../companion/journeyRecovery";
import type { CompanionDiagnostics } from "../companion/types";
import { WaitingDecisionStrip } from "../layout/WaitingDecisionStrip";
import { WorkLiveStrip } from "../layout/WorkLiveStrip";
import { CodexCompanionRequestError, useCodexSessions } from "../state/useCodexSessions";
import { Button } from "../ui/primitives";
import { bootstrapWorkItem, WorkspaceApiError } from "../workspace/api";
import { useWorkItem, useWorkspaceProjection } from "../workspace/useWorkspaceProjection";

type StartMode = "new" | "existing";
type LaunchStage = "idle" | "confirm-path" | "preparing" | "trust" | "mcp";
type RecoveryGuide = "bridge" | "terminal" | "trust" | null;

interface JourneyRequestFailure {
  code: string;
  message: string;
}

export default function WorkspaceHome() {
  const [startMode, setStartMode] = useState<StartMode>("new");
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const workspace = useWorkspaceProjection(startMode === "existing" ? selectedWorkId || undefined : undefined);
  const codex = useCodexSessions();
  const selectedWork = useWorkItem(startMode === "existing" ? selectedWorkId || undefined : undefined);
  const snapshot = workspace.data;
  const selectedManifest = selectedWork.data?.data ?? null;
  const workItems = snapshot?.work_items ?? [];
  const [applicationName, setApplicationName] = useState("");
  const [launchStage, setLaunchStage] = useState<LaunchStage>("idle");
  const [launchFailure, setLaunchFailure] = useState<JourneyRequestFailure | null>(null);
  const [launchedWorkId, setLaunchedWorkId] = useState<string | null>(null);
  const [launchedAt, setLaunchedAt] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [applicationRoot, setApplicationRoot] = useState<string | null>(null);
  const [recoveryWorkId, setRecoveryWorkId] = useState<string | null>(null);
  const [recoveryApplicationName, setRecoveryApplicationName] = useState<string | null>(null);
  const [diagnosticBaseline, setDiagnosticBaseline] = useState<CompanionDiagnostics | null>(null);
  const [observedPendingTicket, setObservedPendingTicket] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryGuide, setRecoveryGuide] = useState<RecoveryGuide>(null);
  const [nextLaunchAllowedAt, setNextLaunchAllowedAt] = useState(0);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const identifierPreview = previewIdentifier(applicationName);

  useEffect(() => {
    if (workItems.some((item) => item.work_id === selectedWorkId)) return;
    if (selectedWorkId && (selectedWorkId === recoveryWorkId || selectedWorkId === launchedWorkId)) return;
    setSelectedWorkId(workItems[0]?.work_id ?? "");
  }, [launchedWorkId, recoveryWorkId, selectedWorkId, workItems]);

  const activeLaunchedSession = useMemo(() => {
    if (!launchedWorkId || !launchedAt) return null;
    const earliestStart = Date.parse(launchedAt) - 5_000;
    return codex.snapshot?.sessions.find((session) => (
      session.work_id === launchedWorkId
      && session.role === "plan"
      && session.activation_origin === "af_vscode_launch"
      && session.participation === "companion_active"
      && session.status === "active"
      && Date.parse(session.started_at) >= earliestStart
    )) ?? null;
  }, [codex.snapshot?.sessions, launchedAt, launchedWorkId]);

  const observedToolStart = useMemo(() => {
    if (!activeLaunchedSession || !launchedAt) return false;
    const launchTime = Date.parse(launchedAt);
    return codex.snapshot?.activities.some((activity) => (
      activity.session_id === activeLaunchedSession.session_id
      && activity.event === "tool_start"
      && Date.parse(activity.at) >= launchTime
    )) ?? false;
  }, [activeLaunchedSession, codex.snapshot?.activities, launchedAt]);

  useEffect(() => {
    if (launchStage === "trust" && activeLaunchedSession) setLaunchStage("mcp");
  }, [activeLaunchedSession, launchStage]);

  useEffect(() => {
    if (launchStage === "mcp" && observedToolStart) setLaunchStage("idle");
  }, [launchStage, observedToolStart]);

  useEffect(() => {
    if (!launchedWorkId || !launchedAt) return;
    const pending = codex.snapshot?.enrollment_tickets.some((ticket) => (
      ticket.work_id === launchedWorkId
      && ticket.requested_role === "plan"
      && ticket.activation_origin === "af_vscode_launch"
      && ticket.status === "pending"
      && Date.parse(ticket.issued_at) >= Date.parse(launchedAt) - 5_000
    ));
    if (pending) setObservedPendingTicket(true);
  }, [codex.snapshot?.enrollment_tickets, launchedAt, launchedWorkId]);

  useEffect(() => {
    if (nextLaunchAllowedAt <= Date.now()) return;
    setClockMs(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClockMs(now);
      if (now >= nextLaunchAllowedAt) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [nextLaunchAllowedAt]);

  const startPending = launchStage === "preparing" || codex.vscodeSessionPending || recoveryPending;
  const canStart = startMode === "new"
    ? Boolean(applicationName.trim() && identifierPreview)
    : Boolean(selectedWorkId);

  function requestStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLaunchFailure(null);
    if (startMode === "new") {
      setLaunchStage("confirm-path");
      return;
    }
    void startJourney();
  }

  async function startJourney() {
    setLaunchFailure(null);
    setLaunchStage("preparing");
    try {
      let workId = selectedWorkId;
      if (startMode === "new") {
        setRecoveryWorkId(identifierPreview);
        setRecoveryApplicationName(applicationName.trim());
        const created = await bootstrapWorkItem(applicationName.trim());
        workId = created.work_id;
        setSelectedWorkId(created.work_id);
        setApplicationRoot(created.application_root);
        setStartMode("existing");
        await workspace.refetch();
      } else {
        setRecoveryWorkId(workId);
        setRecoveryApplicationName(workId);
        setApplicationRoot(null);
      }
      await openWorkspace(workId);
    } catch (error) {
      setLaunchFailure(journeyFailure(error));
      setLaunchStage("idle");
    }
  }

  async function openWorkspace(workId: string) {
    setDiagnosticBaseline(codex.snapshot ? { ...codex.snapshot.diagnostics } : null);
    setObservedPendingTicket(false);
    setRecoveryWorkId(workId);
    setNextLaunchAllowedAt(Date.now() + 2_500);
    const receipt = await codex.launchVscodeSession(workId);
    setLaunchedWorkId(receipt.work_id);
    setLaunchedAt(receipt.launched_at);
    setWorkspacePath(receipt.workspace_path);
    setLaunchFailure(null);
    setLaunchStage("trust");
  }

  async function recoverBootstrap() {
    const name = recoveryApplicationName ?? recoveryWorkId;
    if (!name) return;
    setRecoveryPending(true);
    setLaunchFailure(null);
    setLaunchStage("preparing");
    try {
      const created = await bootstrapWorkItem(name, { reuseExisting: true });
      setSelectedWorkId(created.work_id);
      setRecoveryWorkId(created.work_id);
      setApplicationRoot(created.application_root);
      setStartMode("existing");
      await workspace.refetch();
      await openWorkspace(created.work_id);
    } catch (error) {
      setLaunchFailure(journeyFailure(error));
      setLaunchStage("idle");
    } finally {
      setRecoveryPending(false);
    }
  }

  async function retryWorkspaceLaunch() {
    const workId = recoveryWorkId ?? launchedWorkId ?? selectedWorkId;
    if (!workId) return;
    setRecoveryPending(true);
    setLaunchFailure(null);
    setLaunchStage("preparing");
    try {
      await openWorkspace(workId);
    } catch (error) {
      setLaunchFailure(journeyFailure(error));
      setLaunchStage("idle");
    } finally {
      setRecoveryPending(false);
    }
  }

  async function refreshLatest() {
    setRecoveryPending(true);
    try {
      await Promise.all([workspace.refetch(), selectedWork.refetch(), codex.refreshSnapshot()]);
      setLaunchFailure(null);
    } catch (error) {
      setLaunchFailure(journeyFailure(error));
    } finally {
      setRecoveryPending(false);
    }
  }

  function handleRecoveryAction(action: JourneyRecoveryAction) {
    if (action === "bridge_guide") setRecoveryGuide("bridge");
    if (action === "terminal_guide") setRecoveryGuide("terminal");
    if (action === "trust_guide") setRecoveryGuide("trust");
    if (action === "recover_work_item" || action === "retry_context_export") void recoverBootstrap();
    if (action === "retry_launch") void retryWorkspaceLaunch();
    if (action === "refresh_latest") void refreshLatest();
  }

  const currentRecoveryWorkId = recoveryWorkId ?? launchedWorkId ?? (startMode === "existing" ? selectedWorkId : null);
  const selectedWorkMissing = currentRecoveryWorkId === selectedWorkId
    && selectedWork.error instanceof WorkspaceApiError
    && selectedWork.error.status === 404;
  const recoveryState = classifyJourneyRecovery({
    snapshot: codex.snapshot,
    errorCode: launchFailure?.code
      ?? (selectedWorkMissing ? "work_item_missing" : null)
      ?? codex.snapshotFailure?.code
      ?? null,
    workId: currentRecoveryWorkId,
    launchedAt,
    diagnosticBaseline,
    observedPendingTicket,
  });
  const manualWorkspacePath = workspacePath ?? (currentRecoveryWorkId && codex.snapshot?.workspace.canonical_path
    ? `${codex.snapshot.workspace.canonical_path.replace(/\/$/, "")}/.agent-factory/vscode/${currentRecoveryWorkId}.code-workspace`
    : null);
  const retryDelayMs = Math.max(0, nextLaunchAllowedAt - clockMs);

  return (
    <div className="workspace-home">
      <header className="workspace-start-header">
        <div>
          <span className="workspace-eyebrow">Agent Factory companion</span>
          <h1>작업을 선택하고<br />VS Code에서 시작합니다.</h1>
          <p>Application 이름만 정하면 Work Item, app workspace, Companion Plan session을 한 흐름으로 준비합니다.</p>
        </div>
        <dl className="workspace-start-meta">
          <div><dt>Workspace</dt><dd>{snapshot?.identity.display_name ?? "연결 중"}</dd></div>
          <div><dt>Branch</dt><dd>{snapshot?.identity.git_branch || "detached"}</dd></div>
          <div><dt>Work items</dt><dd>{workItems.length}</dd></div>
          <div><dt>Changes</dt><dd>{snapshot?.changes.length ?? 0}</dd></div>
        </dl>
      </header>

      <section className="journey-launcher" aria-labelledby="journey-launch-title">
        <div className="journey-launch-intro">
          <span>Primary workflow</span>
          <h2 id="journey-launch-title">VS Code에서 작업 시작</h2>
          <p>새 application을 만들거나 현재 Work Item을 선택합니다. Browser는 workspace만 열며 enrollment와 첫 turn은 trusted VS Code terminal이 소유합니다.</p>
          <ol className="journey-gate-summary">
            <li><span>01</span><div><strong>경로 확인</strong><small>새 application일 때 한 번</small></div></li>
            <li><span>02</span><div><strong>Workspace Trust</strong><small>VS Code가 직접 요청</small></div></li>
            <li><span>03</span><div><strong>MCP Tool approval</strong><small>Tool 요청이 있을 때만</small></div></li>
          </ol>
        </div>

        <form className="journey-start-form" onSubmit={requestStart}>
          <div className="journey-mode-switch" role="tablist" aria-label="작업 시작 방식">
            <button type="button" role="tab" aria-selected={startMode === "new"} aria-controls="journey-start-panel" onClick={() => setStartMode("new")}>새 작업 시작</button>
            <button type="button" role="tab" aria-selected={startMode === "existing"} aria-controls="journey-start-panel" onClick={() => setStartMode("existing")}>기존 작업 선택 <small>{workItems.length}</small></button>
          </div>

          <div id="journey-start-panel" className="journey-start-panel" role="tabpanel">
            {startMode === "new" ? (
              <label>
                <span>Application 이름</span>
                <input autoFocus value={applicationName} placeholder="예: document classifier" autoComplete="off" onChange={(event) => setApplicationName(event.currentTarget.value)} />
                <small>{identifierPreview ? <>생성 ID <code>{identifierPreview}</code></> : "영문이나 숫자가 포함된 이름을 입력하세요."}</small>
              </label>
            ) : (
              <label>
                <span>Work Item</span>
                <select value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.currentTarget.value)}>
                  {workItems.length ? workItems.map((item) => <option key={item.work_id} value={item.work_id}>{item.work_id}</option>) : <option value="">선택할 Work Item 없음</option>}
                </select>
                <small>등록된 application workspace와 exact Plan scope로 엽니다.</small>
              </label>
            )}
          </div>

          <div className="journey-start-action">
            <div className={`journey-launch-state is-${launchStage}`} role="status" aria-live="polite">
              <i />
              <span>
                <strong>{launchStateTitle(launchStage, launchedWorkId)}</strong>
                <small>{applicationRoot ?? workspacePath ?? "ID, Capsule, shell command를 입력하지 않습니다."}</small>
              </span>
            </div>
            <Button type="submit" variant="primary" className="journey-primary-action" disabled={!canStart || startPending}>
              <span>{startPending ? "작업 준비 중…" : "작업 시작하고 VS Code 열기"}</span><i aria-hidden="true">↗</i>
            </Button>
          </div>
          {recoveryState ? (
            <JourneyRecoveryPanel
              state={recoveryState}
              detail={launchFailure?.message
                ?? (selectedWorkMissing && selectedWork.error instanceof Error ? selectedWork.error.message : null)
                ?? null}
              workspacePath={manualWorkspacePath}
              actionPending={recoveryPending}
              retryDelayMs={retryDelayMs}
              onAction={handleRecoveryAction}
            />
          ) : launchFailure || codex.vscodeSessionError ? (
            <p className="journey-launch-error" role="alert">{launchFailure?.message ?? codex.vscodeSessionError}</p>
          ) : null}
        </form>
      </section>

      {startMode === "existing" && selectedWorkId ? (
        <section className="home-live-work" aria-label="선택된 Work Item 진행 상태">
          <div className="section-title-line compact">
            <div><span>Current work</span><h2>자동 projection</h2></div>
            <p>추가 navigation 없이 현재 Session, Skill, Graph, application source와 대기 질문을 갱신합니다.</p>
          </div>
          <WorkLiveStrip
            workId={selectedWorkId}
            routeSkillId={selectedManifest?.focus_skill ?? "af-discover-assets"}
            manifest={selectedManifest}
            workspace={snapshot ?? null}
            codex={codex.snapshot}
            live={workspace.live}
          />
          <WaitingDecisionStrip manifest={selectedManifest} />
        </section>
      ) : null}

      <section className="work-map" aria-label="Re-entrant Work Skill lifecycle">
        {afWorkSkillIds.map((skillId, index) => (
          <div key={skillId} className="work-map-step">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{afWorkSkillLabels[skillId].short}</strong><code>{skillId}</code><p>{afWorkSkillLabels[skillId].description}</p></div>
          </div>
        ))}
      </section>

      <section className="work-item-index">
        <div className="section-title-line">
          <div><span>Workspace projection</span><h2>Work items</h2></div>
          <p>기존 작업을 열거나 현재 Work Skill 상태를 확인합니다.</p>
        </div>
        {workspace.isLoading ? <p className="table-message">Work Item을 읽는 중…</p> : workspace.error ? (
          <p className="table-message is-error">{(workspace.error as Error).message}</p>
        ) : !workItems.length ? (
          <div className="empty-workspace-guide">
            <strong>아직 `af-work-item.json`이 없습니다.</strong>
            <p>위의 새 작업 시작에 application 이름을 입력하면 빈 Work Item과 external app workspace를 함께 준비합니다.</p>
          </div>
        ) : (
          <div className="work-item-table-wrap">
            <table className="work-item-table">
              <thead><tr><th>Work item</th><th>Focus</th><th>Active runs</th><th>Discover</th><th>Compose</th><th>Scaffold</th><th>Verify</th><th>Updated</th></tr></thead>
              <tbody>
                {workItems.map((item) => (
                  <tr key={item.work_id}>
                    <td><Link to={`/work/${encodeURIComponent(item.work_id)}/discover`}>{item.work_id}</Link><code>{item.artifact_root}</code></td>
                    <td>{item.focus_skill ? afWorkSkillLabels[item.focus_skill].short : "—"}</td>
                    <td>{item.active_runs.length ? item.active_runs.map((run) => run.role).join(", ") : "—"}</td>
                    {afWorkSkillIds.map((skillId) => <td key={skillId}><span className={`table-status is-${item.skills[skillId].status}`}>{item.skills[skillId].status}</span></td>)}
                    <td><time>{new Date(item.updated_at).toLocaleString()}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <JourneyGuideDialog
        open={launchStage === "confirm-path"}
        gate="Gate 1 / 3"
        title="새 application 경로를 확인하세요"
        description="확인 후에만 빈 Work Item과 application Git workspace를 생성합니다."
        primaryLabel="경로 확인 및 시작"
        primaryPending={startPending}
        onPrimary={() => void startJourney()}
        secondaryLabel="취소"
        onSecondary={() => setLaunchStage("idle")}
      >
        <div className="journey-path-preview"><span>기본 생성 경로</span><code>~/work/af-apps/{identifierPreview ?? "application-id"}</code></div>
        <p><code>AF_APPLICATIONS_ROOT</code>가 설정된 환경에서는 해당 root 아래에 같은 ID로 생성합니다. 서버가 반환한 absolute path만 local registry에 기록합니다.</p>
      </JourneyGuideDialog>

      <JourneyGuideDialog
        open={launchStage === "trust"}
        gate="Gate 2 / 3"
        title="VS Code에서 Workspace Trust를 승인하세요"
        description="VS Code가 열린 뒤 Trust를 승인하면 Start AF Session Task가 자동으로 실행됩니다. 연결되면 이 안내는 자동으로 바뀝니다."
        secondaryLabel="가이드 닫기"
        onSecondary={() => setLaunchStage("idle")}
      >
        <ol className="journey-guide-steps">
          <li><span>1</span><p><strong>Trust</strong>를 선택해 app과 Agent Factory 두 folder의 Task 실행을 허용합니다.</p></li>
          <li><span>2</span><p>dedicated terminal에서 <strong>Start AF Session</strong>과 Codex 입력 화면이 열리는지 확인합니다.</p></li>
          <li><span>3</span><p>자동 Task가 보이지 않을 때만 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>를 한 번 누릅니다.</p></li>
        </ol>
      </JourneyGuideDialog>

      <JourneyGuideDialog
        open={launchStage === "mcp"}
        gate="Gate 3 / 3"
        title="MCP Tool approval을 확인하세요"
        description="Companion session이 연결됐습니다. Codex가 MCP Tool 승인을 요청하는 경우에만 server와 Tool 범위를 확인하고 승인합니다."
        secondaryLabel="가이드만 닫기"
        onSecondary={() => setLaunchStage("idle")}
      >
        <ol className="journey-guide-steps">
          <li><span>1</span><p>승인 화면에서 요청한 MCP server와 read-only Tool 이름을 확인합니다.</p></li>
          <li><span>2</span><p>Capsule, Work ID, shell command를 복사하거나 입력하지 않습니다.</p></li>
          <li><span>3</span><p>현재 factory-cwd 세션은 app root의 <code>.codex/config.toml</code>을 자동 소비하지 않으므로 approval이 나타나지 않아도 launch 실패가 아닙니다.</p></li>
        </ol>
      </JourneyGuideDialog>

      <JourneyGuideDialog
        open={recoveryGuide === "bridge"}
        gate="Recovery · Bridge"
        title="Codex Bridge를 다시 시작하세요"
        description="Web은 background service를 대신 실행하지 않습니다. Agent Factory의 packages/web terminal에서 Bridge를 시작합니다."
        secondaryLabel="확인"
        onSecondary={() => setRecoveryGuide(null)}
      >
        <div className="journey-path-preview"><span>packages/web</span><code>npm run dev:companion-bridge</code></div>
        <p>시작 후 이 화면은 2초 snapshot polling으로 자동 복구됩니다.</p>
      </JourneyGuideDialog>

      <JourneyGuideDialog
        open={recoveryGuide === "terminal"}
        gate="Recovery · Terminal"
        title="Start AF Session Task를 실행하세요"
        description="Workspace Trust 승인 뒤 자동 Task가 실행되지 않았을 때만 VS Code의 기본 build task를 한 번 실행합니다."
        secondaryLabel="확인"
        onSecondary={() => setRecoveryGuide(null)}
      >
        <ol className="journey-guide-steps">
          <li><span>1</span><p>VS Code window가 현재 application과 <strong>Agent Factory (factory)</strong> 두 folder를 포함하는지 확인합니다.</p></li>
          <li><span>2</span><p><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>를 눌러 <strong>Start AF Session</strong>을 실행합니다.</p></li>
          <li><span>3</span><p>열린 Codex terminal에 자연어 요구사항을 입력합니다. ID나 Capsule은 입력하지 않습니다.</p></li>
        </ol>
      </JourneyGuideDialog>

      <JourneyGuideDialog
        open={recoveryGuide === "trust"}
        gate="Recovery · Hook"
        title="Hook 설정과 Workspace Trust를 확인하세요"
        description="Session은 시작됐지만 첫 prompt receipt가 없어 trusted Task와 repository Hook 구성을 함께 확인합니다."
        secondaryLabel="확인"
        onSecondary={() => setRecoveryGuide(null)}
      >
        <ol className="journey-guide-steps">
          <li><span>1</span><p>factory root의 <code>.codex/hooks.json</code>이 존재하는지 확인합니다.</p></li>
          <li><span>2</span><p>VS Code에서 두 workspace folder를 Trust한 상태인지 확인합니다.</p></li>
          <li><span>3</span><p>Start AF Session terminal에서 자연어 prompt를 한 번 제출하고 Web의 연결 상태를 확인합니다.</p></li>
        </ol>
      </JourneyGuideDialog>
    </div>
  );
}

function previewIdentifier(value: string): string | null {
  const identifier = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(identifier) ? identifier : null;
}

function launchStateTitle(stage: LaunchStage, workId: string | null): string {
  if (stage === "preparing") return "Work Item과 workspace를 준비하고 있습니다";
  if (stage === "trust") return `${workId ?? "작업"} · VS Code 연결 대기`;
  if (stage === "mcp") return `${workId ?? "작업"} · Companion 연결됨`;
  return "Plan session · VS Code 시작 전";
}

function journeyFailure(error: unknown): JourneyRequestFailure {
  if (error instanceof WorkspaceApiError || error instanceof CodexCompanionRequestError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "request_failed",
    message: error instanceof Error ? error.message : "작업을 시작하지 못했습니다.",
  };
}
