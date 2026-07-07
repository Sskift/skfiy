import { describe, expect, it } from "vitest";

import {
  formatReplayAction,
  formatReplayPlanner,
  getAppRootViewModel,
  getLocalReplayViewModel,
  getPanelVisibilityState,
  getReplayAccessibilityLabel,
  getReplayOcrLabel,
  getUserDashboardPanelViewModel,
  readSelectedAssistantAgentProvider
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

  it("selects the assistant agent provider by selected flag, mode, then fallback", () => {
    const fallbackProvider = { id: "codex", label: "Codex" };
    const providers = [
      fallbackProvider,
      { id: "claude-code", label: "Claude Code" },
      { id: "hermes", label: "Hermes", selected: true }
    ];

    expect(readSelectedAssistantAgentProvider(providers, "claude-code", fallbackProvider))
      .toEqual({ id: "hermes", label: "Hermes", selected: true });
    expect(readSelectedAssistantAgentProvider(providers.slice(0, 2), "claude-code", fallbackProvider))
      .toEqual({ id: "claude-code", label: "Claude Code" });
    expect(readSelectedAssistantAgentProvider(providers.slice(0, 1), "hermes", fallbackProvider))
      .toBe(fallbackProvider);
  });

  it("derives the app root view model from renderer state", () => {
    const fallbackProvider = { id: "codex", label: "Codex" };
    const claudeProvider = { id: "claude-code", label: "Claude Code" };
    const startupWarning = {
      title: "Launch warning",
      message: "Started outside bundle"
    };

    expect(getAppRootViewModel({
      assistantAgentSettings: {
        providers: [fallbackProvider, claudeProvider],
        settings: { mode: "claude-code" }
      },
      fallbackAssistantAgentProvider: fallbackProvider,
      panelState: {
        assistantPanelOpen: false,
        detailsOpen: false,
        permissionOnboardingOpen: false
      },
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "not-determined" }
      },
      startupWarnings: [startupWarning],
      taskStatus: "idle"
    })).toEqual({
      panelVisibility: {
        bubbleAriaLabel: "skfiy task status",
        settingsBubble: false,
        showPanel: true,
        showStartupWarning: true
      },
      permissionOnboardingRows: [
        { key: "accessibility", settingsTarget: "accessibility", label: "辅助功能" }
      ],
      petState: "idle",
      selectedAssistantAgentProvider: claudeProvider,
      startupWarning,
      status: {
        label: "Idle",
        message: "待命中.",
        pulse: "Tucked"
      }
    });
  });

  it("derives the user dashboard panel view model", () => {
    expect(getUserDashboardPanelViewModel({
      desktopSessionDiagnostics: {
        state: "blocked",
        reason: "Desktop is locked."
      },
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "denied" }
      },
      task: {
        status: "approval_required",
        message: "Need approval."
      },
      turnReplay: {
        transcript: {
          outcome: "verification_failed",
          command: "move files",
          risk: {
            level: "medium",
            reason: "Moving files needs review.",
            requiresApproval: true
          }
        }
      }
    })).toEqual({
      canApprove: true,
      canStop: true,
      permissionHealth: {
        label: "桌面暂不可控",
        detail: "Desktop is locked.",
        tone: "danger"
      },
      recent: {
        label: "需要确认",
        detail: "move files",
        tone: "danger"
      },
      risk: {
        label: "中风险，需要审批",
        detail: "Moving files needs review.",
        tone: "warning"
      },
      status: {
        label: "等待审批",
        detail: "Need approval.",
        tone: "warning"
      }
    });
  });

  it("derives the local replay viewer model", () => {
    expect(getLocalReplayViewModel(null)).toEqual({
      actionItems: [],
      command: "未记录",
      hasTranscript: false,
      headingOutcome: "empty",
      plannerItems: [],
      riskLevel: "unknown",
      screenshotItems: [],
      timelineItems: []
    });

    expect(getLocalReplayViewModel({
      transcript: {
        outcome: "completed",
        command: "open Finder",
        risk: { level: "low" },
        planner: {
          providerLabel: "Local",
          command: "click Downloads",
          rationale: "Need file context"
        },
        actions: [
          { type: "activate_app", appName: "Finder" },
          { type: "press_key", key: "Enter" }
        ],
        screenshots: [
          { stage: "before", path: "/tmp/before.png" },
          {
            stage: "after",
            path: "/tmp/after.png",
            grounding: { recommendation: "high confidence" }
          }
        ]
      },
      timeline: [
        { status: "observing", message: "Looking at Finder" },
        { status: "executing", command: "click Downloads" }
      ]
    })).toEqual({
      actionItems: [
        "activate_app: Finder",
        "press_key: Enter"
      ],
      command: "open Finder",
      hasTranscript: true,
      headingOutcome: "completed",
      plannerItems: ["Local: click Downloads (Need file context)"],
      riskLevel: "low",
      screenshotItems: [
        "before: /tmp/before.png",
        "after: /tmp/after.png (high confidence)"
      ],
      timelineItems: [
        "observing: Looking at Finder",
        "executing: click Downloads"
      ]
    });
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
