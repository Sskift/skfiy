import type { PlannerProviderSettings } from "./planner-provider-settings.js";

export type PlannerProviderRuntimeDecision =
  | { decision: "run-local-deterministic" }
  | { decision: "unavailable"; status: "failed"; message: string };

export function decidePlannerProviderRuntime(
  settings: PlannerProviderSettings
): PlannerProviderRuntimeDecision {
  if (settings.mode === "local-deterministic") {
    return { decision: "run-local-deterministic" };
  }

  if (settings.mode === "external-cua") {
    return {
      decision: "unavailable",
      status: "failed",
      message: `${settings.externalProviderLabel} provider is configured but not implemented yet.`
    };
  }

  return {
    decision: "unavailable",
    status: "failed",
    message: "Computer Use planner is disabled in settings."
  };
}
