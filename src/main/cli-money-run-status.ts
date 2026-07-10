import {
  createTmuxSupervisionReport,
  parseTmuxPaneList,
  type TmuxPaneSummary,
  type TmuxSupervisionReport
} from "./computer-use/tmux-supervisor.js";
import { MONEY_RUN_SESSION_NAME } from "./cli-status-readiness.js";
import { readErrorMessage } from "./cli-record-utils.js";

const TMUX_TAIL_LINES = 120;
const TMUX_PROBE_TIMEOUT_MS = 1_500;
const TMUX_WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const TMUX_PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";

export type MoneyRunCommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export async function readMoneyRunStatusForStatus(
  commandRunner: MoneyRunCommandRunner
): Promise<Record<string, unknown>> {
  const probeCommands: string[] = [];
  const runTmux = async (args: string[]) => {
    probeCommands.push(formatTmuxCommand(args));
    try {
      return await commandRunner("tmux", args, { timeoutMs: TMUX_PROBE_TIMEOUT_MS });
    } catch (error) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: readErrorMessage(error)
      };
    }
  };

  try {
    const hasSession = await runTmux(["has-session", "-t", MONEY_RUN_SESSION_NAME]);
    if (hasSession.exitCode !== 0) {
      return createMoneyRunSnapshot(
        createTmuxSupervisionReport({
          sessionName: MONEY_RUN_SESSION_NAME,
          hasSession: false,
          commandError: readCommandResultMessage(hasSession, "tmux session was not found.")
        }),
        probeCommands,
        {
          probeError: readCommandResultMessage(hasSession, "tmux session was not found.")
        }
      );
    }

    const [windows, panes] = await Promise.all([
      runTmux([
        "list-windows",
        "-t",
        MONEY_RUN_SESSION_NAME,
        "-F",
        TMUX_WINDOW_FORMAT
      ]),
      runTmux([
        "list-panes",
        "-t",
        MONEY_RUN_SESSION_NAME,
        "-s",
        "-F",
        TMUX_PANE_FORMAT
      ])
    ]);

    if (windows.exitCode !== 0 || panes.exitCode !== 0) {
      const failed = windows.exitCode !== 0 ? windows : panes;

      return createMoneyRunProbeFailure(
        probeCommands,
        readCommandResultMessage(failed, "tmux session state could not be listed.")
      );
    }

    const paneTails: Record<string, string> = {};
    for (const pane of parseTmuxPaneList(panes.stdout)) {
      const tail = await runTmux([
        "capture-pane",
        "-p",
        "-t",
        pane.id,
        "-S",
        `-${TMUX_TAIL_LINES}`
      ]);
      paneTails[pane.id] = tail.stdout || tail.stderr;
    }

    return createMoneyRunSnapshot(
      createTmuxSupervisionReport({
        sessionName: MONEY_RUN_SESSION_NAME,
        hasSession: true,
        windowsOutput: windows.stdout,
        panesOutput: panes.stdout,
        paneTails
      }),
      probeCommands
    );
  } catch (error) {
    return createMoneyRunProbeFailure(probeCommands, readErrorMessage(error));
  }
}

export function createMoneyRunProbeFailure(
  probeCommands: string[],
  reason: string
): Record<string, unknown> {
  return {
    state: "blocked",
    session: MONEY_RUN_SESSION_NAME,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    summary: {
      windowCount: 0,
      paneCount: 0,
      activePaneIds: [],
      deadPaneIds: []
    },
    signals: [
      {
        type: "probe-error",
        severity: "blocked",
        message: reason
      }
    ],
    recommendation: {
      action: "inspect_state",
      reason,
      mutatesSession: false
    },
    probeCommands,
    probeError: reason
  };
}

export function createMoneyRunSnapshot(
  report: TmuxSupervisionReport,
  probeCommands: string[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const activePane = report.panes.find((pane) => pane.active);

  return {
    state: report.status,
    session: report.sessionName,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    summary: report.summary,
    ...(activePane ? { activePane: createMoneyRunActivePaneSummary(activePane) } : {}),
    signals: report.signals,
    recommendation: report.recommendation,
    probeCommands,
    ...extra
  };
}

export function readCommandResultMessage(
  result: {
    stdout: string;
    stderr: string;
  },
  fallback: string
): string {
  const message = (result.stderr || result.stdout || "").trim();

  return message || fallback;
}

export function formatTmuxCommand(args: string[]): string {
  return ["tmux", ...args.map(formatCommandArg)].join(" ");
}

function createMoneyRunActivePaneSummary(pane: TmuxPaneSummary): Record<string, unknown> {
  return {
    id: pane.id,
    windowName: pane.windowName,
    currentCommand: pane.currentCommand,
    title: pane.title,
    recentTailPreview: createTailPreview(pane.recentTail)
  };
}

function createTailPreview(value: string): string {
  const trimmed = value.trim();

  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

function formatCommandArg(arg: string): string {
  return /^[A-Za-z0-9_./:@%#{}=-]+$/.test(arg)
    ? arg
    : JSON.stringify(arg);
}
