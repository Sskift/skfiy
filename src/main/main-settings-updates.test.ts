import { describe, expect, it } from "vitest";
import {
  readAppPolicySettingsUpdate,
  readPlannerProviderSettingsUpdate
} from "./main-settings-updates";

describe("main settings IPC updates", () => {
  it("keeps object app-policy updates and ignores non-object payloads", () => {
    expect(readAppPolicySettingsUpdate({
      bundleId: "com.google.Chrome",
      policy: "allow"
    })).toEqual({
      bundleId: "com.google.Chrome",
      policy: "allow"
    });
    expect(readAppPolicySettingsUpdate(null)).toEqual({});
    expect(readAppPolicySettingsUpdate("allow")).toEqual({});
    expect(readAppPolicySettingsUpdate(["com.google.Chrome", "allow"])).toEqual({});
  });

  it("keeps object planner-provider updates and ignores non-object payloads", () => {
    expect(readPlannerProviderSettingsUpdate({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan"
    })).toEqual({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan"
    });
    expect(readPlannerProviderSettingsUpdate(undefined)).toEqual({});
    expect(readPlannerProviderSettingsUpdate(false)).toEqual({});
    expect(readPlannerProviderSettingsUpdate(["external-cua"])).toEqual({});
  });
});
