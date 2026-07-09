import { describe, expect, it } from "vitest";
import { createDashboardSnapshot } from "./dashboard-data";
import { createDashboardOperatorEvidence } from "./dashboard-operator-evidence";
import { createDashboardDescriptor } from "./dashboard-status";

describe("createDashboardOperatorEvidence", () => {
  it("uses explicit snapshot route outcomes without leaking sensitive route detail", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const evidence = createDashboardOperatorEvidence({
      descriptor,
      snapshot: createDashboardSnapshot({
        descriptor,
        generatedAt: "2026-07-08T00:00:00.000Z",
        currentTurn: {
          state: "executing",
          command: "still running token=secret-token"
        },
        routeOutcome: {
          kind: "needs_confirmation",
          title: "Route needs confirmation",
          value: "needs_confirmation",
          detail: "Runtime replay needs a human check for token=secret-token",
          tone: "warning",
          source: "runtime-snapshot",
          routeLabel: "Ghostty",
          state: "needs_confirmation",
          policyKind: "route-policy"
        },
        replay: { state: "available" }
      })
    });

    expect(evidence.snapshot.routeOutcome).toMatchObject({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Runtime replay needs a human check for redacted-secret",
      tone: "warning",
      source: "runtime-snapshot",
      routeLabel: "Ghostty",
      state: "needs_confirmation",
      policyKind: "route-policy"
    });
    expect(evidence.status).toMatchObject({
      currentTurnState: "executing",
      routeOutcomeKind: "needs_confirmation",
      routeOutcomeState: "needs_confirmation",
      routeOutcomeRouteLabel: "Ghostty",
      routeOutcomePolicyKind: "route-policy"
    });
    expect(evidence.snapshot.currentTurn).not.toHaveProperty("command");
    expect(JSON.stringify(evidence)).not.toContain("secret-token");
    expect(JSON.stringify(evidence)).not.toContain("token=secret-token");
  });

  it.each([
    [
      "app-policy denial",
      {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        denialKind: "app_policy",
        policyKind: "app-policy",
        command: "run token=secret-token in Ghostty"
      },
      {
        kind: "app_policy_denied",
        title: "App policy denied route",
        value: "app_policy_denied",
        state: "blocked",
        tone: "danger",
        routeLabel: "ghostty",
        denialKind: "app_policy",
        policyKind: "app-policy"
      }
    ],
    [
      "Chrome host policy denial",
      {
        state: "blocked",
        route: "chrome",
        policyKind: "chrome-host-policy",
        routeReason: "Chrome host policy blocked this approved task: blocked.example",
        latestMessage: "Chrome host policy blocked this approved task: blocked.example",
        command: "open https://blocked.example/?token=secret-token"
      },
      {
        kind: "chrome_host_policy_denied",
        title: "Chrome host policy denied route",
        value: "chrome_host_policy_denied",
        state: "blocked",
        tone: "danger",
        routeLabel: "chrome",
        detail: "Chrome host policy blocked this approved task: blocked.example",
        policyKind: "chrome-host-policy"
      }
    ],
    [
      "user denial",
      {
        state: "denied",
        route: "chrome",
        routeReason: "User denied token=secret-token browser mutation.",
        denialKind: "user",
        command: "open https://example.test/?token=secret-token"
      },
      {
        kind: "user_denied",
        title: "User denied route",
        value: "user_denied",
        state: "denied",
        tone: "neutral",
        routeLabel: "chrome",
        detail: "User denied redacted-secret browser mutation.",
        denialKind: "user"
      }
    ],
    [
      "stop turn",
      {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        },
        command: "stop Chrome token=secret-token"
      },
      {
        kind: "stopped",
        title: "Route stopped",
        value: "stopped",
        state: "cancelled",
        tone: "neutral",
        routeLabel: "chrome",
        detail: "Task stopped."
      }
    ],
    [
      "completion with stale approval flag",
      {
        state: "completed",
        route: "tmux_supervision",
        latestMessage: "money-run supervision completed.",
        approvalRequired: true
      },
      {
        kind: "completed",
        title: "Route completed",
        value: "completed",
        state: "completed",
        tone: "success",
        routeLabel: "tmux_supervision"
      }
    ]
  ])("keeps %s distinct without exposing the raw command", (_label, currentTurn, expected) => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const expectedMetadata = expected as typeof expected & {
      denialKind?: string;
      policyKind?: string;
    };
    const evidence = createDashboardOperatorEvidence({
      descriptor,
      snapshot: createDashboardSnapshot({
        descriptor,
        generatedAt: "2026-07-08T00:00:00.000Z",
        currentTurn,
        replay: { state: "available" }
      })
    });

    expect(evidence.snapshot.routeOutcome).toMatchObject(expected);
    expect(evidence.status).toMatchObject({
      currentTurnState: currentTurn.state,
      routeOutcomeKind: expected.kind,
      routeOutcomeState: expected.state,
      routeOutcomeRouteLabel: expected.routeLabel,
      ...(expectedMetadata.denialKind ? { routeOutcomeDenialKind: expectedMetadata.denialKind } : {}),
      ...(expectedMetadata.policyKind ? { routeOutcomePolicyKind: expectedMetadata.policyKind } : {})
    });
    expect(evidence.snapshot.currentTurn).not.toHaveProperty("command");
    expect(JSON.stringify(evidence)).not.toContain("secret-token");
    expect(JSON.stringify(evidence)).not.toContain("token=secret-token");
  });
});
