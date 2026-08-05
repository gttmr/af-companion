import { useState, type FormEvent } from "react";
import type { CompanionAppsSnapshot } from "@agent-factory/companion-contracts";

export function AppWorkspaceBar({ apps, busy, notice, allowCreate = true, onActivate, onCreate }: {
  apps: CompanionAppsSnapshot;
  busy: boolean;
  notice: string | null;
  allowCreate?: boolean;
  onActivate(applicationId: string): Promise<void>;
  onCreate(applicationId: string, displayName: string): Promise<void>;
}) {
  const [open, setOpen] = useState(apps.apps.length === 0);
  const [applicationId, setApplicationId] = useState("");
  const [displayName, setDisplayName] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onCreate(applicationId, displayName);
      setApplicationId(""); setDisplayName(""); setOpen(false);
    } catch { /* parent owns the visible error copy */ }
  }
  return <div className="app-workspace-bar">
    <div className="app-identity"><span>Active App</span><select aria-label="Active App" value={apps.active_application_id ?? ""} disabled={busy || apps.apps.length === 0} onChange={(event) => void onActivate(event.target.value)}><option value="" disabled>App 선택</option>{apps.apps.map((app) => <option key={app.application_id} value={app.application_id}>{app.display_name} · {app.application_id}</option>)}</select>{allowCreate ? <button type="button" className="text-button" onClick={() => setOpen((value) => !value)}>새 App</button> : null}</div>
    <span className="app-root" title={apps.applications_root}>{apps.applications_root}</span>
    {notice ? <span className="app-notice" role="status">{notice}</span> : null}
    {allowCreate && open ? <form className="new-app-form" onSubmit={(event) => void submit(event)}>
      <label><span>App ID</span><input required pattern="[a-z][a-z0-9\\-]{1,62}" placeholder="document-review" value={applicationId} onChange={(event) => setApplicationId(event.target.value)} /></label>
      <label><span>표시 이름</span><input required maxLength={120} placeholder="문서 검토 App" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <button type="submit" className="button-primary" disabled={busy}>App 만들기</button>
    </form> : null}
  </div>;
}
