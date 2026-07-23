# Discovery Guide

Use `af-discover-assets` to turn requirement evidence into explicit user decisions and reviewable candidates before composing a Graph.

1. Run Phase A in actual Codex Plan mode and keep it conversation-only; do not write tracked artifacts.
2. Separate observed evidence, assumptions, contradictions, and Missing Information after checking Repository, Handbook, and bounded Registry evidence.
3. Normalize actors, goals, triggers, I/O, systems, constraints, non-goals, and scenarios.
4. Search the Registry with deterministic filters and L0→L1→L2 disclosure; do not load the whole Registry into model context.
5. Identify the smallest responsibility-aligned Agent, Workflow, and Tool candidates. Keep Resource and Dependency outside the asset list.
6. Ask the user to resolve every required control, Root, and Asset disposition decision. Recommendations never become user selections automatically.
7. Emit the Discovery Decision Plan and exact fresh-session handoff marker. Leave final topology, Tool Invocation Control, and runtime contracts to Compose.
8. In a distinct materialization session, claim or explicitly attach the handoff, recheck revisions, write strict v2 outputs, and put Discover in `waiting_for_review`.

The user/reviewer explicitly approves the exact discovery, decision, Asset decision, requirement, and Registry snapshot revisions in the external Codex session. The web Discover screen projects those records and remains read-only for Work Item artifacts.

See [Taxonomy](taxonomy.md), [Operating Model](operating-model.md), and the operational skill at `.agents/skills/af-discover-assets/SKILL.md`.
