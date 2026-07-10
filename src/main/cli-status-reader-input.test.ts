import { describe, expect, it } from "vitest";
import { normalizeCliCommand } from "./cli-command-normalization";
import {
  createStatusReaderInput,
  createStatusReaderInputWithInferredChromeExtensionIds,
  readChromeExtensionIdsFromConnection
} from "./cli-status-reader-input";

function expectInvocation(argv: string[]) {
  const result = normalizeCliCommand(argv, { rootDir: "/repo" });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.invocation;
}

describe("CLI status reader input", () => {
  it("creates status-reader paths from a status-like invocation", () => {
    expect(createStatusReaderInput({
      rootDir: "/repo",
      homeDir: "/Users/tester",
      invocation: expectInvocation([
        "status",
        "--json",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--dashboard-url",
        "http://127.0.0.1:8787/"
      ]) as Extract<ReturnType<typeof expectInvocation>, { kind: "status" }>
    })).toEqual({
      rootDir: "/repo",
      homeDir: "/Users/tester",
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      dashboardUrl: "http://127.0.0.1:8787/"
    });
  });

  it("infers unique Chrome extension ids from current and latest command launch origins", () => {
    const connection = {
      state: "connected" as const,
      liveConnection: "connected" as const,
      path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
      launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
      latestCommand: {
        launchOrigin: "chrome-extension://bcdefghijklmnopabcdefghijklmnopa/"
      }
    };

    expect(readChromeExtensionIdsFromConnection(connection)).toEqual([
      "abcdefghijklmnopabcdefghijklmnop",
      "bcdefghijklmnopabcdefghijklmnopa"
    ]);
    expect(createStatusReaderInputWithInferredChromeExtensionIds({
      rootDir: "/repo",
      homeDir: "/Users/tester",
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: []
    }, connection).extensionIds).toEqual([
      "abcdefghijklmnopabcdefghijklmnop",
      "bcdefghijklmnopabcdefghijklmnopa"
    ]);
  });

  it("keeps explicit extension ids instead of replacing them from connection evidence", () => {
    const input = {
      rootDir: "/repo",
      homeDir: "/Users/tester",
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["explicitexplicitexplicitexplicita"]
    };

    expect(createStatusReaderInputWithInferredChromeExtensionIds(input, {
      state: "connected",
      liveConnection: "connected",
      path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
      launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
    })).toBe(input);
  });
});
