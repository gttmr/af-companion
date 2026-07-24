import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createRegistryDraft,
  deprecateRegistryAsset,
  getRegistryAsset,
  publishRegistryAsset,
  RegistryApiError,
  reviewRegistryDraft,
  updateRegistryDraft,
  validateRegistryContract,
  type AssetRecord,
  type AssetSearchQuery,
  type AssetType,
  type L0AssetCard,
  type L1AssetCard,
  type PublishDecision,
  type RegistryMutationResponse,
  type RegistryStatus,
  type SideEffectClass,
  type UserDecision,
} from "../registry/assetRegistryClient";
import {
  contractFromRegistryRecord,
  createRegistryDraftContract,
  parseRegistryContractEditor,
  serializeRegistryContract,
} from "../registry/registryDraft";
import {
  assetRegistryQueryKey,
  useAssetRegistryComparison,
  useAssetRegistryDetail,
  useAssetRegistryList,
  useAssetRegistrySearch,
  useAssetRegistrySummary,
  useAssetRegistryUsage,
  useAssetRegistryVersions,
} from "../state/useAssetRegistry";
import { useEditorActions } from "../workspace/useWorkspaceProjection";

const assetTypes: AssetType[] = ["agent", "workflow", "tool"];
const allStatuses: RegistryStatus[] = ["draft", "reviewed", "published", "deprecated"];
const statusOptions: Array<RegistryStatus | "all"> = ["published", "draft", "reviewed", "deprecated", "all"];
const sideEffectOptions: Array<SideEffectClass | "any"> = ["any", "none", "read_only", "write", "external_action"];
const domainScopeOptions = ["any", "domain_specific", "cross_domain", "domain_neutral"] as const;
const bindingKindOptions = ["any", "function", "mcp", "built_in", "a2a", "unresolved", "none"] as const;

interface SearchFilters {
  sideEffect: SideEffectClass | "any";
  domainScope: (typeof domainScopeOptions)[number];
  owner: string;
  bindingKind: (typeof bindingKindOptions)[number];
  runtimeRequirements: string;
  requiredInputs: string;
  requiredOutputs: string;
  includeDeprecated: boolean;
}

const emptySearchFilters: SearchFilters = {
  sideEffect: "any",
  domainScope: "any",
  owner: "",
  bindingKind: "any",
  runtimeRequirements: "",
  requiredInputs: "",
  requiredOutputs: "",
  includeDeprecated: false,
};

