# E2 (skill collision) — Result summary

Run id `2026-07-31-e2-run1` · Codex CLI 0.146.0 · gpt-5.6-sol · effort high ·
run root `/home/ilmaswsl/work/af-companion-skillsync` (git worktree).

## Q1 — Does Codex auto-discover `.agents/skills` in a git repo root?

**Yes.** Confirmed, and confirmed for a git *worktree* whose path is not itself
listed as trusted in `~/.codex/config.toml`.

The decisive run is 2-1b, which forbade filesystem search. Codex executed **zero**
shell commands and the model still produced all five repo-local skills with correct
absolute paths:

```
/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-workflow/SKILL.md
/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-discover-assets/SKILL.md
/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-compose-solution/SKILL.md
/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-scaffold-runtime/SKILL.md
/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-verify-runtime/SKILL.md
```

That information is not in the injected `AGENTS.md` (which names none of the four
Work Skills and gives no paths), so it came from Codex's own skill discovery.

**No fallback to explicit path loading is needed.**

Both sets are visible **simultaneously** — 24 skills total in context: 5 repo af-*,
7 global `~/.agents/skills/google-agents-cli-*`, 8 `~/.codex/skills`, 4 github
plugin-cache. There is no shadowing or replacement; global is not hidden by repo.

## Q2 — Which set does the model actually load and follow?

It **read both** and **followed the repo-local af-\* set**.

Reads in run 2-2 (40 read-only commands): all 5 `af-*/SKILL.md`, 2
`af-scaffold-runtime/references/*`, 8 distinct `_shared/*.md`; plus
`google-agents-cli-workflow/SKILL.md` (read in full, three sed calls) and
`google-agents-cli-scaffold/SKILL.md`. The other five google-agents-cli skills
were never opened.

Verdict delivered: do **not** start with `agents-cli scaffold create`; follow
`Discover → Compose → Scaffold → Verify` with the repo's approval gates and
`node scripts/generate-adk-source.mjs <artifact-root> <output-root>` as the
canonical generator. Google skills were demoted to "supporting reference".

**Critical caveat.** The precedence was decided by *content*, not by any Codex-level
scope ranking. The model cited
`.agents/skills/_shared/source-of-truth.md:14`, which explicitly declares the
Google Agents CLI skills to be "examples of structure and workflow, not Agent
Factory authority". The repo won because the repo says it wins. Whether Codex
itself would rank repo above global absent that sentence is **untested**.

Practical implication: that authority sentence is load-bearing infrastructure, not
documentation prose. Removing or weakening it during the in-progress merge would
remove the only observed mechanism resolving this collision.

## Q3 — Does the model notice the contradiction?

**Yes, in detail, with file:line citations on both sides.** It reported five
conflicts (these are the model's claims; not independently checked here — see
`validation.txt`):

1. **Plan Mode precondition.** `docs/workbench/operating-model.md:35` requires
   "actual Codex Plan mode" for Phase A, while the currently-modified
   `_shared/lifecycle-invariants.md:118` and
   `_shared/work-item-and-external-codex.md:177` say the precondition was removed,
   and `af-workflow/SKILL.md:50` requires only Companion `role: plan`.
   *(This one is internal to the repo and exposed by the in-progress merge, not a
   global/repo collision.)*
2. **Phase A file-writing rule.** `google-agents-cli-workflow/SKILL.md:95` says
   write `.agents-cli-spec.md` and get approval; `af-discover-assets/SKILL.md:56`
   says Phase A must create no tracked files at all. Direct contradiction.
3. **Scaffold command.** `google-agents-cli-workflow/SKILL.md:109` says
   `agents-cli scaffold create <name>`; the repo's canonical generator is
   `node scripts/generate-adk-source.mjs`. Direct contradiction.
4. **Internal inconsistency inside the Google skill itself.**
   `google-agents-cli-workflow/SKILL.md:200` shortcut table says `agents-cli create`
   while the body says `agents-cli scaffold create`.
5. **ADK version drift.** `_shared/lifecycle-invariants.md:117` says
   `google-adk 2.4.0`; `_shared/source-of-truth.md:94` and
   `packages/web/AGENTS.md:49` say `2.3.0`.

Notably the model did **not** flag the headline "always active" collision between
`google-agents-cli-workflow` ("Always active — provides the full workflow") and
`af-workflow` (lifecycle entrypoint) as a conflict per se. It resolved that
silently via the source-of-truth authority rule and reported the downstream
*behavioral* conflicts instead.

## Side effects

None. `git status --porcelain` after both runs shows only the 17 pre-existing
modified `.agents/skills/**` files from the merge in progress, plus the untracked
evidence directory written by the operator. Both runs respected "do not create
files"; run 2-2 used only `rg`, `sed`, `wc`, `nl`, `git status`, `git diff`.

## Cost

Run 2-1a 45,365 tokens · run 2-1b 17,718 tokens · run 2-2 111,365 tokens.
