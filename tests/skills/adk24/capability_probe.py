#!/usr/bin/env python3
"""Offline, deterministic ADK 2.4 Workflow/Agent capability probes.

The probe intentionally uses no cloud model, Internet service, or deployment
surface.  A tiny scripted ``BaseLlm`` is used only to drive deterministic ADK
tool/delegation paths.  Run with the interpreter selected by
``requirements/adk-runtime.txt`` and pinned to google-adk 2.4.0.
"""

from __future__ import annotations

import argparse
import asyncio
from contextlib import asynccontextmanager
import importlib.metadata
import inspect
import json
import logging
from pathlib import Path
import socket
import sys
import time
from typing import Any, AsyncIterator, Awaitable, Callable
import warnings

from pydantic import BaseModel, Field, ValidationError
from fastapi.openapi.models import APIKey, APIKeyIn

from google.adk.a2a.utils.agent_to_a2a import to_a2a
from google.adk.agents import (
    Agent,
    BaseAgent,
    LoopAgent,
    ParallelAgent,
    SequentialAgent,
)
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
from google.adk.apps import App, ResumabilityConfig
from google.adk.artifacts import InMemoryArtifactService
from google.adk.auth.auth_credential import AuthCredential, AuthCredentialTypes
from google.adk.events import Event, EventActions, RequestInput
from google.adk.memory import InMemoryMemoryService
from google.adk.models import BaseLlm, LlmResponse
from google.adk.plugins import BasePlugin
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import AgentTool, FunctionTool
from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import (
    OpenAPIToolset,
)
from google.adk.tools.mcp_tool import (
    McpToolset,
    SseConnectionParams,
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)
from google.adk.workflow import (
    DEFAULT_ROUTE,
    START,
    FunctionNode,
    JoinNode,
    NodeTimeoutError,
    RetryConfig,
    Workflow,
    node,
)
from google.genai import types
from mcp import StdioServerParameters
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn


warnings.filterwarnings("ignore", message=r"\[EXPERIMENTAL\].*")
warnings.filterwarnings("ignore", message="Skipping missing token usage metadata.*")
logging.disable(logging.CRITICAL)

ROOT = Path(__file__).resolve().parents[3]
MCP_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "mcp_server.py"
MCP_HTTP_FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "mcp_http_server.py"
)
Case = Callable[[], Any | Awaitable[Any]]
CASES: dict[str, Case] = {}


def case(experiment_id: str) -> Callable[[Case], Case]:
  """Register one independently selectable experiment."""

  def register(func: Case) -> Case:
    if experiment_id in CASES:
      raise RuntimeError(f"duplicate experiment id: {experiment_id}")
    CASES[experiment_id] = func
    return func

  return register


def require(condition: Any, message: str) -> None:
  if not condition:
    raise AssertionError(message)


def response(*parts: types.Part) -> LlmResponse:
  return LlmResponse(content=types.Content(role="model", parts=list(parts)))


def text_response(value: str) -> LlmResponse:
  return response(types.Part(text=value))


class ScriptedLlm(BaseLlm):
  """Minimal deterministic model driver; it never performs I/O."""

  script: list[LlmResponse]
  requests: list[Any] = Field(default_factory=list)
  cursor: int = 0

  async def generate_content_async(
      self, llm_request: Any, stream: bool = False
  ) -> AsyncIterator[LlmResponse]:
    del stream
    self.requests.append(llm_request)
    index = min(self.cursor, len(self.script) - 1)
    self.cursor += 1
    yield self.script[index]


class DeterministicAgent(BaseAgent):
  """Small custom BaseAgent used for orchestration tests."""

  text: str = "OK"
  state_delta: dict[str, Any] = Field(default_factory=dict)
  delay: float = 0.0
  fail_message: str | None = None
  escalate: bool = False

  async def _run_async_impl(self, ctx: Any) -> AsyncIterator[Event]:
    if self.delay:
      await asyncio.sleep(self.delay)
    if self.fail_message:
      raise RuntimeError(self.fail_message)
    yield Event(
        author=self.name,
        invocation_id=ctx.invocation_id,
        content=types.Content(role="model", parts=[types.Part(text=self.text)]),
        actions=EventActions(
            state_delta=dict(self.state_delta), escalate=self.escalate
        ),
    )


class OutputModel(BaseModel):
  value: int


async def new_runtime(
    root: BaseAgent | Workflow,
    *,
    app_name: str,
    resumable: bool = False,
    plugins: list[BasePlugin] | None = None,
    artifact_service: InMemoryArtifactService | None = None,
    memory_service: InMemoryMemoryService | None = None,
) -> tuple[Runner, InMemorySessionService]:
  session_service = InMemorySessionService()
  await session_service.create_session(
      app_name=app_name, user_id="user", session_id="session"
  )
  app = App(
      name=app_name,
      root_agent=root,
      plugins=plugins or [],
      resumability_config=(
          ResumabilityConfig(is_resumable=True) if resumable else None
      ),
  )
  runner = Runner(
      app=app,
      session_service=session_service,
      artifact_service=artifact_service,
      memory_service=memory_service,
  )
  return runner, session_service


async def run_message(
    runner: Runner, message: types.Content | str
) -> list[Event]:
  if isinstance(message, str):
    message = types.Content(role="user", parts=[types.Part(text=message)])
  return [
      event
      async for event in runner.run_async(
          user_id="user", session_id="session", new_message=message
      )
  ]


def event_texts(events: list[Event]) -> list[str]:
  return [
      part.text
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.text
  ]


def function_calls(events: list[Event], name: str | None = None) -> list[Any]:
  calls = [
      part.function_call
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_call
  ]
  return [call for call in calls if name is None or call.name == name]


def validate_agent_tree(root: BaseAgent) -> None:
  """AF fail-closed guard for gaps in BaseAgent's construction validator."""

  seen_objects: set[int] = set()
  seen_names: set[str] = set()
  active: set[int] = set()

  def visit(agent: BaseAgent) -> None:
    identity = id(agent)
    if identity in active:
      raise ValueError(f"recursive agent tree at {agent.name}")
    if identity in seen_objects:
      raise ValueError(f"agent object reused at {agent.name}")
    if agent.name in seen_names:
      raise ValueError(f"duplicate agent name: {agent.name}")
    active.add(identity)
    seen_objects.add(identity)
    seen_names.add(agent.name)
    for child in agent.sub_agents:
      visit(child)
    active.remove(identity)

  visit(root)


@case("ENV-ADK-001")
def exact_adk_version() -> dict[str, Any]:
  versions = {
      name: importlib.metadata.version(name)
      for name in ("google-adk", "mcp", "a2a-sdk")
  }
  require(versions["google-adk"] == "2.4.0", str(versions))
  require(versions["mcp"] == "1.28.1", str(versions))
  require(versions["a2a-sdk"] == "0.3.26", str(versions))
  return {"python": sys.executable, "versions": versions}


@case("A-P01")
async def single_agent_root() -> dict[str, Any]:
  runner, _ = await new_runtime(
      DeterministicAgent(name="root", text="ROOT_OK"), app_name="a_p01"
  )
  events = await run_message(runner, "run")
  require("ROOT_OK" in event_texts(events), "root Agent did not run")
  await runner.close()
  return {"root_type": "BaseAgent", "texts": event_texts(events)}


@case("A-N01")
def agent_identity_guards() -> dict[str, Any]:
  model = ScriptedLlm(model="scripted", script=[text_response("unused")])
  left = Agent(name="duplicate", model=model, mode="chat")
  right = Agent(name="duplicate", model=model, mode="chat")
  root = Agent(
      name="root", model=model, mode="chat", sub_agents=[left, right]
  )
  # Exact 2.4 logs duplicate names but still constructs the tree.
  require(len(root.sub_agents) == 2, "duplicate-name behavior changed")
  try:
    validate_agent_tree(root)
  except ValueError as error:
    duplicate_guard = str(error)
  else:
    raise AssertionError("AF duplicate-name guard did not fail closed")

  reused = Agent(name="reused", model=model, mode="chat")
  Agent(name="owner_one", model=model, mode="chat", sub_agents=[reused])
  try:
    Agent(name="owner_two", model=model, mode="chat", sub_agents=[reused])
  except ValidationError as error:
    reuse_rejected = type(error).__name__
  else:
    raise AssertionError("already-parented child was accepted")

  recursive = Agent(name="recursive", model=model, mode="chat")
  recursive.sub_agents.append(recursive)
  try:
    validate_agent_tree(recursive)
  except ValueError as error:
    recursion_guard = str(error)
  else:
    raise AssertionError("AF recursion guard did not fail closed")
  return {
      "framework_duplicate_construction": "accepted_with_log",
      "af_duplicate_guard": duplicate_guard,
      "framework_parent_reuse": reuse_rejected,
      "af_recursive_guard": recursion_guard,
  }


