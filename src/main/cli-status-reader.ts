import { existsSync } from "node:fs";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import {
  createChromeExtensionConnectionStatePath,
  readChromeExtensionConnectionStatus,
  readChromeNativeHostStatus,
  type ChromeExtensionConnectionStatus,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";
import {
  createChromeHostPolicyStatePath,
  readChromeHostPolicyState,
  type ChromeHostPolicyState
} from "./chrome-host-policy.js";
import { createChromeExtensionAdapterStatus } from "./cli-chrome-capabilities.js";
import { readDashboardStatus } from "./cli-dashboard-status-reader.js";
import {
  createUnknownPermissionStates,
  readDesktopSessionForStatus,
  readPermissionStatesForStatus
} from "./cli-desktop-status.js";
import { readMoneyRunStatusForStatus } from "./cli-money-run-status.js";
import { readErrorMessage } from "./cli-record-utils.js";
import {
  createStatusReaderInputWithInferredChromeExtensionIds,
  type StatusReaderInput
} from "./cli-status-reader-input.js";

export type CliStatusCommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type CliStatusReader = (input: StatusReaderInput) => Promise<Record<string, unknown>>;

export interface CreateCliStatusReaderOptions {
  commandRunner: CliStatusCommandRunner;
}

export function createCliStatusReader({
  commandRunner
}: CreateCliStatusReaderOptions): CliStatusReader {
  return (input) => readCliStatus(input, { commandRunner });
}

export async function readCliStatus(
  input: StatusReaderInput,
  {
    commandRunner
  }: {
    commandRunner: CliStatusCommandRunner;
  }
): Promise<Record<string, unknown>> {
  const appExists = existsSync(input.appPath);
  const helperExists = existsSync(input.helperPath);
  const app = {
    state: appExists ? "installed" : "missing",
    path: input.appPath
  };
  const cli = {
    state: existsSync(input.cliShimPath) ? "installed" : "missing",
    path: input.cliShimPath
  };
  const helper = {
    state: helperExists ? "installed" : "missing",
    path: input.helperPath
  };

  const extensionConnection = await readChromeExtensionConnectionForStatus(input);
  const effectiveInput = createStatusReaderInputWithInferredChromeExtensionIds(input, extensionConnection);
  const nativeHost = await readNativeHostStatusForStatus(effectiveInput);
  const hostPolicy = await readChromeHostPolicyForStatus(effectiveInput);
  const [dashboard, moneyRun] = await Promise.all([
    readDashboardStatus(input.dashboardUrl, input.homeDir),
    readMoneyRunStatusForStatus(commandRunner)
  ]);

  if (!helperExists) {
    return {
      app,
      cli,
      helper,
      permissions: createUnknownPermissionStates(),
      desktopSession: {
        state: "unknown",
        reason: `skfiy helper is missing at ${input.helperPath}.`
      },
      extension: createChromeExtensionAdapterStatus(nativeHost, extensionConnection, hostPolicy),
      nativeHost,
      dashboard,
      moneyRun
    };
  }

  const desktopHelper = new DesktopHelperClient({
    helperPath: input.helperPath
  });
  const [permissions, desktopSession] = await Promise.all([
    readPermissionStatesForStatus(desktopHelper),
    readDesktopSessionForStatus(desktopHelper)
  ]);

  return {
    app,
    cli,
    helper,
    permissions,
    desktopSession,
    extension: createChromeExtensionAdapterStatus(nativeHost, extensionConnection, hostPolicy),
    nativeHost,
    dashboard,
    moneyRun
  };
}

export async function readNativeHostStatusForStatus(
  input: StatusReaderInput
): Promise<Record<string, unknown>> {
  if (input.extensionIds.length === 0) {
    return {
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: [],
      reason: "Pass --extension-id <id> to include Chrome Native Messaging host status."
    };
  }

  if (!input.homeDir) {
    return {
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: input.extensionIds,
      reason: "Home directory is required to locate the Chrome Native Messaging host manifest."
    };
  }

  try {
    return {
      ...await readChromeNativeHostStatus({
        homeDir: input.homeDir,
        cliShimPath: input.cliShimPath,
        extensionIds: input.extensionIds
      })
    };
  } catch (error) {
    return {
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: input.extensionIds,
      reason: readErrorMessage(error)
    };
  }
}

export async function readChromeExtensionConnectionForStatus(
  input: Pick<StatusReaderInput, "homeDir">
): Promise<ChromeExtensionConnectionStatus | undefined> {
  if (!input.homeDir) {
    return undefined;
  }

  try {
    return await readChromeExtensionConnectionStatus({
      homeDir: input.homeDir
    });
  } catch (error) {
    return {
      state: "unknown",
      liveConnection: "unknown",
      path: createChromeExtensionConnectionStatePath(input.homeDir),
      reason: readErrorMessage(error)
    };
  }
}

export async function readChromeHostPolicyForStatus(
  input: Pick<StatusReaderInput, "homeDir">,
  io?: ChromeNativeHostIo
): Promise<ChromeHostPolicyState | undefined> {
  if (!input.homeDir) {
    return undefined;
  }

  try {
    return await readChromeHostPolicyState({
      homeDir: input.homeDir,
      io
    });
  } catch (error) {
    return {
      schemaVersion: 1,
      state: "invalid",
      path: createChromeHostPolicyStatePath(input.homeDir),
      policy: {
        defaultMode: "ask",
        allowedHosts: [],
        currentTurnAllowedHosts: [],
        blockedHosts: []
      },
      reason: readErrorMessage(error)
    };
  }
}
