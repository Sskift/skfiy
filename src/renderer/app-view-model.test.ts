import { describe, expect, it } from "vitest";

import {
  formatReplayAction,
  formatReplayPlanner,
  getAppRootViewModel,
  getFinderPlanPreviewSummaryViewModel,
  getLocalReplayViewModel,
  getPanelVisibilityState,
  getPetRouteOutcomeSignal,
  getPermissionDisplayRows,
  getPermissionsPanelViewModel,
  getPlannerProviderDisplayViewModel,
  getReplayAccessibilityLabel,
  getReplayOcrLabel,
  getTaskReplayRows,
  getUserDashboardPanelViewModel,
  readPetRouteOutcome,
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

  it("shows clarification as a warning task state in dashboard copy", () => {
    expect(getUserDashboardPanelViewModel({
      desktopSessionDiagnostics: {
        state: "controllable",
        reason: "Desktop session is interactive."
      },
      task: {
        status: "needs_clarification",
        message: "Clarify the target app."
      },
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "granted" }
      },
      turnReplay: null
    }).status).toEqual({
      label: "需要澄清目标",
      detail: "Clarify the target app.",
      tone: "warning"
    });
  });

  it("derives task replay rows for display", () => {
    expect(getTaskReplayRows([])).toEqual([]);
    expect(getTaskReplayRows([
      {
        stage: "before",
        screenshotPath: "/tmp/before.png",
        accessibilityTrusted: false,
        ocrLabels: [{ text: "Open" }]
      },
      {
        stage: "after",
        screenshotPath: "/tmp/after.png",
        accessibilityTrusted: true
      }
    ])).toEqual([
      {
        accessibilityLabel: "AX denied",
        accessibilityState: "denied",
        key: "before",
        ocrLabel: "OCR 1",
        screenshotPath: "/tmp/before.png",
        stage: "before"
      },
      {
        accessibilityLabel: "AX ok",
        accessibilityState: "ok",
        key: "after",
        ocrLabel: null,
        screenshotPath: "/tmp/after.png",
        stage: "after"
      }
    ]);
  });

  it("derives the Finder plan preview summary model", () => {
    expect(getFinderPlanPreviewSummaryViewModel({
      rootPath: "/Users/me/Desktop",
      operationCount: 4,
      destructiveOperationCount: 1,
      moveFiles: [
        { from: "/Users/me/Desktop/a.txt", to: "/Users/me/Desktop/folder/a.txt" },
        { from: "/Users/me/Desktop/b.txt", to: "/Users/me/Desktop/folder/b.txt" },
        { from: "/Users/me/Desktop/c.txt", to: "/Users/me/Desktop/folder/c.txt" },
        { from: "/Users/me/Desktop/d.txt", to: "/Users/me/Desktop/folder/d.txt" }
      ]
    })).toEqual({
      destructiveOperationCount: 1,
      moveCount: 4,
      moveItems: [
        { key: "/Users/me/Desktop/a.txt->/Users/me/Desktop/folder/a.txt", label: "a.txt -> folder/a.txt" },
        { key: "/Users/me/Desktop/b.txt->/Users/me/Desktop/folder/b.txt", label: "b.txt -> folder/b.txt" },
        { key: "/Users/me/Desktop/c.txt->/Users/me/Desktop/folder/c.txt", label: "c.txt -> folder/c.txt" }
      ],
      operationCount: 4
    });
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

  it("derives permission panel display rows", () => {
    expect(getPermissionsPanelViewModel({
      desktopSessionDiagnostics: {
        state: "blocked",
        reason: "Desktop is locked."
      },
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "denied" }
      },
      permissionsLoading: false
    })).toEqual({
      desktopSession: {
        reason: "Desktop is locked.",
        showReason: true,
        state: "denied",
        stateLabel: "不可控"
      },
      permissionRows: [
        {
          key: "screenRecording",
          label: "屏幕录制",
          settingsTarget: "screen-recording",
          state: "granted",
          stateLabel: "已授权"
        },
        {
          key: "accessibility",
          label: "辅助功能",
          settingsTarget: "accessibility",
          state: "denied",
          stateLabel: "未授权"
        }
      ]
    });

    expect(getPermissionDisplayRows({
      loading: true,
      permissions: {
        screenRecording: { state: "not-determined" },
        accessibility: { state: "unknown" }
      },
      rows: [{ key: "accessibility", label: "辅助功能", settingsTarget: "accessibility" }]
    })).toEqual([
      {
        key: "accessibility",
        label: "辅助功能",
        settingsTarget: "accessibility",
        state: "unknown",
        stateLabel: "检查中"
      }
    ]);
  });

  it("derives planner provider display labels", () => {
    expect(getPlannerProviderDisplayViewModel({
      mode: "external-cua",
      externalProviderLabel: "Claude Desktop"
    })).toEqual({
      runtimeLabel: "规划可用",
      settingsHeading: "Claude Desktop",
      showExternalStatus: true
    });

    expect(getPlannerProviderDisplayViewModel({
      mode: "disabled",
      externalProviderLabel: "Claude Desktop"
    })).toEqual({
      runtimeLabel: "规划已关闭",
      settingsHeading: "Computer Use",
      showExternalStatus: false
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
      routeOutcome: {
        kind: "approval_required",
        title: "Route approval required",
        value: "approval_required",
        detail: "Need approval.",
        tone: "warning",
        source: "pet-ui",
        routeLabel: "unknown",
        state: "approval_required"
      },
      routeOutcomeSignal: {
        label: "路由待审批",
        detail: "Need approval.",
        tone: "warning"
      },
      status: {
        label: "等待审批",
        detail: "Need approval.",
        tone: "warning"
      }
    });
  });

  it.each([
    [
      "app-policy denial",
      {
        task: {
          status: "blocked" as const,
          message: "Ghostty is denied by app policy with token=secret-token.",
          command: "open Ghostty"
        },
        turnReplay: {
          transcript: {
            command: "open Ghostty",
            actions: [
              {
                type: "tool_result",
                route: "ghostty",
                status: "blocked",
                summary: "Ghostty is denied by app policy with token=secret-token."
              }
            ]
          },
          timeline: [
            {
              status: "blocked" as const,
              route: "ghostty",
              message: "Ghostty is denied by app policy."
            }
          ]
        }
      },
      {
        kind: "app_policy_denied",
        title: "App policy denied route",
        value: "app_policy_denied",
        tone: "danger",
        routeLabel: "ghostty",
        detail: "Ghostty is denied by app policy with token=[redacted]"
      }
    ],
    [
      "user denial",
      {
        task: {
          status: "denied" as const,
          message: "User denied this Computer Use turn."
        },
        turnReplay: {
          transcript: {
            actions: [
              {
                type: "tool_call",
                route: "chrome",
                status: "approval_required"
              }
            ]
          },
          timeline: [
            {
              status: "denied" as const,
              route: "chrome",
              message: "User denied this Computer Use turn."
            }
          ]
        }
      },
      {
        kind: "user_denied",
        title: "User denied route",
        value: "user_denied",
        tone: "neutral",
        routeLabel: "chrome"
      }
    ],
    [
      "blocked user denial metadata",
      {
        task: {
          status: "blocked" as const,
          message: "User denied this Finder organization request.",
          denialKind: "user"
        },
        turnReplay: {
          transcript: {
            actions: [
              {
                type: "tool_call",
                route: "finder",
                status: "approval_required"
              }
            ]
          }
        }
      },
      {
        kind: "user_denied",
        title: "User denied route",
        value: "user_denied",
        tone: "neutral",
        routeLabel: "finder"
      }
    ],
    [
      "confirmation gate",
      {
        task: {
          status: "needs_confirmation" as const,
          message: "Finder plan confirmation required."
        },
        turnReplay: {
          transcript: {
            actions: [
              {
                type: "tool_call",
                route: "finder",
                status: "approval_required"
              }
            ]
          }
        }
      },
      {
        kind: "needs_confirmation",
        title: "Route needs confirmation",
        value: "needs_confirmation",
        tone: "warning",
        routeLabel: "finder"
      }
    ],
    [
      "clarification request",
      {
        task: {
          status: "needs_clarification" as const,
          message: "No supported desktop control route matched this request. 请明确目标应用和动作。"
        },
        turnReplay: {
          timeline: [
            {
              status: "needs_clarification" as const,
              routeReason: "No supported desktop control route matched this request."
            }
          ]
        }
      },
      {
        kind: "needs_clarification",
        title: "Route needs clarification",
        value: "needs_clarification",
        tone: "warning",
        routeLabel: "unknown",
        detail: "No supported desktop control route matched this request."
      }
    ],
    [
      "cancellation",
      {
        task: {
          status: "cancelled" as const,
          message: "Browser task cancelled before execution."
        },
        turnReplay: {
          transcript: {
            actions: [
              {
                type: "tool_result",
                route: "tmux_supervision",
                status: "cancelled"
              }
            ]
          }
        }
      },
      {
        kind: "cancelled",
        title: "Route cancelled",
        value: "cancelled",
        tone: "neutral",
        routeLabel: "tmux_supervision",
        detail: "Browser task cancelled before execution."
      }
    ],
    [
      "stop turn",
      {
        task: {
          status: "cancelled" as const,
          message: "Task stopped."
        },
        turnReplay: {
          transcript: {
            actions: [
              {
                type: "tool_result",
                route: "tmux_supervision",
                status: "cancelled"
              }
            ]
          }
        }
      },
      {
        kind: "stopped",
        title: "Route stopped",
        value: "stopped",
        tone: "neutral",
        routeLabel: "tmux_supervision",
        detail: "Task stopped."
      }
    ],
    [
      "completion",
      {
        task: {
          status: "completed" as const,
          message: "Chrome page opened."
        },
        turnReplay: {
          transcript: {
            command: "open Chrome",
            actions: [
              {
                type: "tool_result",
                route: "chrome",
                status: "completed",
                summary: "Chrome page opened."
              }
            ]
          }
        }
      },
      {
        kind: "completed",
        title: "Route completed",
        value: "completed",
        tone: "success",
        routeLabel: "chrome",
        detail: "Chrome page opened."
      }
    ]
  ])("preserves pet route outcome for %s", (_label, input, expected) => {
    expect(readPetRouteOutcome(input)).toMatchObject({
      ...expected,
      source: "pet-ui"
    });
  });

  it("uses structured stopTurnBehavior for pet stopped routes without matching message text", () => {
    const outcome = readPetRouteOutcome({
      task: {
        status: "cancelled",
        message: "Operator interrupted the current turn.",
        route: "chrome",
        stopTurnBehavior: {
          result: "stopped",
          source: "hotkey",
          command: "stop-current-turn",
          beforeStatus: "running",
          beforeMessage: "Observing Chrome.",
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      },
      turnReplay: null
    });

    expect(outcome).toMatchObject({
      kind: "stopped",
      title: "Route stopped",
      value: "stopped",
      tone: "neutral",
      routeLabel: "chrome",
      detail: "Operator interrupted the current turn."
    });
    expect(getPetRouteOutcomeSignal(outcome)).toEqual({
      label: "路由已停止",
      detail: "chrome · Operator interrupted the current turn.",
      tone: "neutral"
    });
  });

  it("uses task event route metadata before falling back to message text", () => {
    const outcome = readPetRouteOutcome({
      task: {
        status: "blocked",
        message: "Ghostty cannot continue.",
        route: "ghostty",
        routeReason: "Configured app policy blocked Ghostty.",
        denialKind: "app_policy",
        policyKind: "app-policy"
      },
      turnReplay: null
    });

    expect(outcome).toMatchObject({
      kind: "app_policy_denied",
      title: "App policy denied route",
      value: "app_policy_denied",
      tone: "danger",
      routeLabel: "ghostty",
      detail: "Configured app policy blocked Ghostty."
    });
    expect(getPetRouteOutcomeSignal(outcome)).toEqual({
      label: "应用策略拒绝",
      detail: "ghostty · Configured app policy blocked Ghostty.",
      tone: "danger"
    });
  });

  it("uses explicit replay route outcome for the pet route signal with UI redaction", () => {
    const outcome = readPetRouteOutcome({
      task: {
        status: "blocked",
        message: "Blocked by policy."
      },
      turnReplay: {
        routeOutcome: {
          kind: "app_policy_denied",
          title: "App policy denied route",
          value: "app_policy_denied",
          detail: "Ghostty denied by app policy with token=secret-token",
          tone: "danger",
          source: "turn-replay",
          routeLabel: "ghostty",
          state: "blocked"
        },
        transcript: {
          actions: []
        }
      }
    });

    expect(outcome).toEqual({
      kind: "app_policy_denied",
      title: "App policy denied route",
      value: "app_policy_denied",
      detail: "Ghostty denied by app policy with token=[redacted]",
      tone: "danger",
      source: "turn-replay",
      routeLabel: "ghostty",
      state: "blocked"
    });
    expect(getPetRouteOutcomeSignal(outcome)).toEqual({
      label: "应用策略拒绝",
      detail: "ghostty · Ghostty denied by app policy with token=[redacted]",
      tone: "danger"
    });
  });

  it("keeps idle pet route signal from being overwritten by stale replay outcome", () => {
    expect(readPetRouteOutcome({
      task: {
        status: "idle",
        message: "待命中."
      },
      turnReplay: {
        routeOutcome: {
          kind: "completed",
          title: "Route completed",
          value: "completed",
          detail: "Chrome page opened.",
          tone: "success",
          source: "turn-replay",
          routeLabel: "chrome",
          state: "completed"
        },
        transcript: {
          command: "open Chrome",
          actions: [
            {
              type: "tool_result",
              route: "chrome",
              status: "completed",
              summary: "Chrome page opened."
            }
          ]
        }
      }
    })).toMatchObject({
      kind: "unknown",
      source: "pet-ui"
    });
  });

  it("keeps idle pet route signal compact", () => {
    expect(getPetRouteOutcomeSignal(readPetRouteOutcome({
      task: {
        status: "idle",
        message: "待命中."
      },
      turnReplay: null
    }))).toEqual({
      label: "路由待命",
      detail: "暂无路由活动",
      tone: "neutral"
    });
  });

  it("keeps pet clarification route signal distinct from confirmation", () => {
    expect(getPetRouteOutcomeSignal(readPetRouteOutcome({
      task: {
        status: "needs_clarification",
        message: "Generic visible-app control is not a supported product route yet. 请明确目标应用和动作。"
      },
      turnReplay: null
    }))).toEqual({
      label: "路由待澄清",
      detail: "Generic visible-app control is not a supported product route yet. 请明确目标应用和动作。",
      tone: "warning"
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
