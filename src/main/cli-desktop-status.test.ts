import { describe, expect, it } from "vitest";

import {
  createPermissionStates,
  createUnknownPermissionStates,
  readDesktopSessionForStatus,
  readPermissionStatesForStatus
} from "./cli-desktop-status";

describe("CLI desktop status helpers", () => {
  it("maps helper permission summaries into CLI status fields", async () => {
    const permissions = {
      screenRecording: { state: "granted" as const },
      accessibility: { state: "denied" as const }
    };

    expect(createPermissionStates(permissions)).toEqual({
      screenRecording: "granted",
      accessibility: "denied",
      finderAutomation: "unknown"
    });
    await expect(readPermissionStatesForStatus({
      getPermissions: async () => permissions
    })).resolves.toEqual({
      screenRecording: "granted",
      accessibility: "denied",
      finderAutomation: "unknown"
    });
  });

  it("uses unknown permission states when the helper cannot be queried", async () => {
    expect(createUnknownPermissionStates()).toEqual({
      screenRecording: "unknown",
      accessibility: "unknown",
      finderAutomation: "unknown"
    });
    await expect(readPermissionStatesForStatus({
      getPermissions: async () => {
        throw new Error("helper unavailable");
      }
    })).resolves.toEqual({
      screenRecording: "unknown",
      accessibility: "unknown",
      finderAutomation: "unknown",
      reason: "helper unavailable"
    });
  });

  it("maps desktop session controllability and preserves helper details", async () => {
    await expect(readDesktopSessionForStatus({
      getDesktopSessionStatus: async () => ({
        controllable: false,
        frontmostBundleId: "com.apple.loginwindow",
        mainDisplayAsleep: true
      })
    })).resolves.toEqual({
      state: "blocked",
      controllable: false,
      frontmostBundleId: "com.apple.loginwindow",
      mainDisplayAsleep: true
    });

    await expect(readDesktopSessionForStatus({
      getDesktopSessionStatus: async () => ({
        controllable: true,
        frontmostBundleId: "com.mitchellh.ghostty",
        frontmostLocalizedName: "Ghostty"
      })
    })).resolves.toEqual({
      state: "controllable",
      controllable: true,
      frontmostBundleId: "com.mitchellh.ghostty",
      frontmostLocalizedName: "Ghostty"
    });
  });

  it("reports unknown desktop session state when the helper fails", async () => {
    await expect(readDesktopSessionForStatus({
      getDesktopSessionStatus: async () => {
        throw new Error("desktop helper timed out");
      }
    })).resolves.toEqual({
      state: "unknown",
      reason: "desktop helper timed out"
    });
  });
});
