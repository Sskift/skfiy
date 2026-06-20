import { describe, expect, it } from "vitest";
import { createTurnReplayStore } from "./turn-replay-store";

describe("createTurnReplayStore", () => {
  it("summarizes the latest Computer Use turn with task timeline events", () => {
    const store = createTurnReplayStore();

    store.startTurn();
    store.recordComputerUseEvent({
      type: "started",
      command: "pwd",
      risk: {
        level: "low",
        reason: "Read-only terminal command.",
        requiresApproval: false
      }
    });
    store.recordTaskEvent({
      status: "executing",
      message: "Risk low: Read-only terminal command."
    });
    store.recordComputerUseEvent({ type: "typing", command: "pwd" });
    store.recordTaskEvent({ status: "executing", message: "Typing command in Ghostty." });
    store.recordComputerUseEvent({ type: "submitted", key: "enter" });
    store.recordTaskEvent({ status: "executing", message: "Submitted command with enter." });
    store.recordComputerUseEvent({
      type: "completed",
      command: "pwd",
      summary: "Command submitted to Ghostty."
    });
    store.recordTaskEvent({ status: "completed", message: "Command submitted to Ghostty." });

    expect(store.getReplay()).toMatchObject({
      transcript: {
        command: "pwd",
        risk: { level: "low" },
        actions: [
          { type: "type_text", text: "pwd" },
          { type: "press_key", key: "enter" }
        ],
        outcome: "completed"
      },
      timeline: [
        { status: "executing", message: "Risk low: Read-only terminal command." },
        { status: "executing", message: "Typing command in Ghostty." },
        { status: "executing", message: "Submitted command with enter." },
        { status: "completed", message: "Command submitted to Ghostty." }
      ]
    });
  });

  it("keeps only the newest turn after reset", () => {
    const store = createTurnReplayStore();

    store.startTurn();
    store.recordTaskEvent({ status: "completed", message: "old turn" });
    store.startTurn();
    store.recordTaskEvent({ status: "failed", message: "new turn" });

    expect(store.getReplay()?.timeline).toEqual([
      { status: "failed", message: "new turn" }
    ]);
  });

  it("marks the transcript failed when the task timeline fails before raw completion", () => {
    const store = createTurnReplayStore();

    store.startTurn();
    store.recordComputerUseEvent({
      type: "started",
      command: "pwd",
      risk: {
        level: "low",
        reason: "Read-only terminal command.",
        requiresApproval: false
      }
    });
    store.recordTaskEvent({
      status: "failed",
      message: "Accessibility permission is required."
    });

    expect(store.getReplay()?.transcript.outcome).toBe("failed");
  });

  it("keeps external planner rationale in the replay transcript", () => {
    const store = createTurnReplayStore();

    store.startTurn();
    store.recordComputerUseEvent({
      type: "planner_resolved",
      providerLabel: "External CUA",
      input: "打开 Ghostty 执行 pwd 并截图",
      command: "pwd",
      rationale: "Read the current working directory."
    });
    store.recordTaskEvent({
      status: "executing",
      message: "External CUA planned: pwd"
    });

    expect(store.getReplay()).toMatchObject({
      transcript: {
        planner: {
          providerLabel: "External CUA",
          input: "打开 Ghostty 执行 pwd 并截图",
          command: "pwd",
          rationale: "Read the current working directory."
        },
        actions: [
          {
            type: "plan",
            providerLabel: "External CUA",
            command: "pwd"
          }
        ]
      }
    });
  });

  it("notifies a subscriber whenever replay state changes", () => {
    const updates: unknown[] = [];
    const store = createTurnReplayStore({
      onReplayChanged: (replay) => {
        updates.push(replay);
      }
    });

    store.startTurn();
    store.recordComputerUseEvent({
      type: "started",
      command: "pwd",
      risk: {
        level: "low",
        reason: "Read-only terminal command.",
        requiresApproval: false
      }
    });
    store.recordTaskEvent({
      status: "executing",
      message: "Typing command in Ghostty."
    });

    expect(updates).toHaveLength(3);
    expect(updates[0]).toMatchObject({
      transcript: {
        approvalRequired: false,
        actions: [],
        outcome: "running"
      },
      timeline: []
    });
    expect(updates[2]).toMatchObject({
      transcript: {
        command: "pwd"
      },
      timeline: [
        {
          status: "executing",
          message: "Typing command in Ghostty."
        }
      ]
    });
  });
});
