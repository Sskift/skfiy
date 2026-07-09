import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import path from "node:path";
import {
  RUNTIME_TURN_MARKER_SCHEMA_VERSION,
  createRuntimeSnapshotStatePath,
  createRuntimeTurnMarkerStatePath
} from "./runtime-snapshot.js";
import {
  compactRecord,
  readBoolean,
  readErrorMessage,
  readNumber,
  readRecord,
  readString
} from "./cli-record-utils.js";
import { sanitizeSensitiveString } from "./cli-output-sanitize.js";
import { createChromePageControlCapability } from "./cli-chrome-capabilities.js";
import { createBinaryReadinessEvidence } from "./cli-status-readiness.js";
import {
  isRouteOutcomeKind,
  isRouteOutcomeTone,
  readRouteOutcome,
  type RouteOutcome
} from "../shared/route-outcome.js";

const RUNTIME_EVIDENCE_RECENT_SECONDS = 300;
const RUNTIME_EVIDENCE_SKEW_SECONDS = 5;

export interface CliStatusEvidenceContext {
  rootDir: string;
  homeDir: string;
  appPath: string;
  helperPath: string;
  cliShimPath: string;
  extensionIds: string[];
  generatedAt: string;
}

export function withCliStatusEvidence<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: CliStatusEvidenceContext
): TStatus & { evidence: Record<string, unknown>; runtimeSnapshot: Record<string, unknown> } {
  const evidence = createCliStatusEvidence(status, context);
  const runtimeSnapshot = readRecord(evidence.runtimeSnapshot) ?? {
    state: "unknown",
    reason: "CLI status evidence did not include runtime snapshot details."
  };

  return {
    ...status,
    evidence,
    runtimeSnapshot
  };
}

export function createCliStatusEvidence(
  status: Record<string, unknown>,
  context: CliStatusEvidenceContext
): Record<string, unknown> {
  const extension = readRecord(status.extension);
  const runtimeSnapshot = readRuntimeSnapshotEvidence(context.homeDir, context.generatedAt);
  const dashboardSmoke = readLatestDashboardSmokeEvidence(context.rootDir, context.generatedAt);

  return {
    schemaVersion: 1,
    source: "skfiy-status-local-evidence",
    binaryReadiness: createBinaryReadinessEvidence(status, context),
    extensionPageControl: readRecord(extension?.pageControl)
      ?? createChromePageControlCapability({
        extensionState: "unknown",
        nativeHostState: "unknown",
        liveConnection: "unknown",
        extensionIds: context.extensionIds
      }),
    runtimeSnapshot,
    currentTurn: runtimeSnapshot.currentTurn,
    dashboardSmoke
  };
}

