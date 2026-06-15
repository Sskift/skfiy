export type PlannerProviderMode =
  | "local-deterministic"
  | "external-cua"
  | "disabled";

export interface PlannerProviderSettings {
  mode: PlannerProviderMode;
  externalProviderLabel: string;
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}

export interface PlannerProviderSettingsUpdate {
  mode?: unknown;
}

const DEFAULT_EXTERNAL_PROVIDER_LABEL = "External CUA";

export function readInitialPlannerProviderSettings(
  env: {
    SKFIY_PLANNER_MODE?: string;
    SKFIY_EXTERNAL_CUA_ENDPOINT?: string;
    SKFIY_EXTERNAL_CUA_API_KEY?: string;
  }
): PlannerProviderSettings {
  return {
    mode: isPlannerProviderMode(env.SKFIY_PLANNER_MODE)
      ? env.SKFIY_PLANNER_MODE
      : "local-deterministic",
    externalProviderLabel: DEFAULT_EXTERNAL_PROVIDER_LABEL,
    externalEndpoint: readOptionalString(env.SKFIY_EXTERNAL_CUA_ENDPOINT),
    externalApiKeyConfigured: readOptionalString(env.SKFIY_EXTERNAL_CUA_API_KEY) !== undefined
  };
}

export function createPlannerProviderSettingsStore(
  initialSettings: PlannerProviderSettings
) {
  let settings = initialSettings;

  return {
    get(): PlannerProviderSettings {
      return settings;
    },
    set(update: PlannerProviderSettingsUpdate): PlannerProviderSettings {
      settings = {
        ...settings,
        mode: isPlannerProviderMode(update.mode) ? update.mode : settings.mode
      };

      return settings;
    }
  };
}

export function isPlannerProviderMode(value: unknown): value is PlannerProviderMode {
  return (
    value === "local-deterministic"
    || value === "external-cua"
    || value === "disabled"
  );
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
