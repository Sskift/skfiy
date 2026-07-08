import type { DashboardSnapshot } from "./dashboard-data.js";
import type { DashboardDescriptor } from "./dashboard-status.js";
import { readRecord } from "./record-utils.js";
import {
  readRouteOutcome,
  type RouteOutcomeKind
} from "../shared/route-outcome.js";

export const DASHBOARD_EVIDENCE_SUMMARY_ENDPOINT = "/api/evidence-summary";

export interface DashboardEvidenceSummaryInput {
  descriptor: DashboardDescriptor;
  snapshot: DashboardSnapshot;
  generatedAt?: string;
}

export interface DashboardEvidenceSummary {
  schemaVersion: 1;
  generatedAt: string;
  dashboard: {
    url: string;
    bind: {
      host: "127.0.0.1";
      port: number;
    };
    endpoint: typeof DASHBOARD_EVIDENCE_SUMMARY_ENDPOINT;
  };
  status: {
    state: EvidenceState;
    laneCount: number;
    readyLaneCount: number;
    blockedLaneCount: number;
    attentionLaneCount: number;
  };
  lanes: EvidenceLane[];
  outputPolicy: {
    tokenFree: true;
    source: "dashboard-evidence-summary";
  };
}

export type EvidenceState = "ready" | "needs-evidence" | "blocked" | "unknown";

export interface EvidenceLane {
  id: "computer-use-operator" | "codex-plugin" | "chrome-extension";
  title: string;
  state: EvidenceState;
  summary: string;
  checks: EvidenceCheck[];
  nextActions: string[];
  commands?: EvidenceCommand[];
  setupGuide?: EvidenceSetupGuide;
}

export interface EvidenceCheck {
  id: string;
  label: string;
  state: EvidenceState;
  value?: string | number | boolean;
  ageSeconds?: number;
  stale?: boolean;
}

export interface EvidenceCommand {
  id: string;
  label: string;
  command: string;
  mutates?: boolean;
}

export interface EvidenceSetupGuide {
  source: "runtime" | "native-host" | "smoke-artifact" | "derived";
  nativeHostState: string;
  liveConnectionState: string;
  nextActions: string[];
  commands: EvidenceCommand[];
}

export function createDashboardEvidenceSummary({
  descriptor,
  snapshot,
  generatedAt = snapshot.generatedAt
}: DashboardEvidenceSummaryInput): DashboardEvidenceSummary {
  const lanes = [
    createComputerUseOperatorLane(snapshot),
    createCodexPluginLane(snapshot),
    createChromeExtensionLane(snapshot)
  ];
  const state = readAggregateState(lanes.map((lane) => lane.state));

  return {
    schemaVersion: 1,
    generatedAt: sanitizeText(generatedAt) ?? new Date().toISOString(),
    dashboard: {
      url: descriptor.url,
      bind: { ...descriptor.bind },
      endpoint: DASHBOARD_EVIDENCE_SUMMARY_ENDPOINT
    },
    status: {
      state,
      laneCount: lanes.length,
      readyLaneCount: lanes.filter((lane) => lane.state === "ready").length,
      blockedLaneCount: lanes.filter((lane) => lane.state === "blocked").length,
      attentionLaneCount: lanes.filter((lane) => lane.state === "needs-evidence").length
    },
    lanes,
    outputPolicy: {
      tokenFree: true,
      source: "dashboard-evidence-summary"
    }
  };
}

