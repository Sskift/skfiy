import type { ChromeHostPolicyState } from "./chrome-host-policy.js";
import type { ChromeExtensionConnectionStatus } from "./chrome-native-host.js";
import {
  createChromeSetupGuideFields,
  formatCommandLine,
  readExtensionIdsFromAdapterInput
} from "./cli-chrome-readiness.js";
import {
  CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY,
  CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY
} from "./cli-command-definitions.js";
import {
  readRecord,
  readString,
  readStringArray
} from "./cli-record-utils.js";

const CHROME_PAGE_OBSERVE_MESSAGE_TYPE = "skfiy.page.observe";

export function createChromeExtensionStatusWithPageCapabilities(
  extension: Record<string, unknown>,
  input: {
    nativeHost?: Record<string, unknown>;
    connection?: ChromeExtensionConnectionStatus;
    hostPolicy?: ChromeHostPolicyState | Record<string, unknown>;
    context: {
      extensionIds: string[];
      cliShimPath?: string;
    };
  }
): Record<string, unknown> {
  const capabilities = readRecord(extension.capabilities) ?? {};
  const pageSafety = readRecord(extension.pageSafety)
    ?? createChromePageSafetyCapability({
      extensionState: readString(extension.state) ?? "unknown",
      nativeHostState: readString(extension.nativeHostState)
        ?? readString(input.nativeHost?.state)
        ?? "unknown",
      liveConnection: readString(extension.liveConnection)
        ?? readString(readRecord(extension.connection)?.liveConnection)
        ?? readString(readRecord(extension.connection)?.state)
        ?? readConnectionState(input.connection),
      extensionIds: input.context.extensionIds.length > 0
        ? input.context.extensionIds
        : readStringArray(input.nativeHost?.extensionIds),
      cliShimPath: input.context.cliShimPath ?? readString(input.nativeHost?.cliShimPath),
      connection: readRecord(extension.connection) ?? input.connection,
      hostPolicy: readRecord(extension.hostPolicy) ?? input.hostPolicy,
      nativeHostReason: readString(input.nativeHost?.reason),
      extensionReason: readString(extension.reason)
    });
  const pageControl = normalizeChromePageControlCapability({
    extension,
    nativeHost: input.nativeHost,
    connection: readRecord(extension.connection) ?? input.connection,
    context: input.context
  });

  return {
    ...extension,
    capabilities: {
      ...capabilities,
      pageSafety: pageSafety.capable === true,
      pageControl: pageControl.state === "ready"
    },
    pageSafety,
    pageControl
  };
}

export function createChromePageControlCapability({
  reported,
  source,
  extensionState,
  nativeHostState,
  liveConnection,
  extensionIds
}: {
  reported?: Record<string, unknown>;
  source?: string;
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
}): Record<string, unknown> {
  const reportedCapabilities = readRecord(reported?.capabilities);
  const state = readString(reported?.state)
    ?? (hasChromePageControlProbeEvidence({ extensionState, nativeHostState, liveConnection, extensionIds })
      ? "needs-action"
      : "not-probed");
  const normalizedState = normalizeChromePageControlState(state);
  const reason = readString(reported?.reason)
    ?? createChromePageControlReason({
      state: normalizedState,
      extensionState,
      nativeHostState,
      liveConnection
    });
  const pageControl: Record<string, unknown> = {
    ...reported,
    schemaVersion: 1,
    capability: CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY,
    state: normalizedState,
    reason,
    capabilities: reportedCapabilities ?? {},
    source: source ?? readString(reported?.source) ?? (
      reported ? "extension.pageControl" : normalizedState === "not-probed" ? "not-probed" : "cli-status-derived"
    ),
    nextAction: createChromePageControlOperatorNextAction({
      reported,
      state: normalizedState,
      extensionIds
    }) ?? createChromePageControlNextAction({
      state: normalizedState,
      extensionIds
    })
  };

  return pageControl;
}

