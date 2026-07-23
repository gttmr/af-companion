// This file is the only compatibility seam for external Codex Hook wire shapes.
// Keep plugin bootstraps and the bridge transport independent from Codex field additions.
const COMMON_INPUT_FIELDS = [
  "session_id",
  "transcript_path",
  "cwd",
  "hook_event_name",
  "model",
  "permission_mode",
];

export function toBridgeHookInput(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("hook input must be an object");
  }

  const normalized = pick(value, COMMON_INPUT_FIELDS);
  if (value.hook_event_name === "SessionStart") {
    normalized.source = value.source;
    return normalized;
  }
  if (value.hook_event_name === "UserPromptSubmit") {
    normalized.turn_id = value.turn_id;
    normalized.prompt = value.prompt;
    if (value.agent_id !== undefined) normalized.agent_id = value.agent_id;
    if (value.agent_type !== undefined) normalized.agent_type = value.agent_type;
    return normalized;
  }
  if (value.hook_event_name === "PreToolUse" || value.hook_event_name === "PostToolUse") {
    normalized.turn_id = value.turn_id;
    normalized.tool_name = value.tool_name;
    return normalized;
  }
  if (value.hook_event_name === "Stop") {
    normalized.turn_id = value.turn_id;
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

function pick(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, source[field]]));
}
