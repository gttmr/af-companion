import { createHash } from "node:crypto";

import type { AfRevisionRef, AfRevisionSubject } from "../src/analyzer/afWorkItem";

export interface RevisionSubjectInput {
  ref: string;
  content: string | Buffer;
}

/**
 * Build a content-addressed Work Item revision from repository-relative subjects.
 * Subject order never changes the digest; duplicate references are rejected.
 */
export function createWorkItemRevision(
  subjects: readonly RevisionSubjectInput[],
  registryRevision: string | null = null,
): AfRevisionRef {
  if (subjects.length === 0) {
    throw new Error("revision must include at least one subject");
  }
  const normalized = subjects
    .map(({ ref, content }): AfRevisionSubject => ({
      ref: normalizeRef(ref),
      sha256: createHash("sha256").update(content).digest("hex"),
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref));
  assertUniqueRefs(normalized);
  if (registryRevision !== null && !isSha256(registryRevision)) {
    throw new Error("registryRevision must be a lowercase SHA-256 or null");
  }
  const canonical = JSON.stringify({
    subjects: normalized,
    registry_revision: registryRevision,
  });
  return {
    digest: createHash("sha256").update(canonical).digest("hex"),
    subjects: normalized,
    registry_revision: registryRevision,
  };
}

export function sha256Text(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeRef(ref: string): string {
  const normalized = ref.trim().split("\\").join("/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`revision subject ref must be repository-relative: ${ref}`);
  }
  return normalized;
}

function assertUniqueRefs(subjects: readonly AfRevisionSubject[]): void {
  for (let index = 1; index < subjects.length; index += 1) {
    if (subjects[index - 1].ref === subjects[index].ref) {
      throw new Error(`revision subject ref is duplicated: ${subjects[index].ref}`);
    }
  }
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