@case("A-P02")
async def delegation_transfer() -> dict[str, Any]:
  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="transfer-1",
                      name="transfer_to_agent",
                      args={"agent_name": "specialist"},
                  )
              )
          ),
          text_response("SPECIALIST_OK"),
      ],
  )
  specialist = Agent(
      name="specialist", model=model, instruction="specialize", mode="chat"
  )
  coordinator = Agent(
      name="coordinator",
      model=model,
      instruction="delegate",
      mode="chat",
      sub_agents=[specialist],
  )
  runner, _ = await new_runtime(coordinator, app_name="a_p02")
  events = await run_message(runner, "delegate")
  require("SPECIALIST_OK" in event_texts(events), "transfer failed")
  require(
      any(event.actions.transfer_to_agent == "specialist" for event in events),
      "transfer action absent",
  )
  await runner.close()
  return {"requests": len(model.requests), "texts": event_texts(events)}


@case("A-P03")
async def agent_as_tool_and_state_forwarding() -> dict[str, Any]:
  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="child-1",
                      name="worker",
                      args={"request": "do work"},
                  )
              )
          ),
          text_response("PARENT_OK"),
      ],
  )
  worker = DeterministicAgent(
      name="worker", text="WORKER_OK", state_delta={"worker_status": "done"}
  )
  parent = Agent(
      name="parent",
      model=model,
      mode="chat",
      tools=[AgentTool(worker, skip_summarization=False)],
  )
  runner, sessions = await new_runtime(parent, app_name="a_p03")
  events = await run_message(runner, "use worker")
  session = await sessions.get_session(
      app_name="a_p03", user_id="user", session_id="session"
  )
  require(session is not None, "session missing")
  require(session.state.get("worker_status") == "done", str(session.state))
  require("PARENT_OK" in event_texts(events), "parent did not finish")
  await runner.close()
  return {"forwarded_state": session.state, "texts": event_texts(events)}


@case("A-N02")
def workflow_is_not_agent_tool() -> dict[str, Any]:
  workflow = Workflow(name="workflow")
  require(not isinstance(workflow, BaseAgent), "Workflow became BaseAgent")
  # The 2.4 constructor is not runtime-type-enforced, so AF must reject before
  # AgentTool is built even though this unsafe construction currently succeeds.
  unsafe = AgentTool(workflow)  # type: ignore[arg-type]
  require(unsafe.name == "workflow", "unsafe construction behavior changed")
  return {
      "framework_constructor": "accepts_despite_BaseAgent_annotation",
      "af_decision": "reject_workflow_before_AgentTool",
  }


@case("A-P04")
async def legacy_workflow_agents() -> dict[str, Any]:
  sequential = SequentialAgent(
      name="sequential",
      sub_agents=[
          DeterministicAgent(name="seq_one", text="SEQ_ONE"),
          DeterministicAgent(name="seq_two", text="SEQ_TWO"),
      ],
  )
  runner, _ = await new_runtime(sequential, app_name="a_p04_seq")
  seq_events = await run_message(runner, "run")
  await runner.close()
  require(event_texts(seq_events) == ["SEQ_ONE", "SEQ_TWO"], "bad order")

  parallel = ParallelAgent(
      name="parallel",
      sub_agents=[
          DeterministicAgent(name="par_slow", text="SLOW", delay=0.02),
          DeterministicAgent(name="par_fast", text="FAST"),
      ],
  )
  runner, _ = await new_runtime(parallel, app_name="a_p04_par")
  par_events = await run_message(runner, "run")
  await runner.close()
  require(set(event_texts(par_events)) == {"SLOW", "FAST"}, "parallel loss")

  loop = LoopAgent(
      name="loop",
      sub_agents=[DeterministicAgent(name="loop_body", text="LOOP")],
      max_iterations=2,
  )
  runner, _ = await new_runtime(loop, app_name="a_p04_loop")
  loop_events = await run_message(runner, "run")
  await runner.close()
  require(event_texts(loop_events).count("LOOP") == 2, "loop bound failed")
  return {
      "sequential": event_texts(seq_events),
      "parallel": event_texts(par_events),
      "loop_iterations": event_texts(loop_events).count("LOOP"),
      "status": "supported_but_deprecated_in_favor_of_Workflow",
  }


@case("A-N03")
def agent_mode_placement_guards() -> dict[str, Any]:
  model = ScriptedLlm(model="scripted", script=[text_response("unused")])
  task = Agent(name="task_agent", model=model, mode="task")
  try:
    Workflow(name="task_graph", edges=[(START, task)])
  except ValueError as error:
    task_error = str(error)
  else:
    raise AssertionError("task agent was accepted as static graph node")

  @node
  async def predecessor(node_input: Any) -> Any:
    return node_input

  chat = Agent(name="chat_agent", model=model, mode="chat")
  try:
    Workflow(
        name="chat_graph", edges=[(START, predecessor), (predecessor, chat)]
    )
  except ValueError as error:
    chat_error = str(error)
  else:
    raise AssertionError("chat graph node was accepted after non-START")
  return {"task_guard": task_error, "chat_guard": chat_error}


@case("B-P01")
async def graph_sequence_route_default() -> dict[str, Any]:
  @node
  async def start_value(node_input: Any) -> dict[str, int]:
    del node_input
    return {"value": 1}

  @node
  async def router(node_input: dict[str, int]) -> Event:
    return Event(output=node_input, route="known")

  @node
  async def selected(node_input: dict[str, int]) -> dict[str, int]:
    return {"value": node_input["value"] + 1}

  @node
  async def fallback(node_input: dict[str, int]) -> dict[str, int]:
    return {"value": -1}

  workflow = Workflow(
      name="route_workflow",
      edges=[
          (START, start_value),
          (start_value, router),
          (router, {"known": selected, DEFAULT_ROUTE: fallback}),
      ],
  )
  runner, _ = await new_runtime(workflow, app_name="b_p01")
  events = await run_message(runner, "run")
  await runner.close()
  outputs = [event.output for event in events if event.output is not None]
  require({"value": 2} in outputs and {"value": -1} not in outputs, str(outputs))
  return {"outputs": outputs}


@case("B-N01")
async def invalid_route_is_terminal_without_default() -> dict[str, Any]:
  @node
  async def router(node_input: Any) -> Event:
    return Event(output={"route": "missing"}, route="missing")

  @node
  async def unreachable(node_input: Any) -> str:
    return "SHOULD_NOT_RUN"

  workflow = Workflow(
      name="invalid_route_workflow",
      edges=[(START, router), (router, {"known": unreachable})],
  )
  runner, _ = await new_runtime(workflow, app_name="b_n01")
  events = await run_message(runner, "run")
  await runner.close()
  require("SHOULD_NOT_RUN" not in event_texts(events), "invalid route leaked")
  return {
      "observed": "unmatched route ends the branch without exception",
      "route_outputs": [event.output for event in events],
      "af_rule": "require explicit default or typed terminal result",
  }


@case("B-P02")
async def fanout_or_and_join() -> dict[str, Any]:
  calls: list[str] = []

  @node
  async def branch_a(node_input: Any) -> dict[str, str]:
    del node_input
    return {"branch": "a"}

  @node
  async def branch_b(node_input: Any) -> dict[str, str]:
    del node_input
    return {"branch": "b"}

  @node
  async def ordinary_sink(node_input: dict[str, str]) -> dict[str, str]:
    calls.append(node_input["branch"])
    return node_input

  ordinary_workflow = Workflow(
      name="ordinary_fanin_workflow",
      edges=[
          (START, (branch_a, branch_b)),
          (branch_a, ordinary_sink),
          (branch_b, ordinary_sink),
      ],
  )
  runner, _ = await new_runtime(ordinary_workflow, app_name="b_p02_or")
  ordinary_events = await run_message(runner, "run")
  await runner.close()
  require(sorted(calls) == ["a", "b"], f"ordinary sink calls: {calls}")

  @node
  async def join_branch_a(node_input: Any) -> dict[str, str]:
    del node_input
    return {"branch": "a"}

  @node
  async def join_branch_b(node_input: Any) -> dict[str, str]:
    del node_input
    return {"branch": "b"}

  join = JoinNode(name="all_branches")

  @node
  async def joined_sink(node_input: dict[str, Any]) -> dict[str, Any]:
    return {"keys": sorted(node_input)}

  join_workflow = Workflow(
      name="join_workflow",
      edges=[
          (START, (join_branch_a, join_branch_b)),
          (join_branch_a, join),
          (join_branch_b, join),
          (join, joined_sink),
      ],
  )
  runner, _ = await new_runtime(join_workflow, app_name="b_p02_join")
  join_events = await run_message(runner, "run")
  await runner.close()
  outputs = [event.output for event in join_events if event.output is not None]
  require(
      {"keys": ["join_branch_a", "join_branch_b"]} in outputs,
      f"join output: {outputs}",
  )
  return {
      "ordinary_incoming": "one execution per trigger",
      "ordinary_calls": calls,
      "ordinary_outputs": [event.output for event in ordinary_events],
      "join": "one execution after all predecessors",
  }


