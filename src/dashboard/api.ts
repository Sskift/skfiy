import type {
  DashboardAutomationMonitorActionRequest,
  DashboardAutomationMonitorActionResponse,
  DashboardChromeControlActionRequest,
  DashboardChromeHostPolicyActionRequest,
  DashboardChromeHostPolicyResponse,
  DashboardEvidenceSummary,
  DashboardOperatorEvidencePayload,
  DashboardPersonalMemoryActionRequest,
  DashboardPersonalMemoryActionResponse,
  DashboardPersonalSkillActionRequest,
  DashboardPersonalSkillActionResponse,
  DashboardPlannerProviderSettingsUpdate,
  DashboardProviderSettingsResponse,
  DashboardSnapshot
} from "./contracts";

export interface DashboardSnapshotEventHandlers {
  onSnapshot: (snapshot: DashboardSnapshot) => void;
  onError?: (error: Error) => void;
}

export interface DashboardSnapshotEventSubscription {
  close: () => void;
}

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const response = await fetch("/snapshot.json", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Snapshot request failed with HTTP ${response.status}.`);
  }

  return await response.json() as DashboardSnapshot;
}

export function subscribeDashboardSnapshotEvents({
  onSnapshot,
  onError
}: DashboardSnapshotEventHandlers): DashboardSnapshotEventSubscription {
  if (typeof EventSource === "undefined") {
    return { close: () => {} };
  }

  const source = new EventSource("/events");
  const handleSnapshotEvent = (event: MessageEvent<string>) => {
    try {
      onSnapshot(JSON.parse(event.data) as DashboardSnapshot);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Dashboard snapshot event was invalid."));
    }
  };

  source.addEventListener("snapshot", handleSnapshotEvent as EventListener);
  source.onerror = () => {
    onError?.(new Error("Dashboard live update stream disconnected."));
  };

  return {
    close: () => {
      source.close();
    }
  };
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

export async function fetchDashboardEvidenceSummary(): Promise<DashboardEvidenceSummary> {
  const response = await fetch("/api/evidence-summary", {
    cache: "no-store"
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Evidence summary request failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardEvidenceSummary;
}

export async function fetchDashboardOperatorEvidence(): Promise<DashboardOperatorEvidencePayload> {
  const response = await fetch("/api/operator-evidence", {
    cache: "no-store"
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Operator evidence request failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardOperatorEvidencePayload;
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

export async function postPersonalSkillAction(
  request: DashboardPersonalSkillActionRequest
): Promise<DashboardPersonalSkillActionResponse> {
  const response = await fetch("/api/personal-skills", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Personal skill update failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardPersonalSkillActionResponse;
}

export async function postAutomationMonitorAction(
  request: DashboardAutomationMonitorActionRequest
): Promise<DashboardAutomationMonitorActionResponse> {
  const response = await fetch("/api/automation-monitor", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(readDashboardApiError(payload) ?? `Automation monitor update failed with HTTP ${response.status}.`);
  }

  return payload as unknown as DashboardAutomationMonitorActionResponse;
}

function readDashboardApiError(payload: Record<string, unknown>): string | undefined {
  const error = payload.error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }

  return undefined;
}