export function readRuntimeSnapshotEvidence(homeDir: string, generatedAt: string): Record<string, unknown> {
  if (!homeDir) {
    const currentTurn = {
      state: "unknown",
      source: "runtime-snapshot"
    };
    const replay = {
      state: "empty",
      source: "runtime-snapshot"
    };

    return {
      state: "not-probed",
      currentTurn,
      routeOutcome: summarizeRouteOutcome(undefined, currentTurn, replay),
      replay,
      reason: "Home directory is required to locate the runtime snapshot."
    };
  }

  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  const turnMarker = readRuntimeTurnMarkerEvidence(homeDir, generatedAt);
  if (!existsSync(snapshotPath)) {
    const markerState = readString(turnMarker?.state);
    if (markerState === "recent" || markerState === "stale") {
      const state = markerState === "recent" ? "missing-after-turn" : "stale-after-turn";
      const emptyReasonCode = state === "missing-after-turn"
        ? "runtime-snapshot-missing-after-turn"
        : "runtime-snapshot-stale-after-turn";
      const reason = markerState === "recent"
        ? "Runtime snapshot is missing even though a recent runtime turn marker exists."
        : "Runtime snapshot is missing and the last runtime turn marker is stale.";
      const currentTurn = readRecord(turnMarker?.currentTurn);
      const summarizedCurrentTurn = {
        ...(currentTurn ?? {
          state: "unknown",
          source: "runtime-turn-marker"
        }),
        emptyReasonCode,
        reason
      };
      const replay = {
        state: "empty",
        source: "runtime-snapshot",
        emptyReasonCode,
        reason
      };

      return compactRecord({
        state,
        path: snapshotPath,
        marker: turnMarker,
        markerPath: readString(turnMarker?.path),
        markerObservedAt: readString(turnMarker?.observedAt),
        markerAgeSeconds: readNumber(turnMarker?.ageSeconds),
        emptyReasonCode,
        reason,
        currentTurn: summarizedCurrentTurn,
        routeOutcome: summarizeRouteOutcome(undefined, summarizedCurrentTurn, replay),
        replay
      });
    }

    const currentTurn = {
      state: "idle",
      source: "runtime-snapshot",
      freshInstall: true,
      emptyReasonCode: "runtime-snapshot-missing"
    };
    const replay = {
      state: "empty",
      source: "runtime-snapshot",
      freshInstall: true,
      emptyReasonCode: "runtime-snapshot-missing"
    };

    return {
      state: "missing",
      path: snapshotPath,
      freshInstall: true,
      emptyReasonCode: "runtime-snapshot-missing",
      reason: "Runtime snapshot has not been recorded yet.",
      currentTurn,
      routeOutcome: summarizeRouteOutcome(undefined, currentTurn, replay),
      replay
    };
  }

  try {
    const parsed = readRecord(JSON.parse(readFileSync(snapshotPath, "utf8")));
    const currentTurn = readRecord(parsed?.currentTurn);
    const replay = readRecord(parsed?.replay);

    if (parsed?.schemaVersion !== 1 || !currentTurn || !replay) {
      const invalidCurrentTurn = {
        state: "unknown",
        source: "runtime-snapshot"
      };

      return {
        state: "invalid",
        path: snapshotPath,
        currentTurn: invalidCurrentTurn,
        routeOutcome: summarizeRouteOutcome(undefined, invalidCurrentTurn, undefined),
        reason: "Runtime snapshot is not a valid skfiy snapshot."
      };
    }

    const observedAt = readString(parsed.observedAt);
    const ageSeconds = readObservedAgeSeconds(observedAt, generatedAt);
    const staleByAge = ageSeconds !== undefined && ageSeconds > RUNTIME_EVIDENCE_RECENT_SECONDS;
    const staleByMarker = isRuntimeMarkerNewerThanSnapshot(turnMarker, observedAt);
    const state = staleByAge || staleByMarker ? "stale-after-turn" : "available";

    const summarizedCurrentTurn = summarizeRuntimeCurrentTurn(currentTurn);
    const summarizedReplay = summarizeRuntimeReplay(replay);

    return compactRecord({
      state,
      path: snapshotPath,
      observedAt,
      ageSeconds,
      marker: turnMarker,
      markerPath: readString(turnMarker?.path),
      markerObservedAt: readString(turnMarker?.observedAt),
      markerAgeSeconds: readNumber(turnMarker?.ageSeconds),
      reason: state === "stale-after-turn"
        ? "Runtime snapshot is older than the latest runtime turn evidence."
        : undefined,
      currentTurn: summarizedCurrentTurn,
      routeOutcome: summarizeRouteOutcome(readRecord(parsed?.routeOutcome), currentTurn, replay),
      replay: summarizedReplay
    });
  } catch (error) {
    const currentTurn = {
      state: "unknown",
      source: "runtime-snapshot"
    };

    return {
      state: "invalid",
      path: snapshotPath,
      currentTurn,
      routeOutcome: summarizeRouteOutcome(undefined, currentTurn, undefined),
      reason: readErrorMessage(error)
    };
  }
}