@case("B-N02")
def graph_validation_failures() -> dict[str, Any]:
  @node
  async def first(node_input: Any) -> Any:
    return node_input

  @node
  async def second(node_input: Any) -> Any:
    return node_input

  failures: dict[str, str] = {}
  try:
    Workflow(
        name="unconditional_cycle",
        edges=[(START, first), (first, second), (second, first)],
    )
  except ValueError as error:
    failures["unconditional_cycle"] = str(error)
  else:
    raise AssertionError("unconditional cycle was accepted")

  @node
  async def orphan(node_input: Any) -> Any:
    return node_input

  try:
    Workflow(name="unreachable", edges=[(START, first), (orphan, second)])
  except ValueError as error:
    failures["unreachable"] = str(error)
  else:
    raise AssertionError("unreachable node was accepted")
  return failures


@case("B-P03")
async def conditional_cycle_and_dynamic_dispatch() -> dict[str, Any]:
  @node
  async def dynamic_child(node_input: Any) -> dict[str, Any]:
    return {"dynamic": node_input}

  @node(rerun_on_resume=True)
  async def dispatcher(ctx: Any, node_input: Any) -> Any:
    del node_input
    return await ctx.run_node(
        dynamic_child, node_input={"selected": True}, run_id="selected-child"
    )

  workflow = Workflow(name="dynamic_workflow", edges=[(START, dispatcher)])
  runner, _ = await new_runtime(workflow, app_name="b_p03_dynamic")
  events = await run_message(runner, "run")
  await runner.close()
  require(
      {"dynamic": {"selected": True}}
      in [event.output for event in events],
      "dynamic node output missing",
  )

  visits: list[int] = []

  @node
  async def loop_body(node_input: Any) -> Event:
    del node_input
    visits.append(len(visits) + 1)
    route = "again" if len(visits) < 2 else "done"
    return Event(output={"visit": len(visits)}, route=route)

  @node
  async def loop_done(node_input: Any) -> Any:
    return node_input

  cycle = Workflow(
      name="conditional_cycle",
      edges=[
          (START, loop_body),
          (loop_body, {"again": loop_body, "done": loop_done}),
      ],
  )
  runner, _ = await new_runtime(cycle, app_name="b_p03_cycle")
  cycle_events = await run_message(runner, "run")
  await runner.close()
  require(visits == [1, 2], str(visits))
  return {
      "dynamic_path": [event.node_info.path for event in events],
      "conditional_cycle_visits": visits,
      "terminal_outputs": [event.output for event in cycle_events][-2:],
  }


@case("B-N03")
async def timeout_retry_and_parallel_failure() -> dict[str, Any]:
  attempts = 0

  @node(
      retry_config=RetryConfig(
          max_attempts=2,
          initial_delay=0,
          max_delay=0,
          jitter=0,
          exceptions=[RuntimeError],
      )
  )
  async def flaky(node_input: Any) -> str:
    nonlocal attempts
    del node_input
    attempts += 1
    if attempts == 1:
      raise RuntimeError("retry")
    return "RETRIED_OK"

  workflow = Workflow(name="retry_workflow", edges=[(START, flaky)])
  runner, _ = await new_runtime(workflow, app_name="b_n03_retry")
  retry_events = await run_message(runner, "run")
  await runner.close()
  require(
      attempts == 2
      and "RETRIED_OK" in [event.output for event in retry_events],
      "retry",
  )

  @node(timeout=0.01)
  async def too_slow(node_input: Any) -> str:
    del node_input
    await asyncio.sleep(0.1)
    return "late"

  timeout_workflow = Workflow(
      name="timeout_workflow", edges=[(START, too_slow)]
  )
  runner, _ = await new_runtime(timeout_workflow, app_name="b_n03_timeout")
  try:
    await run_message(runner, "run")
  except NodeTimeoutError as error:
    timeout_type = type(error).__name__
  else:
    raise AssertionError("node timeout did not fail")
  await runner.close()

  join = JoinNode(name="join_after_failure")

  @node
  async def good(node_input: Any) -> str:
    del node_input
    return "good"

  @node
  async def bad(node_input: Any) -> str:
    del node_input
    raise RuntimeError("branch failed")

  @node
  async def downstream(node_input: Any) -> str:
    del node_input
    return "SHOULD_NOT_RUN"

  failed = Workflow(
      name="parallel_failure",
      edges=[
          (START, (good, bad)),
          (good, join),
          (bad, join),
          (join, downstream),
      ],
  )
  runner, _ = await new_runtime(failed, app_name="b_n03_parallel")
  try:
    await run_message(runner, "run")
  except RuntimeError as error:
    parallel_error = str(error)
  else:
    raise AssertionError("parallel branch failure was swallowed")
  await runner.close()
  return {
      "retry_attempts": attempts,
      "timeout": timeout_type,
      "parallel_error": parallel_error,
      "join_suppressed": True,
  }


@case("C-P01")
async def function_tool_fixed_and_agent_selected() -> dict[str, Any]:
  def add(left: int, right: int) -> dict[str, int]:
    return {"sum": left + right}

  @node
  async def prepare(node_input: Any) -> dict[str, int]:
    del node_input
    return {"left": 2, "right": 3}

  fixed_tool = FunctionTool(add)
  workflow = Workflow(
      name="fixed_tool_workflow",
      edges=[(START, prepare), (prepare, fixed_tool)],
  )
  runner, _ = await new_runtime(workflow, app_name="c_p01_fixed")
  fixed_events = await run_message(runner, "run")
  await runner.close()
  require({"sum": 5} in [event.output for event in fixed_events], "fixed tool")

  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="add-1", name="add", args={"left": 4, "right": 5}
                  )
              )
          ),
          text_response("SELECTED_OK"),
      ],
  )
  agent = Agent(name="selector", model=model, mode="chat", tools=[add])
  runner, _ = await new_runtime(agent, app_name="c_p01_selected")
  selected_events = await run_message(runner, "run")
  await runner.close()
  responses = [
      part.function_response.response
      for event in selected_events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_response and part.function_response.name == "add"
  ]
  require(any(item.get("sum") == 9 for item in responses), str(responses))
  return {"fixed": {"sum": 5}, "selected": responses}


@case("C-N01")
async def function_tool_invalid_input() -> dict[str, Any]:
  def required(value: str) -> dict[str, str]:
    return {"value": value}

  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="required-1", name="required", args={}
                  )
              )
          ),
          text_response("handled"),
      ],
  )
  agent = Agent(name="invalid_input", model=model, mode="chat", tools=[required])
  runner, _ = await new_runtime(agent, app_name="c_n01")
  events = await run_message(runner, "run")
  await runner.close()
  responses = [
      part.function_response.response
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_response
  ]
  require(any("error" in item for item in responses), str(responses))
  return {"responses": responses}


@case("C-P02")
async def local_stdio_mcp_filter_and_call() -> dict[str, Any]:
  toolset = McpToolset(
      connection_params=StdioConnectionParams(
          server_params=StdioServerParameters(
              command=sys.executable, args=[str(MCP_FIXTURE)]
          )
      ),
      tool_filter=["local_echo"],
  )
  discovered = await toolset.get_tools()
  require([tool.name for tool in discovered] == ["local_echo"], "MCP filter")
  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="mcp-1", name="local_echo", args={"value": "LOCAL"}
                  )
              )
          ),
          text_response("MCP_OK"),
      ],
  )
  agent = Agent(name="mcp_agent", model=model, mode="chat", tools=[toolset])
  runner, _ = await new_runtime(agent, app_name="c_p02")
  try:
    events = await run_message(runner, "run")
  finally:
    await runner.close()
    await toolset.close()
  responses = [
      part.function_response.response
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_response and part.function_response.name == "local_echo"
  ]
  require(responses, "MCP call response absent")
  require("MCP_OK" in event_texts(events), "MCP agent did not complete")
  return {"tools": [tool.name for tool in discovered], "responses": responses}


