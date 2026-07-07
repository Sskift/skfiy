import { describe, expect, it } from "vitest";
import { createTmuxSupervisionReport } from "./computer-use/tmux-supervisor";
import {
  createMoneyRunProbeFailure,
  createMoneyRunSnapshot,
  formatTmuxCommand,
  readCommandResultMessage
} from "./cli-money-run-status";

describe("CLI money-run status helpers", () => {
  it("formats tmux probe commands and reads command messages", () => {
    expect(formatTmuxCommand(["capture-pane", "-t", "%1", "with space"])).toBe(
      'tmux capture-pane -t %1 "with space"'
    );
    expect(readCommandResultMessage({ stdout: "fallback stdout", stderr: "" }, "fallback")).toBe(
      "fallback stdout"
    );
    expect(readCommandResultMessage({ stdout: "fallback stdout", stderr: "  " }, "fallback")).toBe(
      "fallback"
    );
    expect(readCommandResultMessage({ stdout: "", stderr: "" }, "fallback")).toBe("fallback");
  });

  it("creates blocked probe failure output without mutating the tmux session", () => {
    expect(createMoneyRunProbeFailure(["tmux has-session -t money-run"], "session missing")).toEqual({
      state: "blocked",
      session: "money-run",
      source: "tmux-read-only-probe",
      mutatesSession: false,
      summary: {
        windowCount: 0,
        paneCount: 0,
        activePaneIds: [],
        deadPaneIds: []
      },
      signals: [{
        type: "probe-error",
        severity: "blocked",
        message: "session missing"
      }],
      recommendation: {
        action: "inspect_state",
        reason: "session missing",
        mutatesSession: false
      },
      probeCommands: ["tmux has-session -t money-run"],
      probeError: "session missing"
    });
  });

  it("creates a compact snapshot with active pane tail preview", () => {
    const report = createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: "@1\t0\tmain\t1\t1\n",
      panesOutput: "money-run\t@1\t0\tmain\t%1\t0\t1\t0\tzsh\ttitle\n",
      paneTails: {
        "%1": ` ${"x".repeat(260)} `
      }
    });

    expect(createMoneyRunSnapshot(report, [
      "tmux list-windows -t money-run",
      "tmux list-panes -t money-run -s"
    ])).toEqual({
      state: "observing",
      session: "money-run",
      source: "tmux-read-only-probe",
      mutatesSession: false,
      summary: {
        windowCount: 1,
        paneCount: 1,
        activePaneIds: ["%1"],
        deadPaneIds: []
      },
      activePane: {
        id: "%1",
        windowName: "main",
        currentCommand: "zsh",
        title: "title",
        recentTailPreview: `${"x".repeat(240)}...`
      },
      signals: [],
      recommendation: {
        action: "continue_observing",
        reason: "money-run has 1 window, 1 pane, and no obvious block markers.",
        mutatesSession: false
      },
      probeCommands: [
        "tmux list-windows -t money-run",
        "tmux list-panes -t money-run -s"
      ]
    });
  });
});