export function createChromePageControlNextAction({
  state,
  extensionIds
}: {
  state: string;
  extensionIds: string[];
}): string {
  const extensionId = extensionIds[0] ?? "<extension-id>";

  if (state === "ready") {
    return "Chrome extension page control is ready for the current page.";
  }
  if (state === "not-probed") {
    return `Run \`skfiy chrome status --json --extension-id ${extensionId}\` after opening a controllable Chrome page.`;
  }
  return `Open a controllable Chrome tab, grant any requested site access, refresh the skfiy extension, then rerun \`skfiy chrome status --json --extension-id ${extensionId}\`.`;
}

export function createChromePageSafetyCapability({
  extensionState,
  nativeHostState,
  liveConnection,
  extensionIds,
  cliShimPath,
  connection,
  hostPolicy,
  nativeHostReason,
  extensionReason
}: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
  cliShimPath?: string;
  connection?: ChromeExtensionConnectionStatus | Record<string, unknown>;
  hostPolicy?: ChromeHostPolicyState | Record<string, unknown>;
  nativeHostReason?: string;
  extensionReason?: string;
}): Record<string, unknown> {
  const hostPolicyRecord = readRecord(hostPolicy);
  const hostPolicyPolicy = readRecord(hostPolicyRecord?.policy);
  const hostPolicyState = readString(hostPolicyRecord?.state) ?? "unknown";
  const hostPolicyDefaultMode = readString(hostPolicyPolicy?.defaultMode) ?? "unknown";
  const connectionRecord = readRecord(connection);
  const connectionState = readString(connectionRecord?.state) ?? liveConnection;
  const connectionMessageType = readString(connectionRecord?.messageType);
  const nativeMessagingReady = nativeHostState === "installed";
  const hostPolicyFailClosed = (
    hostPolicyState === "default"
    || hostPolicyState === "configured"
  ) && hostPolicyDefaultMode === "ask";
  const pageObservationHeartbeat =
    connectionState === "connected"
    && connectionMessageType === CHROME_PAGE_OBSERVE_MESSAGE_TYPE;
  const capable = nativeMessagingReady && hostPolicyFailClosed && pageObservationHeartbeat;
  const connectionPath = readString(connectionRecord?.path);
  const connectionObservedAt = readString(connectionRecord?.observedAt);
  const connectionLaunchOrigin = readString(connectionRecord?.launchOrigin);
  const connectionRequestId = readString(connectionRecord?.requestId);
  const connectionReason = readString(connectionRecord?.reason);
  const state = capable
    ? "ready"
    : hostPolicyState === "invalid" || nativeHostState === "invalid"
      ? "blocked"
      : hasChromePageSafetyEvidence({
          extensionState,
          nativeHostState,
          liveConnection,
          hostPolicyState,
          connectionState,
          connectionMessageType,
          extensionIds
        })
        ? "needs-action"
        : "unknown";

  return {
    schemaVersion: 1,
    capability: CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY,
    capable,
    state,
    nextAction: createChromePageSafetyNextAction({
      capable,
      nativeHostState,
      hostPolicyState,
      connectionState,
      connectionMessageType,
      extensionIds
    }),
    evidence: {
      nativeMessaging: nativeMessagingReady,
      nativeHostState,
      ...(nativeHostReason ? { nativeHostReason } : {}),
      hostPolicy: {
        state: hostPolicyState,
        defaultMode: hostPolicyDefaultMode,
        failClosed: hostPolicyFailClosed,
        ...(readString(hostPolicyRecord?.path) ? { path: readString(hostPolicyRecord?.path) } : {}),
        entryCount: countChromeHostPolicyEntries(hostPolicyPolicy)
      },
      liveConnection: {
        state: connectionState,
        liveConnection,
        messageType: connectionMessageType ?? "unknown",
        pageObservationHeartbeat,
        ...(connectionPath ? { path: connectionPath } : {}),
        ...(typeof connectionRecord?.ageSeconds === "number" ? { ageSeconds: connectionRecord.ageSeconds } : {}),
        ...(connectionObservedAt ? { observedAt: connectionObservedAt } : {}),
        ...(connectionLaunchOrigin ? { launchOrigin: connectionLaunchOrigin } : {}),
        ...(connectionRequestId ? { requestId: connectionRequestId } : {}),
        ...(connectionReason ? { reason: connectionReason } : {})
      },
      extensionState,
      extensionIds,
      ...(cliShimPath ? { cliShimPath } : {}),
      ...(extensionReason ? { extensionReason } : {})
    }
  };
}

