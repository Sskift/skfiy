import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DashboardDescriptor } from "./dashboard-status.js";
import {
  CHROME_EXTENSION_CONNECTION_TTL_SECONDS,
  CHROME_NATIVE_HOST_NAME,
  createChromeExtensionConnectionStatePath
} from "./chrome-native-host.js";

const STALE_SMOKE_EVIDENCE_SECONDS = 86_400;

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
  homeDir?: () => string | undefined;
  pid?: () => number;
  uptimeSeconds?: () => number;
  codeSignature?: (appPath: string) => Record<string, unknown>;
  permissions?: (helperPath: string) => Record<string, unknown>;
  desktopSession?: (helperPath: string) => Record<string, unknown>;
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
      runtimeHealth,
      smokeEvidence
    })
  };
}

export function createDashboardWorkspaceSnapshot({
  rootDir,
  descriptor,
  generatedAt,
  io = createDefaultDashboardWorkspaceIo()
}: DashboardWorkspaceSnapshotInput): DashboardSnapshot {
  const snapshotGeneratedAt = generatedAt ?? new Date().toISOString();
  const packageInfo = readPackageInfo(rootDir, io);
  const appPath = path.join(rootDir, "dist", "skfiy.app");
  const helperPath = path.join(appPath, "Contents", "MacOS", "skfiy-helper");
  const cliPath = path.join(rootDir, "dist", "skfiy");
  const appInstalled = io.exists(appPath);
  const helperInstalled = io.exists(helperPath);
  const cliInstalled = io.exists(cliPath);
  const nativeHost = readWorkspaceChromeNativeHost({
    cliPath,
    cliInstalled,
    io
  });
  const extensionConnection = readWorkspaceChromeExtensionConnection({
    generatedAt: snapshotGeneratedAt,
    io
  });

  const snapshot = createDashboardSnapshot({
    generatedAt: snapshotGeneratedAt,
    descriptor,
    status: {
      app: {
        state: appInstalled ? "installed" : "missing",
        path: appPath,
        bundleId: "com.sskift.skfiy",
        signing: readWorkspaceCodeSignature(appPath, appInstalled, io)
      },
      helper: {
        state: helperInstalled ? "installed" : "missing",
        path: helperPath
      },
      dashboard: {
        state: "running",
        url: descriptor.url,
        pid: readWorkspacePid(io),
        uptimeSeconds: readWorkspaceUptimeSeconds(io)
      },
      extension: createWorkspaceChromeExtensionStatus(nativeHost, extensionConnection),
      nativeHost,
      desktopSession: readWorkspaceDesktopSession(helperPath, helperInstalled, io),
      permissions: readWorkspacePermissions(helperPath, helperInstalled, io)
    },
    smokeEvidence: {
      artifacts: readLatestSmokeArtifacts(rootDir, snapshotGeneratedAt, io)
    }
  });

  return {
    ...snapshot,
    runtimeHealth: {
      package: packageInfo,
      ...snapshot.runtimeHealth,
      cli: {
        state: cliInstalled ? "installed" : "missing",
        path: cliPath
      }
    }
  };
}