function createComputerUseOperatorLane(snapshot: DashboardSnapshot): EvidenceLane {
  const readiness = readRecord(snapshot.operatorReadiness) ?? {};
  const currentTurn = readRecord(snapshot.currentTurn) ?? {};
  const replay = readRecord(snapshot.replay) ?? {};
  const longHorizon = readRecord(snapshot.longHorizon) ?? {};
  const routeOutcome = readRouteOutcome({
    currentTurn,
    replay,
    defaultSource: "Dashboard evidence summary",
    includeCommandDetail: true,
    sanitizeString: sanitizeText
  });
  const alertCounts = countAlerts(snapshot.alerts);
  const readinessState = mapReadinessState(readString(readiness.state));
  const checks: EvidenceCheck[] = [
    {
      id: "operator-readiness",
      label: "Operator readiness",
      state: readinessState,
      value: readString(readiness.state, "unknown")
    },
    {
      id: "current-turn",
      label: "Current turn stream",
      state: currentTurn.state === "idle" || currentTurn.state === "approval_required"
        ? "ready"
        : readString(currentTurn.state) ? "needs-evidence" : "unknown",
      value: readString(currentTurn.state, "unknown")
    },
    {
      id: "route-outcome",
      label: "Route outcome",
      state: mapRouteOutcomeEvidenceState(routeOutcome.kind),
      value: routeOutcome.value
    },
    {
      id: "route-detail",
      label: "Route detail",
      state: mapRouteOutcomeEvidenceState(routeOutcome.kind),
      value: routeOutcome.detail
    },
    {
      id: "replay",
      label: "Replay evidence",
      state: replay.state === "available" ? "ready" : "needs-evidence",
      value: readString(replay.state, "empty")
    },
    {
      id: "long-horizon",
      label: "money-run supervision",
      state: longHorizon.state === "observing" ? "ready" : "needs-evidence",
      value: readString(longHorizon.state, "unknown")
    },
    {
      id: "operator-alerts",
      label: "Blocking alerts",
      state: alertCounts.error > 0 ? "blocked" : alertCounts.warning > 0 ? "needs-evidence" : "ready",
      value: alertCounts.error > 0
        ? `${alertCounts.error} error`
        : alertCounts.warning > 0
          ? `${alertCounts.warning} warning`
          : "clear"
    }
  ];
  const state = readAggregateState(checks.map((check) => check.state));

  return {
    id: "computer-use-operator",
    title: "Computer Use operator",
    state,
    summary: state === "ready"
      ? "Runtime, turn stream, replay, and supervision evidence are present."
      : "Operator runtime still needs fresh controllability evidence.",
    checks,
    nextActions: state === "ready" ? [] : [
      alertCounts.error > 0
        ? "Clear dashboard alerts before starting a real Computer Use task."
        : "Run a fresh dashboard smoke and capture a bounded runtime snapshot."
    ]
  };
}

function mapRouteOutcomeEvidenceState(kind: RouteOutcomeKind): EvidenceState {
  if (kind === "app_policy_denied" || kind === "blocked" || kind === "failed") {
    return "blocked";
  }

  if (
    kind === "approval_required"
    || kind === "needs_confirmation"
    || kind === "needs_clarification"
    || kind === "running"
  ) {
    return "needs-evidence";
  }

  if (
    kind === "idle"
    || kind === "completed"
    || kind === "user_denied"
    || kind === "cancelled"
    || kind === "stopped"
  ) {
    return "ready";
  }

  return "unknown";
}

function createCodexPluginLane(snapshot: DashboardSnapshot): EvidenceLane {
  const artifact = findSmokeArtifact(snapshot, "codex-plugin");
  const artifactState = readSmokeArtifactState(artifact);
  const cachePath = readString(artifact?.productPath, "") ?? "";
  const checks: EvidenceCheck[] = [
    {
      id: "codex-plugin-smoke",
      label: "Latest Codex plugin smoke",
      state: artifactState,
      value: artifact ? readString(artifact.result, "unknown") : "missing",
      ...readArtifactTiming(artifact)
    },
    {
      id: "codex-plugin-product-path",
      label: "Packaged MCP path",
      state: cachePath.includes("MCP") || cachePath.includes("mcp") || cachePath.includes("skfiy CLI")
        ? "ready"
        : artifact ? "needs-evidence" : "unknown",
      value: sanitizeText(cachePath) || "missing"
    }
  ];
  const state = readAggregateState(checks.map((check) => check.state));

  return {
    id: "codex-plugin",
    title: "Codex plugin",
    state,
    summary: artifact
      ? `Latest artifact is ${readString(artifact.result, "unknown")}.`
      : "No Codex plugin smoke artifact has been recorded.",
    checks,
    nextActions: state === "ready" ? [] : [
      "Run npm run smoke:codex-plugin -- --output .skfiy-smoke/codex-plugin.json --require-passed."
    ]
  };
}

