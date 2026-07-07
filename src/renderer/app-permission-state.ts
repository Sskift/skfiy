import type {
  DesktopSessionDiagnostics,
  PermissionSummary
} from "./App";
import { readMissingPermissionRows } from "./app-view-model";

export const UNKNOWN_PERMISSIONS: PermissionSummary = {
  screenRecording: { state: "unknown" },
  accessibility: { state: "unknown" }
};

export const UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS: DesktopSessionDiagnostics = {
  state: "unknown",
  status: null,
  reason: "Desktop session status is unknown."
};

export interface PermissionRefreshState {
  permissions: PermissionSummary;
  desktopSessionDiagnostics: DesktopSessionDiagnostics;
}

export function createUnknownPermissionRefreshState(): PermissionRefreshState {
  return {
    permissions: UNKNOWN_PERMISSIONS,
    desktopSessionDiagnostics: UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS
  };
}

export function readPermissionOnboardingRows(permissions: PermissionSummary) {
  return readMissingPermissionRows(permissions);
}

export function isPermissionOnboardingComplete(permissions: PermissionSummary): boolean {
  return readPermissionOnboardingRows(permissions).length === 0;
}
