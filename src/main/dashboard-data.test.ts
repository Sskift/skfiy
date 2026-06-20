import { describe, expect, it } from "vitest";
import { createDashboardDescriptor } from "./dashboard-status";
import {
  createDashboardSnapshot,
  createDashboardWorkspaceSnapshot
} from "./dashboard-data";

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

  it("creates a workspace-backed snapshot from package, binary, and smoke artifact evidence", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0",
        description: "Desktop Computer Use prototype"
      }),
      "/repo/.skfiy-smoke/dashboard-old.json": JSON.stringify({
        result: "failed",
        productPath: "old"
      }),
      "/repo/.skfiy-smoke/dashboard-current.json": JSON.stringify({
        result: "passed",
        productPath: "dist/skfiy -> skfiy dashboard -> loopback dashboard server",
        cliOutput: {
          command: "dashboard"
        }
      }),
      "/repo/.skfiy-smoke/chrome-current.json": JSON.stringify({
        result: "blocked",
        productPath: "dist/skfiy.app -> Chrome",
        blocker: "extension-unavailable"
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": [
        "dashboard-old.json",
        "dashboard-current.json",
        "chrome-current.json",
        "notes.txt"
      ]
    };
    const mtimes: Record<string, number> = {
      "/repo/.skfiy-smoke/dashboard-old.json": 10,
      "/repo/.skfiy-smoke/dashboard-current.json": 20,
      "/repo/.skfiy-smoke/chrome-current.json": 30
    };

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:00:00.000Z",
      io: {
        exists: (targetPath) =>
          Object.hasOwn(files, targetPath)
          || Object.hasOwn(directories, targetPath)
          || targetPath === "/repo/dist/skfiy.app"
          || targetPath === "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
          || targetPath === "/repo/dist/skfiy",
        readFile: (targetPath) => files[targetPath],
        readdir: (targetPath) => directories[targetPath] ?? [],
        stat: (targetPath) => ({ mtimeMs: mtimes[targetPath] ?? 0 })
      }
    });

    expect(snapshot.runtimeHealth).toMatchObject({
      package: {
        name: "skfiy",
        version: "0.1.0",
        description: "Desktop Computer Use prototype"
      },
      app: {
        state: "installed",
        path: "/repo/dist/skfiy.app",
        bundleId: "com.sskift.skfiy"
      },
      helper: {
        state: "installed",
        path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
      },
      cli: {
        state: "installed",
        path: "/repo/dist/skfiy"
      },
      dashboard: {
        state: "running",
        url: descriptor.url
      }
    });
    expect(snapshot.smokeEvidence.artifacts).toEqual([
      {
        target: "chrome",
        result: "blocked",
        path: "/repo/.skfiy-smoke/chrome-current.json",
        productPath: "dist/skfiy.app -> Chrome",
        mtimeMs: 30,
        blocker: "extension-unavailable"
      },
      {
        target: "dashboard",
        result: "passed",
        path: "/repo/.skfiy-smoke/dashboard-current.json",
        productPath: "dist/skfiy -> skfiy dashboard -> loopback dashboard server",
        mtimeMs: 20
      }
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });
});