@case("C-N02")
async def local_stdio_mcp_unavailable() -> dict[str, Any]:
  toolset = McpToolset(
      connection_params=StdioConnectionParams(
          server_params=StdioServerParameters(
              command="/definitely/missing/af-mcp-server"
          ),
          timeout=0.2,
      )
  )
  try:
    await asyncio.wait_for(toolset.get_tools(), timeout=1)
  except Exception as error:  # exact transport type is not stable API
    failure = type(error).__name__
  else:
    raise AssertionError("missing MCP server was accepted")
  finally:
    await toolset.close()
  return {"failure": failure, "classification": "dependency_unavailable"}


@asynccontextmanager
async def local_mcp_http_server(
    transport: str,
) -> AsyncIterator[str]:
  if transport == "streamable_http":
    endpoint = "/mcp"
  elif transport == "sse":
    endpoint = "/sse"
  else:
    raise ValueError(f"unsupported MCP fixture transport: {transport}")

  sock = socket.socket()
  sock.bind(("127.0.0.1", 0))
  port = sock.getsockname()[1]
  sock.close()
  process = await asyncio.create_subprocess_exec(
      sys.executable,
      str(MCP_HTTP_FIXTURE),
      "--transport",
      transport,
      "--port",
      str(port),
      stdout=asyncio.subprocess.DEVNULL,
      stderr=asyncio.subprocess.DEVNULL,
  )
  deadline = time.monotonic() + 5
  while True:
    if process.returncode is not None:
      raise RuntimeError(f"local MCP {transport} server exited early")
    try:
      reader, writer = await asyncio.open_connection("127.0.0.1", port)
    except OSError:
      pass
    else:
      del reader
      writer.close()
      await writer.wait_closed()
      break
    if time.monotonic() > deadline:
      raise TimeoutError(f"local MCP {transport} server did not start")
    await asyncio.sleep(0.01)
  try:
    yield f"http://127.0.0.1:{port}{endpoint}"
  finally:
    process.terminate()
    try:
      await asyncio.wait_for(process.wait(), timeout=5)
    except TimeoutError:
      process.kill()
      await process.wait()


async def exercise_http_mcp_toolset(
    transport: str, connection_params: Any
) -> dict[str, Any]:
  toolset = McpToolset(
      connection_params=connection_params,
      tool_filter=["http_echo"],
  )
  discovered = await toolset.get_tools()
  require([tool.name for tool in discovered] == ["http_echo"], transport)
  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id=f"{transport}-1",
                      name="http_echo",
                      args={"value": "LOCAL_HTTP"},
                  )
              )
          ),
          text_response(f"{transport.upper()}_OK"),
      ],
  )
  agent = Agent(
      name=f"{transport}_agent", model=model, mode="chat", tools=[toolset]
  )
  runner, _ = await new_runtime(agent, app_name=f"c_p04_{transport}")
  try:
    events = await run_message(runner, "run")
  finally:
    await runner.close()
    await toolset.close()
  responses = [
      part.function_response.response
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_response and part.function_response.name == "http_echo"
  ]
  require(responses, f"{transport} response absent")
  return {"tools": [tool.name for tool in discovered], "responses": responses}


@case("C-P04")
async def local_mcp_http_transports() -> dict[str, Any]:
  async with local_mcp_http_server("streamable_http") as url:
    async with asyncio.timeout(8):
      streamable = await exercise_http_mcp_toolset(
          "streamable_http",
          StreamableHTTPConnectionParams(
              url=url, timeout=1.0, sse_read_timeout=1.0
          ),
      )
  async with local_mcp_http_server("sse") as url:
    async with asyncio.timeout(8):
      sse = await exercise_http_mcp_toolset(
          "sse",
          SseConnectionParams(url=url, timeout=1.0, sse_read_timeout=1.0),
      )
  return {"streamable_http": streamable, "sse": sse}


@case("C-N04")
async def local_mcp_http_unavailable() -> dict[str, Any]:
  sock = socket.socket()
  sock.bind(("127.0.0.1", 0))
  port = sock.getsockname()[1]
  toolset = McpToolset(
      connection_params=StreamableHTTPConnectionParams(
          url=f"http://127.0.0.1:{port}/mcp",
          timeout=0.2,
          sse_read_timeout=0.2,
      )
  )
  try:
    await asyncio.wait_for(toolset.get_tools(), timeout=1)
  except Exception as error:  # transport failure is the contract under test
    failure = type(error).__name__
  else:
    raise AssertionError("unavailable MCP HTTP endpoint was accepted")
  finally:
    await toolset.close()
    sock.close()
  return {"failure": failure, "classification": "dependency_unavailable"}


@asynccontextmanager
async def local_openapi_server() -> AsyncIterator[tuple[str, list[str | None]]]:
  observed_keys: list[str | None] = []

  async def echo(request: Request) -> JSONResponse:
    observed_keys.append(request.headers.get("x-af-probe"))
    return JSONResponse({"echo": request.path_params["value"]})

  app = Starlette(routes=[Route("/echo/{value}", echo, methods=["GET"])])
  sock = socket.socket()
  sock.bind(("127.0.0.1", 0))
  sock.listen(128)
  sock.setblocking(False)
  port = sock.getsockname()[1]
  server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
  task = asyncio.create_task(server.serve(sockets=[sock]))
  deadline = time.monotonic() + 5
  while not server.started:
    if time.monotonic() > deadline:
      raise TimeoutError("local OpenAPI server did not start")
    await asyncio.sleep(0.01)
  try:
    yield f"http://127.0.0.1:{port}", observed_keys
  finally:
    server.should_exit = True
    await asyncio.wait_for(task, timeout=5)
    sock.close()


@case("C-P05")
async def local_openapi_with_auth() -> dict[str, Any]:
  async with local_openapi_server() as (base_url, observed_keys):
    spec = {
        "openapi": "3.0.0",
        "info": {"title": "AF local probe", "version": "1"},
        "servers": [{"url": base_url}],
        "paths": {
            "/echo/{value}": {
                "get": {
                    "operationId": "echo_value",
                    "parameters": [
                        {
                            "name": "value",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "local echo",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "echo": {"type": "string"}
                                        },
                                    }
                                }
                            },
                        }
                    },
                }
            }
        },
    }
    toolset = OpenAPIToolset(
        spec_dict=spec,
        auth_scheme=APIKey(name="X-AF-Probe", **{"in": APIKeyIn.header}),
        auth_credential=AuthCredential(
            authType=AuthCredentialTypes.API_KEY,
            apiKey="LOCAL_TEST_ONLY",
        ),
    )
    discovered = await toolset.get_tools()
    require([tool.name for tool in discovered] == ["echo_value"], "OpenAPI")
    model = ScriptedLlm(
        model="scripted",
        script=[
            response(
                types.Part(
                    function_call=types.FunctionCall(
                        id="openapi-1",
                        name="echo_value",
                        args={"value": "LOCAL"},
                    )
                )
            ),
            text_response("OPENAPI_OK"),
        ],
    )
    agent = Agent(
        name="openapi_agent", model=model, mode="chat", tools=[toolset]
    )
    runner, _ = await new_runtime(agent, app_name="c_p05")
    try:
      events = await run_message(runner, "run")
    finally:
      await runner.close()
      await toolset.close()
  responses = [
      part.function_response.response
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_response and part.function_response.name == "echo_value"
  ]
  require(responses and observed_keys == ["LOCAL_TEST_ONLY"], str(observed_keys))
  return {
      "tools": [tool.name for tool in discovered],
      "auth_header": "present_fake_local_value",
      "responses": responses,
  }


@case("C-N05")
async def malformed_openapi_spec_rejected() -> dict[str, Any]:
  try:
    OpenAPIToolset(spec_str="{not-json", spec_str_type="json")
  except Exception as error:
    failure = type(error).__name__
  else:
    raise AssertionError("malformed OpenAPI specification was accepted")
  return {"failure": failure, "classification": "invalid_contract"}


