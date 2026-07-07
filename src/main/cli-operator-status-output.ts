import {
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
