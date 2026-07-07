import { describe, expect, it } from "vitest";
import { createChromeExtensionInfoOutput } from "./cli-chrome-extension-info-output";
import type { CliCommandInvocation } from "./cli-command-normalization";

function createInvocation(
  extensionIds: string[] = ["abcdefghijklmnopabcdefghijklmnop"]
): Extract<CliCommandInvocation, { kind: "chrome" }> {
  return {
    kind: "chrome",
    path: "chrome extension-info",
    subcommand: "extension-info",
    json: true,
    options: {
      extensionIds,
      cliShimPath: "/repo/dist/skfiy"
    }
  };
}

describe("CLI Chrome extension-info output", () => {
  it("creates copyable setup commands for an available unpacked extension", () => {
    const output = createChromeExtensionInfoOutput({
      invocation: createInvocation(),
      generatedAt: "2026-07-07T00:00:00.000Z",
      extensionPath: "/repo/chrome-extension",
      manifestPath: "/repo/chrome-extension/manifest.json",
      manifest: {
        state: "available",
        manifest: {
          manifestVersion: 3,
          name: "skfiy",
          version: "0.1.0"
        }
      }
    });

    expect(output).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "chrome extension-info",
      generatedAt: "2026-07-07T00:00:00.000Z",
      plannedMutation: false,
      executesSystemMutation: false,
      result: "available",
      productPath: "chrome-extension -> Chrome unpacked extension -> Native Messaging -> dist/skfiy",
      installHostCommand: [
        "skfiy",
        "chrome",
        "install-host",
        "--cli",
        "/repo/dist/skfiy",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      verifyStatusCommand: [
        "skfiy",
        "chrome",
        "status",
        "--cli",
        "/repo/dist/skfiy",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      smokeCommand: [
        "skfiy",
        "smoke",
        "chrome",
        "--output",
        ".skfiy-smoke/chrome.json"
      ]
    }));
    expect(output.extension).toEqual({
      state: "available",
      path: "/repo/chrome-extension",
      manifestPath: "/repo/chrome-extension/manifest.json",
      idState: "provided",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      manifest: {
        manifestVersion: 3,
        name: "skfiy",
        version: "0.1.0"
      }
    });
    expect(output.copyableCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        copyText: "skfiy chrome install-host --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
      }),
      expect.objectContaining({
        copyText: "skfiy smoke chrome --output .skfiy-smoke/chrome.json"
      })
    ]));
  });

  it("keeps missing manifest output actionable without a loaded extension id", () => {
    const output = createChromeExtensionInfoOutput({
      invocation: createInvocation([]),
      generatedAt: "2026-07-07T00:00:00.000Z",
      extensionPath: "/repo/chrome-extension",
      manifestPath: "/repo/chrome-extension/manifest.json",
      manifest: {
        state: "missing",
        reason: "missing manifest"
      }
    });

    expect(output.result).toBe("needs-action");
    expect(output.extension).toEqual({
      state: "missing",
      path: "/repo/chrome-extension",
      manifestPath: "/repo/chrome-extension/manifest.json",
      idState: "unknown-until-loaded",
      extensionIds: [],
      reason: "missing manifest"
    });
    expect(output.installHostCommand).toEqual([
      "skfiy",
      "chrome",
      "install-host",
      "--cli",
      "/repo/dist/skfiy",
      "--extension-id",
      "<extension-id>"
    ]);
  });
});
