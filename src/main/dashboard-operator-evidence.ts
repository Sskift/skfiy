import type { DashboardSnapshot } from "./dashboard-data.js";
import type { DashboardDescriptor } from "./dashboard-status.js";
import { readRecord } from "./record-utils.js";
import {
  isRouteOutcomeKind,
  isRouteOutcomeTone,
  readRouteOutcome,
  type RouteOutcome
} from "../shared/route-outcome.js";

export interface DashboardOperatorEvidenceInput {
  descriptor: DashboardDescriptor;
  snapshot: DashboardSnapshot;
  generatedAt?: string;
}

export interface DashboardOperatorEvidence {
  schemaVersion: 1;
  generatedAt: string;
  descriptor: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  status: Record<string, unknown>;
  outputPolicy: {
    tokenFree: true;
    source: "allowlisted-dashboard-summary";
  };
}

const SECRET_TEXT_PATTERN = /\b(?:access[_-]?token|auth[_-]?token|api[_-]?key|password|secret|token)=([^\s&]+)/gi;
const SECRET_QUERY_PATTERN = /([?&])(?:access[_-]?token|auth[_-]?token|api[_-]?key|password|secret|token)=([^&\s]+)/gi;
const AUTH_HEADER_PATTERN = /\b(?:authorization|bearer|basic)\s+[-._~+/=A-Za-z0-9]+/gi;

export function createDashboardOperatorEvidence({
  descriptor,
  snapshot,
  generatedAt = snapshot.generatedAt
}: DashboardOperatorEvidenceInput): DashboardOperatorEvidence {
  const runtimeHealth = readRecord(snapshot.runtimeHealth) ?? {};
  const extension = summarizeExtension(readRecord(runtimeHealth.extension));
  const nativeHost = summarizeNativeHost(readRecord(runtimeHealth.nativeHost));
  const alerts = summarizeAlerts(snapshot.alerts);
  const smokeEvidence = summarizeSmokeEvidence(snapshot.smokeEvidence.artifacts);
  const readiness = summarizeReadiness(readRecord(snapshot.operatorReadiness));
  const currentTurn = summarizeCurrentTurn(readRecord(snapshot.currentTurn));
  const replay = summarizeReplay(readRecord(snapshot.replay));
  const inferredRouteOutcome = readRouteOutcome({
    currentTurn: readRecord(snapshot.currentTurn),
    replay: readRecord(snapshot.replay),
    defaultSource: "current-turn",
    includeCommandDetail: false,
    sanitizeString: sanitizeText
  });
  const routeOutcome = readExplicitRouteOutcome(snapshot.routeOutcome, inferredRouteOutcome);

  return {
    schemaVersion: 1,
    generatedAt: sanitizeText(generatedAt) ?? new Date().toISOString(),
    descriptor: {
      schemaVersion: descriptor.schemaVersion,
      url: descriptor.url,
      bind: { ...descriptor.bind },
      auth: {
        mode: descriptor.auth.mode,
        tokenPrinted: descriptor.auth.tokenPrinted
      },
      updates: { ...descriptor.updates },
      panelCount: descriptor.panels.length
    },
    snapshot: {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: sanitizeText(snapshot.generatedAt),
      currentTurn,
      routeOutcome,
      replay,
      readiness,
      alerts,
      extension,
      nativeHost,
      smokeEvidence
    },
    status: {
      state: readEvidenceState(readiness.state, alerts.bySeverity),
      dashboardUrl: descriptor.url,
      bind: { ...descriptor.bind },
      currentTurnState: currentTurn.state,
      routeOutcomeKind: routeOutcome.kind,
      routeOutcomeState: routeOutcome.state,
      routeOutcomeRouteLabel: routeOutcome.routeLabel,
      routeOutcomeDenialKind: routeOutcome.denialKind,
      routeOutcomePolicyKind: routeOutcome.policyKind,
      replayState: replay.state,
      readinessState: readiness.state,
      alertCount: alerts.total,
      errorAlertCount: alerts.bySeverity.error,
      warningAlertCount: alerts.bySeverity.warning,
      extensionState: extension.state,
      nativeHostState: nativeHost.state,
      smokeArtifactCount: smokeEvidence.total
    },
    outputPolicy: {
      tokenFree: true,
      source: "allowlisted-dashboard-summary"
    }
  };
}