type Selection = { assetId: string; version: number };
type EditorMode =
  | { kind: "create" }
  | { kind: "update"; assetId: string; version: number }
  | { kind: "view"; assetId: string; version: number };

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const editor = useEditorActions();
  const [assetType, setAssetType] = useState<AssetType>("agent");
  const [status, setStatus] = useState<RegistryStatus | "all">("published");
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState<AssetSearchQuery | null>(null);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptySearchFilters);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [editorSource, setEditorSource] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [validationHash, setValidationHash] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionId, setDecisionId] = useState("");
  const [decisionRationale, setDecisionRationale] = useState("");
  const [publishChecks, setPublishChecks] = useState({ owner: false, domain: false, reuse: false });

  const statuses = status === "all" ? allStatuses : [status];
  const summary = useAssetRegistrySummary();
  const registry = useAssetRegistryList(assetType, statuses);
  const semanticSearch = useAssetRegistrySearch(searchQuery);
  const detail = useAssetRegistryDetail(selection?.assetId ?? null, selection?.version ?? null);
  const versions = useAssetRegistryVersions(selection?.assetId ?? null);
  const usage = useAssetRegistryUsage(selection?.assetId ?? null, selection?.version ?? null);
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [compareTo, setCompareTo] = useState<number | null>(null);
  const comparison = useAssetRegistryComparison(selection?.assetId ?? null, compareFrom, compareTo);

  useEffect(() => {
    if (summary.data?.registry_revision) setExpectedRevision(summary.data.registry_revision);
  }, [summary.data?.registry_revision]);

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (registry.data?.items ?? []).filter((asset) => {
      if (!normalized) return true;
      return [asset.asset_id, asset.name, asset.responsibility, ...asset.capability_tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [query, registry.data?.items]);

  useEffect(() => {
    if (registry.isPending) return;
    if (items.length === 0) {
      setSelection(null);
      return;
    }
    if (!selection || !items.some((asset) => asset.asset_id === selection.assetId && asset.version === selection.version)) {
      setSelection({ assetId: items[0].asset_id, version: items[0].version });
    }
  }, [items, registry.isPending, selection]);

  useEffect(() => {
    const available = versions.data?.items.map((entry) => entry.version) ?? [];
    if (available.length < 2) {
      setCompareFrom(null);
      setCompareTo(null);
      return;
    }
    setCompareFrom((current) => current && available.includes(current) ? current : available[available.length - 1]);
    setCompareTo((current) => current && available.includes(current) ? current : available[0]);
  }, [versions.data?.items]);

  function changeAssetType(next: AssetType) {
    setAssetType(next);
    setSelection(null);
    setSearchQuery(null);
    setEditorMode(null);
    setNotice(null);
    setError(null);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    const hasHardFilters = searchFilters.sideEffect !== "any"
      || searchFilters.domainScope !== "any"
      || searchFilters.owner.trim() !== ""
      || searchFilters.bindingKind !== "any"
      || searchFilters.runtimeRequirements.trim() !== ""
      || searchFilters.requiredInputs.trim() !== ""
      || searchFilters.requiredOutputs.trim() !== ""
      || searchFilters.includeDeprecated;
    if (!text && !hasHardFilters) {
      setSearchQuery(null);
      return;
    }
    try {
      setError(null);
      setSearchQuery({
        ...(text ? { text } : {}),
        asset_type: assetType,
        ...(searchFilters.sideEffect === "any" ? {} : { side_effect_class: searchFilters.sideEffect }),
        ...(searchFilters.domainScope === "any" ? {} : { domain_scope: searchFilters.domainScope }),
        ...(searchFilters.owner.trim() ? { owner: searchFilters.owner.trim() } : {}),
        ...(searchFilters.bindingKind === "any" ? {} : { binding_kind: searchFilters.bindingKind }),
        ...(searchFilters.runtimeRequirements.trim() ? { runtime_requirements: parseCsv(searchFilters.runtimeRequirements) } : {}),
        ...(searchFilters.requiredInputs.trim() ? { required_inputs: parseRequirements(searchFilters.requiredInputs, "Required inputs") } : {}),
        ...(searchFilters.requiredOutputs.trim() ? { required_outputs: parseRequirements(searchFilters.requiredOutputs, "Required outputs") } : {}),
        ...(searchFilters.includeDeprecated ? { include_deprecated: true } : {}),
        limit: 8,
      });
    } catch (caught) {
      setSearchQuery(null);
      setError(errorMessage(caught));
    }
  }

  function selectSearchAsset(assetId: string, version: number) {
    setStatus("all");
    setSelection({ assetId, version });
  }

  async function openRepositoryReference(reference: string) {
    const path = reference.split("#", 1)[0];
    try {
      await editor.openFile(path);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function openCreateEditor() {
    setEditorMode({ kind: "create" });
    setEditorSource(serializeRegistryContract(createRegistryDraftContract(assetType)));
    setCreatedBy("");
    setValidationHash(null);
    setNotice(null);
    setError(null);
  }

  async function openContractEditor(asset: L1AssetCard) {
    setBusy(true);
    setError(null);
    try {
      const response = await getRegistryAsset(asset.asset_id, asset.version, 2);
      setEditorSource(serializeRegistryContract(contractFromRegistryRecord(response.asset)));
      setEditorMode({
        kind: response.asset.status === "draft" ? "update" : "view",
        assetId: response.asset.asset_id,
        version: response.asset.version,
      });
      setExpectedRevision(response.registry_revision);
      setValidationHash(response.asset.contract_hash);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function validateEditor() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const contract = parseRegistryContractEditor(editorSource);
      const result = await validateRegistryContract(contract);
      setValidationHash(result.contract_hash);
      setNotice("Registry core contract validation을 통과했습니다.");
    } catch (caught) {
      setValidationHash(null);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!editorMode || editorMode.kind === "view") return;
    if (!expectedRevision) {
      setError("현재 Registry revision을 먼저 새로고침하세요.");
      return;
    }
    try {
      const contract = parseRegistryContractEditor(editorSource);
      if (editorMode.kind === "create" && !createdBy.trim()) {
        setError("Draft 생성 주체를 명시해야 합니다.");
        return;
      }
      await runMutation(
        () => editorMode.kind === "create"
          ? createRegistryDraft(contract, createdBy.trim(), expectedRevision)
          : updateRegistryDraft(editorMode.assetId, editorMode.version, contract, expectedRevision),
        editorMode.kind === "create" ? "Draft를 생성했습니다." : "Draft contract를 갱신했습니다.",
      );
      setEditorMode(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function runMutation(operation: () => Promise<RegistryMutationResponse>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await operation();
      setExpectedRevision(result.registry_revision);
      setSelection({ assetId: result.asset.asset_id, version: result.asset.version });
      setNotice(success);
      resetDecisionForm();
      await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey });
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function submitLifecycle(action: "review" | "publish" | "deprecate") {
    const asset = detail.data?.asset;
    if (!asset || !expectedRevision) return;
    if (!decisionId.trim() || !decisionRationale.trim()) {
      setError("Decision ID와 사용자 근거를 모두 입력해야 합니다.");
      return;
    }
    const decision: UserDecision = {
      decision_id: decisionId.trim(),
      selected_by: "user",
      rationale: decisionRationale.trim(),
    };
    if (action === "publish" && !Object.values(publishChecks).every(Boolean)) {
      setError("Owner, Domain, Reuse 확인을 모두 명시적으로 완료해야 Publish할 수 있습니다.");
      return;
    }
    const operation = action === "review"
      ? () => reviewRegistryDraft(asset.asset_id, asset.version, decision, expectedRevision)
      : action === "publish"
        ? () => publishRegistryAsset(asset.asset_id, asset.version, {
            ...decision,
            owner_confirmed: true,
            domain_confirmed: true,
            reuse_confirmed: true,
          } satisfies PublishDecision, expectedRevision)
        : () => deprecateRegistryAsset(asset.asset_id, asset.version, decision, expectedRevision);
    const message = action === "review"
      ? "사용자 Review 결정을 기록했습니다."
      : action === "publish"
        ? "검토된 Asset version을 Publish했습니다."
        : "사용자 결정으로 Asset version을 Deprecated 처리했습니다.";
    await runMutation(operation, message).catch(() => undefined);
  }

  function resetDecisionForm() {
    setDecisionId("");
    setDecisionRationale("");
    setPublishChecks({ owner: false, domain: false, reuse: false });
  }

  async function refreshRegistry() {
    setExpectedRevision(null);
    setError(null);
    setNotice(null);
    await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey });
  }

  const selectedAsset = detail.data?.asset ?? null;

  return (
    <div className="assets-page registry-page">
      <header className="standalone-page-header registry-page-header">
        <div>
          <span>Assets / Canonical Registry</span>
          <h1>Asset Registry</h1>
          <p>Agent, Workflow, Tool의 versioned contract를 검색하고 검토합니다. Draft write와 Publish는 현재 Registry revision과 명시적인 사용자 결정에만 반영됩니다.</p>
        </div>
        <div className="registry-header-actions">
          <span className="registry-revision" title={expectedRevision ?? undefined}>rev {shortRevision(expectedRevision)}</span>
          <button type="button" onClick={() => void refreshRegistry()} disabled={busy}>새로고침</button>
          <button type="button" className="primary-page-action" onClick={openCreateEditor}>New draft</button>
        </div>
      </header>

      <section className="registry-metrics" aria-label="Registry summary">
        <RegistryMetric label="Published assets" value={summary.data ? String(Object.values(summary.data.counts).reduce((sum, count) => sum + count, 0)) : "—"} />
        <RegistryMetric label="Agent" value={metricValue(summary.data?.counts.agent)} category="agent" />
        <RegistryMetric label="Workflow" value={metricValue(summary.data?.counts.workflow)} category="workflow" />
        <RegistryMetric label="Tool" value={metricValue(summary.data?.counts.tool)} category="tool" />
      </section>

      <section className="asset-toolbar registry-toolbar">
        <nav role="tablist" aria-label="Asset type">
          {assetTypes.map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={tab === assetType} onClick={() => changeAssetType(tab)}>
              {titleCase(tab)}<em>{summary.data?.counts[tab] ?? 0}</em>
            </button>
          ))}
        </nav>
        <div className="registry-toolbar-controls">
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.currentTarget.value as RegistryStatus | "all")}>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <form className="registry-search-form" onSubmit={submitSearch}>
            <div className="registry-search-primary">
              <label>
                <span>Search contracts</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="name, id, responsibility, capability" />
              </label>
              <button type="submit">Evidence search</button>
            </div>
            <details className="registry-hard-filters">
              <summary>Hard filters</summary>
              <div>
                <label><span>Side effect</span><select value={searchFilters.sideEffect} onChange={(event) => setSearchFilters({ ...searchFilters, sideEffect: event.currentTarget.value as SearchFilters["sideEffect"] })}>{sideEffectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                <label><span>Domain scope</span><select value={searchFilters.domainScope} onChange={(event) => setSearchFilters({ ...searchFilters, domainScope: event.currentTarget.value as SearchFilters["domainScope"] })}>{domainScopeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                <label><span>Binding</span><select value={searchFilters.bindingKind} onChange={(event) => setSearchFilters({ ...searchFilters, bindingKind: event.currentTarget.value as SearchFilters["bindingKind"] })}>{bindingKindOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                <label><span>Owner</span><input value={searchFilters.owner} onChange={(event) => setSearchFilters({ ...searchFilters, owner: event.currentTarget.value })} placeholder="exact owner" /></label>
                <label><span>Required inputs</span><input value={searchFilters.requiredInputs} onChange={(event) => setSearchFilters({ ...searchFilters, requiredInputs: event.currentTarget.value })} placeholder="name:type, other:type:optional" /></label>
                <label><span>Required outputs</span><input value={searchFilters.requiredOutputs} onChange={(event) => setSearchFilters({ ...searchFilters, requiredOutputs: event.currentTarget.value })} placeholder="name:type" /></label>
                <label><span>Runtime</span><input value={searchFilters.runtimeRequirements} onChange={(event) => setSearchFilters({ ...searchFilters, runtimeRequirements: event.currentTarget.value })} placeholder="comma-separated exact requirements" /></label>
                <label className="registry-filter-check"><input type="checkbox" checked={searchFilters.includeDeprecated} onChange={(event) => setSearchFilters({ ...searchFilters, includeDeprecated: event.currentTarget.checked })} /><span>Deprecated 포함</span></label>
              </div>
            </details>
          </form>
        </div>
      </section>

      {notice ? <p className="registry-notice" role="status">{notice}</p> : null}
      {error ? <p className="registry-notice is-error" role="alert">{error}</p> : null}

      {editorMode ? (
        <RegistryContractEditor
          mode={editorMode}
          source={editorSource}
          createdBy={createdBy}
          validationHash={validationHash}
          busy={busy}
          onSourceChange={(source) => { setEditorSource(source); setValidationHash(null); }}
          onCreatedByChange={setCreatedBy}
          onValidate={() => void validateEditor()}
          onSave={() => void saveEditor()}
          onClose={() => setEditorMode(null)}
        />
      ) : null}

      <div className="registry-workspace">
        <section className="asset-register registry-register">
          <div className="asset-register-head">
            <span>{assetType}</span>
            <strong>{items.length} versions</strong>
            <p>L0 cards · contract 본문은 선택할 때만 조회합니다.</p>
          </div>
          {registry.isLoading ? <p className="table-message">Registry index를 읽는 중…</p> : registry.error ? (
            <p className="table-message is-error">{errorMessage(registry.error)}</p>
          ) : items.length ? (
            <table>
              <thead><tr><th>Asset</th><th>Version</th><th>Side effect</th><th>Capabilities</th><th>Contract</th></tr></thead>
              <tbody>{items.map((asset) => (
                <RegistryAssetRow
                  key={`${asset.asset_id}@${asset.version}`}
                  asset={asset}
                  selected={selection?.assetId === asset.asset_id && selection.version === asset.version}
                  onSelect={() => setSelection({ assetId: asset.asset_id, version: asset.version })}
                />
              ))}</tbody>
            </table>
          ) : <p className="table-message">조건에 맞는 Asset version이 없습니다.</p>}
        </section>

        <aside className="registry-detail" aria-label="Selected asset contract">
          {detail.isLoading ? <p className="table-message">L1 contract를 읽는 중…</p> : detail.error ? (
            <p className="table-message is-error">{errorMessage(detail.error)}</p>
          ) : selectedAsset ? (
            <RegistryAssetDetail
              asset={selectedAsset}
              versions={versions.data?.items ?? []}
              usageCount={usage.data?.usage.usage_count ?? selectedAsset.usage_count}
              compareFrom={compareFrom}
              compareTo={compareTo}
              comparison={comparison.data?.comparison ?? null}
              decisionId={decisionId}
              decisionRationale={decisionRationale}
              publishChecks={publishChecks}
              busy={busy}
              onVersionSelect={(version) => setSelection({ assetId: selectedAsset.asset_id, version })}
              onCompareFrom={setCompareFrom}
              onCompareTo={setCompareTo}
              onOpenContract={() => void openContractEditor(selectedAsset)}
              onDecisionId={setDecisionId}
              onDecisionRationale={setDecisionRationale}
              onPublishChecks={setPublishChecks}
              onLifecycle={(action) => void submitLifecycle(action)}
              onOpenReference={(reference) => void openRepositoryReference(reference)}
            />
          ) : <div className="registry-empty"><strong>Asset을 선택하세요.</strong><p>L1 contract, version history, usage를 필요한 시점에만 불러옵니다.</p></div>}
        </aside>
      </div>

      {searchQuery ? (
        <RegistrySearchEvidence
          query={searchQuery}
          loading={semanticSearch.isLoading}
          error={semanticSearch.error ? errorMessage(semanticSearch.error) : null}
          bundle={semanticSearch.data ?? null}
          onSelect={selectSearchAsset}
        />
      ) : null}
    </div>
  );
}

function RegistryMetric({ label, value, category }: { label: string; value: string; category?: AssetType }) {
  return <div className={`registry-metric${category ? ` is-${category}` : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function RegistryAssetRow({ asset, selected, onSelect }: { asset: L0AssetCard; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={selected ? "is-selected" : undefined}>
      <td><button type="button" className="registry-asset-select" onClick={onSelect}><strong>{asset.name}</strong><code>{asset.asset_id}</code><small>{asset.responsibility}</small></button></td>
      <td><span className={`registry-status is-${asset.status}`}>{asset.status}</span><small>v{asset.version}</small></td>
      <td><code>{asset.side_effect_class}</code></td>
      <td><div className="capability-tags">{asset.capability_tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div></td>
      <td><code title={asset.contract_hash}>{shortRevision(asset.contract_hash)}</code></td>
    </tr>
  );
}

function RegistryAssetDetail(props: {
  asset: L1AssetCard;
  versions: L0AssetCard[];
  usageCount: number;
  compareFrom: number | null;
  compareTo: number | null;
  comparison: { changed_fields: string[]; same_contract: boolean } | null;
  decisionId: string;
  decisionRationale: string;
  publishChecks: { owner: boolean; domain: boolean; reuse: boolean };
  busy: boolean;
  onVersionSelect: (version: number) => void;
  onCompareFrom: (version: number) => void;
  onCompareTo: (version: number) => void;
  onOpenContract: () => void;
  onDecisionId: (value: string) => void;
  onDecisionRationale: (value: string) => void;
  onPublishChecks: (value: { owner: boolean; domain: boolean; reuse: boolean }) => void;
  onLifecycle: (action: "review" | "publish" | "deprecate") => void;
  onOpenReference: (reference: string) => void;
}) {
  const { asset } = props;
  return (
    <>
      <header className="registry-detail-head">
        <div><span className={`asset-type-label is-${asset.asset_type}`}>{asset.asset_type}</span><span className={`registry-status is-${asset.status}`}>{asset.status}</span></div>
        <h2>{asset.name}</h2>
        <code>{asset.asset_id}@{asset.version}</code>
        <p>{asset.responsibility}</p>
        <button type="button" onClick={props.onOpenContract} disabled={props.busy}>{asset.status === "draft" ? "Edit full contract" : "View full contract"}</button>
      </header>

      <dl className="registry-contract-facts">
        <div><dt>Owner</dt><dd>{asset.owner}</dd></div>
        <div><dt>Domain</dt><dd>{asset.domain_scope}</dd></div>
        <div><dt>Reuse</dt><dd>{asset.reuse_status}</dd></div>
        <div><dt>Binding</dt><dd>{bindingLabel(asset)}</dd></div>
        <div><dt>Usage</dt><dd>{props.usageCount} dependents</dd></div>
        <div><dt>Contract</dt><dd title={asset.contract_hash}>{shortRevision(asset.contract_hash)}</dd></div>
      </dl>

      <section className="registry-io-grid">
        <ContractFields title="Inputs" fields={asset.inputs} />
        <ContractFields title="Outputs" fields={asset.outputs} />
      </section>

      <section className="registry-version-panel">
        <div className="registry-section-title"><span>Versions</span><strong>{props.versions.length}</strong></div>
        <div className="registry-version-list">{props.versions.map((version) => (
          <button key={version.version} type="button" className={version.version === asset.version ? "is-current" : undefined} onClick={() => props.onVersionSelect(version.version)}>
            v{version.version}<small>{version.status}</small>
          </button>
        ))}</div>
        {props.versions.length > 1 ? (
          <div className="registry-compare-controls">
            <label><span>From</span><select value={props.compareFrom ?? ""} onChange={(event) => props.onCompareFrom(Number(event.currentTarget.value))}>{props.versions.map((version) => <option key={version.version} value={version.version}>v{version.version}</option>)}</select></label>
            <label><span>To</span><select value={props.compareTo ?? ""} onChange={(event) => props.onCompareTo(Number(event.currentTarget.value))}>{props.versions.map((version) => <option key={version.version} value={version.version}>v{version.version}</option>)}</select></label>
            {props.comparison ? <p>{props.comparison.same_contract ? "Contract content가 같습니다." : `Changed: ${props.comparison.changed_fields.join(", ")}`}</p> : null}
          </div>
        ) : null}
      </section>

      <RegistryDecisionForm {...props} />

      <section className="registry-reference-list">
        <div className="registry-section-title"><span>Source / Handbook</span></div>
        {[...asset.source_refs, ...asset.handbook_refs].length ? <ul>
          {asset.source_refs.map((ref) => <RegistryReference key={`source:${ref}`} kind="Source" reference={ref} onOpen={props.onOpenReference} />)}
          {asset.handbook_refs.map((ref) => <RegistryReference key={`handbook:${ref}`} kind="Handbook" reference={ref} onOpen={props.onOpenReference} />)}
        </ul> : <p>기록된 locator가 없습니다.</p>}
      </section>
    </>
  );
}

function RegistryDecisionForm(props: {
  asset: L1AssetCard;
  decisionId: string;
  decisionRationale: string;
  publishChecks: { owner: boolean; domain: boolean; reuse: boolean };
  busy: boolean;
  onDecisionId: (value: string) => void;
  onDecisionRationale: (value: string) => void;
  onPublishChecks: (value: { owner: boolean; domain: boolean; reuse: boolean }) => void;
  onLifecycle: (action: "review" | "publish" | "deprecate") => void;
}) {
  const action = props.asset.status === "draft" ? "review" : props.asset.status === "reviewed" ? "publish" : props.asset.status === "published" ? "deprecate" : null;
  if (!action) return null;
  return (
    <section className="registry-decision-form">
      <div className="registry-section-title"><span>User decision</span><strong>{action}</strong></div>
      <p>모델 추천만으로 상태를 바꾸지 않습니다. 현재 사용자의 Decision ID와 검토 근거를 기록하세요.</p>
      <label><span>Decision ID</span><input value={props.decisionId} onChange={(event) => props.onDecisionId(event.currentTarget.value)} placeholder={`decision:${action}-asset`} /></label>
      <label><span>Rationale</span><textarea rows={3} value={props.decisionRationale} onChange={(event) => props.onDecisionRationale(event.currentTarget.value)} placeholder="사용자가 확인한 증거와 선택 이유" /></label>
      {action === "publish" ? (
        <div className="registry-publish-checks">
          <label><input type="checkbox" checked={props.publishChecks.owner} onChange={(event) => props.onPublishChecks({ ...props.publishChecks, owner: event.currentTarget.checked })} /> Owner 확인</label>
          <label><input type="checkbox" checked={props.publishChecks.domain} onChange={(event) => props.onPublishChecks({ ...props.publishChecks, domain: event.currentTarget.checked })} /> Domain 확인</label>
          <label><input type="checkbox" checked={props.publishChecks.reuse} onChange={(event) => props.onPublishChecks({ ...props.publishChecks, reuse: event.currentTarget.checked })} /> Reuse 확인</label>
        </div>
      ) : null}
      <button type="button" className={action === "deprecate" ? "is-danger" : "primary-page-action"} disabled={props.busy} onClick={() => props.onLifecycle(action)}>{actionLabel(action)}</button>
    </section>
  );
}

function RegistryContractEditor(props: {
  mode: EditorMode;
  source: string;
  createdBy: string;
  validationHash: string | null;
  busy: boolean;
  onSourceChange: (value: string) => void;
  onCreatedByChange: (value: string) => void;
  onValidate: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const writable = props.mode.kind !== "view";
  return (
    <section className="registry-contract-editor">
      <header>
        <div><span>{props.mode.kind === "create" ? "New version" : props.mode.kind === "update" ? "Draft contract" : "Immutable version"}</span><h2>{props.mode.kind === "create" ? "Create Registry draft" : `${props.mode.assetId}@${props.mode.version}`}</h2></div>
        <button type="button" onClick={props.onClose}>닫기</button>
      </header>
      {props.mode.kind === "create" ? <label className="registry-created-by"><span>Created by</span><input value={props.createdBy} onChange={(event) => props.onCreatedByChange(event.currentTarget.value)} placeholder="명시적인 사용자 또는 session ID" /></label> : null}
      <label className="registry-json-editor"><span>AssetContractInput JSON</span><textarea spellCheck={false} readOnly={!writable} value={props.source} onChange={(event) => props.onSourceChange(event.currentTarget.value)} /></label>
      <footer>
        {props.validationHash ? <code title={props.validationHash}>validated {shortRevision(props.validationHash)}</code> : <span>아직 Registry core validation을 실행하지 않았습니다.</span>}
        <div><button type="button" onClick={props.onValidate} disabled={props.busy}>Validate</button>{writable ? <button type="button" className="primary-page-action" onClick={props.onSave} disabled={props.busy}>{props.mode.kind === "create" ? "Create draft" : "Update draft"}</button> : null}</div>
      </footer>
    </section>
  );
}

function RegistrySearchEvidence(props: {
  query: AssetSearchQuery;
  loading: boolean;
  error: string | null;
  bundle: ReturnType<typeof useAssetRegistrySearch>["data"] | null;
  onSelect: (assetId: string, version: number) => void;
}) {
  return (
    <section className="registry-search-evidence">
      <div className="section-title-line compact"><div><span>Deterministic search</span><h2>Compatibility evidence</h2></div><strong>{props.bundle ? `${props.bundle.results.length}/${props.bundle.candidates_considered_count}` : "—"}</strong></div>
      <p className="registry-search-query"><code>{JSON.stringify(props.query)}</code></p>
      {props.loading ? <p className="table-message">Registry search evidence를 계산하는 중…</p> : props.error ? <p className="table-message is-error">{props.error}</p> : props.bundle ? (
        <ol>{props.bundle.candidates_considered.map((candidate) => (
          <li key={`${candidate.asset_id}@${candidate.version}`} className={candidate.accepted ? "is-accepted" : "is-rejected"}>
            <button type="button" onClick={() => props.onSelect(candidate.asset_id, candidate.version)}><code>{candidate.asset_id}@{candidate.version}</code><strong>{candidate.match_grade}</strong></button>
            <span>{candidate.accepted ? candidate.compatibility_facts.map((fact) => fact.detail).join(" · ") || "lexical match" : candidate.rejection_reasons.join(" · ")}</span>
          </li>
        ))}</ol>
      ) : null}
    </section>
  );
}

function ContractFields({ title, fields }: { title: string; fields: Array<{ name: string; type: string; required: boolean }> }) {
  return <section><div className="registry-section-title"><span>{title}</span><strong>{fields.length}</strong></div>{fields.length ? <ul>{fields.map((field) => <li key={`${field.name}:${field.type}`}><code>{field.name}</code><span>{field.type}{field.required ? " · required" : ""}</span></li>)}</ul> : <p>선언된 field가 없습니다.</p>}</section>;
}

function RegistryReference({ kind, reference, onOpen }: { kind: "Source" | "Handbook"; reference: string; onOpen: (reference: string) => void }) {
  if (/^https?:\/\//i.test(reference)) {
    return <li><span>{kind}</span><a href={reference} target="_blank" rel="noreferrer"><code>{reference}</code><em>Open ↗</em></a></li>;
  }
  return <li><span>{kind}</span><button type="button" onClick={() => onOpen(reference)}><code>{reference}</code><em>VS Code ↗</em></button></li>;
}

function bindingLabel(asset: L1AssetCard): string {
  if (asset.binding?.kind === "mcp") return `MCP · ${asset.binding.tool_name} · ${asset.connection?.transport ?? "—"}`;
  if (asset.binding?.kind === "a2a") return `A2A · ${asset.binding.contract_ref}`;
  if (asset.binding) return `${asset.binding.kind} · ${asset.connection?.transport ?? "—"}`;
  if (asset.workflow_profile) return `${asset.workflow_profile.representation} · ${asset.workflow_profile.coordination}`;
  return "none";
}

function actionLabel(action: "review" | "publish" | "deprecate"): string {
  if (action === "review") return "Mark reviewed";
  if (action === "publish") return "Publish immutable version";
  return "Deprecate version";
}

function errorMessage(error: unknown): string {
  if (error instanceof RegistryApiError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function metricValue(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

function shortRevision(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "unavailable";
}

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

function parseCsv(value: string): string[] {
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (new Set(entries).size !== entries.length) throw new Error("Hard filter 값은 중복 없이 입력하세요.");
  return entries;
}

function parseRequirements(value: string, label: string): Array<{ name: string; type: string; required: boolean }> {
  return parseCsv(value).map((entry) => {
    const parts = entry.split(":").map((part) => part.trim());
    if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
      throw new Error(`${label}는 name:type[:required|optional] 형식이어야 합니다.`);
    }
    if (parts[2] && !["required", "optional"].includes(parts[2])) {
      throw new Error(`${label}의 세 번째 값은 required 또는 optional이어야 합니다.`);
    }
    return { name: parts[0], type: parts[1], required: parts[2] !== "optional" };
  });
}
