import { ProtocolError } from "./errors.js";
import type {
  ServerIdentity,
  StableUserInput,
  TerminalTurnStatus,
  TurnCompletion,
} from "./types.js";
import type { JsonObject } from "./transport.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ProtocolError(`${label} must be an object`);
  return value;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolError(`${label} must be a non-empty string`);
  }
  return value;
}

export function parseServerIdentity(value: unknown): ServerIdentity {
  const result = requireRecord(value, "initialize result");
  return {
    userAgent: requireString(result.userAgent, "initialize result.userAgent"),
    codexHome: requireString(result.codexHome, "initialize result.codexHome"),
    platformFamily: requireString(result.platformFamily, "initialize result.platformFamily"),
    platformOs: requireString(result.platformOs, "initialize result.platformOs"),
  };
}

export function parseThreadId(value: unknown, label: string): string {
  const result = requireRecord(value, label);
  const thread = requireRecord(result.thread, `${label}.thread`);
  return requireString(thread.id, `${label}.thread.id`);
}

export function parseTurn(value: unknown, label: string): { id: string; status: string } {
  const result = requireRecord(value, label);
  const turn = requireRecord(result.turn, `${label}.turn`);
  return {
    id: requireString(turn.id, `${label}.turn.id`),
    status: requireString(turn.status, `${label}.turn.status`),
  };
}

export function parseSteerResult(value: unknown): string {
  const result = requireRecord(value, "turn/steer result");
  return requireString(result.turnId, "turn/steer result.turnId");
}

export function serializeInputs(inputs: readonly StableUserInput[]): JsonObject[] {
  if (inputs.length === 0) throw new ProtocolError("turn input must not be empty");
  return inputs.map((input) => {
    switch (input.type) {
      case "text":
        return { type: "text", text: input.text, text_elements: [] };
      case "image":
        return { type: "image", url: input.url };
      case "localImage":
        return { type: "localImage", path: input.path };
    }
  });
}

const terminalStatuses = new Set<TerminalTurnStatus>([
  "completed",
  "interrupted",
  "failed",
]);

export function parseTurnStartedNotification(value: unknown): {
  threadId: string;
  turnId: string;
} {
  const params = requireRecord(value, "turn/started params");
  const threadId = requireString(params.threadId, "turn/started params.threadId");
  const turn = requireRecord(params.turn, "turn/started params.turn");
  const turnId = requireString(turn.id, "turn/started params.turn.id");
  if (turn.status !== "inProgress") {
    throw new ProtocolError("turn/started params.turn.status must be inProgress");
  }
  return { threadId, turnId };
}

export function parseTurnCompletedNotification(value: unknown): TurnCompletion {
  const params = requireRecord(value, "turn/completed params");
  const threadId = requireString(params.threadId, "turn/completed params.threadId");
  const turn = requireRecord(params.turn, "turn/completed params.turn");
  const turnId = requireString(turn.id, "turn/completed params.turn.id");
  if (typeof turn.status !== "string" || !terminalStatuses.has(turn.status as TerminalTurnStatus)) {
    throw new ProtocolError("turn/completed params.turn.status must be terminal");
  }
  let error: string | null = null;
  if (turn.error !== null && turn.error !== undefined) {
    const turnError = requireRecord(turn.error, "turn/completed params.turn.error");
    error = requireString(turnError.message, "turn/completed params.turn.error.message");
  }
  return {
    threadId,
    turnId,
    status: turn.status as TerminalTurnStatus,
    error,
  };
}

export function parseThreadStartedNotification(value: unknown): string {
  const params = requireRecord(value, "thread/started params");
  const thread = requireRecord(params.thread, "thread/started params.thread");
  return requireString(thread.id, "thread/started params.thread.id");
}
