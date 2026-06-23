import { execFile } from "node:child_process";
import {
  createChromeExtensionWakeUrl,
  openChromeExtensionManagerPage,
  readChromeExtensionOpenerAppName,
  type ChromeExtensionPageOpener
} from "./chrome-extension-reloader.js";
import {
  readChromeExtensionConnectionStatus,
  type ChromeExtensionConnectionStatus,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";

const DEFAULT_POLL_INTERVAL_MS = 50;
const DEFAULT_POLL_TIMEOUT_MS = 10_000;

export type ChromeExtensionPageControlAction =
  | "observe"
  | "screenshot"
  | "click"
  | "fill"
  | "submit"
  | "scroll";

export interface ChromeExtensionPageControlInput {
  action: ChromeExtensionPageControlAction;
  extensionId: string;
  homeDir: string;
  targetTabId?: number;
  selector?: string;
  text?: string;
  dy?: number;
  requestId?: string;
  generatedAt?: string;
  opener?: ChromeExtensionPageOpener;
  io?: ChromeNativeHostIo;
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface ChromeExtensionPageControlResult {
  schemaVersion: 1;
  result: "verified" | "blocked";
  action: ChromeExtensionPageControlAction;
  extensionId: string;
  wakeUrl: string;
  extensionConnection: ChromeExtensionConnectionStatus;
  reason?: string;
  nextAction?: string;
}

export type ChromeExtensionPageControlInvoker = (
  input: ChromeExtensionPageControlInput
) => Promise<ChromeExtensionPageControlResult>;

export type ChromeExtensionTabState = "eligible" | "blocked";

export interface ChromeExtensionTabSummary {
  id?: number;
  windowId?: number;
  active?: boolean;
  title?: string;
  url?: string;
  host?: string;
  scheme?: string;
  state: ChromeExtensionTabState;
  eligible: boolean;
  blocker?: string;
  nextAction?: string;
}

export interface ChromeExtensionTabDiscoveryInput {
  extensionId: string;
  homeDir: string;
  chromeAppName?: string;
  requestId?: string;
  generatedAt?: string;
  opener?: ChromeExtensionPageOpener;
  fallbackTabLister?: ChromeTabLister;
  io?: ChromeNativeHostIo;
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface ChromeExtensionTabDiscoveryResult {
  schemaVersion: 1;
  result: "verified" | "blocked";
  extensionId: string;
  wakeUrl: string;
  discoveryMode?: "extension" | "chrome-apple-events";
  tabs: ChromeExtensionTabSummary[];
  extensionConnection: ChromeExtensionConnectionStatus;
  reason?: string;
  nextAction?: string;
}

export type ChromeAppleEventsTab = {
  id?: number;
  windowId?: number;
  active?: boolean;
  title?: string;
  url?: string;
};

export type ChromeTabLister = () => Promise<ChromeAppleEventsTab[]>;

export type ChromeExtensionTabDiscoveryInvoker = (
  input: ChromeExtensionTabDiscoveryInput
) => Promise<ChromeExtensionTabDiscoveryResult>;

export async function invokeChromeExtensionPageControl({
  action,
  extensionId,
  homeDir,
  targetTabId,
  selector,
  text,
  dy,
  requestId,
  generatedAt,
  opener = openChromeExtensionManagerPage,
  io,
  wait = sleep,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS
}: ChromeExtensionPageControlInput): Promise<ChromeExtensionPageControlResult> {
  const requestGeneratedAt = generatedAt ?? new Date().toISOString();
  const wakeUrl = createChromeExtensionWakeUrl(extensionId, {
    targetTabId,
    wakeAction: action,
    requestId,
    selector,
    text,
    dy
  });

  await opener(wakeUrl);
  const extensionConnection = await pollPageControlConnection({
    action,
    requestId,
    homeDir,
    generatedAt: requestGeneratedAt,
    io,
    wait,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs
  });
  const verified = isExpectedConnection(extensionConnection, action, requestGeneratedAt, requestId);
  const blocker = verified ? undefined : createPageControlBlocker(action, extensionConnection);

  return {
    schemaVersion: 1,
    result: verified ? "verified" : "blocked",
    action,
    extensionId,
    wakeUrl,
    extensionConnection,
    ...(verified ? {} : {
      reason: blocker?.reason ?? `page-control-${action}-not-verified`,
      nextAction: blocker?.nextAction
        ?? `Reload the skfiy Chrome extension, verify the target tab is an allowed HTTP(S) page with Chrome site access, then retry \`skfiy chrome ${action}\`.`
    })
  };
}

export async function invokeChromeExtensionTabDiscovery({
  extensionId,
  homeDir,
  chromeAppName = readChromeExtensionOpenerAppName(),
  requestId,
  generatedAt,
  opener = openChromeExtensionManagerPage,
  fallbackTabLister,
  io,
  wait = sleep,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS
}: ChromeExtensionTabDiscoveryInput): Promise<ChromeExtensionTabDiscoveryResult> {
  const requestGeneratedAt = generatedAt ?? new Date().toISOString();
  const discoveryRequestId = requestId ?? `tabs-discover-cli-${Date.now()}`;
  const wakeUrl = createChromeExtensionWakeUrl(extensionId, {
    wakeAction: "tabs",
    requestId: discoveryRequestId
  });

  await opener(wakeUrl);
  const extensionConnection = await pollTabDiscoveryConnection({
    requestId: discoveryRequestId,
    homeDir,
    generatedAt: requestGeneratedAt,
    io,
    wait,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs
  });
  const pageTabs = readTabDiscoveryEvidence(extensionConnection, requestGeneratedAt, discoveryRequestId);
  const tabs = readTabSummaries(pageTabs);
  const verified = extensionConnection.state === "connected" && tabs.length > 0;
  if (!verified) {
    const fallbackTabs = await readFallbackTabs(
      fallbackTabLister ?? (() => listChromeTabsWithAppleEvents(chromeAppName))
    );
    if (fallbackTabs.length > 0) {
      return {
        schemaVersion: 1,
        result: "verified",
        extensionId,
        wakeUrl,
        discoveryMode: "chrome-apple-events",
        tabs: fallbackTabs,
        extensionConnection
      };
    }
  }

  return {
    schemaVersion: 1,
    result: verified ? "verified" : "blocked",
    extensionId,
    wakeUrl,
    ...(verified ? { discoveryMode: "extension" as const } : {}),
    tabs,
    extensionConnection,
    ...(verified ? {} : {
      reason: "chrome-tabs-not-verified",
      nextAction: "Reload the skfiy Chrome extension, ensure Native Messaging is connected, then retry `skfiy chrome tabs`."
    })
  };
}

async function pollPageControlConnection({
  action,
  requestId,
  homeDir,
  generatedAt = new Date().toISOString(),
  io,
  wait,
  intervalMs,
  timeoutMs
}: {
  action: ChromeExtensionPageControlAction;
  requestId?: string;
  homeDir: string;
  generatedAt?: string;
  io?: ChromeNativeHostIo;
  wait: (ms: number) => Promise<void>;
  intervalMs: number;
  timeoutMs: number;
}): Promise<ChromeExtensionConnectionStatus> {
  const deadline = Date.now() + timeoutMs;
  let latest = await readChromeExtensionConnectionStatus({
    homeDir,
    generatedAt,
    io
  });

  while (Date.now() <= deadline) {
    if (isExpectedConnection(latest, action, generatedAt, requestId)) {
      return latest;
    }
    await wait(intervalMs);
    latest = await readChromeExtensionConnectionStatus({
      homeDir,
      generatedAt: generatedAt ?? new Date().toISOString(),
      io
    });
  }

  return latest;
}

async function pollTabDiscoveryConnection({
  requestId,
  homeDir,
  generatedAt = new Date().toISOString(),
  io,
  wait,
  intervalMs,
  timeoutMs
}: {
  requestId?: string;
  homeDir: string;
  generatedAt?: string;
  io?: ChromeNativeHostIo;
  wait: (ms: number) => Promise<void>;
  intervalMs: number;
  timeoutMs: number;
}): Promise<ChromeExtensionConnectionStatus> {
  const deadline = Date.now() + timeoutMs;
  let latest = await readChromeExtensionConnectionStatus({
    homeDir,
    generatedAt,
    io
  });

  while (Date.now() <= deadline) {
    if (readTabSummaries(readTabDiscoveryEvidence(latest, generatedAt, requestId)).length > 0) {
      return latest;
    }
    await wait(intervalMs);
    latest = await readChromeExtensionConnectionStatus({
      homeDir,
      generatedAt,
      io
    });
  }

  return latest;
}

function isExpectedConnection(
  connection: ChromeExtensionConnectionStatus,
  action: ChromeExtensionPageControlAction,
  generatedAt: string,
  requestId?: string
): boolean {
  const pageControlConnection = connection as ChromeExtensionConnectionStatus & {
    pageActionResult?: unknown;
    pageScreenshot?: unknown;
    latestCommand?: {
      observedAt?: unknown;
      messageType?: unknown;
      requestId?: unknown;
      pageActionResult?: unknown;
      pageScreenshot?: unknown;
      pageObservation?: unknown;
    };
  };

  if (connection.state !== "connected") {
    return false;
  }
  if (isExpectedCommandEvidence(pageControlConnection.latestCommand, action, generatedAt, requestId)) {
    return true;
  }
  if (action === "observe") {
    return connection.messageType === "skfiy.page.observe"
      && hasExpectedRequestId(connection.requestId, requestId)
      && Boolean(connection.pageObservation);
  }
  if (action === "screenshot") {
    return connection.messageType === "skfiy.page.screenshot"
      && hasExpectedRequestId(connection.requestId, requestId)
      && hasScreenshotData(pageControlConnection.pageScreenshot);
  }
  if (action === "click" || action === "fill" || action === "submit" || action === "scroll") {
    return connection.messageType === "skfiy.page.action"
      && hasExpectedRequestId(connection.requestId, requestId)
      && hasExpectedActionResult(pageControlConnection.pageActionResult, action);
  }
  return false;
}

function isExpectedCommandEvidence(
  command: {
    observedAt?: unknown;
    messageType?: unknown;
    requestId?: unknown;
    pageActionResult?: unknown;
    pageScreenshot?: unknown;
    pageObservation?: unknown;
  } | undefined,
  action: ChromeExtensionPageControlAction,
  generatedAt: string,
  requestId?: string
): boolean {
  if (!command || typeof command.messageType !== "string" || !isFreshCommand(command.observedAt, generatedAt)) {
    return false;
  }
  if (!hasExpectedRequestId(command.requestId, requestId)) {
    return false;
  }
  if (action === "observe") {
    return command.messageType === "skfiy.page.observe"
      && Boolean(command.pageObservation);
  }
  if (action === "screenshot") {
    return command.messageType === "skfiy.page.screenshot"
      && hasScreenshotData(command.pageScreenshot);
  }
  if (action === "click" || action === "fill" || action === "submit" || action === "scroll") {
    return command.messageType === "skfiy.page.action"
      && hasExpectedActionResult(command.pageActionResult, action);
  }
  return false;
}

function hasExpectedRequestId(actual: unknown, expected: string | undefined): boolean {
  return expected === undefined || actual === expected;
}

function isFreshCommand(observedAt: unknown, generatedAt: string): boolean {
  if (typeof observedAt !== "string") {
    return false;
  }
  const observedAtMs = Date.parse(observedAt);
  const generatedAtMs = Date.parse(generatedAt);
  return Number.isFinite(observedAtMs)
    && Number.isFinite(generatedAtMs)
    && observedAtMs >= generatedAtMs;
}

function readTabDiscoveryEvidence(
  connection: ChromeExtensionConnectionStatus,
  generatedAt: string,
  requestId?: string
): Record<string, unknown> | undefined {
  const connectionWithTabs = connection as ChromeExtensionConnectionStatus & {
    pageTabs?: unknown;
    latestCommand?: {
      observedAt?: unknown;
      messageType?: unknown;
      requestId?: unknown;
      pageTabs?: unknown;
    };
  };
  const latestCommand = connectionWithTabs.latestCommand;
  if (latestCommand?.messageType === "skfiy.tabs.discover"
    && isFreshCommand(latestCommand.observedAt, generatedAt)
    && hasExpectedRequestId(latestCommand.requestId, requestId)) {
    return readRecord(latestCommand.pageTabs);
  }
  if (connection.messageType === "skfiy.tabs.discover"
    && hasExpectedRequestId(connection.requestId, requestId)) {
    return readRecord(connectionWithTabs.pageTabs);
  }
  return undefined;
}

function readTabSummaries(pageTabs: Record<string, unknown> | undefined): ChromeExtensionTabSummary[] {
  const tabs = Array.isArray(pageTabs?.tabs) ? pageTabs.tabs : [];
  return tabs.flatMap((entry) => {
    const tab = readRecord(entry);
    const state = tab?.state === "eligible" ? "eligible" : tab?.state === "blocked" ? "blocked" : undefined;
    if (!tab || !state) {
      return [];
    }
    return [{
      ...(readNumber(tab.id) !== undefined ? { id: readNumber(tab.id) } : {}),
      ...(readNumber(tab.windowId) !== undefined ? { windowId: readNumber(tab.windowId) } : {}),
      ...(typeof tab.active === "boolean" ? { active: tab.active } : {}),
      ...(typeof tab.title === "string" ? { title: tab.title } : {}),
      ...(typeof tab.url === "string" ? { url: tab.url } : {}),
      ...(typeof tab.host === "string" ? { host: tab.host } : {}),
      ...(typeof tab.scheme === "string" ? { scheme: tab.scheme } : {}),
      state,
      eligible: tab.eligible === true,
      ...(typeof tab.blocker === "string" ? { blocker: tab.blocker } : {}),
      ...(typeof tab.nextAction === "string" ? { nextAction: tab.nextAction } : {})
    }];
  });
}

async function readFallbackTabs(tabLister: ChromeTabLister): Promise<ChromeExtensionTabSummary[]> {
  try {
    const tabs = await tabLister();
    return tabs.map(summarizeAppleEventsTab).filter((tab) => Boolean(tab.url || tab.title || tab.id));
  } catch {
    return [];
  }
}

async function listChromeTabsWithAppleEvents(chromeAppName: string): Promise<ChromeAppleEventsTab[]> {
  const script = `
const chrome = Application(${JSON.stringify(chromeAppName)});
const rows = [];
for (const window of chrome.windows()) {
  const windowId = window.id();
  const activeIndex = Number(window.activeTabIndex?.() ?? -1);
  const tabs = window.tabs();
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs[index];
    rows.push({
      id: tab.id(),
      windowId,
      active: activeIndex === index + 1,
      title: tab.name(),
      url: tab.url()
    });
  }
}
JSON.stringify(rows);
`;
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", "-e", script], (error, output) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    });
  });
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((entry) => {
    const tab = readRecord(entry);
    if (!tab) {
      return [];
    }
    return [{
      ...(readNumber(tab.id) !== undefined ? { id: readNumber(tab.id) } : {}),
      ...(readNumber(tab.windowId) !== undefined ? { windowId: readNumber(tab.windowId) } : {}),
      ...(typeof tab.active === "boolean" ? { active: tab.active } : {}),
      ...(typeof tab.title === "string" ? { title: tab.title } : {}),
      ...(typeof tab.url === "string" ? { url: tab.url } : {})
    }];
  });
}

function summarizeAppleEventsTab(tab: ChromeAppleEventsTab): ChromeExtensionTabSummary {
  const url = typeof tab.url === "string" ? tab.url : "";
  const parsed = parseTabUrl(url);
  const base = {
    ...(readNumber(tab.id) !== undefined ? { id: readNumber(tab.id) } : {}),
    ...(readNumber(tab.windowId) !== undefined ? { windowId: readNumber(tab.windowId) } : {}),
    ...(typeof tab.active === "boolean" ? { active: tab.active } : {}),
    ...(typeof tab.title === "string" ? { title: tab.title } : {}),
    ...(url ? { url } : {}),
    ...(parsed.host ? { host: parsed.host } : {}),
    ...(parsed.scheme ? { scheme: parsed.scheme } : {})
  };

  if (parsed.scheme === "http" || parsed.scheme === "https") {
    return {
      ...base,
      state: "eligible",
      eligible: true
    };
  }
  if (parsed.scheme === "chrome") {
    return {
      ...base,
      state: "blocked",
      eligible: false,
      blocker: "internal_chrome_page",
      nextAction: "Open a normal HTTP(S) page before asking skfiy to control Chrome."
    };
  }
  if (parsed.scheme === "chrome-extension") {
    return {
      ...base,
      state: "blocked",
      eligible: false,
      blocker: "chrome_extension_page",
      nextAction: "Switch to a normal HTTP(S) tab before asking skfiy to control Chrome."
    };
  }
  if (parsed.scheme === "file") {
    return {
      ...base,
      state: "blocked",
      eligible: false,
      blocker: "file_url",
      nextAction: "Open a normal HTTP(S) page before asking skfiy to control Chrome."
    };
  }
  return {
    ...base,
    state: "blocked",
    eligible: false,
    blocker: parsed.scheme ? "unsupported_scheme" : "missing_url",
    nextAction: "Open a normal HTTP(S) page before asking skfiy to control Chrome."
  };
}

function parseTabUrl(url: string): { scheme?: string; host?: string } {
  try {
    const parsed = new URL(url);
    return {
      scheme: parsed.protocol.replace(/:$/, ""),
      host: parsed.host
    };
  } catch {
    return {};
  }
}

function createPageControlBlocker(
  action: ChromeExtensionPageControlAction,
  connection: ChromeExtensionConnectionStatus
): { reason: string; nextAction: string } | undefined {
  const actionResultBlocker = readPageActionResultBlocker(action, connection);
  if (actionResultBlocker) {
    return actionResultBlocker;
  }

  const readinessBlocker = readPageControlReadinessBlocker(action, connection);
  if (readinessBlocker) {
    return readinessBlocker;
  }

  if (action !== "screenshot") {
    return undefined;
  }

  const screenshotReason = readScreenshotBlockerReason(connection);
  if (!screenshotReason) {
    return undefined;
  }

  if (screenshotReason.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
    return {
      reason: "chrome-capture-quota-exceeded",
      nextAction: "Wait at least one second before retrying `skfiy chrome screenshot`; Chrome rate-limits visible-tab capture calls."
    };
  }

  if (screenshotReason.includes("<all_urls>") || screenshotReason.includes("activeTab")) {
    return {
      reason: "chrome-capture-permission-missing",
      nextAction: "Chrome rejected visible-tab capture without an activeTab grant or <all_urls> capture permission. Grant the required Chrome extension permission, or unlock the desktop and use the screenshot fallback."
    };
  }

  return {
    reason: "chrome-capture-blocked",
    nextAction: `Chrome rejected visible-tab capture: ${screenshotReason}`
  };
}

function readPageActionResultBlocker(
  action: ChromeExtensionPageControlAction,
  connection: ChromeExtensionConnectionStatus
): { reason: string; nextAction: string } | undefined {
  const connectionWithAction = connection as ChromeExtensionConnectionStatus & {
    pageActionResult?: unknown;
    latestCommand?: {
      pageActionResult?: unknown;
    };
  };
  const actionResults = [
    readRecord(connectionWithAction.pageActionResult),
    readRecord(connectionWithAction.latestCommand?.pageActionResult)
  ].filter(Boolean) as Array<Record<string, unknown>>;
  const blocked = actionResults.find((result) =>
    readString(result.action) === action
    && readString(result.result) === "blocked"
  );
  if (!blocked) {
    return undefined;
  }

  const code = readString(blocked.code) ?? readString(blocked.reason);
  const reason = readString(blocked.reason);
  if (
    code === "active_tab_unavailable"
    || code === "chrome-active-tab-unavailable"
    || Boolean(reason?.match(/^No tab with id:/))
  ) {
    return {
      reason: "chrome-active-tab-unavailable",
      nextAction: `Re-run \`skfiy chrome tabs\` to pick a live target tab, then retry \`skfiy chrome ${action}\`.`
    };
  }

  if (code === "blocked_by_chrome_host_permission" || code === "chrome_host_permission_missing") {
    const permission = readRecord(blocked.chromeHostPermission);
    const origins = Array.isArray(permission?.origins) ? permission.origins : [];
    const origin = origins.find((entry) => typeof entry === "string" && entry.length > 0)
      ?? readChromeSiteAccessOrigin(blocked, undefined);
    return {
      reason: "chrome-site-access-missing",
      nextAction: origin
        ? `Grant Chrome site access for ${origin}, then retry \`skfiy chrome ${action}\`.`
        : `Grant Chrome site access for the target page, then retry \`skfiy chrome ${action}\`.`
    };
  }

  return {
    reason: reason ?? "chrome-page-action-blocked",
    nextAction: `Resolve the Chrome page action blocker, then retry \`skfiy chrome ${action}\`.`
  };
}

function readPageControlReadinessBlocker(
  action: ChromeExtensionPageControlAction,
  connection: ChromeExtensionConnectionStatus
): { reason: string; nextAction: string } | undefined {
  const pageControl = readRecord((connection as { pageControl?: unknown }).pageControl);
  if (!pageControl) {
    return undefined;
  }

  const blocker = readFirstPageControlBlocker(pageControl);
  const state = readString(pageControl.state);
  const code = readString(blocker?.code) ?? state;
  const message = readString(blocker?.message) ?? readString(pageControl.reason);
  if (!code) {
    return undefined;
  }

  if (code === "blocked_by_chrome_host_permission" || code === "chrome_host_permission_missing") {
    const origin = readChromeSiteAccessOrigin(pageControl, blocker);
    return {
      reason: "chrome-site-access-missing",
      nextAction: origin
        ? `Grant Chrome site access for ${origin}, then retry \`skfiy chrome ${action}\`.`
        : `Grant Chrome site access for the target page, then retry \`skfiy chrome ${action}\`.`
    };
  }

  if (code === "blocked_by_host_policy") {
    const host = readPageControlHost(pageControl);
    return {
      reason: "chrome-host-policy-blocked",
      nextAction: host
        ? `Allow ${host} in skfiy Chrome host policy, then retry \`skfiy chrome ${action}\`.`
        : `Allow this host in skfiy Chrome host policy, then retry \`skfiy chrome ${action}\`.`
    };
  }

  if (["content_script_not_loaded", "not_loaded", "content_script_diagnostics_timeout", "content_script_unavailable"].includes(code)) {
    return {
      reason: "chrome-content-script-not-loaded",
      nextAction: message
        ? `Reload the target page or the skfiy Chrome extension, then retry \`skfiy chrome ${action}\`. Last error: ${message}`
        : `Reload the target page or the skfiy Chrome extension, then retry \`skfiy chrome ${action}\`.`
    };
  }

  if (code === "active_tab_unavailable" || code === "unavailable") {
    return {
      reason: "chrome-active-tab-unavailable",
      nextAction: `Select a normal HTTP(S) Chrome tab, then retry \`skfiy chrome ${action}\`.`
    };
  }

  if (action === "screenshot" && code === "chrome_capture_permission_missing") {
    return {
      reason: "chrome-capture-permission-missing",
      nextAction: "Grant <all_urls> capture permission or use an activeTab user gesture, then retry `skfiy chrome screenshot`."
    };
  }

  return undefined;
}

function readFirstPageControlBlocker(pageControl: Record<string, unknown>): Record<string, unknown> | undefined {
  const blockers = Array.isArray(pageControl.blockers) ? pageControl.blockers : [];
  return blockers.map(readRecord).find((blocker) => Boolean(blocker));
}

function readChromeSiteAccessOrigin(
  pageControl: Record<string, unknown>,
  blocker: Record<string, unknown> | undefined
): string | undefined {
  const permission = readRecord(pageControl.chromeHostPermission)
    ?? readRecord(blocker?.chromeHostPermission);
  const origins = Array.isArray(permission?.origins) ? permission.origins : [];
  const origin = origins.find((entry) => typeof entry === "string" && entry.length > 0);
  if (typeof origin === "string") {
    return origin;
  }

  const permissionOrigin = readString(permission?.origin);
  if (permissionOrigin) {
    return `${permissionOrigin}/*`;
  }

  return undefined;
}

function readPageControlHost(pageControl: Record<string, unknown>): string | undefined {
  const activeTab = readRecord(pageControl.activeTab);
  const hostPolicy = readRecord(pageControl.hostPolicy);
  return readString(activeTab?.host)
    ?? readString(hostPolicy?.host)
    ?? readString(pageControl.host);
}

function readScreenshotBlockerReason(connection: ChromeExtensionConnectionStatus): string | undefined {
  const directScreenshot = readRecord((connection as { pageScreenshot?: unknown }).pageScreenshot);
  const latestCommand = readRecord((connection as { latestCommand?: unknown }).latestCommand);
  const latestScreenshot = readRecord(latestCommand?.pageScreenshot);
  const reason = directScreenshot?.reason ?? latestScreenshot?.reason;
  return typeof reason === "string" && reason.length > 0 ? reason : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function hasScreenshotData(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { hasDataUrl?: unknown }).hasDataUrl === true
  );
}

function hasExpectedActionResult(
  value: unknown,
  action: ChromeExtensionPageControlAction
): boolean {
  const record = readRecord(value);
  return readString(record?.action) === action
    && readString(record?.result) === "passed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