export function createChromeExtensionAdapterStatus(
  nativeHost: {
    state?: unknown;
    reason?: unknown;
    manifestPath?: unknown;
    cliShimPath?: unknown;
    extensionIds?: unknown;
    allowedOrigins?: unknown;
    expectedAllowedOrigins?: unknown;
  },
  connection?: ChromeExtensionConnectionStatus,
  hostPolicy?: ChromeHostPolicyState
): Record<string, unknown> {
  const allowedOrigins = Array.isArray(nativeHost.allowedOrigins)
    ? nativeHost.allowedOrigins.filter((origin): origin is string => typeof origin === "string")
    : [];
  const common = {
    bridge: "native-messaging",
    liveConnection: readConnectionState(connection),
    nativeHostState: nativeHost.state,
    ...(typeof nativeHost.manifestPath === "string" ? { manifestPath: nativeHost.manifestPath } : {}),
    ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    ...(connection && connection.state !== "unknown" ? { connection } : {}),
    ...(hostPolicy ? { hostPolicy } : {})
  };
  const createSetupFields = (extensionState: string, nativeHostState: string) => createChromeSetupGuideFields({
    extensionState,
    nativeHostState,
    liveConnection: readConnectionState(connection),
    extensionIds: readExtensionIdsFromAdapterInput(nativeHost),
    cliShimPath: readString(nativeHost.cliShimPath),
    manifestPath: readString(nativeHost.manifestPath),
    allowedOrigins,
    expectedAllowedOrigins: readStringArray(nativeHost.expectedAllowedOrigins),
    nativeHostReason: readString(nativeHost.reason),
    hostPolicy,
    connectionPath: connection?.path,
    connectionState: connection?.state,
    connectionReason: connection?.reason
  });
  const withPageCapabilities = (extension: Record<string, unknown>) =>
    createChromeExtensionStatusWithPageCapabilities(extension, {
      nativeHost,
      connection,
      hostPolicy,
      context: {
        extensionIds: readExtensionIdsFromAdapterInput(nativeHost),
        cliShimPath: readString(nativeHost.cliShimPath)
      }
    });

  if (connection?.state === "connected") {
    return withPageCapabilities({
      state: "connected",
      ...common,
      ...createSetupFields("connected", readString(nativeHost.state) ?? "unknown")
    });
  }

  if (connection?.state === "stale" && nativeHost.state === "installed") {
    return withPageCapabilities({
      state: "native-host-installed",
      ...common,
      ...createSetupFields("native-host-installed", "installed"),
      reason: "Chrome extension native-message heartbeat is stale."
    });
  }

  if (nativeHost.state === "installed") {
    return withPageCapabilities({
      state: "native-host-installed",
      ...common,
      ...createSetupFields("native-host-installed", "installed"),
      reason: "Chrome Native Messaging host is installed; no live Chrome extension connection has been observed yet."
    });
  }

  if (nativeHost.state === "missing") {
    return withPageCapabilities({
      state: "native-host-missing",
      ...common,
      ...createSetupFields("native-host-missing", "missing"),
      reason: "Chrome Native Messaging host manifest is not installed."
    });
  }

  if (nativeHost.state === "cli-missing") {
    return withPageCapabilities({
      state: "native-host-cli-missing",
      ...common,
      ...createSetupFields("native-host-cli-missing", "cli-missing"),
      reason: "The Chrome Native Messaging host cannot run because the packaged skfiy CLI is missing."
    });
  }

  if (nativeHost.state === "mismatched") {
    return withPageCapabilities({
      state: "native-host-mismatched",
      ...common,
      ...createSetupFields("native-host-mismatched", "mismatched"),
      reason: "Chrome Native Messaging host manifest points at a different skfiy CLI."
    });
  }

  if (nativeHost.state === "invalid") {
    return withPageCapabilities({
      state: "native-host-invalid",
      ...common,
      ...createSetupFields("native-host-invalid", "invalid"),
      reason: "Chrome Native Messaging host manifest is invalid."
    });
  }

  return withPageCapabilities(createUnknownExtensionStatus(
    typeof nativeHost.reason === "string"
      ? nativeHost.reason
      : "Runtime Chrome extension connection is not probed by the CLI status command yet."
  ));
}

