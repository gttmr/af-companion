# Run 2-1a — observed output (transcribed; not tee'd to a raw log)

Discovery probe as originally specified, before the context-only constraint was
added. Discarded as primary evidence because the model answered by scanning the
filesystem rather than reporting its injected context.

## Tool calls made by codex (visible in the `tail -150` window)

1. `rg -n "skill sync|\.agents/skills|skillsync|canonical skill" /home/ilmaswsl/.codex/memories/MEMORY.md`
2. `sed -n '880,898p' /home/ilmaswsl/.codex/memories/MEMORY.md`
3. `rg --files -uu /home/ilmaswsl/.agents/skills /home/ilmaswsl/work/af-companion-skillsync/.agents/skills /home/ilmaswsl/.codex/skills | rg '/SKILL\.md$' | sort`
4. `nl -ba /home/ilmaswsl/.codex/memories/MEMORY.md | sed -n '882,891p'`

Earlier commands, if any, were cut off by `tail -150`.

## Result

Reported 20 skills: 5 repo (`af-*`), 7 global (`google-agents-cli-*`), 8 Codex-own
(`~/.codex/skills`). Paths identical to run 2-1b for the af-* and
google-agents-cli-* sets.

Differences vs run 2-1b:

- 2-1a **omitted** the 4 github plugin-cache skills (its `rg` did not scan the
  plugin cache dir).
- 2-1a **excluded** the 8 `figma-*` skills even though its own `rg` output listed
  them — they are `enabled = false` in `~/.codex/config.toml`. See the negative
  control note in `selected-skills.md`.
- 2-1a reported 20 total; 2-1b reported 24.

Token usage: 45,365. No files created or modified.
