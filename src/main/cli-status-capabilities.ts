import type { ChromeHostPolicyState } from "./chrome-host-policy.js";
import {
  createChromeExtensionStatusWithPageCapabilities,
  createChromePageControlCapability
} from "./cli-chrome-capabilities.js";
import { createChromeSetupGuideFields } from "./cli-chrome-readiness.js";
import {
  readRecord,
  readString,
  readStringArray
} from "./cli-record-utils.js";
import { withFinderSmokeStatus } from "./cli-finder-smoke-status.js";
import {
  createStatusReadinessSummary,
  type StatusReadinessContext
} from "./cli-status-readiness.js";

export function withStatusReadiness<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: StatusReadinessContext & { rootDir?: string }
): TStatus & { readiness: Record<string, unknown> } {
  const statusWithCapabilities = withChromePageCapabilityStatus(status, context);
  const statusWithEvidence = context.rootDir
    ? withFinderSmokeStatus(statusWithCapabilities, { rootDir: context.rootDir })
    : statusWithCapabilities;

  return {
    ...statusWithEvidence,
    readiness: createCliStatusReadinessSummary(statusWithEvidence, context)
  };
}

export function withChromePageCapabilityStatus<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: {
    extensionIds: string[];
    cliShimPath?: string;
  }
): TStatus {
  const extension = readRecord(status.extension);
  const nativeHost = readRecord(status.nativeHost);

  return {
    ...status,
    extension: createChromeExtensionStatusWithPageCapabilities(
      extension ?? { state: "unknown" },
      {
        nativeHost,
        context
      }
    )
  };
}

export function createCliStatusReadinessSummary(
  status: Record<string, unknown>,
  context: StatusReadinessContext
): Record<string, unknown> {
  return createStatusReadinessSummary(
    status,
    context,
    createExtensionReadiness(status, context)
  );
}

function createExtensionReadiness(
  status: Record<string, unknown>,
  context: {
    extensionIds: string[];
    cliShimPath?: string;
  }
): Record<string, unknown> {
  const extension = readRecord(status.extension);
  const nativeHost = readRecord(status.nativeHost);
  const extensionState = readString(extension?.state) ?? "unknown";
  const nativeHostState = readString(nativeHost?.state) ?? "unknown";
  const liveConnection = readString(extension?.liveConnection) ?? "unknown";
  const pageSafety = readRecord(extension?.pageSafety);
  const pageControl = readRecord(extension?.pageControl);
  const extensionIds = context.extensionIds.length > 0
    ? context.extensionIds
    : readStringArray(nativeHost?.extensionIds);
  const connection = readRecord(extension?.connection);
  const setupGuideFields = createChromeSetupGuideFields({
    extensionState,
    nativeHostState,
    liveConnection,
    extensionIds,
    cliShimPath: context.cliShimPath,
    manifestPath: readString(nativeHost?.manifestPath),
    allowedOrigins: readStringArray(extension?.allowedOrigins).length > 0
      ? readStringArray(extension?.allowedOrigins)
      : readStringArray(nativeHost?.allowedOrigins),
    expectedAllowedOrigins: readStringArray(nativeHost?.expectedAllowedOrigins),
    nativeHostReason: readString(nativeHost?.reason) ?? readString(extension?.reason),
    hostPolicy: readRecord(extension?.hostPolicy) as ChromeHostPolicyState | undefined,
    connectionPath: readString(connection?.path),
    connectionState: readString(connection?.state),
    connectionReason: readString(connection?.reason)
  });
  const observed = extensionIds.length > 0
    || extensionState !== "unknown"
    || nativeHostState !== "unknown";

  if (!observed) {
    return {
      state: "unknown",
      ready: false,
      extensionState,
      nativeHostState,
      liveConnection,
      extensionIds,
      ...(pageSafety ? { pageSafety } : {}),
      ...(pageControl ? { pageControl } : {}),
      blockers: [],
      ...setupGuideFields
    };
  }

  const blockers: Array<Record<string, unknown>> = [];

  if (extensionIds.length === 0) {
    blockers.push({
      code: "extension-id-not-provided",
      message: "Pass --extension-id <id> to verify Chrome Native Messaging installation."
    });
  }
  if (nativeHostState !== "installed") {
    blockers.push({
      code: "native-host-not-installed",
      message: "Chrome Native Messaging host is not installed for the requested extension.",
      state: nativeHostState
    });
  } else if (extensionState !== "connected") {
    blockers.push({
      code: "extension-not-connected",
      message: "Chrome Native Messaging host is installed, but no live extension heartbeat is connected.",
      state: extensionState,
      liveConnection
    });
  }
  if (pageControl && readString(pageControl.state) !== "ready") {
    blockers.push({
      code: "page-control-not-ready",
      message: readString(pageControl.reason)
        ?? "Chrome extension pageControl readiness has not been proven.",
      state: readString(pageControl.state) ?? "unknown",
      source: readString(pageControl.source) ?? "unknown"
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    extensionState,
    nativeHostState,
    liveConnection,
    extensionIds,
    ...(pageSafety ? { pageSafety } : {}),
    ...(pageControl ? { pageControl } : {}),
    ...(readString(nativeHost?.manifestPath) ? { manifestPath: readString(nativeHost?.manifestPath) } : {}),
    ...(context.cliShimPath ? { cliShimPath: context.cliShimPath } : {}),
    blockers,
    ...setupGuideFields
  };
}
