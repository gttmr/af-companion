# Delivered prompt

```text
Agent Factory Companion 화면에서 방금 '합성 문의 분류' Work Item(적용 범위)을 선택하고, 그 상태 그대로 CLI로 작업을 넘겼다. `$af-discover-assets`를 명시적으로 사용해서 합성 문의 내용을 분류하는 기능에 필요한 구성요소 후보를 정리해줘. 파일은 만들지 말고 설명만 해줘.
```

The second and third sentences are `templates/skill-scenarios/S16-canonical-direct/prompt.md` verbatim. The first sentence is the E3 Companion-selection framing added for this experiment.

## Public context inventory (copied out-of-repo, path not given to the runner)

- `context/README.md` (S16 synthetic context)

## Hidden from the runner by intent

`expected-skill.json`, `expected-artifacts.md`, `forbidden-outcomes.md`, `rubric.md`, `verification-commands.txt`.
**Intent not achieved** — the run found and printed all five from the repository itself. See `result-summary.md` defect #0.
