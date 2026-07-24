// This file is the only compatibility seam for external Codex Hook wire shapes.
// Keep plugin bootstraps and the bridge transport independent from Codex field additions.
const ENROLLMENT_START = "[AF_COMPANION_ENROLLMENT_V2]";
const ENROLLMENT_END = "[/AF_COMPANION_ENROLLMENT_V2]";
const HANDOFF_START = "[AF_COMPANION_HANDOFF_V2]";
const HANDOFF_END = "[/AF_COMPANION_HANDOFF_V2]";
const MAX_CAPSULE_BYTES = 32 * 1_024;

const SUPPORTED_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
]);

export function minimallyParseHookInput(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("hook input must be an object");
  }
  if (Object.hasOwn(value, "agent_id") || Object.hasOwn(value, "agent_type")) {
    return { ignored: true };
  }
  if (!SUPPORTED_EVENTS.has(value.hook_event_name)) return { ignored: true };
  if (typeof value.session_id !== "string" || !value.session_id || value.session_id.length > 1_024) {
    return { ignored: true };
  }
  if (typeof value.cwd !== "string" || !value.cwd || value.cwd.includes("\0")) {
    return { ignored: true };
  }
  return {
    ignored: false,
    event: value,
    activation_capsule: activationCapsuleFor(value),
  };
}

export function activationCapsuleFor(value, environment = process.env) {
  if (value.hook_event_name === "SessionStart") {
    return exactCapsule(environment.AF_COMPANION_ENROLLMENT, "enrollment");
  }
  if (value.hook_event_name !== "UserPromptSubmit") return null;
  return exactCapsule(value.prompt, "either");
}

export function toBridgeHookInput(value, companionProof) {
  if (typeof companionProof !== "object" || companionProof === null || Array.isArray(companionProof)) {
    throw new Error("companion proof is required");
  }
  const normalized = {
    session_id: value.session_id,
    cwd: value.cwd,
    hook_event_name: value.hook_event_name,
    model: stringOrEmpty(value.model),
    permission_mode: stringOrEmpty(value.permission_mode),
    companion_proof: companionProof,
  };
  if (value.hook_event_name === "SessionStart") {
    normalized.source = stringOrEmpty(value.source);
    return normalized;
  }
  if (value.hook_event_name === "UserPromptSubmit") {
    normalized.turn_id = stringOrEmpty(value.turn_id);
    return normalized;
  }
  if (value.hook_event_name === "PreToolUse" || value.hook_event_name === "PostToolUse") {
    normalized.turn_id = stringOrEmpty(value.turn_id);
    normalized.tool_name = stringOrEmpty(value.tool_name);
    return normalized;
  }
  if (value.hook_event_name === "Stop") {
    normalized.turn_id = stringOrEmpty(value.turn_id);
    return normalized;
  }
  throw new Error("unsupported hook event");
}

export function toCodexHookOutput(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid bridge hook output");
  }
  const specific = value.hookSpecificOutput;
  if (
    typeof specific !== "object"
    || specific === null
    || Array.isArray(specific)
    || specific.hookEventName !== "UserPromptSubmit"
    || typeof specific.additionalContext !== "string"
  ) {
    throw new Error("invalid bridge hook output");
  }
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: specific.additionalContext,
    },
  };
}

function exactCapsule(value, kind) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_CAPSULE_BYTES) return null;
  if (!value || value !== value.trim() || containsAmbiguousMarkers(value)) return null;
  const envelopes = kind === "enrollment"
    ? [[ENROLLMENT_START, ENROLLMENT_END]]
    : [[ENROLLMENT_START, ENROLLMENT_END], [HANDOFF_START, HANDOFF_END]];
  for (const [start, end] of envelopes) {
    if (!value.startsWith(start) || !value.endsWith(end)) continue;
    const body = value.slice(start.length, -end.length);
    if (!body.trim()) return null;
    return value;
  }
  return null;
}

function containsAmbiguousMarkers(value) {
  const markers = [ENROLLMENT_START, ENROLLMENT_END, HANDOFF_START, HANDOFF_END];
  const counts = markers.map((marker) => value.split(marker).length - 1);
  const total = counts.reduce((sum, count) => sum + count, 0);
  return total !== 2 || counts.some((count) => count > 1);
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}
