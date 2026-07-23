import assert from "node:assert/strict";
import test from "node:test";

import { createWorkItemRevision } from "./workItemRevision.ts";

test("creates an order-independent revision with sorted subjects", () => {
  const first = createWorkItemRevision([
    { ref: "graph-ir.json", content: "graph" },
    { ref: "analysis-result.json", content: "analysis" },
  ]);
  const second = createWorkItemRevision([
    { ref: "analysis-result.json", content: "analysis" },
    { ref: "graph-ir.json", content: "graph" },
  ]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.subjects.map((subject) => subject.ref), [
    "analysis-result.json",
    "graph-ir.json",
  ]);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});

test("includes the Registry revision and rejects ambiguous references", () => {
  const registryRevision = "a".repeat(64);
  assert.equal(
    createWorkItemRevision([{ ref: "analysis-result.json", content: "analysis" }], registryRevision)
      .registry_revision,
    registryRevision,
  );
  assert.throws(
    () => createWorkItemRevision([
      { ref: "graph-ir.json", content: "one" },
      { ref: "graph-ir.json", content: "two" },
    ]),
    /duplicated/,
  );
  assert.throws(
    () => createWorkItemRevision([{ ref: "../outside", content: "no" }]),
    /repository-relative/,
  );
  assert.throws(
    () => createWorkItemRevision([]),
    /at least one subject/,
  );
});
