import { readRecord, readString } from "./cli-record-utils.js";
import {
  sanitizeDashboardUrlForOutput,
  sanitizeSensitiveString,
  sanitizeTokenFree
} from "./cli-output-sanitize.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";
import {
  isRouteOutcomeKind,
  isRouteOutcomeTone,
  readRouteOutcome,
  type RouteOutcome
} from "../shared/route-outcome.js";

export function createDashboardProbeNotRunOutput({
  invocation,
  generatedAt
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }>;
  generatedAt: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt,
    executesSystemMutation: false,
    result: "not-run",
    url: sanitizeDashboardUrlForOutput(invocation.options.url),
    endpoints: createDashboardProbeEndpoints(invocation.options.url),
    fetch: {
      descriptor: { state: "unknown" },
      snapshot: { state: "unknown" },
      operatorEvidence: { state: "unknown" }
    },
    descriptor: { state: "unknown" },
    snapshot: { state: "unknown" },
    operatorEvidence: { state: "unknown" },
    operatorReadiness: { state: "unknown" },
    routeOutcome: { state: "unknown" }
  };
}

export function createDashboardStatusSnapshotSummary(
  probe: Record<string, unknown>,
  snapshot: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!snapshot) {
    return createDashboardFetchSummary(probe);
  }

  const runtimeHealth = readRecord(snapshot.runtimeHealth);
  const routeOutcome = createDashboardRouteOutcomeSummary(snapshot);
  const summary: Record<string, unknown> = {
    ...createDashboardFetchSummary(probe),
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    runtimeHealth: {
      dashboard: readRecord(runtimeHealth?.dashboard) ?? { state: "unknown" },
      cli: readRecord(runtimeHealth?.cli) ?? { state: "unknown" },
      extension: readRecord(runtimeHealth?.extension) ?? { state: "unknown" },
      nativeHost: readRecord(runtimeHealth?.nativeHost) ?? { state: "unknown" }
    },
    operatorReadiness: readRecord(snapshot.operatorReadiness) ?? { state: "unknown" },
    routeOutcome,
    smokeEvidence: readRecord(snapshot.smokeEvidence) ?? { artifacts: [] },
    alerts: Array.isArray(snapshot.alerts) ? snapshot.alerts : []
  };

  return sanitizeTokenFree(summary) as Record<string, unknown>;
}

export function createDashboardRouteOutcomeSummary(
  snapshot: Record<string, unknown>
): Record<string, unknown> {
  const explicit = readRecord(snapshot.routeOutcome);
  const hasRouteEvidence = hasDashboardRouteEvidence(snapshot);

  if (explicit) {
    if (!hasRouteEvidence) {
      return sanitizeTokenFree(explicit) as Record<string, unknown>;
    }

    return sanitizeTokenFree(mergeDashboardRouteOutcomeSummary(
      explicit,
      readDashboardRouteOutcomeFallback(snapshot)
    )) as Record<string, unknown>;
  }

  return sanitizeTokenFree(readDashboardRouteOutcomeFallback(snapshot)) as Record<string, unknown>;
}

function readDashboardRouteOutcomeFallback(snapshot: Record<string, unknown>): RouteOutcome {
  return readRouteOutcome({
    currentTurn: readRecord(snapshot.currentTurn),
    replay: readRecord(snapshot.replay),
    defaultSource: "dashboard-snapshot"
  });
}

function mergeDashboardRouteOutcomeSummary(
  explicit: Record<string, unknown>,
  fallback: RouteOutcome
): RouteOutcome {
  const denialKind = readString(explicit.denialKind) ?? fallback.denialKind;
  const policyKind = readString(explicit.policyKind) ?? fallback.policyKind;

  return {
    kind: isRouteOutcomeKind(explicit.kind) ? explicit.kind : fallback.kind,
    title: readString(explicit.title) ?? fallback.title,
    value: readString(explicit.value) ?? fallback.value,
    detail: readString(explicit.detail) ?? fallback.detail,
    tone: isRouteOutcomeTone(explicit.tone) ? explicit.tone : fallback.tone,
    source: readString(explicit.source) ?? fallback.source,
    routeLabel: readString(explicit.routeLabel) ?? fallback.routeLabel,
    state: readString(explicit.state) ?? fallback.state,
    ...(denialKind ? { denialKind } : {}),
    ...(policyKind ? { policyKind } : {})
  };
}

function hasDashboardRouteEvidence(snapshot: Record<string, unknown>): boolean {
  return hasRecordEntries(readRecord(snapshot.currentTurn)) || hasRecordEntries(readRecord(snapshot.replay));
}

function hasRecordEntries(value: Record<string, unknown> | undefined): boolean {
  return value ? Object.keys(value).length > 0 : false;
}

export function createDashboardFetchSummary(probe: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    state: readString(probe.state) ?? "unknown"
  };
  const url = readString(probe.url);
  const reason = readString(probe.reason);

  if (url) {
    summary.url = sanitizeDashboardUrlForOutput(url);
  }
  if (typeof probe.status === "number") {
    summary.status = probe.status;
  }
  if (reason) {
    summary.reason = sanitizeSensitiveString(reason);
  }

  return summary;
}

export function createDashboardProbeEndpoints(dashboardUrl: string): Record<string, string> {
  const endpoints: Record<string, string> = {};
  const descriptorUrl = createDashboardDescriptorUrl(dashboardUrl);
  const snapshotUrl = createDashboardSnapshotUrl(dashboardUrl);

  if (descriptorUrl) {
    endpoints.descriptor = sanitizeDashboardUrlForOutput(descriptorUrl);
  }
  if (snapshotUrl) {
    endpoints.snapshot = sanitizeDashboardUrlForOutput(snapshotUrl);
  }
  const operatorEvidenceUrl = createDashboardOperatorEvidenceUrl(dashboardUrl);
  if (operatorEvidenceUrl) {
    endpoints.operatorEvidence = sanitizeDashboardUrlForOutput(operatorEvidenceUrl);
  }

  return endpoints;
}

export function createDashboardDescriptorUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/descriptor.json", dashboardUrl);
}

export function createDashboardSnapshotUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/snapshot.json", dashboardUrl);
}

export function createDashboardOperatorEvidenceUrl(
  dashboardUrl: string | undefined
): string | undefined {
  return createDashboardRelativeUrl("/api/operator-evidence", dashboardUrl);
}

export function createDashboardApiUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/api/chrome-host-policy", dashboardUrl);
}

function createDashboardRelativeUrl(
  pathname: string,
  dashboardUrl: string | undefined
): string | undefined {
  if (!dashboardUrl) {
    return undefined;
  }

  try {
    return new URL(pathname, dashboardUrl).toString();
  } catch {
    return undefined;
  }
}
