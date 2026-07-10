import { describe, expect, it } from "vitest";
import {
  CHROME_EXTENSION_CARD_RELOAD_REQUIRED_NEXT_ACTION,
  CHROME_EXTENSION_REGISTRATION_STALE_NEXT_ACTION,
  createChromeExtensionReloadOutput,
  createChromeHostPolicyResetOutput,
  createChromeHostPolicySetOutput,
  createChromeHostPolicyShowOutput,
  createChromeTabsOutput
} from "./cli-chrome-command-output";
import type { CliCommandInvocation } from "./cli-command-normalization";

function createChromeInvocation(
  subcommand: Extract<CliCommandInvocation, { kind: "chrome" }>["subcommand"]
): Extract<CliCommandInvocation, { kind: "chrome" }> {
  return {
    kind: "chrome",
    path: `chrome ${subcommand}`,
    json: true,
    subcommand,
    options: {
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      cliShimPath: "/repo/dist/skfiy"
    }
  };
}

function createChromePolicyInvocation(
  subcommand: Extract<CliCommandInvocation, { kind: "chrome-policy" }>["subcommand"],
  options: Partial<Extract<CliCommandInvocation, { kind: "chrome-policy" }>["options"]> = {}
): Extract<CliCommandInvocation, { kind: "chrome-policy" }> {
  return {
    kind: "chrome-policy",
    path: `chrome policy ${subcommand}`,
    json: true,
    subcommand,
    options: {
      host: undefined,
      action: undefined,
      ...options
    }
  };
}

describe("CLI Chrome command output", () => {
  it("turns blocked tab discovery with stale registration into extension reload guidance", () => {
    const output = createChromeTabsOutput({
      invocation: createChromeInvocation("tabs"),
      generatedAt: "2026-07-07T00:00:00.000Z",
      tabDiscoveryResult: {
        result: "blocked",
        reason: "popup-wake-timeout",
        nextAction: "Reload the extension."
      },
      extensionRegistration: {
        state: "stale",
        localManifestVersion: "0.2.0",
        registeredVersion: "0.1.0",
        manifestPath: "/repo/chrome-extension/manifest.json",
        preferencesPath: "/Users/tester/Library/Application Support/Google/Chrome/Default/Preferences"
      }
    });

    expect(output).toEqual(expect.objectContaining({
      command: "chrome tabs",
      generatedAt: "2026-07-07T00:00:00.000Z",
      executesSystemMutation: true,
      result: "blocked",
      reason: "extension-registration-stale",
      nextAction: CHROME_EXTENSION_REGISTRATION_STALE_NEXT_ACTION,
      extensionRegistration: expect.objectContaining({
        state: "stale",
        localManifestVersion: "0.2.0",
        registeredVersion: "0.1.0"
      })
    }));
  });

  it("keeps desktop reload fallback details when stale registration needs card reload", () => {
    const output = createChromeExtensionReloadOutput({
      invocation: createChromeInvocation("reload-extension"),
      generatedAt: "2026-07-07T00:00:00.000Z",
      reloadResult: {
        result: "blocked",
        reason: "desktop-locked",
        nextAction: "Unlock the desktop.",
        observedWindowTitle: "Chrome Extensions",
        screenshotPath: "/tmp/reload.png"
      },
      extensionRegistration: {
        state: "stale",
        localManifestVersion: "0.2.0",
        registeredVersion: "0.1.0"
      }
    });

    expect(output).toEqual(expect.objectContaining({
      command: "chrome reload-extension",
      generatedAt: "2026-07-07T00:00:00.000Z",
      executesSystemMutation: true,
      result: "blocked",
      reason: "extension-card-reload-required",
      nextAction: CHROME_EXTENSION_CARD_RELOAD_REQUIRED_NEXT_ACTION,
      desktopFallback: {
        reason: "desktop-locked",
        nextAction: "Unlock the desktop.",
        observedWindowTitle: "Chrome Extensions",
        screenshotPath: "/tmp/reload.png"
      }
    }));
  });

  it("wraps chrome host policy show, reset, and set results with mutation metadata", () => {
    const hostPolicy = {
      state: "default",
      policy: {
        defaultMode: "ask"
      }
    };

    expect(createChromeHostPolicyShowOutput({
      invocation: createChromePolicyInvocation("show"),
      generatedAt: "2026-07-07T00:00:00.000Z",
      hostPolicy
    })).toEqual({
      schemaVersion: 1,
      command: "chrome policy show",
      generatedAt: "2026-07-07T00:00:00.000Z",
      executesSystemMutation: false,
      hostPolicy
    });
    expect(createChromeHostPolicyResetOutput({
      invocation: createChromePolicyInvocation("reset"),
      generatedAt: "2026-07-07T00:00:00.000Z",
      hostPolicy
    })).toEqual(expect.objectContaining({
      command: "chrome policy reset",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "reset",
      hostPolicy
    }));
    expect(createChromeHostPolicySetOutput({
      invocation: createChromePolicyInvocation("set", {
        host: "example.com",
        action: "allow_current_turn"
      }),
      generatedAt: "2026-07-07T00:00:00.000Z",
      host: "example.com",
      hostPolicy
    })).toEqual(expect.objectContaining({
      command: "chrome policy set",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "configured",
      action: "allow_current_turn",
      host: "example.com",
      hostPolicy
    }));
  });
});
