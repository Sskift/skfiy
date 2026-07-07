import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_POLICY_SETTINGS,
  DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE,
  DEFAULT_PLANNER_PROVIDER_SETTINGS,
  reduceAppPolicySettings,
  reduceAssistantAgentSettingsResponse,
  reducePlannerProviderSettings
} from "./app-settings-state";

describe("app settings state", () => {
  it("updates one controlled app policy without changing other entries", () => {
    expect(reduceAppPolicySettings(DEFAULT_APP_POLICY_SETTINGS, {
      bundleId: "com.apple.finder",
      policy: "deny"
    })).toEqual({
      apps: [
        { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
        { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
        { name: "Finder", bundleId: "com.apple.finder", policy: "deny" }
      ]
    });
  });

  it("updates Background Agent mode and selected provider together", () => {
    expect(reduceAssistantAgentSettingsResponse(
      DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE,
      { mode: "hermes" }
    )).toMatchObject({
      settings: {
        mode: "hermes"
      },
      providers: [
        { id: "codex", selected: false },
        { id: "claude-code", selected: false },
        { id: "hermes", selected: true }
      ]
    });
  });

  it("keeps Background Agent selection stable for empty updates", () => {
    expect(reduceAssistantAgentSettingsResponse(
      DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE,
      {}
    ).providers.map((provider) => [provider.id, provider.selected])).toEqual([
      ["codex", true],
      ["claude-code", false],
      ["hermes", false]
    ]);
  });

  it("updates only the Computer Use Planner mode", () => {
    expect(reducePlannerProviderSettings(DEFAULT_PLANNER_PROVIDER_SETTINGS, {
      mode: "disabled"
    })).toEqual({
      ...DEFAULT_PLANNER_PROVIDER_SETTINGS,
      mode: "disabled"
    });
  });
});
