import fs from "node:fs";
import path from "node:path";
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

export interface DashboardWorkspaceIo {
  exists: (targetPath: string) => boolean;
  readFile: (targetPath: string) => string;
  readdir: (targetPath: string) => string[];
  stat: (targetPath: string) => { mtimeMs: number };
}

export interface DashboardWorkspaceSnapshotInput {
  rootDir: string;
  descriptor: DashboardDescriptor;
  generatedAt?: string;
  io?: DashboardWorkspaceIo;
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

export function createDashboardWorkspaceSnapshot({
  rootDir,
  descriptor,
  generatedAt,
  io = createDefaultDashboardWorkspaceIo()
}: DashboardWorkspaceSnapshotInput): DashboardSnapshot {
  const packageInfo = readPackageInfo(rootDir, io);
  const appPath = path.join(rootDir, "dist", "skfiy.app");
  const helperPath = path.join(appPath, "Contents", "MacOS", "skfiy-helper");
  const cliPath = path.join(rootDir, "dist", "skfiy");

  const snapshot = createDashboardSnapshot({
    generatedAt,
    descriptor,
    status: {
      app: {
        state: io.exists(appPath) ? "installed" : "missing",
        path: appPath,
        bundleId: "com.sskift.skfiy"
      },
      helper: {
        state: io.exists(helperPath) ? "installed" : "missing",
        path: helperPath
      },
      dashboard: {
        state: "running",
        url: descriptor.url
      },
      extension: {
        state: "unknown",
        reason: "Runtime Chrome extension connection is not probed yet."
      },
      nativeHost: {
        state: "unknown"
      },
      desktopSession: {
        state: "unknown"
      },
      permissions: createUnknownPermissions()
    },
    smokeEvidence: {
      artifacts: readLatestSmokeArtifacts(rootDir, io)
    }
  });

  return {
    ...snapshot,
    runtimeHealth: {
      package: packageInfo,
      ...snapshot.runtimeHealth,
      cli: {
        state: io.exists(cliPath) ? "installed" : "missing",
        path: cliPath
      }
    }
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

function readPackageInfo(
  rootDir: string,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  const packagePath = path.join(rootDir, "package.json");

  if (!io.exists(packagePath)) {
    return { state: "missing", path: packagePath };
  }

  try {
    const packageJson = JSON.parse(io.readFile(packagePath)) as Record<string, unknown>;

    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description
    };
  } catch (error) {
    return {
      state: "invalid",
      path: packagePath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readLatestSmokeArtifacts(
  rootDir: string,
  io: DashboardWorkspaceIo
): Array<Record<string, unknown>> {
  const smokeDir = path.join(rootDir, ".skfiy-smoke");
  if (!io.exists(smokeDir)) {
    return [];
  }

  const latestByTarget = new Map<string, Record<string, unknown>>();

  for (const entry of io.readdir(smokeDir)) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const artifactPath = path.join(smokeDir, entry);
    let artifact: Record<string, unknown>;

    try {
      const parsed = JSON.parse(io.readFile(artifactPath)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      artifact = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const target = readSmokeTarget(entry, artifact);
    const mtimeMs = io.stat(artifactPath).mtimeMs;
    const summary = {
      target,
      result: typeof artifact.result === "string" ? artifact.result : "unknown",
      path: artifactPath,
      ...(typeof artifact.productPath === "string" ? { productPath: artifact.productPath } : {}),
      mtimeMs,
      ...(typeof artifact.blocker === "string" ? { blocker: artifact.blocker } : {})
    };
    const current = latestByTarget.get(target);

    if (!current || (current.mtimeMs as number) < mtimeMs) {
      latestByTarget.set(target, summary);
    }
  }

  return [...latestByTarget.values()].sort((left, right) =>
    String(left.target).localeCompare(String(right.target))
  );
}

function readSmokeTarget(entry: string, artifact: Record<string, unknown>): string {
  if (typeof artifact.target === "string" && artifact.target.length > 0) {
    return artifact.target;
  }

  const normalized = entry.toLowerCase();
  const knownTargets = [
    "ui",
    "desktop-session",
    "ghostty",
    "chrome",
    "dashboard",
    "finder",
    "voice",
    "money-run"
  ];

  return knownTargets.find((target) => normalized.includes(target)) ?? "unknown";
}

function createDefaultDashboardWorkspaceIo(): DashboardWorkspaceIo {
  return {
    exists: (targetPath) => fs.existsSync(targetPath),
    readFile: (targetPath) => fs.readFileSync(targetPath, "utf8"),
    readdir: (targetPath) => fs.readdirSync(targetPath),
    stat: (targetPath) => fs.statSync(targetPath)
  };
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