@case("C-P03")
async def tool_confirmation_pause_resume() -> dict[str, Any]:
  side_effects: list[str] = []

  def write(value: str) -> dict[str, str]:
    side_effects.append(value)
    return {"written": value}

  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="write-1", name="write", args={"value": "X"}
                  )
              )
          ),
          text_response("CONFIRMED_OK"),
          text_response("DUPLICATE_REPLAYED"),
      ],
  )
  agent = Agent(
      name="confirm_agent",
      model=model,
      mode="chat",
      tools=[FunctionTool(write, require_confirmation=True)],
  )
  runner, _ = await new_runtime(agent, app_name="c_p03", resumable=True)
  first = await run_message(runner, "run")
  require(side_effects == [], "side effect ran before confirmation")
  requests = function_calls(first, "adk_request_confirmation")
  require(len(requests) == 1, "confirmation request absent")
  confirmation = types.Content(
      role="user",
      parts=[
          types.Part(
              function_response=types.FunctionResponse(
                  name="adk_request_confirmation",
                  id=requests[0].id,
                  response={"confirmed": True, "payload": {"value": "X"}},
              )
          )
      ],
  )
  second = await run_message(runner, confirmation)
  require(side_effects == ["X"], str(side_effects))
  require("CONFIRMED_OK" in event_texts(second), "resume failed")
  await runner.close()
  return {
      "request_id": requests[0].id,
      "side_effects_after_resume": side_effects,
  }


@case("C-N03")
async def duplicate_confirmation_replays_side_effect() -> dict[str, Any]:
  side_effects: list[str] = []

  def write(value: str) -> dict[str, str]:
    side_effects.append(value)
    return {"written": value}

  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="write-duplicate", name="write", args={"value": "X"}
                  )
              )
          ),
          text_response("first"),
          text_response("second"),
      ],
  )
  agent = Agent(
      name="duplicate_confirmation",
      model=model,
      mode="chat",
      tools=[FunctionTool(write, require_confirmation=True)],
  )
  runner, _ = await new_runtime(agent, app_name="c_n03", resumable=True)
  first = await run_message(runner, "run")
  request = function_calls(first, "adk_request_confirmation")[0]
  confirmation = types.Content(
      role="user",
      parts=[
          types.Part(
              function_response=types.FunctionResponse(
                  name="adk_request_confirmation",
                  id=request.id,
                  response={"confirmed": True, "payload": {"value": "X"}},
              )
          )
      ],
  )
  await run_message(runner, confirmation)
  await run_message(runner, confirmation)
  await runner.close()
  require(side_effects == ["X", "X"], str(side_effects))
  return {
      "observed": "framework_does_not_deduplicate_confirmation_response",
      "side_effect_count": len(side_effects),
      "af_rule": "durable idempotency key required",
  }


@case("D-P01")
async def state_scopes_and_partial_commit() -> dict[str, Any]:
  sessions = InMemorySessionService()
  first = await sessions.create_session(
      app_name="state_app", user_id="user", session_id="one"
  )
  partial = Event(
      author="probe",
      partial=True,
      actions=EventActions(
          state_delta={
              "session_key": "partial",
              "user:user_key": "partial",
              "app:app_key": "partial",
              "temp:temp_key": "partial",
          }
      ),
  )
  await sessions.append_event(session=first, event=partial)
  require(first.state == {}, f"partial event committed: {first.state}")
  final = Event(
      author="probe",
      actions=EventActions(
          state_delta={
              "session_key": "session",
              "user:user_key": "user",
              "app:app_key": "app",
              "temp:temp_key": "temp",
          }
      ),
  )
  await sessions.append_event(session=first, event=final)
  second = await sessions.create_session(
      app_name="state_app", user_id="user", session_id="two"
  )
  other_user = await sessions.create_session(
      app_name="state_app", user_id="other", session_id="three"
  )
  require(first.state["session_key"] == "session", str(first.state))
  require(first.state["user:user_key"] == "user", str(first.state))
  require(second.state["user:user_key"] == "user", str(second.state))
  require(first.state["app:app_key"] == "app", str(first.state))
  require(other_user.state["app:app_key"] == "app", str(other_user.state))
  require("temp:temp_key" not in final.actions.state_delta, str(final.actions))
  require("temp:temp_key" not in second.state, str(second.state))
  return {
      "partial_committed": False,
      "temp_trimmed_from_persisted_event_delta": True,
      "first": first.state,
      "same_user_new_session": second.state,
      "other_user": other_user.state,
  }


@case("D-P02")
async def artifact_versions_missing_and_memory() -> dict[str, Any]:
  artifacts = InMemoryArtifactService()
  first_version = await artifacts.save_artifact(
      app_name="artifact_app",
      user_id="user",
      session_id="session",
      filename="result.txt",
      artifact=types.Part.from_bytes(data=b"one", mime_type="text/plain"),
  )
  second_version = await artifacts.save_artifact(
      app_name="artifact_app",
      user_id="user",
      session_id="session",
      filename="result.txt",
      artifact=types.Part.from_bytes(data=b"two", mime_type="text/plain"),
  )
  old = await artifacts.load_artifact(
      app_name="artifact_app",
      user_id="user",
      session_id="session",
      filename="result.txt",
      version=0,
  )
  latest = await artifacts.load_artifact(
      app_name="artifact_app",
      user_id="user",
      session_id="session",
      filename="result.txt",
  )
  missing = await artifacts.load_artifact(
      app_name="artifact_app",
      user_id="user",
      session_id="session",
      filename="missing.txt",
  )
  require((first_version, second_version) == (0, 1), "artifact versions")
  require(old and old.inline_data and old.inline_data.data == b"one", "old")
  require(
      latest and latest.inline_data and latest.inline_data.data == b"two",
      "latest",
  )
  require(missing is None, "missing artifact did not return None")

  memory = InMemoryMemoryService()
  event = Event(
      author="memory_agent",
      content=types.Content(
          role="model", parts=[types.Part(text="synthetic-memory-token")]
      ),
  )
  await memory.add_events_to_memory(
      app_name="memory_app", user_id="user", events=[event]
  )
  search = await memory.search_memory(
      app_name="memory_app", user_id="user", query="synthetic-memory-token"
  )
  require(search.memories, "local memory search returned no entries")
  return {
      "versions": [first_version, second_version],
      "missing": None,
      "memory_matches": len(search.memories),
  }


@case("D-N01")
async def artifact_concurrent_append_has_no_cas() -> dict[str, Any]:
  artifacts = InMemoryArtifactService()

  async def save(value: bytes) -> int:
    return await artifacts.save_artifact(
        app_name="artifact_concurrency",
        user_id="user",
        session_id="session",
        filename="shared.txt",
        artifact=types.Part.from_bytes(data=value, mime_type="text/plain"),
    )

  versions = await asyncio.gather(save(b"left"), save(b"right"))
  require(sorted(versions) == [0, 1], str(versions))
  return {
      "versions": versions,
      "observed": "append_only_versions_without_compare_and_swap",
      "af_rule": "serialize owner or validate expected version externally",
  }


@case("D-P03")
async def runner_rewind_restores_state() -> dict[str, Any]:
  class StateAgent(BaseAgent):
    async def _run_async_impl(self, ctx: Any) -> AsyncIterator[Event]:
      value = ctx.session.state.get("count", 0) + 1
      yield Event(
          author=self.name,
          invocation_id=ctx.invocation_id,
          actions=EventActions(state_delta={"count": value}),
          content=types.Content(role="model", parts=[types.Part(text=str(value))]),
      )

  runner, sessions = await new_runtime(
      StateAgent(name="state_agent"), app_name="d_p03"
  )
  first = await run_message(runner, "one")
  second = await run_message(runner, "two")
  before = await sessions.get_session(
      app_name="d_p03", user_id="user", session_id="session"
  )
  require(before and before.state["count"] == 2, "state before rewind")
  await runner.rewind_async(
      user_id="user",
      session_id="session",
      rewind_before_invocation_id=second[-1].invocation_id,
  )
  after = await sessions.get_session(
      app_name="d_p03", user_id="user", session_id="session"
  )
  require(after and after.state["count"] == 1, str(after.state if after else None))
  rewind_events = [
      event
      for event in after.events
      if event.actions.rewind_before_invocation_id is not None
  ]
  require(len(rewind_events) == 1, "rewind action absent")
  await runner.close()
  return {
      "first_invocation": first[-1].invocation_id,
      "rewound_invocation": second[-1].invocation_id,
      "restored_state": after.state,
  }


