const { describe, it } = require("node:test");
const assert = require("node:assert");
const { buildStateBody, PERMISSION_TOOLS } = require("../hooks/kimi-hook");

describe("Kimi hook script", () => {
  it("maps PreToolUse for permission tools to notification", () => {
    const resolve = () => ({
      stablePid: 12345,
      agentPid: 67890,
      detectedEditor: null,
      pidChain: [67890, 12345],
    });

    // Test both PascalCase (Claude-style) and snake_case (Kimi CLI actual)
    const testNames = [
      ...PERMISSION_TOOLS,                        // normalized form (shell, writefile...)
      "Shell", "WriteFile", "StrReplaceFile",      // PascalCase
      "shell", "write_file", "str_replace_file",  // snake_case
    ];
    for (const toolName of testNames) {
      const body = buildStateBody(
        "PreToolUse",
        { session_id: "test-sid", cwd: "/tmp", tool_name: toolName },
        resolve
      );
      assert.strictEqual(body.state, "notification", `tool ${toolName} should map to notification`);
      assert.strictEqual(body.event, "PermissionRequest", `tool ${toolName} should remap event to PermissionRequest`);
      assert.strictEqual(body.agent_id, "kimi-cli");
    }
  });

  it("reads event from hook_event_name (Kimi CLI format)", () => {
    const resolve = () => ({ stablePid: null, agentPid: null, detectedEditor: null, pidChain: [] });
    const body = buildStateBody(
      "PreToolUse",
      { hook_event_name: "PreToolUse", session_id: "test-sid", cwd: "/tmp", tool_name: "shell" },
      resolve
    );
    assert.strictEqual(body.state, "notification");
    assert.strictEqual(body.event, "PermissionRequest");
  });

  it("maps PreToolUse for non-permission tools to working", () => {
    const resolve = () => ({
      stablePid: 12345,
      agentPid: null,
      detectedEditor: null,
      pidChain: [],
    });

    const body = buildStateBody(
      "PreToolUse",
      { session_id: "test-sid", cwd: "/tmp", tool_name: "ReadFile" },
      resolve
    );
    assert.strictEqual(body.state, "working");
  });

  it("maps SessionStart to idle", () => {
    const resolve = () => ({
      stablePid: null,
      agentPid: null,
      detectedEditor: null,
      pidChain: [],
    });

    const body = buildStateBody(
      "SessionStart",
      { session_id: "test-sid", cwd: "/tmp", source: "user" },
      resolve
    );
    assert.strictEqual(body.state, "idle");
    assert.strictEqual(body.event, "SessionStart");
  });

  it("maps PostToolUse to working", () => {
    const resolve = () => ({
      stablePid: null,
      agentPid: null,
      detectedEditor: null,
      pidChain: [],
    });

    const body = buildStateBody(
      "PostToolUse",
      { session_id: "test-sid", cwd: "/tmp", tool_name: "Shell" },
      resolve
    );
    assert.strictEqual(body.state, "working");
  });

  it("maps Stop to attention", () => {
    const resolve = () => ({
      stablePid: null,
      agentPid: null,
      detectedEditor: null,
      pidChain: [],
    });

    const body = buildStateBody(
      "Stop",
      { session_id: "test-sid", cwd: "/tmp" },
      resolve
    );
    assert.strictEqual(body.state, "attention");
  });

  it("returns null for unknown events", () => {
    const resolve = () => ({
      stablePid: null,
      agentPid: null,
      detectedEditor: null,
      pidChain: [],
    });

    const body = buildStateBody("UnknownEvent", {}, resolve);
    assert.strictEqual(body, null);
  });

  it("includes PID info from resolver", () => {
    const resolve = () => ({
      stablePid: 11111,
      agentPid: 22222,
      detectedEditor: "code",
      pidChain: [22222, 11111],
    });

    const body = buildStateBody(
      "UserPromptSubmit",
      { session_id: "test-sid", cwd: "/tmp", prompt: "hello" },
      resolve
    );
    assert.strictEqual(body.source_pid, 11111);
    assert.strictEqual(body.agent_pid, 22222);
    assert.strictEqual(body.kimi_pid, 22222);
    assert.strictEqual(body.editor, "code");
    assert.deepStrictEqual(body.pid_chain, [22222, 11111]);
  });
});
