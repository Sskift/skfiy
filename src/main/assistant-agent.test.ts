import { describe, expect, it, vi } from "vitest";
import {
  buildAssistantAgentInvocation,
  readAssistantAgentProviderStates,
  readInitialAssistantAgentSettings,
  runAssistantAgentTurn
} from "./assistant-agent";

describe("assistant agent provider", () => {
  it("defaults the pet background agent to the local fallback", () => {
    expect(readInitialAssistantAgentSettings({})).toEqual({
      mode: "local",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      cwd: process.cwd(),
      timeoutMs: 45_000
    });
  });

  it.each([
    ["codex", "codex"],
    ["claude-code", "claude-code"],
    ["claudecode", "claude-code"],
    ["claude", "claude-code"]
  ])("reads %s as an assistant agent provider", (value, mode) => {
    expect(readInitialAssistantAgentSettings({ SKFIY_ASSISTANT_AGENT: value })).toMatchObject({
      mode
    });
  });

  it("normalizes provider state with executable source and readiness", async () => {
    const settings = readInitialAssistantAgentSettings({
      SKFIY_ASSISTANT_AGENT: "claude-code",
      SKFIY_CODEX_BIN: " /opt/homebrew/bin/codex ",
      SKFIY_CLAUDE_CODE_BIN: " /opt/homebrew/bin/claude "
    }, { cwd: "/tmp/skfiy" });

    const states = await readAssistantAgentProviderStates(settings, {
      resolveExecutable: async (command) => `${command}:resolved`
    });

    expect(states).toEqual([
      {
        provider: "assistant",
        id: "local",
        label: "Local",
        selected: false,
        configured: true,
        executableSource: "built-in",
        readiness: "ready"
      },
      {
        provider: "assistant",
        id: "codex",
        label: "Codex",
        selected: false,
        configured: true,
        executablePath: "/opt/homebrew/bin/codex",
        executableSource: "env",
        resolvedExecutablePath: "/opt/homebrew/bin/codex:resolved",
        readiness: "ready"
      },
      {
        provider: "assistant",
        id: "claude-code",
        label: "Claude Code",
        selected: true,
        configured: true,
        executablePath: "/opt/homebrew/bin/claude",
        executableSource: "env",
        resolvedExecutablePath: "/opt/homebrew/bin/claude:resolved",
        readiness: "ready"
      }
    ]);
  });

  it("reports unconfigured and unavailable CLI providers with last errors", async () => {
    const states = await readAssistantAgentProviderStates({
      mode: "codex",
      codexBinary: "",
      codexBinarySource: "env",
      claudeCodeBinary: "missing-claude",
      claudeCodeBinarySource: "default",
      cwd: "/tmp/skfiy",
      timeoutMs: 45_000
    }, {
      resolveExecutable: async (command) => {
        throw new Error(`${command} not found`);
      }
    });

    expect(states.find((state) => state.id === "codex")).toMatchObject({
      id: "codex",
      selected: true,
      configured: false,
      executableSource: "env",
      readiness: "unconfigured",
      lastError: "Codex executable is not configured."
    });
    expect(states.find((state) => state.id === "claude-code")).toMatchObject({
      id: "claude-code",
      selected: false,
      configured: true,
      executablePath: "missing-claude",
      executableSource: "default",
      readiness: "unavailable",
      lastError: "missing-claude not found"
    });
  });

  it("builds a locked-down Codex exec invocation for pet chat", () => {
    expect(buildAssistantAgentInvocation({
      mode: "codex",
      codexBinary: "/opt/homebrew/bin/codex",
      codexBinarySource: "env",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      cwd: "/tmp/skfiy",
      timeoutMs: 45_000
    }, "hello")).toMatchObject({
      command: "/opt/homebrew/bin/codex",
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "--ask-for-approval",
        "never",
        "--cd",
        "/tmp/skfiy",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--color",
        "never",
        expect.stringContaining("hello")
      ],
      label: "Codex"
    });
  });

  it("builds a no-tools Claude Code print invocation for pet chat", () => {
    expect(buildAssistantAgentInvocation({
      mode: "claude-code",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "/opt/homebrew/bin/claude",
      claudeCodeBinarySource: "env",
      cwd: "/tmp/skfiy",
      timeoutMs: 45_000
    }, "你好")).toMatchObject({
      command: "/opt/homebrew/bin/claude",
      args: [
        "--print",
        "--output-format",
        "text",
        "--permission-mode",
        "dontAsk",
        "--tools",
        "",
        "--safe-mode",
        "--no-chrome",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        expect.stringContaining("你好")
      ],
      label: "Claude Code"
    });
  });

  it("runs the configured provider and trims its response", async () => {
    const runProcess = vi.fn(async () => ({ stdout: "  agent reply\n", stderr: "" }));

    await expect(runAssistantAgentTurn("hello", {
      settings: {
        mode: "codex",
        codexBinary: "codex",
        codexBinarySource: "default",
        claudeCodeBinary: "claude",
        claudeCodeBinarySource: "default",
        cwd: "/tmp/skfiy",
        timeoutMs: 45_000
      },
      runProcess
    })).resolves.toEqual({
      providerLabel: "Codex",
      message: "agent reply"
    });
    expect(runProcess).toHaveBeenCalledWith("codex", expect.any(Array), {
      cwd: "/tmp/skfiy",
      timeoutMs: 45_000
    });
  });
});
