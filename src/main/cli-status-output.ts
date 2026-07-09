import {
  readNumber,
  readRecord,
  readString
} from "./cli-record-utils.js";

export function formatStatusTextOutput(output: Record<string, unknown>): string {
  const evidence = readRecord(output.evidence);
  const readiness = readRecord(output.readiness);
  const binary = readRecord(evidence?.binaryReadiness);
  const pageControl = readRecord(evidence?.extensionPageControl);
  const runtimeSnapshot = readRecord(evidence?.runtimeSnapshot);
  const currentTurn = readRecord(evidence?.currentTurn);
  const routeOutcome = readRecord(runtimeSnapshot?.routeOutcome);
  const dashboardSmoke = readRecord(evidence?.dashboardSmoke);
  const lines = [
    "skfiy status",
    `readiness: ${readString(readiness?.state) ?? "unknown"}`,
    `binary: ${formatBinaryReadinessText(binary)}`,
    `extension page control: ${formatPageControlText(pageControl)}`,
    `runtime-snapshot: ${formatRuntimeSnapshotText(runtimeSnapshot)}`,
    `current-turn: ${formatCurrentTurnText(currentTurn)}`,
    `route-outcome: ${formatRouteOutcomeText(routeOutcome)}`,
    `dashboard smoke: ${formatDashboardSmokeText(dashboardSmoke)}`
  ];

  return `${lines.join("\n")}\n`;
}

function formatBinaryReadinessText(binary: Record<string, unknown> | undefined): string {
  const app = readRecord(binary?.app);
  const cli = readRecord(binary?.cli);
  const helper = readRecord(binary?.helper);

  return `state=${readString(binary?.state) ?? "unknown"} app=${readString(app?.state) ?? "unknown"} cli=${readString(cli?.state) ?? "unknown"} helper=${readString(helper?.state) ?? "unknown"}`;
}

function formatPageControlText(pageControl: Record<string, unknown> | undefined): string {
  return `state=${readString(pageControl?.state) ?? "unknown"} source=${readString(pageControl?.source) ?? "unknown"}`;
}

function formatRuntimeSnapshotText(runtimeSnapshot: Record<string, unknown> | undefined): string {
  const ageSeconds = readNumber(runtimeSnapshot?.ageSeconds);
  const markerAgeSeconds = readNumber(runtimeSnapshot?.markerAgeSeconds);
  const parts = [
    readString(runtimeSnapshot?.state) ?? "unknown",
    ageSeconds !== undefined ? `age=${ageSeconds}s` : undefined,
    markerAgeSeconds !== undefined ? `marker-age=${markerAgeSeconds}s` : undefined,
    readString(runtimeSnapshot?.path) ? `path=${readString(runtimeSnapshot?.path)}` : undefined,
    readString(runtimeSnapshot?.markerPath) ? `marker=${readString(runtimeSnapshot?.markerPath)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}

function formatCurrentTurnText(currentTurn: Record<string, unknown> | undefined): string {
  const command = readString(currentTurn?.command);
  const targetApp = readString(currentTurn?.targetApp);
  const latestMessage = readString(currentTurn?.latestMessage);
  const parts = [
    readString(currentTurn?.state) ?? "unknown",
    targetApp ? `target=${targetApp}` : undefined,
    readString(currentTurn?.approvalState) ? `approval=${readString(currentTurn?.approvalState)}` : undefined,
    readString(currentTurn?.stopState) ? `stop=${readString(currentTurn?.stopState)}` : undefined,
    readString(currentTurn?.updateSource) ? `source=${readString(currentTurn?.updateSource)}` : undefined,
    command ? `command=${JSON.stringify(command)}` : undefined,
    latestMessage ? `message=${JSON.stringify(latestMessage)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}

function formatRouteOutcomeText(routeOutcome: Record<string, unknown> | undefined): string {
  const kind = readString(routeOutcome?.kind) ?? readString(routeOutcome?.value) ?? "unknown";
  const state = readString(routeOutcome?.state);
  const routeLabel = readString(routeOutcome?.routeLabel);
  const tone = readString(routeOutcome?.tone);
  const source = readString(routeOutcome?.source);
  const denialKind = readString(routeOutcome?.denialKind);
  const policyKind = readString(routeOutcome?.policyKind);
  const detail = readString(routeOutcome?.detail);
  const parts = [
    kind,
    state ? `state=${state}` : undefined,
    routeLabel ? `route=${routeLabel}` : undefined,
    tone ? `tone=${tone}` : undefined,
    source ? `source=${source}` : undefined,
    denialKind ? `denial=${denialKind}` : undefined,
    policyKind ? `policy=${policyKind}` : undefined,
    detail ? `detail=${JSON.stringify(detail)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}

function formatDashboardSmokeText(dashboardSmoke: Record<string, unknown> | undefined): string {
  const parts = [
    `state=${readString(dashboardSmoke?.state) ?? "missing"}`,
    readString(dashboardSmoke?.path) ? `path=${readString(dashboardSmoke?.path)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}
