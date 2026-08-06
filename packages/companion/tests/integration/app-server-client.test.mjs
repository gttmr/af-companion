import assert from "node:assert/strict";
import test from "node:test";

import { createAppServerClient } from "@agent-factory/codex-app-server-client";

test("the public App Server boundary materializes only after a terminal event", async () => {
  const transport = new ScriptedTransport();
  const client = createAppServerClient({
    transport,
    requestIdPrefix: "integration",
    clientInfo: { name: "companion_integration", version: "0.1.0" },
  });

  const identity = await client.initialize();
  assert.equal(identity.userAgent, "codex_cli_rs/0.146.0");

  const materialized = await client.materialize({
    cwd: "/workspace/demo",
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    firstInput: [{ type: "text", text: "Materialize this thread." }],
  });
  assert.deepEqual(materialized, {
    threadId: "thread-integration",
    materialized: true,
    firstTurn: {
      threadId: "thread-integration",
      turnId: "turn-integration",
      status: "completed",
      error: null,
    },
  });
  assert.deepEqual(transport.methods, ["initialize", "initialized", "thread/start", "turn/start"]);
  await client.close();
});

class ScriptedTransport {
  kind = "scripted-integration";
  methods = [];
  #incoming = new AsyncQueue();
  #resolveClosed;
  #closed = new Promise((resolvePromise) => {
    this.#resolveClosed = resolvePromise;
  });

  async connect() {
    return {
      incoming: this.#incoming,
      closed: this.#closed,
      send: async (message) => {
        this.methods.push(message.method ?? "response");
        if (message.method === "initialize") {
          this.#incoming.push({
            id: message.id,
            result: {
              userAgent: "codex_cli_rs/0.146.0",
              codexHome: "/tmp/codex-home",
              platformFamily: "unix",
              platformOs: "linux",
            },
          });
        } else if (message.method === "thread/start") {
          this.#incoming.push({ id: message.id, result: { thread: { id: "thread-integration" } } });
        } else if (message.method === "turn/start") {
          this.#incoming.push({
            method: "turn/completed",
            params: {
              threadId: "thread-integration",
              turn: { id: "turn-integration", status: "completed", error: null },
            },
          });
          this.#incoming.push({
            id: message.id,
            result: { turn: { id: "turn-integration", status: "inProgress" } },
          });
        }
      },
      close: async () => {
        this.#incoming.close();
        this.#resolveClosed({ clean: true, reason: "integration complete" });
      },
    };
  }
}
class AsyncQueue {
  #values = [];
  #waiters = [];
  #closed = false;

  push(value) {
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.#values.push(value);
  }

  close() {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#values.length > 0) return Promise.resolve({ done: false, value: this.#values.shift() });
        if (this.#closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolvePromise) => this.#waiters.push(resolvePromise));
      },
    };
  }
}
