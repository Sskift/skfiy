import { describe, expect, it } from "vitest";

import {
  UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS,
  UNKNOWN_PERMISSIONS,
  createUnknownPermissionRefreshState,
  isPermissionOnboardingComplete
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

  it("detects when permission onboarding is complete", () => {
    expect(isPermissionOnboardingComplete(grantedPermissions)).toBe(true);
    expect(isPermissionOnboardingComplete(blockedPermissions)).toBe(false);
  });
});
