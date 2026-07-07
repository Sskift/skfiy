import type {
  AppPolicy,
  AppPolicySettings,
  AssistantAgentSettings,
  AssistantAgentSettingsResponse,
  PlannerProviderSettings
} from "./App";

export const DEFAULT_APP_POLICY_SETTINGS: AppPolicySettings = {
  apps: [
    { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
    { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
    { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
  ]
};

export const DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE: AssistantAgentSettingsResponse = {
  settings: {
    mode: "codex",
    codexBinary: "codex",
    codexBinarySource: "default",
    claudeCodeBinary: "claude",
    claudeCodeBinarySource: "default",
    hermesBinary: "hermes",
    hermesBinarySource: "default",
    cwd: "",
    timeoutMs: 45_000
  },
  providers: [
    {
      provider: "assistant",
      id: "codex",
      label: "Codex",
      selected: true,
      configured: true,
      executablePath: "codex",
      executableSource: "default",
      readiness: "unavailable"
    },
    {
      provider: "assistant",
      id: "claude-code",
      label: "Claude Code",
      selected: false,
      configured: true,
      executablePath: "claude",
      executableSource: "default",
      readiness: "unavailable"
    },
    {
      provider: "assistant",
      id: "hermes",
      label: "Hermes",
      selected: false,
      configured: true,
      executablePath: "hermes",
      executableSource: "default",
      readiness: "unavailable"
    }
  ]
};

export const DEFAULT_PLANNER_PROVIDER_SETTINGS: PlannerProviderSettings = {
  mode: "local-deterministic",
  externalProviderLabel: "External CUA",
  externalEndpoint: undefined,
  externalApiKeyConfigured: false
};

export function reduceAppPolicySettings(
  settings: AppPolicySettings,
  update: { bundleId: string; policy: AppPolicy }
): AppPolicySettings {
  return {
    apps: settings.apps.map((entry) =>
      entry.bundleId === update.bundleId
        ? { ...entry, policy: update.policy }
        : entry
    )
  };
}

export function reduceAssistantAgentSettingsResponse(
  response: AssistantAgentSettingsResponse,
  update: Partial<Pick<AssistantAgentSettings, "mode">>
): AssistantAgentSettingsResponse {
  const mode = update.mode ?? response.settings.mode;

  return {
    ...response,
    settings: {
      ...response.settings,
      mode
    },
    providers: response.providers.map((provider) => ({
      ...provider,
      selected: provider.id === mode
    }))
  };
}

export function reducePlannerProviderSettings(
  settings: PlannerProviderSettings,
  update: Partial<Pick<PlannerProviderSettings, "mode">>
): PlannerProviderSettings {
  return {
    ...settings,
    mode: update.mode ?? settings.mode
  };
}
