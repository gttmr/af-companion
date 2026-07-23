# Discovery Guide

Use `af-discover-assets` to turn requirement evidence into reviewable candidates before composing a Graph.

1. Separate observed evidence, assumptions, contradictions, and Missing Information.
2. Normalize actors, goals, triggers, I/O, systems, constraints, non-goals, and scenarios.
3. Identify the smallest responsibility-aligned Agent, Workflow, and Tool candidates.
4. Keep Resource and Dependency outside the asset list.
5. Record owner, domain, reuse signal, side effect, risk, data policy, and hard-gate unknowns.
6. Leave topology, Tool Invocation Control, and final runtime contracts to Compose.
7. Validate strict v2 outputs and put Discover in `waiting_for_review`.

The user/reviewer explicitly approves current discovery bytes in the external Codex session. The web Discover screen is a read-only projection.

See [Taxonomy](taxonomy.md), [Operating Model](operating-model.md), and the operational skill at `.agents/skills/af-discover-assets/SKILL.md`.