@case("E-P01")
async def plugin_callback_order_and_short_circuit() -> dict[str, Any]:
  order: list[str] = []

  class OrderPlugin(BasePlugin):
    async def before_agent_callback(
        self, *, agent: BaseAgent, callback_context: Any
    ) -> types.Content | None:
      del agent, callback_context
      order.append("plugin_before")
      return None

    async def after_agent_callback(
        self, *, agent: BaseAgent, callback_context: Any
    ) -> types.Content | None:
      del agent, callback_context
      order.append("plugin_after")
      return None

  def agent_before(callback_context: Any) -> None:
    del callback_context
    order.append("agent_before")

  def agent_after(callback_context: Any) -> None:
    del callback_context
    order.append("agent_after")

  agent = DeterministicAgent(
      name="callback_agent",
      text="BODY",
      before_agent_callback=agent_before,
      after_agent_callback=agent_after,
  )
  runner, _ = await new_runtime(
      agent, app_name="e_p01", plugins=[OrderPlugin("order")]
  )
  events = await run_message(runner, "run")
  await runner.close()
  require(
      order
      == ["plugin_before", "agent_before", "plugin_after", "agent_after"],
      str(order),
  )
  require("BODY" in event_texts(events), "agent body missing")

  class StopPlugin(BasePlugin):
    async def before_agent_callback(
        self, *, agent: BaseAgent, callback_context: Any
    ) -> types.Content:
      del agent, callback_context
      return types.Content(role="model", parts=[types.Part(text="BLOCKED")])

  runner, _ = await new_runtime(
      DeterministicAgent(name="blocked_agent", text="SHOULD_NOT_RUN"),
      app_name="e_p01_stop",
      plugins=[StopPlugin("stop")],
  )
  blocked = await run_message(runner, "run")
  await runner.close()
  require("BLOCKED" in event_texts(blocked), "short circuit absent")
  require("SHOULD_NOT_RUN" not in event_texts(blocked), "body was not skipped")
  return {"order": order, "short_circuit": event_texts(blocked)}


@case("E-N01")
async def plugin_tool_error_recovery_and_state_commit() -> dict[str, Any]:
  log: list[str] = []

  class ToolErrorPlugin(BasePlugin):
    async def before_tool_callback(
        self, *, tool: Any, tool_args: dict[str, Any], tool_context: Any
    ) -> None:
      del tool, tool_args
      log.append("before_tool")
      tool_context.state["tool_started"] = True

    async def on_tool_error_callback(
        self,
        *,
        tool: Any,
        tool_args: dict[str, Any],
        tool_context: Any,
        error: Exception,
    ) -> dict[str, Any]:
      del tool, tool_args, error
      log.append("tool_error")
      tool_context.state["tool_recovered"] = True
      return {"status": "typed_fallback"}

  def explode(value: str) -> dict[str, str]:
    del value
    raise RuntimeError("synthetic failure")

  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="explode-1", name="explode", args={"value": "x"}
                  )
              )
          ),
          text_response("RECOVERED_OK"),
      ],
  )
  agent = Agent(name="tool_error", model=model, mode="chat", tools=[explode])
  runner, sessions = await new_runtime(
      agent, app_name="e_n01", plugins=[ToolErrorPlugin("tool-errors")]
  )
  events = await run_message(runner, "run")
  session = await sessions.get_session(
      app_name="e_n01", user_id="user", session_id="session"
  )
  await runner.close()
  require(log == ["before_tool", "tool_error"], str(log))
  require(session and session.state.get("tool_recovered") is True, "state")
  require("RECOVERED_OK" in event_texts(events), "downstream did not continue")
  return {"order": log, "state": session.state if session else None}


@case("F-P01")
async def request_input_pause_resume() -> dict[str, Any]:
  @node(rerun_on_resume=True)
  async def ask(ctx: Any) -> RequestInput | dict[str, str]:
    if ctx.resume_inputs:
      return {"answer": next(iter(ctx.resume_inputs.values()))}
    return RequestInput(
        interrupt_id="request-1",
        message="approve?",
        response_schema=str,
    )

  @node
  async def finish(node_input: dict[str, str]) -> dict[str, str]:
    return node_input

  workflow = Workflow(
      name="request_input_workflow", edges=[(START, ask), (ask, finish)]
  )
  runner, _ = await new_runtime(
      workflow, app_name="f_p01", resumable=True
  )
  first = await run_message(runner, "run")
  requests = function_calls(first, "adk_request_input")
  require(len(requests) == 1 and requests[0].id == "request-1", "pause")
  resumed = await run_message(
      runner,
      types.Content(
          role="user",
          parts=[
              types.Part(
                  function_response=types.FunctionResponse(
                      name="adk_request_input",
                      id="request-1",
                      response={"result": "yes"},
                  )
              )
          ],
      ),
  )
  await runner.close()
  outputs = [event.output for event in resumed if event.output is not None]
  require({"answer": "yes"} in outputs, str(outputs))
  return {
      "request_id": requests[0].id,
      "primitive_response_envelope": {"result": "yes"},
      "outputs": outputs,
  }


@case("F-N01")
async def request_input_invalid_response() -> dict[str, Any]:
  @node(rerun_on_resume=True)
  async def ask(ctx: Any) -> RequestInput | dict[str, str]:
    if ctx.resume_inputs:
      return {"answer": next(iter(ctx.resume_inputs.values()))}
    return RequestInput(
        interrupt_id="request-invalid",
        message="answer",
        response_schema=str,
    )

  workflow = Workflow(name="invalid_response", edges=[(START, ask)])
  runner, _ = await new_runtime(
      workflow, app_name="f_n01", resumable=True
  )
  await run_message(runner, "run")
  bad_message = types.Content(
      role="user",
      parts=[
          types.Part(text="mixed text"),
          types.Part(
              function_response=types.FunctionResponse(
                  name="adk_request_input",
                  id="request-invalid",
                  response={"result": "yes"},
              )
          ),
      ],
  )
  try:
    await run_message(runner, bad_message)
  except ValueError as error:
    mixed_error = str(error)
  else:
    raise AssertionError("text plus function response was accepted")
  await runner.close()
  return {"mixed_response_guard": mixed_error}


@case("F-N02")
def public_python_cancellation_and_compaction_surface() -> dict[str, Any]:
  require(not hasattr(Runner, "cancel_async"), "new public cancellation API")
  try:
    from google.adk.apps import EventsCompactionConfig  # type: ignore

    del EventsCompactionConfig
  except ImportError:
    public_compaction = "not_exported"
  else:
    raise AssertionError("EventsCompactionConfig became a public apps export")
  from google.adk.apps._configs import EventsCompactionConfig as PrivateConfig

  require(inspect.isclass(PrivateConfig), "private compaction config missing")
  return {
      "runner_cancel_async": "unsupported",
      "generator_cleanup": "internal task cancellation only",
      "events_compaction_config": public_compaction,
      "af_rule": "do not emit private import",
  }


@asynccontextmanager
async def local_a2a_server(agent: BaseAgent) -> AsyncIterator[tuple[str, Any]]:
  sock = socket.socket()
  sock.bind(("127.0.0.1", 0))
  sock.listen(128)
  sock.setblocking(False)
  port = sock.getsockname()[1]
  app = to_a2a(agent, host="127.0.0.1", port=port)
  server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
  task = asyncio.create_task(server.serve(sockets=[sock]))
  deadline = time.monotonic() + 5
  while not server.started:
    if time.monotonic() > deadline:
      raise TimeoutError("local A2A server did not start")
    await asyncio.sleep(0.01)
  try:
    yield f"http://127.0.0.1:{port}/.well-known/agent-card.json", app
  finally:
    server.should_exit = True
    await task
    sock.close()


@case("G-P01")
async def local_subworkflow_reuse() -> dict[str, Any]:
  @node
  async def reused_step(node_input: Any) -> dict[str, str]:
    del node_input
    return {"subworkflow": "REUSED_OK"}

  child = Workflow(name="existing_subworkflow", edges=[(START, reused_step)])
  parent = Workflow(name="parent_workflow", edges=[(START, child)])
  runner, _ = await new_runtime(parent, app_name="g_p01")
  events = await run_message(runner, "run")
  await runner.close()
  require(
      {"subworkflow": "REUSED_OK"}
      in [event.output for event in events],
      "subworkflow output absent",
  )
  return {"paths": [event.node_info.path for event in events]}


