import { describe, expect, it } from "vitest";
import {
  applyChromeHostPolicyAction,
  createDefaultChromeHostPolicy,
  decideChromeBrowserDataExposure,
  decideChromeHostPolicy,
  normalizeChromeHostPolicy
} from "./chrome-host-policy";

describe("Chrome host policy", () => {
  it("starts from ask-by-default and asks for hosts without an allow/block entry", () => {
    const policy = createDefaultChromeHostPolicy();

    expect(policy).toEqual({
      defaultMode: "ask",
      allowedHosts: [],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    });
    expect(decideChromeHostPolicy(policy, "https://example.com/docs")).toEqual({
      decision: "ask",
      host: "example.com",
      reason: "default_ask"
    });
  });

  it("supports current-turn allow, always allow, and block with block taking priority", () => {
    let policy = createDefaultChromeHostPolicy();
    policy = applyChromeHostPolicyAction(policy, {
      action: "allow_current_turn",
      host: "Example.com"
    });
    policy = applyChromeHostPolicyAction(policy, {
      action: "always_allow",
      host: "docs.example.com"
    });

    expect(decideChromeHostPolicy(policy, "https://example.com/page")).toEqual({
      decision: "allow",
      host: "example.com",
      reason: "current_turn_allowed_host",
      scope: "current_turn"
    });
    expect(decideChromeHostPolicy(policy, "docs.example.com")).toEqual({
      decision: "allow",
      host: "docs.example.com",
      reason: "always_allowed_host",
      scope: "always"
    });

    const blockedPolicy = applyChromeHostPolicyAction(policy, {
      action: "block_host",
      host: "https://example.com/anything"
    });

    expect(blockedPolicy).toMatchObject({
      allowedHosts: ["docs.example.com"],
      currentTurnAllowedHosts: [],
      blockedHosts: ["example.com"]
    });
    expect(decideChromeHostPolicy(blockedPolicy, "example.com")).toEqual({
      decision: "block",
      host: "example.com",
      reason: "blocked_host"
    });
  });

  it("normalizes stored policy objects and drops malformed host entries", () => {
    expect(normalizeChromeHostPolicy({
      defaultMode: "allow",
      allowedHosts: ["Example.com", "bad host", "example.com"],
      currentTurnAllowedHosts: ["https://Turn.Example:8443/path"],
      blockedHosts: ["", "Blocked.Example"]
    })).toEqual({
      defaultMode: "ask",
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: ["turn.example:8443"],
      blockedHosts: ["blocked.example"]
    });
  });

  it("blocks browser history and download filename exposure without explicit confirmation", () => {
    expect(decideChromeBrowserDataExposure({
      exposure: "browser_history",
      confirmed: false
    })).toEqual({
      decision: "block",
      reason: "browser_history_exposure_requires_confirmation"
    });
    expect(decideChromeBrowserDataExposure({
      exposure: "download_filename"
    })).toEqual({
      decision: "block",
      reason: "download_filename_exposure_requires_confirmation"
    });
    expect(decideChromeBrowserDataExposure({
      exposure: "download_filename",
      confirmed: true
    })).toEqual({
      decision: "allow",
      reason: "explicitly_confirmed"
    });
  });
});