export function readConnectionState(connection: ChromeExtensionConnectionStatus | undefined): string {
  return connection?.liveConnection === "connected" || connection?.liveConnection === "stale"
    ? connection.liveConnection
    : "unknown";
}

function createUnknownExtensionStatus(
  reason = "Runtime Chrome extension connection is not probed by the CLI status command yet."
): Record<string, unknown> {
  return {
    state: "unknown",
    reason
  };
}

function normalizeChromePageControlCapability({
  extension,
  nativeHost,
  connection,
  context
}: {
  extension: Record<string, unknown>;
  nativeHost?: Record<string, unknown>;
  connection?: ChromeExtensionConnectionStatus | Record<string, unknown>;
  context: {
    extensionIds: string[];
    cliShimPath?: string;
  };
}): Record<string, unknown> {
  const existing = readChromePageControlEvidence(extension, readRecord(connection));
  if (existing) {
    return createChromePageControlCapability({
      reported: existing.record,
      source: existing.source,
      extensionState: readString(extension.state) ?? "unknown",
      nativeHostState: readString(extension.nativeHostState)
        ?? readString(nativeHost?.state)
        ?? "unknown",
      liveConnection: readString(extension.liveConnection)
        ?? readString(readRecord(extension.connection)?.liveConnection)
        ?? readString(readRecord(extension.connection)?.state)
        ?? readConnectionState(connection as ChromeExtensionConnectionStatus | undefined),
      extensionIds: context.extensionIds.length > 0
        ? context.extensionIds
        : readStringArray(nativeHost?.extensionIds)
    });
  }

  return createChromePageControlCapability({
    extensionState: readString(extension.state) ?? "unknown",
    nativeHostState: readString(extension.nativeHostState)
      ?? readString(nativeHost?.state)
      ?? "unknown",
    liveConnection: readString(extension.liveConnection)
      ?? readString(readRecord(extension.connection)?.liveConnection)
      ?? readString(readRecord(extension.connection)?.state)
      ?? readConnectionState(connection as ChromeExtensionConnectionStatus | undefined),
    extensionIds: context.extensionIds.length > 0
      ? context.extensionIds
      : readStringArray(nativeHost?.extensionIds)
  });
}

function readChromePageControlEvidence(
  extension: Record<string, unknown>,
  connection?: Record<string, unknown>
): { record: Record<string, unknown>; source: string } | undefined {
  const direct = readRecord(extension.pageControl);
  if (direct) {
    return { record: direct, source: readString(direct.source) ?? "extension.pageControl" };
  }

  const connectionPageControl = readRecord(connection?.pageControl);
  if (connectionPageControl) {
    return {
      record: connectionPageControl,
      source: readString(connectionPageControl.source) ?? "extension.connection.pageControl"
    };
  }

  const diagnostics = readRecord(extension.diagnostics);
  const currentTab = readRecord(diagnostics?.currentTab);
  const currentTabPageControl = readRecord(currentTab?.pageControl);
  if (currentTabPageControl) {
    return {
      record: currentTabPageControl,
      source: readString(currentTabPageControl.source) ?? "extension.diagnostics.currentTab.pageControl"
    };
  }

  const diagnosticsSession = readRecord(diagnostics?.session);
  const diagnosticsSessionPageControl = readRecord(diagnosticsSession?.pageControl);
  if (diagnosticsSessionPageControl) {
    return {
      record: diagnosticsSessionPageControl,
      source: readString(diagnosticsSessionPageControl.source) ?? "extension.diagnostics.session.pageControl"
    };
  }

  const session = readRecord(extension.session);
  const sessionPageControl = readRecord(session?.pageControl);
  if (sessionPageControl) {
    return {
      record: sessionPageControl,
      source: readString(sessionPageControl.source) ?? "extension.session.pageControl"
    };
  }

  const smoke = readRecord(extension.smoke) ?? readRecord(extension.smokeArtifact);
  const smokeDiagnostics = readRecord(smoke?.diagnostics);
  const smokeDiagnosticsCurrentTab = readRecord(smokeDiagnostics?.currentTab);
  const smokeDiagnosticsSession = readRecord(smokeDiagnostics?.session);
  const smokePageControl = readRecord(smoke?.pageControl)
    ?? readRecord(smokeDiagnosticsCurrentTab?.pageControl)
    ?? readRecord(smokeDiagnosticsSession?.pageControl);
  const smokePageControlRecord = readRecord(smokePageControl);
  if (smokePageControlRecord) {
    return {
      record: smokePageControlRecord,
      source: readString(smokePageControlRecord.source) ?? "extension.smoke.pageControl"
    };
  }

  return undefined;
}

