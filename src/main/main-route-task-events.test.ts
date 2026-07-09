import { describe, expect, it } from "vitest";

import {
  createAppPolicyApprovalRequiredTaskEvent,
  createAppPolicyBlockedTaskEvent,
  createAssistantChatRouteTaskEvent,
  createAssistantTurnFailedRouteTaskEvent,
  createChromeHostPolicyAllowedTaskEvent,
  createChromeHostPolicyApprovalFailedTaskEvent,
  createChromeHostPolicyBlockedTaskEvent,
  createComputerUseFailureTaskEvent,
  createNeedsClarificationRouteTaskEvent,
  createNeedsConfirmationRouteTaskEvent,
  createPlannerUnavailableTaskEvent,
  createStopTurnTaskEvent,
  createTerminalRouteTaskEvent
} from "./main-route-task-events";
import {
  CHROME_BUNDLE_ID,
  FINDER_BUNDLE_ID,
  GHOSTTY_BUNDLE_ID,
  type CommandRoute
} from "./task-routing";

describe("main route task event helpers", () => {
  it("maps chat route assistant turns to completed or failed task events", () => {
    expect(createAssistantChatRouteTaskEvent({
      status: "completed",
      message: "我是 skfiy。"
    })).toEqual({
      status: "completed",
      message: "我是 skfiy。"
    });

    expect(createAssistantChatRouteTaskEvent({
      status: "failed",
      message: "Background Agent 暂时不可用."
    })).toEqual({
      status: "failed",
      message: "Background Agent 暂时不可用."
    });
  });

  it("adds route metadata to failed assistant turns before Computer Use starts", () => {
    const route: CommandRoute = {
      kind: "chrome",
      bundleId: CHROME_BUNDLE_ID
    };

    expect(createAssistantTurnFailedRouteTaskEvent({
      command: "open https://example.test",
      message: "Codex failed.",
      route
    })).toMatchObject({
      status: "failed",
      message: "Codex failed.",
      command: "open https://example.test",
      route: "chrome",
      routeReason: "Codex failed.",
      routeOutcome: {
        kind: "failed",
        value: "failed",
        routeLabel: "chrome",
        source: "task-event"
      }
    });
  });

  it("keeps clarification route outcomes distinct from generic failures", () => {
    expect(createNeedsClarificationRouteTaskEvent({
      kind: "needs_clarification",
      reason: "No supported desktop control route matched this request."
    })).toMatchObject({
      status: "needs_clarification",
      message: "No supported desktop control route matched this request. 请明确目标应用和动作。",
      routeReason: "No supported desktop control route matched this request.",
      routeOutcome: {
        kind: "needs_clarification",
        value: "needs_clarification",
        source: "task-event"
      }
    });
  });

  it("preserves route-level denied and blocked outcomes", () => {
    expect(createTerminalRouteTaskEvent({
      command: "do not open Chrome",
      route: {
        kind: "denied",
        reason: "User denied this desktop control request.",
        targetRoute: {
          kind: "chrome",
          bundleId: CHROME_BUNDLE_ID
        }
      }
    })).toMatchObject({
      status: "denied",
      message: "User denied this desktop control request.",
      command: "do not open Chrome",
      route: "chrome",
      routeReason: "User denied this desktop control request.",
      denialKind: "user",
      routeOutcome: {
        kind: "user_denied",
        value: "user_denied",
        routeLabel: "chrome",
        source: "task-event"
      }
    });

    expect(createTerminalRouteTaskEvent({
      command: "run rm -rf / in Ghostty",
      route: {
        kind: "blocked",
        reason: "Route policy blocks destructive or sensitive terminal commands before Computer Use.",
        targetRoute: {
          kind: "ghostty",
          bundleId: GHOSTTY_BUNDLE_ID
        }
      }
    })).toMatchObject({
      status: "blocked",
      message: "Route policy blocks destructive or sensitive terminal commands before Computer Use.",
      command: "run rm -rf / in Ghostty",
      route: "ghostty",
      routeReason: "Route policy blocks destructive or sensitive terminal commands before Computer Use.",
      policyKind: "route-policy",
      routeOutcome: {
        kind: "blocked",
        value: "blocked",
        routeLabel: "ghostty",
        source: "task-event",
        policyKind: "route-policy"
      }
    });
  });

  it("creates route-policy confirmation events with target route metadata", () => {
    expect(createNeedsConfirmationRouteTaskEvent({
      command: "ask before opening Chrome",
      route: {
        kind: "needs_confirmation",
        reason: "Route policy requires confirmation before continuing with Chrome.",
        targetRoute: {
          kind: "chrome",
          bundleId: CHROME_BUNDLE_ID
        }
      }
    })).toMatchObject({
      status: "needs_confirmation",
      message: "Route policy requires confirmation before continuing with Chrome.",
      command: "ask before opening Chrome",
      route: "chrome",
      routeReason: "Route policy requires confirmation before continuing with Chrome.",
      policyKind: "route-policy",
      routeOutcome: {
        kind: "needs_confirmation",
        value: "needs_confirmation",
        routeLabel: "chrome",
        source: "task-event",
        policyKind: "route-policy"
      }
    });
  });

  it("creates distinct app-policy blocked and approval-required events", () => {
    expect(createAppPolicyBlockedTaskEvent({
      command: "organize Finder",
      reason: "Finder is denied by app policy.",
      route: {
        kind: "finder",
        bundleId: FINDER_BUNDLE_ID
      }
    })).toMatchObject({
      status: "blocked",
      message: "Finder is denied by app policy.",
      command: "organize Finder",
      route: "finder",
      routeReason: "Finder is denied by app policy.",
      denialKind: "app_policy",
      policyKind: "app-policy",
      routeOutcome: {
        kind: "app_policy_denied",
        value: "app_policy_denied",
        routeLabel: "finder",
        source: "task-event",
        denialKind: "app_policy",
        policyKind: "app-policy"
      }
    });

    expect(createAppPolicyApprovalRequiredTaskEvent({
      command: "open Chrome",
      reason: "Chrome requires approval by app policy.",
      route: {
        kind: "chrome",
        bundleId: CHROME_BUNDLE_ID
      }
    })).toMatchObject({
      status: "approval_required",
      message: "Approval required (app policy): Chrome requires approval by app policy.",
      command: "open Chrome",
      route: "chrome",
      routeReason: "Chrome requires approval by app policy.",
      policyKind: "app-policy",
      routeOutcome: {
        kind: "approval_required",
        value: "approval_required",
        routeLabel: "chrome",
        source: "task-event",
        policyKind: "app-policy"
      }
    });
  });

  it("creates distinct Chrome host-policy route events", () => {
    const route = {
      kind: "chrome",
      bundleId: CHROME_BUNDLE_ID
    } as const;

    expect(createChromeHostPolicyBlockedTaskEvent({
      command: "open https://blocked.example",
      host: "blocked.example",
      route
    })).toMatchObject({
      status: "blocked",
      message: "Chrome host policy blocked this approved task: blocked.example",
      command: "open https://blocked.example",
      route: "chrome",
      routeReason: "Chrome host policy blocked this approved task: blocked.example",
      policyKind: "chrome-host-policy",
      routeOutcome: {
        kind: "chrome_host_policy_denied",
        value: "chrome_host_policy_denied",
        routeLabel: "chrome",
        source: "task-event",
        policyKind: "chrome-host-policy"
      }
    });

    expect(createChromeHostPolicyApprovalFailedTaskEvent({
      command: "open https://example.test",
      message: "policy file is not writable",
      route
    })).toMatchObject({
      status: "failed",
      message: "Chrome host policy approval failed: policy file is not writable",
      command: "open https://example.test",
      route: "chrome",
      routeReason: "Chrome host policy approval failed: policy file is not writable",
      policyKind: "chrome-host-policy",
      routeOutcome: {
        kind: "failed",
        value: "failed",
        routeLabel: "chrome",
        source: "task-event",
        policyKind: "chrome-host-policy"
      }
    });

    expect(createChromeHostPolicyAllowedTaskEvent({
      command: "open https://example.test",
      host: "example.test",
      route
    })).toMatchObject({
      status: "executing",
      message: "Chrome host policy allowed for current turn: example.test",
      command: "open https://example.test",
      route: "chrome",
      routeReason: "Chrome host policy allowed for current turn: example.test",
      policyKind: "chrome-host-policy",
      routeOutcome: {
        kind: "running",
        value: "executing",
        routeLabel: "chrome",
        source: "task-event",
        policyKind: "chrome-host-policy"
      }
    });
  });

  it("creates planner unavailable and Computer Use failure events with route reasons", () => {
    const route = {
      kind: "ghostty",
      bundleId: GHOSTTY_BUNDLE_ID
    } as const;

    expect(createPlannerUnavailableTaskEvent({
      command: "run pwd in Ghostty",
      status: "failed",
      message: "Computer Use planner is disabled in settings.",
      route
    })).toMatchObject({
      status: "failed",
      message: "Computer Use planner is disabled in settings.",
      command: "run pwd in Ghostty",
      route: "ghostty",
      routeReason: "Computer Use planner is disabled in settings.",
      routeOutcome: {
        kind: "failed",
        value: "failed",
        routeLabel: "ghostty",
        source: "task-event"
      }
    });

    expect(createComputerUseFailureTaskEvent({
      command: "run pwd in Ghostty",
      message: "Task failed.",
      route
    })).toMatchObject({
      status: "failed",
      message: "Task failed.",
      command: "run pwd in Ghostty",
      route: "ghostty",
      routeReason: "Task failed.",
      routeOutcome: {
        kind: "failed",
        value: "failed",
        routeLabel: "ghostty",
        source: "task-event"
      }
    });
  });

  it("creates structured stop-turn events for runtime route outcome preservation", () => {
    expect(createStopTurnTaskEvent()).toEqual({
      status: "cancelled",
      message: "Task stopped.",
      stopTurnBehavior: {
        afterStatus: "cancelled",
        afterMessage: "Task stopped."
      }
    });

    expect(createStopTurnTaskEvent({
      kind: "chrome",
      bundleId: CHROME_BUNDLE_ID
    })).toMatchObject({
      status: "cancelled",
      message: "Task stopped.",
      route: "chrome",
      routeReason: "Task stopped.",
      routeOutcome: {
        kind: "stopped",
        value: "stopped",
        routeLabel: "chrome",
        source: "task-event"
      },
      stopTurnBehavior: {
        afterStatus: "cancelled",
        afterMessage: "Task stopped."
      }
    });
  });
});
