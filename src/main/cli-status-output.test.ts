import { describe, expect, it } from "vitest";
import { formatStatusTextOutput } from "./cli-status-output";

describe("CLI status text output", () => {
  it("formats readiness, binary, browser, runtime, turn, and dashboard smoke summaries", () => {
    expect(formatStatusTextOutput({
      readiness: {
        state: "needs-action"
      },
      evidence: {
        binaryReadiness: {
          state: "ready",
          app: { state: "installed" },
          cli: { state: "installed" },
          helper: { state: "installed" }
        },
        extensionPageControl: {
          state: "blocked_by_chrome_host_permission",
          source: "extension.pageControl"
        },
        runtimeSnapshot: {
          state: "stale-after-turn",
          ageSeconds: 320,
          markerAgeSeconds: 5,
          path: "/tmp/runtime.json",
          markerPath: "/tmp/turn-marker.json",
          routeOutcome: {
            kind: "app_policy_denied",
            state: "blocked",
            routeLabel: "ghostty",
            tone: "danger",
            source: "runtime-snapshot",
            denialKind: "app_policy",
            policyKind: "app-policy",
            detail: "Configured app policy blocked Ghostty."
          }
        },
        currentTurn: {
          state: "approval_required",
          targetApp: "Chrome",
          approvalState: "required",
          stopState: "available",
          updateSource: "runtime",
          command: "open https://example.test",
          latestMessage: "Approval required"
        },
        dashboardSmoke: {
          state: "passed",
          path: ".skfiy-smoke/dashboard.json"
        }
      }
    })).toBe([
      "skfiy status",
      "readiness: needs-action",
      "binary: state=ready app=installed cli=installed helper=installed",
      "extension page control: state=blocked_by_chrome_host_permission source=extension.pageControl",
      "runtime-snapshot: stale-after-turn age=320s marker-age=5s path=/tmp/runtime.json marker=/tmp/turn-marker.json",
      "current-turn: approval_required target=Chrome approval=required stop=available source=runtime command=\"open https://example.test\" message=\"Approval required\"",
      "route-outcome: app_policy_denied state=blocked route=ghostty tone=danger source=runtime-snapshot denial=app_policy policy=app-policy detail=\"Configured app policy blocked Ghostty.\"",
      "dashboard smoke: state=passed path=.skfiy-smoke/dashboard.json",
      ""
    ].join("\n"));
  });
});
