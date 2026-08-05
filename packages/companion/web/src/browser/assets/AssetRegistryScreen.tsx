import { useEffect, useMemo, useState } from "react";
import type {
  CompanionAssetType,
  CompanionRegistryCard,
  CompanionRegistryContract,
  CompanionRegistryDecision,
  CompanionRegistryPublishDecision,
  CompanionRegistryRecord,
  CompanionRegistryStatus,
} from "@agent-factory/companion-contracts";
import { CompanionApiError, type CompanionApi } from "../api/CompanionApi.js";
import {
  contractFromRegistryRecord,
  createRegistryDraftContract,
  parseRegistryContract,
  serializeRegistryContract,
} from "./registryDraft.js";

const assetTypes: CompanionAssetType[] = ["agent", "workflow", "tool"];
const registryStatuses: CompanionRegistryStatus[] = ["draft", "reviewed", "published", "deprecated"];

type Selection = { assetId: string; version: number };
type StatusFilter = CompanionRegistryStatus | "all";
type EditorState = {
  mode: "create" | "update" | "view";
  assetId?: string;
  version?: number;
  source: string;
  createdBy: string;
  validationHash: string | null;
};

export function AssetRegistryScreen({ api }: { api: CompanionApi }) {
  const [assetType, setAssetType] = useState<CompanionAssetType>("agent");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CompanionRegistryCard[]>([]);
  const [registryRevision, setRegistryRevision] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<CompanionRegistryRecord | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [decisionId, setDecisionId] = useState("");
  const [decisionRationale, setDecisionRationale] = useState("");
  const [publishChecks, setPublishChecks] = useState({ owner: false, domain: false, reuse: false });
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    void api.listRegistryAssets({
      asset_type: assetType,
      statuses: status === "all" ? registryStatuses : [status],
      all_versions: true,
    }, controller.signal).then((snapshot) => {
      if (controller.signal.aborted) return;
      setItems(snapshot.items);
      setRegistryRevision(snapshot.registry_revision);
      setSelection((current) => current && snapshot.items.some((item) => sameRef(item, current))
        ? current
        : snapshot.items[0] ? cardRef(snapshot.items[0]) : null);
      setError(null);
    }).catch((caught) => {
      if (!controller.signal.aborted) setError(errorMessage(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setListLoading(false);
    });
    return () => controller.abort();
  }, [api, assetType, refreshKey, status]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) => [item.asset_id, item.name, item.responsibility, ...item.capability_tags]
      .join(" ").toLocaleLowerCase().includes(normalized));
  }, [items, query]);

  useEffect(() => {
    if (listLoading) return;
    if (!visibleItems.length) { setSelection(null); return; }
    if (!selection || !visibleItems.some((item) => sameRef(item, selection))) setSelection(cardRef(visibleItems[0]!));
  }, [listLoading, selection, visibleItems]);

  useEffect(() => {
    if (!selection) { setDetail(null); return; }
    const controller = new AbortController();
    setDetailLoading(true);
    setDecisionId("");
    setDecisionRationale("");
    setPublishChecks({ owner: false, domain: false, reuse: false });
    void api.getRegistryAsset(selection.assetId, selection.version, controller.signal).then((snapshot) => {
      if (controller.signal.aborted) return;
      setDetail(snapshot.asset);
      setRegistryRevision(snapshot.registry_revision);
      setError(null);
    }).catch((caught) => {
      if (!controller.signal.aborted) { setDetail(null); setError(errorMessage(caught)); }
    }).finally(() => {
      if (!controller.signal.aborted) setDetailLoading(false);
    });
    return () => controller.abort();
  }, [api, refreshKey, selection]);

  function refresh(message?: string) {
    setNotice(message ?? null);
    setError(null);
    setRefreshKey((value) => value + 1);
  }

  function changeType(next: CompanionAssetType) {
    setAssetType(next);
    setSelection(null);
    setEditor(null);
    setNotice(null);
    setError(null);
  }

  function openCreate(contract = createRegistryDraftContract(assetType)) {
    setEditor({ mode: "create", source: serializeRegistryContract(contract), createdBy: "", validationHash: null });
    setNotice(null);
    setError(null);
  }

  function openRecord(record: CompanionRegistryRecord, mode: "update" | "view") {
    setEditor({ mode, assetId: record.asset_id, version: record.version, source: serializeRegistryContract(contractFromRegistryRecord(record)), createdBy: "", validationHash: record.contract_hash });
    setNotice(null);
    setError(null);
  }

  async function validateEditor() {
    if (!editor) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const contract = parseRegistryContract(editor.source);
      if (contract.asset_type !== assetType) throw new Error(`현재 ${assetType} register에서는 asset_type을 ${assetType}으로 유지하세요.`);
      const result = await api.validateRegistryContract(contract);
      setEditor({ ...editor, validationHash: result.contract_hash });
      setNotice("Registry core contract validation을 통과했습니다.");
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function saveEditor() {
    if (!editor || editor.mode === "view" || !registryRevision) return;
    if (!editor.validationHash) { setError("현재 JSON을 먼저 Validate하세요."); return; }
    let contract: CompanionRegistryContract;
    try { contract = parseRegistryContract(editor.source); }
    catch (caught) { setError(errorMessage(caught)); return; }
    if (contract.asset_type !== assetType) { setError(`현재 ${assetType} register에서는 asset_type을 ${assetType}으로 유지하세요.`); return; }
    if (editor.mode === "create" && !editor.createdBy.trim()) { setError("Draft 생성 주체를 입력하세요."); return; }
    await mutate(
      () => editor.mode === "create"
        ? api.createRegistryDraft(contract, editor.createdBy.trim(), registryRevision)
        : api.updateRegistryDraft(editor.assetId!, editor.version!, contract, registryRevision),
      editor.mode === "create" ? "Draft version을 생성했습니다." : "Draft contract를 갱신했습니다.",
    );
  }

  async function submitLifecycle() {
    if (!detail || !registryRevision) return;
    const action = lifecycleAction(detail.status);
    if (!action) return;
    if (!decisionId.trim() || !decisionRationale.trim()) { setError("Decision ID와 사용자 근거를 모두 입력하세요."); return; }
    const decision: CompanionRegistryDecision = { decision_id: decisionId.trim(), selected_by: "user", rationale: decisionRationale.trim() };
    if (action === "publish" && !Object.values(publishChecks).every(Boolean)) { setError("Owner, Domain, Reuse 확인을 모두 완료해야 Publish할 수 있습니다."); return; }
    if (action === "deprecate" && !window.confirm(`${detail.asset_id}@${detail.version}을 Deprecated 처리할까요?`)) return;
    const operation = action === "review"
      ? () => api.reviewRegistryDraft(detail.asset_id, detail.version, decision, registryRevision)
      : action === "publish"
        ? () => api.publishRegistryAsset(detail.asset_id, detail.version, { ...decision, owner_confirmed: true, domain_confirmed: true, reuse_confirmed: true } satisfies CompanionRegistryPublishDecision, registryRevision)
        : () => api.deprecateRegistryAsset(detail.asset_id, detail.version, decision, registryRevision);
    await mutate(operation, action === "review" ? "사용자 Review 결정을 기록했습니다." : action === "publish" ? "검토된 version을 Publish했습니다." : "사용자 결정으로 Deprecated 처리했습니다.");
  }

  async function mutate(operation: () => ReturnType<CompanionApi["createRegistryDraft"]>, success: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await operation();
      setRegistryRevision(result.registry_revision);
      setDetail(result.asset);
      setItems((current) => [...current.filter((item) => !sameRef(item, { assetId: result.asset.asset_id, version: result.asset.version })), recordCard(result.asset)]
        .sort((left, right) => left.asset_id.localeCompare(right.asset_id) || right.version - left.version));
      setSelection({ assetId: result.asset.asset_id, version: result.asset.version });
      setStatus("all");
      setEditor(null);
      setDecisionId(""); setDecisionRationale(""); setPublishChecks({ owner: false, domain: false, reuse: false });
      setNotice(success);
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      if (caught instanceof CompanionApiError && caught.status === 409 && caught.code === "registry_revision_conflict") {
        setEditor(null);
        setDecisionId(""); setDecisionRationale(""); setPublishChecks({ owner: false, domain: false, reuse: false });
        setNotice("Registry revision이 변경되어 작업을 적용하지 않았습니다. 최신 version을 다시 읽고 검토하세요.");
        setRefreshKey((value) => value + 1);
      } else setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  const action = detail ? lifecycleAction(detail.status) : null;

  return <section className="registry-screen" aria-labelledby="registry-title">
    <header className="registry-masthead">
      <div><p className="eyebrow">Repository-global Asset authority</p><h2 id="registry-title">Asset Registry</h2><p>Agent, Workflow, Tool의 versioned contract를 관리합니다. Active App은 published binding만 소비합니다.</p></div>
      <div className="registry-masthead-actions"><code title={registryRevision ?? undefined}>rev {shortHash(registryRevision)}</code><button type="button" onClick={() => refresh("최신 Registry를 다시 읽었습니다.")} disabled={busy}>새로고침</button><button type="button" className="button-primary" onClick={() => openCreate()} disabled={busy}>New draft</button></div>
    </header>

    <div className="registry-toolbar">
      <nav aria-label="Asset type" role="tablist">{assetTypes.map((type) => <button key={type} type="button" role="tab" aria-selected={assetType === type} onClick={() => changeType(type)}>{titleCase(type)}</button>)}</nav>
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">All</option>{registryStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="registry-search"><span>Filter</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="name, id, responsibility, capability" /></label>
      <span>{visibleItems.length} versions</span>
    </div>

    {notice ? <p className="registry-message" role="status">{notice}</p> : null}
    {error ? <p className="registry-message is-error" role="alert">{error}</p> : null}
    {editor ? <RegistryEditor editor={editor} busy={busy} onChange={(source) => setEditor({ ...editor, source, validationHash: null })} onCreatedBy={(createdBy) => setEditor({ ...editor, createdBy })} onValidate={() => void validateEditor()} onSave={() => void saveEditor()} onClose={() => setEditor(null)} /> : null}

    <div className="registry-layout">
      <section className="registry-register" aria-label={`${assetType} Registry versions`}>
        <header><strong>{titleCase(assetType)} versions</strong><span>L0 register · exact version 선택</span></header>
        {listLoading ? <p className="registry-empty">Registry index를 읽는 중…</p> : visibleItems.length ? <table><thead><tr><th>Asset</th><th>Status</th><th>Effect</th><th>Contract</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={`${item.asset_id}@${item.version}`} className={selection && sameRef(item, selection) ? "is-selected" : undefined}><td><button type="button" className="registry-row-select" onClick={() => setSelection(cardRef(item))}><strong>{item.name}</strong><code>{item.asset_id}@{item.version}</code><small>{item.responsibility}</small></button></td><td><span className={`registry-status is-${item.status}`}>{item.status}</span></td><td><code>{item.side_effect_class}</code></td><td><code title={item.contract_hash}>{shortHash(item.contract_hash)}</code></td></tr>)}</tbody></table> : <p className="registry-empty">조건에 맞는 Asset version이 없습니다.</p>}
      </section>

      <aside className="registry-detail" aria-label="Selected Asset contract">
        {detailLoading ? <p className="registry-empty">Contract를 읽는 중…</p> : detail ? <>
          <header><div><span className={`asset-kind asset-kind--${detail.asset_type}`}>{detail.asset_type}</span><span className={`registry-status is-${detail.status}`}>{detail.status}</span></div><h3>{detail.name}</h3><code>{detail.asset_id}@{detail.version}</code><p>{detail.responsibility}</p><div className="registry-detail-actions">{detail.status === "draft" ? <button type="button" onClick={() => openRecord(detail, "update")}>Edit contract</button> : <button type="button" onClick={() => openRecord(detail, "view")}>View contract</button>}{["published", "deprecated"].includes(detail.status) ? <button type="button" onClick={() => openCreate(contractFromRegistryRecord(detail))}>New version draft</button> : null}</div></header>
          <dl className="registry-facts"><div><dt>Owner</dt><dd>{detail.owner}</dd></div><div><dt>Domain</dt><dd>{detail.domain_scope}</dd></div><div><dt>Reuse</dt><dd>{detail.reuse_status}</dd></div><div><dt>Contract</dt><dd title={detail.contract_hash}>{shortHash(detail.contract_hash)}</dd></div></dl>
          <div className="registry-io"><RegistryFields label="Inputs" fields={detail.inputs} /><RegistryFields label="Outputs" fields={detail.outputs} /></div>
          <RegistryLifecycle record={detail} />
          {action ? <section className="registry-decision"><header><span>User decision</span><strong>{action}</strong></header><p>모델 추천이나 validator 결과만으로 상태를 바꾸지 않습니다.</p><label><span>Decision ID</span><input value={decisionId} onChange={(event) => setDecisionId(event.target.value)} placeholder={`decision:${action}-asset`} /></label><label><span>Rationale</span><textarea rows={3} value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} placeholder="사용자가 확인한 증거와 선택 이유" /></label>{action === "publish" ? <div className="registry-publish-checks"><label><input type="checkbox" checked={publishChecks.owner} onChange={(event) => setPublishChecks({ ...publishChecks, owner: event.target.checked })} /> Owner 확인</label><label><input type="checkbox" checked={publishChecks.domain} onChange={(event) => setPublishChecks({ ...publishChecks, domain: event.target.checked })} /> Domain 확인</label><label><input type="checkbox" checked={publishChecks.reuse} onChange={(event) => setPublishChecks({ ...publishChecks, reuse: event.target.checked })} /> Reuse 확인</label></div> : null}<button type="button" className={action === "deprecate" ? "registry-danger" : "button-primary"} disabled={busy} onClick={() => void submitLifecycle()}>{actionLabel(action)}</button></section> : null}
        </> : <p className="registry-empty">Asset version을 선택하세요.</p>}
      </aside>
    </div>
  </section>;
}

