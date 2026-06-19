import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createTmuxSupervisionReport,
  parseTmuxPaneList,
  parseTmuxWindowList
} from "./tmux-supervisor";

const WINDOW_LINES = [
  "@1\t0\tagent\t1\t2",
  "@2\t1\tlogs\t0\t1"
].join("\n");
const execFileAsync = promisify(execFile);

const PANE_LINES = [
  "money-run\t@1\t0\tagent\t%1\t0\t1\t0\tzsh\tmain",
  "money-run\t@1\t0\tagent\t%2\t1\t0\t0\tnode\tworker",
  "money-run\t@2\t1\tlogs\t%3\t0\t0\t0\ttail\tlogs"
].join("\n");

describe("parseTmuxWindowList", () => {
  it("parses tmux list-windows tab-separated output", () => {
    expect(parseTmuxWindowList(WINDOW_LINES)).toEqual([
      {
        id: "@1",
        index: 0,
        name: "agent",
        active: true,
        paneCount: 2
      },
      {
        id: "@2",
        index: 1,
        name: "logs",
        active: false,
        paneCount: 1
      }
    ]);
  });
});

describe("parseTmuxPaneList", () => {
  it("parses tmux list-panes tab-separated output", () => {
    expect(parseTmuxPaneList(PANE_LINES)).toEqual([
      {
        id: "%1",
        index: 0,
        active: true,
        dead: false,
        currentCommand: "zsh",
        title: "main",
        sessionName: "money-run",
        windowId: "@1",
        windowIndex: 0,
        windowName: "agent"
      },
      {
        id: "%2",
        index: 1,
        active: false,
        dead: false,
        currentCommand: "node",
        title: "worker",
        sessionName: "money-run",
        windowId: "@1",
        windowIndex: 0,
        windowName: "agent"
      },
      {
        id: "%3",
        index: 0,
        active: false,
        dead: false,
        currentCommand: "tail",
        title: "logs",
        sessionName: "money-run",
        windowId: "@2",
        windowIndex: 1,
        windowName: "logs"
      }
    ]);
  });
});

describe("createTmuxSupervisionReport", () => {
  it("summarizes a live money-run session without mutating it", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: WINDOW_LINES,
      panesOutput: PANE_LINES,
      paneTails: {
        "%1": "building...\nwaiting for next event",
        "%2": "worker ready",
        "%3": "logs streaming"
      }
    })).toEqual({
      sessionName: "money-run",
      status: "observing",
      summary: {
        windowCount: 2,
        paneCount: 3,
        activePaneIds: ["%1"],
        deadPaneIds: []
      },
      windows: [
        {
          id: "@1",
          index: 0,
          name: "agent",
          active: true,
          paneCount: 2
        },
        {
          id: "@2",
          index: 1,
          name: "logs",
          active: false,
          paneCount: 1
        }
      ],
      panes: [
        expect.objectContaining({
          id: "%1",
          active: true,
          dead: false,
          recentTail: "building...\nwaiting for next event"
        }),
        expect.objectContaining({
          id: "%2",
          active: false,
          dead: false,
          recentTail: "worker ready"
        }),
        expect.objectContaining({
          id: "%3",
          active: false,
          dead: false,
          recentTail: "logs streaming"
        })
      ],
      signals: [],
      recommendation: {
        action: "continue_observing",
        reason: "money-run has 2 windows, 3 panes, and no obvious block markers.",
        mutatesSession: false
      }
    });
  });

  it("blocks when the money-run session does not exist", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: false,
      commandError: "can't find session: money-run"
    })).toMatchObject({
      status: "blocked",
      summary: {
        windowCount: 0,
        paneCount: 0,
        activePaneIds: [],
        deadPaneIds: []
      },
      signals: [
        {
          type: "no-session",
          severity: "blocked",
          message: "tmux session money-run was not found."
        }
      ],
      recommendation: {
        action: "manual_recovery",
        reason: "Start or attach the money-run tmux session before supervision can continue.",
        mutatesSession: false
      }
    });
  });

  it("blocks when the session has no panes to supervise", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: "@1\t0\tagent\t1\t0",
      panesOutput: ""
    })).toMatchObject({
      status: "blocked",
      signals: [
        {
          type: "no-panes",
          severity: "blocked",
          message: "tmux session money-run has no panes."
        }
      ],
      recommendation: {
        action: "manual_recovery",
        reason: "Create or restore a pane in money-run before supervision can continue.",
        mutatesSession: false
      }
    });
  });

  it("blocks when no pane is active", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: "@1\t0\tagent\t1\t1",
      panesOutput: "money-run\t@1\t0\tagent\t%1\t0\t0\t0\tzsh\tmain"
    })).toMatchObject({
      status: "blocked",
      signals: [
        {
          type: "no-active-pane",
          severity: "blocked",
          message: "tmux session money-run has no active panes."
        }
      ],
      recommendation: {
        action: "inspect_state",
        reason: "Inspect money-run pane focus/state before deciding whether to recover it.",
        mutatesSession: false
      }
    });
  });

  it("blocks when the active pane is dead", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: "@1\t0\tagent\t1\t1",
      panesOutput: "money-run\t@1\t0\tagent\t%1\t0\t1\t1\tzsh\tmain"
    })).toMatchObject({
      status: "blocked",
      summary: {
        activePaneIds: ["%1"],
        deadPaneIds: ["%1"]
      },
      signals: [
        {
          type: "dead-pane",
          severity: "blocked",
          paneId: "%1",
          message: "tmux pane %1 is dead."
        },
        {
          type: "active-pane-dead",
          severity: "blocked",
          paneId: "%1",
          message: "tmux active pane %1 is dead."
        }
      ],
      recommendation: {
        action: "manual_recovery",
        reason: "Recover the dead money-run pane before supervision can continue.",
        mutatesSession: false
      }
    });
  });

  it("asks for user input when recent output looks like an approval prompt", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: "@1\t0\tagent\t1\t1",
      panesOutput: "money-run\t@1\t0\tagent\t%1\t0\t1\t0\tcodex\tmain",
      paneTails: {
        "%1": "Do you want to allow this command?\nApprove or deny"
      }
    })).toMatchObject({
      status: "needs_attention",
      signals: [
        {
          type: "approval-needed",
          severity: "attention",
          paneId: "%1",
          matchedText: "allow this command"
        }
      ],
      recommendation: {
        action: "ask_user",
        reason: "money-run appears to be waiting for approval in pane %1.",
        mutatesSession: false
      }
    });
  });

  it("recommends inspection when recent output has obvious error markers", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run",
      hasSession: true,
      windowsOutput: "@1\t0\tagent\t1\t1",
      panesOutput: "money-run\t@1\t0\tagent\t%1\t0\t1\t0\tnode\tmain",
      paneTails: {
        "%1": "Traceback (most recent call last):\nError: permission denied"
      }
    })).toMatchObject({
      status: "needs_attention",
      signals: [
        {
          type: "error-marker",
          severity: "attention",
          paneId: "%1",
          matchedText: "Traceback"
        }
      ],
      recommendation: {
        action: "inspect_output",
        reason: "money-run recent output contains an obvious error marker in pane %1.",
        mutatesSession: false
      }
    });
  });
});

