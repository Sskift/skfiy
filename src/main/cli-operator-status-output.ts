import {
  compactRecord,
  readNumber,
  readRecord,
  readString
} from "./cli-record-utils.js";
import {
  sanitizeDashboardUrlForOutput,
  sanitizeTokenFree
} from "./cli-output-sanitize.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";
import type { StatusReadinessContext } from "./cli-status-readiness.js";
import { SKFIY_MCP_TOOL_NAMES } from "./skfiy-mcp-server.js";
import {
  isRouteOutcomeKind,
  isRouteOutcomeTone,
  readRouteOutcome,
  type RouteOutcome
} from "../shared/route-outcome.js";

export type OperatorStatusReadinessFactory = (
  status: Record<string, unknown>,
  context: StatusReadinessContext
) => Record<string, unknown>;

export function createOperatorStatusOutput({
  invocation,
  generatedAt,
  status,
  result,
  createReadinessSummary
}: {
  invocation: Extract<CliCommandInvocation, { kind: "operator-status" }>;
  generatedAt: string;
  status: Record<string, unknown>;
  result: "not-run" | "probed";
  createReadinessSummary?: OperatorStatusReadinessFactory;
}): Record<string, unknown> {
  const readiness = readRecord(status.readiness)
    ?? createReadinessSummary?.(status, invocation.options)
    ?? { state: "unknown", ready: false, checks: {}, blockers: [] };
  const checks = readRecord(readiness.checks);
  const readinessState = readString(readiness.state) ?? "unknown";
  const effectiveResult = result === "not-run"
    ? "not-run"
    : readinessState === "ready"
      ? "ready"
      : readinessState === "unknown"
        ? "unknown"
        : "needs-action";
  const output = {
    schemaVersion: 1,
    command: "operator status",
    generatedAt,
    result: effectiveResult,
    ready: effectiveResult === "ready",
    requireReady: invocation.options.requireReady,
    executesSystemMutation: false,
    outputPolicy: {
      tokenFree: true,
      stableForAutomation: true,
      source: "status-reader-summary"
    },
    targets: {
      runtime: readRecord(checks?.runtime) ?? { state: "unknown", ready: false },
      dashboard: readRecord(checks?.dashboard) ?? { state: "unknown", ready: false },
      plugin: createOperatorPluginStatus(status, invocation.options.cliShimPath),
      extension: readRecord(checks?.extension) ?? { state: "unknown", ready: false },
      moneyRun: readRecord(checks?.moneyRun) ?? { state: "unknown", ready: false }
    },
    routeOutcome: createOperatorRouteOutcome(status),
    latestRouteAction: createOperatorLatestRouteAction(status),
    readiness,
    blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
    supervision: {
      mode: "read-only-status",
      tmuxBackendRequired: false,
      exitOnNotReady: invocation.options.requireReady,
      recommendedReadOnlyCommands: createOperatorReadOnlyCommands(invocation)
    }
  };

  return sanitizeTokenFree(output) as Record<string, unknown>;
}

function createOperatorLatestRouteAction(status: Record<string, unknown>): Record<string, unknown> {
  const evidence = readRecord(status.evidence);
  const runtimeSnapshot = readRecord(status.runtimeSnapshot) ?? readRecord(evidence?.runtimeSnapshot);
  const currentTurn = readRecord(runtimeSnapshot?.currentTurn) ?? readRecord(evidence?.currentTurn);
  const replay = readRecord(runtimeSnapshot?.replay);
  const latestAction =
    readRecord(currentTurn?.latestAction)
    ?? readRecord(replay?.latestAction)
    ?? readRecord(replay?.latestToolCall)
    ?? readRecordArray(replay?.actions).at(-1);

  if (!latestAction) {
    return {
      state: "unknown",
      source: "runtime-snapshot",
      detail: "Runtime route action evidence has not been recorded."
    };
  }

  return compactRecord({
    state: readOperatorActionState(latestAction),
    source: "runtime-snapshot",
    type: readSafeOperatorString(latestAction.type),
    route: readSafeOperatorString(latestAction.route),
    status: readSafeOperatorString(latestAction.status),
    decision: readSafeOperatorString(latestAction.decision),
    detail: formatOperatorActionDetail(latestAction)
  });
}

