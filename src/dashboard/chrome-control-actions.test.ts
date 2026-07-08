import { describe, expect, it } from "vitest";
import type { DashboardChromeControlState } from "./model";
import {
  buildChromeControlActionRequest,
  readChromeControlScrollDelta
} from "./chrome-control-actions";

const readyChromeControl: DashboardChromeControlState = {
  label: "Ready to control this page",
  host: "example.test",
  activeTabLabel: "example.test tab 42",
  tabId: 42,
  extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
  chromeAppName: "Chromium",
  liveConnection: "connected",
  nativeHostState: "installed",
  tone: "success",
  capabilities: ["DOM actions", "screenshot"],
  capable: true,
  actionable: true,
  reason: "Chrome DOM actions and screenshot capture are ready.",
  contentScript: "ready",
  screenshotLane: "ready",
  tabDiscoveryLabel: "extension",
  browserContext: {
    state: "ready",
    label: "Ready",
    tone: "success",
    reason: "Browser Context ready."
  },
  browserContextAccessSteps: [],
  hostPolicy: {
    state: "configured",
    defaultMode: "ask",
    entries: [],
    tone: "success",
    items: []
  }
};

describe("chrome control action request builder", () => {
  it("builds typed requests for mutating Chrome page actions", () => {
    expect(buildChromeControlActionRequest({
      action: "fill",
      chromeControl: readyChromeControl,
      selector: " #name ",
      text: " skfiy dashboard ",
      dy: "600"
    })).toEqual({
      ok: true,
      request: {
        action: "fill",
        extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
        chromeAppName: "Chromium",
        targetTabId: 42,
        selector: "#name",
        text: "skfiy dashboard"
      }
    });
  });

  it("defaults submit selector and blank scroll delta to the existing dashboard values", () => {
    expect(buildChromeControlActionRequest({
      action: "submit",
      chromeControl: readyChromeControl,
      selector: "",
      text: "",
      dy: "600"
    })).toEqual({
      ok: true,
      request: {
        action: "submit",
        extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
        chromeAppName: "Chromium",
        targetTabId: 42,
        selector: "form"
      }
    });

    expect(buildChromeControlActionRequest({
      action: "scroll",
      chromeControl: readyChromeControl,
      selector: "",
      text: "",
      dy: ""
    })).toEqual({
      ok: true,
      request: {
        action: "scroll",
        extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
        chromeAppName: "Chromium",
        targetTabId: 42,
        dy: 600
      }
    });
  });

  it("validates selectors, fill text, and scroll deltas before creating requests", () => {
    expect(buildChromeControlActionRequest({
      action: "click",
      chromeControl: readyChromeControl,
      selector: "",
      text: "",
      dy: "600"
    })).toEqual({ ok: false, message: "Enter a selector before launching this action." });

    expect(buildChromeControlActionRequest({
      action: "fill",
      chromeControl: readyChromeControl,
      selector: "#name",
      text: "",
      dy: "600"
    })).toEqual({ ok: false, message: "Enter fill text before launching this action." });

    expect(buildChromeControlActionRequest({
      action: "scroll",
      chromeControl: readyChromeControl,
      selector: "",
      text: "",
      dy: "not-a-number"
    })).toEqual({ ok: false, message: "Enter a numeric scroll delta before launching this action." });
  });

  it("keeps access-page launches gated by the browser access step", () => {
    expect(buildChromeControlActionRequest({
      action: "open-popup",
      chromeControl: readyChromeControl,
      selector: "",
      text: "",
      dy: "600"
    })).toEqual({ ok: false, message: "Chrome access page is not available for the current tab." });

    expect(buildChromeControlActionRequest({
      action: "open-popup",
      chromeControl: {
        ...readyChromeControl,
        actionable: false,
        browserContextAccessSteps: [{
          id: "open-skfiy-chrome-popup",
          label: "Grant Chrome site access",
          detail: "Open the extension popup.",
          tone: "warning"
        }]
      },
      selector: "",
      text: "",
      dy: "600"
    })).toEqual({
      ok: true,
      request: {
        action: "open-popup",
        extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
        chromeAppName: "Chromium",
        targetTabId: 42
      }
    });
  });

  it("reports the current unavailable reason when Chrome actions cannot run", () => {
    expect(buildChromeControlActionRequest({
      action: "observe",
      chromeControl: {
        ...readyChromeControl,
        actionable: false,
        actionUnavailableReason: "Chrome extension heartbeat is stale."
      },
      selector: "",
      text: "",
      dy: "600"
    })).toEqual({ ok: false, message: "Chrome extension heartbeat is stale." });
  });
});

describe("Chrome control scroll delta parsing", () => {
  it("uses the legacy default for blank input and rejects non-numeric input", () => {
    expect(readChromeControlScrollDelta("")).toBe(600);
    expect(readChromeControlScrollDelta(" 750 ")).toBe(750);
    expect(readChromeControlScrollDelta("down")).toBeUndefined();
  });
});
