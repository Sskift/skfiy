import { describe, expect, it } from "vitest";
import { createComputerUseScorecard } from "./evaluation-scorecard";

describe("createComputerUseScorecard", () => {
  it("aggregates product-path event logs into scorecard metrics", () => {
    expect(createComputerUseScorecard([
      {
        id: "pwd-success",
        events: [
          { status: "executing", message: "Risk low: Read-only terminal command." },
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
          { status: "failed", message: "Accessibility permission is required." }
        ],
        permissions: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" },
          microphone: { state: "not-determined" },
          speechRecognition: { state: "not-determined" }
        }
      }
    ])).toEqual({
      totalRuns: 3,
      successfulRuns: 1,
      taskSuccessRate: 1 / 3,
      manualInterventions: 1,
      averageSteps: 3,
      unsafeActionBlocks: 1,
      permissionFailures: 1
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
      permissionFailures: 0
    });
  });
});