function createOperatorRouteOutcome(status: Record<string, unknown>): Record<string, unknown> {
  const evidence = readRecord(status.evidence);
  const runtimeSnapshot = readRecord(status.runtimeSnapshot) ?? readRecord(evidence?.runtimeSnapshot);
  const routeOutcome = readRecord(runtimeSnapshot?.routeOutcome);
  const currentTurn = readRecord(runtimeSnapshot?.currentTurn) ?? readRecord(evidence?.currentTurn);
  const replay = readRecord(runtimeSnapshot?.replay) ?? readRecord(evidence?.replay);
  const fallbackState = readString(currentTurn?.state) ?? "unknown";

  if (!routeOutcome) {
    if (currentTurn || replay) {
      return readOperatorRouteOutcomeRecord(readRouteOutcome({
        ...(currentTurn ? { currentTurn } : {}),
        ...(replay ? { replay } : {}),
        defaultSource: "runtime-snapshot",
        includeCommandDetail: false
      }), fallbackState);
    }

    return createUnknownOperatorRouteOutcome(fallbackState);
  }

  return readOperatorRouteOutcomeRecord(routeOutcome, fallbackState);
}

function createUnknownOperatorRouteOutcome(fallbackState: string): Record<string, unknown> {
  return {
    kind: "unknown",
    title: "Route unknown",
    value: "unknown",
    detail: "Runtime route outcome has not been probed.",
    tone: "neutral",
    source: "runtime-snapshot",
    routeLabel: "unknown",
    state: fallbackState
  };
}

function readOperatorRouteOutcomeRecord(
  routeOutcome: Record<string, unknown> | RouteOutcome,
  fallbackState: string
): Record<string, unknown> {
  return compactRecord({
    kind: isRouteOutcomeKind(routeOutcome.kind) ? routeOutcome.kind : "unknown",
    title: readString(routeOutcome.title) ?? "Route unknown",
    value: readString(routeOutcome.value) ?? "unknown",
    detail: readString(routeOutcome.detail) ?? "Runtime route outcome has not been probed.",
    tone: isRouteOutcomeTone(routeOutcome.tone) ? routeOutcome.tone : "neutral",
    source: readString(routeOutcome.source) ?? "runtime-snapshot",
    routeLabel: readString(routeOutcome.routeLabel) ?? "unknown",
    state: readString(routeOutcome.state) ?? fallbackState,
    denialKind: readString(routeOutcome.denialKind),
    policyKind: readString(routeOutcome.policyKind)
  });
}

function readOperatorActionState(action: Record<string, unknown>): string {
  const status = readString(action.status);
  const decision = readString(action.decision);

  if (status === "blocked" || status === "failed") {
    return "blocked";
  }
  if (
    status === "approval_required"
    || status === "planned"
    || status === "running"
    || status === "needs_confirmation"
    || status === "needs_clarification"
  ) {
    return "needs-action";
  }
  if (decision === "denied" || decision === "approved" || decision === "bypassed") {
    return "ready";
  }

  return "ready";
}

function formatOperatorActionDetail(action: Record<string, unknown>): string | undefined {
  const type = readString(action.type);
  if (type === "tool_result") {
    return joinOperatorActionParts([
      readSafeOperatorString(action.summary) ?? readSafeOperatorString(action.evidenceSummary),
      formatOperatorCount(readNumber(action.artifactCount), "artifacts")
    ]);
  }
  if (type === "approval_decision") {
    return readSafeOperatorString(action.reason);
  }
  if (type === "observe_finder_selection") {
    return joinOperatorActionParts([
      formatOperatorCount(readNumber(action.selectedCount), "selected"),
      readSafeOperatorString(action.source)
    ]);
  }
  if (type === "preview_finder_plan" || type === "confirm_finder_plan") {
    return joinOperatorActionParts([
      formatOperatorCount(readNumber(action.operationCount), "ops"),
      formatOperatorCount(readNumber(action.destructiveOperationCount), "destructive"),
      formatOperatorCount(readNumber(action.createFolderCount), "folders"),
      formatOperatorCount(readNumber(action.moveFileCount), "moves"),
      readSafeOperatorString(action.reason)
    ]);
  }
  if (type === "type_text") {
    return `${readNumber(action.textLength) ?? 0} chars`;
  }
  if (type === "press_key") {
    return readSafeOperatorString(action.key);
  }

  return readSafeOperatorString(action.message)
    ?? readSafeOperatorString(action.stage)
    ?? readSafeOperatorString(action.action);
}

