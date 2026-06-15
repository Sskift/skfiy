import { describe, expect, it } from "vitest";
import {
  createAppPolicySettingsStore,
  decideAppPolicy,
  readInitialAppPolicySettings
} from "./app-policy-settings";

describe("app policy settings", () => {
  it("starts with Ghostty allowed and expansion targets asking first", () => {
    const settings = readInitialAppPolicySettings();

    expect(settings.apps).toEqual([
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
      { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
      { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
    ]);
  });

  it("decides allow, ask, and deny policies by bundle id", () => {
    const settings = readInitialAppPolicySettings();

    expect(decideAppPolicy(settings, "com.mitchellh.ghostty")).toEqual({
      decision: "allow",
      reason: "Ghostty is allowed by app policy."
    });
    expect(decideAppPolicy(settings, "com.google.Chrome")).toEqual({
      decision: "ask",
      reason: "Chrome requires approval by app policy."
    });
    expect(decideAppPolicy({
      apps: [
        { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "deny" }
      ]
    }, "com.mitchellh.ghostty")).toEqual({
      decision: "deny",
      reason: "Ghostty is denied by app policy."
    });
  });

  it("lets the runtime store update known app policies while ignoring invalid values", () => {
    const store = createAppPolicySettingsStore(readInitialAppPolicySettings());

    expect(store.set({ bundleId: "com.google.Chrome", policy: "allow" }).apps[1]).toEqual({
      name: "Chrome",
      bundleId: "com.google.Chrome",
      policy: "allow"
    });
    expect(store.set({ bundleId: "com.google.Chrome", policy: "surprise" }).apps[1]).toEqual({
      name: "Chrome",
      bundleId: "com.google.Chrome",
      policy: "allow"
    });
  });
});
