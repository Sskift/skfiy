export type RouteOutcomeTone = "success" | "warning" | "danger" | "neutral";

export type RouteOutcomeKind =
  | "idle"
  | "running"
  | "approval_required"
  | "needs_confirmation"
  | "needs_clarification"
  | "app_policy_denied"
  | "chrome_host_policy_denied"
  | "user_denied"
  | "blocked"
  | "cancelled"
  | "stopped"
  | "failed"
  | "completed"
  | "unknown";

export const ROUTE_OUTCOME_KINDS: readonly RouteOutcomeKind[] = [
  "idle",
  "running",
  "approval_required",
  "needs_confirmation",
  "needs_clarification",
  "app_policy_denied",
  "chrome_host_policy_denied",
  "user_denied",
  "blocked",
  "cancelled",
  "stopped",
  "failed",
  "completed",
  "unknown"
];

export const ROUTE_OUTCOME_TONES: readonly RouteOutcomeTone[] = [
  "success",
  "warning",
  "danger",
  "neutral"
];

export interface RouteOutcome {
  kind: RouteOutcomeKind;
  title: string;
  value: string;
  detail: string;
  tone: RouteOutcomeTone;
  source: string;
  routeLabel: string;
  state: string;
}

export interface RouteOutcomeInput {
  currentTurn?: Record<string, unknown>;
  replay?: Record<string, unknown>;
  defaultSource?: string;
  includeCommandDetail?: boolean;
  sanitizeString?: (value: string) => string | undefined;
}

export function isRouteOutcomeKind(value: unknown): value is RouteOutcomeKind {
  return typeof value === "string" && ROUTE_OUTCOME_KINDS.includes(value as RouteOutcomeKind);
}

export function isRouteOutcomeTone(value: unknown): value is RouteOutcomeTone {
  return typeof value === "string" && ROUTE_OUTCOME_TONES.includes(value as RouteOutcomeTone);
}

