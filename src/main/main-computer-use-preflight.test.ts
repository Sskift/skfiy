import { describe, expect, it } from "vitest";

import {
  createAppPolicyPreflightDecision,
  createChromeHostPolicyPreflightDecision
} from "./main-computer-use-preflight";
import {
  CHROME_BUNDLE_ID,
  FINDER_BUNDLE_ID,
  GHOSTTY_BUNDLE_ID
} from "./task-routing";

const ghosttyRoute = {
  kind: "ghostty",
  bundleId: GHOSTTY_BUNDLE_ID
} as const;

const chromeRoute = {
  kind: "chrome",
  bundleId: CHROME_BUNDLE_ID
} as const;

const finderRoute = {
  kind: "finder",
  bundleId: FINDER_BUNDLE_ID
} as const;

describe("main Computer Use preflight", () => {
  it("turns denied app policy into a routed blocked task event and tool result", () => {
    expect(createAppPolicyPreflightDecision({
      appPolicy: {
        decision: "deny",
        reason: "Ghostty is denied by app policy."
      },
      approved: false,
      command: "run pwd in Ghostty",
      mode: "active",
      route: ghosttyRoute
    })).toMatchObject({
      kind: "blocked",
      taskEvent: {
        status: "blocked",
        message: "Ghostty is denied by app policy.",
        command: "run pwd in Ghostty",
        route: "ghostty",
        denialKind: "app_policy",
        policyKind: "app-policy",
        routeOutcome: {
          kind: "app_policy_denied",
          value: "app_policy_denied",
          routeLabel: "ghostty",
          source: "task-event"
        }
      },
      toolResult: {
        status: "blocked",
        summary: "Ghostty is denied by app policy.",
        evidence: {
          summary: "Ghostty is denied by app policy."
        }
      }
    });
  });

  it("keeps ask app policy as an approval request until the turn is approved", () => {
    expect(createAppPolicyPreflightDecision({
      appPolicy: {
        decision: "ask",
        reason: "Finder requires approval by app policy."
      },
      approved: false,
      command: "organize Downloads in Finder",
      mode: "quiet",
      route: finderRoute
    })).toMatchObject({
      kind: "approval_required",
      approvalRequest: {
        command: "organize Downloads in Finder",
        mode: "quiet",
        route: finderRoute,
        reason: "Finder requires approval by app policy."
      },
      taskEvent: {
        status: "approval_required",
        message: "Approval required (app policy): Finder requires approval by app policy.",
        route: "finder",
        policyKind: "app-policy",
        routeOutcome: {
          kind: "approval_required",
          value: "approval_required",
          routeLabel: "finder",
          source: "task-event"
        }
      }
    });
  });

  it("continues after allow policy or a previously approved ask policy", () => {
    expect(createAppPolicyPreflightDecision({
      appPolicy: {
        decision: "allow",
        reason: "Ghostty is allowed by app policy."
      },
      approved: false,
      command: "run pwd in Ghostty",
      mode: "active",
      route: ghosttyRoute
    })).toEqual({ kind: "continue" });

    expect(createAppPolicyPreflightDecision({
      appPolicy: {
        decision: "ask",
        reason: "Chrome requires approval by app policy."
      },
      approved: true,
      command: "open https://example.test in Chrome",
      mode: "active",
      route: chromeRoute
    })).toEqual({ kind: "continue" });
  });

  it("turns blocked Chrome host policy into a routed blocked task event and tool result", () => {
    expect(createChromeHostPolicyPreflightDecision({
      command: "open https://blocked.example in Chrome",
      result: {
        status: "blocked",
        host: "blocked.example",
        reason: "blocked_host"
      },
      route: chromeRoute
    })).toMatchObject({
      kind: "blocked",
      taskEvent: {
        status: "blocked",
        message: "Chrome host policy blocked this approved task: blocked.example",
        command: "open https://blocked.example in Chrome",
        route: "chrome",
        policyKind: "chrome-host-policy",
        routeOutcome: {
          kind: "chrome_host_policy_denied",
          value: "chrome_host_policy_denied",
          routeLabel: "chrome",
          source: "task-event"
        }
      },
      toolResult: {
        status: "blocked",
        summary: "Chrome host policy blocked this approved task: blocked.example"
      }
    });
  });

  it("turns failed Chrome host policy approval into a routed failed task event and tool result", () => {
    expect(createChromeHostPolicyPreflightDecision({
      command: "open https://example.test in Chrome",
      result: {
        status: "failed",
        host: "example.test",
        message: "policy file is invalid"
      },
      route: chromeRoute
    })).toMatchObject({
      kind: "failed",
      taskEvent: {
        status: "failed",
        message: "Chrome host policy approval failed: policy file is invalid",
        route: "chrome",
        policyKind: "chrome-host-policy",
        routeOutcome: {
          kind: "failed",
          value: "failed",
          routeLabel: "chrome",
          source: "task-event"
        }
      },
      toolResult: {
        status: "failed",
        summary: "Chrome host policy approval failed: policy file is invalid"
      }
    });
  });

  it("emits a replayable host-policy allowance only when the current turn policy changed", () => {
    expect(createChromeHostPolicyPreflightDecision({
      command: "open https://example.test in Chrome",
      result: {
        status: "updated",
        host: "example.test",
        action: "allow_current_turn",
        state: {
          schemaVersion: 1,
          state: "configured",
          path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
          policy: {
            defaultMode: "ask",
            allowedHosts: [],
            currentTurnAllowedHosts: ["example.test"],
            blockedHosts: []
          }
        }
      },
      route: chromeRoute
    })).toMatchObject({
      kind: "allowed_current_turn",
      taskEvent: {
        status: "executing",
        message: "Chrome host policy allowed for current turn: example.test",
        route: "chrome",
        policyKind: "chrome-host-policy",
        routeOutcome: {
          kind: "running",
          value: "executing",
          routeLabel: "chrome",
          source: "task-event"
        }
      }
    });

    expect(createChromeHostPolicyPreflightDecision({
      command: "open https://example.test in Chrome",
      result: {
        status: "already_allowed",
        host: "example.test",
        scope: "always"
      },
      route: chromeRoute
    })).toEqual({ kind: "continue" });

    expect(createChromeHostPolicyPreflightDecision({
      command: "focus Chrome",
      result: {
        status: "skipped",
        reason: "missing_http_host"
      },
      route: chromeRoute
    })).toEqual({ kind: "continue" });
  });
});