function createChromeExtensionLane(snapshot: DashboardSnapshot): EvidenceLane {
  const runtime = readRecord(snapshot.runtimeHealth) ?? {};
  const extension = readRecord(runtime.extension) ?? {};
  const nativeHost = readRecord(runtime.nativeHost) ?? {};
  const artifact = findSmokeArtifact(snapshot, "chrome");
  const nativeHostBridge = readRecord(artifact?.nativeHostBridge);
  const installedExtension = readRecord(artifact?.installedExtension);
  const extensionState = readString(extension.state, "unknown") ?? "unknown";
  const nativeHostState = readString(nativeHost.state, "unknown") ?? "unknown";
  const liveConnectionState = readChromeLiveConnectionState(extension, extensionState);
  const checks: EvidenceCheck[] = [
    {
      id: "extension-runtime",
      label: "Extension runtime",
      state: mapChromeExtensionRuntimeState(extensionState),
      value: extensionState
    },
    {
      id: "native-host",
      label: "Native host install status",
      state: nativeHostState === "installed"
        ? "ready"
        : nativeHostState === "missing" || nativeHostState === "mismatched" || nativeHostState === "invalid" || nativeHostState === "cli-missing"
          ? "blocked"
          : "needs-evidence",
      value: nativeHostState
    },
    {
      id: "live-connection",
      label: "Live connection status",
      state: mapChromeLiveConnectionState(liveConnectionState),
      value: liveConnectionState
    },
    {
      id: "chrome-smoke",
      label: "Latest Chrome smoke",
      state: readSmokeArtifactState(artifact),
      value: artifact ? readString(artifact.result, "unknown") : "missing",
      ...readArtifactTiming(artifact)
    },
    {
      id: "native-host-bridge",
      label: "Packaged host bridge",
      state: readResultState(readString(nativeHostBridge?.result)),
      value: readString(nativeHostBridge?.result, "missing")
    },
    {
      id: "installed-extension",
      label: "Installed extension proof",
      state: readInstalledExtensionState(readString(installedExtension?.result)),
      value: readString(installedExtension?.result, "missing")
    }
  ];
  const state = readAggregateState(checks.map((check) => check.state));
  const setupGuide = createChromeSetupGuide({
    extension,
    nativeHost,
    artifact,
    state,
    nativeHostState,
    liveConnectionState
  });

  return {
    id: "chrome-extension",
    title: "Chrome extension",
    state,
    summary: extensionState === "connected"
      ? "Chrome extension heartbeat is connected."
      : "Chrome control has partial evidence but no live extension heartbeat.",
    checks,
    nextActions: setupGuide.nextActions,
    commands: setupGuide.commands,
    setupGuide
  };
}

function createChromeSetupGuide({
  extension,
  nativeHost,
  artifact,
  state,
  nativeHostState,
  liveConnectionState
}: {
  extension: Record<string, unknown>;
  nativeHost: Record<string, unknown>;
  artifact: Record<string, unknown> | undefined;
  state: EvidenceState;
  nativeHostState: string;
  liveConnectionState: string;
}): EvidenceSetupGuide {
  const runtimeGuide = normalizeChromeSetupGuide(readRecord(extension.setupGuide), "runtime");
  const nativeHostGuide = normalizeChromeSetupGuide(readRecord(nativeHost.setupGuide), "native-host");
  const artifactGuide = normalizeChromeSetupGuide(readRecord(artifact?.setupGuide), "smoke-artifact");
  const guide = runtimeGuide ?? nativeHostGuide ?? artifactGuide;
  const extensionId = readChromeExtensionId(extension, nativeHost);
  const commands = guide?.commands.length ? guide.commands : createDefaultChromeCommands(extensionId);
  const nextActions = guide?.nextActions.length
    ? guide.nextActions
    : createDefaultChromeNextActions({
      state,
      nativeHostState,
      liveConnectionState
    });

  return {
    source: guide?.source ?? "derived",
    nativeHostState,
    liveConnectionState,
    nextActions,
    commands
  };
}

function normalizeChromeSetupGuide(
  guide: Record<string, unknown> | undefined,
  source: EvidenceSetupGuide["source"]
): Pick<EvidenceSetupGuide, "source" | "nextActions" | "commands"> | undefined {
  if (!guide) {
    return undefined;
  }

  const nextActions = readSetupActionTexts(guide.nextActions);
  const commands = dedupeEvidenceCommands([
    ...readEvidenceCommands(guide.commands),
    ...readEvidenceCommands(guide.copyableCommands),
    ...readNamedEvidenceCommands(guide)
  ]);
  if (nextActions.length === 0 && commands.length === 0) {
    return undefined;
  }

  return {
    source,
    nextActions,
    commands
  };
}

function readEvidenceCommands(value: unknown): EvidenceCommand[] {
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      return normalizeEvidenceCommand(value, "command");
    }

    return value.flatMap((entry, index) => normalizeEvidenceCommand(entry, `command-${index + 1}`));
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).flatMap(([key, entry]) =>
    normalizeEvidenceCommand(entry, key)
  );
}

