# Verification Commands

## Purpose

Choose commands by claim instead of a fixed server allow-list.

## Rules

- Run from the confirmed repository and revision.
- Use the lightest command that actually proves the claim.
- Preserve exact argv, cwd, environment facts, start/end time, exit code, and concise output.
- Never report a stronger claim than the command supports.
- A stale result is `unverified`, not `passed`.

Common repository commands include:

```bash
node scripts/validate-artifacts.mjs <artifact-root>
node scripts/validate-generated-runtime.mjs <artifact-root>
npm run build --prefix packages/web
npm run test:companion --prefix packages/web
```

These are examples, not an exhaustive allow-list. Runtime connection and behavior claims require the relevant compile/import, local smoke, protocol probe, or evaluation command in the actual generated environment.

## Environment failures

Distinguish product failure from missing dependency, unavailable service, credentials boundary, sandbox/network limitation, or wrong runtime. Record the check as failed or unverified with its real cause; do not silently substitute a weaker command.

## Completion

Verification may be `passed` only when every required claim has fresh sufficient evidence and no required check failed. Use `failed` for a disproved claim and `unverified` when required evidence could not be obtained.

## Checked date

- Checked date: 2026-07-23
- Contract sources: current repository scripts and external Codex execution model
