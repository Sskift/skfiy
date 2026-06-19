import { describe, expect, it } from "vitest";
import { readPermissionDiagnosticsForRenderer, readPermissionsForRenderer } from "./permissions";
import type { PermissionSummary } from "./computer-use/types";

describe("readPermissionsForRenderer", () => {
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
      microphone: { state: "unknown" },
      speechRecognition: { state: "unknown" }
    });
    expect(onErrorMessages).toEqual(["helper missing"]);
  });

  it("passes Speech Recognition permission through to the renderer summary", async () => {
    await expect(
      readPermissionsForRenderer({
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" },
            microphone: { state: "granted" },
            speechRecognition: { state: "not-determined" }
          })
        }
      })
    ).resolves.toEqual({
      screenRecording: { state: "granted" },
      accessibility: { state: "granted" },
      microphone: { state: "granted" },
      speechRecognition: { state: "not-determined" }
    });
  });

  it("reports app-process and helper-process permission attribution separately", async () => {
    await expect(
      readPermissionDiagnosticsForRenderer({
        active: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" },
          microphone: { state: "not-determined" },
          speechRecognition: { state: "not-determined" }
        },
        appProcess: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
          microphone: { state: "not-determined" },
          speechRecognition: { state: "unknown" }
        },
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "denied" },
            accessibility: { state: "denied" },
            microphone: { state: "not-determined" },
            speechRecognition: { state: "not-determined" }
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
        microphone: { state: "not-determined" },
        speechRecognition: { state: "not-determined" }
      },
      appProcess: {
        screenRecording: { state: "granted" },
        accessibility: { state: "granted" },
        microphone: { state: "not-determined" },
        speechRecognition: { state: "unknown" }
      },
      helperProcess: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" },
        microphone: { state: "not-determined" },
        speechRecognition: { state: "not-determined" }
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
          microphone: { state: "granted" },
          speechRecognition: { state: "granted" }
        },
        appProcess: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
          microphone: { state: "granted" },
          speechRecognition: { state: "unknown" }
        },
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" },
            microphone: { state: "granted" },
            speechRecognition: { state: "granted" }
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
