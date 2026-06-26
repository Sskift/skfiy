import path from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import {
  normalizeDashboardBuildIdentity,
  type DashboardBuildIdentity
} from "./dashboard-runtime-identity.js";

export const DASHBOARD_SERVER_STATE_SCHEMA_VERSION = 1;

export interface DashboardServerState {
  schemaVersion: typeof DASHBOARD_SERVER_STATE_SCHEMA_VERSION;
  pid: number;
  url: string;
  bind: {
    host: "127.0.0.1";
    port: number;
  };
  startedAt: string;
  rootDir?: string;
  buildIdentity?: DashboardBuildIdentity;
}

export interface DashboardServerStateIo {
  mkdir: (targetPath: string) => Promise<void>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  rename?: (fromPath: string, toPath: string) => Promise<void>;
}

export interface DashboardServerStateReadResult {
  statePath: string;
  state?: DashboardServerState;
  reason?: string;
}

export function createDashboardServerStatePath(homeDir: string): string {
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "dashboard-server.json"
  );
}

export function createDashboardServerState({
  pid,
  url,
  bind,
  startedAt = new Date().toISOString(),
  rootDir,
  buildIdentity
}: Omit<DashboardServerState, "schemaVersion" | "startedAt"> & {
  startedAt?: string;
}): DashboardServerState {
  return {
    schemaVersion: DASHBOARD_SERVER_STATE_SCHEMA_VERSION,
    pid,
    url,
    bind,
    startedAt,
    ...(rootDir ? { rootDir } : {}),
    ...(buildIdentity ? { buildIdentity } : {})
  };
}

export async function writeDashboardServerState({
  homeDir,
  state,
  io = createDefaultDashboardServerStateIo()
}: {
  homeDir: string;
  state: DashboardServerState;
  io?: DashboardServerStateIo;
}): Promise<string> {
  const statePath = createDashboardServerStatePath(homeDir);
  const stateText = `${JSON.stringify(state, null, 2)}\n`;

  await io.mkdir(path.dirname(statePath));
  if (io.rename) {
    const tempPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
    await io.writeFile(tempPath, stateText);
    await io.rename(tempPath, statePath);
  } else {
    await io.writeFile(statePath, stateText);
  }

  return statePath;
}

export function readDashboardServerState(homeDir: string | undefined): DashboardServerStateReadResult {
  if (!homeDir) {
    return {
      statePath: "",
      reason: "Home directory is required to locate dashboard server state."
    };
  }

  const statePath = createDashboardServerStatePath(homeDir);
  if (!existsSync(statePath)) {
    return {
      statePath,
      reason: "Dashboard server state has not been recorded yet."
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    const state = normalizeDashboardServerState(parsed);

    return state
      ? { statePath, state }
      : {
          statePath,
          reason: "Dashboard server state is not a valid skfiy state file."
        };
  } catch (error) {
    return {
      statePath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizeDashboardServerState(value: unknown): DashboardServerState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const bind = record.bind;
  if (!bind || typeof bind !== "object" || Array.isArray(bind)) {
    return undefined;
  }
  const bindRecord = bind as Record<string, unknown>;

  if (
    record.schemaVersion !== DASHBOARD_SERVER_STATE_SCHEMA_VERSION
    || typeof record.pid !== "number"
    || !Number.isSafeInteger(record.pid)
    || record.pid <= 0
    || typeof record.url !== "string"
    || typeof record.startedAt !== "string"
    || bindRecord.host !== "127.0.0.1"
    || typeof bindRecord.port !== "number"
    || !Number.isSafeInteger(bindRecord.port)
    || bindRecord.port <= 0
  ) {
    return undefined;
  }

  const buildIdentity = normalizeDashboardBuildIdentity(record.buildIdentity);

  return {
    schemaVersion: DASHBOARD_SERVER_STATE_SCHEMA_VERSION,
    pid: record.pid,
    url: record.url,
    bind: {
      host: "127.0.0.1",
      port: bindRecord.port
    },
    startedAt: record.startedAt,
    ...(typeof record.rootDir === "string" ? { rootDir: record.rootDir } : {}),
    ...(buildIdentity ? { buildIdentity } : {})
  };
}

function createDefaultDashboardServerStateIo(): DashboardServerStateIo {
  return {
    mkdir: async (targetPath) => {
      await mkdir(targetPath, { recursive: true });
    },
    writeFile,
    rename
  };
}
