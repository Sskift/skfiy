import {
  createChromeExtensionWakeUrl,
  openChromeExtensionManagerPage,
  type ChromeExtensionPageOpener
} from "./chrome-extension-reloader.js";
import {
  readChromeExtensionConnectionStatus,
  type ChromeExtensionConnectionStatus,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";

const DEFAULT_POLL_INTERVAL_MS = 50;
const DEFAULT_POLL_TIMEOUT_MS = 5_000;

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

export async function invokeChromeExtensionPageControl({
  action,
  extensionId,
  homeDir,
  targetTabId,
  selector,
  text,
  dy,
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
    selector,
    text,
    dy
  });

  await opener(wakeUrl);
  const extensionConnection = await pollPageControlConnection({
    action,
    homeDir,
    generatedAt: requestGeneratedAt,
    io,
    wait,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs
  });
  const verified = isExpectedConnection(extensionConnection, action, requestGeneratedAt);
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

async function pollPageControlConnection({
  action,
  homeDir,
  generatedAt = new Date().toISOString(),
  io,
  wait,
  intervalMs,
  timeoutMs
}: {
  action: ChromeExtensionPageControlAction;
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
    if (isExpectedConnection(latest, action, generatedAt)) {
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

function isExpectedConnection(
  connection: ChromeExtensionConnectionStatus,
  action: ChromeExtensionPageControlAction,
  generatedAt: string
): boolean {
  const pageControlConnection = connection as ChromeExtensionConnectionStatus & {
    pageActionResult?: unknown;
    pageScreenshot?: unknown;
    latestCommand?: {
      observedAt?: unknown;
      messageType?: unknown;
      pageActionResult?: unknown;
      pageScreenshot?: unknown;
      pageObservation?: unknown;
    };
  };

  if (connection.state !== "connected") {
    return false;
  }
  if (isExpectedCommandEvidence(pageControlConnection.latestCommand, action, generatedAt)) {
    return true;
  }
  if (action === "observe") {
    return connection.messageType === "skfiy.page.observe"
      && Boolean(connection.pageObservation);
  }
  if (action === "screenshot") {
    return connection.messageType === "skfiy.page.screenshot"
      && hasScreenshotData(pageControlConnection.pageScreenshot);
  }
  if (action === "click" || action === "fill" || action === "submit" || action === "scroll") {
    return connection.messageType === "skfiy.page.action"
      && hasExpectedActionResult(pageControlConnection.pageActionResult, action);
  }
  return false;
}

function isExpectedCommandEvidence(
  command: {
    observedAt?: unknown;
    messageType?: unknown;
    pageActionResult?: unknown;
    pageScreenshot?: unknown;
    pageObservation?: unknown;
  } | undefined,
  action: ChromeExtensionPageControlAction,
  generatedAt: string
): boolean {
  if (!command || typeof command.messageType !== "string" || !isFreshCommand(command.observedAt, generatedAt)) {
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

function createPageControlBlocker(
  action: ChromeExtensionPageControlAction,
  connection: ChromeExtensionConnectionStatus
): { reason: string; nextAction: string } | undefined {
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
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { action?: unknown }).action === action
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
