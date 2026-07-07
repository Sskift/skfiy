import { describe, expect, it } from "vitest";

import {
  UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS,
  UNKNOWN_PERMISSIONS,
  createUnknownPermissionRefreshState,
  isPermissionOnboardingComplete,
  readPermissionOnboardingRows
} from "./app-permission-state";
import type {
  PermissionSummary
} from "./App";

const grantedPermissions: PermissionSummary = {
  screenRecording: { state: "granted" },
  accessibility: { state: "granted" }
};

const blockedPermissions: PermissionSummary = {
  screenRecording: { state: "denied" },
  accessibility: { state: "not-determined" }
};

describe("app permission state", () => {
  it("creates an unknown fallback permission refresh state", () => {
    expect(createUnknownPermissionRefreshState()).toEqual({
      permissions: UNKNOWN_PERMISSIONS,
      desktopSessionDiagnostics: UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS
    });
  });

  it("reads permission onboarding rows from blocking permission states", () => {
    expect(readPermissionOnboardingRows(blockedPermissions).map((row) => row.key)).toEqual([
      "screenRecording",
      "accessibility"
    ]);
    expect(readPermissionOnboardingRows({
      screenRecording: { state: "unknown" },
      accessibility: { state: "granted" }
    })).toEqual([]);
  });

  it("detects when permission onboarding is complete", () => {
    expect(isPermissionOnboardingComplete(grantedPermissions)).toBe(true);
    expect(isPermissionOnboardingComplete(blockedPermissions)).toBe(false);
  });
});