export function readLatestDashboardSmokeEvidence(
  rootDir: string,
  generatedAt: string
): Record<string, unknown> {
  const smokeDir = path.join(rootDir, ".skfiy-smoke");

  if (!existsSync(smokeDir)) {
    return {
      state: "missing",
      directory: smokeDir,
      reason: "No dashboard smoke artifact has been collected yet."
    };
  }

  const candidates: Array<{
    artifact: Record<string, unknown>;
    filePath: string;
    mtimeMs: number;
  }> = [];

  try {
    for (const entry of readdirSync(smokeDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(smokeDir, entry.name);
      const artifact = readSmokeArtifactFile(filePath);

      if (!artifact || !isDashboardSmokeArtifact(entry.name, artifact)) {
        continue;
      }

      candidates.push({
        artifact,
        filePath,
        mtimeMs: statSync(filePath).mtimeMs
      });
    }
  } catch (error) {
    return {
      state: "unavailable",
      directory: smokeDir,
      reason: readErrorMessage(error)
    };
  }

  const latest = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!latest) {
    return {
      state: "missing",
      directory: smokeDir,
      reason: "No dashboard smoke artifact has been collected yet."
    };
  }

  return createDashboardSmokeEvidenceSummary(latest, generatedAt);
}

function readRuntimeTurnMarkerEvidence(
  homeDir: string,
  generatedAt: string
): Record<string, unknown> | undefined {
  const markerPath = createRuntimeTurnMarkerStatePath(homeDir);
  if (!existsSync(markerPath)) {
    return undefined;
  }

  try {
    const parsed = readRecord(JSON.parse(readFileSync(markerPath, "utf8")));
    if (!parsed) {
      return {
        state: "invalid",
        path: markerPath,
        reason: "Runtime turn marker is not a JSON object."
      };
    }
    if (parsed.schemaVersion !== RUNTIME_TURN_MARKER_SCHEMA_VERSION) {
      return {
        state: "invalid",
        path: markerPath,
        reason: "Runtime turn marker is not a valid skfiy marker."
      };
    }

    const stat = statSync(markerPath);
    const observedAt =
      readString(parsed.observedAt)
      ?? readString(parsed.updatedAt)
      ?? readString(parsed.lastTurnAt);
    const ageSeconds =
      readObservedAgeSeconds(observedAt, generatedAt)
      ?? readArtifactAgeSeconds(stat.mtimeMs, generatedAt);
    const currentTurn = summarizeRuntimeTurnMarkerCurrentTurn(parsed);
    const recent = ageSeconds !== undefined && ageSeconds <= RUNTIME_EVIDENCE_RECENT_SECONDS;

    return compactRecord({
      state: recent ? "recent" : "stale",
      path: markerPath,
      observedAt,
      mtimeMs: stat.mtimeMs,
      ageSeconds,
      recent,
      currentTurn
    });
  } catch (error) {
    return {
      state: "invalid",
      path: markerPath,
      reason: readErrorMessage(error)
    };
  }
}

function summarizeRuntimeTurnMarkerCurrentTurn(marker: Record<string, unknown>): Record<string, unknown> {
  const nestedTurn =
    readRecord(marker.currentTurn)
    ?? readRecord(marker.turn)
    ?? readRecord(marker.event)
    ?? marker;
  const state = readString(nestedTurn.state) ?? readString(nestedTurn.status) ?? "unknown";
  const latestMessage = readString(nestedTurn.latestMessage) ?? readString(nestedTurn.message);

  return summarizeRuntimeCurrentTurn({
    ...nestedTurn,
    state,
    source: "runtime-turn-marker",
    ...(latestMessage ? { latestMessage } : {})
  });
}

function isRuntimeMarkerNewerThanSnapshot(
  marker: Record<string, unknown> | undefined,
  snapshotObservedAt: string | undefined
): boolean {
  const markerObservedAt = readString(marker?.observedAt);
  if (readString(marker?.state) !== "recent" || !markerObservedAt || !snapshotObservedAt) {
    return false;
  }

  const markerMs = Date.parse(markerObservedAt);
  const snapshotMs = Date.parse(snapshotObservedAt);
  if (!Number.isFinite(markerMs) || !Number.isFinite(snapshotMs)) {
    return false;
  }

  return markerMs - snapshotMs > RUNTIME_EVIDENCE_SKEW_SECONDS * 1000;
}