function RegistryEditor({ editor, busy, onChange, onCreatedBy, onValidate, onSave, onClose }: { editor: EditorState; busy: boolean; onChange(value: string): void; onCreatedBy(value: string): void; onValidate(): void; onSave(): void; onClose(): void }) {
  const writable = editor.mode !== "view";
  return <section className="registry-editor" aria-label="Asset contract editor"><header><div><span>{editor.mode === "create" ? "New version" : editor.mode === "update" ? "Mutable draft" : "Immutable version"}</span><h3>{editor.mode === "create" ? "Create Registry draft" : `${editor.assetId}@${editor.version}`}</h3></div><button type="button" onClick={onClose}>닫기</button></header>{editor.mode === "create" ? <label className="registry-created-by"><span>Created by</span><input value={editor.createdBy} onChange={(event) => onCreatedBy(event.target.value)} placeholder="명시적인 사용자 또는 session ID" /></label> : null}<label className="registry-json"><span>Asset contract JSON</span><textarea spellCheck={false} readOnly={!writable} value={editor.source} onChange={(event) => onChange(event.target.value)} /></label><footer>{editor.validationHash ? <code title={editor.validationHash}>validated {shortHash(editor.validationHash)}</code> : <span>Registry core validation이 필요합니다.</span>}<div><button type="button" disabled={busy} onClick={onValidate}>Validate</button>{writable ? <button type="button" className="button-primary" disabled={busy || !editor.validationHash} onClick={onSave}>{editor.mode === "create" ? "Create draft" : "Update draft"}</button> : null}</div></footer></section>;
}

