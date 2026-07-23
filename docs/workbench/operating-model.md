# Agent Factory Operating Model

Agent Factory work executes in an external Codex CLI or VS Code session. The web product is a live companion: it projects repository state and provides a shared Graph IR editor, but it does not run lifecycle stages.

## 1. Canonical lifecycle

```text
raw requirement
  -> af-discover-assets
  -> explicit discovery review
  -> af-compose-solution
  -> explicit composition review
  -> af-scaffold-runtime
  -> af-verify-runtime
```

`af-workflow` inspects state and routes to the earliest missing or stale step. It does not write artifacts.

| Work Skill | Responsibility | Required predecessor | Durable output |
| --- | --- | --- | --- |
| `af-discover-assets` | evidence, normalized requirement, Agent·Workflow·Tool candidates, dependencies, risks, Missing Information | explicit requirement and Work Item | analysis aggregate/splits, summary, Work Item evidence |
| `af-compose-solution` | standalone/Workflow decision, Graph IR, bindings, invocation control, runtime/A2A contracts, scaffold readiness | approved discovery | coherent Graph/contracts, boundary design, scaffold plan |
| `af-scaffold-runtime` | approved composition to ADK source or Runtime Handoff | approved composition | source output roots and implementation handoff |
| `af-verify-runtime` | current artifact/code/runtime/behavior proof | complete scaffold for runtime claims | validation report, outcome, optional Catalog delta |

Raw requirement to code is forbidden. A Work Skill may stop at `waiting_for_input`, `waiting_for_review`, `blocked`, or `failed`; completion is not inferred from file presence.

## 2. Work Item ledger

Every lifecycle has one explicit root:

```text
artifacts/af/<work-id>/
```

`af-work-item.json` is the lifecycle source of truth. It stores:

- exactly four Work Skill states;
- `active_skill`;
- input/output revisions and output refs/roots;
- blocker refs and timestamps;
- discovery and composition review gates;
- verification outcome, revision, and report ref.

Allowed skill statuses are `not_started`, `active`, `waiting_for_input`, `waiting_for_review`, `complete`, `blocked`, and `failed`.

Lifecycle order is strict:

- Compose cannot start before approved, complete Discover.
- Scaffold cannot start before approved, complete Compose.
- Verify cannot start before complete Scaffold.
- Verify may be complete only when verification outcome is `passed`.

No reader backfills missing fields or accepts a previous lifecycle manifest.

## 3. Review decisions

Review is a human decision, not validator output or skill self-approval.

There are two gates:

- `review_gates.discovery` protects Compose;
- `review_gates.composition` protects Scaffold.

A decision must record `approved` or `changes_requested`, the SHA-256 of the reviewed canonical `analysis-result.json` bytes, decision time, and the external Codex session/turn in which the user made the decision. If provenance is unavailable, the gate remains pending.

Changing relevant canonical bytes makes previous review stale. Discovery changes invalidate both gates and downstream work. Composition/Graph changes invalidate composition approval, Scaffold, Verify, and verification outcome.

The web app displays gates but never approves them.

## 4. Write ownership

| Content | Writer |
| --- | --- |
| requirements, candidates, contracts, summaries, source, handoff, reports | matching external-Codex Work Skill |
| Work Item skill status/evidence | executing external Codex session |
| review gate decision | external Codex session after explicit user/reviewer decision |
| Graph IR | Compose skill or web Graph editor |
| Catalog seeds | separate reviewed repository change |
| activity/Git/file projection | workbench metadata projection |

The app does not expose arbitrary artifact PUT, source edit, stage/commit, runtime execution, or Catalog publication.

## 5. Graph collaboration

Graph IR is the only shared browser edit surface. `PUT /api/work-items/:workId/graph` requires:

- loopback and same-origin request;
- current `If-Match` for `analysis-result.json`;
- approved discovery;
- strict Target v2 Graph validation;
- one explicitly selected active Codex session.

