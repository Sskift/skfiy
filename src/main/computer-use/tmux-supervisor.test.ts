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

  it("does not treat research text mentioning confirmation grids as approval prompts", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run-goal",
      hasSession: true,
      windowsOutput: "@4\t1\tnode\t1\t1",
      panesOutput: "money-run-goal\t@4\t1\tnode\t%4\t0\t1\t0\tnode\tmoney-run-goal-e8654",
      paneTails: {
        "%4": [
          "下一轮趋势预判优先级：premium_mom24 的单变量 threshold / hold grid、简单 confirmation grid。",
          "Working (25m 12s) · 1 background terminal running"
        ].join("\n")
      }
    })).toMatchObject({
      sessionName: "money-run-goal",
      status: "observing",
      signals: [],
      recommendation: {
        action: "continue_observing",
        reason: "money-run-goal has 1 window, 1 pane, and no obvious block markers.",
        mutatesSession: false
      }
    });
  });

  it("accepts tmux panes with an empty title field", () => {
    expect(createTmuxSupervisionReport({
      sessionName: "money-run-goal",
      hasSession: true,
      windowsOutput: "@4\t1\tzsh\t1\t1",
      panesOutput: "money-run-goal\t@4\t1\tzsh\t%4\t1\t1\t0\tzsh\t",
      paneTails: {
        "%4": "Working (2m) · 1 background terminal running"
      }
    })).toMatchObject({
      sessionName: "money-run-goal",
      status: "observing",
      panes: [
        {
          id: "%4",
          title: ""
        }
      ]
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

    expect(stdout).toContain("Product-path read-only supervision smoke for the money-run session.");
    expect(stdout).toContain("--output <path>");
    expect(stdout).toContain("--require-passed");
    expect(stdout).toContain("--direct-tmux");
    expect(stdout).toContain("This script does not create sessions, send keys, kill panes");
  });

  it("accepts release-gate output and require-passed flags", async () => {
    const outputPath = path.resolve(".skfiy-smoke/money-run-current.json");
    const { stdout } = await runMoneyRunScript([
      "--app",
      "dist/skfiy.app",
      "--session",
      "money-run",
      "--require-passed",
      "--output",
      ".skfiy-smoke/money-run-current.json",
      "--dry-run"
    ]);
    const dryRun = JSON.parse(stdout) as Record<string, unknown>;

    expect(dryRun).toMatchObject({
      appPath: path.resolve("dist/skfiy.app"),
      artifactPath: outputPath,
      sessionName: "money-run",
      requirePassed: true
    });
  });

  it("does not let direct tmux diagnostics satisfy require-passed", async () => {
    const { stdout } = await runMoneyRunModuleExpression(`
      const checks = [
        moneyRun.readMoneyRunProcessExitCode({ result: "passed" }, { requirePassed: true }),
        moneyRun.readMoneyRunProcessExitCode({ status: "observing" }, { requirePassed: false }),
        moneyRun.readMoneyRunProcessExitCode({ status: "observing" }, { requirePassed: true }),
        moneyRun.readMoneyRunProcessExitCode({ result: "needs_attention" }, { requirePassed: true })
      ];
      console.log(JSON.stringify(checks));
    `);

    expect(JSON.parse(stdout)).toEqual([0, 0, 2, 2]);
  });

  it("accepts default approval bypass when the product path reaches tmux supervision", async () => {
    const { stdout } = await runMoneyRunModuleExpression(`
      const events = [
        { status: "observing", message: "Codex planned 1 Computer Use tool call for money-run supervision." },
        { status: "executing", message: "Risk medium: tmux supervision reads recent pane output but does not mutate the session." },
        { status: "observing", message: "Reading tmux session money-run with read-only probes." },
        {
          status: "completed",
          message: "money-run supervision: observing. money-run has 1 window, 1 pane, and no obvious block markers.",
          tmuxSupervisionReport: { sessionName: "money-run", mutatesSession: false }
        }
      ];
      const turnReplay = {
        transcript: {
          actions: [
            {
              type: "approval_decision",
              route: "tmux_supervision",
              decision: "bypassed"
            }
          ]
        }
      };
      console.log(JSON.stringify({
        mode: moneyRun.readMoneyRunApprovalMode(events, turnReplay),
        result: moneyRun.classifyMoneyRunProductEvidence({
          approvalMode: moneyRun.readMoneyRunApprovalMode(events, turnReplay),
          events
        })
      }));
    `);

    expect(JSON.parse(stdout)).toEqual({
      mode: "bypassed",
      result: "passed"
    });
  });

  it("describes the packaged app product path for dry runs", async () => {
    const { stdout } = await runMoneyRunScript([
      "--session",
      "money-run",
      "--tail-lines",
      "80",
      "--dry-run"
    ]);
    const dryRun = JSON.parse(stdout) as Record<string, unknown>;

    expect(dryRun).toMatchObject({
      sessionName: "money-run",
      command: "监督 tmux money-run 这个 session",
      launch: expect.stringContaining("open -na"),
      appLaunchViaOpen: true,
      productPath: "LaunchServices -> renderer -> preload -> main -> tmux supervision -> tmux read-only probes",
      approvalRequired: true,
      mutatesSession: false
    });
    expect(dryRun.probePlan).toEqual([
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
    ]);
  });

  it("keeps a direct tmux diagnostic dry-run for parser debugging", async () => {
    const { stdout } = await runMoneyRunScript([
      "--session",
      "money-run",
      "--tail-lines",
      "80",
      "--direct-tmux",
      "--dry-run"
    ]);
    const dryRun = JSON.parse(stdout) as Record<string, unknown>;

    expect(dryRun).toEqual({
      sessionName: "money-run",
      mode: "direct-tmux",
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

  it("copies the renderer tmux report into the product smoke evidence", () => {
    const scriptSource = readFileSync(
      path.join(process.cwd(), "scripts/smoke-money-run-supervision.mjs"),
      "utf8"
    );

    expect(scriptSource).toContain("tmuxSupervisionReport");
    expect(scriptSource).toContain("readFinalTmuxSupervisionReport");
    expect(scriptSource).toContain("event.status === \"completed\"");
    expect(scriptSource).toContain("artifactPath: options.jsonOutputPath");
    expect(scriptSource).toContain("evidence.events = cdp.events.slice(startIndex)");
    expect(scriptSource).toContain("mutatesSession: false");
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

function runMoneyRunModuleExpression(expression: string): Promise<{ stdout: string; stderr: string }> {
  const modulePath = path.join(process.cwd(), "scripts/smoke-money-run-supervision.mjs");

  return execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        "import { pathToFileURL } from 'node:url';",
        `const moneyRun = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);`,
        expression
      ].join("\n")
    ],
    { cwd: process.cwd() }
  );
}
