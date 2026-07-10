import { describe, expect, it } from "vitest";

import { createRuntimeSnapshotCurrentTurnFromTaskEvent } from "./main-runtime-snapshot-payload";

describe("main runtime snapshot payload helpers", () => {
  it("adapts task events to runtime current-turn payloads", () => {
    expect(createRuntimeSnapshotCurrentTurnFromTaskEvent({
      status: "approval_required",
      message: "Approval required.",
      command: "organize Downloads",
      route: "finder",
      routeReason: "Finder current-folder organization needs confirmation.",
      policyKind: "route-policy",
      routeOutcome: {
        kind: "needs_confirmation",
        title: "Route needs confirmation",
        value: "needs_confirmation",
        detail: "Finder current-folder organization needs confirmation.",
        tone: "warning",
        source: "task-event",
        routeLabel: "finder",
        state: "needs_confirmation",
        policyKind: "route-policy"
      },
      stopTurnBehavior: {
        beforeStatus: "approval_required",
        afterStatus: "cancelled",
        afterMessage: "Task stopped."
      },
      replayReset: true
    })).toEqual({
      state: "approval_required",
      message: "Approval required.",
      command: "organize Downloads",
      route: "finder",
      routeReason: "Finder current-folder organization needs confirmation.",
      policyKind: "route-policy",
      routeOutcome: {
        kind: "needs_confirmation",
        title: "Route needs confirmation",
        value: "needs_confirmation",
        detail: "Finder current-folder organization needs confirmation.",
        tone: "warning",
        source: "task-event",
        routeLabel: "finder",
        state: "needs_confirmation",
        policyKind: "route-policy"
      },
      stopTurnBehavior: {
        beforeStatus: "approval_required",
        afterStatus: "cancelled",
        afterMessage: "Task stopped."
      }
    });
  });

  it("omits optional fields that are not present in the task event", () => {
    expect(createRuntimeSnapshotCurrentTurnFromTaskEvent({
      status: "completed",
      replayReset: true
    })).toEqual({
      state: "completed"
    });
  });
});