The server updates `analysis-result.json.graph` and `graph-ir.json`, resets stale composition/downstream state in `af-work-item.json`, and queues a `graph_change` context delivery for the exact session. A queue failure returns accepted-with-warning because canonical Graph save already occurred; the UI must surface that distinction.

The external session re-reads canonical files before continuing. It must not overwrite a browser change from an older in-memory Graph.

## 6. Artifact contract

`analysis-result.json` uses strict `contract_version: "2.0"` and owns `normalizedRequirement`, `evidence`, `assetCandidates`, `a2aContracts`, `runtimeContracts`, and `graph`.

Canonical split/output names are:

- `normalized-requirement.json`
- `asset-candidates.json`
- `graph-ir.json`
- `analysis-summary.md`
- `boundary-design.md`
- `scaffold-plan.json`
- `runtime-stub/`
- `implementation-handoff.md`
- `validation-report.md`
- `catalog-delta.yaml`, only when verified reuse feedback exists

Agent, Workflow, and Tool are the only top-level asset types. A2A is an Agent binding/exposure. Tool Invocation Control is Workflow or Agent. Full meanings live in [Taxonomy](taxonomy.md) and [Graph IR](graph-ir.md).

## 7. Scaffold and Runtime Handoff

Scaffold consumes current approved artifacts, a reviewed scaffold plan with `raw_requirement_to_code=false`, explicit output mode, and explicit source roots.

- `smoke` creates importable review structure and explicit TODO seams.
- `runnable` adds reviewed synthetic/local behavior for agreed scenarios.

Neither mode implies production integration or deployment. Source writes remain within approved roots; private endpoints, credentials, real customer data, deploy scripts, and organization-specific production logic are forbidden.

Scaffold는 Work Item에 사용자가 확정한 Solution Control Strategy와 Root Executable을 보존한다. 설치된 `google-adk 2.3.0` 계약에 맞춰 Workflow Root는 `google.adk.workflow.Workflow`, Agent Root는 선택된 `BaseAgent` object로 생성하고, ADK가 요구하는 `root_agent` symbol은 그 exact object를 가리킨다. 생성 manifest에는 asset ref/version, decision ID, strategy와 generated symbol을 함께 기록한다. Strategy, Graph owner/profile, Root Type이 충돌하면 Compose로 되돌아가야 하며 Scaffold가 자동으로 Root나 전략을 바꾸지 않는다.

## 8. Verification

Verification maps each claim to fresh evidence:

1. Skill structure.
2. Artifact contract.
3. Code correctness.
4. Runtime integration.
5. Behavior evaluation.

Commands are chosen by claim, not a web-server allow-list. The report preserves revision, environment, exact command/cwd, input scenario, exit code, concise observed output, failure/skip cause, and residual uncertainty.

Outcomes are:

- `passed`: every required claim has fresh sufficient evidence;
- `failed`: a required claim is disproved;
- `unverified`: required evidence could not be obtained.

Catalog feedback may be written to `catalog-delta.yaml`, but Work Skills never edit `catalog/*.yaml`. The web Assets screen is read-only.

## 9. Live companion APIs

Only four API families are current:

| Prefix | Purpose | Mutation |
| --- | --- | --- |
| `/api/workspace` | identity, live snapshot, Git changes/diff, SSE, VS Code open | contained editor open only |
| `/api/work-items` | Work Item/artifact projection | Graph GET/PUT only |
| `/api/codex-companion` | observed sessions and exact next-prompt queue | interaction state only |
| `/api/catalog` | Catalog projection | none |

The app routes are `/`, `/work/:workId/discover`, `/compose`, `/scaffold`, `/verify`, `/connections`, and `/assets`.

## 10. Documentation impact

Any change to lifecycle state, review provenance, artifact/interface shape, API mutation, or visible screen contract updates this document, the Handbook, relevant schema/validator docs, and `docs/decision-log.md` in the same change set. Source remains final authority.
