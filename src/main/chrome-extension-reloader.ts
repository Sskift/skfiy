import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import {
  extractObservedElementsFromAppState,
  type ObservedElement
} from "./computer-use/observed-elements.js";
import type {
  DesktopAppState,
  DesktopHelperActionResult,
  OcrImageResult
} from "./computer-use/types.js";
import {
  readChromeExtensionConnectionStatus,
  type ChromeExtensionConnectionStatus,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";

export const CHROME_EXTENSION_MANAGER_BUNDLE_ID = "com.google.Chrome";
export const CHROME_EXTENSION_RELOAD_PRODUCT_PATH =
  "cli -> helper activate_app -> helper observe_app -> helper ocr_image -> helper click -> extension wake page -> native-host heartbeat";

const DEFAULT_OPEN_SETTLE_MS = 700;
const DEFAULT_AFTER_CLICK_SETTLE_MS = 800;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_POLL_TIMEOUT_MS = 5_000;

export interface ChromeExtensionReloadInput {
  extensionId: string;
  homeDir: string;
  targetTabId?: number;
  generatedAt?: string;
  helper?: ChromeExtensionReloadHelper;
  opener?: ChromeExtensionPageOpener;
  io?: ChromeNativeHostIo;
  wait?: (ms: number) => Promise<void>;
  screenshotPath?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface ChromeExtensionReloadHelper {
  activateApp(bundleId: string): Promise<DesktopHelperActionResult>;
  getAppState(bundleId: string, screenshotOutputPath: string): Promise<DesktopAppState>;
  ocrImage(inputPath: string): Promise<OcrImageResult>;
  click(x: number, y: number): Promise<DesktopHelperActionResult>;
}

export type ChromeExtensionPageOpener = (url: string) => Promise<void>;

export interface ChromeExtensionReloadTarget {
  strategy: "ocr-label" | "extension-card-layout" | "extension-detail-layout" | "window-layout";
  label?: string;
  x: number;
  y: number;
  confidence: number;
}

export interface ChromeExtensionReloadResult {
  schemaVersion: 1;
  result: "verified" | "clicked" | "blocked";
  productPath: typeof CHROME_EXTENSION_RELOAD_PRODUCT_PATH;
  extensionId: string;
  managerUrl: string;
  wakeUrl: string;
  screenshotPath: string;
  ocrLabelCount: number;
  observedWindowTitle?: string;
  target?: ChromeExtensionReloadTarget;
  click?: DesktopHelperActionResult;
  extensionConnection: ChromeExtensionConnectionStatus;
  reason?: string;
  candidates: Array<Pick<ObservedElement, "id" | "label" | "source" | "bounds" | "confidence">>;
  nextAction?: string;
}

export async function reloadChromeExtensionWithDesktopControl({
  extensionId,
  homeDir,
  targetTabId,
  generatedAt,
  helper = new DesktopHelperClient(),
  opener = openChromeExtensionManagerPage,
  io,
  wait = sleep,
  screenshotPath = createDefaultScreenshotPath(extensionId),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS
}: ChromeExtensionReloadInput): Promise<ChromeExtensionReloadResult> {
  const checkedExtensionId = requireChromeExtensionId(extensionId);
  const managerUrl = createChromeExtensionManagerUrl(checkedExtensionId);
  const wakeUrl = createChromeExtensionWakeUrl(checkedExtensionId, { targetTabId });

  await opener(managerUrl);
  await wait(DEFAULT_OPEN_SETTLE_MS);
  await helper.activateApp(CHROME_EXTENSION_MANAGER_BUNDLE_ID);
  await wait(DEFAULT_OPEN_SETTLE_MS);

  const state = await helper.getAppState(
    CHROME_EXTENSION_MANAGER_BUNDLE_ID,
    screenshotPath
  );
  if (isDesktopSessionLocked(state)) {
    const extensionConnection = await readChromeExtensionConnectionStatus({
      homeDir,
      generatedAt,
      io
    });
    return {
      schemaVersion: 1,
      result: "blocked",
      productPath: CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
      extensionId: checkedExtensionId,
      managerUrl,
      wakeUrl,
      screenshotPath: state.screenshotPath,
      ocrLabelCount: 0,
      observedWindowTitle: readPrimaryWindowTitle(state),
      extensionConnection,
      reason: "desktop-session-locked",
      candidates: [],
      nextAction: "Unlock the desktop, keep the display awake, then retry `skfiy chrome reload-extension`."
    };
  }
  const ocr = await helper.ocrImage(state.screenshotPath);
  const observedState = { ...state, ocrLabels: ocr.labels };
  const elements = extractObservedElementsFromAppState(observedState);
  const target = findChromeExtensionReloadTarget(elements, observedState, checkedExtensionId);

  if (!target) {
    const observationEmpty = ocr.labels.length === 0;
    const extensionConnection = await readChromeExtensionConnectionStatus({
      homeDir,
      generatedAt,
      io
    });
    return {
      schemaVersion: 1,
      result: "blocked",
      productPath: CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
      extensionId: checkedExtensionId,
      managerUrl,
      wakeUrl,
      screenshotPath: state.screenshotPath,
      ocrLabelCount: ocr.labels.length,
      observedWindowTitle: readPrimaryWindowTitle(state),
      extensionConnection,
      reason: observationEmpty ? "screen-observation-empty" : "reload-target-not-found",
      candidates: summarizeCandidates(elements),
      nextAction: observationEmpty
        ? "Wake the display and verify Screen Recording permission, then retry `skfiy chrome reload-extension`."
        : "Open chrome://extensions, enable Developer mode, and retry `skfiy chrome reload-extension`."
    };
  }

  const click = await helper.click(target.x, target.y);
  await wait(DEFAULT_AFTER_CLICK_SETTLE_MS);
  await opener(wakeUrl);
  await wait(DEFAULT_OPEN_SETTLE_MS);
  const extensionConnection = await pollChromeExtensionConnection({
    homeDir,
    generatedAt,
    io,
    wait,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs
  });

  const verified = extensionConnection.state === "connected";
  return {
    schemaVersion: 1,
    result: verified ? "verified" : "clicked",
    productPath: CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
    extensionId: checkedExtensionId,
    managerUrl,
    wakeUrl,
    screenshotPath: state.screenshotPath,
    ocrLabelCount: ocr.labels.length,
    observedWindowTitle: readPrimaryWindowTitle(state),
    target,
    click,
    extensionConnection,
    candidates: summarizeCandidates(elements),
    ...(verified ? {} : {
      reason: "heartbeat-not-connected-after-reload",
      nextAction: "The reload target was clicked, but the extension has not recorded a fresh Native Messaging heartbeat yet. Check the native host install and reload the extension again."
    })
  };
}

export function createChromeExtensionManagerUrl(extensionId: string): string {
  requireChromeExtensionId(extensionId);
  return "chrome://extensions/";
}

export function createChromeExtensionWakeUrl(
  extensionId: string,
  options: {
    targetTabId?: number;
    wakeAction?: string;
    selector?: string;
    text?: string;
    dy?: number;
  } = {}
): string {
  const params = new URLSearchParams({
    skfiyWake: String(Date.now())
  });

  if (Number.isInteger(options.targetTabId)) {
    params.set("skfiyTargetTabId", String(options.targetTabId));
  }
  if (options.wakeAction) {
    params.set("skfiyWakeAction", options.wakeAction);
  }
  if (options.selector) {
    params.set("skfiySelector", options.selector);
  }
  if (options.text !== undefined) {
    params.set("skfiyText", options.text);
  }
  if (options.dy !== undefined) {
    params.set("skfiyDy", String(options.dy));
  }

  return `chrome-extension://${requireChromeExtensionId(extensionId)}/popup.html?${params.toString()}`;
}

function isDesktopSessionLocked(state: DesktopAppState): boolean {
  return state.frontmostBundleId === "com.apple.loginwindow";
}

export function findChromeExtensionReloadTarget(
  elements: readonly ObservedElement[],
  state: DesktopAppState,
  extensionId?: string
): ChromeExtensionReloadTarget | undefined {
  const textTarget = findTextReloadTarget(elements);
  if (textTarget) {
    return textTarget;
  }

  const cardTarget = findExtensionCardReloadTarget(elements, state, extensionId);
  if (cardTarget) {
    return cardTarget;
  }

  const detailAnchor = elements.find((element) => {
    const label = normalizeLabel(element.label);
    return label.includes("skfiy chrome adapter") || label.includes("chrome adapter");
  });
  const primaryWindow = readPrimaryWindow(state);

  if (detailAnchor && primaryWindow) {
    return {
      strategy: "extension-detail-layout",
      label: detailAnchor.label,
      x: Math.round(primaryWindow.bounds.x + primaryWindow.bounds.width * 0.75),
      y: Math.round(detailAnchor.bounds.y + detailAnchor.bounds.height / 2),
      confidence: 0.72
    };
  }

  return undefined;
}

function findExtensionCardReloadTarget(
  elements: readonly ObservedElement[],
  state: DesktopAppState,
  extensionId?: string
): ChromeExtensionReloadTarget | undefined {
  if (isChromeExtensionDetailWindow(state)) {
    return undefined;
  }

  const checkedExtensionId = extensionId?.trim();
  const extensionIdLabel = checkedExtensionId
    ? findFirstText(elements, (label) => label.includes(checkedExtensionId))
    : undefined;
  const skfiyName = extensionIdLabel ?? findFirstText(elements, (_label, compactLabel) => (
    compactLabel.includes("skfiychromeadapter")
  ));

  if (!skfiyName) {
    return undefined;
  }

  const sameCardElements = elements.filter((element) => (
    element.source === "ocr"
    && element.bounds.y >= skfiyName.bounds.y - 80
    && element.bounds.y <= skfiyName.bounds.y + 260
    && element.bounds.x >= skfiyName.bounds.x - 180
    && element.bounds.x <= skfiyName.bounds.x + 520
  ));
  const removeButton = findFirstText(sameCardElements, (label) => (
    label === "移除" || label.includes("remove")
  ));
  const detailButton = findFirstText(sameCardElements, (label) => (
    label === "详情" || label.includes("details")
  ));
  const serviceWorker = findFirstText(sameCardElements, (label) => (
    label.includes("service worker")
  ));
  const anchor = removeButton ?? detailButton;
  if (!anchor && !serviceWorker && !extensionIdLabel) {
    return undefined;
  }
  const primaryWindow = readPrimaryWindow(state);

  if (!primaryWindow) {
    return undefined;
  }

  const cardTextLeft = Math.min(...sameCardElements.map((element) => element.bounds.x));
  const x = Math.round(cardTextLeft + 235);
  const y = Math.round(anchor
    ? anchor.bounds.y + anchor.bounds.height / 2
    : serviceWorker
      ? serviceWorker.bounds.y + serviceWorker.bounds.height / 2 + 50
      : skfiyName.bounds.y + skfiyName.bounds.height / 2 + 80);

  return {
    strategy: "extension-card-layout",
    label: skfiyName.label,
    x,
    y,
    confidence: anchor ? 0.82 : 0.74
  };
}

export async function openChromeExtensionManagerPage(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile("open", ["-a", "Google Chrome", url], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function pollChromeExtensionConnection({
  homeDir,
  generatedAt,
  io,
  wait,
  intervalMs,
  timeoutMs
}: {
  homeDir: string;
  generatedAt?: string;
  io?: ChromeNativeHostIo;
  wait: (ms: number) => Promise<void>;
  intervalMs: number;
  timeoutMs: number;
}): Promise<ChromeExtensionConnectionStatus> {
  const startedAt = Date.now();
  let latest = await readChromeExtensionConnectionStatus({ homeDir, generatedAt, io });

  while (Date.now() - startedAt < timeoutMs) {
    if (latest.state === "connected") {
      return latest;
    }
    await wait(intervalMs);
    latest = await readChromeExtensionConnectionStatus({ homeDir, generatedAt, io });
  }

  return latest;
}

function findTextReloadTarget(
  elements: readonly ObservedElement[]
): ChromeExtensionReloadTarget | undefined {
  const matches = elements
    .filter((element) => element.source === "ocr")
    .filter((element) => isReloadLabel(element.label))
    .sort((left, right) => right.confidence - left.confidence);
  const best = matches[0];

  if (!best) {
    return undefined;
  }

  return {
    strategy: "ocr-label",
    label: best.label,
    x: Math.round(best.bounds.x + best.bounds.width / 2),
    y: Math.round(best.bounds.y + best.bounds.height / 2),
    confidence: best.confidence
  };
}

function isReloadLabel(value: string): boolean {
  const normalized = normalizeLabel(value).trim();
  return normalized === "reload"
    || normalized.includes("reload extension")
    || normalized.includes("重新加载")
    || normalized.includes("重新載入")
    || normalized.includes("重新整理")
    || normalized === "更新";
}

function summarizeCandidates(
  elements: readonly ObservedElement[]
): ChromeExtensionReloadResult["candidates"] {
  return elements
    .filter((element) => element.source === "ocr")
    .slice(0, 24)
    .map((element) => ({
      id: element.id,
      label: element.label,
      source: element.source,
      bounds: element.bounds,
      confidence: element.confidence
    }));
}

function findFirstText(
  elements: readonly ObservedElement[],
  predicate: (normalizedLabel: string, compactLabel: string) => boolean
): ObservedElement | undefined {
  const normalizeCompactLabel = (label: string) => (
    label.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "")
  );
  return elements.find((element) => (
    element.source === "ocr"
    && predicate(normalizeLabel(element.label).trim(), normalizeCompactLabel(element.label))
  ));
}

function isChromeExtensionDetailWindow(state: DesktopAppState): boolean {
  return (state.windows ?? []).some((window) => (
    normalizeLabel(window.title ?? "").includes("skfiy chrome adapter")
    || normalizeLabel(window.title ?? "").includes("chrome adapter")
  ));
}

function readPrimaryWindow(state: DesktopAppState) {
  return [...(state.windows ?? [])].sort((left, right) => left.layer - right.layer)[0];
}

function readPrimaryWindowTitle(state: DesktopAppState): string | undefined {
  return readPrimaryWindow(state)?.title;
}

function createDefaultScreenshotPath(extensionId: string): string {
  return path.join(
    os.tmpdir(),
    `skfiy-chrome-extension-reload-${requireChromeExtensionId(extensionId)}.png`
  );
}

function requireChromeExtensionId(value: string): string {
  const extensionId = value.trim();

  if (!/^[a-p]{32}$/.test(extensionId)) {
    throw new Error("Chrome extension id must be 32 characters in the range a-p.");
  }

  return extensionId;
}

function normalizeLabel(value: string): string {
  return ` ${value.trim().toLowerCase().replace(/\s+/g, " ")} `;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
