export type PlannerProviderMode =
  | "local-deterministic"
  | "external-cua"
  | "disabled";

export interface PlannerProviderSettings {
  mode: PlannerProviderMode;
  externalProviderLabel: string;
}

export interface PlannerProviderSettingsUpdate {
  mode?: unknown;
}

const DEFAULT_EXTERNAL_PROVIDER_LABEL = "External CUA";

export function readInitialPlannerProviderSettings(
  env: { SKFIY_PLANNER_MODE?: string }
): PlannerProviderSettings {
  return {
    mode: isPlannerProviderMode(env.SKFIY_PLANNER_MODE)
      ? env.SKFIY_PLANNER_MODE
      : "local-deterministic",
    externalProviderLabel: DEFAULT_EXTERNAL_PROVIDER_LABEL
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
