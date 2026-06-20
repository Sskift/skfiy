import type { DashboardSnapshot } from "./dashboard-data.js";
import type { DashboardDescriptor } from "./dashboard-status.js";

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
}

export interface EvidenceCheck {
  id: string;
  label: string;
  state: EvidenceState;
  value?: string | number | boolean;
  ageSeconds?: number;
  stale?: boolean;
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
  const checks: EvidenceCheck[] = [
    {
      id: "extension-runtime",
      label: "Live extension heartbeat",
      state: mapChromeExtensionRuntimeState(extensionState),
      value: extensionState
    },
    {
      id: "native-host",
      label: "Native Messaging host",
      state: nativeHostState === "installed"
        ? "ready"
        : nativeHostState === "missing" || nativeHostState === "mismatched" || nativeHostState === "invalid" || nativeHostState === "cli-missing"
          ? "blocked"
          : "needs-evidence",
      value: nativeHostState
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
  const state = extensionState === "connected"
    ? readAggregateState(checks.slice(1).map((check) => check.state))
    : readAggregateState(checks.map((check) => check.state));

  return {
    id: "chrome-extension",
    title: "Chrome extension",
    state,
    summary: extensionState === "connected"
      ? "Chrome extension heartbeat is connected."
      : "Chrome control has partial evidence but no live extension heartbeat.",
    checks,
    nextActions: state === "ready" ? [] : [
      nativeHostState === "installed"
        ? "Refresh the installed extension heartbeat or rerun the Chrome smoke with a load-extension-friendly browser."
        : "Install or repair the Chrome Native Messaging host from the packaged skfiy binary."
    ]
  };
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
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
