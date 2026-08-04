import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ClientStateError,
  MaterializationError,
  ProtocolError,
  TransportClosedError,
  createAppServerClient,
  type AppServerClient,
  type AppServerEvent,
} from "../src/index.js";
import { FakeTransport } from "./fake-transport.js";

const identity = {
  userAgent: "codex_cli_rs/0.146.0",
  codexHome: "/tmp/codex-home",
  platformFamily: "unix",
  platformOs: "linux",
};

async function initialized(prefix = "test"): Promise<{
  client: AppServerClient;
  transport: FakeTransport;
}> {
  const transport = new FakeTransport();
  const client = createAppServerClient({
    transport,
    requestIdPrefix: prefix,
    clientInfo: { name: "companion_test", title: "Companion Test", version: "0.1.0" },
  });
  const ready = client.initialize();
  const request = await transport.waitForSent(0);
  transport.receive({ id: request.id, result: identity });
  assert.deepEqual(await ready, identity);
  assert.deepEqual(await transport.waitForSent(1), { method: "initialized", params: {} });
  return { client, transport };
}

function terminal(
  threadId: string,
  turnId: string,
  status: "completed" | "interrupted" | "failed",
  errorMessage: string | null = status === "failed" ? "probe failed" : null,
) {
  return {
    method: "turn/completed",
    params: {
      threadId,
      turn: {
        id: turnId,
        status,
        error: errorMessage === null ? null : { message: errorMessage },
      },
    },
  };
}

async function nextEvent(iterator: AsyncIterator<AppServerEvent>): Promise<AppServerEvent> {
  const result = await iterator.next();
  assert.equal(result.done, false);
  return result.value;
}