function createDashboardAlerts({
  permissions,
  runtimeHealth,
  smokeEvidence
}: {
  permissions: Record<string, unknown>;
  runtimeHealth: Record<string, unknown>;
  smokeEvidence: {
    artifacts: Array<Record<string, unknown>>;
  };
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

  const staleTargets = smokeEvidence.artifacts
    .filter((artifact) => artifact.stale === true)
    .map((artifact) => String(artifact.target))
    .sort();

  if (staleTargets.length > 0) {
    alerts.push({
      code: "smoke-evidence-stale",
      severity: "warning",
      message: `Smoke evidence is stale for: ${staleTargets.join(", ")}.`
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
  generatedAt: string,
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
    const ageSeconds = readSmokeArtifactAgeSeconds(generatedAt, mtimeMs);
    const summary = {
      target,
      result: typeof artifact.result === "string" ? artifact.result : "unknown",
      path: artifactPath,
      ...(typeof artifact.productPath === "string" ? { productPath: artifact.productPath } : {}),
      mtimeMs,
      ...(ageSeconds === undefined ? {} : {
        ageSeconds,
        stale: ageSeconds > STALE_SMOKE_EVIDENCE_SECONDS
      }),
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

function readSmokeArtifactAgeSeconds(generatedAt: string, mtimeMs: number): number | undefined {
  const generatedAtMs = Date.parse(generatedAt);

  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(mtimeMs)) {
    return undefined;
  }

  return Math.max(0, Math.floor((generatedAtMs - mtimeMs) / 1000));
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
    "cli",
    "codex-plugin",
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
    stat: (targetPath) => fs.statSync(targetPath),
    homeDir: () => process.env.HOME,
    pid: () => process.pid,
    uptimeSeconds: () => Math.max(0, Math.round(process.uptime())),
    codeSignature: readCodeSignatureSync,
    permissions: readHelperPermissionsSync,
    desktopSession: readHelperDesktopSessionSync
  };
}

function readWorkspaceChromeNativeHost({
  cliPath,
  cliInstalled,
  io
}: {
  cliPath: string;
  cliInstalled: boolean;
  io: DashboardWorkspaceIo;
}): Record<string, unknown> {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    return {
      state: "unknown",
      hostName: CHROME_NATIVE_HOST_NAME,
      cliShimPath: cliPath,
      reason: "Home directory is required to locate the Chrome Native Messaging host manifest."
    };
  }

  const manifestPath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "NativeMessagingHosts",
    `${CHROME_NATIVE_HOST_NAME}.json`
  );

  if (!cliInstalled) {
    return {
      state: "cli-missing",
      hostName: CHROME_NATIVE_HOST_NAME,
      manifestPath,
      cliShimPath: cliPath,
      allowedOrigins: [],
      reason: `skfiy CLI shim is missing at ${cliPath}.`
    };
  }

  if (!io.exists(manifestPath)) {
    return {
      state: "missing",
      hostName: CHROME_NATIVE_HOST_NAME,
      manifestPath,
      cliShimPath: cliPath,
      allowedOrigins: [],
      reason: "Chrome Native Messaging host manifest is not installed."
    };
  }

  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(io.readFile(manifestPath)) as unknown;
    const record = readRecord(parsed);
    if (!record) {
      return {
        state: "invalid",
        hostName: CHROME_NATIVE_HOST_NAME,
        manifestPath,
        cliShimPath: cliPath,
        allowedOrigins: [],
        reason: "Chrome Native Messaging host manifest is not an object."
      };
    }
    manifest = record;
  } catch {
    return {
      state: "invalid",
      hostName: CHROME_NATIVE_HOST_NAME,
      manifestPath,
      cliShimPath: cliPath,
      allowedOrigins: [],
      reason: "Chrome Native Messaging host manifest is not valid JSON."
    };
  }

  const allowedOrigins = Array.isArray(manifest.allowed_origins)
    ? manifest.allowed_origins.filter((origin): origin is string => typeof origin === "string")
    : [];
  const status = {
    hostName: CHROME_NATIVE_HOST_NAME,
    manifestPath,
    cliShimPath: cliPath,
    allowedOrigins
  };

  if (
    manifest.name !== CHROME_NATIVE_HOST_NAME
    || manifest.type !== "stdio"
    || manifest.path !== cliPath
  ) {
    return {
      state: "mismatched",
      ...status,
      installedPath: manifest.path,
      reason: "Chrome Native Messaging host manifest does not match the current skfiy CLI."
    };
  }

  return {
    state: "installed",
    ...status,
    reason: "Chrome Native Messaging host is installed."
  };
}

function createWorkspaceChromeExtensionStatus(
  nativeHost: Record<string, unknown>,
  connection?: Record<string, unknown>
): Record<string, unknown> {
  const allowedOrigins = Array.isArray(nativeHost.allowedOrigins)
    ? nativeHost.allowedOrigins.filter((origin): origin is string => typeof origin === "string")
    : [];
  const common = {
    bridge: "native-messaging",
    liveConnection: readWorkspaceConnectionState(connection),
    nativeHostState: nativeHost.state,
    ...(typeof nativeHost.manifestPath === "string" ? { manifestPath: nativeHost.manifestPath } : {}),
    ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    ...(connection && connection.state !== "unknown" ? { connection } : {})
  };

  if (connection?.state === "connected") {
    return {
      state: "connected",
      ...common
    };
  }

  if (connection?.state === "stale" && nativeHost.state === "installed") {
    return {
      state: "native-host-installed",
      ...common,
      reason: "Chrome extension native-message heartbeat is stale."
    };
  }

  if (nativeHost.state === "installed") {
    return {
      state: "native-host-installed",
      ...common,
      reason: "Chrome Native Messaging host is installed; no live Chrome extension connection has been observed yet."
    };
  }

  if (nativeHost.state === "missing") {
    return {
      state: "native-host-missing",
      ...common,
      reason: "Chrome Native Messaging host manifest is not installed."
    };
  }

  if (nativeHost.state === "cli-missing") {
    return {
      state: "native-host-cli-missing",
      ...common,
      reason: "The Chrome Native Messaging host cannot run because the packaged skfiy CLI is missing."
    };
  }

  if (nativeHost.state === "mismatched") {
    return {
      state: "native-host-mismatched",
      ...common,
      reason: "Chrome Native Messaging host manifest points at a different skfiy CLI."
    };
  }

  if (nativeHost.state === "invalid") {
    return {
      state: "native-host-invalid",
      ...common,
      reason: "Chrome Native Messaging host manifest is invalid."
    };
  }

  return {
    state: "unknown",
    ...common,
    reason: "Runtime Chrome extension connection is not probed yet."
  };
}

function readWorkspaceChromeExtensionConnection({
  generatedAt,
  io
}: {
  generatedAt: string;
  io: DashboardWorkspaceIo;
}): Record<string, unknown> | undefined {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    return undefined;
  }

  const statePath = createChromeExtensionConnectionStatePath(homeDir);
  if (!io.exists(statePath)) {
    return {
      state: "unknown",
      liveConnection: "unknown",
      path: statePath,
      reason: "No Chrome extension connection heartbeat has been recorded."
    };
  }

  let heartbeat: Record<string, unknown>;
  try {
    const parsed = JSON.parse(io.readFile(statePath)) as unknown;
    const record = readRecord(parsed);
    if (!record) {
      return {
        state: "invalid",
        liveConnection: "unknown",
        path: statePath,
        reason: "Chrome extension connection heartbeat is not an object."
      };
    }
    heartbeat = record;
  } catch {
    return {
      state: "invalid",
      liveConnection: "unknown",
      path: statePath,
      reason: "Chrome extension connection heartbeat is not valid JSON."
    };
  }

  const observedAt = typeof heartbeat.observedAt === "string" ? heartbeat.observedAt : undefined;
  const observedAtMs = observedAt ? Date.parse(observedAt) : NaN;
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(generatedAtMs)) {
    return {
      state: "invalid",
      liveConnection: "unknown",
      path: statePath,
      reason: "Chrome extension connection heartbeat has invalid timestamps."
    };
  }

  const ageSeconds = Math.max(0, Math.floor((generatedAtMs - observedAtMs) / 1000));
  const connected = ageSeconds <= CHROME_EXTENSION_CONNECTION_TTL_SECONDS;

  return {
    state: connected ? "connected" : "stale",
    liveConnection: connected ? "connected" : "stale",
    path: statePath,
    ageSeconds,
    observedAt,
    ...(typeof heartbeat.launchOrigin === "string" ? { launchOrigin: heartbeat.launchOrigin } : {}),
    ...(typeof heartbeat.messageType === "string" ? { messageType: heartbeat.messageType } : {}),
    ...(typeof heartbeat.requestId === "string" ? { requestId: heartbeat.requestId } : {})
  };
}

