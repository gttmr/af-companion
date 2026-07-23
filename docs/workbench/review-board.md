# External Review Gates

Review decisions occur in the external Codex conversation, not in a web approval board.

## Gates

| Gate | Reviews | Unlocks |
| --- | --- | --- |
| discovery | requirement, decisions, Asset decisions, candidates, risks, Registry snapshot, Missing Information | Compose |
| composition | discovery revision, Graph IR, Root Executable, bindings/runtime contracts, Scaffold Readiness | Scaffold |

The reviewer says approve or requests changes after seeing the current artifacts. The executing Codex session records status, exact revision binding, artifact ETag, timestamp, session ID, and turn ID in `af-work-item.json`.

Validator pass, skill completion, file presence, browser Graph save, Registry publication, or bridge health does not create approval. Changed bound revisions retain the prior decision as stale and invalidate dependent evidence.

The web displays gate state and revision only. It has no approve/reject mutation.
