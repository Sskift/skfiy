import { describe, expect, it } from "vitest";
import {
  createAppProcessPermissionSummary,
  readElectronMediaPermissionState,
  readPermissionDiagnosticsForRenderer,
  readPermissionsForRenderer
} from "./permissions";
import type { PermissionSummary } from "./computer-use/types";

describe("readPermissionsForRenderer", () => {
  it("creates an app-process permission summary from Electron states", () => {
    expect(readElectronMediaPermissionState("granted")).toBe("granted");
    expect(readElectronMediaPermissionState("restricted")).toBe("denied");
    expect(readElectronMediaPermissionState("not-determined")).toBe("not-determined");

    expect(createAppProcessPermissionSummary({
      screenRecording: "restricted",
      accessibilityTrusted: true
    })).toEqual({
      screenRecording: { state: "denied" },
      accessibility: { state: "granted" }
    });
    expect(createAppProcessPermissionSummary({
      screenRecording: "unknown",
      accessibilityTrusted: false
    })).toEqual({
      screenRecording: { state: "unknown" },
      accessibility: { state: "denied" }
    });
  });

  it("returns unknown permission states without escalating to a task failure", async () => {
    const onErrorMessages: string[] = [];

    await expect(
      readPermissionsForRenderer({
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => {
            throw new Error("helper missing");
          }
        },
        onError: (message) => onErrorMessages.push(message)
      })
    ).resolves.toEqual({
      screenRecording: { state: "unknown" },
      accessibility: { state: "unknown" },
    });
    expect(onErrorMessages).toEqual(["helper missing"]);
  });

  it("passes Computer Use permissions through to the renderer summary", async () => {
    await expect(
      readPermissionsForRenderer({
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" },
          })
        }
      })
    ).resolves.toEqual({
      screenRecording: { state: "granted" },
      accessibility: { state: "granted" },
    });
  });

  it("reports app-process and helper-process permission attribution separately", async () => {
    await expect(
      readPermissionDiagnosticsForRenderer({
        active: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" },
        },
        appProcess: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
        },
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "denied" },
            accessibility: { state: "denied" },
          })
        },
        identity: {
          appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
          executablePath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy",
          helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
          resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
          isPackaged: false
        }
      })
    ).resolves.toEqual({
      active: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" },
      },
      appProcess: {
        screenRecording: { state: "granted" },
        accessibility: { state: "granted" },
      },
      helperProcess: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" },
      },
      mismatches: [
        { permission: "screenRecording", appProcess: "granted", helperProcess: "denied" },
        { permission: "accessibility", appProcess: "granted", helperProcess: "denied" }
      ],
      identity: {
        appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
        executablePath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
        isPackaged: false
      }
    });
  });

  it("does not report a mismatch when the app process cannot read a permission state", async () => {
    await expect(
      readPermissionDiagnosticsForRenderer({
        active: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
        },
        appProcess: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
        },
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" },
          })
        },
        identity: {
          appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
          executablePath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy",
          helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
          resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
          isPackaged: true
        }
      })
    ).resolves.toMatchObject({
      mismatches: []
    });
  });
});
