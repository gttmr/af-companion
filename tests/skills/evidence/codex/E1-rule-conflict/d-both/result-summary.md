# Result summary — condition (d) both

**D1: fail. D2: pass.** Under direct conflict, the af card's false D1 rule beat the upstream card's correct example.

## Cross-condition matrix

| condition | D1 routing | D2 output_schema+tools |
| --- | --- | --- |
| (a) no-skills | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (b) af-only | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |
| (c) upstream-only | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (d) both | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |

## Rubric evidence
- Both a correct example (`adk-workflows.md:98-99`, plain `return Event(...)`) and a false rule (`graph-and-dynamic-workflows.md:100`, "a plain return cannot carry a route") were in context. The model produced the generator form and left no note that its sources disagreed — no conflict surfaced to the reader.
- Plausible mechanism, **not verified**: the af card states an explicit prohibition with a cited source path, while upstream merely shows code. A stated rule outranks a demonstrated example.
- Second-order effect: this arm also imported the af card's dynamic-dispatch machinery (`mode='task'` + `ctx.run_node(..., raise_on_wait=True, override_isolation_scope=...)`, `rerun_on_resume=True`, `wait_for_output`, plus a hand-written `DeterministicDemoLlm(BaseLlm)`). The prompt asked for a "최소 예제"; this is by far the largest artifact of the four. Those specific rules may well be correct (the card cites `workflow/_workflow.py:189-217`), but they were not re-verified here: **unverified**.
- D2 was unaffected: upstream's false warning lost even with the af card present to contradict it.

## Forbidden outcomes
- None of the D2 forbidden outcomes occurred.
- D1 self-consistency: no internal contradiction — the model committed to the generator form and never mentioned the alternative.

## Residual uncertainty
- Order effects **unverified**: the af file list was prepended before the upstream list in the single prompt. Reversing the order was not tested and could plausibly change the D1 outcome.
- Direct proof of all four reads is **unverified**.
- n=1.

## Baseline comparison
- vs (a): regression on D1, no change on D2, substantially larger and more complex artifact.
- vs (c): the only difference in loaded material is the af pair, and D1 flips — the cleanest attribution of the D1 regression to the af card.
