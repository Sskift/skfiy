import type { DashboardChromeControlActionRequest } from "./contracts";
import type { DashboardChromeControlState } from "./model";

export type ChromeControlActionRequestResult =
  | { ok: true; request: DashboardChromeControlActionRequest }
  | { ok: false; message: string };

export interface ChromeControlActionRequestInput {
  action: DashboardChromeControlActionRequest["action"];
  chromeControl: DashboardChromeControlState;
  dy: string;
  selector: string;
  text: string;
}

const OPEN_CHROME_ACCESS_PAGE_STEP_ID = "open-skfiy-chrome-popup";

export function buildChromeControlActionRequest(
  input: ChromeControlActionRequestInput
): ChromeControlActionRequestResult {
  const { action, chromeControl } = input;
  const extensionId = chromeControl.extensionId;
  const targetTabId = Number.isInteger(chromeControl.tabId) ? chromeControl.tabId : undefined;
  const canRun = chromeControl.actionable
    && Boolean(extensionId)
    && targetTabId !== undefined;
  const canOpenAccessPage = chromeControl.browserContextAccessSteps.some(
    (step) => step.id === OPEN_CHROME_ACCESS_PAGE_STEP_ID
  )
    && Boolean(extensionId)
    && targetTabId !== undefined;
  const canLaunch = action === "open-popup" ? canOpenAccessPage : canRun;

  if (!canLaunch || !extensionId || targetTabId === undefined) {
    return {
      ok: false,
      message: action === "open-popup"
        ? "Chrome access page is not available for the current tab."
        : chromeControl.actionUnavailableReason ?? "Chrome action controls are not ready."
    };
  }

  const trimmedSelector = input.selector.trim();
  const trimmedText = input.text.trim();
  if ((action === "click" || action === "fill") && !trimmedSelector) {
    return { ok: false, message: "Enter a selector before launching this action." };
  }
  if (action === "fill" && !trimmedText) {
    return { ok: false, message: "Enter fill text before launching this action." };
  }

  const request: DashboardChromeControlActionRequest = {
    action,
    extensionId,
    ...(chromeControl.chromeAppName ? { chromeAppName: chromeControl.chromeAppName } : {}),
    targetTabId
  };
  if (action === "click" || action === "fill") {
    request.selector = trimmedSelector;
  }
  if (action === "submit") {
    request.selector = trimmedSelector || "form";
  }
  if (action === "fill") {
    request.text = trimmedText;
  }
  if (action === "scroll") {
    const scrollDelta = readChromeControlScrollDelta(input.dy);
    if (scrollDelta === undefined) {
      return { ok: false, message: "Enter a numeric scroll delta before launching this action." };
    }
    request.dy = scrollDelta;
  }

  return { ok: true, request };
}

export function readChromeControlScrollDelta(value: string): number | undefined {
  if (!value.trim()) {
    return 600;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
