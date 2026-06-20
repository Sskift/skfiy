import { describe, expect, it } from "vitest";
import { createDashboardDescriptor } from "./dashboard-status";
import { createDashboardSnapshot } from "./dashboard-data";

describe("dashboard snapshot data", () => {
  it("composes runtime, permission, replay, smoke, and long-horizon panels from read-only inputs", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: {
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        helper: {
          state: "installed",
          path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
        },
        permissions: {
          screenRecording: "granted",
          accessibility: "granted",
          microphone: "granted",
          speechRecognition: "not-determined",
          finderAutomation: "unknown"
        },
        desktopSession: {
          state: "blocked",
          frontmostBundleId: "com.apple.loginwindow",
          mainDisplayAsleep: true
        },
        extension: {
          state: "unknown",
          reason: "Runtime Chrome extension connection is not probed yet."
        },
        nativeHost: {
          state: "installed",
          hostName: "com.sskift.skfiy"
        },
        dashboard: {
          state: "running",
          url: "http://127.0.0.1:8787/"
        }
      },
      currentTurn: {
        state: "approval_required",
        command: "整理 Finder 当前文件夹",
        targetApp: "Finder",
        risk: "medium",
        voiceProvider: "doubao"
      },
      replay: {
        state: "available",
        screenshotCount: 2,
        actionCount: 3,
        verificationCount: 2
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "ui",
            result: "passed",
            path: "/repo/.skfiy-smoke/ui.json",
            productPath: "dist/skfiy.app"
          }
        ]
      },
      longHorizon: {
        state: "not-running",
        session: "money-run"
      }
    });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      runtimeHealth: {
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        helper: {
          state: "installed",
          path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
        },
        dashboard: {
          state: "running",
          url: "http://127.0.0.1:8787/"
        },
        extension: {
          state: "unknown",
          reason: "Runtime Chrome extension connection is not probed yet."
        },
        nativeHost: {
          state: "installed",
          hostName: "com.sskift.skfiy"
        },
        desktopSession: {
          state: "blocked",
          frontmostBundleId: "com.apple.loginwindow",
          mainDisplayAsleep: true
        }
      },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        microphone: "granted",
        speechRecognition: "not-determined",
        finderAutomation: "unknown"
      },
      currentTurn: {
        state: "approval_required",
        command: "整理 Finder 当前文件夹",
        targetApp: "Finder",
        risk: "medium",
        voiceProvider: "doubao"
      },
      replay: {
        state: "available",
        screenshotCount: 2,
        actionCount: 3,
        verificationCount: 2
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "ui",
            result: "passed",
            path: "/repo/.skfiy-smoke/ui.json",
            productPath: "dist/skfiy.app"
          }
        ]
      },
      longHorizon: {
        state: "not-running",
        session: "money-run"
      },
      alerts: [
        {
          code: "desktop-session-blocked",
          severity: "error",
          message: "Desktop session is blocked or asleep."
        },
        {
          code: "finder-automation-unknown",
          severity: "info",
          message: "Finder Automation has not been proven yet."
        },
        {
          code: "extension-unknown",
          severity: "warning",
          message: "Chrome extension connection is unknown."
        }
      ]
    });
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });
});
