# Delivered prompt

```text
Agent Factory Companion 화면에서 방금 Work Item `req-s11-human-input-resume`(적용 범위)을 선택하고, 그 상태 그대로 CLI로 작업을 넘겼다. context의 완전한 합성 승인 artifact 세트를 검증한 뒤, 중요한 합성 변경을 적용하기 전에 사람의 확인을 받고 같은 invocation을 API로 재개하는 runnable 로컬 프로토타입을 `${SCENARIO_OUTPUT_ROOT}/runtime`에 만들어줘. 중복 응답이나 재시작 때 동일한 합성 변경이 두 번 실행되지 않는지도 시험할 수 있어야 해.

참고: context 디렉터리는 <scratch>/E3/E3-b/input/context 이고, ${SCENARIO_OUTPUT_ROOT}는 환경변수로 주어진 절대 경로(<scratch>/E3/E3-b/out)다. 이 output root 밖에는 쓰지 마라.
```

Sentence 2-3 are `templates/skill-scenarios/S11-human-input-resume/prompt.md` verbatim.
Sentence 1 is the E3 Companion-selection framing. The `참고:` paragraph is operator plumbing (README §3.6/§3.7).

## Public context inventory (copied out-of-repo)

- `context/af-work-item.json`
- `context/analysis-result.json`
- `context/asset-candidates.json`
- `context/boundary-design.md`
- `context/graph-ir.json`
- `context/normalized-requirement.json`
- `context/scaffold-plan.json`

## Hidden from the runner

`expected-skill.json`, `expected-artifacts.md`, `forbidden-outcomes.md`, `rubric.md`, `verification-commands.txt` — not opened by this run.
