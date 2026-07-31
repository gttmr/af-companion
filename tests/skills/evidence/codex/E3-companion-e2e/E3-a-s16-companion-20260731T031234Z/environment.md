# Environment — E3-a (S16 adapted, Companion selection handoff)

- Date: 2026-07-31 (run 12:09:55 → 12:13:34 KST / UTC+09:00)
- Tool: Codex CLI `codex-cli 0.146.0`, `codex exec -s workspace-write`
- Model: `gpt-5.6-sol`, `model_reasoning_effort=high`
- cwd (`-C`): `/home/ilmaswsl/work/af-companion-skillsync`
- Commit: `79a637c5c4be1c761e2f7cc0cd81ec785c332264` (worktree with 17 legitimately modified skill files from an in-progress merge)
- `SCENARIO_OUTPUT_ROOT`: `/tmp/claude-1000/-home-ilmaswsl-work-adk-apps/be23ad91-f1a7-4e71-a593-54ed74ca24cf/scratchpad/E3/E3-a/out`
- Operating mode: single non-interactive `codex exec`, stdin `< /dev/null`, foreground, one run
- Installed packages relevant to grading: `google-adk 2.4.0` (`/home/ilmaswsl/work/adk-apps/.venv`), agents-cli skills `1.2.1`

## Deviation from the prescribed suite protocol — READ BEFORE COMPARING

1. **Model/effort deviate.** `tests/skills/README.md` §3.2 prescribes `gpt-5.6-luna --effort low` for Codex forward tests. This run used `gpt-5.6-sol` at `high` effort. **This evidence must NOT be compared directly against existing luna baseline/evidence directories.** It is an E3 experiment on Companion→CLI handoff, not a protocol-conformant scenario run.
2. **Prompt deviates.** S16's `prompt.md` is used verbatim but with a prepended Korean Companion-selection framing sentence. S16's own `파일은 만들지 말고 설명만 해줘` constraint was kept intact.
3. **Fixture isolation FAILED (see `result-summary.md` defect #0).** README §3.4 requires the hidden evaluator files to be unreachable. Scenario inputs were copied to an out-of-repo temp dir, but `-C` was the repository root, and the run independently located and printed the entire `templates/skill-scenarios/S16-canonical-direct/` directory, including `expected-skill.json`, `rubric.md`, `forbidden-outcomes.md`, `expected-artifacts.md`, and `verification-commands.txt`. E3-a's skill-selection and self-verification results are therefore **contaminated** and are recorded as `unverified`, not `pass`.
4. Version-relevant note: 18 skill cards record `Installed package version: google-adk 2.3.0`; only `_shared/lifecycle-invariants.md:117` records `2.4.0`. The environment has 2.4.0.
