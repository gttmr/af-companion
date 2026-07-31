# Result summary — condition (c) upstream-only

**D1: pass. D2: pass.** The upstream false warning failed to propagate.

## Cross-condition matrix

| condition | D1 routing | D2 output_schema+tools |
| --- | --- | --- |
| (a) no-skills | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (b) af-only | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |
| (c) upstream-only | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (d) both | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |

## Rubric evidence
- `adk-python.md:100` ("Using `output_schema` disables tool calling and delegation") was in the explicitly-loaded set, yet the artifact puts `tools=` and `output_schema=` on one `LlmAgent` and its written rationale asserts the opposite of the card: "ADK 2.4.0은 tools 수행 중에는 호출을 허용하고 최종 응답에만 output_schema를 강제한다" — a paraphrase of the installed `llm_agent.py:393-396` docstring.
- Asymmetry worth recording: a false *prohibition* ("X is disabled") was overridden by the model's own knowledge, while a false *requirement* ("you must use a generator", condition b) was obeyed. A card that forbids something the model knows works gets checked; a card that demands extra ceremony gets complied with silently.
- D1 matched the upstream card's own example at `adk-workflows.md:98-99`, which happens to be correct.

## Forbidden outcomes
- None triggered. Specifically, the model did NOT split into two agents and did NOT warn about incompatibility.

## Residual uncertainty
- Direct proof of the reads is **unverified**.
- Because (a) also got D2 right, this run cannot distinguish "model overrode the card" from "model never internalised the card". Both are consistent with the artifact.
- n=1.

## Baseline comparison
- vs (a): no regression on either dispute. Comparable artifact size and shape.
