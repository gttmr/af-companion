# Selected skills — condition (c) upstream-only

Explicit load instruction in the preamble named exactly two files:

1. `/home/ilmaswsl/.agents/skills/google-agents-cli-adk-code/references/adk-workflows.md`
2. `/home/ilmaswsl/.agents/skills/google-agents-cli-adk-code/references/adk-python.md`

- No af card was named or, as far as the captured output shows, consulted.
- Direct proof of the reads is **unverified**. Indirect evidence: the routing form matches `adk-workflows.md:98-99` verbatim in shape (`return Event(output=..., route=...)`).
- Notably the model did **not** propagate `adk-python.md:100` ("Using `output_schema` disables tool calling and delegation"); its written rationale instead paraphrases the installed 2.4.0 `llm_agent.py` docstring, implying it also checked source or its own priors and overrode the card.
