import { describe, expect, it } from "vitest";
import {
  createBinaryReadinessEvidence,
  createStatusReadinessSummary,
  createUnknownMoneyRunStatus
} from "./cli-status-readiness";

describe("CLI status readiness", () => {
  it("aggregates runtime, dashboard, extension, and money-run blockers by area", () => {
    const readiness = createStatusReadinessSummary({
      app: { state: "installed" },
      cli: { state: "installed" },
      helper: { state: "missing" },
      permissions: {
        screenRecording: "granted",
        accessibility: "denied"
      },
      desktopSession: { state: "loginwindow" },
      dashboard: {
        state: "stopped",
        url: "http://127.0.0.1:61111/?token=secret"
      },
      moneyRun: {
        state: "stopped",
        mutatesSession: true
      }
    }, {
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      dashboardUrl: "http://127.0.0.1:61111/?token=secret"
    }, {
      state: "needs-action",
      ready: false,
      blockers: [{
        code: "page-control-not-ready",
        message: "Page control is blocked."
      }]
    });

    expect(readiness).toMatchObject({
      state: "needs-action",
      ready: false,
      checks: {
        runtime: {
          state: "needs-action",
          ready: false,
          helperState: "missing",
          desktopSessionState: "loginwindow"
        },
        dashboard: {
          state: "needs-action",
          ready: false,
          dashboardState: "stopped"
        },
        extension: {
          state: "needs-action"
        },
        moneyRun: {
          state: "needs-action",
          mutatesSession: true
        }
      },
      blockers: expect.arrayContaining([
        expect.objectContaining({ area: "runtime", code: "helper-not-installed" }),
        expect.objectContaining({ area: "runtime", code: "accessibility-not-granted" }),
        expect.objectContaining({ area: "runtime", code: "desktop-session-blocked" }),
        expect.objectContaining({ area: "dashboard", code: "dashboard-not-running" }),
        expect.objectContaining({ area: "extension", code: "page-control-not-ready" }),
        expect.objectContaining({ area: "moneyRun", code: "money-run-not-observing" }),
        expect.objectContaining({ area: "moneyRun", code: "money-run-mutating-probe" })
      ])
    });
    expect(JSON.stringify(readiness)).not.toContain("secret");
  });

  it("builds binary readiness evidence from status with path fallbacks", () => {
    expect(createBinaryReadinessEvidence({
      app: { state: "installed" },
      cli: { state: "missing" },
      helper: { state: "installed", path: "/custom/helper" }
    }, {
      appPath: "/repo/dist/skfiy.app",
      cliShimPath: "/repo/dist/skfiy",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
    })).toEqual({
      state: "needs-action",
      ready: false,
      app: {
        state: "installed",
        path: "/repo/dist/skfiy.app"
      },
      cli: {
        state: "missing",
        path: "/repo/dist/skfiy"
      },
      helper: {
        state: "installed",
        path: "/custom/helper"
      }
    });
  });

  it("keeps unknown money-run status read-only and non-mutating", () => {
    expect(createUnknownMoneyRunStatus()).toEqual({
      state: "unknown",
      session: "money-run",
      source: "tmux-read-only-probe",
      mutatesSession: false,
      reason: "money-run tmux supervision has not been probed yet."
    });
  });
});
