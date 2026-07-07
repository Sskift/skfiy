import { describe, expect, it } from "vitest";

import {
  formatReplayAction,
  formatReplayPlanner,
  getPanelVisibilityState,
  getReplayAccessibilityLabel,
  getReplayOcrLabel
} from "./app-view-model";

describe("app view model", () => {
  it("derives panel visibility without React state", () => {
    expect(getPanelVisibilityState({
      assistantPanelOpen: false,
      detailsOpen: false,
      hasStartupWarning: false,
      permissionOnboardingOpen: false,
      taskStatus: "idle"
    })).toEqual({
      bubbleAriaLabel: "skfiy task status",
      settingsBubble: false,
      showPanel: false,
      showStartupWarning: false
    });

    expect(getPanelVisibilityState({
      assistantPanelOpen: true,
      detailsOpen: false,
      hasStartupWarning: true,
      permissionOnboardingOpen: false,
      taskStatus: "idle"
    })).toMatchObject({
      bubbleAriaLabel: "skfiy assistant panel",
      settingsBubble: false,
      showPanel: true,
      showStartupWarning: true
    });

    expect(getPanelVisibilityState({
      assistantPanelOpen: false,
      detailsOpen: true,
      hasStartupWarning: true,
      permissionOnboardingOpen: false,
      taskStatus: "idle"
    })).toEqual({
      bubbleAriaLabel: "skfiy settings",
      settingsBubble: true,
      showPanel: true,
      showStartupWarning: false
    });

    expect(getPanelVisibilityState({
      assistantPanelOpen: false,
      detailsOpen: false,
      hasStartupWarning: false,
      permissionOnboardingOpen: false,
      taskStatus: "blocked"
    })).toMatchObject({
      bubbleAriaLabel: "skfiy task status",
      showPanel: true
    });
  });

  it("formats replay accessibility and OCR labels", () => {
    expect(getReplayAccessibilityLabel({ accessibilityTrusted: true })).toBe("AX ok");
    expect(getReplayAccessibilityLabel({ accessibilityTrusted: false })).toBe("AX denied");
    expect(getReplayAccessibilityLabel({})).toBe("AX unknown");

    expect(getReplayOcrLabel({})).toBeNull();
    expect(getReplayOcrLabel({ ocrLabels: [{ text: "Open" }, { text: "Save" }] })).toBe("OCR 2");
  });

  it("formats replay planner and action summaries", () => {
    expect(formatReplayPlanner({
      providerLabel: "Local",
      command: "open Finder",
      rationale: "Need file context"
    })).toBe("Local: open Finder (Need file context)");
    expect(formatReplayPlanner({
      providerLabel: "Codex",
      command: "observe"
    })).toBe("Codex: observe");

    expect(formatReplayAction({ type: "plan", providerLabel: "Local", command: "click" })).toBe("plan: Local click");
    expect(formatReplayAction({ type: "type_text", text: "hello" })).toBe("type_text: hello");
    expect(formatReplayAction({ type: "press_key", key: "Enter" })).toBe("press_key: Enter");
    expect(formatReplayAction({ type: "activate_app", appName: "Finder" })).toBe("activate_app: Finder");
    expect(formatReplayAction({ type: "open_session", bundleId: "com.apple.finder" })).toBe("open_session: com.apple.finder");
    expect(formatReplayAction({ type: "recover", action: "retry", stage: "after" })).toBe("recover: retry after");
    expect(formatReplayAction({
      type: "verify",
      actionType: "screen",
      status: "failed",
      reason: "button missing"
    })).toBe("verify: screen failed button missing");
    expect(formatReplayAction({ type: "custom" })).toBe("custom");
  });
});