describe("money-run supervision smoke script", () => {
  it("is registered as a non-mutating package script", () => {
    const packageJson = JSON.parse(readFileSync(
      path.join(process.cwd(), "package.json"),
      "utf8"
    )) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["smoke:money-run"]).toBe(
      "node scripts/smoke-money-run-supervision.mjs"
    );
  });

  it("prints help that explains the scaffold is read-only", async () => {
    const { stdout } = await runMoneyRunScript(["--help"]);

    expect(stdout).toContain("Read-only tmux supervision scaffold for the money-run session.");
    expect(stdout).toContain("This script does not create sessions, send keys, kill panes");
  });

  it("describes only read-only tmux probe commands for dry runs", async () => {
    const { stdout } = await runMoneyRunScript([
      "--session",
      "money-run",
      "--tail-lines",
      "80",
      "--dry-run"
    ]);
    const dryRun = JSON.parse(stdout) as Record<string, unknown>;

    expect(dryRun).toEqual({
      sessionName: "money-run",
      mutatesSession: false,
      probePlan: [
        {
          id: "has-session",
          command: "tmux",
          args: ["has-session", "-t", "money-run"],
          mutatesSession: false
        },
        {
          id: "list-windows",
          command: "tmux",
          args: [
            "list-windows",
            "-t",
            "money-run",
            "-F",
            "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}"
          ],
          mutatesSession: false
        },
        {
          id: "list-panes",
          command: "tmux",
          args: [
            "list-panes",
            "-t",
            "money-run",
            "-s",
            "-F",
            "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}"
          ],
          mutatesSession: false
        },
        {
          id: "capture-pane-template",
          command: "tmux",
          args: ["capture-pane", "-p", "-t", "<pane-id>", "-S", "-80"],
          mutatesSession: false
        }
      ]
    });
  });

  it("supports a custom session in dry-run mode", async () => {
    const { stdout } = await runMoneyRunScript([
      "--session",
      "long-money-run",
      "--dry-run"
    ]);
    const dryRun = JSON.parse(stdout) as {
      sessionName: string;
      probePlan: Array<{ args: string[] }>;
    };

    expect(dryRun.sessionName).toBe("long-money-run");
    expect(dryRun.probePlan.slice(0, 3).map((probe) => probe.args)).toEqual([
      ["has-session", "-t", "long-money-run"],
      [
        "list-windows",
        "-t",
        "long-money-run",
        "-F",
        "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}"
      ],
      [
        "list-panes",
        "-t",
        "long-money-run",
        "-s",
        "-F",
        "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}"
      ]
    ]);
  });
});

function runMoneyRunScript(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    process.execPath,
    [path.join(process.cwd(), "scripts/smoke-money-run-supervision.mjs"), ...args],
    { cwd: process.cwd() }
  );
}
