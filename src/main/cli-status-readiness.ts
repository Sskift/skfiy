import {
  readRecord,
  readString
} from "./cli-record-utils.js";
import { sanitizeDashboardUrlForOutput } from "./cli-output-sanitize.js";

export const MONEY_RUN_SESSION_NAME = "money-run";

export interface StatusReadinessContext {
  extensionIds: string[];
  dashboardUrl?: string;
  cliShimPath?: string;
}

export function createStatusReadinessSummary(
  status: Record<string, unknown>,
  context: StatusReadinessContext,
  extensionReadiness: Record<string, unknown>
): Record<string, unknown> {
  const checks = {
    runtime: createRuntimeReadiness(status),
    dashboard: createDashboardReadiness(status, context),
    extension: extensionReadiness,
    moneyRun: createMoneyRunReadiness(status)
  };
  const entries = Object.entries(checks);
  const states = entries.map(([, check]) => readString(readRecord(check)?.state) ?? "unknown");
  const blockers = entries.flatMap(([area, check]) =>
    readReadinessBlockers(check).map((blocker) => ({
      area,
      ...blocker
    }))
  );
  const state = states.every((item) => item === "ready")
    ? "ready"
    : states.every((item) => item === "unknown")
      ? "unknown"
      : "needs-action";

  return {
    state,
    ready: state === "ready",
    checks,
    blockers
  };
}

export function createBinaryReadinessEvidence(
  status: Record<string, unknown>,
  context: {
    appPath: string;
    helperPath: string;
    cliShimPath: string;
  }
): Record<string, unknown> {
  const app = readRecord(status.app);
  const cli = readRecord(status.cli);
  const helper = readRecord(status.helper);
  const appState = readString(app?.state) ?? "unknown";
  const cliState = readString(cli?.state) ?? "unknown";
  const helperState = readString(helper?.state) ?? "unknown";
  const ready = appState === "installed"
    && cliState === "installed"
    && helperState === "installed";

  return {
    state: ready
      ? "ready"
      : [appState, cliState, helperState].every((state) => state === "unknown")
        ? "unknown"
        : "needs-action",
    ready,
    app: {
      state: appState,
      path: readString(app?.path) ?? context.appPath
    },
    cli: {
      state: cliState,
      path: readString(cli?.path) ?? context.cliShimPath
    },
    helper: {
      state: helperState,
      path: readString(helper?.path) ?? context.helperPath
    }
  };
}

export function createUnknownMoneyRunStatus(): Record<string, unknown> {
  return {
    state: "unknown",
    session: MONEY_RUN_SESSION_NAME,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    reason: "money-run tmux supervision has not been probed yet."
  };
}

function createRuntimeReadiness(status: Record<string, unknown>): Record<string, unknown> {
  const app = readRecord(status.app);
  const cli = readRecord(status.cli);
  const helper = readRecord(status.helper);
  const permissions = readRecord(status.permissions);
  const desktopSession = readRecord(status.desktopSession);
  const appState = readString(app?.state) ?? "unknown";
  const cliState = readString(cli?.state) ?? "unknown";
  const helperState = readString(helper?.state) ?? "unknown";
  const screenRecording = readString(permissions?.screenRecording) ?? "unknown";
  const accessibility = readString(permissions?.accessibility) ?? "unknown";
  const desktopSessionState = readString(desktopSession?.state) ?? "unknown";
  const observed = [
    appState,
    cliState,
    helperState,
    screenRecording,
    accessibility,
    desktopSessionState
  ].some((state) => state !== "unknown");

  if (!observed) {
    return {
      state: "unknown",
      ready: false,
      appState,
      cliState,
      helperState,
      desktopSessionState,
      requiredPermissions: {
        screenRecording,
        accessibility
      },
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = [];

  addStateBlocker(blockers, "app-not-installed", "App bundle is not installed.", appState, "installed");
  addStateBlocker(blockers, "cli-not-installed", "Packaged CLI is not installed.", cliState, "installed");
  addStateBlocker(blockers, "helper-not-installed", "Desktop helper is not installed.", helperState, "installed");
  addStateBlocker(
    blockers,
    "screen-recording-not-granted",
    "Screen Recording is required for observation.",
    screenRecording,
    "granted"
  );
  addStateBlocker(
    blockers,
    "accessibility-not-granted",
    "Accessibility is required for desktop control.",
    accessibility,
    "granted"
  );
  addStateBlocker(
    blockers,
    "desktop-session-not-controllable",
    "The active desktop session must be controllable.",
    desktopSessionState,
    "controllable"
  );

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    appState,
    cliState,
    helperState,
    desktopSessionState,
    requiredPermissions: {
      screenRecording,
      accessibility
    },
    blockers
  };
}

function createDashboardReadiness(
  status: Record<string, unknown>,
  context: { dashboardUrl?: string }
): Record<string, unknown> {
  const dashboard = readRecord(status.dashboard);
  const api = readRecord(readRecord(dashboard?.api)?.chromeHostPolicy);
  const dashboardState = readString(dashboard?.state) ?? "unknown";
  const apiState = readString(api?.state);

  if (dashboardState === "unknown") {
    return {
      state: "unknown",
      ready: false,
      dashboardState,
      ...(context.dashboardUrl ? { url: sanitizeDashboardUrlForOutput(context.dashboardUrl) } : {}),
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = [];
  if (dashboardState !== "running") {
    blockers.push({
      code: "dashboard-not-running",
      message: "Loopback dashboard is not running.",
      state: dashboardState
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    dashboardState,
    ...(readString(dashboard?.url) || context.dashboardUrl
      ? { url: sanitizeDashboardUrlForOutput(readString(dashboard?.url) ?? context.dashboardUrl ?? "") }
      : {}),
    ...(apiState ? { chromeHostPolicyApiState: apiState } : {}),
    blockers
  };
}

function createMoneyRunReadiness(status: Record<string, unknown>): Record<string, unknown> {
  const moneyRun = readRecord(status.moneyRun);
  const moneyRunState = readString(moneyRun?.state) ?? "unknown";
  const mutatesSession = moneyRun?.mutatesSession === true;

  if (moneyRunState === "unknown") {
    return {
      state: "unknown",
      ready: false,
      session: MONEY_RUN_SESSION_NAME,
      moneyRunState,
      mutatesSession: false,
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = moneyRunState === "observing"
    ? []
    : [{
        code: "money-run-not-observing",
        message: "money-run tmux supervision is not in an observing state.",
        state: moneyRunState
      }];
  if (mutatesSession) {
    blockers.push({
      code: "money-run-mutating-probe",
      message: "money-run status must be gathered with read-only tmux probes.",
      mutatesSession
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    session: readString(moneyRun?.session) ?? MONEY_RUN_SESSION_NAME,
    moneyRunState,
    source: readString(moneyRun?.source) ?? "tmux-read-only-probe",
    mutatesSession,
    ...(readRecord(moneyRun?.summary) ? { summary: readRecord(moneyRun?.summary) } : {}),
    ...(readRecord(moneyRun?.recommendation) ? { recommendation: readRecord(moneyRun?.recommendation) } : {}),
    blockers
  };
}

function addStateBlocker(
  blockers: Array<Record<string, unknown>>,
  code: string,
  message: string,
  actual: string,
  expected: string
): void {
  if (actual === expected) {
    return;
  }

  blockers.push({
    code,
    message,
    state: actual,
    expected
  });
}

function readReadinessBlockers(check: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(check.blockers)
    ? check.blockers.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
}