function summarizeRuntimeCurrentTurn(currentTurn: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    state: readString(currentTurn.state) ?? "unknown",
    source: readString(currentTurn.source) ?? "runtime-snapshot",
    command: sanitizeStatusEvidenceString(readString(currentTurn.command)),
    route: sanitizeStatusEvidenceString(readString(currentTurn.route)),
    targetRoute: sanitizeStatusEvidenceString(readString(currentTurn.targetRoute)),
    targetApp: sanitizeStatusEvidenceString(readString(currentTurn.targetApp)),
    targetBundleId: readString(currentTurn.targetBundleId),
    risk: readString(currentTurn.risk),
    routeReason: sanitizeStatusEvidenceString(readString(currentTurn.routeReason)),
    reason: sanitizeStatusEvidenceString(readString(currentTurn.reason)),
    denialKind: readString(currentTurn.denialKind),
    policyKind: readString(currentTurn.policyKind),
    approvalRequired: readBoolean(currentTurn.approvalRequired),
    approvalState: readString(currentTurn.approvalState),
    stopState: readString(currentTurn.stopState),
    updateSource: readString(currentTurn.updateSource),
    latestToolStatus: readString(currentTurn.latestToolStatus),
    latestMessage: sanitizeStatusEvidenceString(readString(currentTurn.latestMessage)),
    latestAction: summarizeNamedStatusRecord(readRecord(currentTurn.latestAction), ["type", "action", "stage", "status"]),
    latestVerification: summarizeNamedStatusRecord(readRecord(currentTurn.latestVerification), ["actionType", "status", "message", "reason"]),
    latestScreenshot: summarizeNamedStatusRecord(readRecord(currentTurn.latestScreenshot), ["stage", "bundleId", "recommendation", "sourceCount"])
  });
}

function summarizeRuntimeReplay(replay: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    state: readString(replay.state) ?? "unknown",
    source: readString(replay.source) ?? "runtime-snapshot",
    outcome: readString(replay.outcome),
    screenshotCount: readNumber(replay.screenshotCount),
    actionCount: readNumber(replay.actionCount),
    verificationCount: readNumber(replay.verificationCount),
    timelineCount: readNumber(replay.timelineCount),
    latestMessage: sanitizeStatusEvidenceString(readString(replay.latestMessage)),
    latestToolCall: summarizeNamedStatusRecord(
      readRecord(replay.latestToolCall),
      ["type", "route", "status", "summary", "evidenceSummary", "artifactCount"]
    )
  });
}

function summarizeRouteOutcome(
  routeOutcome: Record<string, unknown> | undefined,
  currentTurn: Record<string, unknown> | undefined,
  replay: Record<string, unknown> | undefined
): Record<string, unknown> {
  const inferredRouteOutcome = readRouteOutcome({
    currentTurn,
    replay,
    defaultSource: "runtime-snapshot",
    includeCommandDetail: false,
    sanitizeString: sanitizeStatusEvidenceString
  });
  const outcome = readExplicitRouteOutcome(routeOutcome, inferredRouteOutcome);

  return compactRecord({
    kind: readString(outcome.kind),
    title: sanitizeStatusEvidenceString(readString(outcome.title)),
    value: sanitizeStatusEvidenceString(readString(outcome.value)),
    detail: sanitizeStatusEvidenceString(readString(outcome.detail)),
    tone: readString(outcome.tone),
    source: sanitizeStatusEvidenceString(readString(outcome.source)),
    routeLabel: sanitizeStatusEvidenceString(readString(outcome.routeLabel)),
    state: sanitizeStatusEvidenceString(readString(outcome.state)),
    denialKind: sanitizeStatusEvidenceString(readString(outcome.denialKind)),
    policyKind: sanitizeStatusEvidenceString(readString(outcome.policyKind))
  });
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
    title: readSafeStatusEvidenceString(record.title, fallback.title) ?? fallback.title,
    value: readSafeStatusEvidenceString(record.value, fallback.value) ?? fallback.value,
    detail: readSafeStatusEvidenceString(record.detail, fallback.detail) ?? fallback.detail,
    tone: isRouteOutcomeTone(record.tone) ? record.tone : fallback.tone,
    source: readSafeStatusEvidenceString(record.source, fallback.source) ?? fallback.source,
    routeLabel: readSafeStatusEvidenceString(record.routeLabel, fallback.routeLabel) ?? fallback.routeLabel,
    state: readSafeStatusEvidenceString(record.state, fallback.state) ?? fallback.state,
    denialKind: readSafeStatusEvidenceString(record.denialKind, fallback.denialKind) ?? fallback.denialKind,
    policyKind: readSafeStatusEvidenceString(record.policyKind, fallback.policyKind) ?? fallback.policyKind
  };
}

