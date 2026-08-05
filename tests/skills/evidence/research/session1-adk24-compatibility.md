# Session 1 agents-cli, Google Skills, and exact ADK 2.4 compatibility

Checked 2026-08-05 without Internet, a cloud model, or deployment.

## Verdict

`compatible_with_corrections`

`agents-cli 1.3.1` is not the owner of this exact-2.4 scaffold. Its Python package has no direct `google-adk` dependency, but its local ADK template emits:

```text
google-adk[gcp,otel-gcp]>=2.5.0,<3.0.0
a2a-sdk[http-server]>=1.0,<2
google-adk[eval]>=2.5.0,<3.0.0
```

Those generated ranges exclude the required `google-adk==2.4.0` and `a2a-sdk==0.3.26` baseline. The latest release present in the approved local cache whose generated ranges admit that baseline is `agents-cli 1.2.1`; it is the accepted CLI and Google Skill version.

This is a generated-project incompatibility, not a claim that the `agents-cli 1.3.1` package itself imports ADK 2.5.

## Repository and runtime gate

| Evidence | Result |
|---|---|
| Branch | `agent/af-skills-vnext` |
| Base commit | `3510e792b89b5dff7dd3d5cea943cffc44e80669` |
| CLI path | `/home/ilmaswsl/.local/bin/agents-cli` |
| Accepted CLI | `agents-cli, version 1.2.1` |
| Exact interpreter | `/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python` |
| Python | `3.13.12` |
| ADK | `google-adk 2.4.0` |
| MCP | `mcp 1.28.1` |
| A2A SDK | `a2a-sdk 0.3.26` |
| Supported project line | `google-adk[a2a,mcp]>=2.4.0,<2.5.0` |
| Network/model | localhost only; scripted model only; no external fallback |

## Version-transition reproduction

The candidate was installed into a temporary tool and binary root from the local uv cache. The scaffold command was:

```bash
UV_OFFLINE=1 UV_TOOL_DIR=<tmp>/tools UV_TOOL_BIN_DIR=<tmp>/bin \
  uv tool install --offline --force google-agents-cli==1.3.1

<tmp>/bin/agents-cli scaffold create cli131-probe \
  --agent adk --prototype --deployment-target none \
  --skip-checks --yes --output-dir <tmp>/output
```

The generated `pyproject.toml` contained the three excluding ranges shown above. The same values are present in the cached 1.3.1 `agents/adk/.template/templateconfig.yaml` and base Python template. No generated service was started.

The accepted release was then installed and checked:

```bash
UV_OFFLINE=1 uv tool install --offline --force google-agents-cli==1.2.1
agents-cli --version
agents-cli info --json
agents-cli scaffold create cli121-probe \
  --agent adk --prototype --deployment-target none \
  --skip-checks --yes --output-dir <tmp>/output
```

The 1.2.1 project emitted `google-adk[gcp,otel-gcp]>=2.2.0,<3.0.0`, `google-adk[eval]>=2.0.0,<3.0.0`, and `a2a-sdk[http-server]~=0.3.22`. These ranges admit exact ADK 2.4/A2A 0.3. The generated `app/agent.py` imported under the selected exact interpreter and exposed an `LlmAgent` as `root_agent`.

An isolated 1.3.1 probe briefly replaced the shared uv executable shim because only `UV_TOOL_DIR` was isolated. The condition was detected by the next version check, and the accepted 1.2.1 command above was rerun. Final `agents-cli --version` and `agents-cli info --json` both report `1.2.1`.

## Installed Google Skill lock

Tree digests use UTF-8 bytewise path order and `sha256(relative_path + NUL + sha256(file_bytes) + LF)`.

| Required Skill | Version | Tree digest |
|---|---:|---|
| `google-agents-cli-workflow` | 1.2.1 | `83dea9d79fe84b2c79d8323fdddbe493e040be2c1ebb3a0a365aef266f445c31` |
| `google-agents-cli-scaffold` | 1.2.1 | `fc3c18e81027108e18338617d105ef31c2e98821736a5b7d2b37508990240d2f` |
| `google-agents-cli-adk-code` | 1.2.1 | `e67352cc574bcea3017e3e03a6247c3b033be7929087b119a7e987914cb48e9f` |
| `google-agents-cli-eval` | 1.2.1 | `37c2d1659016791608630fb402b67cceb51f61aa8953804ea7347e4fc7081fc9` |

Direct filesystem discovery finds all seven installed Google Skills at version 1.2.1. `agents-cli info --json` nevertheless returns `"installed_skills": []`; this is recorded as a detector gap. Version, path, frontmatter, and tree digest are authoritative for this bundle.

## Documentation and model gates

ADK Docs MCP successfully listed `AgentDevelopmentKit`, fetched `llms.txt`, and returned the relevant Agent, Workflow, Graph, Tool, state, callback, resume, A2A, model, and managed-agent pages. Web search was not used.

The user explicitly authorized proceeding as if `qwen3.6-small` were absent. All four small-model forward cases remain `blocked`; none is represented as PASS, and no cloud or stronger-model fallback was enabled.

## Durable outputs

- [Capability inventory](../../adk24/capability-inventory.json)
- [Experiment matrix](../../adk24/experiment-matrix.json)
- [Bundle manifest](../../../../.agents/skills/af-skills-vnext-manifest.json)
- [Capability index](session1-adk24-capability-index.md)
- [Completion audit](session1-adk24-audit.md)

Rollback commands:

```bash
UV_OFFLINE=1 uv tool install --offline --force google-agents-cli==1.2.1
node scripts/af-skills-bundle.mjs rollback --target <user-home>
```
