import type {
  DashboardChromeControlActionRequest,
  DashboardChromeHostPolicyActionRequest,
  DashboardChromeHostPolicyResponse,
  DashboardPersonalMemoryActionRequest,
  DashboardPersonalMemoryActionResponse,
  DashboardPlannerProviderSettingsUpdate,
  DashboardProviderSettingsResponse,
  DashboardSnapshot
} from "./contracts";

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const response = await fetch("/snapshot.json", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Snapshot request failed with HTTP ${response.status}.`);
  }

  return await response.json() as DashboardSnapshot;
}

export async function postChromeControlAction(
  request: DashboardChromeControlActionRequest
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/chrome-control-action", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Chrome action failed with HTTP ${response.status}.`);
  }

  return payload;
}

export async function fetchChromeHostPolicy(): Promise<DashboardChromeHostPolicyResponse> {
  const response = await fetch("/api/chrome-host-policy", {
    cache: "no-store"
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Chrome host policy request failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardChromeHostPolicyResponse;
}

export async function postChromeHostPolicyAction(
  request: DashboardChromeHostPolicyActionRequest
): Promise<DashboardChromeHostPolicyResponse> {
  const response = await fetch("/api/chrome-host-policy", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Chrome host policy request failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardChromeHostPolicyResponse;
}

export async function fetchProviderSettings(): Promise<DashboardProviderSettingsResponse> {
  const response = await fetch("/api/provider-settings", {
    cache: "no-store"
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Provider settings request failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardProviderSettingsResponse;
}

export async function postPlannerProviderSettings(
  planner: DashboardPlannerProviderSettingsUpdate
): Promise<DashboardProviderSettingsResponse> {
  const response = await fetch("/api/provider-settings", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ planner })
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Provider settings update failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardProviderSettingsResponse;
}

export async function postPersonalMemoryAction(
  request: DashboardPersonalMemoryActionRequest
): Promise<DashboardPersonalMemoryActionResponse> {
  const response = await fetch("/api/personal-memory", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Personal memory update failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardPersonalMemoryActionResponse;
}

function readDashboardApiError(payload: Record<string, unknown>): string | undefined {
  const error = payload.error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }

  return undefined;
}
