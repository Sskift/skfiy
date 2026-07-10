import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCliStatusReader,
  readChromeHostPolicyForStatus,
  readNativeHostStatusForStatus,
  type CliStatusCommandRunner
} from "./cli-status-reader";
import type { StatusReaderInput } from "./cli-status-reader-input";

describe("CLI status reader", () => {
  it("reports helper-missing status with safe fallback sections", async () => {
    const commands: Array<{ command: string; args: string[]; timeoutMs?: number }> = [];
    const commandRunner: CliStatusCommandRunner = async (command, args, options) => {
      commands.push({ command, args, timeoutMs: options?.timeoutMs });

      return {
        exitCode: 1,
        stdout: "",
        stderr: "tmux session was not found"
      };
    };
    const input = createStatusReaderInput({
      rootDir: "/tmp/skfiy-status-reader-missing-root",
      homeDir: "",
      extensionIds: []
    });

    await expect(createCliStatusReader({ commandRunner })(input)).resolves.toMatchObject({
      app: {
        state: "missing",
        path: input.appPath
      },
      cli: {
        state: "missing",
        path: input.cliShimPath
      },
      helper: {
        state: "missing",
        path: input.helperPath
      },
      permissions: {
        screenRecording: "unknown",
        accessibility: "unknown",
        finderAutomation: "unknown"
      },
      desktopSession: {
        state: "unknown",
        reason: `skfiy helper is missing at ${input.helperPath}.`
      },
      nativeHost: {
        state: "unknown",
        cliShimPath: input.cliShimPath,
        extensionIds: [],
        reason: "Pass --extension-id <id> to include Chrome Native Messaging host status."
      },
      dashboard: {
        state: "not-running"
      },
      moneyRun: {
        state: "blocked",
        source: "tmux-read-only-probe",
        mutatesSession: false,
        probeError: "tmux session was not found"
      }
    });
    expect(commands).toEqual([
      {
        command: "tmux",
        args: ["has-session", "-t", "money-run"],
        timeoutMs: expect.any(Number)
      }
    ]);
  });

  it("keeps Chrome native host status unknown until an extension id is supplied", async () => {
    const input = createStatusReaderInput({
      rootDir: "/tmp/skfiy-status-reader-native-root",
      homeDir: "/Users/tester",
      extensionIds: []
    });

    await expect(readNativeHostStatusForStatus(input)).resolves.toEqual({
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: [],
      reason: "Pass --extension-id <id> to include Chrome Native Messaging host status."
    });
  });

  it("returns an invalid host-policy fallback when policy state cannot be read", async () => {
    const homeDir = "/Users/tester";
    const policyPath = path.join(
      homeDir,
      "Library",
      "Application Support",
      "skfiy",
      "chrome-host-policy.json"
    );

    await expect(readChromeHostPolicyForStatus({
      homeDir
    }, {
      exists: async () => {
        throw new Error("policy read denied");
      },
      mkdir: async () => undefined,
      readFile: async () => "{}",
      writeFile: async () => undefined,
      rm: async () => undefined
    })).resolves.toEqual({
      schemaVersion: 1,
      state: "invalid",
      path: policyPath,
      policy: {
        defaultMode: "ask",
        allowedHosts: [],
        currentTurnAllowedHosts: [],
        blockedHosts: []
      },
      reason: "policy read denied"
    });
  });
});

function createStatusReaderInput({
  rootDir,
  homeDir,
  extensionIds
}: {
  rootDir: string;
  homeDir: string;
  extensionIds: string[];
}): StatusReaderInput {
  const appPath = path.join(rootDir, "dist", "skfiy.app");

  return {
    rootDir,
    homeDir,
    appPath,
    helperPath: path.join(appPath, "Contents", "MacOS", "skfiy-helper"),
    cliShimPath: path.join(rootDir, "dist", "skfiy"),
    extensionIds
  };
}
