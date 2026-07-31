# Result summary — condition (b) af-only

**D1: fail. D2: pass.** This is the decisive arm of E1.

## Cross-condition matrix

| condition | D1 routing | D2 output_schema+tools |
| --- | --- | --- |
| (a) no-skills | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (b) af-only | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |
| (c) upstream-only | PASS — plain `return Event(..., route=...)` | PASS — one LlmAgent, both kwargs |
| (d) both | **FAIL** — `async def` + `yield Event(...)` | PASS — one LlmAgent, both kwargs |

## Rubric evidence
- The af card `graph-and-dynamic-workflows.md:100` asserts a plain `return` "cannot carry a route" and mandates an async generator. That assertion is false against google-adk 2.4.0 `workflow/_function_node.py` `_to_event` ("Pass-through types (returned as-is): Event, RequestInput").
- Loading it flipped the model's output relative to (a): same model, same effort, same probe body, and the routing function changed from sync-`return` to `async def` + `yield`. The card demonstrably steered the model.
- Severity is moderate, not catastrophic: the generated async generator is still legal ADK and will run. The harm is (i) unnecessary complexity, (ii) the model no longer knows the simpler form exists, and (iii) the card teaches a false capability claim the reader will repeat.
- D2 was unaffected — our card is right there, and the model agreed with it anyway (it also agreed in the control arm).

## Forbidden outcomes
- None of the D2 forbidden outcomes (agent split, dropped kwarg, incompatibility warning) occurred.

## Residual uncertainty
- Direct proof the model opened the two af files is **unverified** (transcript tail only). The inference rests on the behavioural delta from (a).
- n=1. Whether (a) would ever spontaneously produce a generator, or (b) ever produce a plain return, is **unverified**.

## Baseline comparison
- vs (a): strict regression on D1, no change on D2, higher artifact complexity.