function readNamedEvidenceCommands(guide: Record<string, unknown>): EvidenceCommand[] {
  return [
    ["install-host", guide.installHostCommand],
    ["status", guide.verifyStatusCommand],
    ["smoke", guide.smokeCommand]
  ].flatMap(([id, value]) => normalizeEvidenceCommand(value, id as string));
}

function normalizeEvidenceCommand(value: unknown, idHint: string): EvidenceCommand[] {
  if (typeof value === "string") {
    const command = readString(value);
    return command ? [{
      id: normalizeCommandId(idHint),
      label: readCommandLabel(idHint),
      command
    }] : [];
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    const command = sanitizeText(formatCommandParts(value));
    return command ? [{
      id: normalizeCommandId(idHint),
      label: readCommandLabel(idHint),
      command
    }] : [];
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  const command = readString(record.copyText)
    ?? readString(record.commandText)
    ?? readString(record.commandLine)
    ?? readCommandFromRecord(record)
    ?? readString(record.command ?? record.value);
  if (!command) {
    return [];
  }

  return [{
    id: normalizeCommandId(readString(record.id) ?? idHint),
    label: readString(record.label) ?? readCommandLabel(idHint),
    command,
    ...(typeof record.mutates === "boolean" ? { mutates: record.mutates } : {})
  }];
}

function readCommandFromRecord(record: Record<string, unknown>): string | undefined {
  const command = readString(record.command);
  const args = readStringArray(record.args);
  if (!command || args.length === 0) {
    return undefined;
  }

  return sanitizeText(formatCommandParts([command, ...args]));
}

function dedupeEvidenceCommands(commands: EvidenceCommand[]): EvidenceCommand[] {
  const seen = new Set<string>();
  const deduped: EvidenceCommand[] = [];
  for (const command of commands) {
    const key = `${command.id}\n${command.command}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(command);
  }

  return deduped;
}

function createDefaultChromeCommands(extensionId: string): EvidenceCommand[] {
  return [
    {
      id: "install-host",
      label: "Install host",
      command: `skfiy chrome install-host --extension-id ${extensionId}`,
      mutates: true
    },
    {
      id: "status",
      label: "Status",
      command: `skfiy chrome status --json --extension-id ${extensionId}`
    },
    {
      id: "smoke",
      label: "Smoke",
      command: "npm run smoke:chrome"
    }
  ];
}

function createDefaultChromeNextActions({
  state,
  nativeHostState,
  liveConnectionState
}: {
  state: EvidenceState;
  nativeHostState: string;
  liveConnectionState: string;
}): string[] {
  if (state === "ready") {
    return [];
  }

  if (nativeHostState !== "installed") {
    return ["Install or repair the Chrome Native Messaging host from the packaged skfiy binary."];
  }

  if (liveConnectionState !== "connected") {
    return ["Refresh the installed extension heartbeat, then rerun Chrome status."];
  }

  return ["Rerun the Chrome smoke with a load-extension-friendly browser and capture the artifact."];
}

function readChromeLiveConnectionState(
  extension: Record<string, unknown>,
  extensionState: string
): string {
  const connection = readRecord(extension.connection);
  return readString(extension.liveConnection)
    ?? readString(connection?.liveConnection)
    ?? readString(connection?.state)
    ?? (extensionState === "connected" ? "connected" : "unknown");
}

function mapChromeLiveConnectionState(state: string): EvidenceState {
  if (state === "connected") {
    return "ready";
  }

  if (state === "invalid") {
    return "blocked";
  }

  return "needs-evidence";
}

function readChromeExtensionId(
  extension: Record<string, unknown>,
  nativeHost: Record<string, unknown>
): string {
  const explicitIds = [
    ...readStringArray(extension.extensionIds),
    ...readStringArray(nativeHost.extensionIds)
  ];
  const originIds = [
    ...readStringArray(extension.allowedOrigins),
    ...readStringArray(nativeHost.allowedOrigins)
  ].flatMap((origin) => {
    const match = origin.match(/^chrome-extension:\/\/([^/]+)\//);
    return match?.[1] ? [match[1]] : [];
  });

  return explicitIds[0] ?? originIds[0] ?? "<extension-id>";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const text = readString(entry);
      return text ? [text] : [];
    })
    : [];
}

function readSetupActionTexts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const text = typeof entry === "string"
        ? readString(entry)
        : readSetupActionText(readRecord(entry));
      return text ? [text] : [];
    })
    : [];
}

function readSetupActionText(action: Record<string, unknown> | undefined): string | undefined {
  if (!action) {
    return undefined;
  }

  const text = readString(action.title)
    ?? readString(action.guidance)
    ?? readString(action.nextAction)
    ?? readString(action.reason);
  const command = Array.isArray(action.command) && action.command.every((entry) => typeof entry === "string")
    ? sanitizeText(formatCommandParts(action.command))
    : readString(action.copyText);

  return text && command ? `${text} ${command}` : text ?? command;
}

function formatCommandParts(parts: string[]): string {
  return parts.map((part) =>
    /^[A-Za-z0-9_./:=@%+-]+$/.test(part) ? part : JSON.stringify(part)
  ).join(" ");
}

function normalizeCommandId(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "command";
}

function readCommandLabel(value: string): string {
  const normalized = normalizeCommandId(value);
  if (normalized === "install-host") {
    return "Install host";
  }
  if (normalized === "status") {
    return "Status";
  }
  if (normalized === "smoke") {
    return "Smoke";
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Command";
}

function findSmokeArtifact(
  snapshot: DashboardSnapshot,
  target: string
): Record<string, unknown> | undefined {
  return snapshot.smokeEvidence.artifacts.find((artifact) => artifact.target === target);
}

function readSmokeArtifactState(artifact: Record<string, unknown> | undefined): EvidenceState {
  if (!artifact) {
    return "needs-evidence";
  }

  if (artifact.stale === true) {
    return "needs-evidence";
  }

  return readResultState(readString(artifact.result));
}

function readResultState(result: string | undefined): EvidenceState {
  if (result === "passed") {
    return "ready";
  }

  if (result === "failed") {
    return "blocked";
  }

  if (result === "blocked") {
    return "needs-evidence";
  }

  if (result) {
    return "needs-evidence";
  }

  return "needs-evidence";
}

function readInstalledExtensionState(result: string | undefined): EvidenceState {
  if (result === "blocked") {
    return "needs-evidence";
  }

  return readResultState(result);
}

function mapReadinessState(state: string | undefined): EvidenceState {
  if (state === "ready") {
    return "ready";
  }

  if (state === "blocked") {
    return "blocked";
  }

  if (state) {
    return "needs-evidence";
  }

  return "unknown";
}

function mapChromeExtensionRuntimeState(state: string): EvidenceState {
  if (state === "connected") {
    return "ready";
  }

  if (state === "native-host-installed") {
    return "needs-evidence";
  }

  if (
    state === "native-host-missing"
    || state === "native-host-mismatched"
    || state === "native-host-invalid"
    || state === "native-host-cli-missing"
  ) {
    return "blocked";
  }

  return "needs-evidence";
}

function readAggregateState(states: EvidenceState[]): EvidenceState {
  if (states.some((state) => state === "blocked")) {
    return "blocked";
  }

  if (states.length > 0 && states.every((state) => state === "ready")) {
    return "ready";
  }

  if (states.some((state) => state === "needs-evidence")) {
    return "needs-evidence";
  }

  return "unknown";
}

function readArtifactTiming(
  artifact: Record<string, unknown> | undefined
): Pick<EvidenceCheck, "ageSeconds" | "stale"> {
  if (!artifact) {
    return {};
  }

  const ageSeconds = readFiniteNumber(artifact.ageSeconds);

  return {
    ...(ageSeconds === undefined ? {} : { ageSeconds }),
    ...(artifact.stale === true ? { stale: true } : {})
  };
}

function countAlerts(alerts: Array<Record<string, unknown>>): {
  error: number;
  warning: number;
} {
  return {
    error: alerts.filter((alert) => alert.severity === "error").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length
  };
}

function readString(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") {
    return fallback;
  }

  return sanitizeText(value) ?? fallback;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const SECRET_TEXT_PATTERN = /\b(?:access[_-]?token|auth[_-]?token|api[_-]?key|password|secret|token)=([^\s&]+)/gi;
const SECRET_QUERY_PATTERN = /([?&])(?:access[_-]?token|auth[_-]?token|api[_-]?key|password|secret|token)=([^&\s]+)/gi;
const AUTH_HEADER_PATTERN = /\b(?:authorization|bearer|basic)\s+[-._~+/=A-Za-z0-9]+/gi;

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const sanitized = value
    .replace(SECRET_QUERY_PATTERN, "$1token=redacted-secret")
    .replace(SECRET_TEXT_PATTERN, (match) => match.replace(/=.*/, "=redacted-secret"))
    .replace(AUTH_HEADER_PATTERN, "authorization redacted-secret");

  return sanitized.length > 240 ? `${sanitized.slice(0, 237)}...` : sanitized;
}
