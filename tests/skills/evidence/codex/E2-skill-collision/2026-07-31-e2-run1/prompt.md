# E2 (skill collision) — Prompts

All prompts were passed as a single positional argument to `codex exec`, with
stdin redirected from `/dev/null`.

## Run 2-1a — discovery probe (as originally specified) — DISCARDED as primary evidence

```
이 저장소에서 지금 너에게 보이는 skill 들을 전부 나열하라. 각각에 대해 (1) skill 이름
(2) 그 SKILL.md 의 절대 경로 (3) 전역(~/.agents/skills)인지 저장소(.agents/skills)인지
를 표로 적어라. 파일은 절대 만들지 말고 설명만 해라.
```

Why discarded as primary evidence: the model answered by running
`rg --files -uu ~/.agents/skills <repo>/.agents/skills ~/.codex/skills | rg '/SKILL\.md$'`,
i.e. it enumerated the **filesystem**, not its injected context. That output
cannot distinguish "Codex injected these skills" from "the model went and looked".
Its bounded observed output is folded into `selected-skills.md`, but the
load-bearing run is 2-1b.

## Run 2-1b — discovery probe, context-only (primary evidence)

Same prompt with one added constraint sentence (in bold below):

```
이 저장소에서 지금 너에게 보이는 skill 들을 전부 나열하라. 각각에 대해 (1) skill 이름
(2) 그 SKILL.md 의 절대 경로 (3) 전역(~/.agents/skills)인지 저장소(.agents/skills)인지
를 표로 적어라. 파일 시스템을 검색하지 말고, 지금 너의 컨텍스트에 이미 주입되어 있는
skill 목록만 근거로 답하라. 파일은 절대 만들지 말고 설명만 해라.
```

Added clause, translated: "Do not search the filesystem; answer only on the basis
of the skill list already injected into your context."

This turns the probe into a real test of injection: if Codex does not inject
`.agents/skills`, the model cannot produce those names/paths without tool calls.

## Run 2-2 — collision probe

```
ADK 에이전트를 새로 개발하려고 한다. 지금 이 저장소에서 어떤 절차를 따라야 하는지,
어떤 skill 을 근거로 그렇게 판단했는지 그 skill 의 절대 경로와 함께 설명하라.
서로 충돌하는 지침이 있으면 무엇이 충돌하는지 그대로 지적하라.
파일은 절대 만들지 말고 설명만 해라.
```
