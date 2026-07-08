import { describe, expect, it } from "vitest";

import {
  createPendingApproval,
  createPendingApprovalDeniedTaskEvent,
  USER_DENIED_COMPUTER_USE_REASON
} from "./main-pending-approval";
import { CHROME_BUNDLE_ID, FINDER_BUNDLE_ID } from "./task-routing";

describe("main pending approval helpers", () => {
  it("preserves assistant tool identity and route state for approval resumption", () => {
    expect(createPendingApproval(
      "organize Downloads",
      "active",
      {
        turnId: "turn-agent-1",
        toolCallId: "tool-call-1"
      },
      {
        kind: "finder",
        bundleId: FINDER_BUNDLE_ID
      },
      true
    )).toEqual({
      turnId: "turn-agent-1",
      toolCallId: "tool-call-1",
      command: "organize Downloads",
      mode: "active",
      route: {
        kind: "finder",
        bundleId: FINDER_BUNDLE_ID
      },
      planApproved: true
    });
  });

  it("omits planApproved unless the Finder plan has already been approved", () => {
    expect(createPendingApproval(
      "open Chrome",
      "quiet",
      {
        turnId: "turn-agent-2",
        toolCallId: "tool-call-2"
      },
      {
        kind: "chrome",
        bundleId: CHROME_BUNDLE_ID
      }
    )).toEqual({
      turnId: "turn-agent-2",
      toolCallId: "tool-call-2",
      command: "open Chrome",
      mode: "quiet",
      route: {
        kind: "chrome",
        bundleId: CHROME_BUNDLE_ID
      }
    });
  });

  it("creates a routed user-denied task event for a pending approval", () => {
    const approval = createPendingApproval(
      "open https://example.test",
      "active",
      {
        turnId: "turn-agent-3",
        toolCallId: "tool-call-3"
      },
      {
        kind: "chrome",
        bundleId: CHROME_BUNDLE_ID
      }
    );

    expect(createPendingApprovalDeniedTaskEvent(approval)).toEqual({
      status: "denied",
      message: "Task denied.",
      command: "open https://example.test",
      route: "chrome",
      routeReason: USER_DENIED_COMPUTER_USE_REASON,
      denialKind: "user"
    });
  });

  it("returns the existing idle response when no approval is pending", () => {
    expect(createPendingApprovalDeniedTaskEvent(null)).toEqual({
      status: "idle",
      message: "No task is waiting for approval."
    });
  });
});