function readExplicitRouteOutcome(
  value: unknown,
  fallback: RouteOutcome
): RouteOutcome {
  const record = readRecord(value);
  if (!record) {
    return fallback;
  }

  return {
    kind: isRouteOutcomeKind(record.kind) ? record.kind : fallback.kind,
    title: readSafeString(record.title, fallback.title) ?? fallback.title,
    value: readSafeString(record.value, fallback.value) ?? fallback.value,
    detail: readSafeString(record.detail, fallback.detail) ?? fallback.detail,
    tone: isRouteOutcomeTone(record.tone) ? record.tone : fallback.tone,
    source: readSafeString(record.source, fallback.source) ?? fallback.source,
    routeLabel: readSafeString(record.routeLabel, fallback.routeLabel) ?? fallback.routeLabel,
    state: readSafeString(record.state, fallback.state) ?? fallback.state,
    denialKind: readSafeString(record.denialKind, fallback.denialKind) ?? fallback.denialKind,
    policyKind: readSafeString(record.policyKind, fallback.policyKind) ?? fallback.policyKind
  };
}

function summarizeCurrentTurn(turn: Record<string, unknown> | undefined): Record<string, unknown> {
  return definedRecord({
    state: readSafeString(turn?.state, "unknown"),
    source: readSafeString(turn?.source),
    targetApp: readSafeString(turn?.targetApp),
    risk: readSafeString(turn?.risk),
    approvalState: readSafeString(turn?.approvalState),
    stopState: readSafeString(turn?.stopState)
  });
}

function summarizeReplay(replay: Record<string, unknown> | undefined): Record<string, unknown> {
  return definedRecord({
    state: readSafeString(replay?.state, "unknown"),
    source: readSafeString(replay?.source),
    screenshotCount: readFiniteNumber(replay?.screenshotCount),
    actionCount: readFiniteNumber(replay?.actionCount),
    verificationCount: readFiniteNumber(replay?.verificationCount)
  });
}

function summarizeReadiness(readiness: Record<string, unknown> | undefined): Record<string, unknown> {
  const commandSurface = summarizeReadinessCheck(readRecord(readiness?.commandSurface));
  const extension = summarizeReadinessCheck(readRecord(readiness?.extensionReadiness));
  const packagedBinary = summarizeReadinessCheck(readRecord(readiness?.packagedBinary));
  const recentSmokeEvidence = summarizeReadinessCheck(readRecord(readiness?.recentSmokeEvidence));
  const states = [
    commandSurface.state,
    extension.state,
    packagedBinary.state,
    recentSmokeEvidence.state
  ].filter((state): state is string => typeof state === "string");

  return {
    state: readSafeString(readiness?.state, "unknown"),
    checks: {
      commandSurface,
      extension,
      packagedBinary,
      recentSmokeEvidence
    },
    stateCounts: countStrings(states),
    smokeMissingTargets: readSafeStringArray(readRecord(readiness?.recentSmokeEvidence)?.missingTargets)
  };
}

function summarizeReadinessCheck(check: Record<string, unknown> | undefined): Record<string, unknown> {
  return definedRecord({
    state: readSafeString(check?.state, "unknown"),
    nativeHostState: readSafeString(check?.nativeHostState),
    signingState: readSafeString(check?.signingState)
  });
}

function summarizeAlerts(alerts: Array<Record<string, unknown>>): {
  total: number;
  bySeverity: Record<string, number>;
  codes: string[];
} {
  const codes: string[] = [];
  const severities: string[] = [];

  for (const alert of alerts) {
    const code = readSafeString(alert.code);
    const severity = readSafeString(alert.severity, "info");
    if (code) {
      codes.push(code);
    }
    if (severity) {
      severities.push(severity);
    }
  }

  return {
    total: alerts.length,
    bySeverity: {
      error: severities.filter((severity) => severity === "error").length,
      warning: severities.filter((severity) => severity === "warning").length,
      info: severities.filter((severity) => severity === "info").length
    },
    codes: [...new Set(codes)].sort()
  };
}

