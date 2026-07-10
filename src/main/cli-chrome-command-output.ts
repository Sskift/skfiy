import type { CliCommandInvocation } from "./cli-command-normalization.js";
import {
  compactRecord,
  readErrorMessage
} from "./cli-record-utils.js";

export const CHROME_EXTENSION_REGISTRATION_STALE_NEXT_ACTION =
  "Reload the skfiy extension card in Chrome Extension Manager so Chrome re-registers the MV3 service worker, then retry `skfiy chrome tabs`.";
export const CHROME_EXTENSION_CARD_RELOAD_REQUIRED_NEXT_ACTION =
  "Open chrome://extensions on an unlocked desktop, click the skfiy extension reload button, then retry `skfiy chrome reload-extension`.";

export type ChromeExtensionRegistrationStatus = {
  state: "fresh" | "stale" | "missing" | "unknown" | "invalid";
  localManifestVersion?: string;
  registeredVersion?: string;
  extensionPath?: string;
  manifestPath?: string;
  preferencesPath?: string;
  reason?: string;
};

type ChromeInvocation = Extract<CliCommandInvocation, { kind: "chrome" }>;
type ChromePolicyInvocation = Extract<CliCommandInvocation, { kind: "chrome-policy" }>;
type ChromeCommandResult = object & {
  result?: string;
  reason?: unknown;
  nextAction?: unknown;
  observedWindowTitle?: unknown;
  screenshotPath?: unknown;
};

export function createChromeStatusOutput({
  invocation,
  generatedAt,
  extension,
  nativeHost,
  setupGuideFields
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  extension: object;
  nativeHost: object;
  setupGuideFields: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: false,
    extension: {
      ...extension,
      ...setupGuideFields
    },
    nativeHost: {
      ...nativeHost,
      ...setupGuideFields
    },
    setupGuide: setupGuideFields.setupGuide
  };
}

export function createChromeTabsOutput({
  invocation,
  generatedAt,
  tabDiscoveryResult,
  extensionRegistration
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  tabDiscoveryResult: ChromeCommandResult;
  extensionRegistration?: ChromeExtensionRegistrationStatus;
}): Record<string, unknown> {
  const tabDiscoveryOutput = extensionRegistration?.state === "stale"
    ? {
      ...tabDiscoveryResult,
      reason: "extension-registration-stale",
      extensionRegistration,
      nextAction: CHROME_EXTENSION_REGISTRATION_STALE_NEXT_ACTION
    }
    : tabDiscoveryResult;

  return {
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    ...tabDiscoveryOutput
  };
}

export function createChromeTabsErrorOutput({
  invocation,
  generatedAt,
  error
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  error: unknown;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    result: "blocked",
    extensionId: invocation.options.extensionIds[0],
    reason: "chrome-tabs-command-error",
    error: readErrorMessage(error),
    nextAction: "Check that the skfiy Chrome extension is installed, connected to the native host, then retry `skfiy chrome tabs`."
  };
}

export function createChromeExtensionReloadOutput({
  invocation,
  generatedAt,
  reloadResult,
  extensionRegistration
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  reloadResult: ChromeCommandResult;
  extensionRegistration?: ChromeExtensionRegistrationStatus;
}): Record<string, unknown> {
  const reloadOutput = extensionRegistration?.state === "stale"
    ? {
      ...reloadResult,
      reason: "extension-card-reload-required",
      extensionRegistration,
      desktopFallback: compactRecord({
        reason: reloadResult.reason,
        nextAction: reloadResult.nextAction,
        observedWindowTitle: reloadResult.observedWindowTitle,
        screenshotPath: reloadResult.screenshotPath
      }),
      nextAction: CHROME_EXTENSION_CARD_RELOAD_REQUIRED_NEXT_ACTION
    }
    : reloadResult;

  return {
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    ...reloadOutput
  };
}

export function createChromeExtensionReloadErrorOutput({
  invocation,
  generatedAt,
  error,
  productPath
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  error: unknown;
  productPath: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    result: "blocked",
    extensionId: invocation.options.extensionIds[0],
    productPath,
    reason: "reload-command-error",
    error: readErrorMessage(error),
    nextAction: "Check that Chrome is installed, Screen Recording and Accessibility are granted for skfiy, then retry."
  };
}

export function createChromePageControlOutput({
  invocation,
  generatedAt,
  pageControlResult
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  pageControlResult: ChromeCommandResult;
}): Record<string, unknown> {
  return {
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    ...pageControlResult
  };
}

export function createChromePageControlErrorOutput({
  invocation,
  generatedAt,
  error
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  error: unknown;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    result: "blocked",
    action: invocation.subcommand,
    extensionId: invocation.options.extensionIds[0],
    reason: "page-control-command-error",
    error: readErrorMessage(error),
    nextAction: "Check that the skfiy Chrome extension is installed, connected to the native host, and allowed on the target page, then retry."
  };
}

export function createChromeNativeHostMutationOutput({
  invocation,
  generatedAt,
  result
}: {
  invocation: ChromeInvocation;
  generatedAt?: string;
  result: object;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    ...result
  };
}

export function createChromeHostPolicyShowOutput({
  invocation,
  generatedAt,
  hostPolicy
}: {
  invocation: ChromePolicyInvocation;
  generatedAt?: string;
  hostPolicy: object;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: false,
    hostPolicy
  };
}

export function createChromeHostPolicyResetOutput({
  invocation,
  generatedAt,
  hostPolicy
}: {
  invocation: ChromePolicyInvocation;
  generatedAt?: string;
  hostPolicy: object;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    plannedMutation: true,
    executesSystemMutation: true,
    result: "reset",
    hostPolicy
  };
}

export function createChromeHostPolicySetOutput({
  invocation,
  generatedAt,
  host,
  hostPolicy
}: {
  invocation: ChromePolicyInvocation;
  generatedAt?: string;
  host: string;
  hostPolicy: object;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    plannedMutation: true,
    executesSystemMutation: true,
    result: "configured",
    action: invocation.options.action,
    host,
    hostPolicy
  };
}
