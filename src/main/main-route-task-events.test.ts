import { describe, expect, it } from "vitest";

import {
  createAssistantChatRouteTaskEvent,
  createAssistantTurnFailedRouteTaskEvent,
  createNeedsClarificationRouteTaskEvent,
  createNeedsConfirmationRouteTaskEvent,
  createTerminalRouteTaskEvent
} from "./main-route-task-events";
import {
  CHROME_BUNDLE_ID,
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
    })).toEqual({
      status: "failed",
      message: "Codex failed.",
      command: "open https://example.test",
      route: "chrome",
      routeReason: "Codex failed."
    });
  });

  it("keeps clarification route outcomes distinct from generic failures", () => {
    expect(createNeedsClarificationRouteTaskEvent({
      kind: "needs_clarification",
      reason: "No supported desktop control route matched this request."
    })).toEqual({
      status: "needs_clarification",
      message: "No supported desktop control route matched this request. 请明确目标应用和动作。",
      routeReason: "No supported desktop control route matched this request."
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
    })).toEqual({
      status: "denied",
      message: "User denied this desktop control request.",
      command: "do not open Chrome",
      route: "chrome",
      routeReason: "User denied this desktop control request.",
      denialKind: "user"
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
    })).toEqual({
      status: "blocked",
      message: "Route policy blocks destructive or sensitive terminal commands before Computer Use.",
      command: "run rm -rf / in Ghostty",
      route: "ghostty",
      routeReason: "Route policy blocks destructive or sensitive terminal commands before Computer Use.",
      policyKind: "route-policy"
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
    })).toEqual({
      status: "needs_confirmation",
      message: "Route policy requires confirmation before continuing with Chrome.",
      command: "ask before opening Chrome",
      route: "chrome",
      routeReason: "Route policy requires confirmation before continuing with Chrome.",
      policyKind: "route-policy"
    });
  });
});
