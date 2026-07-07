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
  const dashboardSmoke = readRecord(evidence?.dashboardSmoke);
  const lines = [
    "skfiy status",
    `readiness: ${readString(readiness?.state) ?? "unknown"}`,
    `binary: ${formatBinaryReadinessText(binary)}`,
    `extension page control: ${formatPageControlText(pageControl)}`,
    `runtime-snapshot: ${formatRuntimeSnapshotText(runtimeSnapshot)}`,
    `current-turn: ${formatCurrentTurnText(currentTurn)}`,
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

function formatDashboardSmokeText(dashboardSmoke: Record<string, unknown> | undefined): string {
  const parts = [
    `state=${readString(dashboardSmoke?.state) ?? "missing"}`,
    readString(dashboardSmoke?.path) ? `path=${readString(dashboardSmoke?.path)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}
