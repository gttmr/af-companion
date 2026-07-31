# Environment — E3-b (S11 adapted, Companion selection handoff)

- Date: 2026-07-31 (run 12:13:50 → 12:29:17 KST / UTC+09:00, ~15m27s)
- Tool: Codex CLI `codex-cli 0.146.0`, `codex exec -s workspace-write`
- Model: `gpt-5.6-sol`, `model_reasoning_effort=high`
- cwd (`-C`): `/home/ilmaswsl/work/af-companion-skillsync`
- Commit: `79a637c5c4be1c761e2f7cc0cd81ec785c332264` (worktree with 17 legitimately modified skill files from an in-progress merge)
- `SCENARIO_OUTPUT_ROOT`: `/tmp/claude-1000/-home-ilmaswsl-work-adk-apps/be23ad91-f1a7-4e71-a593-54ed74ca24cf/scratchpad/E3/E3-b/out`
- Operating mode: single non-interactive `codex exec`, stdin `< /dev/null`, one run. It exceeded the 600 s foreground budget and was allowed to finish detached; exit code 0. Not retried.
- Installed packages relevant to grading: `google-adk 2.4.0`, Python 3.13.12 (`/home/ilmaswsl/work/adk-apps/.venv`); agents-cli skills `1.2.1`
- Token usage reported by the run: 504,572

## Deviation from the prescribed suite protocol — READ BEFORE COMPARING

1. **Model/effort deviate.** `tests/skills/README.md` §3.2 prescribes `gpt-5.6-luna --effort low`. This run used `gpt-5.6-sol` at `high`. **Do NOT compare this evidence directly against existing luna evidence or `baseline/`.**
2. **Prompt deviates.** S11's `prompt.md` verbatim plus a prepended Korean Companion-selection framing sentence, plus two operator lines giving the out-of-repo context path and the resolved `${SCENARIO_OUTPUT_ROOT}` (README §3.7 requires resolving the token to a real absolute path without editing the source fixture).
3. **Interpreter substitution for grading.** `verification-commands.txt` hard-codes `.agent-factory/runtime/.venv/bin/python`, which **does not exist in this worktree** (`test -x` → exit 1). Commands 8, 9 and 11 were first run as written (recorded as failures) and then re-run with `/home/ilmaswsl/work/adk-apps/.venv/bin/python` (google-adk 2.4.0), via `AF_TEST_PYTHON` for command 11. Both results are recorded in `validation.txt`.
4. **Real-socket smoke is `unverified`.** The run could not bind a TCP listener inside the Codex sandbox, so a real out-of-process HTTP server + SQLite process-restart smoke was never executed. The in-process ASGI `/run` path and Runner reconstruction were executed and passed.
5. Fixture-isolation caveat from E3-a applies to the run root generally; in this run the evaluator files for S11 were **not** opened (grep of the transcript for `templates/skill-scenarios` matches only transcript-echo lines, not a read of S11's hidden files). The run did, however, `tail -80` the operator's private Claude Code transcript — see `result-summary.md` defect #2.