function summarizeExtension(extension: Record<string, unknown> | undefined): Record<string, unknown> {
  const connection = readRecord(extension?.connection);
  const hostPolicy = readRecord(extension?.hostPolicy);
  const policy = readRecord(hostPolicy?.policy);

  return definedRecord({
    state: readSafeString(extension?.state, "unknown"),
    bridge: readSafeString(extension?.bridge),
    liveConnection: readSafeString(extension?.liveConnection),
    nativeHostState: readSafeString(extension?.nativeHostState),
    allowedOriginCount: Array.isArray(extension?.allowedOrigins) ? extension.allowedOrigins.length : undefined,
    connection: connection ? definedRecord({
      state: readSafeString(connection.state),
      liveConnection: readSafeString(connection.liveConnection),
      ageSeconds: readFiniteNumber(connection.ageSeconds),
      observedAt: readSafeString(connection.observedAt),
      messageType: readSafeString(connection.messageType)
    }) : undefined,
    hostPolicy: hostPolicy ? definedRecord({
      state: readSafeString(hostPolicy.state),
      source: readSafeString(hostPolicy.source),
      updatedAt: readSafeString(hostPolicy.updatedAt),
      defaultMode: readSafeString(policy?.defaultMode),
      entryCount: Array.isArray(hostPolicy.entries) ? hostPolicy.entries.length : undefined,
      allowedHostCount: Array.isArray(policy?.allowedHosts) ? policy.allowedHosts.length : undefined,
      currentTurnAllowedHostCount: Array.isArray(policy?.currentTurnAllowedHosts)
        ? policy.currentTurnAllowedHosts.length
        : undefined,
      blockedHostCount: Array.isArray(policy?.blockedHosts) ? policy.blockedHosts.length : undefined
    }) : undefined
  });
}

function summarizeNativeHost(nativeHost: Record<string, unknown> | undefined): Record<string, unknown> {
  return definedRecord({
    state: readSafeString(nativeHost?.state, "unknown"),
    hostName: readSafeString(nativeHost?.hostName),
    allowedOriginCount: Array.isArray(nativeHost?.allowedOrigins) ? nativeHost.allowedOrigins.length : undefined
  });
}

function summarizeSmokeEvidence(artifacts: Array<Record<string, unknown>>): Record<string, unknown> {
  const targets = artifacts
    .map((artifact) => readSafeString(artifact.target))
    .filter((target): target is string => Boolean(target));
  const results = artifacts
    .map((artifact) => readSafeString(artifact.result, "unknown"))
    .filter((result): result is string => Boolean(result));
  const staleTargets = artifacts
    .filter((artifact) => artifact.stale === true)
    .map((artifact) => readSafeString(artifact.target))
    .filter((target): target is string => Boolean(target));
  const ageSeconds = artifacts
    .map((artifact) => readFiniteNumber(artifact.ageSeconds))
    .filter((age): age is number => typeof age === "number");

  return definedRecord({
    total: artifacts.length,
    passed: results.filter((result) => result === "passed").length,
    failed: results.filter((result) => result === "failed").length,
    stale: staleTargets.length,
    targets: [...new Set(targets)].sort(),
    staleTargets: [...new Set(staleTargets)].sort(),
    resultCounts: countStrings(results),
    newestAgeSeconds: ageSeconds.length > 0 ? Math.min(...ageSeconds) : undefined,
    oldestAgeSeconds: ageSeconds.length > 0 ? Math.max(...ageSeconds) : undefined
  });
}

function readEvidenceState(
  readinessState: unknown,
  alertCounts: Record<string, number>
): string {
  if (alertCounts.error > 0 || readinessState === "blocked") {
    return "blocked";
  }

  if (readinessState === "ready" && alertCounts.warning === 0) {
    return "ready";
  }

  return "needs-attention";
}

function countStrings(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function readSafeString(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  return sanitizeText(value) ?? fallback;
}

function readSafeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => readSafeString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function definedRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function sanitizeText(value: string): string | undefined {
  const sanitized = value
    .replace(SECRET_QUERY_PATTERN, "$1redacted-secret")
    .replace(SECRET_TEXT_PATTERN, "redacted-secret")
    .replace(AUTH_HEADER_PATTERN, "redacted-secret");

  return sanitized.length > 0 ? sanitized : undefined;
}
