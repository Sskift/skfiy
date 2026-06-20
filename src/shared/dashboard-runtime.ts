export const DASHBOARD_RUNTIME_SNAPSHOT_STALE_SECONDS = 30;

export type DashboardRuntimeSnapshotFreshnessState =
  | "fresh"
  | "stale"
  | "empty"
  | "unavailable"
  | "unknown";
