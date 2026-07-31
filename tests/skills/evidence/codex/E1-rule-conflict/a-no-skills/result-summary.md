# Result summary — condition (a) no-skills

**D1: pass. D2: pass.** Control arm.

## Cross-condition matrix (same in every condition's summary)

| condition | D1 routing | D2 output_schema+tools |
| --- | --- | --- |
| (a) no-skills | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (b) af-only | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |
| (c) upstream-only | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (d) both | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |

## Rubric evidence
- With no card loaded, the model independently produced the form that the installed google-adk 2.4.0 source documents: a sync `def` returning `Event(output=..., route=...)`, and a single `LlmAgent(tools=[...], output_schema=...)`.
- It volunteered the correct D2 rationale unprompted (`근거 2: ADK 2.4.0은 한 LlmAgent에서 tools와 output_schema의 동시 사용을 지원한다`).
- This establishes the baseline: gpt-5.6-sol at high effort already knows both disputed facts correctly. Neither skill set is needed to get D1/D2 right, so any deviation in (b)/(c)/(d) is attributable to the loaded text.

## Forbidden outcomes
- None triggered. No split-agent workaround, no "output_schema disables tools" warning.

## Residual uncertainty
- Only `tail -120` of the transcript was captured; the model's tool calls and any web fetches are **unverified**.
- The model's own claim of runtime verification (normal path + urgent tool→schema flow) was not independently re-executed: **unverified**.
- n=1 per condition. No repeat runs, so run-to-run variance is **unverified**.

## Baseline comparison
- This condition IS the baseline for E1.
