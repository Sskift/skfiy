import { describe, expect, it } from "vitest";
import { createTmuxSupervisionReplayEvent } from "./tmux-supervision-replay";

const risk = {
  level: "medium" as const,
  reason: "tmux supervision reads recent pane output but does not mutate the session.",
  requiresApproval: true
};

describe("createTmuxSupervisionReplayEvent", () => {
  it("maps tmux supervision lifecycle events into turn replay transcript events", () => {
    expect(createTmuxSupervisionReplayEvent({
      type: "started",
      sessionName: "money-run",
      risk
    })).toEqual({
      type: "started",
      command: "监督 tmux money-run 这个 session",
      risk
    });
    expect(createTmuxSupervisionReplayEvent({
      type: "approval_required",
      sessionName: "money-run",
      risk
    })).toEqual({
      type: "approval_required",
      command: "监督 tmux money-run 这个 session",
      risk
    });
    expect(createTmuxSupervisionReplayEvent({
      type: "completed",
      sessionName: "money-run",
      report: {
        sessionName: "money-run",
        status: "observing",
        summary: {
          windowCount: 1,
          paneCount: 1,
          activePaneIds: ["%1"],
          deadPaneIds: []
        },
        windows: [],
        panes: [],
        signals: [],
        recommendation: {
          action: "continue_observing",
          reason: "money-run has 1 window, 1 pane, and no obvious block markers.",
          mutatesSession: false
        }
      },
      summary: "money-run supervision: observing. money-run has 1 window, 1 pane, and no obvious block markers."
    })).toEqual({
      type: "completed",
      command: "监督 tmux money-run 这个 session",
      summary: "money-run supervision: observing. money-run has 1 window, 1 pane, and no obvious block markers."
    });
    expect(createTmuxSupervisionReplayEvent({
      type: "verification_failed",
      stage: "tmux",
      reason: "tmux session money-run was not found."
    })).toEqual({
      type: "verification_failed",
      stage: "tmux",
      reason: "tmux session money-run was not found."
    });
  });

  it("leaves transient observing messages in the task timeline only", () => {
    expect(createTmuxSupervisionReplayEvent({
      type: "observing",
      sessionName: "money-run",
      message: "Reading tmux session money-run with read-only probes."
    })).toBeUndefined();
  });
});
