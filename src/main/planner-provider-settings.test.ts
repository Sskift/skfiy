import { describe, expect, it } from "vitest";
import {
  createPlannerProviderSettingsStore,
  readInitialPlannerProviderSettings
} from "./planner-provider-settings";

describe("planner provider settings", () => {
  it("defaults to local deterministic adapter mode", () => {
    expect(readInitialPlannerProviderSettings({})).toEqual({
      mode: "local-deterministic",
      externalProviderLabel: "External CUA",
      externalEndpoint: undefined,
      externalApiKeyConfigured: false
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

  it("reads external CUA endpoint and redacted API key status from the environment", () => {
    expect(readInitialPlannerProviderSettings({
      SKFIY_PLANNER_MODE: "external-cua",
      SKFIY_EXTERNAL_CUA_ENDPOINT: "https://cua.example.test/plan",
      SKFIY_EXTERNAL_CUA_API_KEY: "sk-test"
    })).toEqual({
      mode: "external-cua",
      externalProviderLabel: "External CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    });
  });

  it("lets the runtime store switch modes while ignoring invalid updates", () => {
    const store = createPlannerProviderSettingsStore(readInitialPlannerProviderSettings({}));

    expect(store.set({ mode: "external-cua" })).toMatchObject({ mode: "external-cua" });
    expect(store.set({ mode: "disabled" })).toMatchObject({ mode: "disabled" });
    expect(store.set({ mode: "invalid" })).toMatchObject({ mode: "disabled" });
  });
});
