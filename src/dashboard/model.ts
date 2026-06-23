import type { DashboardProviderSummary, DashboardSnapshot } from "./contracts";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface DashboardStatusItem {
  label: string;
  value: string;
  tone: Tone;
}

export interface DashboardReadinessSummary {
  title: string;
  label: string;
  detail: string;
  tone: Tone;
}

export interface DashboardComputerUseReadiness {
  desktop: {
    value: string;
    detail: string;
    tone: Tone;
  };
  permissions: DashboardStatusItem[];
}

export interface DashboardAppReadinessLane {
  id: "chrome" | "finder" | "ghostty";
  title: string;
  value: string;
  detail: string;
  source: string;
  tone: Tone;
}

export interface DashboardDogfoodSummary {
  releaseState: string;
  releaseDriftState: string;
  cohortLabel: string;
  detail: string;
  tone: Tone;
}

export interface DashboardCapabilitySummary {
  id: "provider" | "computer-use" | "browser" | "dogfood";
  title: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface DashboardRecentActivity {
  latestMessage: string;
  turnState: string;
  replayState: string;
  command?: string;
  targetApp?: string;
  actionCount?: number;
  screenshotCount?: number;
  verificationCount?: number;
}

export interface DashboardNextAction {
  title: string;
  detail: string;
  tone: Tone;
  source: string;
}

export interface DashboardChromeHostPolicySummary {
  state: string;
  reason?: string;
  source?: string;
  updatedAt?: string;
  defaultMode: string;
  entries: string[];
  tone: Tone;
}

export interface DashboardBrowserContextSummary {
  state: string;
  label: string;
  tone: Tone;
  source?: string;
  url?: string;
  title?: string;
  observedAt?: string;
  reason: string;
  nextAction?: string;
}

export interface DashboardChromeControlState {
  label: string;
  host: string;
  activeTabLabel: string;
  tabId?: number;
  windowId?: number;
  extensionId?: string;
  chromeAppName?: string;
  liveConnection: string;
  nativeHostState: string;
  tone: Tone;
  capabilities: string[];
  capable: boolean;
  actionable: boolean;
  actionUnavailableReason?: string;
  reason: string;
  nextAction?: string;
  contentScript?: string;
  screenshotLane: string;
  tabDiscoveryLabel: string;
  tabDiscoveryReason?: string;
  browserContext: DashboardBrowserContextSummary;
  hostPolicy: DashboardChromeHostPolicySummary;
}

export function readSnapshotState(snapshot: DashboardSnapshot): DashboardStatusItem[] {
  return [
    {
      label: "Desktop",
      value: readNestedString(snapshot.runtimeHealth, ["desktopSession", "state"]) ?? "unknown",
      tone: readNestedString(snapshot.runtimeHealth, ["desktopSession", "state"]) === "controllable"
        ? "success"
        : "warning"
    },
    {
      label: "Extension",
      value: readNestedString(snapshot.runtimeHealth, ["extension", "liveConnection"])
        ?? readNestedString(snapshot.runtimeHealth, ["extension", "state"])
        ?? "unknown",
      tone: readNestedString(snapshot.runtimeHealth, ["extension", "liveConnection"]) === "connected"
        ? "success"
        : "warning"
    },
    {
      label: "Turn",
      value: readString(snapshot.currentTurn.state) ?? "idle",
      tone: snapshot.currentTurn.state === "failed" ? "danger" : "neutral"
    }
  ];
}

export function readChromeControlState(snapshot: DashboardSnapshot): DashboardChromeControlState {
  const extension = readRecord(snapshot.runtimeHealth.extension);
  const nativeHost = readRecord(snapshot.runtimeHealth.nativeHost);
  const desktopSession = readRecord(snapshot.runtimeHealth.desktopSession);
  const pageControl = readRecord(extension?.pageControl);
  const activeTab = readRecord(pageControl?.activeTab);
  const capabilities = readRecord(pageControl?.capabilities);
  const contentScript = readRecord(pageControl?.contentScript);
  const browserContext = readDashboardBrowserContextSummary(readRecord(extension?.browserContext), pageControl);
  const capabilityLabels = Object.entries(capabilities ?? {})
    .filter(([, value]) => value === true || typeof value === "string")
    .map(([key, value]) => typeof value === "string" ? `${key}: ${value}` : key);
  const state = readString(pageControl?.state) ?? "unknown";
  const capable = typeof pageControl?.capable === "boolean"
    ? pageControl.capable
    : state === "ready";
  const host = readString(activeTab?.host) ?? "No active ordinary page";
  const tabId = readNumber(activeTab?.tabId);
  const windowId = readNumber(activeTab?.windowId);
  const extensionId = readChromeExtensionId(extension, nativeHost);
  const liveConnection = readString(extension?.liveConnection)
    ?? readNestedString(extension ?? {}, ["connection", "liveConnection"])
    ?? readNestedString(extension ?? {}, ["connection", "state"])
    ?? readString(extension?.state)
    ?? "unknown";
  const nativeHostState = readString(nativeHost?.state)
    ?? readString(extension?.nativeHostState)
    ?? "unknown";
  const screenshotLane = readChromeScreenshotLane(pageControl, capabilities);
  const tabDiscovery = readChromeTabDiscoverySummary(extension);
  const hostPolicy = readChromeHostPolicySummary(
    readRecord(extension?.hostPolicy)
      ?? readRecord(snapshot.runtimeHealth.chromeHostPolicy)
      ?? readRecord(pageControl?.hostPolicy)
  );
  const actionable = isChromeControlActionable({
    desktopSession,
    extension,
    liveConnection,
    nativeHostState,
    pageControl,
    capabilities
  });
  const actionUnavailableReason = readChromeActionUnavailableReason({
    actionable,
    extensionId,
    tabId
  });

  return {
    label: state,
    host,
    activeTabLabel: formatChromeActiveTabLabel(host, tabId),
    tabId,
    windowId,
    extensionId,
    chromeAppName: readString(extension?.chromeAppName),
    liveConnection,
    nativeHostState,
    tone: state === "ready" && capable
      ? "success"
      : state === "unavailable" || state === "blocked"
        ? "danger"
        : "warning",
    capabilities: capabilityLabels,
    capable,
    actionable,
    actionUnavailableReason,
    reason: readString(pageControl?.reason) ?? "Browser control readiness has not reported a reason.",
    nextAction: readString(pageControl?.nextAction),
    contentScript: readString(contentScript?.state),
    screenshotLane,
    tabDiscoveryLabel: tabDiscovery.label,
    tabDiscoveryReason: tabDiscovery.reason,
    browserContext,
    hostPolicy
  };
}

function readDashboardBrowserContextSummary(
  browserContext: Record<string, unknown> | undefined,
  pageControl: Record<string, unknown> | undefined
): DashboardBrowserContextSummary {
  const state = readString(browserContext?.state) ?? "missing";
  const title = readString(browserContext?.title);
  const url = readString(browserContext?.url);
  const nextAction = readString(browserContext?.nextAction);
  const reason = readString(browserContext?.reason)
    ?? readString(pageControl?.reason)
    ?? "Browser Context has not reported readiness.";

  return {
    state,
    label: title ?? url ?? titleize(state),
    tone: readBrowserContextTone(state),
    source: readString(browserContext?.source),
    url,
    title,
    observedAt: readString(browserContext?.observedAt),
    reason,
    nextAction
  };
}

function readBrowserContextTone(state: string): Tone {
  if (state === "ready") {
    return "success";
  }
  if (state === "partial" || state === "sensitive-paused" || state === "stale" || state === "not-probed") {
    return "warning";
  }
  if (
    state.startsWith("blocked")
    || state === "unavailable"
    || state === "active_tab_unavailable"
    || state === "content_script_not_loaded"
    || state === "not_loaded"
  ) {
    return "danger";
  }

  return "neutral";
}

function readChromeExtensionId(
  extension: Record<string, unknown> | undefined,
  nativeHost: Record<string, unknown> | undefined
): string | undefined {
  return readString(extension?.extensionId)
    ?? readStringArray(extension?.extensionIds)[0]
    ?? readString(nativeHost?.extensionId)
    ?? readStringArray(nativeHost?.extensionIds)[0]
    ?? readChromeExtensionIdFromAllowedOrigins(readStringArray(extension?.allowedOrigins))
    ?? readChromeExtensionIdFromAllowedOrigins(readStringArray(nativeHost?.allowedOrigins));
}

function readChromeExtensionIdFromAllowedOrigins(origins: string[]): string | undefined {
  for (const origin of origins) {
    const match = origin.match(/^chrome-extension:\/\/([a-z]{32})\//i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function formatChromeActiveTabLabel(host: string, tabId: number | undefined): string {
  return Number.isInteger(tabId) ? `${host} tab ${tabId}` : host;
}

function readChromeScreenshotLane(
  pageControl: Record<string, unknown> | undefined,
  capabilities: Record<string, unknown> | undefined
): string {
  const screenshot = capabilities?.screenshot;
  const domActions = capabilities?.domActions;
  if (domActions === true && screenshot !== true) {
    return "screenshot needs permission";
  }
  if (screenshot === true) {
    return "ready";
  }
  if (isChromeInternalPage(pageControl)) {
    return "blocked";
  }

  return "fallback available";
}

function readChromeTabDiscoverySummary(extension: Record<string, unknown> | undefined): {
  label: string;
  reason?: string;
} {
  const candidate = [
    readRecord(extension?.tabDiscovery),
    readRecord(extension?.pageTabs)
  ].find(Boolean);
  if (!candidate) {
    return { label: "not-probed" };
  }

  const state = readString(candidate.state)
    ?? readString(candidate.result)
    ?? "reported";
  const discoveryMode = readString(candidate.discoveryMode) ?? readString(candidate.mode);
  const tabCount = readRecordArray(candidate.tabs).length;
  const reason = readString(candidate.reason) ?? readString(candidate.fallbackReason);
  if (discoveryMode === "chrome-apple-events") {
    return {
      label: "Using Chrome tab fallback",
      reason
    };
  }

  return {
    label: tabCount > 0 ? `${state} · ${tabCount} tab${tabCount === 1 ? "" : "s"}` : state,
    reason
  };
}

function readChromeHostPolicySummary(
  hostPolicy: Record<string, unknown> | undefined
): DashboardChromeHostPolicySummary {
  const policy = readRecord(hostPolicy?.policy);
  const entries = readChromeHostPolicyEntries(hostPolicy, policy);
  const state = readString(hostPolicy?.state) ?? "unknown";

  return {
    state,
    reason: readString(hostPolicy?.reason),
    source: readString(hostPolicy?.source),
    updatedAt: readString(hostPolicy?.updatedAt),
    defaultMode: readString(policy?.defaultMode) ?? "ask",
    entries,
    tone: state === "invalid" ? "danger" : state === "configured" ? "success" : "warning"
  };
}

function readChromeHostPolicyEntries(
  hostPolicy: Record<string, unknown> | undefined,
  policy: Record<string, unknown> | undefined
): string[] {
  const entries = readRecordArray(hostPolicy?.entries).map(formatChromeHostPolicyEntry);
  if (entries.length > 0) {
    return entries;
  }

  return [
    ...readStringArray(policy?.allowedHosts).map((host) => `allow:always:${host}`),
    ...readStringArray(policy?.currentTurnAllowedHosts).map((host) => `allow:current-turn:${host}`),
    ...readStringArray(policy?.blockedHosts).map((host) => `block:host:${host}`)
  ];
}

function formatChromeHostPolicyEntry(entry: Record<string, unknown>): string {
  return [
    readString(entry.decision) ?? "policy",
    readString(entry.scope) ?? "host",
    readString(entry.host) ?? "unknown"
  ].join(":");
}

function isChromeControlActionable({
  capabilities,
  desktopSession,
  extension,
  liveConnection,
  nativeHostState,
  pageControl
}: {
  capabilities: Record<string, unknown> | undefined;
  desktopSession: Record<string, unknown> | undefined;
  extension: Record<string, unknown> | undefined;
  liveConnection: string;
  nativeHostState: string;
  pageControl: Record<string, unknown> | undefined;
}): boolean {
  const state = readString(pageControl?.state) ?? "";
  const blockerCodes = readChromeBlockerCodes(pageControl);
  if (
    (nativeHostState !== "installed" || liveConnection !== "connected" || readString(extension?.state) === "stale")
    && isDesktopLockedForChromeRefresh(desktopSession)
  ) {
    return false;
  }
  if (nativeHostState !== "installed" || liveConnection !== "connected" || readString(extension?.state) === "stale") {
    return false;
  }
  if (isChromeInternalPage(pageControl)) {
    return false;
  }
  if (
    state === "blocked_by_host_policy"
    || state === "blocked_by_chrome_host_permission"
    || blockerCodes.includes("blocked_by_host_policy")
    || blockerCodes.includes("blocked_by_chrome_host_permission")
  ) {
    return false;
  }

  return capabilities?.domActions === true
    && (pageControl?.capable === true || state === "ready" || state === "partial");
}

function readChromeActionUnavailableReason({
  actionable,
  extensionId,
  tabId
}: {
  actionable: boolean;
  extensionId: string | undefined;
  tabId: number | undefined;
}): string | undefined {
  if (!actionable) {
    return "Chrome page actions are not ready for the current tab.";
  }
  if (!extensionId) {
    return "Chrome extension id is not available yet.";
  }
  if (!Number.isInteger(tabId)) {
    return "Active Chrome tab id is not available yet.";
  }

  return undefined;
}

function isChromeInternalPage(pageControl: Record<string, unknown> | undefined): boolean {
  const activeTab = readRecord(pageControl?.activeTab);
  const blockerCodes = readChromeBlockerCodes(pageControl);
  const scheme = readString(activeTab?.scheme) ?? "";
  const host = readString(activeTab?.host) ?? "";
  return scheme === "chrome"
    || scheme === "chrome-extension"
    || host.startsWith("chrome://")
    || host.startsWith("chrome-extension://")
    || blockerCodes.includes("internal_chrome_page")
    || blockerCodes.includes("chrome_extension_page");
}

function readChromeBlockerCodes(pageControl: Record<string, unknown> | undefined): string[] {
  return readRecordArray(pageControl?.blockers)
    .map((blocker) => readString(blocker.code))
    .filter((code): code is string => Boolean(code));
}

function isDesktopLockedForChromeRefresh(
  desktopSession: Record<string, unknown> | undefined
): boolean {
  return readString(desktopSession?.state) === "blocked"
    || desktopSession?.mainDisplayAsleep === true
    || desktopSession?.cgSessionScreenIsLocked === true
    || desktopSession?.ioConsoleLocked === true
    || readString(desktopSession?.frontmostBundleId) === "com.apple.loginwindow";
}

export function readReadinessSummary(snapshot: DashboardSnapshot): DashboardReadinessSummary {
  const state = readNestedString(snapshot.operatorReadiness, ["state"]) ?? "unknown";

  if (state === "ready") {
    return {
      title: "Ready for Computer Use",
      label: "ready",
      detail: "Agent, browser, packaged runtime, and fresh evidence are aligned.",
      tone: "success"
    };
  }

  if (state === "blocked") {
    return {
      title: "Needs attention before control",
      label: "blocked",
      detail: "One or more required runtime checks are blocking safe operation.",
      tone: "danger"
    };
  }

  return {
    title: "Needs fresh readiness evidence",
    label: state,
    detail: "The runtime is present, but skfiy needs newer proof before it can be treated as ready.",
    tone: "warning"
  };
}

export function readComputerUseReadiness(snapshot: DashboardSnapshot): DashboardComputerUseReadiness {
  const desktopSession = readRecord(snapshot.runtimeHealth.desktopSession);
  const desktopState = readString(desktopSession?.state) ?? "unknown";
  const frontmost = readString(desktopSession?.frontmostLocalizedName)
    ?? readString(desktopSession?.frontmostBundleId)
    ?? "No frontmost app reported";

  return {
    desktop: {
      value: desktopState,
      detail: frontmost,
      tone: desktopState === "controllable"
        ? "success"
        : desktopState === "blocked"
          ? "danger"
          : "warning"
    },
    permissions: [
      createPermissionStatus("Screen Recording", snapshot.permissions.screenRecording),
      createPermissionStatus("Accessibility", snapshot.permissions.accessibility),
      createPermissionStatus("Finder Automation", snapshot.permissions.finderAutomation)
    ]
  };
}

export function readAppReadinessLanes(snapshot: DashboardSnapshot): DashboardAppReadinessLane[] {
  const appReadiness = readRecord(snapshot.operatorReadiness.appReadiness);

  return [
    createAppReadinessLane("chrome", "Chrome readiness", readRecord(appReadiness?.chrome)),
    createAppReadinessLane("finder", "Finder readiness", readRecord(appReadiness?.finder)),
    createAppReadinessLane("ghostty", "Ghostty readiness", readRecord(appReadiness?.ghostty))
  ];
}

export function readUnsupportedSmokeEvidence(snapshot: DashboardSnapshot): string | undefined {
  const unsupported = readStringArray(readRecord(snapshot.operatorReadiness.recentSmokeEvidence)?.unsupportedTargets);
  return unsupported.length > 0
    ? `ignored unsupported smoke: ${unsupported.join(", ")}`
    : undefined;
}

export function readDogfoodSummary(snapshot: DashboardSnapshot): DashboardDogfoodSummary {
  const release = readRecord(snapshot.dogfoodRelease);
  const releaseState = readString(release?.state) ?? "unknown";
  const drift = readRecord(release?.releaseDrift);
  const releaseDriftState = readString(drift?.state) ?? "unknown";
  const cohort = readRecord(release?.cohort);
  const acceptedReports = readNumber(cohort?.acceptedReportCount) ?? 0;
  const distinctTesters = readNumber(cohort?.distinctRealTesterCount) ?? 0;
  const ready = cohort?.ready === true;
  const passedReady = cohort?.passedReady === true;

  return {
    releaseState,
    releaseDriftState,
    cohortLabel: `cohort ${acceptedReports}/${distinctTesters}`,
    detail: ready
      ? passedReady
        ? "Accepted dogfood cohort has passed workflow coverage."
        : "Accepted dogfood cohort exists, but passed workflow coverage is incomplete."
      : "Dogfood cohort is not ready yet.",
    tone: releaseDriftState === "behind-head"
      ? "warning"
      : releaseState === "cohort-ready" && passedReady
        ? "success"
        : "neutral"
  };
}

export function readProviderSummaries(snapshot: DashboardSnapshot): DashboardProviderSummary[] {
  return [
    snapshot.providers?.assistant ?? {
      provider: "assistant",
      mode: "local",
      label: "Local",
      health: "unknown",
      detail: "Provider settings are not present in this snapshot."
    },
    snapshot.providers?.planner ?? {
      provider: "planner",
      mode: "local-deterministic",
      label: "Local deterministic",
      health: "unknown",
      detail: "Provider settings are not present in this snapshot."
    }
  ];
}

export function readCapabilitySummaries(snapshot: DashboardSnapshot): DashboardCapabilitySummary[] {
  const providers = readProviderSummaries(snapshot);
  const assistant = providers.find((provider) => provider.provider === "assistant") ?? providers[0];
  const planner = providers.find((provider) => provider.provider === "planner") ?? providers[1];
  const computerUse = readComputerUseReadiness(snapshot);
  const chromeControl = readChromeControlState(snapshot);
  const dogfood = readDogfoodSummary(snapshot);

  return [
    {
      id: "provider",
      title: "Agent/provider",
      value: readProviderCapabilityValue(assistant, planner),
      detail: readProviderCapabilityDetail(assistant, planner),
      tone: readProviderCapabilityTone(assistant, planner)
    },
    {
      id: "computer-use",
      title: "Computer Use",
      value: computerUse.desktop.value,
      detail: computerUse.desktop.detail,
      tone: computerUse.desktop.tone
    },
    {
      id: "browser",
      title: "Browser bridge",
      value: chromeControl.label,
      detail: chromeControl.activeTabLabel,
      tone: chromeControl.tone
    },
    {
      id: "dogfood",
      title: "Dogfood/release",
      value: dogfood.releaseDriftState,
      detail: dogfood.detail,
      tone: dogfood.tone
    }
  ];
}

function readProviderCapabilityValue(
  assistant: DashboardProviderSummary | undefined,
  planner: DashboardProviderSummary | undefined
): string {
  const assistantLabel = assistant?.label ?? "assistant";
  const plannerLabel = planner?.label ?? "planner";
  return `${assistantLabel} / ${plannerLabel}`;
}

function readProviderCapabilityDetail(
  assistant: DashboardProviderSummary | undefined,
  planner: DashboardProviderSummary | undefined
): string {
  return [
    assistant?.health ? `assistant ${assistant.health}` : "assistant unknown",
    planner?.health ? `planner ${planner.health}` : "planner unknown"
  ].join(", ");
}

function readProviderCapabilityTone(
  assistant: DashboardProviderSummary | undefined,
  planner: DashboardProviderSummary | undefined
): Tone {
  const health = [assistant?.health, planner?.health];
  if (health.some((value) => value === "unavailable")) {
    return "danger";
  }
  if (health.every((value) => value === "available")) {
    return "success";
  }

  return "warning";
}

function createAppReadinessLane(
  id: DashboardAppReadinessLane["id"],
  title: string,
  lane: Record<string, unknown> | undefined
): DashboardAppReadinessLane {
  const state = readString(lane?.state) ?? "needs-evidence";

  return {
    id,
    title,
    value: state,
    detail: readString(lane?.reason) ?? "No readiness detail has been recorded yet.",
    source: readString(lane?.source) ?? "snapshot",
    tone: readReadinessTone(state)
  };
}

function readReadinessTone(state: string): Tone {
  if (state === "ready") {
    return "success";
  }
  if (state === "blocked") {
    return "danger";
  }

  return "warning";
}

export function readAlertMessages(snapshot: DashboardSnapshot): string[] {
  return snapshot.alerts
    .map((alert) => readString(alert.message))
    .filter((message): message is string => Boolean(message));
}

export function readLatestMessage(snapshot: DashboardSnapshot): string {
  return readString(snapshot.currentTurn.latestMessage)
    ?? readString(snapshot.replay.latestMessage)
    ?? "Ready for an agent or Computer Use turn.";
}

export function readRecentActivity(snapshot: DashboardSnapshot): DashboardRecentActivity {
  return {
    latestMessage: readLatestMessage(snapshot),
    turnState: readString(snapshot.currentTurn.state) ?? "idle",
    replayState: readString(snapshot.replay.state) ?? "empty",
    command: readString(snapshot.currentTurn.command),
    targetApp: readString(snapshot.currentTurn.targetApp),
    actionCount: readNumber(snapshot.replay.actionCount),
    screenshotCount: readNumber(snapshot.replay.screenshotCount),
    verificationCount: readNumber(snapshot.replay.verificationCount)
  };
}

export function readNextAction(snapshot: DashboardSnapshot): DashboardNextAction {
  const currentTurnState = readString(snapshot.currentTurn.state) ?? "";
  const approvalState = readString(snapshot.currentTurn.approvalState) ?? "";
  if (
    currentTurnState.includes("approval")
    || approvalState === "pending"
    || snapshot.currentTurn.approvalRequired === true
  ) {
    return {
      title: "Review pending approval",
      detail: readString(snapshot.currentTurn.command)
        ?? readLatestMessage(snapshot),
      tone: "warning",
      source: "Current turn"
    };
  }

  const alertWithNextAction = snapshot.alerts.find((alert) => readString(alert.nextAction));
  if (alertWithNextAction) {
    return {
      title: readAlertActionTitle(alertWithNextAction),
      detail: readString(alertWithNextAction.nextAction) ?? readString(alertWithNextAction.message) ?? "Review dashboard alert.",
      tone: readAlertTone(alertWithNextAction),
      source: "Dashboard alert"
    };
  }

  const visibleAlert = snapshot.alerts.find((alert) => readString(alert.severity) === "error")
    ?? snapshot.alerts.find((alert) => readString(alert.severity) === "warning")
    ?? snapshot.alerts[0];
  if (visibleAlert) {
    return {
      title: readAlertActionTitle(visibleAlert),
      detail: readString(visibleAlert.message) ?? "Review dashboard alert.",
      tone: readAlertTone(visibleAlert),
      source: "Dashboard alert"
    };
  }

  const chromeControl = readChromeControlState(snapshot);
  if (chromeControl.tone !== "success" && chromeControl.nextAction) {
    return {
      title: "Prepare browser control",
      detail: chromeControl.nextAction,
      tone: chromeControl.tone,
      source: "Browser"
    };
  }

  const readinessState = readString(snapshot.operatorReadiness.state) ?? "unknown";
  if (readinessState === "ready") {
    return {
      title: "Start a Computer Use turn",
      detail: readLatestMessage(snapshot),
      tone: "success",
      source: "Ready"
    };
  }

  const recentSmokeEvidence = readRecord(snapshot.operatorReadiness.recentSmokeEvidence);
  const missingTargets = readStringArray(recentSmokeEvidence?.missingTargets);
  return {
    title: readinessState === "blocked" ? "Resolve readiness blockers" : "Collect readiness evidence",
    detail: missingTargets.length > 0
      ? `Missing fresh evidence: ${missingTargets.join(", ")}.`
      : "Review readiness checks before starting the next turn.",
    tone: readinessState === "blocked" ? "danger" : "warning",
    source: "Readiness"
  };
}

function createPermissionStatus(label: string, value: unknown): DashboardStatusItem {
  const state = readString(value) ?? "unknown";

  return {
    label,
    value: state.replaceAll("-", " "),
    tone: state === "granted" ? "success" : state === "denied" ? "danger" : "warning"
  };
}

function readAlertTone(alert: Record<string, unknown>): Tone {
  const severity = readString(alert.severity);
  if (severity === "error") {
    return "danger";
  }
  if (severity === "warning") {
    return "warning";
  }

  return "neutral";
}

function readAlertActionTitle(alert: Record<string, unknown>): string {
  const code = readString(alert.code) ?? "";
  if (code.endsWith("-missing")) {
    return `Grant ${titleize(code.replace(/-missing$/, ""))}`;
  }
  if (code.startsWith("page-control")) {
    return "Prepare Browser Control";
  }
  if (code.startsWith("chrome-extension")) {
    return "Connect Chrome Extension";
  }
  if (code.startsWith("chrome-native-host")) {
    return "Repair Chrome Native Host";
  }
  if (code.startsWith("desktop")) {
    return "Unlock Desktop Session";
  }
  if (code.startsWith("finder")) {
    return "Prove Finder Automation";
  }
  if (code.startsWith("runtime-snapshot")) {
    return "Repair Runtime State";
  }
  if (code.startsWith("smoke")) {
    return "Refresh Smoke Evidence";
  }
  if (code.startsWith("release")) {
    return "Refresh Alpha Release";
  }

  return "Review Dashboard Alert";
}

function titleize(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readNestedString(record: Record<string, unknown>, keys: string[]): string | undefined {
  let current: unknown = record;
  for (const key of keys) {
    current = readRecord(current)?.[key];
  }

  return readString(current);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
      .map((item) => readRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