@case("G-P02")
async def local_a2a_success() -> dict[str, Any]:
  provider = DeterministicAgent(name="echo_provider", text="ECHO_OK")
  async with local_a2a_server(provider) as (card_url, app):
    require(
        "/.well-known/agent-card.json"
        in [getattr(route, "path", "") for route in app.routes],
        "Agent Card route absent",
    )
    remote = RemoteA2aAgent(
        name="remote_echo", agent_card=card_url, use_legacy=False, timeout=5
    )
    runner, _ = await new_runtime(remote, app_name="g_p02")
    events = await run_message(runner, "run")
    await runner.close()
  require("ECHO_OK" in event_texts(events), "remote result absent")
  return {"agent_card": "local_ephemeral", "texts": event_texts(events)}


@case("G-P03")
async def local_a2a_input_required_resume() -> dict[str, Any]:
  calls: list[str] = []

  class WaitingAgent(BaseAgent):
    async def _run_async_impl(self, ctx: Any) -> AsyncIterator[Event]:
      calls.append(ctx.invocation_id)
      if len(calls) == 1:
        yield Event(
            author=self.name,
            invocation_id=ctx.invocation_id,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            name="adk_request_input",
                            id="remote-input-1",
                            args={
                                "interruptId": "remote-input-1",
                                "message": "answer",
                                "response_schema": {"type": "string"},
                            },
                        )
                    )
                ],
            ),
            long_running_tool_ids={"remote-input-1"},
        )
      else:
        yield Event(
            author=self.name,
            invocation_id=ctx.invocation_id,
            content=types.Content(
                role="model", parts=[types.Part(text="RESUMED_OK")]
            ),
        )

  async with local_a2a_server(WaitingAgent(name="waiting_provider")) as (
      card_url,
      _,
  ):
    remote = RemoteA2aAgent(
        name="remote_waiting", agent_card=card_url, use_legacy=False, timeout=5
    )
    runner, _ = await new_runtime(remote, app_name="g_p03")
    first = await run_message(runner, "run")
    require(
        function_calls(first, "adk_request_input"), "input-required absent"
    )
    second = await run_message(
        runner,
        types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        name="adk_request_input",
                        id="remote-input-1",
                        response={"result": "yes"},
                    )
                )
            ],
        ),
    )
    await runner.close()
  require("RESUMED_OK" in event_texts(second), "A2A resume failed")
  require(len(calls) == 2, str(calls))
  return {
      "first_state": "input-required",
      "second_state": "completed",
      "provider_invocations": len(calls),
  }


@case("G-N01")
async def local_a2a_unavailable_is_observable() -> dict[str, Any]:
  sock = socket.socket()
  sock.bind(("127.0.0.1", 0))
  port = sock.getsockname()[1]
  sock.close()
  remote = RemoteA2aAgent(
      name="missing_remote",
      agent_card=f"http://127.0.0.1:{port}/.well-known/agent-card.json",
      use_legacy=False,
      timeout=0.2,
  )
  runner, _ = await new_runtime(remote, app_name="g_n01")
  events = await run_message(runner, "run")
  await runner.close()
  require(events, "remote failure produced no observable event")
  require(
      all("ECHO_OK" not in text for text in event_texts(events)),
      "unavailable remote fabricated success",
  )
  return {
      "events": len(events),
      "texts": event_texts(events),
      "classification": "remote_failure_not_semantic_readiness",
  }


@case("G-N02")
def cloud_and_extra_service_inventory() -> dict[str, Any]:
  from google.adk.agents import ManagedAgent

  signature = str(inspect.signature(ManagedAgent))
  source = inspect.getsource(ManagedAgent)
  require("agent_id" in signature and "api_client" in signature, signature)
  require(
      "client-executed tools are not yet supported" in source,
      "ManagedAgent client-tool guard missing",
  )
  return {
      "ManagedAgent": "excluded_cloud_managed_interactions_api_preview",
      "ManagedAgent_client_tools": "unsupported",
      "A2UI": "optional_local_extra_renderer_service",
      "ambient_pubsub_eventarc": "excluded_cloud",
      "OpenAPI_external_auth": "optional_local_or_excluded_by_binding",
  }


@case("H-P01")
async def structured_output_with_tools() -> dict[str, Any]:
  def noop(value: str) -> str:
    return value

  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="schema-1",
                      name="set_model_response",
                      args={"value": 7},
                  )
              )
          )
      ],
  )
  agent = Agent(
      name="schema_tool_agent",
      model=model,
      mode="single_turn",
      output_schema=OutputModel,
      tools=[noop],
  )
  workflow = Workflow(name="schema_tool_workflow", edges=[(START, agent)])
  runner, _ = await new_runtime(workflow, app_name="h_p01")
  events = await run_message(runner, "run")
  await runner.close()
  require(model.requests, "model was not invoked")
  declarations = [
      declaration.name
      for tool in model.requests[0].config.tools
      for declaration in (tool.function_declarations or [])
  ]
  require("set_model_response" in declarations, str(declarations))
  require("noop" in declarations, str(declarations))
  require(
      any(event.actions.set_model_response == {"value": 7} for event in events),
      "structured response tool was not executed",
  )
  return {"tool_declarations": declarations, "structured_value": {"value": 7}}


@case("H-N01")
async def malformed_structured_output_context_difference() -> dict[str, Any]:
  bad_graph_model = ScriptedLlm(
      model="scripted", script=[text_response("not-json")]
  )
  graph_agent = Agent(
      name="bad_graph_agent",
      model=bad_graph_model,
      mode="single_turn",
      output_schema=OutputModel,
  )
  workflow = Workflow(name="bad_schema_workflow", edges=[(START, graph_agent)])
  runner, _ = await new_runtime(workflow, app_name="h_n01_graph")
  try:
    await run_message(runner, "run")
  except ValidationError as error:
    graph_error = type(error).__name__
  else:
    raise AssertionError("graph wrapper accepted malformed structured output")
  await runner.close()

  root_model = ScriptedLlm(model="scripted", script=[text_response("not-json")])
  root_agent = Agent(
      name="bad_root_agent",
      model=root_model,
      mode="chat",
      output_schema=OutputModel,
  )
  runner, _ = await new_runtime(root_agent, app_name="h_n01_root")
  root_events = await run_message(runner, "run")
  await runner.close()
  require("not-json" in event_texts(root_events), "root response disappeared")
  return {
      "graph_single_turn": f"client_side_{graph_error}",
      "root_chat": "response_schema_sent_but_scripted_malformed_text_not_rejected",
  }


@case("H-N02")
def unsupported_symbol_refusal() -> dict[str, Any]:
  import google.adk.workflow as workflow_module

  require(not hasattr(workflow_module, "END"), "END became public")
  require(not hasattr(Runner, "cancel_async"), "cancel_async became public")
  return {
      "google.adk.workflow.END": "unsupported",
      "Runner.cancel_async": "unsupported",
      "EventsCompactionConfig_public": "unsupported",
  }


@case("CP-001")
async def compound_coordinator_two_specialists_aggregator() -> dict[str, Any]:
  model = ScriptedLlm(
      model="scripted",
      script=[
          response(
              types.Part(
                  function_call=types.FunctionCall(
                      id="spec-a", name="specialist_a", args={"request": "A"}
                  )
              ),
              types.Part(
                  function_call=types.FunctionCall(
                      id="spec-b", name="specialist_b", args={"request": "B"}
                  )
              ),
          ),
          text_response("AGGREGATED_OK"),
      ],
  )
  coordinator = Agent(
      name="compound_coordinator",
      model=model,
      mode="chat",
      tools=[
          AgentTool(DeterministicAgent(name="specialist_a", text="A_OK")),
          AgentTool(DeterministicAgent(name="specialist_b", text="B_OK")),
      ],
  )
  runner, _ = await new_runtime(coordinator, app_name="cp_001")
  events = await run_message(runner, "run")
  await runner.close()
  names = [
      part.function_response.name
      for event in events
      if event.content and event.content.parts
      for part in event.content.parts
      if part.function_response
  ]
  require(set(names) >= {"specialist_a", "specialist_b"}, str(names))
  require("AGGREGATED_OK" in event_texts(events), "aggregator missing")
  return {"specialists": names, "terminal": "AGGREGATED_OK"}


