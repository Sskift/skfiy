import type {
  DashboardChromeControlActionRequest,
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

function readDashboardApiError(payload: Record<string, unknown>): string | undefined {
  const error = payload.error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }

  return undefined;
}
