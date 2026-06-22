import { describe, expect, it } from "vitest";
import { createComputerUseScorecard } from "./evaluation-scorecard";

describe("createComputerUseScorecard", () => {
  it("aggregates product-path event logs into scorecard metrics", () => {
    expect(createComputerUseScorecard([
      {
        id: "pwd-success",
        events: [
          { status: "executing", message: "Risk low: Read-only terminal command." },
          { status: "recovering", message: "Activation recovery before observing target app." },
          { status: "observing", message: "Captured before screenshot." },
          { status: "executing", message: "Submitted command with enter." },
          { status: "completed", message: "Command submitted to Ghostty." }
        ]
      },
      {
        id: "mkdir-approval",
        events: [
          { status: "executing", message: "Risk medium: Command can create or modify local state." },
          { status: "approval_required", message: "Approval required (medium): Command can create or modify local state." }
        ]
      },
      {
        id: "permission-blocked",
        events: [
          { status: "executing", message: "Risk low: Read-only terminal command." },
          { status: "observing", message: "Finding Ghostty." },
          { status: "failed", message: "Accessibility permission is required." },
          { status: "verification_failed", message: "Verification failed after click." }
        ],
        permissions: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" },
        }
      }
      ,
      {
        id: "loginwindow-blocked",
        events: [
          { status: "failed", message: "Desktop session is not controllable because loginwindow is active." }
        ]
      }
    ])).toEqual({
      totalRuns: 4,
      successfulRuns: 1,
      taskSuccessRate: 1 / 4,
      manualInterventions: 1,
      averageSteps: 3,
      unsafeActionBlocks: 1,
      permissionFailures: 1,
      desktopSessionBlocks: 1,
      recoveryAttempts: 1,
      actionVerificationFailures: 1
    });
  });

  it("returns empty metrics when no runs are available", () => {
    expect(createComputerUseScorecard([])).toEqual({
      totalRuns: 0,
      successfulRuns: 0,
      taskSuccessRate: 0,
      manualInterventions: 0,
      averageSteps: 0,
      unsafeActionBlocks: 0,
      permissionFailures: 0,
      desktopSessionBlocks: 0,
      recoveryAttempts: 0,
      actionVerificationFailures: 0
    });
  });

  it("does not count unrelated non-Computer-Use data as a permission failure", () => {
    expect(createComputerUseScorecard([
      {
        id: "external-text-entry-computer-use-ready",
        events: [
          { status: "completed", message: "Command submitted to Ghostty from external text entry." }
        ],
        permissions: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
        }
      }
    ])).toMatchObject({
      permissionFailures: 0
    });
  });
});