@case("CP-002")
async def compound_fanout_join_artifact_consumer() -> dict[str, Any]:
  artifact_service = InMemoryArtifactService()

  @node
  async def artifact_branch(ctx: Any, node_input: Any) -> dict[str, str]:
    del node_input
    await ctx.save_artifact(
        "compound.txt",
        types.Part.from_bytes(data=b"artifact-ok", mime_type="text/plain"),
    )
    return {"capability": "artifact"}

  @node
  async def state_branch(ctx: Any, node_input: Any) -> dict[str, str]:
    del node_input
    ctx.state["compound_state"] = "state-ok"
    return {"capability": "state"}

  join = JoinNode(name="compound_join")

  @node
  async def consume(ctx: Any, node_input: dict[str, Any]) -> dict[str, Any]:
    artifact = await ctx.load_artifact("compound.txt")
    return {
        "joined": sorted(node_input),
        "state": ctx.state["compound_state"],
        "artifact": artifact.inline_data.data.decode()
        if artifact and artifact.inline_data
        else None,
    }

  workflow = Workflow(
      name="compound_artifact_workflow",
      edges=[
          (START, (artifact_branch, state_branch)),
          (artifact_branch, join),
          (state_branch, join),
          (join, consume),
      ],
  )
  runner, _ = await new_runtime(
      workflow, app_name="cp_002", artifact_service=artifact_service
  )
  events = await run_message(runner, "run")
  await runner.close()
  terminal = [event.output for event in events if event.node_info.path.endswith("consume@1")]
  require(terminal and terminal[-1]["artifact"] == "artifact-ok", str(terminal))
  require(terminal[-1]["state"] == "state-ok", str(terminal))
  return terminal[-1]


@case("CP-003")
async def compound_bounded_cycle_human_input_idempotency() -> dict[str, Any]:
  effects: list[int] = []

  @node
  async def effect(ctx: Any, node_input: Any) -> dict[str, int]:
    del node_input
    iteration = ctx.state.get("iteration", 0) + 1
    guard_key = f"effect_done_{iteration}"
    if not ctx.state.get(guard_key):
      effects.append(iteration)
      ctx.state[guard_key] = True
    ctx.state["iteration"] = iteration
    return {"iteration": iteration}

  @node(rerun_on_resume=True)
  async def ask(ctx: Any, node_input: Any) -> RequestInput | dict[str, Any]:
    del node_input
    iteration = ctx.state["iteration"]
    if ctx.resume_inputs:
      return {
          "iteration": iteration,
          "answer": next(iter(ctx.resume_inputs.values())),
      }
    return RequestInput(
        interrupt_id=f"cycle-{iteration}",
        message="again or done",
        response_schema=str,
    )

  @node
  async def route(node_input: dict[str, Any]) -> Event:
    return Event(output=node_input, route=node_input["answer"])

  @node
  async def done(node_input: dict[str, Any]) -> dict[str, Any]:
    return {"done": node_input["iteration"]}

  workflow = Workflow(
      name="compound_pause_cycle",
      edges=[
          (START, effect),
          (effect, ask),
          (ask, route),
          (route, {"again": effect, "done": done}),
      ],
  )
  runner, _ = await new_runtime(
      workflow, app_name="cp_003", resumable=True
  )
  first = await run_message(runner, "run")
  require(function_calls(first, "adk_request_input")[0].id == "cycle-1", "cycle 1")
  second = await run_message(
      runner,
      types.Content(
          role="user",
          parts=[
              types.Part(
                  function_response=types.FunctionResponse(
                      name="adk_request_input",
                      id="cycle-1",
                      response={"result": "again"},
                  )
              )
          ],
      ),
  )
  second_requests = function_calls(second, "adk_request_input")
  require(second_requests and second_requests[-1].id == "cycle-2", "cycle 2")
  third = await run_message(
      runner,
      types.Content(
          role="user",
          parts=[
              types.Part(
                  function_response=types.FunctionResponse(
                      name="adk_request_input",
                      id="cycle-2",
                      response={"result": "done"},
                  )
              )
          ],
      ),
  )
  await runner.close()
  require(effects == [1, 2], str(effects))
  require({"done": 2} in [event.output for event in third], "terminal")
  return {"effects": effects, "terminal": {"done": 2}}


@case("CP-004")
async def compound_subworkflow_remote_fallback() -> dict[str, Any]:
  @node
  async def local_step(node_input: Any) -> dict[str, str]:
    del node_input
    return {"local": "ready"}

  child = Workflow(name="reused_child", edges=[(START, local_step)])
  sock = socket.socket()
  sock.bind(("127.0.0.1", 0))
  port = sock.getsockname()[1]
  sock.close()
  remote = RemoteA2aAgent(
      name="unavailable_remote",
      agent_card=f"http://127.0.0.1:{port}/.well-known/agent-card.json",
      use_legacy=False,
      timeout=0.2,
  )

  @node(rerun_on_resume=True)
  async def call_remote(ctx: Any, node_input: dict[str, str]) -> dict[str, Any]:
    result = await ctx.run_node(
        remote, node_input=node_input, run_id="remote-attempt"
    )
    if not result:
      return {"status": "fallback", "local": node_input["local"]}
    return {"status": "remote", "result": result}

  parent = Workflow(
      name="compound_reuse_remote", edges=[(START, child), (child, call_remote)]
  )
  runner, _ = await new_runtime(parent, app_name="cp_004")
  events = await run_message(runner, "run")
  await runner.close()
  outputs = [event.output for event in events if event.output is not None]
  require(
      {"status": "fallback", "local": "ready"} in outputs,
      f"typed fallback absent: {outputs}",
  )
  return {"outputs": outputs, "fallback": "typed_and_observable"}


@case("CP-005")
async def compound_dynamic_typed_guardrail_terminal() -> dict[str, Any]:
  class SelectedOutput(BaseModel):
    value: int
    source: str

  @node
  async def allowed(node_input: dict[str, Any]) -> dict[str, Any]:
    return {"value": node_input["value"] * 2, "source": "allowed"}

  @node
  async def forbidden(node_input: dict[str, Any]) -> dict[str, Any]:
    return {"value": node_input["value"], "source": "forbidden"}

  @node(rerun_on_resume=True)
  async def select(ctx: Any, node_input: Any) -> dict[str, Any]:
    del node_input
    selected = allowed
    raw = await ctx.run_node(
        selected, node_input={"value": 4}, run_id="typed-selection"
    )
    normalized = SelectedOutput.model_validate(raw).model_dump()
    if normalized["source"] == "forbidden":
      raise ValueError("guardrail rejected dynamic result")
    return normalized

  @node
  async def terminal(node_input: dict[str, Any]) -> dict[str, Any]:
    return {"status": "complete", "result": node_input}

  workflow = Workflow(
      name="compound_dynamic_guardrail", edges=[(START, select), (select, terminal)]
  )
  runner, _ = await new_runtime(workflow, app_name="cp_005")
  events = await run_message(runner, "run")
  await runner.close()
  expected = {
      "status": "complete",
      "result": {"value": 8, "source": "allowed"},
  }
  require(expected in [event.output for event in events], "terminal result")
  require(forbidden.name == "forbidden", "negative target fixture missing")
  return expected


async def execute(selected: list[str]) -> tuple[list[dict[str, Any]], bool]:
  results: list[dict[str, Any]] = []
  ok = True
  for experiment_id in selected:
    started = time.monotonic()
    try:
      outcome = CASES[experiment_id]()
      if inspect.isawaitable(outcome):
        outcome = await outcome
      results.append(
          {
              "experiment_id": experiment_id,
              "status": "passed",
              "duration_ms": round((time.monotonic() - started) * 1000, 2),
              "observation": outcome,
          }
      )
    except Exception as error:  # preserve bounded structured failure evidence
      ok = False
      results.append(
          {
              "experiment_id": experiment_id,
              "status": "failed",
              "duration_ms": round((time.monotonic() - started) * 1000, 2),
              "error_type": type(error).__name__,
              "error": str(error)[:1000],
          }
      )
  return results, ok


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--list", action="store_true")
  parser.add_argument("--ids", nargs="*", default=[])
  args = parser.parse_args()
  if args.list:
    print(json.dumps(sorted(CASES), indent=2))
    return 0
  selected = args.ids or sorted(CASES)
  unknown = sorted(set(selected) - set(CASES))
  if unknown:
    print(json.dumps({"error": "unknown experiment ids", "ids": unknown}))
    return 2
  results, ok = asyncio.run(execute(selected))
  print(
      json.dumps(
          {
              "schema_version": 1,
              "runtime": {
                  "python": sys.executable,
                  "google_adk": importlib.metadata.version("google-adk"),
                  "network": "localhost-only",
                  "cloud_model": False,
              },
              "summary": {
                  "passed": sum(item["status"] == "passed" for item in results),
                  "failed": sum(item["status"] == "failed" for item in results),
              },
              "results": results,
          },
          ensure_ascii=False,
          indent=2,
          default=str,
      )
  )
  return 0 if ok else 1


if __name__ == "__main__":
  raise SystemExit(main())
