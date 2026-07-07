import { spawn } from "node:child_process";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  startDashboardServer,
  type DashboardServer
} from "./dashboard-server.js";
import {
  createDashboardServerState,
  writeDashboardServerState
} from "./dashboard-server-state.js";
import {
  createDashboardDescriptorUrl,
  createDashboardFetchSummary,
  createDashboardOperatorEvidenceUrl,
  createDashboardProbeNotRunOutput,
  createDashboardSnapshotUrl,
  createDashboardStatusSnapshotSummary
} from "./cli-dashboard-probe-output.js";
import { fetchDashboardJson } from "./cli-dashboard-status-reader.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";
import {
  readErrorMessage,
  readRecord
} from "./cli-record-utils.js";
import {
  sanitizeSensitiveString,
  sanitizeTokenFree
} from "./cli-output-sanitize.js";

export interface DashboardCommandIo {
  write: (chunk: string) => unknown;
}

export type DashboardServerStarter = (
  input: { port: number; rootDir?: string }
) => Promise<DashboardServer>;

export type DashboardOpener = (url: string) => Promise<void>;

export const startSkfiyDashboardServer: DashboardServerStarter = startDashboardServer;

export async function runDashboardProbeCli({
  invocation,
  generatedAt,
  stdout
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }>;
  generatedAt?: string;
  stdout: DashboardCommandIo;
}): Promise<number> {
  const output = await createDashboardProbeRunOutput({
    invocation,
    generatedAt: generatedAt ?? new Date().toISOString()
  });

  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output.result === "ok" ? 0 : 1;
}

export async function runDashboardCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  dashboardServerStarter,
  dashboardOpener,
  keepDashboardAlive,
  stdout
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  dashboardServerStarter: DashboardServerStarter;
  dashboardOpener: DashboardOpener;
  keepDashboardAlive: boolean;
  stdout: DashboardCommandIo;
}): Promise<number> {
  const dashboardGeneratedAt = generatedAt ?? new Date().toISOString();
  const dashboard = await dashboardServerStarter({
    port: invocation.options.port,
    rootDir
  });
  const descriptor = createDashboardDescriptor({
    port: dashboard.bind.port
  });
  let dashboardStatePath: string | undefined;
  let dashboardStateError: string | undefined;

  if (homeDir) {
    try {
      dashboardStatePath = await writeDashboardServerState({
        homeDir,
        state: createDashboardServerState({
          pid: process.pid,
          url: dashboard.url,
          bind: dashboard.bind,
          startedAt: dashboardGeneratedAt,
          rootDir
        })
      });
    } catch (error) {
      dashboardStateError = readErrorMessage(error);
    }
  } else {
    dashboardStateError = "Home directory is required to record dashboard server state.";
  }

  stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    command: "dashboard",
    generatedAt: dashboardGeneratedAt,
    serverPid: process.pid,
    bind: descriptor.bind,
    url: descriptor.url,
    ...(dashboardStatePath ? { statePath: dashboardStatePath } : {}),
    ...(dashboardStateError ? { stateWriteError: dashboardStateError } : {}),
    shouldOpen: !invocation.options.noOpen,
    tokenPrinted: false,
    auth: descriptor.auth,
    updates: descriptor.updates,
    eventStore: descriptor.eventStore,
    descriptor,
    result: "running"
  }, null, 2)}\n`);

  if (!invocation.options.noOpen) {
    await dashboardOpener(dashboard.url);
  }

  if (!keepDashboardAlive) {
    await dashboard.close();
    return 0;
  }

  await waitForDashboardShutdown(dashboard);
  return 0;
}

export function openDashboardUrl(url: string): Promise<void> {
  return openMacosUrl(url);
}

async function createDashboardProbeRunOutput({
  invocation,
  generatedAt
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }>;
  generatedAt: string;
}): Promise<Record<string, unknown>> {
  const baseOutput = createDashboardProbeNotRunOutput({
    invocation,
    generatedAt
  });
  const descriptorUrl = createDashboardDescriptorUrl(invocation.options.url);
  const snapshotUrl = createDashboardSnapshotUrl(invocation.options.url);
  const operatorEvidenceUrl = createDashboardOperatorEvidenceUrl(invocation.options.url);

  if (!descriptorUrl || !snapshotUrl || !operatorEvidenceUrl) {
    return {
      ...baseOutput,
      result: "error",
      error: {
        code: "invalid-dashboard-url",
        message: `Invalid dashboard URL: ${sanitizeSensitiveString(invocation.options.url)}`
      },
      fetch: {
        descriptor: {
          state: "not-probed",
          reason: "Invalid dashboard URL."
        },
        snapshot: {
          state: "not-probed",
          reason: "Invalid dashboard URL."
        },
        operatorEvidence: {
          state: "not-probed",
          reason: "Invalid dashboard URL."
        }
      }
    };
  }

  const [descriptorProbe, snapshotProbe, operatorEvidenceProbe] = await Promise.all([
    fetchDashboardJson(descriptorUrl),
    fetchDashboardJson(snapshotUrl),
    invocation.subcommand === "status"
      ? fetchDashboardJson(operatorEvidenceUrl)
      : Promise.resolve({
          state: "not-requested",
          url: operatorEvidenceUrl,
          reason: "dashboard snapshot returns the full snapshot and does not fetch operator evidence."
        } as Record<string, unknown>)
  ]);
  const descriptorBody = readRecord(descriptorProbe.body);
  const snapshotBody = readRecord(snapshotProbe.body);
  const operatorEvidenceBody = readRecord(operatorEvidenceProbe.body);
  const result = descriptorProbe.state === "reachable"
    && snapshotProbe.state === "reachable"
    && (
      invocation.subcommand === "snapshot"
      || operatorEvidenceProbe.state === "reachable"
    )
    ? "ok"
    : "error";
  const operatorReadiness = sanitizeTokenFree(
    readRecord(snapshotBody?.operatorReadiness) ?? { state: "unknown" }
  );
  const commonOutput = {
    ...baseOutput,
    result,
    fetch: {
      descriptor: createDashboardFetchSummary(descriptorProbe),
      snapshot: createDashboardFetchSummary(snapshotProbe),
      operatorEvidence: createDashboardFetchSummary(operatorEvidenceProbe)
    },
    descriptor: descriptorBody
      ? sanitizeTokenFree(descriptorBody)
      : createDashboardFetchSummary(descriptorProbe),
    operatorEvidence: operatorEvidenceBody
      ? sanitizeTokenFree(operatorEvidenceBody)
      : createDashboardFetchSummary(operatorEvidenceProbe),
    operatorReadiness
  };

  if (invocation.subcommand === "snapshot") {
    return {
      ...commonOutput,
      snapshot: snapshotBody
        ? sanitizeTokenFree(snapshotBody)
        : createDashboardFetchSummary(snapshotProbe)
    };
  }

  return {
    ...commonOutput,
    snapshot: createDashboardStatusSnapshotSummary(snapshotProbe, snapshotBody)
  };
}

function openMacosUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [url], {
      stdio: "ignore"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`open exited with code ${code ?? "null"}.`));
      }
    });
  });
}

async function waitForDashboardShutdown(dashboard: DashboardServer): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void dashboard.close().finally(resolve);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