function summarizeNamedStatusRecord(
  record: Record<string, unknown> | undefined,
  keys: string[]
): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  const summary: Record<string, unknown> = {};
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      summary[key] = sanitizeStatusEvidenceString(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readSmokeArtifactFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return readRecord(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

function isDashboardSmokeArtifact(fileName: string, artifact: Record<string, unknown>): boolean {
  return fileName.startsWith("dashboard") || readString(artifact.target) === "dashboard";
}

function createDashboardSmokeEvidenceSummary(
  latest: {
    artifact: Record<string, unknown>;
    filePath: string;
    mtimeMs: number;
  },
  generatedAt: string
): Record<string, unknown> {
  const snapshot = readRecord(readRecord(latest.artifact.snapshotResponse)?.body);
  const runtimeSnapshot = readRecord(readRecord(snapshot?.runtimeHealth)?.runtimeSnapshot);
  const smokeEvidence = readRecord(snapshot?.smokeEvidence);
  const artifacts = Array.isArray(smokeEvidence?.artifacts)
    ? smokeEvidence.artifacts.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
  const ageSeconds = readArtifactAgeSeconds(latest.mtimeMs, generatedAt);
  const result = readString(latest.artifact.result) ?? "unknown";

  return compactRecord({
    state: result,
    result,
    path: latest.filePath,
    timestamp: readString(latest.artifact.timestamp),
    productPath: readString(latest.artifact.productPath),
    mtimeMs: latest.mtimeMs,
    ageSeconds,
    runtimeSnapshotCoverage: summarizeNamedStatusRecord(
      readRecord(latest.artifact.runtimeSnapshotCoverage),
      ["result", "reason"]
    ),
    dashboardSnapshot: compactRecord({
      state: readString(readRecord(snapshot?.runtimeHealth)?.dashboard ? "available" : undefined),
      runtimeSnapshotState: readString(runtimeSnapshot?.state),
      currentTurn: summarizeRuntimeCurrentTurn(readRecord(snapshot?.currentTurn) ?? {}),
      replay: summarizeRuntimeReplay(readRecord(snapshot?.replay) ?? {}),
      smokeTargets: artifacts.map((artifact) => readString(artifact.target)).filter(Boolean),
      alertCount: Array.isArray(snapshot?.alerts) ? snapshot.alerts.length : undefined
    })
  });
}

function readArtifactAgeSeconds(mtimeMs: number, generatedAt: string): number | undefined {
  const generatedAtMs = Date.parse(generatedAt);

  return Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((generatedAtMs - mtimeMs) / 1000))
    : undefined;
}

function readObservedAgeSeconds(observedAt: string | undefined, generatedAt: string): number | undefined {
  if (!observedAt) {
    return undefined;
  }

  const observedAtMs = Date.parse(observedAt);
  const generatedAtMs = Date.parse(generatedAt);

  return Number.isFinite(observedAtMs) && Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.round((generatedAtMs - observedAtMs) / 1000))
    : undefined;
}

function sanitizeStatusEvidenceString(value: string | undefined): string | undefined {
  return value ? sanitizeSensitiveString(value) : undefined;
}

function readSafeStatusEvidenceString(value: unknown, fallback?: string): string | undefined {
  return sanitizeStatusEvidenceString(readString(value)) ?? fallback;
}
