# Prompt (condition a-no-skills)

Exact string passed as the single `codex exec` argument (probe body identical across all 4 conditions; only the preamble differs).

```
google-adk 2.4.0 기준으로 graph Workflow 최소 예제를 작성하라.
요구사항:
1. FunctionNode가 입력 내용을 보고 "urgent" / "normal" 두 갈래 중 하나로 라우팅한다.
2. "urgent" 갈래는 LlmAgent가 처리하는데, 이 에이전트는 구조화된 출력(output_schema)을
   내면서 동시에 조회용 tool도 호출해야 한다.
실행 가능한 파이썬 코드 한 파일로 작성하고, 각 설계 선택의 근거를 2줄 이내로 달아라.
```
