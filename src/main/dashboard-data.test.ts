import { describe, expect, it } from "vitest";
import { createDashboardDescriptor } from "./dashboard-status";
import {
  createDashboardSnapshot,
  createDashboardWorkspaceSnapshot
} from "./dashboard-data";
import { createRuntimeSnapshotStatePath } from "./runtime-snapshot";

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
      dogfoodRelease: {
        state: "unknown"
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
        result: "passed",
        productPath: "renderer -> preload -> main -> CDP -> Chrome",
        nativeHostBridgeRun: {
          result: "passed",
          productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
          response: {
            type: "skfiy.native.response",
            requestId: "chrome-smoke-native-host",
            result: "accepted"
          },
          heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home/Library/Application Support/skfiy/chrome-extension-connection.json",
          heartbeat: {
            hostName: "com.sskift.skfiy",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            messageType: "skfiy.page.observe",
            requestId: "chrome-smoke-native-host"
          }
        },
        installedExtensionRun: {
          result: "blocked",
          productPath: "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat",
          chromeVersion: "Chrome/146.0.7680.80",
          blockedReason: "branded_chrome_load_extension_removed",
          recommendedBrowser: "Chrome for Testing or Chromium",
          diagnosticExtensions: [
            {
              id: "fignfifoniblkonapihmkfakmlgkbkcf",
              manifestName: "Google Network Speech"
            }
          ]
        }
      }),
      "/repo/.skfiy-smoke/chrome-dashboard-native-bridge-postbuild.json": JSON.stringify({
        result: "passed",
        productPath: "renderer -> preload -> main -> CDP -> Chrome",
        nativeHostBridgeRun: {
          result: "passed",
          productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
          response: {
            type: "skfiy.native.response",
            requestId: "chrome-smoke-native-host",
            result: "accepted"
          },
          heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home-postbuild/Library/Application Support/skfiy/chrome-extension-connection.json",
          heartbeat: {
            hostName: "com.sskift.skfiy",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            messageType: "skfiy.page.observe",
            requestId: "chrome-smoke-native-host"
          }
        },
        installedExtensionRun: {
          result: "blocked",
          productPath: "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat",
          chromeVersion: "Chrome/146.0.7680.80",
          blockedReason: "branded_chrome_load_extension_removed",
          recommendedBrowser: "Chrome for Testing or Chromium",
          diagnosticExtensions: [
            {
              id: "fignfifoniblkonapihmkfakmlgkbkcf",
              manifestName: "Google Network Speech"
            }
          ]
        }
      }),
      "/repo/.skfiy-smoke/cli-current.json": JSON.stringify({
        result: "passed",
        productPath: "dist/skfiy -> skfiy CLI command matrix"
      }),
      "/repo/.skfiy-smoke/codex-plugin-current.json": JSON.stringify({
        result: "passed",
        productPath: "plugin scaffold -> staged marketplace install -> .mcp.json -> packaged skfiy CLI -> MCP stdio"
      }),
      "/repo/docs/release-evidence/latest-alpha.json": JSON.stringify({
        schemaVersion: 1,
        appName: "skfiy",
        tagName: "skfiy-alpha-def4567",
        releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-def4567",
        commitSha: "def4567890abcdef1234567890abcdef12345678",
        artifactBaseName: "skfiy-0.1.0-def4567-macos-unsigned",
        manifestPath: ".skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
        zipPath: ".skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.zip",
        zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        smokeArtifacts: {
          ui: ".skfiy-smoke/ui-def4567.json",
          ghostty: ".skfiy-smoke/ghostty-def4567.json",
          chrome: ".skfiy-smoke/chrome-def4567.json",
          finder: ".skfiy-smoke/finder-def4567.json",
          voice: ".skfiy-smoke/voice-def4567.json",
          moneyRun: ".skfiy-smoke/money-run-def4567.json"
        },
        dogfoodStatus: "waiting-for-dogfood",
        publishedAt: "2026-06-19T17:56:02.518Z"
      }),
      "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json": JSON.stringify({
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "def4567890abcdef1234567890abcdef12345678",
        bundleIdentifier: "com.sskift.skfiy",
        artifactBaseName: "skfiy-0.1.0-def4567-macos-unsigned",
        zip: {
          path: ".skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.zip",
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      }),
      "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.zip": "zip-bytes",
      "/repo/.skfiy-dogfood/internal-alpha-cohort.json": JSON.stringify({
        schemaVersion: 1,
        cohortName: "internal-alpha",
        manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
        reports: [
          {
            testerId: "tester-a",
            result: "passed",
            workflows: ["coding-terminal", "screenshot-inspection"],
            source: {
              type: "github-issue",
              issueUrl: "https://github.com/Sskift/skfiy/issues/101",
              issueLabels: [
                "dogfood:accepted",
                "workflow:coding-terminal",
                "workflow:screenshot-inspection"
              ]
            }
          },
          {
            testerId: "tester-b",
            result: "passed",
            workflows: ["finder-file"],
            source: {
              type: "github-issue",
              issueUrl: "https://github.com/Sskift/skfiy/issues/102",
              issueLabels: [
                "dogfood:accepted",
                "workflow:finder-file"
              ]
            }
          },
          {
            testerId: "tester-c",
            result: "blocked",
            workflows: ["browser-fallback"],
            source: {
              type: "github-issue",
              issueUrl: "https://github.com/Sskift/skfiy/issues/103",
              issueLabels: [
                "dogfood:accepted",
                "workflow:browser-fallback"
              ]
            }
          }
        ]
      }),
      "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json": JSON.stringify({
        name: "com.sskift.skfiy",
        description: "skfiy desktop Computer Use bridge",
        path: "/repo/dist/skfiy",
        type: "stdio",
        allowed_origins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ]
      }),
      "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json": JSON.stringify({
        schemaVersion: 1,
        hostName: "com.sskift.skfiy",
        observedAt: "2026-06-19T23:59:00.000Z",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: "skfiy.page.observe",
        requestId: "request-heartbeat"
      }),
      "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json": JSON.stringify({
        schemaVersion: 1,
        policy: {
          defaultMode: "ask",
          allowedHosts: ["Example.com"],
          currentTurnAllowedHosts: ["turn.example"],
          blockedHosts: ["blocked.example"]
        }
      }),
      "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json": JSON.stringify({
        schemaVersion: 1,
        observedAt: "2026-06-19T23:59:30.000Z",
        currentTurn: {
          state: "approval_required",
          command: "pwd",
          targetApp: "Ghostty",
          targetBundleId: "com.mitchellh.ghostty",
          risk: "low",
          plannerProvider: "External CUA",
          approvalRequired: true,
          latestMessage: "Approval required (low): Read-only terminal command.",
          source: "runtime-snapshot"
        },
        replay: {
          state: "available",
          outcome: "running",
          screenshotCount: 1,
          actionCount: 3,
          verificationCount: 1,
          timelineCount: 1,
          latestMessage: "Approval required (low): Read-only terminal command.",
          source: "runtime-snapshot"
        }
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/docs": ["release-evidence"],
      "/repo/docs/release-evidence": ["latest-alpha.json"],
      "/repo/.skfiy-alpha": [
        "skfiy-0.1.0-def4567-macos-unsigned.json",
        "skfiy-0.1.0-def4567-macos-unsigned.zip"
      ],
      "/repo/.skfiy-dogfood": ["internal-alpha-cohort.json"],
      "/repo/.skfiy-smoke": [
        "dashboard-old.json",
        "dashboard-current.json",
        "chrome-current.json",
        "chrome-dashboard-native-bridge-postbuild.json",
        "cli-current.json",
        "codex-plugin-current.json",
        "notes.txt"
      ]
    };
    const mtimes: Record<string, number> = {
      "/repo/.skfiy-smoke/dashboard-old.json": 10,
      "/repo/.skfiy-smoke/dashboard-current.json": Date.parse("2026-06-20T00:00:00.000Z"),
      "/repo/.skfiy-smoke/chrome-current.json": Date.parse("2026-06-18T23:59:59.000Z"),
      "/repo/.skfiy-smoke/chrome-dashboard-native-bridge-postbuild.json": Date.parse("2026-06-19T23:59:30.000Z"),
      "/repo/.skfiy-smoke/cli-current.json": Date.parse("2026-06-19T23:59:00.000Z"),
      "/repo/.skfiy-smoke/codex-plugin-current.json": Date.parse("2026-06-19T23:58:00.000Z"),
      "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json": Date.parse("2026-06-19T23:59:10.000Z")
    };
    const tmuxCalls: string[] = [];
    const windowsOutput = [
      "@1\t0\tagent\t1\t2",
      "@2\t1\tlogs\t0\t1"
    ].join("\n");
    const panesOutput = [
      "money-run\t@1\t0\tagent\t%1\t0\t1\t0\tzsh\tmain",
      "money-run\t@1\t0\tagent\t%2\t1\t0\t0\tnode\tworker",
      "money-run\t@2\t1\tlogs\t%3\t0\t0\t0\ttail\tlogs"
    ].join("\n");

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
        stat: (targetPath) => ({ mtimeMs: mtimes[targetPath] ?? 0 }),
        homeDir: () => "/Users/tester",
        pid: () => 4242,
        uptimeSeconds: () => 17,
        codeSignature: (appPath) => ({
          state: "valid",
          appPath,
          requirement: 'designated => identifier "com.sskift.skfiy"'
        }),
        permissions: () => ({
          screenRecording: { granted: true, status: "authorized" },
          accessibility: { granted: true, status: "authorized" },
          microphone: { granted: true, status: "authorized" },
          speechRecognition: { granted: false, status: "notDetermined" }
        }),
        gitHead: () => ({
          state: "present",
          commitSha: "fedcba9876543210fedcba9876543210fedcba98",
          shortCommit: "fedcba9"
        }),
        tmux: (args: string[]) => {
          tmuxCalls.push(`tmux ${args.join(" ")}`);

          if (args[0] === "has-session") {
            return { status: 0, stdout: "", stderr: "" };
          }

          if (args[0] === "list-windows") {
            return { status: 0, stdout: windowsOutput, stderr: "" };
          }

          if (args[0] === "list-panes") {
            return { status: 0, stdout: panesOutput, stderr: "" };
          }

          if (args[0] === "capture-pane" && args[3] === "%1") {
            return { status: 0, stdout: "building...\nwaiting for next event", stderr: "" };
          }

          if (args[0] === "capture-pane" && args[3] === "%2") {
            return { status: 0, stdout: "worker ready", stderr: "" };
          }

          if (args[0] === "capture-pane" && args[3] === "%3") {
            return { status: 0, stdout: "logs streaming", stderr: "" };
          }

          return { status: 1, stdout: "", stderr: `unexpected tmux args: ${args.join(" ")}` };
        },
        desktopSession: () => ({
          state: "blocked",
          controllable: false,
          frontmostBundleId: "com.apple.loginwindow",
          frontmostLocalizedName: "loginwindow",
          frontmostProcessIdentifier: 591,
          mainDisplayAsleep: false
        })
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
        bundleId: "com.sskift.skfiy",
        signing: {
          state: "valid",
          appPath: "/repo/dist/skfiy.app",
          requirement: 'designated => identifier "com.sskift.skfiy"'
        }
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
        url: descriptor.url,
        pid: 4242,
        uptimeSeconds: 17
      },
      desktopSession: {
        state: "blocked",
        controllable: false,
        frontmostBundleId: "com.apple.loginwindow",
        frontmostLocalizedName: "loginwindow",
        frontmostProcessIdentifier: 591,
        mainDisplayAsleep: false
      },
      nativeHost: {
        state: "installed",
        hostName: "com.sskift.skfiy",
        manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
        cliShimPath: "/repo/dist/skfiy",
        allowedOrigins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ],
        reason: "Chrome Native Messaging host is installed."
      },
      extension: {
        state: "connected",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed",
        allowedOrigins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ],
        connection: {
          state: "connected",
          liveConnection: "connected",
          ageSeconds: 60,
          observedAt: "2026-06-19T23:59:00.000Z",
          launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          messageType: "skfiy.page.observe",
          requestId: "request-heartbeat"
        },
        hostPolicy: {
          schemaVersion: 1,
          state: "configured",
          path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
          source: "chrome-host-policy-file",
          updatedAt: "2026-06-19T23:59:10.000Z",
          policy: {
            defaultMode: "ask",
            allowedHosts: ["example.com"],
            currentTurnAllowedHosts: ["turn.example"],
            blockedHosts: ["blocked.example"]
          },
          entries: [
            {
              host: "example.com",
              scope: "always",
              decision: "allow"
            },
            {
              host: "turn.example",
              scope: "current-turn",
              decision: "allow"
            },
            {
              host: "blocked.example",
              scope: "host",
              decision: "block"
            }
          ]
        }
      }
    });
    expect(snapshot.dogfoodRelease).toMatchObject({
      state: "cohort-ready",
      latestAlpha: {
        state: "published",
        path: "/repo/docs/release-evidence/latest-alpha.json",
        tagName: "skfiy-alpha-def4567",
        releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-def4567",
        commitSha: "def4567890abcdef1234567890abcdef12345678",
        shortCommit: "def4567",
        artifactBaseName: "skfiy-0.1.0-def4567-macos-unsigned",
        manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
        zipPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.zip",
        zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        dogfoodStatus: "waiting-for-dogfood",
        publishedAt: "2026-06-19T17:56:02.518Z"
      },
      currentHead: {
        state: "present",
        commitSha: "fedcba9876543210fedcba9876543210fedcba98",
        shortCommit: "fedcba9"
      },
      releaseDrift: {
        state: "behind-head",
        releaseCommitSha: "def4567890abcdef1234567890abcdef12345678",
        currentHeadCommitSha: "fedcba9876543210fedcba9876543210fedcba98"
      },
      manifest: {
        state: "present",
        path: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
        appName: "skfiy",
        commitSha: "def4567890abcdef1234567890abcdef12345678",
        bundleIdentifier: "com.sskift.skfiy",
        zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      },
      cohort: {
        state: "present",
        path: "/repo/.skfiy-dogfood/internal-alpha-cohort.json",
        cohortName: "internal-alpha",
        manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
        totalReports: 3,
        acceptedReportCount: 3,
        distinctRealTesterCount: 3,
        ready: true,
        passedReady: false,
        workflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": true,
          "browser-fallback": true
        },
        passedWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": true,
          "browser-fallback": false
        },
        acceptedReportIssueUrls: [
          "https://github.com/Sskift/skfiy/issues/101",
          "https://github.com/Sskift/skfiy/issues/102",
          "https://github.com/Sskift/skfiy/issues/103"
        ]
      }
    });
    expect(snapshot.permissions).toEqual({
      screenRecording: "granted",
      accessibility: "granted",
      microphone: "granted",
      speechRecognition: "not-determined",
      finderAutomation: "unknown"
    });
    expect(snapshot.currentTurn).toMatchObject({
      state: "approval_required",
      command: "pwd",
      targetApp: "Ghostty",
      targetBundleId: "com.mitchellh.ghostty",
      risk: "low",
      plannerProvider: "External CUA",
      approvalRequired: true,
      latestMessage: "Approval required (low): Read-only terminal command.",
      source: "runtime-snapshot"
    });
    expect(snapshot.replay).toMatchObject({
      state: "available",
      outcome: "running",
      screenshotCount: 1,
      actionCount: 3,
      verificationCount: 1,
      timelineCount: 1,
      latestMessage: "Approval required (low): Read-only terminal command.",
      source: "runtime-snapshot"
    });
    expect(snapshot.longHorizon).toMatchObject({
      state: "observing",
      session: "money-run",
      source: "tmux-read-only-probe",
      mutatesSession: false,
      summary: {
        windowCount: 2,
        paneCount: 3,
        activePaneIds: ["%1"],
        deadPaneIds: []
      },
      activePane: {
        id: "%1",
        windowName: "agent",
        currentCommand: "zsh",
        title: "main",
        recentTailPreview: "building...\nwaiting for next event"
      },
      signals: [],
      recommendation: {
        action: "continue_observing",
        reason: "money-run has 2 windows, 3 panes, and no obvious block markers.",
        mutatesSession: false
      }
    });
    expect(snapshot.longHorizon.probeCommands).toEqual(tmuxCalls);
    expect(snapshot.longHorizon.probeCommands).toContain("tmux capture-pane -p -t %1 -S -120");
    expect(snapshot.smokeEvidence.artifacts).toEqual([
      {
        target: "chrome",
        result: "passed",
        path: "/repo/.skfiy-smoke/chrome-dashboard-native-bridge-postbuild.json",
        productPath: "renderer -> preload -> main -> CDP -> Chrome",
        mtimeMs: Date.parse("2026-06-19T23:59:30.000Z"),
        ageSeconds: 30,
        stale: false,
        nativeHostBridge: {
          result: "passed",
          productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
          responseResult: "accepted",
          heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home-postbuild/Library/Application Support/skfiy/chrome-extension-connection.json",
          heartbeatHostName: "com.sskift.skfiy",
          heartbeatLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          heartbeatMessageType: "skfiy.page.observe",
          heartbeatRequestId: "chrome-smoke-native-host"
        },
        installedExtension: {
          result: "blocked",
          productPath: "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat",
          chromeVersion: "Chrome/146.0.7680.80",
          blockedReason: "branded_chrome_load_extension_removed",
          recommendedBrowser: "Chrome for Testing or Chromium",
          diagnosticExtensionNames: ["Google Network Speech"]
        }
      },
      {
        target: "cli",
        result: "passed",
        path: "/repo/.skfiy-smoke/cli-current.json",
        productPath: "dist/skfiy -> skfiy CLI command matrix",
        mtimeMs: Date.parse("2026-06-19T23:59:00.000Z"),
        ageSeconds: 60,
        stale: false
      },
      {
        target: "codex-plugin",
        result: "passed",
        path: "/repo/.skfiy-smoke/codex-plugin-current.json",
        productPath: "plugin scaffold -> staged marketplace install -> .mcp.json -> packaged skfiy CLI -> MCP stdio",
        mtimeMs: Date.parse("2026-06-19T23:58:00.000Z"),
        ageSeconds: 120,
        stale: false
      },
      {
        target: "dashboard",
        result: "passed",
        path: "/repo/.skfiy-smoke/dashboard-current.json",
        productPath: "dist/skfiy -> skfiy dashboard -> loopback dashboard server",
        mtimeMs: Date.parse("2026-06-20T00:00:00.000Z"),
        ageSeconds: 0,
        stale: false
      }
    ]);
    expect(snapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: "smoke-evidence-stale"
    }));
    expect(snapshot.alerts).toContainEqual({
      code: "release-artifact-older-than-head",
      severity: "warning",
      message: "Latest alpha release is older than current git HEAD.",
      releaseCommitSha: "def4567890abcdef1234567890abcdef12345678",
      currentHeadCommitSha: "fedcba9876543210fedcba9876543210fedcba98"
    });
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });

  it("isolates a damaged runtime snapshot and replaces it with a clean empty snapshot", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const runtimePath = createRuntimeSnapshotStatePath("/Users/tester");
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0",
        description: "Desktop Computer Use prototype"
      }),
      [runtimePath]: "{ damaged runtime snapshot"
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": []
    };
    const renamed: Array<{ fromPath: string; toPath: string }> = [];
    const writes: Array<{ targetPath: string; content: string }> = [];
    const io = {
      exists: (targetPath: string) =>
        Object.hasOwn(files, targetPath)
        || Object.hasOwn(directories, targetPath),
      readFile: (targetPath: string) => files[targetPath],
      writeFile: (targetPath: string, content: string) => {
        writes.push({ targetPath, content });
        files[targetPath] = content;
      },
      rename: (fromPath: string, toPath: string) => {
        renamed.push({ fromPath, toPath });
        files[toPath] = files[fromPath];
        delete files[fromPath];
      },
      readdir: (targetPath: string) => directories[targetPath] ?? [],
      stat: () => ({ mtimeMs: 0 }),
      homeDir: () => "/Users/tester",
      pid: () => 4242,
      uptimeSeconds: () => 17,
      gitHead: () => ({
        state: "present",
        commitSha: "fedcba9876543210fedcba9876543210fedcba98"
      }),
      tmux: () => ({
        status: 1,
        stdout: "",
        stderr: "tmux session was not found."
      })
    };

    const firstSnapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:00:00.000Z",
      io
    });

    expect(renamed).toHaveLength(1);
    expect(renamed[0].fromPath).toBe(runtimePath);
    expect(renamed[0].toPath).toMatch(
      /runtime-snapshot\.json\.corrupt-20260620T000000000Z-[a-f0-9]{12}\.json$/
    );
    expect(files[renamed[0].toPath]).toBe("{ damaged runtime snapshot");
    expect(writes).toHaveLength(1);
    expect(writes[0].targetPath).toBe(runtimePath);
    expect(JSON.parse(files[runtimePath])).toMatchObject({
      schemaVersion: 1,
      observedAt: "2026-06-20T00:00:00.000Z",
      currentTurn: {
        state: "idle",
        source: "runtime-snapshot"
      },
      replay: {
        state: "empty",
        source: "runtime-snapshot"
      }
    });
    expect(firstSnapshot.runtimeHealth.runtimeSnapshot).toMatchObject({
      state: "repaired",
      path: runtimePath,
      isolatedPath: renamed[0].toPath,
      replacementPath: runtimePath,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      reason: expect.stringContaining("JSON")
    });
    expect(firstSnapshot.currentTurn).toMatchObject({
      state: "idle",
      source: "runtime-snapshot",
      path: runtimePath,
      recovery: {
        state: "repaired",
        isolatedPath: renamed[0].toPath,
        replacementPath: runtimePath
      }
    });
    expect(firstSnapshot.replay).toMatchObject({
      state: "empty",
      source: "runtime-snapshot",
      recovery: {
        state: "repaired"
      }
    });
    expect(firstSnapshot.alerts).toContainEqual({
      code: "runtime-snapshot-repaired",
      severity: "warning",
      message: "Runtime snapshot was isolated and replaced with an empty snapshot.",
      path: runtimePath,
      isolatedPath: renamed[0].toPath
    });
    expect(JSON.stringify(firstSnapshot)).not.toContain("token=");

    renamed.length = 0;
    writes.length = 0;

    const secondSnapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:01:00.000Z",
      io
    });

    expect(renamed).toEqual([]);
    expect(writes).toEqual([]);
    expect(secondSnapshot.runtimeHealth.runtimeSnapshot).toMatchObject({
      state: "available",
      path: runtimePath,
      observedAt: "2026-06-20T00:00:00.000Z"
    });
    expect(secondSnapshot.currentTurn).toMatchObject({
      state: "idle",
      source: "runtime-snapshot"
    });
    expect(secondSnapshot.currentTurn).not.toHaveProperty("recovery");
    expect(secondSnapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: "runtime-snapshot-repaired"
    }));
  });
});
