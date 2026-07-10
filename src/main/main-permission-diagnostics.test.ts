import { describe, expect, it } from "vitest";

import type { PermissionSummary } from "./computer-use/types";
import {
  createMainPermissionDiagnosticsIdentity,
  createMainPermissionDiagnosticsResponse
} from "./main-permission-diagnostics";

const active: PermissionSummary = {
  screenRecording: { state: "granted" },
  accessibility: { state: "denied" }
};

const identity = {
  appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
  executablePath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy",
  helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
  resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
  isPackaged: true
};

describe("main permission diagnostics helpers", () => {
  it("creates the renderer diagnostics identity from main-process paths", () => {
    expect(createMainPermissionDiagnosticsIdentity(identity)).toEqual(identity);
  });

  it("creates diagnostics from Electron app-process states and active helper permissions", async () => {
    await expect(createMainPermissionDiagnosticsResponse({
      active,
      appProcess: {
        screenRecording: "restricted",
        accessibilityTrusted: false
      },
      identity
    })).resolves.toEqual({
      active,
      appProcess: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" }
      },
      helperProcess: active,
      mismatches: [
        { permission: "screenRecording", appProcess: "denied", helperProcess: "granted" }
      ],
      identity
    });
  });
});