export function readRouteOutcome({
  currentTurn,
  replay,
  defaultSource = "Current turn",
  includeCommandDetail = true,
  sanitizeString
}: RouteOutcomeInput): RouteOutcome {
  const state = readString(currentTurn?.state, sanitizeString) ?? "idle";
  const approvalState = readString(currentTurn?.approvalState, sanitizeString);
  const routeSignal = readRouteLabel(currentTurn, replay, sanitizeString);
  const routeLabel = routeSignal ?? "unknown";
  const source = readString(currentTurn?.source, sanitizeString) ?? defaultSource;
  const detail = readRouteDetail({ currentTurn, replay, includeCommandDetail, sanitizeString });
  const classifierText = [
    readString(currentTurn?.denialKind, sanitizeString),
    readString(currentTurn?.routeReason, sanitizeString),
    readString(currentTurn?.reason, sanitizeString),
    readString(currentTurn?.latestMessage, sanitizeString),
    readString(currentTurn?.message, sanitizeString),
    detail,
    readString(currentTurn?.updateSource, sanitizeString)
  ].filter(Boolean).join(" ").toLowerCase();

  if (state === "idle" && !routeSignal && !readString(currentTurn?.command, sanitizeString)) {
    return createRouteOutcome({
      kind: "idle",
      title: "No active route",
      state,
      value: "idle",
      detail,
      tone: "neutral",
      source,
      routeLabel
    });
  }

  if (state === "approval_required") {
    return createRouteOutcome({
      kind: "approval_required",
      title: "Route approval required",
      state,
      value: "approval_required",
      detail,
      tone: "warning",
      source,
      routeLabel
    });
  }

  if (state === "needs_confirmation") {
    return createRouteOutcome({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      state,
      value: "needs_confirmation",
      detail,
      tone: "warning",
      source,
      routeLabel
    });
  }

  if (state === "needs_clarification") {
    return createRouteOutcome({
      kind: "needs_clarification",
      title: "Route needs clarification",
      state,
      value: "needs_clarification",
      detail,
      tone: "warning",
      source,
      routeLabel
    });
  }

  if (state === "blocked" && isAppPolicyDenial(classifierText, currentTurn, sanitizeString)) {
    return createRouteOutcome({
      kind: "app_policy_denied",
      title: "App policy denied route",
      state,
      value: "app_policy_denied",
      detail,
      tone: "danger",
      source,
      routeLabel
    });
  }

  if (state === "blocked" && isChromeHostPolicyDenial(classifierText, currentTurn, sanitizeString)) {
    return createRouteOutcome({
      kind: "chrome_host_policy_denied",
      title: "Chrome host policy denied route",
      state,
      value: "chrome_host_policy_denied",
      detail,
      tone: "danger",
      source,
      routeLabel
    });
  }

  if (state === "denied" || (state === "blocked" && isUserDenial(currentTurn, sanitizeString))) {
    return createRouteOutcome({
      kind: "user_denied",
      title: "User denied route",
      state,
      value: "user_denied",
      detail,
      tone: "neutral",
      source,
      routeLabel
    });
  }

  if (state === "blocked") {
    return createRouteOutcome({
      kind: "blocked",
      title: classifierText.includes("route policy") ? "Route policy blocked" : "Route blocked",
      state,
      value: "blocked",
      detail,
      tone: "danger",
      source,
      routeLabel
    });
  }

  if (state === "cancelled" && isStopTurnOutcome(classifierText, currentTurn, replay, sanitizeString)) {
    return createRouteOutcome({
      kind: "stopped",
      title: "Route stopped",
      state,
      value: "stopped",
      detail,
      tone: "neutral",
      source,
      routeLabel
    });
  }

  if (state === "cancelled") {
    return createRouteOutcome({
      kind: "cancelled",
      title: "Route cancelled",
      state,
      value: "cancelled",
      detail,
      tone: "neutral",
      source,
      routeLabel
    });
  }

  if (state === "failed") {
    return createRouteOutcome({
      kind: "failed",
      title: "Route failed",
      state,
      value: "failed",
      detail,
      tone: "danger",
      source,
      routeLabel
    });
  }

  if (state === "completed") {
    return createRouteOutcome({
      kind: "completed",
      title: "Route completed",
      state,
      value: "completed",
      detail,
      tone: "success",
      source,
      routeLabel
    });
  }

  if (["planned", "observing", "executing", "running"].includes(state)) {
    return createRouteOutcome({
      kind: "running",
      title: "Route running",
      state,
      value: state,
      detail,
      tone: "warning",
      source,
      routeLabel
    });
  }

  if (
    approvalState === "required"
    || approvalState === "pending"
    || currentTurn?.approvalRequired === true
  ) {
    return createRouteOutcome({
      kind: "approval_required",
      title: "Route approval required",
      state,
      value: "approval_required",
      detail,
      tone: "warning",
      source,
      routeLabel
    });
  }

  return createRouteOutcome({
    kind: "unknown",
    title: "Route state unknown",
    state,
    value: state,
    detail,
    tone: "neutral",
    source,
    routeLabel
  });
}

function createRouteOutcome(outcome: RouteOutcome): RouteOutcome {
  return outcome;
}

function isAppPolicyDenial(
  classifierText: string,
  currentTurn: Record<string, unknown> | undefined,
  sanitizeString?: (value: string) => string | undefined
): boolean {
  return classifierText.includes("denied by app policy")
    || readString(currentTurn?.denialKind, sanitizeString) === "app_policy"
    || readString(currentTurn?.policyKind, sanitizeString) === "app-policy";
}

function isChromeHostPolicyDenial(
  classifierText: string,
  currentTurn: Record<string, unknown> | undefined,
  sanitizeString?: (value: string) => string | undefined
): boolean {
  return classifierText.includes("chrome host policy blocked")
    || classifierText.includes("chrome-host-policy")
    || readString(currentTurn?.policyKind, sanitizeString) === "chrome-host-policy";
}