function joinOperatorActionParts(parts: Array<string | undefined>): string | undefined {
  const detail = parts.filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
  return detail.length > 0 ? detail : undefined;
}

function formatOperatorCount(value: number | undefined, label: string): string | undefined {
  return value === undefined ? undefined : `${value} ${label}`;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((entry) => readRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function readSafeOperatorString(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) {
    return undefined;
  }

  return text
    .replace(/\b(?:token|access_token|refresh_token|id_token|api_key|authorization|cookie)=([^&\s"']+)/gi, "redacted=[redacted]")
    .replace(/\b(?:authorization|bearer|basic)\s+[-._~+/=A-Za-z0-9]+/gi, "redacted [redacted]")
    .replace(/(?:\/Users\/[^\s]+|\/tmp\/[^\s]+|\/var\/[^\s]+|\/repo\/[^\s]+)/g, "[path]");
}

function createOperatorPluginStatus(
  status: Record<string, unknown>,
  cliShimPath: string
): Record<string, unknown> {
  const cli = readRecord(status.cli);
  const cliState = readString(cli?.state) ?? "unknown";
  const state = cliState === "installed"
    ? "available"
    : cliState === "unknown"
      ? "unknown"
      : "needs-action";
  const blockers = state === "needs-action"
    ? [{
        code: "plugin-cli-not-installed",
        message: "Codex plugin MCP adapter requires the packaged skfiy CLI.",
        state: cliState,
        expected: "installed"
      }]
    : [];

  return {
    state,
    ready: state === "available",
    adapter: "codex-plugin-mcp",
    transport: "stdio",
    command: "skfiy mcp serve --stdio",
    cliShimPath,
    tools: [...SKFIY_MCP_TOOL_NAMES],
    blockers
  };
}

function createOperatorReadOnlyCommands(
  invocation: Extract<CliCommandInvocation, { kind: "operator-status" }>
): Array<Record<string, unknown>> {
  const statusArgs = createStatusLikeArgs("status", invocation.options);
  const doctorArgs = createStatusLikeArgs("doctor", invocation.options);
  const commands: Array<Record<string, unknown>> = [
    {
      id: "status",
      command: "skfiy",
      args: statusArgs
    },
    {
      id: "doctor",
      command: "skfiy",
      args: doctorArgs
    },
    {
      id: "plugin-mcp",
      command: "skfiy",
      args: ["mcp", "serve", "--stdio", "--json"]
    }
  ];

  if (invocation.options.dashboardUrl) {
    commands.push({
      id: "dashboard-status",
      command: "skfiy",
      args: [
        "dashboard",
        "status",
        "--json",
        "--url",
        sanitizeDashboardUrlForOutput(invocation.options.dashboardUrl)
      ]
    });
  }

  if (invocation.options.extensionIds.length > 0) {
    commands.push({
      id: "chrome-status",
      command: "skfiy",
      args: [
        "chrome",
        "status",
        "--json",
        ...invocation.options.extensionIds.flatMap((extensionId) => ["--extension-id", extensionId])
      ]
    });
  }

  return commands;
}

function createStatusLikeArgs(
  command: "status" | "doctor",
  options: {
    extensionIds: string[];
    dashboardUrl?: string;
  }
): string[] {
  return [
    command,
    "--json",
    ...options.extensionIds.flatMap((extensionId) => ["--extension-id", extensionId]),
    ...(options.dashboardUrl
      ? ["--dashboard-url", sanitizeDashboardUrlForOutput(options.dashboardUrl)]
      : [])
  ];
}
