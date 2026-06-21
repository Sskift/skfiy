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

export type ChromeExtensionPageControlAction = "observe";

export interface ChromeExtensionPageControlInput {
  action: ChromeExtensionPageControlAction;
  extensionId: string;
  homeDir: string;
  targetTabId?: number;
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
  generatedAt,
  opener = openChromeExtensionManagerPage,
  io,
  wait = sleep,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS
}: ChromeExtensionPageControlInput): Promise<ChromeExtensionPageControlResult> {
  const wakeUrl = createChromeExtensionWakeUrl(extensionId, {
    targetTabId,
    wakeAction: action
  });

  await opener(wakeUrl);
  const extensionConnection = await pollPageControlConnection({
    action,
    homeDir,
    generatedAt,
    io,
    wait,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs
  });
  const verified = isExpectedConnection(extensionConnection, action);

  return {
    schemaVersion: 1,
    result: verified ? "verified" : "blocked",
    action,
    extensionId,
    wakeUrl,
    extensionConnection,
    ...(verified ? {} : {
      reason: "page-control-observe-not-verified",
      nextAction: "Reload the skfiy Chrome extension, verify the target tab is an allowed HTTP(S) page with Chrome site access, then retry `skfiy chrome observe`."
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
    if (isExpectedConnection(latest, action)) {
      return latest;
    }
    await wait(intervalMs);
    latest = await readChromeExtensionConnectionStatus({
      homeDir,
      generatedAt: new Date().toISOString(),
      io
    });
  }

  return latest;
}

function isExpectedConnection(
  connection: ChromeExtensionConnectionStatus,
  action: ChromeExtensionPageControlAction
): boolean {
  if (connection.state !== "connected") {
    return false;
  }
  if (action === "observe") {
    return connection.messageType === "skfiy.page.observe"
      && Boolean(connection.pageObservation);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