function isUserDenial(
  currentTurn: Record<string, unknown> | undefined,
  sanitizeString?: (value: string) => string | undefined
): boolean {
  const denialKind = readString(currentTurn?.denialKind, sanitizeString);
  return denialKind === "user" || denialKind === "user_denied";
}

function isStopTurnOutcome(
  classifierText: string,
  currentTurn: Record<string, unknown> | undefined,
  replay: Record<string, unknown> | undefined,
  sanitizeString?: (value: string) => string | undefined
): boolean {
  if (classifierText.includes("task stopped") || classifierText.includes("stop turn")) {
    return true;
  }

  const stopTurnBehavior = readRecord(currentTurn?.stopTurnBehavior)
    ?? readRecord(replay?.stopTurnBehavior);
  if (!stopTurnBehavior) {
    return false;
  }

  const afterStatus = readString(stopTurnBehavior.afterStatus, sanitizeString)
    ?? readString(stopTurnBehavior.status, sanitizeString);
  const afterMessage = readString(stopTurnBehavior.afterMessage, sanitizeString)
    ?? readString(stopTurnBehavior.message, sanitizeString);

  return afterStatus === "cancelled"
    || afterMessage?.toLowerCase().includes("task stopped") === true;
}

function readRouteDetail({
  currentTurn,
  replay,
  includeCommandDetail,
  sanitizeString
}: {
  currentTurn: Record<string, unknown> | undefined;
  replay: Record<string, unknown> | undefined;
  includeCommandDetail: boolean;
  sanitizeString?: (value: string) => string | undefined;
}): string {
  const error = readRecord(currentTurn?.error);
  const latestToolCall = readRecord(replay?.latestToolCall);
  return readString(error?.message, sanitizeString)
    ?? readString(currentTurn?.error, sanitizeString)
    ?? readString(currentTurn?.routeReason, sanitizeString)
    ?? readString(currentTurn?.reason, sanitizeString)
    ?? readString(currentTurn?.latestMessage, sanitizeString)
    ?? readString(currentTurn?.message, sanitizeString)
    ?? readString(latestToolCall?.summary, sanitizeString)
    ?? readString(latestToolCall?.evidenceSummary, sanitizeString)
    ?? (includeCommandDetail ? readString(currentTurn?.command, sanitizeString) : undefined)
    ?? readString(currentTurn?.targetApp, sanitizeString)
    ?? readString(replay?.latestMessage, sanitizeString)
    ?? "No route activity has been recorded yet.";
}

function readRouteLabel(
  currentTurn: Record<string, unknown> | undefined,
  replay: Record<string, unknown> | undefined,
  sanitizeString?: (value: string) => string | undefined
): string | undefined {
  const latestAction = readRecord(currentTurn?.latestAction);
  const latestToolCall = readRecord(replay?.latestToolCall);

  return readRouteValue(currentTurn?.route, sanitizeString)
    ?? readRouteValue(currentTurn?.targetRoute, sanitizeString)
    ?? readRouteValue(latestAction?.route, sanitizeString)
    ?? readRouteValue(latestToolCall?.route, sanitizeString)
    ?? readString(currentTurn?.targetApp, sanitizeString)
    ?? readString(currentTurn?.targetBundleId, sanitizeString);
}

function readRouteValue(
  value: unknown,
  sanitizeString?: (value: string) => string | undefined
): string | undefined {
  const text = readString(value, sanitizeString);
  if (text) {
    return text;
  }

  const record = readRecord(value);
  return readString(record?.kind, sanitizeString)
    ?? readString(record?.route, sanitizeString)
    ?? readString(record?.bundleId, sanitizeString)
    ?? readString(record?.sessionName, sanitizeString);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(
  value: unknown,
  sanitizeString?: (value: string) => string | undefined
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return sanitizeString ? sanitizeString(value) : value;
}
