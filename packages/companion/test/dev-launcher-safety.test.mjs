import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { waitForServices } from "../scripts/dev.mjs";

test("dev launcher starts the managed App root flow without a fixed demo project", async () => {
  const source = await readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /demo-project|prepareDemoConfig/);
  assert.match(source, /COMPANION_APPLICATIONS_ROOT/);
  assert.match(source, /Companion App Manager/);
});

test("readiness waits for successful responses from both API and Web", async () => {
  const attempts = new Map();
  const services = [
    { label: "Companion API", url: "http://api.test/health", child: { exitCode: null } },
    { label: "Companion Web", url: "http://web.test/", child: { exitCode: null } },
  ];
  await waitForServices(services, { timeoutMs: 1_000, pollIntervalMs: 0, fetchImpl: async (url) => { const count = (attempts.get(url) ?? 0) + 1; attempts.set(url, count); return { ok: url === services[0].url || count >= 3 }; } });
  assert.equal(attempts.get(services[0].url), 1); assert.equal(attempts.get(services[1].url), 3);
});

test("readiness failure is bounded and identifies the unavailable service", async () => {
  let clock = 0;
  await assert.rejects(() => waitForServices([{ label: "Companion Web", url: "http://web.test/", child: { exitCode: null } }], { timeoutMs: 30, pollIntervalMs: 10, fetchImpl: async () => ({ ok: false }), now: () => clock, sleep: async (delay) => { clock += delay; } }), /Companion Web did not become healthy: http:\/\/web\.test\//);
  assert.equal(clock, 30);
});

test("each readiness request is aborted within the remaining deadline", async () => {
  const startedAt = Date.now();
  await assert.rejects(() => waitForServices([{ label: "Companion API", url: "http://api.test/health", child: { exitCode: null } }], { timeoutMs: 40, requestTimeoutMs: 1_000, fetchImpl: async (_url, init) => new Promise((_, reject) => { init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }); }) }), /Companion API did not become healthy/);
  assert.ok(Date.now() - startedAt < 250, "health request exceeded its bounded deadline");
});
