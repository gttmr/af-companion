# External Review Gates

Review decisions occur in the external Codex conversation, not in a web approval board.

## Gates

| Gate | Reviews | Unlocks |
| --- | --- | --- |
| discovery | evidence, candidates, assumptions, risks, Missing Information | Compose |
| composition | candidate decisions, Graph IR, bindings/contracts, Scaffold Readiness | Scaffold |

The reviewer says approve or requests changes after seeing the current artifacts. The executing Codex session records status, reviewed artifact SHA-256, timestamp, session ID, and turn ID in `af-work-item.json`.

Validator pass, skill completion, file presence, browser Graph save, or bridge health does not create approval. Changed bytes invalidate the affected gate and downstream evidence.

The web displays gate state and revision only. It has no approve/reject mutation.