function within<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not settle`)), 250);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

describe("AppServerClient", () => {
  it("performs initialize exactly once and sends only non-experimental capabilities", async () => {
    const transport = new FakeTransport();
    const client = createAppServerClient({
      transport,
      requestIdPrefix: "init",
      clientInfo: { name: "companion", version: "1.0.0" },
    });

    const first = client.initialize();
    const second = client.initialize();
    assert.strictEqual(first, second);
    const request = await transport.waitForSent(0);
    assert.deepEqual(request, {
      method: "initialize",
      id: "init:1",
      params: {
        clientInfo: { name: "companion", title: null, version: "1.0.0" },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
    });
    transport.receive({ id: "init:1", result: identity });
    await first;
    assert.equal(client.state, "ready");
    assert.equal(transport.sent.length, 2);
    await client.close();
  });

  it("correlates out-of-order responses by request ID", async () => {
    const { client, transport } = await initialized("order");
    const first = client.startThread({ cwd: "/tmp/first" });
    const second = client.startThread({ cwd: "/tmp/second" });
    const firstRequest = await transport.waitForSent(2);
    const secondRequest = await transport.waitForSent(3);

    transport.receive({ id: secondRequest.id, result: { thread: { id: "thread-2" } } });
    transport.receive({ id: firstRequest.id, result: { thread: { id: "thread-1" } } });

    assert.deepEqual(await first, { threadId: "thread-1", materialized: false });
    assert.deepEqual(await second, { threadId: "thread-2", materialized: false });
    await client.close();
  });

  it("preserves a newer active turn across a thread/start response", async () => {
    const { client, transport } = await initialized("thread-start-race");
    const started = client.startThread();
    const request = await transport.waitForSent(2);

    transport.receive({
      method: "turn/started",
      params: {
        threadId: "thread-start-race",
        turn: { id: "turn-start-race", status: "inProgress" },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    transport.receive({
      id: request.id,
      result: { thread: { id: "thread-start-race" } },
    });

    assert.deepEqual(await started, {
      threadId: "thread-start-race",
      materialized: false,
    });
    assert.deepEqual(client.getThreadState("thread-start-race"), {
      type: "active",
      threadId: "thread-start-race",
      turnId: "turn-start-race",
      owner: "external",
      materialized: false,
    });

    const interrupted = client.interruptTurn("thread-start-race", "turn-start-race");
    const interruptRequest = await transport.waitForSent(3);
    assert.deepEqual(interruptRequest.params, {
      threadId: "thread-start-race",
      turnId: "turn-start-race",
    });
    transport.receive({ id: interruptRequest.id, result: {} });
    transport.receive(terminal("thread-start-race", "turn-start-race", "interrupted"));
    assert.equal((await interrupted).status, "interrupted");
    await client.close();
  });

  it("preserves and materializes a newer active turn across a thread/resume response", async () => {
    const { client, transport } = await initialized("thread-resume-race");
    const resumed = client.resumeThread("thread-resume-race");
    const request = await transport.waitForSent(2);

    transport.receive({
      method: "turn/started",
      params: {
        threadId: "thread-resume-race",
        turn: { id: "turn-resume-race", status: "inProgress" },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    transport.receive({
      id: request.id,
      result: { thread: { id: "thread-resume-race" } },
    });

    assert.deepEqual(await resumed, {
      threadId: "thread-resume-race",
      materialized: true,
    });
    assert.deepEqual(client.getThreadState("thread-resume-race"), {
      type: "active",
      threadId: "thread-resume-race",
      turnId: "turn-resume-race",
      owner: "external",
      materialized: true,
    });

    await assert.rejects(
      client.steerTurn({
        threadId: "thread-resume-race",
        expectedTurnId: "stale-turn",
        input: [{ type: "text", text: "stale" }],
      }),
      ClientStateError,
    );
    const steered = client.steerTurn({
      threadId: "thread-resume-race",
      expectedTurnId: "turn-resume-race",
      input: [{ type: "text", text: "continue" }],
    });
    const steerRequest = await transport.waitForSent(3);
    assert.deepEqual(steerRequest.params, {
      threadId: "thread-resume-race",
      expectedTurnId: "turn-resume-race",
      input: [{ type: "text", text: "continue", text_elements: [] }],
    });
    transport.receive({ id: steerRequest.id, result: { turnId: "turn-resume-race" } });
    assert.deepEqual(await steered, { turnId: "turn-resume-race" });
    await client.close();
  });

  it("materializes only after a completed first turn and handles event-before-response", async () => {
    const { client, transport } = await initialized("materialize");
    const result = client.materialize({
      cwd: "/workspace/app",
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      firstInput: [{ type: "text", text: "Create the first rollout." }],
    });

    const threadRequest = await transport.waitForSent(2);
    assert.deepEqual(threadRequest.params, {
      ephemeral: false,
      cwd: "/workspace/app",
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    });
    transport.receive({ id: threadRequest.id, result: { thread: { id: "thread-m" } } });

    const turnRequest = await transport.waitForSent(3);
    assert.deepEqual(turnRequest.params, {
      threadId: "thread-m",
      input: [{ type: "text", text: "Create the first rollout.", text_elements: [] }],
    });
    transport.receive({
      method: "turn/started",
      params: { threadId: "thread-m", turn: { id: "turn-m", status: "inProgress" } },
    });
    transport.receive(terminal("thread-m", "turn-m", "completed"));
    transport.receive({
      id: turnRequest.id,
      result: { turn: { id: "turn-m", status: "inProgress" } },
    });

    assert.deepEqual(await result, {
      threadId: "thread-m",
      materialized: true,
      firstTurn: {
        threadId: "thread-m",
        turnId: "turn-m",
        status: "completed",
        error: null,
      },
    });
    assert.deepEqual(client.getThreadState("thread-m"), {
      type: "idle",
      threadId: "thread-m",
      materialized: true,
    });
    await client.close();
  });

  it("does not erase a newer active turn when materialization resumes", async () => {
    const { client, transport } = await initialized("materialize-race");
    const result = client.materialize({ firstInput: [{ type: "text", text: "seed" }] });
    const threadRequest = await transport.waitForSent(2);
    transport.receive({
      id: threadRequest.id,
      result: { thread: { id: "thread-materialize-race" } },
    });

    const turnRequest = await transport.waitForSent(3);
    transport.receive(terminal("thread-materialize-race", "turn-first", "completed"));
    transport.receive({
      id: turnRequest.id,
      result: { turn: { id: "turn-first", status: "inProgress" } },
    });
    transport.receive({
      method: "turn/started",
      params: {
        threadId: "thread-materialize-race",
        turn: { id: "turn-newer", status: "inProgress" },
      },
    });

    assert.equal((await result).firstTurn.turnId, "turn-first");
    assert.deepEqual(client.getThreadState("thread-materialize-race"), {
      type: "active",
      threadId: "thread-materialize-race",
      turnId: "turn-newer",
      owner: "external",
      materialized: true,
    });
    await client.close();
  });

  it("rejects a second turn/start for the same thread while the first request is in flight", async () => {
    const { client, transport } = await initialized("concurrent-start");
    const first = client.startTurn({
      threadId: "thread-one-at-a-time",
      input: [{ type: "text", text: "first" }],
    });
    const firstRequest = await transport.waitForSent(2);

    await assert.rejects(
      client.startTurn({
        threadId: "thread-one-at-a-time",
        input: [{ type: "text", text: "second" }],
      }),
      (error: unknown) => {
        assert.ok(error instanceof ClientStateError);
        assert.match(error.message, /turn\/start request in flight/);
        return true;
      },
    );
    assert.equal(transport.sent.length, 3, "the rejected start must not send a request");

    transport.receive({
      id: firstRequest.id,
      result: { turn: { id: "turn-first", status: "inProgress" } },
    });
    const run = await first;
    transport.receive(terminal("thread-one-at-a-time", "turn-first", "completed"));
    assert.equal((await run.completion).status, "completed");
    await client.close();
  });

  for (const conflictingMethod of ["turn/started", "turn/completed"] as const) {
    it(`fails closed when ${conflictingMethod} conflicts with another active turn`, async () => {
      const { client, transport } = await initialized(`conflict-${conflictingMethod}`);
      const iterator = client.events()[Symbol.asyncIterator]();
      transport.receive({
        method: "turn/started",
        params: { threadId: "thread-conflict", turn: { id: "turn-active", status: "inProgress" } },
      });
      assert.equal((await nextEvent(iterator)).type, "turn-started");

      transport.receive(
        conflictingMethod === "turn/started"
          ? {
              method: "turn/started",
              params: {
                threadId: "thread-conflict",
                turn: { id: "turn-late", status: "inProgress" },
              },
            }
          : terminal("thread-conflict", "turn-late", "completed"),
      );

      const failure = await nextEvent(iterator);
      assert.equal(failure.type, "protocol-error");
      assert.match(failure.type === "protocol-error" ? failure.message : "", /conflicts with active turn/);
      assert.equal(client.state, "failed");
      assert.deepEqual(client.getThreadState("thread-conflict"), {
        type: "active",
        threadId: "thread-conflict",
        turnId: "turn-active",
        owner: "external",
        materialized: false,
      });
      assert.equal(transport.closeCalls, 1);
    });
  }

  it("treats an exactly identical terminal notification as idempotent", async () => {
    const { client, transport } = await initialized("duplicate-terminal");
    const iterator = client.events()[Symbol.asyncIterator]();
    const completion = terminal("thread-duplicate", "turn-duplicate", "completed");

    transport.receive(completion);
    assert.deepEqual(await nextEvent(iterator), {
      type: "turn-completed",
      completion: {
        threadId: "thread-duplicate",
        turnId: "turn-duplicate",
        status: "completed",
        error: null,
      },
    });

    transport.receive(completion);
    transport.receive({ method: "future/event", params: { marker: "after-duplicate" } });
    assert.deepEqual(await nextEvent(iterator), {
      type: "unknown-notification",
      method: "future/event",
      params: { marker: "after-duplicate" },
    });
    assert.equal(client.state, "ready");
    assert.equal(transport.closeCalls, 0);
    assert.deepEqual(client.getThreadState("thread-duplicate"), {
      type: "idle",
      threadId: "thread-duplicate",
      materialized: true,
    });

    await iterator.return?.();
    await client.close();
  });

  for (const contradiction of [
    {
      label: "status",
      first: terminal("thread-terminal-conflict", "turn-terminal-conflict", "completed"),
      second: terminal("thread-terminal-conflict", "turn-terminal-conflict", "interrupted"),
    },
    {
      label: "error",
      first: terminal("thread-terminal-conflict", "turn-terminal-conflict", "failed", "first failure"),
      second: terminal("thread-terminal-conflict", "turn-terminal-conflict", "failed", "second failure"),
    },
  ]) {
    it(`fails closed when a duplicate terminal notification contradicts the recorded ${contradiction.label}`, async () => {
      const { client, transport } = await initialized(`terminal-${contradiction.label}-conflict`);
      const iterator = client.events()[Symbol.asyncIterator]();

      transport.receive(contradiction.first);
      assert.equal((await nextEvent(iterator)).type, "turn-completed");
      const stateAfterFirst = client.getThreadState("thread-terminal-conflict");

      transport.receive(contradiction.second);
      const failure = await nextEvent(iterator);
      assert.equal(failure.type, "protocol-error");
      assert.match(
        failure.type === "protocol-error" ? failure.message : "",
        /contradicts recorded terminal completion/,
      );
      assert.deepEqual(client.getThreadState("thread-terminal-conflict"), stateAfterFirst);
      assert.equal(client.state, "failed");
      assert.equal(transport.closeCalls, 1);
      assert.equal((await iterator.next()).done, true);
    });
  }

  it("fails closed when an evicted terminal turn later reports a contradictory outcome", async () => {
    const { client, transport } = await initialized("evicted-terminal-conflict");
    const iterator = client.events()[Symbol.asyncIterator]();

    for (let index = 0; index < 65; index += 1) {
      transport.receive(terminal("thread-rotated", `turn-${index}`, "completed"));
      assert.equal((await nextEvent(iterator)).type, "turn-completed");
    }

    transport.receive(terminal("thread-rotated", "turn-0", "interrupted"));
    const failure = await nextEvent(iterator);
    assert.equal(failure.type, "protocol-error");
    assert.match(
      failure.type === "protocol-error" ? failure.message : "",
      /terminal history is truncated/,
    );
    assert.equal(client.state, "failed");
    assert.equal(transport.closeCalls, 1);
  });

  it("accepts the exact active turn after that thread's terminal history is truncated", async () => {
    const { client, transport } = await initialized("truncated-active-turn");
    const iterator = client.events()[Symbol.asyncIterator]();

    for (let index = 0; index < 65; index += 1) {
      transport.receive(terminal("thread-active-after-rotation", `turn-${index}`, "completed"));
      assert.equal((await nextEvent(iterator)).type, "turn-completed");
    }

    transport.receive(
      terminal("thread-active-after-rotation", "turn-64", "completed"),
    );
    transport.receive({ method: "future/event", params: { marker: "cached-terminal" } });
    assert.deepEqual(await nextEvent(iterator), {
      type: "unknown-notification",
      method: "future/event",
      params: { marker: "cached-terminal" },
    });

    transport.receive({
      method: "turn/started",
      params: {
        threadId: "thread-active-after-rotation",
        turn: { id: "turn-current", status: "inProgress" },
      },
    });
    assert.equal((await nextEvent(iterator)).type, "turn-started");
    transport.receive(
      terminal("thread-active-after-rotation", "turn-current", "completed"),
    );
    assert.equal((await nextEvent(iterator)).type, "turn-completed");

    assert.equal(client.state, "ready");
    assert.deepEqual(client.getThreadState("thread-active-after-rotation"), {
      type: "idle",
      threadId: "thread-active-after-rotation",
      materialized: true,
    });
    await iterator.return?.();
    await client.close();
  });

  it("keeps detailed terminal history bounded while retaining a per-thread tombstone", async () => {
    const { client, transport } = await initialized("bounded-terminal-history");
    const iterator = client.events()[Symbol.asyncIterator]();

    for (let index = 0; index < 640; index += 1) {
      transport.receive({
        method: "turn/started",
        params: {
          threadId: "thread-long-history",
          turn: { id: `turn-${index}`, status: "inProgress" },
        },
      });
      assert.equal((await nextEvent(iterator)).type, "turn-started");
      transport.receive(terminal("thread-long-history", `turn-${index}`, "completed"));
      assert.equal((await nextEvent(iterator)).type, "turn-completed");
    }

    transport.receive(terminal("thread-fresh-history", "turn-fresh", "completed"));
    assert.equal((await nextEvent(iterator)).type, "turn-completed");

    transport.receive(terminal("thread-long-history", "turn-0", "completed"));
    const failure = await nextEvent(iterator);
    assert.equal(failure.type, "protocol-error");
    assert.match(
      failure.type === "protocol-error" ? failure.message : "",
      /terminal history is truncated/,
    );
    assert.equal(client.state, "failed");
    assert.equal(transport.closeCalls, 1);
  });

  it("fails closed when an event-before-response turn ID disagrees with turn/start", async () => {
    const { client, transport } = await initialized("response-conflict");
    const iterator = client.events()[Symbol.asyncIterator]();
    const started = client.startTurn({
      threadId: "thread-response-conflict",
      input: [{ type: "text", text: "start" }],
    });
    const request = await transport.waitForSent(2);
    transport.receive({
      method: "turn/started",
      params: {
        threadId: "thread-response-conflict",
        turn: { id: "turn-observed", status: "inProgress" },
      },
    });
    assert.equal((await nextEvent(iterator)).type, "turn-started");
    transport.receive({
      id: request.id,
      result: { turn: { id: "turn-returned", status: "inProgress" } },
    });

    await assert.rejects(started, (error: unknown) => {
      assert.ok(error instanceof ProtocolError);
      assert.match(error.message, /after observing turn-observed/);
      return true;
    });
    const failure = await nextEvent(iterator);
    assert.equal(failure.type, "protocol-error");
    assert.equal(client.state, "failed");
    assert.deepEqual(client.getThreadState("thread-response-conflict"), {
      type: "active",
      threadId: "thread-response-conflict",
      turnId: "turn-observed",
      owner: "unknown",
      materialized: false,
    });
  });

  for (const status of ["interrupted", "failed"] as const) {
    it(`rejects ${status} first-turn materialization`, async () => {
      const { client, transport } = await initialized(`materialize-${status}`);
      const result = client.materialize({ firstInput: [{ type: "text", text: "seed" }] });
      const threadRequest = await transport.waitForSent(2);
      transport.receive({ id: threadRequest.id, result: { thread: { id: `thread-${status}` } } });
      const turnRequest = await transport.waitForSent(3);
      transport.receive({
        id: turnRequest.id,
        result: { turn: { id: `turn-${status}`, status: "inProgress" } },
      });
      transport.receive(terminal(`thread-${status}`, `turn-${status}`, status));

      await assert.rejects(result, (error: unknown) => {
        assert.ok(error instanceof MaterializationError);
        assert.equal(error.completion.status, status);
        return true;
      });
      await client.close();
    });
  }

  it("observes an external turn and enforces the exact steer precondition", async () => {
    const { client, transport } = await initialized("steer");
    transport.receive({
      method: "turn/started",
      params: { threadId: "thread-ext", turn: { id: "turn-ext", status: "inProgress" } },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(client.getThreadState("thread-ext"), {
      type: "active",
      threadId: "thread-ext",
      turnId: "turn-ext",
      owner: "external",
      materialized: false,
    });

    await assert.rejects(
      client.steerTurn({
        threadId: "thread-ext",
        expectedTurnId: "wrong-turn",
        input: [{ type: "text", text: "wrong" }],
      }),
      ClientStateError,
    );
    assert.equal(transport.sent.length, 2);

    const steered = client.steerTurn({
      threadId: "thread-ext",
      expectedTurnId: "turn-ext",
      input: [{ type: "text", text: "new context" }],
    });
    const request = await transport.waitForSent(2);
    assert.deepEqual(request.params, {
      threadId: "thread-ext",
      expectedTurnId: "turn-ext",
      input: [{ type: "text", text: "new context", text_elements: [] }],
    });
    assert.equal(Object.hasOwn(request.params as object, "additionalContext"), false);
    transport.receive({ id: request.id, result: { turnId: "turn-ext" } });
    assert.deepEqual(await steered, { turnId: "turn-ext" });
    await client.close();
  });

  it("resumes an exact materialized thread and waits for interrupt completion", async () => {
    const { client, transport } = await initialized("lifecycle");
    const resumed = client.resumeThread("thread-live");
    const resumeRequest = await transport.waitForSent(2);
    assert.deepEqual(resumeRequest, {
      method: "thread/resume",
      id: "lifecycle:2",
      params: { threadId: "thread-live" },
    });
    transport.receive({ id: resumeRequest.id, result: { thread: { id: "thread-live" } } });
    assert.deepEqual(await resumed, { threadId: "thread-live", materialized: true });

    transport.receive({
      method: "turn/started",
      params: { threadId: "thread-live", turn: { id: "turn-live", status: "inProgress" } },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const interrupted = client.interruptTurn("thread-live", "turn-live");
    const interruptRequest = await transport.waitForSent(3);
    assert.deepEqual(interruptRequest, {
      method: "turn/interrupt",
      id: "lifecycle:3",
      params: { threadId: "thread-live", turnId: "turn-live" },
    });
    transport.receive({ id: interruptRequest.id, result: {} });

    let settled = false;
    void interrupted.finally(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "interrupt response alone must not complete the turn");
    transport.receive(terminal("thread-live", "turn-live", "interrupted"));
    assert.deepEqual(await interrupted, {
      threadId: "thread-live",
      turnId: "turn-live",
      status: "interrupted",
      error: null,
    });
    await client.close();
  });

  it("forwards unknown notifications without failing the client", async () => {
    const { client, transport } = await initialized("unknown");
    const iterator = client.events()[Symbol.asyncIterator]();
    transport.receive({ method: "future/event", params: { value: 42 } });
    assert.deepEqual(await nextEvent(iterator), {
      type: "unknown-notification",
      method: "future/event",
      params: { value: 42 },
    });
    assert.equal(client.state, "ready");
    await iterator.return?.();
    await client.close();
  });

  it("delivers concurrent pending event reads in FIFO order", async () => {
    const { client, transport } = await initialized("event-fifo");
    const iterator = client.events()[Symbol.asyncIterator]();
    const first = iterator.next();
    const second = iterator.next();

    transport.receive({ method: "future/first", params: { sequence: 1 } });
    transport.receive({ method: "future/second", params: { sequence: 2 } });

    assert.deepEqual(
      await within(Promise.all([first, second]), "concurrent event reads"),
      [
        {
          done: false,
          value: {
            type: "unknown-notification",
            method: "future/first",
            params: { sequence: 1 },
          },
        },
        {
          done: false,
          value: {
            type: "unknown-notification",
            method: "future/second",
            params: { sequence: 2 },
          },
        },
      ],
    );
    await iterator.return?.();
    await client.close();
  });

  it("resolves every pending event read when its iterator returns", async () => {
    const { client } = await initialized("event-return");
    const iterator = client.events()[Symbol.asyncIterator]();
    const first = iterator.next();
    const second = iterator.next();

    assert.deepEqual(await iterator.return?.(), { done: true, value: undefined });
    assert.deepEqual(
      await within(Promise.all([first, second]), "returned event reads"),
      [
        { done: true, value: undefined },
        { done: true, value: undefined },
      ],
    );
    assert.deepEqual(await iterator.next(), { done: true, value: undefined });
    await client.close();
  });

  it("resolves every pending event read when the client closes", async () => {
    const { client } = await initialized("event-close");
    const iterator = client.events()[Symbol.asyncIterator]();
    const first = iterator.next();
    const second = iterator.next();

    await client.close();
    assert.deepEqual(
      await within(Promise.all([first, second]), "closed event reads"),
      [
        { done: true, value: undefined },
        { done: true, value: undefined },
      ],
    );
    assert.deepEqual(await iterator.next(), { done: true, value: undefined });
  });

  it("fails unsupported server requests without auto-approving them", async () => {
    const { client, transport } = await initialized("server-request");
    const iterator = client.events()[Symbol.asyncIterator]();
    transport.receive({
      method: "item/commandExecution/requestApproval",
      id: 77,
      params: { command: "true" },
    });
    assert.deepEqual(await nextEvent(iterator), {
      type: "unsupported-server-request",
      method: "item/commandExecution/requestApproval",
    });
    assert.deepEqual(await transport.waitForSent(2), {
      id: 77,
      error: {
        code: -32601,
        message: "Client does not support server request: item/commandExecution/requestApproval",
      },
    });
    assert.equal(client.state, "ready");
    await iterator.return?.();
    await client.close();
  });

  it("fails closed on malformed lifecycle notifications", async () => {
    const { client, transport } = await initialized("malformed");
    const iterator = client.events()[Symbol.asyncIterator]();
    transport.receive({
      method: "turn/completed",
      params: { threadId: "thread-bad", turn: { id: "turn-bad", status: "inProgress" } },
    });
    const event = await nextEvent(iterator);
    assert.equal(event.type, "protocol-error");
    assert.match(event.type === "protocol-error" ? event.message : "", /must be terminal/);
    assert.equal(client.state, "failed");
    assert.equal(transport.closeCalls, 1);
  });

  it("rejects pending requests and turn waiters when transport disconnects", async () => {
    const { client, transport } = await initialized("disconnect");
    transport.receive({
      method: "turn/started",
      params: { threadId: "thread-d", turn: { id: "turn-d", status: "inProgress" } },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const interrupt = client.interruptTurn("thread-d", "turn-d");
    await transport.waitForSent(2);
    const pendingThread = client.startThread();
    await transport.waitForSent(3);
    transport.disconnect({ clean: false, reason: "socket lost" });

    await assert.rejects(interrupt, TransportClosedError);
    await assert.rejects(pendingThread, TransportClosedError);
    assert.equal(client.state, "failed");
    assert.deepEqual(client.getThreadState("thread-d"), {
      type: "detached",
      threadId: "thread-d",
      reason: "socket lost",
    });
  });

  it("validates exact resume IDs and closes idempotently", async () => {
    const { client, transport } = await initialized("close");
    const resumed = client.resumeThread("thread-wanted");
    const request = await transport.waitForSent(2);
    transport.receive({ id: request.id, result: { thread: { id: "thread-other" } } });
    await assert.rejects(resumed, ProtocolError);

    const first = client.close();
    const second = client.close();
    assert.strictEqual(first, second);
    await first;
    assert.equal(transport.closeCalls, 1);
    assert.equal(client.state, "closed");
  });
});