function normalizeChromePageControlState(state: string): string {
  return state;
}

function hasChromePageControlProbeEvidence({
  extensionState,
  nativeHostState,
  liveConnection,
  extensionIds
}: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
}): boolean {
  return extensionState !== "unknown"
    || nativeHostState !== "unknown"
    || liveConnection !== "unknown"
    || extensionIds.length > 0;
}

function createChromePageControlReason({
  state,
  extensionState,
  nativeHostState,
  liveConnection
}: {
  state: string;
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
}): string {
  if (state === "ready") {
    return "Chrome extension page control readiness was reported by the extension.";
  }
  if (state === "not-probed") {
    return "Chrome extension page control readiness has not been reported yet.";
  }
  if (nativeHostState !== "installed") {
    return "Chrome page control needs an installed Native Messaging host before extension readiness can be trusted.";
  }
  if (extensionState !== "connected" || liveConnection !== "connected") {
    return "Chrome page control needs a live extension heartbeat plus page diagnostics.";
  }
  return "Chrome extension did not report pageControl readiness for the current page.";
}

function createChromePageControlOperatorNextAction({
  reported,
  state,
  extensionIds
}: {
  reported?: Record<string, unknown>;
  state: string;
  extensionIds: string[];
}): string | undefined {
  const reportedNextAction = readString(reported?.nextAction);

  if (!reportedNextAction) {
    return undefined;
  }
  if (!isChromePageControlMachineNextAction(reportedNextAction)) {
    return reportedNextAction;
  }

  const extensionId = extensionIds[0] ?? "<extension-id>";
  const activeTab = readRecord(reported?.activeTab);
  const chromeHostPermission = readRecord(reported?.chromeHostPermission);
  const chromeCapturePermission = readRecord(reported?.chromeCapturePermission);
  const blockers = Array.isArray(reported?.blockers)
    ? reported.blockers.map((blocker) => readRecord(blocker)).filter(Boolean)
    : [];
  const blockerCodes = blockers
    .map((blocker) => readString(blocker?.code))
    .filter(Boolean);
  const host = readString(activeTab?.host)
    ?? readString(chromeHostPermission?.host)
    ?? readChromeHostFromPermissionOrigin(readString(chromeHostPermission?.origin));
  const chromeHostOrigins = readStringArray(chromeHostPermission?.origins);
  const chromeCaptureOrigins = readStringArray(chromeCapturePermission?.origins);
  const chromePopupGrantOrigins = [
    ...(reportedNextAction === "grant_chrome_host_permission"
      || readString(chromeHostPermission?.state) === "missing"
      || blockerCodes.includes("chrome_host_permission_missing")
      ? [chromeHostOrigins[0] ?? readString(chromeHostPermission?.origin) ?? "the active page"]
      : []),
    ...(reportedNextAction === "grant_chrome_capture_permission"
      || readString(chromeCapturePermission?.state) === "missing"
      || blockerCodes.includes("chrome_capture_permission_missing")
      ? [chromeCaptureOrigins[0] ?? "<all_urls>"]
      : [])
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  const actions: string[] = [];

  if (state === "ready") {
    return "Chrome extension page control is ready for the current page.";
  }

  if (
    reportedNextAction === "allow_host"
    || state === "blocked_by_host_policy"
    || blockerCodes.includes("blocked_by_host_policy")
  ) {
    actions.push(host
      ? `Run \`${formatCommandLine(["skfiy", "chrome", "policy", "set", "--host", host, "--action", "allow-current-turn"])}\` or approve the host in Dashboard Chrome policy.`
      : "Allow the current host in Dashboard Chrome policy.");
  }

  if (chromePopupGrantOrigins.length > 0) {
    actions.push(
      `Open Dashboard > Browser and click Open access page, then click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`
    );
    actions.push(
      `Open the skfiy extension popup and click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`
    );
  }

  if (actions.length === 0) {
    actions.push(
      `Refresh the skfiy Chrome extension, then rerun \`${formatCommandLine(["skfiy", "chrome", "status", "--json", "--extension-id", extensionId])}\`.`
    );
  }

  return actions.join(" ");
}

function isChromePageControlMachineNextAction(value: string): boolean {
  return value === "allow_host"
    || value === "grant_chrome_host_permission"
    || value === "grant_chrome_capture_permission"
    || value === "send_page_action";
}

function readChromeHostFromPermissionOrigin(origin: string | undefined): string | undefined {
  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin).host || undefined;
  } catch {
    return undefined;
  }
}

