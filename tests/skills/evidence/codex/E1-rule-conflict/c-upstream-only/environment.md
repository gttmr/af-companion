# Environment

- date: 2026-07-31
- experiment: E1 (rule conflict adjudication), condition `c-upstream-only`
- tool: codex-cli 0.146.0 (`codex --version`)
- model: gpt-5.6-sol
- effort: `model_reasoning_effort=high` (`-c` override, no fallback)
- sandbox: `-s workspace-write`, `--skip-git-repo-check`
- target library: google-adk 2.4.0 (ground truth read from `/home/ilmaswsl/.cache/uv/archive-v0/PHhgWul_Cu4fzzXPz937I/google_adk-2.4.0.dist-info`)
- upstream skills under test: google agents-cli skills 1.2.1 (`/home/ilmaswsl/.agents/skills/google-agents-cli-adk-code/`)
- af skills under test: `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/_shared/adk/`
- cwd for the run: `/tmp/claude-1000/-home-ilmaswsl-work-adk-apps/be23ad91-f1a7-4e71-a593-54ed74ca24cf/scratchpad/E1/c-upstream-only` (fresh empty dir, one per condition)
- commit: unverified (run dirs are scratchpad, not a git repo; `--skip-git-repo-check` used)
- operating mode: non-interactive `codex exec`, stdin closed via `< /dev/null`, sequential (one condition per Bash call, 600s timeout)
