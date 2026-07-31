# E2 (skill collision) — Environment

- Date: 2026-07-31
- Run id: `2026-07-31-e2-run1`
- Agent CLI: Codex CLI
- `codex --version`: `codex-cli 0.146.0`
- Model: `gpt-5.6-sol`
- Reasoning effort: `high` (via `-c model_reasoning_effort=high`; the global
  `~/.codex/config.toml` default is `low`, so this was an explicit per-run override)
- Sandbox: `-s workspace-write` (run banner reported
  `sandbox: workspace-write [workdir, /tmp, $TMPDIR]`, `approval: never`)
- Run root (`-C`): `/home/ilmaswsl/work/af-companion-skillsync`

## Run root is a git WORKTREE, not the main checkout

`/home/ilmaswsl/work/af-companion-skillsync/.git` is a file, not a directory:

```
gitdir: /home/ilmaswsl/work/af-companion/.git/worktrees/af-companion-skillsync
```

The main checkout is `/home/ilmaswsl/work/af-companion`. `~/.codex/config.toml`
marks `/home/ilmaswsl/work/af-companion` (and `/home/ilmaswsl/work`, and
`/home/ilmaswsl`) as `trust_level = "trusted"`; there is **no** entry for the
worktree path `/home/ilmaswsl/work/af-companion-skillsync` itself. Codex did not
complain about git repo detection and `--skip-git-repo-check` was not needed.

## Skill sets present on disk

Global (`~/.agents/skills`) — Google agents-cli skills, 7 skills:

- google-agents-cli-adk-code
- google-agents-cli-deploy
- google-agents-cli-eval
- google-agents-cli-observability
- google-agents-cli-publish
- google-agents-cli-scaffold
- google-agents-cli-workflow

Version claimed as agents-cli skills 1.2.1 — **unverified** in this run (no
version file was read; not directly observed).

Repo-local (`/home/ilmaswsl/work/af-companion-skillsync/.agents/skills`) — 5 skills
plus a `_shared/` reference tree and an `AGENTS.md`:

- af-workflow
- af-discover-assets
- af-compose-solution
- af-scaffold-runtime
- af-verify-runtime

Also present but out of scope for this experiment: `~/.codex/skills` (Codex's own
skill dir, incl. `.system/`) and plugin-cache skills under
`~/.codex/plugins/cache/openai-curated-remote/github/...`.

## Notes

- Session-level Codex hooks from `/home/ilmaswsl/work/af-companion/.codex/hooks.json`
  fired during both runs (`SessionStart`, `UserPromptSubmit`, `Stop`,
  and for run 2-2 `PreToolUse`/`PostToolUse`). These are pre-existing config and
  were not changed for this experiment.
- Codex also injects `~/.codex/memories/MEMORY.md`; the model consulted it in the
  discarded run 2-1a and in run 2-2. This is a confounder to keep in mind for any
  claim about where the model "learned" a fact, but it does not affect the
  skill-injection finding (see `selected-skills.md`).
