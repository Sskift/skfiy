import { describe, expect, it } from "vitest";
import {
  createDoctorOutput,
  type CliDoctorStatusInput
} from "./cli-doctor-output";

const statusInput: CliDoctorStatusInput = {
  rootDir: "/repo",
  homeDir: "/Users/tester",
  appPath: "/repo/dist/skfiy.app",
  helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
  cliShimPath: "/repo/dist/skfiy",
  extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
  dashboardUrl: "http://127.0.0.1:8787/"
};

describe("CLI doctor output", () => {
  it("assembles diagnostics, preflight state, and readiness from status probes", () => {
    const output = createDoctorOutput({
      statusInput,
      signature: {
        state: "unknown",
        reason: "Code signature was not checked."
      },
      status: {
        app: {
          state: "installed",
          path: statusInput.appPath
        },
        cli: {
          state: "missing",
          path: statusInput.cliShimPath
        },
        helper: {
          state: "installed",
          path: "/repo/dist/skfiy-helper"
        },
        permissions: {
          screenRecording: "denied",
          accessibility: "unknown",
          finderAutomation: "unknown"
        },
        desktopSession: {
          state: "blocked",
          controllable: false,
          frontmostBundleId: "com.apple.loginwindow",
          mainDisplayAsleep: true
        },
        extension: {
          state: "connected",
          liveConnection: "connected",
          hostPolicy: {
            state: "invalid",
            path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
            reason: "Policy file is not valid JSON."
          },
          pageControl: {
            state: "needs-action",
            reason: "Chrome pageControl is not ready.",
            nextAction: "Open a controllable Chrome tab.",
            source: "extension.pageControl"
          }
        },
        nativeHost: {
          state: "missing",
          reason: "Native host manifest was not found."
        },
        dashboard: {
          state: "running",
          api: {
            chromeHostPolicy: {
              state: "blocked",
              status: 403,
              reason: "Dashboard token was rejected."
            }
          }
        },
        moneyRun: {
          state: "observing",
          session: "money-run",
          source: "tmux-read-only-probe",
          mutatesSession: false
        }
      }
    });

    expect(output).toEqual(expect.objectContaining({
      result: "needs-action",
      capabilities: {
        chromeExtensionPageSafety: false,
        chromeExtensionPageControl: false
      },
      preflight: expect.objectContaining({
        runtime: expect.objectContaining({
          appState: "installed",
          cliState: "missing",
          helperState: "installed"
        }),
        dashboard: expect.objectContaining({
          state: "running",
          api: {
            chromeHostPolicy: expect.objectContaining({
              state: "blocked",
              status: 403
            })
          }
        }),
        chrome: expect.objectContaining({
          hostPolicy: expect.objectContaining({
            state: "invalid"
          }),
          pageControl: expect.objectContaining({
            state: "needs-action",
            source: "extension.pageControl"
          })
        })
      })
    }));
    expect(output.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "cli-binary-missing", severity: "error" }),
      expect.objectContaining({ code: "helper-location", severity: "error" }),
      expect.objectContaining({ code: "code-signature", severity: "warning" }),
      expect.objectContaining({ code: "screen-recording-permission", severity: "error" }),
      expect.objectContaining({ code: "accessibility-permission", severity: "error" }),
      expect.objectContaining({ code: "finder-automation-unknown", severity: "info" }),
      expect.objectContaining({ code: "desktop-session-blocked", severity: "error" }),
      expect.objectContaining({ code: "chrome-native-host", severity: "warning" }),
      expect.objectContaining({ code: "dashboard-api-unreachable", severity: "warning" }),
      expect.objectContaining({ code: "chrome-host-policy-invalid", severity: "warning" }),
      expect.objectContaining({ code: "chrome-page-control-readiness", severity: "warning" })
    ]));
    expect(output.nextActions).toEqual(expect.arrayContaining([
      "Open a controllable Chrome tab.",
      "Run `npm run build` so dist/skfiy exists before product smoke or dogfood runs."
    ]));
    expect(output.status).toEqual(expect.objectContaining({
      readiness: expect.objectContaining({
        state: "needs-action",
        ready: false
      })
    }));
  });

  it("returns ok when runtime, permissions, dashboard, and Chrome pageControl are ready", () => {
    const output = createDoctorOutput({
      statusInput,
      signature: { state: "valid" },
      status: {
        app: {
          state: "installed",
          path: statusInput.appPath
        },
        cli: {
          state: "installed",
          path: statusInput.cliShimPath
        },
        helper: {
          state: "installed",
          path: statusInput.helperPath
        },
        permissions: {
          screenRecording: "granted",
          accessibility: "granted",
          finderAutomation: "granted"
        },
        desktopSession: {
          state: "controllable",
          controllable: true
        },
        extension: {
          state: "connected",
          liveConnection: "connected",
          connection: {
            state: "connected",
            liveConnection: "connected",
            messageType: "skfiy.page.observe"
          },
          hostPolicy: {
            state: "default",
            policy: {
              defaultMode: "ask",
              allowedHosts: [],
              currentTurnAllowedHosts: [],
              blockedHosts: []
            }
          },
          pageControl: {
            state: "ready",
            source: "extension.pageControl"
          }
        },
        nativeHost: {
          state: "installed",
          cliShimPath: statusInput.cliShimPath,
          extensionIds: statusInput.extensionIds
        },
        dashboard: {
          state: "running",
          api: {
            chromeHostPolicy: {
              state: "reachable"
            }
          }
        },
        moneyRun: {
          state: "observing",
          session: "money-run",
          source: "tmux-read-only-probe",
          mutatesSession: false
        }
      }
    });

    expect(output).toEqual(expect.objectContaining({
      result: "ok",
      capabilities: {
        chromeExtensionPageSafety: true,
        chromeExtensionPageControl: true
      },
      diagnostics: [],
      nextActions: [],
      readiness: expect.objectContaining({
        state: "ready",
        ready: true
      })
    }));
  });
});
