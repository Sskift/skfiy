import { describe, expect, it } from "vitest";

import type {
  AssistantAgentProviderState,
  AssistantAgentSettings,
  AssistantAgentTurnResult
} from "./assistant-agent";
import {
  createAssistantAgentSettingsResponse,
  createAssistantAgentTaskMessage,
  createBrowserPageContextReadFailure,
  createRuntimeStatusResponse,
  readAssistantComputerUseToolCall
} from "./main-renderer-payload";

const assistantSettings: AssistantAgentSettings = {
  mode: "codex",
  codexBinary: "codex",
  codexBinarySource: "default",
  claudeCodeBinary: "claude",
  claudeCodeBinarySource: "default",
  hermesBinary: "hermes",
  hermesBinarySource: "default",
  cwd: "/repo",
  timeoutMs: 45_000
};

const providerState: AssistantAgentProviderState = {
  provider: "assistant",
  id: "codex",
  label: "Codex",
  selected: true,
  configured: true,
  executablePath: "codex",
  executableSource: "default",
  resolvedExecutablePath: "/usr/local/bin/codex",
  readiness: "chat-ready"
};

function createTurn(
  overrides: Partial<AssistantAgentTurnResult> = {}
): AssistantAgentTurnResult {
  return {
    id: "turn-1",
    createdAt: "2026-07-07T00:00:00.000Z",
    status: "completed",
    providerLabel: "Codex",
    message: "done",
    route: {
      kind: "chat",
      reason: "Conversational prompt should be answered by the assistant."
    },
    toolCalls: [
      {
        id: "tool-1",
        type: "computer-use",
        name: "desktop-control",
        status: "planned",
        createdAt: "2026-07-07T00:00:01.000Z",
        input: {
          command: "open Finder",
          route: {
            kind: "finder",
            bundleId: "com.apple.finder"
          }
        }
      }
    ],
    cancellation: { requested: false },
    ...overrides
  };
}

describe("main renderer payload helpers", () => {
  it("creates assistant settings responses without reshaping providers", () => {
    const response = createAssistantAgentSettingsResponse(assistantSettings, [providerState]);

    expect(response).toEqual({
      settings: assistantSettings,
      providers: [providerState]
    });
  });

  it("creates runtime status payloads from the hotkey registration state", () => {
    expect(createRuntimeStatusResponse(true)).toEqual({
      stopTurnHotkey: {
        accelerator: "Control+Alt+Shift+Esc",
        label: "Ctrl Opt Shift Esc",
        registered: true
      }
    });
    expect(createRuntimeStatusResponse(false).stopTurnHotkey.registered).toBe(false);
  });

  it("maps Browser Context read failures to the renderer fallback state", () => {
    expect(createBrowserPageContextReadFailure(new Error("native host missing"))).toEqual({
      state: "unavailable",
      reason: "native host missing",
      nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
    });

    expect(createBrowserPageContextReadFailure("boom")).toEqual({
      state: "unavailable",
      reason: "Chrome extension diagnostics could not be read.",
      nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
    });
  });

  it("creates assistant turn messages for completed and failed turns", () => {
    expect(createAssistantAgentTaskMessage(createTurn())).toBe("Codex: done");
    expect(createAssistantAgentTaskMessage(createTurn({
      status: "failed",
      error: { message: "provider crashed" }
    }))).toBe("Assistant agent failed: provider crashed");
    expect(createAssistantAgentTaskMessage(createTurn({
      status: "failed",
      error: undefined
    }))).toBe("Assistant agent failed: unknown error");
  });

  it("reads the planned Computer Use tool call from an assistant turn", () => {
    const turn = createTurn();

    expect(readAssistantComputerUseToolCall(turn).id).toBe("tool-1");
    expect(() => readAssistantComputerUseToolCall(createTurn({ toolCalls: [] })))
      .toThrow("Assistant turn turn-1 did not plan a Computer Use tool call.");
  });
});
