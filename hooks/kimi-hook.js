#!/usr/bin/env node
// Clawd Desktop Pet — Kimi CLI Hook Script
// Usage: node kimi-hook.js <event_name>
// Reads stdin JSON from Kimi CLI for session_id, cwd, tool_name, etc.

const { postStateToRunningServer, readHostPrefix } = require("./server-config");
const { createPidResolver, readStdinJson, getPlatformConfig } = require("./shared-process");

const EVENT_TO_STATE = {
  SessionStart: "idle",
  SessionEnd: "sleeping",
  UserPromptSubmit: "thinking",
  PreToolUse: "working",
  PostToolUse: "working",
  PostToolUseFailure: "error",
  Stop: "attention",
  StopFailure: "error",
  SubagentStart: "juggling",
  SubagentStop: "working",
  PreCompact: "sweeping",
  PostCompact: "attention",
  Notification: "notification",
};

// Tools that typically trigger a user-approval prompt in Kimi CLI.
// When these tools fire PreToolUse, we flash notification so Clawd
// visually signals that Kimi is waiting for permission.
// Kimi CLI uses snake_case tool names in hook payloads (e.g. "shell",
// "write_file") while logs show PascalCase.  Normalize before checking.
const PERMISSION_TOOLS = new Set([
  "shell",
  "writefile",
  "strreplacefile",
  "background",
]);

function buildStateBody(event, payload, resolve) {
  const state = EVENT_TO_STATE[event];
  if (!state) return null;

  const rawSessionId = payload.session_id || "default";
  const sessionId = rawSessionId.startsWith("kimi-cli:") ? rawSessionId : `kimi-cli:${rawSessionId}`;
  const cwd = payload.cwd || "";

  let resolvedState = state;

  // For permission-requiring tools, treat PreToolUse as PermissionRequest
  // so Clawd keeps the pet in notification state while Kimi is waiting for
  // user approval (same lifecycle as Claude Code's HTTP PermissionRequest).
  const normalizedToolName = typeof payload.tool_name === "string"
    ? payload.tool_name.toLowerCase().replace(/_/g, "")
    : "";
  if (event === "PreToolUse" && PERMISSION_TOOLS.has(normalizedToolName)) {
    resolvedState = "notification";
    event = "PermissionRequest";
  }

  const body = { state: resolvedState, session_id: sessionId, event };
  body.agent_id = "kimi-cli";
  if (cwd) body.cwd = cwd;

  if (process.env.CLAWD_REMOTE) {
    body.host = readHostPrefix();
  } else {
    const { stablePid, agentPid, detectedEditor, pidChain } = resolve();
    body.source_pid = stablePid;
    if (detectedEditor) body.editor = detectedEditor;
    if (agentPid) {
      body.agent_pid = agentPid;
      body.kimi_pid = agentPid;
    }
    if (pidChain.length) body.pid_chain = pidChain;
  }

  return body;
}

function main() {
  const eventFromArgv = process.argv[2];

  const config = getPlatformConfig();
  const resolve = createPidResolver({
    agentNames: { mac: new Set(["kimi"]), linux: new Set(["kimi"]), win: new Set(["kimi.exe"]) },
    agentCmdlineCheck: (cmd) => cmd.includes("kimi") || cmd.includes("kimi-cli"),
    platformConfig: config,
  });

  readStdinJson().then((payload) => {
    // Kimi CLI passes event via stdin JSON (not argv), so resolve it here.
    // Field name is "hook_event_name" (not "event").
    const event = eventFromArgv || (payload && (payload.hook_event_name || payload.event)) || "";
    if (!EVENT_TO_STATE[event]) process.exit(0);

    // Pre-resolve on SessionStart (runs during stdin buffering, not after)
    if (event === "SessionStart" && !process.env.CLAWD_REMOTE) resolve();

    const body = buildStateBody(event, payload || {}, resolve);
    if (!body) process.exit(0);
    postStateToRunningServer(
      JSON.stringify(body),
      { timeoutMs: 100 },
      () => process.exit(0)
    );
  }).catch(() => process.exit(0));
}

if (require.main === module) main();
module.exports = { buildStateBody, PERMISSION_TOOLS };
