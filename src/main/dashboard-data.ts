import type { DashboardDescriptor } from "./dashboard-status.js";

export interface DashboardSnapshotInput {
  generatedAt?: string;
  descriptor: DashboardDescriptor;
  status?: Record<string, unknown>;
  currentTurn?: Record<string, unknown>;
  replay?: Record<string, unknown>;
  smokeEvidence?: {
    artifacts: Array<Record<string, unknown>>;
  };
  longHorizon?: Record<string, unknown>;
}

export interface DashboardSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  descriptor: DashboardDescriptor;
  runtimeHealth: Record<string, unknown>;
  permissions: Record<string, unknown>;
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
  smokeEvidence: {
    artifacts: Array<Record<string, unknown>>;
  };
  longHorizon: Record<string, unknown>;
  alerts: Array<Record<string, unknown>>;
}

export function createDashboardSnapshot({
  generatedAt = new Date().toISOString(),
  descriptor,
  status = {},
  currentTurn = { state: "idle" },
  replay = { state: "empty" },
  smokeEvidence = { artifacts: [] },
  longHorizon = { state: "unknown", session: "money-run" }
}: DashboardSnapshotInput): DashboardSnapshot {
  const permissions = readRecord(status.permissions) ?? createUnknownPermissions();
  const runtimeHealth = {
    app: readRecord(status.app) ?? { state: "unknown" },
    helper: readRecord(status.helper) ?? { state: "unknown" },
    dashboard: readRecord(status.dashboard) ?? {
      state: "running",
      url: descriptor.url
    },
    extension: readRecord(status.extension) ?? {
      state: "unknown",
      reason: "Runtime Chrome extension connection is not probed yet."
    },
    nativeHost: readRecord(status.nativeHost) ?? { state: "unknown" },
    desktopSession: readRecord(status.desktopSession) ?? { state: "unknown" }
  };

  return {
    schemaVersion: 1,
    generatedAt,
    descriptor,
    runtimeHealth,
    permissions,
    currentTurn: cloneRecord(currentTurn),
    replay: cloneRecord(replay),
    smokeEvidence: {
      artifacts: smokeEvidence.artifacts.map((artifact) => cloneRecord(artifact))
    },
    longHorizon: cloneRecord(longHorizon),
    alerts: createDashboardAlerts({
      permissions,
      runtimeHealth
    })
  };
}

function createDashboardAlerts({
  permissions,
  runtimeHealth
}: {
  permissions: Record<string, unknown>;
  runtimeHealth: Record<string, unknown>;
}): Array<Record<string, unknown>> {
  const alerts: Array<Record<string, unknown>> = [];
  const desktopSession = readRecord(runtimeHealth.desktopSession);
  const extension = readRecord(runtimeHealth.extension);

  if (permissions.screenRecording !== "granted") {
    alerts.push({
      code: "screen-recording-missing",
      severity: "error",
      message: "Screen Recording is not granted."
    });
  }

  if (permissions.accessibility !== "granted") {
    alerts.push({
      code: "accessibility-missing",
      severity: "error",
      message: "Accessibility is not granted."
    });
  }

  if (desktopSession?.state === "blocked" || desktopSession?.mainDisplayAsleep === true) {
    alerts.push({
      code: "desktop-session-blocked",
      severity: "error",
      message: "Desktop session is blocked or asleep."
    });
  }

  if (permissions.finderAutomation !== "granted") {
    alerts.push({
      code: "finder-automation-unknown",
      severity: "info",
      message: "Finder Automation has not been proven yet."
    });
  }

  if (extension?.state !== "connected") {
    alerts.push({
      code: "extension-unknown",
      severity: "warning",
      message: "Chrome extension connection is unknown."
    });
  }

  return alerts;
}

function createUnknownPermissions(): Record<string, string> {
  return {
    screenRecording: "unknown",
    accessibility: "unknown",
    microphone: "unknown",
    speechRecognition: "unknown",
    finderAutomation: "unknown"
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return { ...record };
}