function readWorkspaceConnectionState(connection: Record<string, unknown> | undefined): string {
  return connection?.liveConnection === "connected" || connection?.liveConnection === "stale"
    ? connection.liveConnection
    : "unknown";
}

function readWorkspacePid(io: DashboardWorkspaceIo): number {
  const pid = io.pid?.();

  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0
    ? pid
    : process.pid;
}

function readWorkspaceUptimeSeconds(io: DashboardWorkspaceIo): number {
  const uptimeSeconds = io.uptimeSeconds?.();

  return typeof uptimeSeconds === "number" && Number.isFinite(uptimeSeconds) && uptimeSeconds >= 0
    ? Math.round(uptimeSeconds)
    : Math.max(0, Math.round(process.uptime()));
}

function readWorkspaceCodeSignature(
  appPath: string,
  appInstalled: boolean,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  if (!appInstalled) {
    return {
      state: "missing",
      appPath,
      reason: "skfiy.app is missing."
    };
  }

  return io.codeSignature?.(appPath) ?? {
    state: "unknown",
    appPath,
    reason: "No code signature probe is configured."
  };
}

function readWorkspacePermissions(
  helperPath: string,
  helperInstalled: boolean,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  if (!helperInstalled) {
    return {
      ...createUnknownPermissions(),
      reason: `skfiy helper is missing at ${helperPath}.`
    };
  }

  try {
    const permissions = io.permissions?.(helperPath);
    if (!permissions) {
      return {
        ...createUnknownPermissions(),
        reason: "No permission probe is configured."
      };
    }

    return createPermissionStates(permissions);
  } catch (error) {
    return {
      ...createUnknownPermissions(),
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readWorkspaceDesktopSession(
  helperPath: string,
  helperInstalled: boolean,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  if (!helperInstalled) {
    return {
      state: "unknown",
      reason: `skfiy helper is missing at ${helperPath}.`
    };
  }

  try {
    const desktopSession = io.desktopSession?.(helperPath);
    if (!desktopSession) {
      return {
        state: "unknown",
        reason: "No desktop session probe is configured."
      };
    }

    const status = cloneRecord(desktopSession);
    return {
      ...status,
      state: readDesktopSessionState(status)
    };
  } catch (error) {
    return {
      state: "unknown",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readCodeSignatureSync(appPath: string): Record<string, unknown> {
  const verify = spawnSync("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath
  ], {
    encoding: "utf8"
  });

  if (verify.status !== 0) {
    return {
      state: "invalid",
      appPath,
      reason: readSpawnMessage(verify, "codesign verification failed.")
    };
  }

  const details = spawnSync("codesign", [
    "-dr",
    "-",
    appPath
  ], {
    encoding: "utf8"
  });
  const requirement = `${details.stdout ?? ""}${details.stderr ?? ""}`.trim();

  if (details.status !== 0) {
    return {
      state: "invalid",
      appPath,
      reason: readSpawnMessage(details, "codesign designated requirement could not be read.")
    };
  }

  return {
    state: requirement.includes('identifier "com.sskift.skfiy"') ? "valid" : "invalid",
    appPath,
    requirement,
    ...(requirement.includes('identifier "com.sskift.skfiy"')
      ? {}
      : { reason: "Designated requirement does not include com.sskift.skfiy." })
  };
}

function readHelperPermissionsSync(helperPath: string): Record<string, unknown> {
  return readHelperJsonSync(helperPath, ["permissions-status"], "permissions-status");
}

function readHelperDesktopSessionSync(helperPath: string): Record<string, unknown> {
  return readHelperJsonSync(helperPath, ["desktop-session-status"], "desktop-session-status");
}

function readHelperJsonSync(
  helperPath: string,
  args: string[],
  commandName: string
): Record<string, unknown> {
  const result = spawnSync(helperPath, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `Desktop helper command failed (${commandName}) with exit code ${result.status ?? "unknown"}: ${readSpawnMessage(result, "No error output.")}`
    );
  }

  const text = `${result.stdout ?? ""}`.trim();
  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Desktop helper returned invalid JSON for ${commandName}: ${text || "(empty stdout)"}`);
  }

  return readRecord(unwrapHelperPayload(payload, commandName)) ?? {};
}

function unwrapHelperPayload(payload: unknown, commandName: string): unknown {
  const record = readRecord(payload);
  if (!record || typeof record.ok !== "boolean") {
    return payload;
  }

  const isEnvelope = "data" in record || "error" in record || typeof record.command === "string";
  if (!isEnvelope) {
    return payload;
  }

  if (!record.ok) {
    throw new Error(readHelperErrorMessage(record) ?? `Helper reported ${commandName} failed.`);
  }

  if (!("data" in record)) {
    throw new Error(`Desktop helper returned invalid JSON for ${commandName}: expected data in successful envelope.`);
  }

  return record.data;
}

function readHelperErrorMessage(record: Record<string, unknown>): string | undefined {
  const error = readRecord(record.error);

  if (typeof error?.message === "string") {
    return error.message;
  }

  return typeof record.message === "string" ? record.message : undefined;
}

function createPermissionStates(permissions: Record<string, unknown>): Record<string, string> {
  return {
    screenRecording: readPermissionState(permissions.screenRecording),
    accessibility: readPermissionState(permissions.accessibility),
    microphone: readPermissionState(permissions.microphone),
    speechRecognition: readPermissionState(permissions.speechRecognition),
    finderAutomation: readPermissionState(permissions.finderAutomation)
  };
}

function readPermissionState(value: unknown): string {
  const record = readRecord(value);
  const state = record ? record.state ?? readNativePermissionStatus(record) : value;
  const knownStates = new Set(["granted", "denied", "not-determined", "unknown"]);

  return typeof state === "string" && knownStates.has(state) ? state : "unknown";
}

function readNativePermissionStatus(record: Record<string, unknown>): string {
  switch (record.status) {
    case "authorized":
      return "granted";
    case "notDetermined":
      return "not-determined";
    case "denied":
    case "restricted":
    case "notAuthorized":
      return "denied";
    case "unknown":
      return "unknown";
    default:
      return record.granted === true ? "granted" : "unknown";
  }
}

function readDesktopSessionState(status: Record<string, unknown>): string {
  if (
    status.state === "controllable"
    || status.state === "blocked"
    || status.state === "unknown"
  ) {
    return status.state;
  }

  if (status.controllable === true) {
    return "controllable";
  }

  return status.controllable === false ? "blocked" : "unknown";
}

function readSpawnMessage(
  result: ReturnType<typeof spawnSync>,
  fallback: string
): string {
  if (result.error) {
    return result.error.message;
  }

  return `${result.stderr ?? ""}${result.stdout ?? ""}`.trim() || fallback;
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
