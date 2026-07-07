import {
  type TmuxPaneSummary,
  type TmuxSupervisionReport
} from "./computer-use/tmux-supervisor.js";
import { MONEY_RUN_SESSION_NAME } from "./cli-status-readiness.js";

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
