import { readDashboardServerState } from "./dashboard-server-state.js";
import {
  createDashboardApiUrl,
  createDashboardDescriptorUrl
} from "./cli-dashboard-probe-output.js";
import {
  compactRecord,
  readErrorMessage,
  readNumber,
  readRecord,
  readString
} from "./cli-record-utils.js";
import {
  STALE_DASHBOARD_BUILD_MISMATCH_CODE,
  compareDashboardRuntimeIdentity,
  createDashboardBuildIdentity,
  normalizeDashboardBuildIdentity
} from "./dashboard-runtime-identity.js";

const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:8787/";

export interface DashboardStatusReaderIo {
  readServerState?: typeof readDashboardServerState;
  isPidRunning?: (pid: number) => boolean;
  fetchJson?: typeof fetchDashboardJson;
}

export async function readDashboardStatus(
  dashboardUrl: string | undefined,
  homeDir: string | undefined,
  rootDirOrIo: string | DashboardStatusReaderIo = {},
  statusIo: DashboardStatusReaderIo = {}
): Promise<Record<string, unknown>> {
  const rootDir = typeof rootDirOrIo === "string" ? rootDirOrIo : undefined;
  const io = typeof rootDirOrIo === "string" ? statusIo : rootDirOrIo;
  const discovered = dashboardUrl
    ? undefined
    : readDashboardStatusFromState(homeDir, io);
  const discoveredUrl = readString(discovered?.url);
  const usingDefaultDashboardUrl = !dashboardUrl && !discoveredUrl;
  const effectiveDashboardUrl = dashboardUrl ?? discoveredUrl ?? DEFAULT_DASHBOARD_URL;

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
    if (usingDefaultDashboardUrl) {
      return discovered ?? { state: "not-running" };
    }

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

  const currentBuildIdentity = rootDir
    ? createDashboardBuildIdentity({ rootDir })
    : undefined;
  const descriptorBody = readRecord(descriptorProbe.body);
  const descriptorBuildIdentity = normalizeDashboardBuildIdentity(
    readRecord(descriptorBody?.runtime)?.buildIdentity
  );
  const stateBuildIdentity = normalizeDashboardBuildIdentity(discovered?.buildIdentity);
  const runtimeIdentity = currentBuildIdentity
    ? compareDashboardRuntimeIdentity({
        currentBuildIdentity,
        descriptorBuildIdentity,
        stateBuildIdentity
      })
    : undefined;
  const stale = runtimeIdentity ? runtimeIdentity.state !== "matched" : false;

  return {
    state: stale ? "stale" : "running",
    url: effectiveDashboardUrl,
    ...createReachableDashboardDiscoveryMetadata({
      discovered,
      usingDefaultDashboardUrl
    }),
    ...(runtimeIdentity ? { stale, runtimeIdentity } : {}),
    ...(stale && runtimeIdentity
      ? {
          blocker: {
            code: runtimeIdentity.code ?? STALE_DASHBOARD_BUILD_MISMATCH_CODE,
            message: runtimeIdentity.reason
          }
        }
      : {}),
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
      ...(result.state.buildIdentity ? { buildIdentity: result.state.buildIdentity } : {}),
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
    bind: result.state.bind,
    ...(result.state.buildIdentity ? { buildIdentity: result.state.buildIdentity } : {})
  };
}

function createReachableDashboardDiscoveryMetadata({
  discovered,
  usingDefaultDashboardUrl
}: {
  discovered: Record<string, unknown> | undefined;
  usingDefaultDashboardUrl: boolean;
}): Record<string, unknown> {
  if (usingDefaultDashboardUrl) {
    return { source: "default-dashboard-url" };
  }

  if (!discovered) {
    return {};
  }

  if (readString(discovered.state) === "not-running") {
    return compactRecord({
      source: "dashboard-probe",
      stateEvidence: createDashboardStateEvidence(discovered)
    });
  }

  return compactRecord({
    source: "dashboard-server-state",
    statePath: readString(discovered.statePath),
    pid: readNumber(discovered.pid),
    startedAt: readString(discovered.startedAt)
  });
}

function createDashboardStateEvidence(discovered: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    state: readString(discovered.state),
    source: readString(discovered.source),
    statePath: readString(discovered.statePath),
    url: readString(discovered.url),
    pid: readNumber(discovered.pid),
    startedAt: readString(discovered.startedAt),
    reason: readString(discovered.reason)
  });
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
