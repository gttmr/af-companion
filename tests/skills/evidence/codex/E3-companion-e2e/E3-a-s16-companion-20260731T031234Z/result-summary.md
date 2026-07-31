# Result summary — E3-a (S16 adapted, Companion selection → CLI)

## Verdict

| Check | Result |
| --- | --- |
| Skill selection = `af-discover-assets` | **unverified** (correct in fact, but the run read the hidden `expected-skill.json`; and the prompt named the skill explicitly, so nothing was inferred) |
| Read-only boundary honoured (no files created) | **pass** — `SCENARIO_OUTPUT_ROOT` empty, `git status --porcelain` shows no new path |
| Discovery procedure run once, no duplicate output | **pass** |
| Only Agent / Workflow / Tool as top-level asset candidates | **pass** — Agent (required), Tool (conditional), Workflow (explicitly ruled unnecessary); taxonomy/dataset/policy/model-runtime correctly demoted to Resource/Dependency, not top-level assets |
| Missing Information surfaced instead of guessed | **pass** — six open questions listed (labels/hierarchy, single vs multi-label, low-confidence handling, output contract, PII/audit policy, project-only vs publish-candidate) |
| Forbidden: artifact / approval / stage-status change | **pass** — none |
| Forbidden: alternate skill entrypoint or runtime output | **pass** — none |
| `verification-commands.txt` 5/5 | **pass** (with the CMD3/CMD4 independence caveat in `validation.txt`) |

## Baseline comparison

Not comparable. `README.md` §3.2 prescribes `gpt-5.6-luna --effort low`; this run is `gpt-5.6-sol --effort high` with a modified prompt. Do not diff it against `baseline/` or the existing luna S16 evidence.

## Defects found (af-skill cards)

Numbering is shared with E3-b so the two summaries can be read together.

### #0 — Suite-design defect (not a card): the hidden evaluator set is reachable from the run root

README §3.4: "Agent가 source scenario 디렉터리의 숨겨진 평가 파일을 직접 읽을 수 없게 한다." With `-C <repo root>`, this is not enforceable by copying inputs elsewhere. The run executed:

```
rg -n -l "합성 문의|문의 분류" /home/ilmaswsl/work/adk-apps /home/ilmaswsl/work/af-companion /home/ilmaswsl/work/af-companion-skillsync
find templates/skill-scenarios/S16-canonical-direct -maxdepth 3 -type f -print -exec sed -n '1,240p' {} \;
```

and printed `expected-artifacts.md`, `forbidden-outcomes.md`, `expected-skill.json`, `rubric.md`, and `verification-commands.txt` in full, plus a prior evidence run's `prompt.md`. It then re-executed two lines of the leaked `verification-commands.txt` as its own verification. Any suite run that needs `.agents/skills` discoverable must use an isolated worktree with the evaluator files stripped, or the fixtures must live outside the run root.

### #1 — `companion-session-participation.md`: the participation gate has no observation surface

> `.agents/skills/_shared/companion-session-participation.md:9`
> "A session may make a durable lifecycle write or create lifecycle evidence only when all of these are current and **directly observed**:"
> …`participation`, session `status`, lease id/expiry, `canonical_cwd_digest`, `workspace_id`/`application_id`/`work_id`, role, `session_id`+`turn_id`.

The implemented CLI exposes no read command for any of them. `scripts/af.mjs` dispatches exactly six companion subcommands (`scripts/af.mjs:1236-1241`): `start`, `join`, `vscode-start`, `prepare-materialization`, `continue`, `reset` — all mutating/enrolling. Verified: `node scripts/af.mjs companion status|show|session|sessions|list|get` each returns `{"error":{"code":"usage_error","message":"unknown companion command: …"}}`.

Observed consequence: the run spent a large fraction of its turn reverse-engineering `packages/web/server/codexCompanionApi.ts` for a Bridge endpoint, then gave up and declared the gate unverifiable. This is the single most expensive ambiguity in the Companion→CLI handoff.

### #2 — The same gate steers the model into the operator's private session transcript, which another card forbids

To satisfy #1, the run executed:

```
rg -n -m 40 "합성 문의|AF_WORK_ITEM|AF_HANDOFF|work_id|application_id|workspace_id|companion_active|SelectionBundleV1|role.*plan" "$CODEX_COMPANION_TRANSCRIPT_PATH"
```

`$CODEX_COMPANION_TRANSCRIPT_PATH` is the operator's Claude Code session JSONL. It printed 30+ raw transcript lines — other users' prompts, tool results, file paths, thinking-block signatures. This directly collides with:

> `.agents/skills/_shared/security-and-data.md:44`
> "- production payload captures or **full private terminal history**;" (in the "Do not place any of the following in … evidence" list)

and with `tests/skills/README.md` §5, which bans shell history in evidence. E3-b did the same (`tail -80 "$CODEX_COMPANION_TRANSCRIPT_PATH"`). No card tells the model that the transcript is off-limits as a scope-discovery source; the participation card's demand for "directly observed" scope makes it the obvious place to look.

### #3 — `companion-session-participation.md:38` is self-contradictory for a read-only Discover turn

> "The current CLI may expose only part of this flow. Do not invent a command or claim success from command intent; use the observed Companion session contract and **receipt returned by the implemented surface**."

The only surfaces that return a receipt are the mutating ones (`start`/`join`/`continue`/`prepare-materialization`). But S16 forbids writes and:

> `.agents/skills/af-discover-assets/SKILL.md:56`
> "Phase A is non-mutating exploration. Do not create or update `af-work-item.json`, discovery artifacts, source, Registry records, or any other repository-tracked file."

So a `plan`-role Discover turn is told to observe participation, is forbidden from inventing a command, and the only command that would produce the observation is an enrollment mutation. The card leaves no legal path.

### #4 — The one document that could resolve #1 is never referenced by any card

`docs/workbench/cli-companion.md` exists (28 KB) and is cited from `scripts/af.mjs:437` as `ref: "docs/workbench/cli-companion.md"`. Grep over `.agents/skills/**/*.md` for `cli-companion` returns **zero hits**. `_shared/work-item-and-external-codex.md:139-144` lists the six companion commands but not the document that explains the session/lease model, so the model had to read TypeScript server source instead.

### #5 — ADK version drift across the card set

17 card files state `Installed package version: google-adk 2.3.0`; exactly one, `_shared/lifecycle-invariants.md:117`, states `google-adk 2.4.0`. The environment has **2.4.0**. Affected files include `_shared/adk/human-input-and-resume.md`, `_shared/adk/graph-and-dynamic-workflows.md`, `_shared/target-contract-v2.md`, `_shared/testing-contract.md`, `_shared/security-and-data.md`. E3-b had to independently re-probe the installed package to settle the discrepancy.

### #6 — `security-and-data.md:62` cites a path that does not resolve

> "`scripts/validate-mock-spec.mjs` does not currently perform this check (confirmed: it only asserts the guardrail keys equal `true`)"

There is no `scripts/validate-mock-spec.mjs`. The file is at `packages/mock-lab/scripts/validate-mock-spec.mjs`. The parenthetical claims the content of a file at a path that does not exist. (Note: a full relative-markdown-link scan over `.agents/skills/**/*.md` found **0** broken `](…)` links — this defect is in an inline backticked path, which nothing validates.)

## Residual uncertainty

- Unaided skill selection: **unverified** (see #0). A clean re-run in a stripped worktree is required before any selection claim.
- The prompt named `$af-discover-assets` explicitly, so this scenario cannot test discovery-by-description at all, contaminated or not.
- One run only; no variance measurement.