function RegistryFields({ label, fields }: { label: string; fields: Array<{ name: string; type: string; required: boolean }> }) {
  return <section><header><span>{label}</span><strong>{fields.length}</strong></header>{fields.length ? <ul>{fields.map((field) => <li key={`${field.name}:${field.type}`}><code>{field.name}</code><span>{field.type}{field.required ? " · required" : ""}</span></li>)}</ul> : <p>선언된 field 없음</p>}</section>;
}

function RegistryLifecycle({ record }: { record: CompanionRegistryRecord }) {
  const decisions = [
    ["Review", record.lifecycle.review_decision],
    ["Publish", record.lifecycle.publish_decision],
    ["Deprecate", record.lifecycle.deprecation_decision],
  ] as const;
  return <section className="registry-lifecycle"><header><span>Lifecycle evidence</span><strong>{record.status}</strong></header><dl><div><dt>Created by</dt><dd>{record.lifecycle.created_by}</dd></div>{decisions.map(([label, decision]) => decision ? <div key={label}><dt>{label}</dt><dd><code>{decision.decision_id}</code><span>{decision.rationale}</span></dd></div> : null)}</dl></section>;
}

function lifecycleAction(status: CompanionRegistryStatus): "review" | "publish" | "deprecate" | null { if (status === "draft") return "review"; if (status === "reviewed") return "publish"; if (status === "published") return "deprecate"; return null; }
function actionLabel(action: "review" | "publish" | "deprecate"): string { if (action === "review") return "Mark reviewed"; if (action === "publish") return "Publish immutable version"; return "Deprecate version"; }
function cardRef(card: CompanionRegistryCard): Selection { return { assetId: card.asset_id, version: card.version }; }
function recordCard(record: CompanionRegistryRecord): CompanionRegistryCard { return { asset_id: record.asset_id, asset_type: record.asset_type, version: record.version, status: record.status, name: record.name, responsibility: record.responsibility, capability_tags: [...record.capability_tags], side_effect_class: record.side_effect_class, contract_hash: record.contract_hash }; }
function sameRef(card: CompanionRegistryCard, selection: Selection): boolean { return card.asset_id === selection.assetId && card.version === selection.version; }
function shortHash(value: string | null): string { return value ? value.slice(0, 10) : "unavailable"; }
function titleCase(value: string): string { return value[0]!.toUpperCase() + value.slice(1); }
function errorMessage(error: unknown): string { return error instanceof CompanionApiError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error); }
