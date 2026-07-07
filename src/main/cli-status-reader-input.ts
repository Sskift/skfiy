import path from "node:path";
import type { ChromeExtensionConnectionStatus } from "./chrome-native-host.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";

export interface StatusReaderInput {
  rootDir: string;
  homeDir: string;
  appPath: string;
  helperPath: string;
  cliShimPath: string;
  extensionIds: string[];
  dashboardUrl?: string;
}

export function createStatusReaderInput({
  rootDir,
  homeDir,
  invocation
}: {
  rootDir: string;
  homeDir: string;
  invocation: Extract<CliCommandInvocation, { kind: "status" | "doctor" | "operator-status" }>;
}): StatusReaderInput {
  const appPath = path.join(rootDir, "dist", "skfiy.app");

  return {
    rootDir,
    homeDir,
    appPath,
    helperPath: path.join(appPath, "Contents", "MacOS", "skfiy-helper"),
    cliShimPath: invocation.options.cliShimPath,
    extensionIds: invocation.options.extensionIds,
    dashboardUrl: invocation.options.dashboardUrl
  };
}

export function createStatusReaderInputWithInferredChromeExtensionIds(
  input: StatusReaderInput,
  extensionConnection: ChromeExtensionConnectionStatus | undefined
): StatusReaderInput {
  if (input.extensionIds.length > 0) {
    return input;
  }

  const extensionIds = readChromeExtensionIdsFromConnection(extensionConnection);

  return extensionIds.length > 0
    ? { ...input, extensionIds }
    : input;
}

export function readChromeExtensionIdsFromConnection(
  extensionConnection: ChromeExtensionConnectionStatus | undefined
): string[] {
  const candidates = [
    extensionConnection?.launchOrigin,
    extensionConnection?.latestCommand?.launchOrigin
  ];

  return [...new Set(candidates.map(readChromeExtensionIdFromLaunchOrigin).filter(Boolean))];
}

function readChromeExtensionIdFromLaunchOrigin(launchOrigin: string | undefined): string {
  const match = launchOrigin?.match(/^chrome-extension:\/\/([a-p]{32})\/$/);

  return match?.[1] ?? "";
}
