import { describe, expect, it } from "vitest";
import {
  createChromeSetupGuideFields,
  createChromeSetupGuideOutput,
  createCopyableCommandsFromSetupGuide,
  formatCommandLine,
  readExtensionIdsFromAdapterInput
} from "./cli-chrome-readiness";

describe("CLI Chrome readiness helpers", () => {
  it("creates setup guide fields with next action and copyable commands", () => {
    const fields = createChromeSetupGuideFields({
      extensionState: "native-host-installed",
      nativeHostState: "installed",
      liveConnection: "stale",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      cliShimPath: "/repo/dist/skfiy",
      manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
      allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
      expectedAllowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
      hostPolicy: {
        schemaVersion: 1,
        state: "default",
        path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
        policy: {
          defaultMode: "ask",
          allowedHosts: [],
          currentTurnAllowedHosts: [],
          blockedHosts: []
        }
      },
      connectionPath: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
      connectionState: "stale",
      extensionPath: "/repo/chrome-extension"
    });

    expect(fields).toMatchObject({
      nextAction: expect.stringContaining("Load or refresh the skfiy Chrome extension"),
      setupGuide: {
        state: "ready",
        extensionPath: "/repo/chrome-extension",
        verifyStatusCommand: [
          "skfiy",
          "chrome",
          "status",
          "--cli",
          "/repo/dist/skfiy",
          "--extension-id",
          "abcdefghijklmnopabcdefghijklmnop"
        ]
      },
      copyableCommands: expect.arrayContaining([
        expect.objectContaining({
          id: "chrome-status-/repo/dist/skfiy-abcdefghijklmnopabcdefghijklmnop",
          command: "skfiy",
          copyText: "skfiy chrome status --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
        })
      ])
    });
  });

  it("falls back to unknown setup guide for unsupported native-host states", () => {
    expect(createChromeSetupGuideOutput({
      extensionState: "unknown",
      nativeHostState: "not-probed",
      liveConnection: "unknown",
      extensionIds: [],
      cliShimPath: "/repo/dist/skfiy"
    })).toMatchObject({
      state: "needs_setup",
      nativeHostState: "not-probed",
      installHostCommand: [
        "skfiy",
        "chrome",
        "install-host",
        "--cli",
        "/repo/dist/skfiy",
        "--extension-id",
        "<extension-id>"
      ],
      nextAction: "Collect Chrome extension/native-host status with an extension id. Run `skfiy chrome status --cli /repo/dist/skfiy --extension-id \"<extension-id>\"`."
    });
  });

  it("deduplicates copyable commands and quotes unsafe shell arguments", () => {
    expect(createCopyableCommandsFromSetupGuide({
      installHostCommand: ["skfiy", "chrome", "install-host", "--cli", "/repo/dist/skfiy app"],
      verifyStatusCommand: ["skfiy", "chrome", "install-host", "--cli", "/repo/dist/skfiy app"],
      nextActions: [{
        command: ["skfiy", "chrome", "status", "--extension-id", "abc"]
      }]
    })).toEqual([
      {
        id: "chrome-install-host-/repo/dist/skfiy app",
        command: "skfiy",
        args: ["chrome", "install-host", "--cli", "/repo/dist/skfiy app"],
        copyText: "skfiy chrome install-host --cli \"/repo/dist/skfiy app\""
      },
      {
        id: "chrome-status-abc",
        command: "skfiy",
        args: ["chrome", "status", "--extension-id", "abc"],
        copyText: "skfiy chrome status --extension-id abc"
      }
    ]);
    expect(formatCommandLine(["skfiy", "chrome", "policy", "set", "--host", "example test"])).toBe(
      "skfiy chrome policy set --host \"example test\""
    );
  });

  it("reads extension ids from explicit ids before allowed origins", () => {
    expect(readExtensionIdsFromAdapterInput({
      extensionIds: ["explicit"],
      allowedOrigins: ["chrome-extension://from-origin/"]
    })).toEqual(["explicit"]);
    expect(readExtensionIdsFromAdapterInput({
      allowedOrigins: [
        "https://example.test/*",
        "chrome-extension://from-origin/"
      ]
    })).toEqual(["from-origin"]);
  });
});
