import { describe, expect, it } from "vitest";
import { createTmuxSupervisionReport } from "./computer-use/tmux-supervisor";
import {
  createMoneyRunProbeFailure,
  createMoneyRunSnapshot,
  formatTmuxCommand,
  readCommandResultMessage,
  readMoneyRunStatusForStatus,
  type MoneyRunCommandRunner
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

  it("reads money-run status through injected read-only tmux commands", async () => {
    const calls: Array<{ command: string; args: string[]; timeoutMs?: number }> = [];
    const runCommand: MoneyRunCommandRunner = async (command, args, options) => {
      calls.push({ command, args, timeoutMs: options?.timeoutMs });

      if (args[0] === "has-session") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (args[0] === "list-windows") {
        return { exitCode: 0, stdout: "@1\t0\tmain\t1\t1\n", stderr: "" };
      }

      if (args[0] === "list-panes") {
        return {
          exitCode: 0,
          stdout: "money-run\t@1\t0\tmain\t%1\t0\t1\t0\tzsh\ttitle\n",
          stderr: ""
        };
      }

      return { exitCode: 0, stdout: "latest output", stderr: "" };
    };

    await expect(readMoneyRunStatusForStatus(runCommand)).resolves.toMatchObject({
      state: "observing",
      session: "money-run",
      source: "tmux-read-only-probe",
      mutatesSession: false,
      activePane: {
        id: "%1",
        recentTailPreview: "latest output"
      },
      probeCommands: [
        "tmux has-session -t money-run",
        "tmux list-windows -t money-run -F \"#{window_id}\\t#{window_index}\\t#{window_name}\\t#{window_active}\\t#{window_panes}\"",
        "tmux list-panes -t money-run -s -F \"#{session_name}\\t#{window_id}\\t#{window_index}\\t#{window_name}\\t#{pane_id}\\t#{pane_index}\\t#{pane_active}\\t#{pane_dead}\\t#{pane_current_command}\\t#{pane_title}\"",
        "tmux capture-pane -p -t %1 -S -120"
      ]
    });
    expect(calls).toEqual([
      { command: "tmux", args: ["has-session", "-t", "money-run"], timeoutMs: 1_500 },
      {
        command: "tmux",
        args: ["list-windows", "-t", "money-run", "-F", "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}"],
        timeoutMs: 1_500
      },
      {
        command: "tmux",
        args: ["list-panes", "-t", "money-run", "-s", "-F", "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}"],
        timeoutMs: 1_500
      },
      { command: "tmux", args: ["capture-pane", "-p", "-t", "%1", "-S", "-120"], timeoutMs: 1_500 }
    ]);
  });
});
