import { describe, expect, it, vi } from "vitest";
import {
  buildAssistantAgentInvocation,
  readAssistantAgentProviderStates,
  readInitialAssistantAgentSettings,
  runAssistantAgentTurn
} from "./assistant-agent";

describe("assistant agent provider", () => {
  const baseSettings = {
    mode: "local" as const,
    codexBinary: "codex",
    codexBinarySource: "default" as const,
    claudeCodeBinary: "claude",
    claudeCodeBinarySource: "default" as const,
    cwd: "/tmp/skfiy",
    timeoutMs: 45_000
  };
  const fixedNow = () => new Date("2026-06-22T10:00:00.000Z");

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
      runProcess,
      now: fixedNow,
      createTurnId: () => "turn-provider"
    })).resolves.toMatchObject({
      id: "turn-provider",
      createdAt: "2026-06-22T10:00:00.000Z",
      status: "completed",
      providerLabel: "Codex",
      message: "agent reply",
      route: {
        kind: "chat",
        reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
      },
      toolCalls: [],
      cancellation: {
        requested: false
      }
    });
    expect(runProcess).toHaveBeenCalledWith("codex", expect.any(Array), {
      cwd: "/tmp/skfiy",
      timeoutMs: 45_000,
      signal: undefined
    });
  });

  it("returns a structured local chat turn while preserving legacy message fields", async () => {
    await expect(runAssistantAgentTurn("hello", {
      settings: baseSettings,
      now: fixedNow,
      createTurnId: () => "turn-chat"
    })).resolves.toEqual({
      id: "turn-chat",
      createdAt: "2026-06-22T10:00:00.000Z",
      status: "completed",
      providerLabel: "Local",
      message: "你好，我在。你可以直接说要我观察或操作哪个应用。",
      route: {
        kind: "chat",
        reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
      },
      toolCalls: [],
      cancellation: {
        requested: false
      }
    });
  });

  it("records planned Computer Use evidence for desktop-control requests without running tools", async () => {
    const command = "打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文";

    await expect(runAssistantAgentTurn(command, {
      settings: baseSettings,
      now: fixedNow,
      createTurnId: () => "turn-desktop"
    })).resolves.toMatchObject({
      id: "turn-desktop",
      createdAt: "2026-06-22T10:00:00.000Z",
      status: "completed",
      providerLabel: "Local",
      route: {
        kind: "chrome",
        bundleId: "com.google.Chrome"
      },
      toolCalls: [
        {
          id: "turn-desktop-tool-1",
          type: "computer-use",
          name: "desktop-control",
          status: "planned",
          createdAt: "2026-06-22T10:00:00.000Z",
          input: {
            command,
            route: {
              kind: "chrome",
              bundleId: "com.google.Chrome"
            }
          }
        }
      ],
      cancellation: {
        requested: false
      }
    });
  });

  it("records route-level confirmation turns while planning the confirmed target route", async () => {
    const command = "在 Ghostty 执行 pwd，先等我确认";

    await expect(runAssistantAgentTurn(command, {
      settings: baseSettings,
      now: fixedNow,
      createTurnId: () => "turn-confirmation"
    })).resolves.toMatchObject({
      id: "turn-confirmation",
      createdAt: "2026-06-22T10:00:00.000Z",
      status: "completed",
      providerLabel: "Local",
      route: {
        kind: "needs_confirmation",
        reason: "Route policy requires confirmation before continuing with Ghostty.",
        targetRoute: {
          kind: "ghostty",
          bundleId: "com.mitchellh.ghostty"
        }
      },
      toolCalls: [
        {
          id: "turn-confirmation-tool-1",
          type: "computer-use",
          name: "desktop-control",
          status: "planned",
          createdAt: "2026-06-22T10:00:00.000Z",
          input: {
            command,
            route: {
              kind: "ghostty",
              bundleId: "com.mitchellh.ghostty"
            }
          }
        }
      ],
      cancellation: {
        requested: false
      }
    });
  });

  it("records route-level denial turns without planning Computer Use", async () => {
    await expect(runAssistantAgentTurn("不要在 Ghostty 执行 pwd", {
      settings: baseSettings,
      now: fixedNow,
      createTurnId: () => "turn-denied"
    })).resolves.toMatchObject({
      id: "turn-denied",
      createdAt: "2026-06-22T10:00:00.000Z",
      status: "completed",
      providerLabel: "Local",
      route: {
        kind: "denied",
        reason: "User denied this desktop control request.",
        targetRoute: {
          kind: "ghostty",
          bundleId: "com.mitchellh.ghostty"
        }
      },
      toolCalls: [],
      cancellation: {
        requested: false
      }
    });
  });

  it("records route-level blocked turns without planning Computer Use", async () => {
    await expect(runAssistantAgentTurn("在 Ghostty 执行 rm -rf ~/Desktop", {
      settings: baseSettings,
      now: fixedNow,
      createTurnId: () => "turn-blocked"
    })).resolves.toMatchObject({
      id: "turn-blocked",
      createdAt: "2026-06-22T10:00:00.000Z",
      status: "completed",
      providerLabel: "Local",
      route: {
        kind: "blocked",
        reason: "Route policy blocks destructive or sensitive terminal commands before Computer Use.",
        targetRoute: {
          kind: "ghostty",
          bundleId: "com.mitchellh.ghostty"
        }
      },
      toolCalls: [],
      cancellation: {
        requested: false
      }
    });
  });

  it("attaches structured failed turn details to provider failures", async () => {
    const providerError = new Error("provider offline");
    const runProcess = vi.fn(async () => {
      throw providerError;
    });

    await expect(runAssistantAgentTurn("hello", {
      settings: {
        ...baseSettings,
        mode: "codex"
      },
      runProcess,
      now: fixedNow,
      createTurnId: () => "turn-failed"
    })).rejects.toMatchObject({
      message: "provider offline",
      turn: {
        id: "turn-failed",
        createdAt: "2026-06-22T10:00:00.000Z",
        status: "failed",
        providerLabel: "Codex",
        message: "",
        error: {
          message: "provider offline"
        },
        route: {
          kind: "chat",
          reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
        },
        toolCalls: [],
        cancellation: {
          requested: false
        }
      }
    });
  });
});
