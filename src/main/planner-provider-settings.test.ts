import { describe, expect, it } from "vitest";
import {
  createPlannerProviderSettingsStore,
  readInitialPlannerProviderSettings
} from "./planner-provider-settings";

describe("planner provider settings", () => {
  it("defaults to local deterministic adapter mode", () => {
    expect(readInitialPlannerProviderSettings({})).toEqual({
      mode: "local-deterministic",
      externalProviderLabel: "External CUA"
    });
  });

  it.each([
    ["local-deterministic"],
    ["external-cua"],
    ["disabled"]
  ])("reads %s from the environment", (mode) => {
    expect(readInitialPlannerProviderSettings({ SKFIY_PLANNER_MODE: mode })).toMatchObject({
      mode
    });
  });

  it("falls back to local deterministic mode for invalid environment values", () => {
    expect(readInitialPlannerProviderSettings({ SKFIY_PLANNER_MODE: "surprise" })).toMatchObject({
      mode: "local-deterministic"
    });
  });

  it("lets the runtime store switch modes while ignoring invalid updates", () => {
    const store = createPlannerProviderSettingsStore(readInitialPlannerProviderSettings({}));

    expect(store.set({ mode: "external-cua" })).toMatchObject({ mode: "external-cua" });
    expect(store.set({ mode: "disabled" })).toMatchObject({ mode: "disabled" });
    expect(store.set({ mode: "invalid" })).toMatchObject({ mode: "disabled" });
  });
});
