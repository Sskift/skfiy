import { describe, expect, it } from "vitest";
import { readRouteOutcome } from "./route-outcome";

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
});
