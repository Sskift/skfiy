import {
  decideChromeHostPolicy,
  type ChromeHostPolicyState
} from "./chrome-host-policy.js";
import {
  createChromeExtensionStatusWithPageCapabilities,
  createChromePageControlCapability
} from "./cli-chrome-capabilities.js";
import { createChromeSetupGuideFields } from "./cli-chrome-readiness.js";
import {
  compactRecord,
  readBoolean,
  readNumber,
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
  const hostPolicy = readRecord(extension?.hostPolicy) as ChromeHostPolicyState | undefined;
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
    hostPolicy,
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
  if (
    pageControl
    && readString(pageControl.state) !== "ready"
    && !isNonActionablePageControlCurrentPage(pageControl)
    && !isResolvedHostPolicyPageControlBlocker(pageControl, hostPolicy)
  ) {
    blockers.push(createPageControlReadinessBlocker(pageControl));
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

function createPageControlReadinessBlocker(pageControl: Record<string, unknown>): Record<string, unknown> {
  const state = readString(pageControl.state) ?? "unknown";
  const blockerCodes = readPageControlBlockerCodes(pageControl);
  const activeTab = readRecord(pageControl.activeTab);
  const hostPolicy = readRecord(pageControl.hostPolicy);
  const chromeHostPermission = readRecord(pageControl.chromeHostPermission);
  const chromeCapturePermission = readRecord(pageControl.chromeCapturePermission);
  const code = state === "blocked_by_host_policy" || blockerCodes.includes("blocked_by_host_policy")
    ? "browser-context-host-policy-blocked"
    : state === "blocked_by_chrome_host_permission" || blockerCodes.includes("chrome_host_permission_missing")
      ? "chrome-host-permission-missing"
      : "page-control-not-ready";

  return compactRecord({
    code,
    message: readString(pageControl.reason)
      ?? "Chrome extension pageControl readiness has not been proven.",
    state,
    source: readString(pageControl.source) ?? "unknown",
    activeHost: readString(activeTab?.host),
    activeTabId: readNumber(activeTab?.tabId),
    hostPolicyDecision: readString(hostPolicy?.decision),
    hostPolicyReason: readString(hostPolicy?.reason),
    chromeHostPermissionState: readString(chromeHostPermission?.state),
    chromeCapturePermissionState: readString(chromeCapturePermission?.state)
  });
}

function isResolvedHostPolicyPageControlBlocker(
  pageControl: Record<string, unknown>,
  hostPolicy: ChromeHostPolicyState | undefined
): boolean {
  const activeTab = readRecord(pageControl.activeTab);
  const host = readString(activeTab?.host);
  const blockers = readPageControlBlockerCodes(pageControl);

  if (!host || !hostPolicy || blockers.length === 0 || !blockers.includes("blocked_by_host_policy")) {
    return false;
  }

  return decideChromeHostPolicy(hostPolicy.policy, host).decision === "allow";
}

function isNonActionablePageControlCurrentPage(pageControl: Record<string, unknown>): boolean {
  const activeTab = readRecord(pageControl.activeTab);
  const scheme = normalizeUrlScheme(readString(activeTab?.scheme));
  const host = readString(activeTab?.host) ?? "";
  const chromeHostPermission = readRecord(pageControl.chromeHostPermission);
  const blockerCodes = readPageControlBlockerCodes(pageControl);

  return scheme === "chrome"
    || scheme === "chrome-extension"
    || scheme === "file"
    || (scheme !== "" && scheme !== "http" && scheme !== "https")
    || host === "extensions"
    || host.startsWith("chrome://")
    || host.startsWith("chrome-extension://")
    || blockerCodes.includes("internal_chrome_page")
    || blockerCodes.includes("chrome_extension_page")
    || blockerCodes.includes("unsupported_scheme")
    || (
      readString(chromeHostPermission?.state) === "not_applicable"
      && readString(chromeHostPermission?.reason) === "non_http_page"
    );
}

function readPageControlBlockerCodes(pageControl: Record<string, unknown>): string[] {
  const blockers = Array.isArray(pageControl.blockers)
    ? pageControl.blockers.map((blocker) => readRecord(blocker)).filter(Boolean)
    : [];

  return blockers
    .map((blocker) => readString(blocker?.code))
    .filter((code): code is string => Boolean(code));
}

function normalizeUrlScheme(scheme: string | undefined): string {
  return (scheme ?? "").trim().toLowerCase().replace(/:$/, "");
}
