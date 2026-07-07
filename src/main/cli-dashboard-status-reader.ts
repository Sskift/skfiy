import { readDashboardServerState } from "./dashboard-server-state.js";
import {
  createDashboardApiUrl,
  createDashboardDescriptorUrl
} from "./cli-dashboard-probe-output.js";
import {
  readErrorMessage,
  readNumber,
  readString
} from "./cli-record-utils.js";

export interface DashboardStatusReaderIo {
  readServerState?: typeof readDashboardServerState;
  isPidRunning?: (pid: number) => boolean;
  fetchJson?: typeof fetchDashboardJson;
}

export async function readDashboardStatus(
  dashboardUrl: string | undefined,
  homeDir?: string,
  io: DashboardStatusReaderIo = {}
): Promise<Record<string, unknown>> {
  const discovered = dashboardUrl
    ? undefined
    : readDashboardStatusFromState(homeDir, io);
  const effectiveDashboardUrl = dashboardUrl ?? readString(discovered?.url);

  if (!effectiveDashboardUrl) {
    return discovered ?? { state: "not-running" };
  }

  const descriptorUrl = createDashboardDescriptorUrl(effectiveDashboardUrl);
  const chromeHostPolicyApiUrl = createDashboardApiUrl(effectiveDashboardUrl);

  if (!descriptorUrl || !chromeHostPolicyApiUrl) {
    return {
      state: "not-running",
      url: effectiveDashboardUrl,
      ...(discovered ? { source: "dashboard-server-state" } : {}),
      ...(readString(discovered?.statePath) ? { statePath: readString(discovered?.statePath) } : {}),
      reason: `Invalid dashboard URL: ${effectiveDashboardUrl}`,
      api: {
        chromeHostPolicy: {
          state: "not-probed",
          url: chromeHostPolicyApiUrl,
          reason: "Invalid dashboard URL."
        }
      }
    };
  }

  const fetchJson = io.fetchJson ?? fetchDashboardJson;
  const descriptorProbe = await fetchJson(descriptorUrl);

  if (descriptorProbe.state !== "reachable") {
    return {
      state: descriptorProbe.state === "blocked" ? "blocked" : "not-running",
      url: effectiveDashboardUrl,
      ...(discovered ? { source: "dashboard-server-state" } : {}),
      ...(readString(discovered?.statePath) ? { statePath: readString(discovered?.statePath) } : {}),
      ...(readNumber(discovered?.pid) !== undefined ? { pid: readNumber(discovered?.pid) } : {}),
      ...(readString(discovered?.startedAt) ? { startedAt: readString(discovered?.startedAt) } : {}),
      status: descriptorProbe.status,
      reason: descriptorProbe.reason,
      api: {
        chromeHostPolicy: {
          state: "not-probed",
          url: chromeHostPolicyApiUrl,
          reason: "Dashboard descriptor is not reachable."
        }
      }
    };
  }

  return {
    state: "running",
    url: effectiveDashboardUrl,
    ...(discovered ? { source: "dashboard-server-state" } : {}),
    ...(readString(discovered?.statePath) ? { statePath: readString(discovered?.statePath) } : {}),
    ...(readNumber(discovered?.pid) !== undefined ? { pid: readNumber(discovered?.pid) } : {}),
    ...(readString(discovered?.startedAt) ? { startedAt: readString(discovered?.startedAt) } : {}),
    descriptor: descriptorProbe.body,
    api: {
      chromeHostPolicy: await fetchJson(chromeHostPolicyApiUrl)
    }
  };
}

export function readDashboardStatusFromState(
  homeDir: string | undefined,
  io: DashboardStatusReaderIo = {}
): Record<string, unknown> | undefined {
  const readServerState = io.readServerState ?? readDashboardServerState;
  const result = readServerState(homeDir);
  if (!result.state) {
    return {
      state: "not-running",
      ...(result.statePath ? { statePath: result.statePath } : {}),
      ...(result.reason ? { reason: result.reason } : {})
    };
  }

  const pidIsRunning = io.isPidRunning ?? isPidRunning;
  if (!pidIsRunning(result.state.pid)) {
    return {
      state: "not-running",
      source: "dashboard-server-state",
      statePath: result.statePath,
      url: result.state.url,
      pid: result.state.pid,
      startedAt: result.state.startedAt,
      reason: "Recorded dashboard process is no longer running."
    };
  }

  return {
    state: "unknown",
    source: "dashboard-server-state",
    statePath: result.statePath,
    url: result.state.url,
    pid: result.state.pid,
    startedAt: result.state.startedAt,
    bind: result.state.bind
  };
}

export async function fetchDashboardJson(
  targetUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1_000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        state: "blocked",
        url: targetUrl,
        status: response.status
      };
    }

    const body = await response.json() as unknown;

    return {
      state: "reachable",
      url: targetUrl,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      state: "not-running",
      url: targetUrl,
      reason: readErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
