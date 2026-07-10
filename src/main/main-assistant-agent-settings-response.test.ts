import { describe, expect, it, vi } from "vitest";

import type {
  AssistantAgentProviderState,
  AssistantAgentSettings
} from "./assistant-agent";
import {
  readAssistantAgentSettingsResponse,
  readAssistantAgentSettingsUpdate,
  updateAssistantAgentSettingsResponse,
  type AssistantAgentSettingsStoreLike
} from "./main-assistant-agent-settings-response";

const codexSettings: AssistantAgentSettings = {
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

const hermesSettings: AssistantAgentSettings = {
  ...codexSettings,
  mode: "hermes"
};

const providerStates: AssistantAgentProviderState[] = [
  {
    provider: "assistant",
    id: "codex",
    label: "Codex",
    selected: true,
    configured: true,
    executablePath: "codex",
    executableSource: "default",
    resolvedExecutablePath: "/opt/homebrew/bin/codex",
    readiness: "chat-ready"
  }
];

function createStore(initialSettings: AssistantAgentSettings): AssistantAgentSettingsStoreLike {
  let settings = initialSettings;

  return {
    get: vi.fn(() => settings),
    set: vi.fn((update) => {
      settings = {
        ...settings,
        mode: update.mode === "hermes" ? "hermes" : settings.mode
      };

      return settings;
    })
  };
}

describe("main assistant agent settings response helpers", () => {
  it("reads current settings and provider states for renderer responses", async () => {
    const store = createStore(codexSettings);
    const readProviderStates = vi.fn(async (settings: AssistantAgentSettings) => {
      expect(settings).toBe(codexSettings);
      return providerStates;
    });

    await expect(readAssistantAgentSettingsResponse({
      store,
      readProviderStates
    })).resolves.toEqual({
      settings: codexSettings,
      providers: providerStates
    });

    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
    expect(readProviderStates).toHaveBeenCalledTimes(1);
  });

  it("normalizes updates before refreshing provider states", async () => {
    const store = createStore(codexSettings);
    const readProviderStates = vi.fn(async (settings: AssistantAgentSettings) => {
      expect(settings).toEqual(hermesSettings);
      return providerStates;
    });

    await expect(updateAssistantAgentSettingsResponse({
      store,
      update: { mode: "hermes", ignored: true },
      readProviderStates
    })).resolves.toEqual({
      settings: hermesSettings,
      providers: providerStates
    });

    expect(store.set).toHaveBeenCalledWith({ mode: "hermes", ignored: true });
    expect(readProviderStates).toHaveBeenCalledTimes(1);
  });

  it("falls back to an empty settings update for invalid IPC payloads", () => {
    expect(readAssistantAgentSettingsUpdate(null)).toEqual({});
    expect(readAssistantAgentSettingsUpdate("hermes")).toEqual({});
    expect(readAssistantAgentSettingsUpdate({ mode: "claude-code" })).toEqual({
      mode: "claude-code"
    });
  });
});