function hasChromePageSafetyEvidence({
  extensionState,
  nativeHostState,
  liveConnection,
  hostPolicyState,
  connectionState,
  connectionMessageType,
  extensionIds
}: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  hostPolicyState: string;
  connectionState: string;
  connectionMessageType?: string;
  extensionIds: string[];
}): boolean {
  return extensionState !== "unknown"
    || nativeHostState !== "unknown"
    || liveConnection !== "unknown"
    || hostPolicyState !== "unknown"
    || connectionState !== "unknown"
    || Boolean(connectionMessageType)
    || extensionIds.length > 0;
}

function createChromePageSafetyNextAction({
  capable,
  nativeHostState,
  hostPolicyState,
  connectionState,
  connectionMessageType,
  extensionIds
}: {
  capable: boolean;
  nativeHostState: string;
  hostPolicyState: string;
  connectionState: string;
  connectionMessageType?: string;
  extensionIds: string[];
}): string {
  const extensionId = extensionIds[0] ?? "<extension-id>";

  if (capable) {
    return "Chrome extension page safety is evidenced by a fresh page observation heartbeat and ask-by-default host policy.";
  }
  if (nativeHostState !== "installed") {
    return `Run \`skfiy chrome install-host --extension-id ${extensionId}\` before relying on Chrome page-safety evidence.`;
  }
  if (hostPolicyState === "invalid") {
    return "Run `skfiy chrome policy reset` so Chrome page safety can fail closed with default ask mode.";
  }
  if (hostPolicyState !== "default" && hostPolicyState !== "configured") {
    return "Run `skfiy chrome policy show --json` to verify the Chrome page-safety host policy file.";
  }
  if (connectionState !== "connected" || connectionMessageType !== CHROME_PAGE_OBSERVE_MESSAGE_TYPE) {
    return `Refresh the skfiy Chrome extension, observe one page, then run \`skfiy chrome status --json --extension-id ${extensionId}\`.`;
  }

  return `Run \`skfiy chrome status --json --extension-id ${extensionId}\` to collect Chrome page-safety evidence.`;
}

function countChromeHostPolicyEntries(policy: Record<string, unknown> | undefined): number {
  if (!policy) {
    return 0;
  }

  return readStringArray(policy.allowedHosts).length
    + readStringArray(policy.currentTurnAllowedHosts).length
    + readStringArray(policy.blockedHosts).length;
}
