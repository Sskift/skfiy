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

  it("normalizes legacy approval route states to approval semantics", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "approval-required",
        route: "finder",
        latestMessage: "Finder file moves need review."
      }
    })).toMatchObject({
      kind: "approval_required",
      title: "Route approval required",
      value: "approval_required",
      detail: "Finder file moves need review.",
      tone: "warning",
      routeLabel: "finder",
      state: "approval_required"
    });

    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "chrome",
          status: "needs_approval",
          summary: "Chrome page action requires approval."
        }
      }
    })).toMatchObject({
      kind: "approval_required",
      value: "approval_required",
      detail: "Chrome page action requires approval.",
      source: "turn-replay",
      routeLabel: "chrome",
      state: "approval_required"
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

  it("normalizes canceled aliases to canonical cancellation semantics", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "canceled",
        route: "chrome",
        latestMessage: "Browser task canceled before execution."
      }
    })).toMatchObject({
      kind: "cancelled",
      title: "Route cancelled",
      value: "cancelled",
      detail: "Browser task canceled before execution.",
      tone: "neutral",
      routeLabel: "chrome",
      state: "cancelled"
    });

    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "tmux_supervision",
          status: "canceled",
          summary: "Tmux supervision was canceled."
        }
      }
    })).toMatchObject({
      kind: "cancelled",
      value: "cancelled",
      detail: "Tmux supervision was canceled.",
      source: "turn-replay",
      routeLabel: "tmux_supervision",
      state: "cancelled"
    });
  });

  it("uses canceled stopTurnBehavior status aliases as structured stopped evidence", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "canceled",
        route: "chrome",
        latestMessage: "Operator interrupted the current turn.",
        stopTurnBehavior: {
          afterStatus: "canceled",
          afterMessage: "Operator interruption recorded."
        }
      }
    })).toMatchObject({
      kind: "stopped",
      title: "Route stopped",
      value: "stopped",
      detail: "Operator interrupted the current turn.",
      tone: "neutral",
      routeLabel: "chrome",
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

  it("normalizes legacy user-confirmation route states to confirmation semantics", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "needs_user_confirmation",
        route: "finder",
        latestMessage: "Finder verification needs user confirmation."
      }
    })).toMatchObject({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Finder verification needs user confirmation.",
      tone: "warning",
      routeLabel: "finder",
      state: "needs_confirmation"
    });

    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        timelineTail: [
          {
            status: "needs-user-confirmation",
            route: "chrome",
            message: "Chrome verification needs user confirmation."
          }
        ]
      }
    })).toMatchObject({
      kind: "needs_confirmation",
      value: "needs_confirmation",
      detail: "Chrome verification needs user confirmation.",
      source: "turn-replay",
      routeLabel: "chrome",
      state: "needs_confirmation"
    });
  });

  it("normalizes replay latest tool-call user-confirmation status without timeline state", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "chrome",
          status: "needs_user_confirmation",
          summary: "Chrome verification needs user confirmation."
        }
      }
    })).toMatchObject({
      kind: "needs_confirmation",
      value: "needs_confirmation",
      detail: "Chrome verification needs user confirmation.",
      routeLabel: "chrome",
      state: "needs_confirmation"
    });
  });

  it("normalizes legacy clarification route states to clarification semantics", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "needs-clarification",
        route: "visible-app",
        latestMessage: "Clarify the target app."
      }
    })).toMatchObject({
      kind: "needs_clarification",
      title: "Route needs clarification",
      value: "needs_clarification",
      detail: "Clarify the target app.",
      tone: "warning",
      routeLabel: "visible-app",
      state: "needs_clarification"
    });

    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        timelineTail: [
          {
            status: "needs_user_clarification",
            routeReason: "No supported desktop control route matched this request."
          }
        ]
      }
    })).toMatchObject({
      kind: "needs_clarification",
      value: "needs_clarification",
      detail: "No supported desktop control route matched this request.",
      source: "turn-replay",
      routeLabel: "unknown",
      state: "needs_clarification"
    });

    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "visible-app",
          status: "needs-user-clarification",
          summary: "Clarify the target app."
        }
      }
    })).toMatchObject({
      kind: "needs_clarification",
      value: "needs_clarification",
      detail: "Clarify the target app.",
      routeLabel: "visible-app",
      state: "needs_clarification"
    });
  });

  it("normalizes replay verification failures to confirmation semantics", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        transcript: {
          outcome: "verification_failed"
        },
        latestToolCall: {
          route: "ghostty",
          summary: "Completion marker was not observed."
        }
      }
    })).toMatchObject({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Completion marker was not observed.",
      tone: "warning",
      source: "turn-replay",
      routeLabel: "ghostty",
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

  it("normalizes semantic denial route state aliases", () => {
    expect(readRouteOutcome({
      currentTurn: {
        state: "app-policy-denied",
        route: "ghostty",
        latestMessage: "Ghostty is blocked by configured app policy."
      }
    })).toMatchObject({
      kind: "app_policy_denied",
      title: "App policy denied route",
      value: "app_policy_denied",
      detail: "Ghostty is blocked by configured app policy.",
      tone: "danger",
      routeLabel: "ghostty",
      state: "app_policy_denied"
    });

    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "chrome",
          status: "blocked-by-chrome-host-policy",
          summary: "Chrome host policy blocked this approved task: blocked.example"
        }
      }
    })).toMatchObject({
      kind: "chrome_host_policy_denied",
      title: "Chrome host policy denied route",
      value: "chrome_host_policy_denied",
      detail: "Chrome host policy blocked this approved task: blocked.example",
      tone: "danger",
      source: "turn-replay",
      routeLabel: "chrome",
      state: "chrome_host_policy_denied"
    });

    expect(readRouteOutcome({
      currentTurn: {
        state: "denied-by-user",
        route: "finder",
        latestMessage: "User denied this Finder organization request."
      }
    })).toMatchObject({
      kind: "user_denied",
      title: "User denied route",
      value: "user_denied",
      detail: "User denied this Finder organization request.",
      tone: "neutral",
      routeLabel: "finder",
      state: "user_denied"
    });
  });

  it("classifies replay-only app policy metadata without current turn state", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        timelineTail: [
          {
            status: "blocked",
            route: "finder",
            message: "Configured policy blocked Finder.",
            denialKind: "app_policy",
            policyKind: "app-policy"
          }
        ]
      }
    })).toMatchObject({
      kind: "app_policy_denied",
      value: "app_policy_denied",
      detail: "Configured policy blocked Finder.",
      routeLabel: "finder",
      state: "blocked",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
  });

  it("classifies replay-only blocked user denial metadata without current turn state", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        timelineTail: [
          {
            status: "blocked",
            route: "chrome",
            message: "Operator denied the requested page action.",
            denialKind: "user"
          }
        ]
      }
    })).toMatchObject({
      kind: "user_denied",
      value: "user_denied",
      detail: "Operator denied the requested page action.",
      routeLabel: "chrome",
      state: "blocked",
      denialKind: "user"
    });
  });

  it("classifies replay latest tool call app policy metadata without timeline state", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        outcome: "blocked",
        latestToolCall: {
          route: "finder",
          status: "blocked",
          summary: "Configured policy blocked Finder.",
          denialKind: "app_policy",
          policyKind: "app-policy"
        }
      }
    })).toMatchObject({
      kind: "app_policy_denied",
      value: "app_policy_denied",
      detail: "Configured policy blocked Finder.",
      routeLabel: "finder",
      state: "blocked",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
  });

  it("classifies replay latest tool call user denial metadata without timeline state", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        outcome: "blocked",
        latestToolCall: {
          route: "chrome",
          status: "blocked",
          summary: "Operator denied the requested page action.",
          denialKind: "user"
        }
      }
    })).toMatchObject({
      kind: "user_denied",
      value: "user_denied",
      detail: "Operator denied the requested page action.",
      routeLabel: "chrome",
      state: "blocked",
      denialKind: "user"
    });
  });

  it("infers blocked route state from replay latest tool call status without replay outcome", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "finder",
          status: "blocked",
          summary: "Configured policy blocked Finder.",
          denialKind: "app_policy",
          policyKind: "app-policy"
        }
      }
    })).toMatchObject({
      kind: "app_policy_denied",
      value: "app_policy_denied",
      detail: "Configured policy blocked Finder.",
      routeLabel: "finder",
      state: "blocked",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
  });

  it("infers failed route state from replay latest tool call status without replay outcome", () => {
    expect(readRouteOutcome({
      replay: {
        source: "turn-replay",
        latestToolCall: {
          route: "chrome",
          status: "failed",
          summary: "Chrome action failed."
        }
      }
    })).toMatchObject({
      kind: "failed",
      value: "failed",
      detail: "Chrome action failed.",
      routeLabel: "chrome",
      state: "failed"
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

  it("normalizes explicit confirmation route outcome state and value aliases", () => {
    const fallback = readRouteOutcome({
      currentTurn: {},
      replay: { state: "empty" },
      defaultSource: "runtime-snapshot"
    });

    expect(readExplicitRouteOutcome({
      kind: "needs_confirmation",
      value: "needs_user_confirmation",
      state: "needs-user-confirmation",
      detail: "Finder verification needs user confirmation."
    }, fallback)).toEqual({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Finder verification needs user confirmation.",
      tone: "warning",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "needs_confirmation"
    });

    expect(readExplicitRouteOutcome({
      kind: "needs_confirmation",
      value: "verification_failed",
      state: "verification_failed",
      detail: "Completion marker was not observed."
    }, fallback)).toEqual({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Completion marker was not observed.",
      tone: "warning",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "needs_confirmation"
    });
  });

  it("normalizes explicit approval route outcome state and value aliases", () => {
    const fallback = readRouteOutcome({
      currentTurn: {},
      replay: { state: "empty" },
      defaultSource: "runtime-snapshot"
    });

    expect(readExplicitRouteOutcome({
      kind: "approval_required",
      value: "requires-approval",
      state: "needs_approval",
      detail: "Finder file moves need review."
    }, fallback)).toEqual({
      kind: "approval_required",
      title: "Route approval required",
      value: "approval_required",
      detail: "Finder file moves need review.",
      tone: "warning",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "approval_required"
    });
  });

  it("normalizes explicit clarification route outcome state and value aliases", () => {
    const fallback = readRouteOutcome({
      currentTurn: {},
      replay: { state: "empty" },
      defaultSource: "runtime-snapshot"
    });

    expect(readExplicitRouteOutcome({
      kind: "needs_clarification",
      value: "needs-clarification",
      state: "needs_user_clarification",
      detail: "No supported desktop control route matched this request."
    }, fallback)).toEqual({
      kind: "needs_clarification",
      title: "Route needs clarification",
      value: "needs_clarification",
      detail: "No supported desktop control route matched this request.",
      tone: "warning",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "needs_clarification"
    });
  });

  it("normalizes explicit cancellation route outcome state and value aliases", () => {
    const fallback = readRouteOutcome({
      currentTurn: {},
      replay: { state: "empty" },
      defaultSource: "runtime-snapshot"
    });

    expect(readExplicitRouteOutcome({
      kind: "cancelled",
      value: "canceled",
      state: "canceled",
      detail: "Browser task canceled before execution."
    }, fallback)).toEqual({
      kind: "cancelled",
      title: "Route cancelled",
      value: "cancelled",
      detail: "Browser task canceled before execution.",
      tone: "neutral",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "cancelled"
    });
  });

  it("normalizes explicit denial route outcome state and value aliases", () => {
    const fallback = readRouteOutcome({
      currentTurn: {},
      replay: { state: "empty" },
      defaultSource: "runtime-snapshot"
    });

    expect(readExplicitRouteOutcome({
      kind: "app_policy_denied",
      value: "blocked-by-app-policy",
      state: "denied_by_app_policy",
      detail: "Ghostty is blocked by configured app policy."
    }, fallback)).toEqual({
      kind: "app_policy_denied",
      title: "App policy denied route",
      value: "app_policy_denied",
      detail: "Ghostty is blocked by configured app policy.",
      tone: "danger",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "app_policy_denied"
    });

    expect(readExplicitRouteOutcome({
      kind: "chrome_host_policy_denied",
      value: "chrome-host-policy-blocked",
      state: "blocked_by_chrome_host_policy",
      detail: "Chrome host policy blocked this approved task: blocked.example"
    }, fallback)).toEqual({
      kind: "chrome_host_policy_denied",
      title: "Chrome host policy denied route",
      value: "chrome_host_policy_denied",
      detail: "Chrome host policy blocked this approved task: blocked.example",
      tone: "danger",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "chrome_host_policy_denied"
    });

    expect(readExplicitRouteOutcome({
      kind: "user_denied",
      value: "denied-by-user",
      state: "user-denied",
      detail: "User denied this Computer Use turn."
    }, fallback)).toEqual({
      kind: "user_denied",
      title: "User denied route",
      value: "user_denied",
      detail: "User denied this Computer Use turn.",
      tone: "neutral",
      source: "runtime-snapshot",
      routeLabel: "unknown",
      state: "user_denied"
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
