import { describe, expect, it } from "vitest";
import { readExplicitRouteOutcome, readRouteOutcome } from "./route-outcome";

describe("readRouteOutcome", () => {
  it("preserves pending approval over a running route state", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "running",
        approvalState: "pending",
        command: "organize Downloads",
        route: "finder",
        routeReason: "Finder file moves need review."
      }
    })).toEqual({
      kind: "approval_required",
      title: "Route approval required",
      value: "approval_required",
      detail: "Finder file moves need review.",
      tone: "warning",
      source: "Current turn",
      routeLabel: "finder",
      state: "running"
    });
  });

  it("preserves approvalRequired over an observing route state", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "observing",
        approvalRequired: true,
        route: "chrome",
        latestMessage: "Chrome page action requires approval."
      }
    })).toMatchObject({
      kind: "approval_required",
      value: "approval_required",
      detail: "Chrome page action requires approval.",
      routeLabel: "chrome",
      state: "observing"
    });
  });

  it("does not let stale approval metadata override terminal route outcomes", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "completed",
        approvalState: "pending",
        route: "finder",
        latestMessage: "Finder organization completed."
      }
    })).toMatchObject({
      kind: "completed",
      value: "completed",
      tone: "success",
      state: "completed"
    });
  });

  it("does not let stale approval metadata override confirmation routing", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "needs_confirmation",
        approvalState: "required",
        route: "finder",
        latestMessage: "Confirm the Finder plan."
      }
    })).toMatchObject({
      kind: "needs_confirmation",
      value: "needs_confirmation",
      tone: "warning",
      state: "needs_confirmation"
    });
  });

  it("uses stopTurnBehavior to preserve stopped semantics without relying on status text", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "cancelled",
        command: "stop current task",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      }
    })).toMatchObject({
      kind: "stopped",
      title: "Route stopped",
      value: "stopped",
      detail: "Task stopped.",
      tone: "neutral",
      state: "cancelled"
    });
  });

  it("infers completed route outcome from replay-only evidence", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        outcome: "completed",
        latestToolCall: {
          route: "chrome",
          summary: "Chrome page opened."
        }
      }
    })).toEqual({
      kind: "completed",
      title: "Route completed",
      value: "completed",
      detail: "Chrome page opened.",
      tone: "success",
      source: "turn-replay",
      routeLabel: "chrome",
      state: "completed"
    });
  });

  it("infers confirmation route outcome from replay timeline when current turn is absent", () => {
    expect(readRouteOutcome({
      replay: {
        source: "runtime-snapshot",
        timelineTail: [
          {
            status: "needs_confirmation",
            route: "finder",
            routeReason: "Finder verification needs confirmation."
          }
        ]
      }
    })).toMatchObject({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Finder verification needs confirmation.",
      tone: "warning",
      source: "runtime-snapshot",
      routeLabel: "finder",
      state: "needs_confirmation"
    });
  });

  it("infers stopped route outcome from replay stop behavior without current turn text", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        outcome: "cancelled",
        latestToolCall: {
          route: "tmux_supervision"
        },
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      }
    })).toMatchObject({
      kind: "stopped",
      title: "Route stopped",
      value: "stopped",
      detail: "Task stopped.",
      tone: "neutral",
      source: "turn-replay",
      routeLabel: "tmux_supervision",
      state: "cancelled"
    });
  });

  it("keeps route denial and policy metadata on the classified outcome", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "blocked",
        route: "finder",
        routeReason: "Finder is denied by app policy.",
        denialKind: "app_policy",
        policyKind: "app-policy"
      }
    })).toMatchObject({
      kind: "app_policy_denied",
      value: "app_policy_denied",
      routeLabel: "finder",
      state: "blocked",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
  });

  it("keeps policy denial metadata distinct even when the route state is denied", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "denied",
        route: "finder",
        routeReason: "Finder is denied by app policy.",
        policyKind: "app-policy"
      }
    })).toMatchObject({
      kind: "app_policy_denied",
      value: "app_policy_denied",
      routeLabel: "finder",
      state: "denied",
      policyKind: "app-policy"
    });

    expect(readRouteOutcome({
      currentTurn: {
        state: "denied",
        route: "chrome",
        routeReason: "Chrome host policy blocked this approved task: blocked.example",
        policyKind: "chrome-host-policy"
      }
    })).toMatchObject({
      kind: "chrome_host_policy_denied",
      value: "chrome_host_policy_denied",
      routeLabel: "chrome",
      state: "denied",
      policyKind: "chrome-host-policy"
    });
  });

  it("keeps plain denied route state classified as user denial", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "denied",
        route: "ghostty",
        routeReason: "User denied this desktop control request.",
        denialKind: "user"
      }
    })).toMatchObject({
      kind: "user_denied",
      value: "user_denied",
      routeLabel: "ghostty",
      state: "denied",
      denialKind: "user"
    });
  });

  it("redacts tokens and local paths from route detail by default", () => {
    const outcome = readRouteOutcome({
      currentTurn: {
        state: "blocked",
        route: "finder",
        routeReason: "Finder is denied by app policy at /Users/tester/Downloads with token=secret-token and Bearer abc.def",
        denialKind: "app_policy",
        policyKind: "app-policy",
        command: "organize /Users/tester/Downloads?token=secret-token"
      }
    });

    expect(outcome).toMatchObject({
      kind: "app_policy_denied",
      detail: "Finder is denied by app policy at [path] with token=[redacted] and Bearer [redacted]",
      routeLabel: "finder",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
    expect(JSON.stringify(outcome)).not.toContain("secret-token");
    expect(JSON.stringify(outcome)).not.toContain("/Users/tester");
    expect(JSON.stringify(outcome)).not.toContain("abc.def");
  });
});

describe("readExplicitRouteOutcome", () => {
  it("completes partial explicit route outcomes from their kind", () => {
    const fallback = readRouteOutcome({
      currentTurn: {},
      replay: { state: "empty" },
      defaultSource: "runtime-snapshot"
    });

    expect(readExplicitRouteOutcome({
      kind: "chrome_host_policy_denied",
      detail: "Blocked token=secret-token at /Users/tester/Profile",
      policyKind: "chrome-host-policy"
    }, fallback)).toEqual({
      kind: "chrome_host_policy_denied",
      title: "Chrome host policy denied route",
      value: "chrome_host_policy_denied",
      detail: "Blocked token=[redacted] at [path]",
      tone: "danger",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "chrome_host_policy_denied",
      policyKind: "chrome-host-policy"
    });
  });

  it("can ignore explicit records without a valid kind when a surface requires kind as the anchor", () => {
    const fallback = readRouteOutcome({
      currentTurn: {
        state: "running",
        route: "chrome",
        latestMessage: "Chrome action is running."
      }
    });

    expect(readExplicitRouteOutcome({
      title: "Route failed",
      tone: "danger"
    }, fallback, { requireKind: true })).toBeUndefined();
  });
});
