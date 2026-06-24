import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dashboard product smoke script", () => {
  it("is exposed as an npm script and launches the built CLI dashboard path", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const sourcePath = path.join(process.cwd(), "scripts/smoke-dashboard-product.mjs");
    const planSourcePath = path.join(process.cwd(), "scripts/smoke-dashboard-plan.mjs");

    expect(existsSync(sourcePath)).toBe(true);
    expect(existsSync(planSourcePath)).toBe(true);
    expect(packageJson.scripts).toMatchObject({
      "smoke:dashboard": "node scripts/smoke-dashboard-product.mjs"
    });

    const source = readFileSync(sourcePath, "utf8");
    const planSource = readFileSync(planSourcePath, "utf8");

    expect(source).toContain("acquireSmokeLock");
    expect(source).toContain("createDefaultDashboardSmokeOptions");
    expect(source).toContain("\"dashboard\"");
    expect(source).toContain("\"--no-open\"");
    expect(source).toContain("\"--port\"");
    expect(source).toContain("\"0\"");
    expect(source).toContain("\"--json\"");
    expect(source).toContain("/descriptor.json");
    expect(source).toContain("/events");
    expect(source).toContain("/api/chrome-host-policy");
    expect(source).toContain("exerciseChromeHostPolicyApi");
    expect(source).toContain("seedRuntimeSnapshotFixture");
    expect(source).toContain("runtime-snapshot.json");
    expect(source).toContain("createRuntimeSnapshotCoverage");
    expect(source).toContain("runtimeSnapshotCoverage");
    expect(source).toContain("collectFreshInstallRuntimeSnapshotEvidence");
    expect(source).toContain("freshInstallRuntimeSnapshot");
    expect(source).toContain("collectMissingAfterTurnRuntimeSnapshotEvidence");
    expect(source).toContain("missingAfterTurnRuntimeSnapshot");
    expect(source).toContain("runtime-turn-marker.json");
    expect(source).toContain("operatorReadiness");
    expect(source).toContain("Knowledge graph");
    expect(source).toContain("collectDashboardScreenshotEvidence");
    expect(source).toContain("knowledgeGraphEvidence");
    expect(source).toContain("dashboard-knowledge-graph");
    expect(source).toContain("vaultNoteCount");
    expect(source).toContain("focusedNoteFound");
    expect(source).toContain("focusedBacklinkCount");
    expect(source).toContain("Vault lens");
    expect(source).toContain("vaultLensCount");
    expect(source).toContain("Focused neighborhood");
    expect(source).toContain("focusedNeighborhoodCount");
    expect(planSource).toContain("Learning loop");
    expect(source).toContain("learningLoopCount");
    expect(source).toContain("learningLoopTexts");
    expect(source).toContain("learningLoopList?.scrollIntoView");
    expect(source).toContain("personalSkillNodeCount");
    expect(source).toContain("personalSkillTexts");
    expect(planSource).toContain("guides prompt");
    expect(planSource).toContain("Vault notes");
    expect(planSource).toContain("Focused note");
    expect(source).toContain("Vault backlinks");
    expect(source).toContain("backlinkCount");
    expect(planSource).toContain("Recent session recall");
    expect(source).toContain("sessionNodeCount");
    expect(source).toContain("seedPersonalMemoryFixture");
    expect(source).toContain("exercisePersonalMemoryApi");
    expect(source).toContain("personalMemoryApi");
    expect(source).toContain("/api/personal-memory");
    expect(source).toContain("/api/personal-skills");
    expect(source).toContain("pending-memory-writes.json");
    expect(source).toContain("Pending user memory");
    expect(source).toContain("awaits approval");
    expect(source).toContain("personalMemory.usage");
    expect(source).toContain("exerciseChromeControlActionApi");
    expect(source).toContain("dashboardChromeControlActionApi");
    expect(source).toContain("collectRealHomeChromeControlActionEvidence");
    expect(source).toContain("realUserHomeDir");
    expect(source).toContain("extensionStatusBeforeActions");
    expect(source).toContain("collectChromeExtensionStatusBeforeDashboardActions");
    expect(source).toContain("DASHBOARD_CHROME_CONTROL_SMOKE_ACTIONS");
    expect(source).toContain("actionRuns");
    expect(source).toContain("runDashboardChromeControlActionWithRetry");
    expect(source).toContain("page-control-observe-not-verified");
  });

  it("parses dashboard smoke options for a repeatable loopback product run", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-dashboard-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      PRODUCT_PATH,
      createDashboardHelpText,
      createDefaultDashboardSmokeOptions,
      parseDashboardSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      PRODUCT_PATH: string;
      createDashboardHelpText: (defaults: Record<string, unknown>) => string;
      createDefaultDashboardSmokeOptions: (rootDir: string) => Record<string, unknown>;
      parseDashboardSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDashboardSmokeOptions("/repo");

    expect(PRODUCT_PATH).toBe("dist/skfiy -> skfiy dashboard -> loopback dashboard server");
    expect(defaults).toMatchObject({
      cliPath: path.join("/repo", "dist", "skfiy"),
      timeoutMs: 8_000,
      requirePassed: false,
      help: false
    });
    expect(parseDashboardSmokeArgs([
      "--cli",
      "dist/skfiy",
      "--output",
      ".skfiy-smoke/dashboard.json",
      "--extension-id",
      "plcpkkhlcacihjfohlojdknnkademlno",
      "--extension-chrome-app",
      "Chromium",
      "--timeout-ms",
      "1200",
      "--require-passed"
    ], defaults)).toMatchObject({
      cliPath: path.resolve("dist/skfiy"),
      outputPath: path.resolve(".skfiy-smoke/dashboard.json"),
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      extensionChromeAppName: "Chromium",
      timeoutMs: 1200,
      requirePassed: true
    });
    expect(createDashboardHelpText(defaults)).toContain("smoke:dashboard");
    expect(createDashboardHelpText(defaults)).toContain('--extension-chrome-app <name>');
    expect(createDashboardHelpText(defaults)).toContain('Use "Chromium" for dogfood.');
    expect(createDashboardHelpText(defaults)).toContain("--require-passed");
  });

  it("classifies dashboard evidence as passed only for the built CLI loopback path", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-dashboard-plan.mjs");
    const {
      PRODUCT_PATH,
      classifyDashboardSmokeEvidence,
      createRuntimeSnapshotCoverage
    } = await import(pathToFileURL(modulePath).href) as {
      PRODUCT_PATH: string;
      classifyDashboardSmokeEvidence: (input: Record<string, unknown>) => string;
      createRuntimeSnapshotCoverage: (input: Record<string, unknown>) => Record<string, unknown>;
    };
    const withRuntimeSnapshotCoverage = <T extends Record<string, unknown>>(evidence: T) => ({
      ...evidence,
      runtimeSnapshotCoverage: createRuntimeSnapshotCoverage(evidence)
    });
    const runtimeSnapshotFixture = {
      productPath: "smoke:dashboard -> isolated HOME -> runtime-snapshot.json",
      path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
      snapshot: {
        schemaVersion: 1,
        observedAt: "2026-06-20T00:00:00.000Z",
        currentTurn: {
          state: "approval_required",
          command: "dashboard smoke runtime snapshot fixture",
          targetApp: "Ghostty",
          targetBundleId: "com.mitchellh.ghostty",
          risk: "low",
          plannerProvider: "Dashboard Smoke Fixture",
          approvalRequired: true,
          approvalState: "required",
          stopState: "available",
          latestMessage: "Dashboard smoke runtime snapshot fixture is visible.",
          latestAction: {
            type: "verify",
            actionType: "type_text",
            status: "passed",
            message: "Dashboard smoke runtime snapshot fixture verification is visible."
          },
          latestVerification: {
            type: "verify",
            actionType: "type_text",
            status: "passed",
            message: "Dashboard smoke runtime snapshot fixture verification is visible."
          },
          latestScreenshot: {
            stage: "before",
            path: "/tmp/skfiy-dashboard-runtime-fixture-before.png",
            bundleId: "com.mitchellh.ghostty",
            recommendation: "structured_first",
            sourceCount: 2
          },
          source: "runtime-snapshot"
        },
        replay: {
          state: "available",
          outcome: "running",
          screenshotCount: 1,
          actionCount: 3,
          verificationCount: 1,
          timelineCount: 2,
          latestMessage: "Dashboard smoke runtime snapshot fixture is visible.",
          screenshots: [
            {
              stage: "before",
              path: "/tmp/skfiy-dashboard-runtime-fixture-before.png",
              bundleId: "com.mitchellh.ghostty",
              recommendation: "structured_first",
              sourceCount: 2
            }
          ],
          actions: [
            {
              type: "plan",
              providerLabel: "Dashboard Smoke Fixture",
              command: "dashboard smoke runtime snapshot fixture"
            },
            {
              type: "type_text",
              textLength: 40
            },
            {
              type: "verify",
              actionType: "type_text",
              status: "passed",
              message: "Dashboard smoke runtime snapshot fixture verification is visible."
            }
          ],
          verifications: [
            {
              type: "verify",
              actionType: "type_text",
              status: "passed",
              message: "Dashboard smoke runtime snapshot fixture verification is visible."
            }
          ],
          timelineTail: [
            {
              status: "executing",
              message: "Dashboard smoke runtime snapshot fixture started."
            },
            {
              status: "approval_required",
              command: "dashboard smoke runtime snapshot fixture",
              message: "Dashboard smoke runtime snapshot fixture is visible."
            }
          ],
          source: "runtime-snapshot"
        }
      }
    };
    const freshInstallRuntimeSnapshot = {
      productPath: "smoke:dashboard -> isolated fresh HOME -> missing runtime-snapshot.json",
      isolatedHomeDir: "/var/folders/skfiy-dashboard-fresh-home-abc123",
      runtimeSnapshotPath: "/var/folders/skfiy-dashboard-fresh-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json",
      runtimeSnapshotExistsBeforeLaunch: false,
      runtimeSnapshotExistsAfterFetch: false,
      cliOutput: {
        command: "dashboard",
        result: "running",
        url: "http://127.0.0.1:51235/"
      },
      snapshotResponse: {
        status: 200,
        body: {
          schemaVersion: 1,
          runtimeHealth: {
            runtimeSnapshot: {
              state: "missing",
              path: "/var/folders/skfiy-dashboard-fresh-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json",
              reason: "Runtime snapshot has not been recorded yet.",
              emptyReasonCode: "runtime-snapshot-missing",
              freshInstall: true
            }
          },
          currentTurn: {
            state: "idle",
            source: "runtime-snapshot",
            reason: "Runtime snapshot has not been recorded yet.",
            emptyReasonCode: "runtime-snapshot-missing",
            freshInstall: true,
            path: "/var/folders/skfiy-dashboard-fresh-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json"
          },
          replay: {
            state: "empty",
            source: "runtime-snapshot",
            reason: "Runtime snapshot has not been recorded yet.",
            emptyReasonCode: "runtime-snapshot-missing",
            freshInstall: true,
            path: "/var/folders/skfiy-dashboard-fresh-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json"
          }
        }
      },
      eventsResponse: {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform"
        },
        body: 'event: snapshot\ndata: {"schemaVersion":1,"generatedAt":"2026-06-20T00:00:00.000Z","currentTurn":{"state":"idle","source":"runtime-snapshot","reason":"Runtime snapshot has not been recorded yet.","emptyReasonCode":"runtime-snapshot-missing","freshInstall":true,"path":"/var/folders/skfiy-dashboard-fresh-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json"},"replay":{"state":"empty","source":"runtime-snapshot","reason":"Runtime snapshot has not been recorded yet.","emptyReasonCode":"runtime-snapshot-missing","freshInstall":true,"path":"/var/folders/skfiy-dashboard-fresh-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json"}}\n\n'
      },
      cleanup: {
        signal: "SIGTERM",
        exited: true,
        code: 0,
        signalCode: null
      },
      result: "collected"
    };
    const missingAfterTurnRuntimeSnapshot = {
      productPath: "smoke:dashboard -> isolated HOME marker -> missing runtime-snapshot.json",
      isolatedHomeDir: "/var/folders/skfiy-dashboard-marker-home-abc123",
      runtimeSnapshotPath: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json",
      markerPath: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-turn-marker.json",
      marker: {
        schemaVersion: 1,
        observedAt: "2026-06-20T00:00:00.000Z",
        currentTurn: {
          state: "executing",
          command: "dashboard smoke runtime turn marker",
          latestMessage: "Dashboard smoke runtime turn marker is visible.",
          source: "runtime-turn-marker"
        }
      },
      runtimeSnapshotExistsBeforeLaunch: false,
      markerExistsBeforeLaunch: true,
      runtimeSnapshotExistsAfterFetch: false,
      cliOutput: {
        command: "dashboard",
        result: "running",
        url: "http://127.0.0.1:51236/"
      },
      snapshotResponse: {
        status: 200,
        body: {
          schemaVersion: 1,
          runtimeHealth: {
            runtimeSnapshot: {
              state: "missing-after-turn",
              path: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json",
              reason: "Runtime snapshot is missing after a recent app turn was observed.",
              emptyReasonCode: "runtime-snapshot-missing-after-turn",
              freshInstall: false,
              markerPath: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-turn-marker.json",
              markerObservedAt: "2026-06-20T00:00:00.000Z",
              markerState: "recent",
              markerAgeSeconds: 0
            }
          },
          currentTurn: {
            state: "executing",
            command: "dashboard smoke runtime turn marker",
            latestMessage: "Dashboard smoke runtime turn marker is visible.",
            source: "runtime-turn-marker",
            reason: "Runtime snapshot is missing after a recent app turn was observed.",
            emptyReasonCode: "runtime-snapshot-missing-after-turn",
            freshInstall: false,
            markerPath: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-turn-marker.json",
            markerObservedAt: "2026-06-20T00:00:00.000Z",
            markerState: "recent",
            markerAgeSeconds: 0,
            path: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json"
          },
          replay: {
            state: "empty",
            source: "runtime-snapshot",
            reason: "Runtime snapshot is missing after a recent app turn was observed.",
            emptyReasonCode: "runtime-snapshot-missing-after-turn",
            freshInstall: false,
            markerPath: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-turn-marker.json",
            markerObservedAt: "2026-06-20T00:00:00.000Z",
            markerState: "recent",
            markerAgeSeconds: 0,
            path: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json"
          },
          alerts: [
            {
              code: "runtime-snapshot-missing-after-turn",
              severity: "warning",
              message: "Runtime snapshot is missing even though app turn evidence exists.",
              path: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-snapshot.json",
              markerPath: "/var/folders/skfiy-dashboard-marker-home-abc123/Library/Application Support/skfiy/runtime-turn-marker.json",
              markerObservedAt: "2026-06-20T00:00:00.000Z",
              markerState: "recent",
              markerAgeSeconds: 0
            }
          ]
        }
      },
      eventsResponse: {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform"
        },
        body: 'event: snapshot\ndata: {"schemaVersion":1,"generatedAt":"2026-06-20T00:00:00.000Z","currentTurn":{"state":"executing","command":"dashboard smoke runtime turn marker","source":"runtime-turn-marker","freshInstall":false},"replay":{"state":"empty","source":"runtime-snapshot","freshInstall":false}}\n\n'
      },
      cleanup: {
        signal: "SIGTERM",
        exited: true,
        code: 0,
        signalCode: null
      },
      result: "collected"
    };
    const passedEvidence = withRuntimeSnapshotCoverage({
      cliPath: "/repo/dist/skfiy",
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      artifactPath: "/repo/.skfiy-smoke/dashboard.json",
      command: ["/repo/dist/skfiy", "dashboard", "--no-open", "--port", "0", "--json"],
      cliOutput: {
        command: "dashboard",
        result: "running",
        serverPid: 4242,
        bind: { host: "127.0.0.1", port: 51234 },
        url: "http://127.0.0.1:51234/",
        statePath: "/Users/tester/Library/Application Support/skfiy/dashboard-server.json",
        shouldOpen: false,
        tokenPrinted: false,
        auth: {
          mode: "optional-token",
          tokenPrinted: false
        },
        updates: {
          transport: "sse",
          scope: "local-http"
        },
        eventStore: {
          mode: "append-only",
          requiredForExecution: false
        },
        descriptor: {
          bind: { host: "127.0.0.1", port: 51234 },
          url: "http://127.0.0.1:51234/",
          auth: {
            mode: "optional-token",
            tokenPrinted: false
          },
          updates: {
            transport: "sse",
            scope: "local-http"
          },
          eventStore: {
            mode: "append-only",
            requiredForExecution: false
          }
        }
      },
      descriptorResponse: {
        status: 200,
        body: {
          bind: { host: "127.0.0.1", port: 51234 },
          url: "http://127.0.0.1:51234/",
          auth: { tokenPrinted: false }
        }
      },
      snapshotResponse: {
        status: 200,
        body: {
          schemaVersion: 1,
          runtimeHealth: {
            package: {
              name: "skfiy",
              version: "0.1.0"
            },
            cli: {
              state: "installed",
              path: "/repo/dist/skfiy"
            },
            app: {
              state: "installed",
              signing: {
                state: "valid"
              }
            },
            nativeHost: {
              state: "missing",
              hostName: "com.sskift.skfiy",
              manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
              cliShimPath: "/repo/dist/skfiy",
              allowedOrigins: [],
              reason: "Chrome Native Messaging host manifest is not installed."
            },
            extension: {
              state: "native-host-missing",
              bridge: "native-messaging",
              liveConnection: "unknown",
              nativeHostState: "missing",
              manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
              hostPolicy: {
                schemaVersion: 1,
                state: "default",
                path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
                policy: {
                  defaultMode: "ask",
                  allowedHosts: [],
                  currentTurnAllowedHosts: [],
                  blockedHosts: []
                },
                reason: "Chrome host policy has not been configured yet."
              },
              reason: "Chrome Native Messaging host manifest is not installed."
            },
            dashboard: {
              state: "running",
              url: "http://127.0.0.1:51234/",
              pid: 4242,
              uptimeSeconds: 17
            },
            runtimeSnapshot: {
              state: "available",
              path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
              observedAt: "2026-06-20T00:00:00.000Z"
            },
            desktopSession: {
              state: "blocked",
              controllable: false,
              frontmostBundleId: "com.apple.loginwindow",
              mainDisplayAsleep: false
            }
          },
          operatorReadiness: {
            state: "ready",
            commandSurface: {
              state: "ready",
              path: "/repo/dist/skfiy",
              reason: "Packaged CLI command surface is available."
            },
            extensionReadiness: {
              state: "needs-evidence",
              bridge: "native-messaging",
              liveConnection: "unknown",
              nativeHostState: "missing",
              reason: "Chrome extension native messaging path is not ready."
            },
            packagedBinary: {
              state: "ready",
              checks: {
                app: true,
                helper: true,
                cli: true,
                signing: true
              },
              appPath: "/repo/dist/skfiy.app",
              helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
              cliPath: "/repo/dist/skfiy",
              signingState: "valid"
            },
            recentSmokeEvidence: {
              state: "ready",
              requiredTargets: ["chrome", "cli"],
              recentPassedTargets: ["chrome", "cli", "dashboard"],
              missingTargets: []
            }
          },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            finderAutomation: "unknown"
          },
          currentTurn: runtimeSnapshotFixture.snapshot.currentTurn,
          replay: runtimeSnapshotFixture.snapshot.replay,
          smokeEvidence: {
            artifacts: [
              {
                target: "chrome",
                result: "passed",
                path: "/repo/.skfiy-smoke/chrome-current.json",
                productPath: "renderer -> preload -> main -> CDP -> Chrome",
                nativeHostBridge: {
                  result: "passed",
                  productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
                  responseResult: "accepted",
                  heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home/Library/Application Support/skfiy/chrome-extension-connection.json",
                  heartbeatHostName: "com.sskift.skfiy",
                  heartbeatLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                  heartbeatMessageType: "skfiy.page.observe",
                  heartbeatRequestId: "chrome-smoke-native-host"
                },
                installedExtension: {
                  result: "blocked",
                  productPath: "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat",
                  browserSelection: {
                    chromeAppName: "Google Chrome",
                    source: "fallback-primary-browser",
                    loadExtensionFriendly: false,
                    candidateAppNames: ["Google Chrome for Testing", "Chromium"],
                    availableAppNames: ["Google Chrome"]
                  },
                  chromeVersion: "Chrome/146.0.7680.80",
                  blockedReason: "branded_chrome_load_extension_removed",
                  recommendedBrowser: "Chrome for Testing or Chromium",
                  diagnosticExtensionNames: ["Google Network Speech"]
                }
              }
            ]
          },
          dogfoodRelease: {
            state: "cohort-ready",
            latestAlpha: {
              state: "published",
              tagName: "skfiy-alpha-def4567",
              releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-def4567",
              commitSha: "def4567890abcdef1234567890abcdef12345678",
              manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
              zipPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.zip",
              zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
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
              sha256: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
              commitSha: "def4567890abcdef1234567890abcdef12345678",
              bundleIdentifier: "com.sskift.skfiy",
              zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            },
            cohort: {
              state: "present",
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
          },
          longHorizon: {
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
            },
            probeCommands: [
              "tmux has-session -t money-run",
              "tmux list-windows -t money-run -F #{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}",
              "tmux list-panes -t money-run -s -F #{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}",
              "tmux capture-pane -p -t %1 -S -120"
            ]
          },
          alerts: []
        }
      },
      eventsResponse: {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform"
        },
        body: 'event: snapshot\ndata: {"schemaVersion":1,"generatedAt":"2026-06-20T00:00:00.000Z","currentTurn":{"state":"idle"},"replay":{"state":"empty"}}\n\n'
      },
      shellResponse: {
        status: 200,
        body: '<!doctype html><main data-dashboard-root><span data-snapshot-state>Loading snapshot</span><div aria-label="skfiy user dashboard"><section data-user-panel="home"></section><section data-user-panel="approvals"></section><section data-user-panel="apps-sites"></section></div><details><summary>Advanced Diagnostics</summary><section data-panel-body="operator-readiness"></section><section data-panel-body="long-horizon-supervision"></section></details><a href="/descriptor.json"></a><a href="/snapshot.json"></a><script>new EventSource("/events"); fetch("/snapshot.json", { cache: "no-store" }); "/api/chrome-host-policy"; function renderUserDashboard(snapshot){} function readUserNextAction(snapshot){} function renderAppPolicyPanel(snapshot){} function renderOperatorReadinessPanel(snapshot){} function renderLongHorizonPanel(){} function renderAlertsPanel(snapshot){} function groupAlerts(alerts){} function createAlertBand(group){ const marker = "data-alert-groups"; return marker; }</script></main><title>skfiy Dashboard</title>'
      },
      knowledgeGraphEvidence: {
        productPath: "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph",
        dashboardUrl: "http://127.0.0.1:51234/",
        screenshotPath: "/repo/.skfiy-smoke/dashboard-knowledge-graph.png",
        screenshotBytes: 1024,
        regionFound: true,
        nodeCount: 8,
        linkCount: 9,
        vaultNoteCount: 7,
        focusedNoteFound: true,
        focusedNoteTitle: "User preferences.md",
        focusedBacklinkCount: 2,
        vaultLensCount: 7,
        vaultLensSummary: "Showing 8 of 8 notes",
        focusedNeighborhoodCount: 2,
        backlinkCount: 7,
        learningLoopCount: 4,
        sessionNodeCount: 2,
        personalSkillNodeCount: 2,
        pendingMemoryNodeCount: 1,
        pendingMemoryLinkCount: 2,
        fallbackTextOverlap: false,
        nodeTexts: [
          "User preferencesmemoryUser prefers concise Chinese updates.",
          "Concise Chinese progress updatesskillcommunication",
          "Obsidian-style knowledge dashboardskilldashboard",
          "Pending user memorymemoryadd · User wants memory writes reviewed before becoming durable.",
          "Latest sessionsessionCodex: hello",
          "Codexprovidersready",
          "Browser Contextbrowserdashboard-smoke.example",
          "Computer Usecomputer-useblocked"
        ],
        linkTexts: [
          "injects promptUser preferences -> Codex",
          "guides promptConcise Chinese progress updates -> Codex",
          "guides promptObsidian-style knowledge dashboard -> Codex",
          "stagesMemory review -> Pending user memory",
          "awaits approvalPending user memory -> User preferences",
          "recalls contextLatest session -> Codex",
          "observed inBrowser Context -> Latest session"
        ],
        backlinkTexts: [
          "User preferencesinjects promptCodex",
          "Pending user memoryawaits approvalUser preferences",
          "Memory reviewstagesPending user memory",
          "Latest sessionrecalls contextCodex",
          "Browser Contextobserved inLatest session"
        ],
        learningLoopTexts: [
          "Latest session -> teaches -> Memory review",
          "Memory review -> distills -> User preferences",
          "User preferences -> injects prompt -> Codex",
          "Codex -> answered -> Latest session"
        ],
        personalSkillTexts: [
          "Concise Chinese progress updatesskillcommunication",
          "Obsidian-style knowledge dashboardskilldashboard"
        ],
        vaultLensTexts: [
          "All 8",
          "Memory 2",
          "Skill 2",
          "Session 1",
          "Provider 1",
          "Browser 1",
          "Computer Use 1"
        ],
        vaultNoteTexts: [
          "User preferences.mdmemoryBacklinks 2injects prompt -> CodexPending user memory -> awaits approval",
          "Pending user memory.mdmemoryBacklinks 2Memory review -> stagesawaits approval -> User preferences",
          "Latest session.mdsessionBacklinks 2recalls context -> CodexBrowser Context -> observed in"
        ],
        focusedBacklinkTexts: [
          "injects prompt -> Codex",
          "Pending user memory -> awaits approval"
        ],
        focusedNeighborhoodTexts: [
          "Codexinjects promptoutgoing",
          "Pending user memoryawaits approvalincoming"
        ],
        result: "passed"
      },
      chromeHostPolicyApi: {
        productPath: "dist/skfiy -> dashboard /api/chrome-host-policy -> chrome-host-policy.json",
        apiUrl: "http://127.0.0.1:51234/api/chrome-host-policy",
        showDefault: {
          status: 200,
          body: {
            command: "dashboard chrome policy show",
            executesSystemMutation: false,
            hostPolicy: {
              schemaVersion: 1,
              state: "default",
              path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
              policy: {
                defaultMode: "ask",
                allowedHosts: [],
                currentTurnAllowedHosts: [],
                blockedHosts: []
              },
              reason: "Chrome host policy has not been configured yet."
            }
          }
        },
        setResponse: {
          status: 200,
          body: {
            command: "dashboard chrome policy set",
            source: "dashboard",
            plannedMutation: true,
            executesSystemMutation: true,
            result: "configured",
            action: "allow_current_turn",
            host: "dashboard-smoke.example",
            hostPolicy: {
              schemaVersion: 1,
              state: "configured",
              path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
              policy: {
                defaultMode: "ask",
                allowedHosts: [],
                currentTurnAllowedHosts: ["dashboard-smoke.example"],
                blockedHosts: []
              }
            }
          }
        },
        showConfigured: {
          status: 200,
          body: {
            command: "dashboard chrome policy show",
            executesSystemMutation: false,
            hostPolicy: {
              schemaVersion: 1,
              state: "configured",
              path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
              policy: {
                defaultMode: "ask",
                allowedHosts: [],
                currentTurnAllowedHosts: ["dashboard-smoke.example"],
                blockedHosts: []
              }
            }
          }
        },
        resetResponse: {
          status: 200,
          body: {
            command: "dashboard chrome policy reset",
            source: "dashboard",
            plannedMutation: true,
            executesSystemMutation: true,
            result: "reset",
            hostPolicy: {
              schemaVersion: 1,
              state: "default",
              path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
              policy: {
                defaultMode: "ask",
                allowedHosts: [],
                currentTurnAllowedHosts: [],
                blockedHosts: []
              }
            }
          }
        }
      },
      personalMemoryApi: {
        productPath: "smoke:dashboard -> isolated HOME memory fixture -> /api/personal-memory",
        apiUrl: "http://127.0.0.1:51234/api/personal-memory",
        fixture: {
          productPath: "smoke:dashboard -> isolated HOME -> personal memory files",
          userMemoryPath: "/Users/tester/Library/Application Support/skfiy/memory/USER.md",
          agentMemoryPath: "/Users/tester/Library/Application Support/skfiy/memory/AGENT.md",
          personalSkillSettingsPath: "/Users/tester/Library/Application Support/skfiy/memory/personal-skills.json",
          seededUserEntries: 2,
          seededAgentEntries: 1
        },
        snapshotBefore: {
          status: 200,
          body: {
            personalMemory: {
              userEntryCount: 2,
              agentEntryCount: 1,
              usage: {
                user: {
                  usedChars: 93,
                  limitChars: 1375,
                  percent: 6
                },
                agent: {
                  usedChars: 66,
                  limitChars: 2200,
                  percent: 3
                }
              },
              recentUserEntries: [
                "User prefers concise Chinese updates.",
                "[redacted sensitive memory]"
              ],
              recentAgentEntries: [
                "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
              ]
            }
          }
        },
        forgetResponse: {
          status: 200,
          body: {
            command: "dashboard personal memory",
            source: "dashboard",
            plannedMutation: true,
            executesSystemMutation: true,
            result: "forgotten",
            applied: 1,
            personalMemory: {
              userEntryCount: 1,
              agentEntryCount: 1
            }
          }
        },
        rejectedAddResponse: {
          status: 400,
          body: {
            command: "dashboard personal memory",
            result: "error",
            error: {
              code: "unknown-action"
            }
          }
        },
        snapshotAfter: {
          status: 200,
          body: {
            personalMemory: {
              userEntryCount: 1,
              agentEntryCount: 1,
              usage: {
                user: {
                  usedChars: 37,
                  limitChars: 1375,
                  percent: 2
                },
                agent: {
                  usedChars: 66,
                  limitChars: 2200,
                  percent: 3
                }
              },
              recentUserEntries: [
                "User prefers concise Chinese updates."
              ],
              recentAgentEntries: [
                "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
              ],
              personalSkills: [
                {
                  id: "communication-style",
                  label: "Concise Chinese progress updates"
                },
                {
                  id: "dashboard-knowledge-surface",
                  label: "Obsidian-style knowledge dashboard"
                }
              ]
            }
          }
        },
        personalSkillApiUrl: "http://127.0.0.1:51234/api/personal-skills",
        muteSkillResponse: {
          status: 200,
          body: {
            command: "dashboard personal skills",
            source: "dashboard",
            plannedMutation: true,
            executesSystemMutation: true,
            result: "muted",
            personalSkills: {
              disabledSkillIds: ["dashboard-knowledge-surface"],
              mutedSkillCount: 1
            }
          }
        },
        snapshotAfterSkillMute: {
          status: 200,
          body: {
            personalMemory: {
              userEntryCount: 1,
              agentEntryCount: 1,
              mutedPersonalSkillIds: ["dashboard-knowledge-surface"],
              personalSkills: [
                {
                  id: "communication-style",
                  label: "Concise Chinese progress updates"
                }
              ]
            }
          }
        },
        userMemoryFileAfter: {
          sensitiveEntryPresent: false,
          keptEntryPresent: true
        },
        personalSkillSettingsFileAfter: {
          path: "/Users/tester/Library/Application Support/skfiy/memory/personal-skills.json",
          dashboardKnowledgeSurfaceMuted: true
        },
        tokenLeakDetected: false,
        result: "passed"
      },
      dashboardStatusAutoDiscovery: {
        productPath: "dist/skfiy dashboard -> dashboard-server.json -> skfiy status --json",
        command: ["/repo/dist/skfiy", "status", "--json"],
        homeDir: "/Users/tester",
        expectedUrl: "http://127.0.0.1:51234/",
        expectedPid: 4242,
        expectedStatePath: "/Users/tester/Library/Application Support/skfiy/dashboard-server.json",
        exitCode: 0,
        signal: null,
        stdout: "{}",
        stderr: "",
        tokenLeakDetected: false,
        stdoutJson: {
          schemaVersion: 1,
          command: "status",
          dashboard: {
            state: "running",
            source: "dashboard-server-state",
            url: "http://127.0.0.1:51234/",
            pid: 4242,
            statePath: "/Users/tester/Library/Application Support/skfiy/dashboard-server.json",
            api: {
              chromeHostPolicy: {
                state: "reachable",
                status: 200
              }
            }
          },
          readiness: {
            checks: {
              dashboard: {
                ready: true,
                state: "ready",
                dashboardState: "running",
                url: "http://127.0.0.1:51234/"
              }
            }
          }
        }
      },
      runtimeSnapshotFixture,
      freshInstallRuntimeSnapshot,
      missingAfterTurnRuntimeSnapshot,
      tokenLeakDetected: false
    });

    const createChromeControlActivity = (action: string) => ({
      kind: "chrome-control-action",
      title: `Chrome ${action}`,
      target: {
        app: "Google Chrome",
        host: "127.0.0.1:60329",
        tabId: 1782097079
      },
      result: "verified",
      blockerReason: null,
      command: `/repo/dist/skfiy chrome ${action} --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 1782097079 --json`,
      timestamp: "2026-06-22T00:00:00.000Z"
    });
    const createDashboardChromeControlActionRun = (action: string, extraRequest: Record<string, unknown> = {}) => {
      const chromeControlActivity = createChromeControlActivity(action);

      return {
        action,
        apiUrl: "http://127.0.0.1:51234/api/chrome-control-action",
        request: {
          action,
          extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
          targetTabId: 1782097079,
          ...extraRequest
        },
        response: {
          status: 200,
          body: {
            schemaVersion: 1,
            command: "dashboard chrome control action",
            source: "dashboard",
            plannedMutation: true,
            executesSystemMutation: true,
            result: "verified",
            action,
            targetTabId: 1782097079,
            activityEntry: chromeControlActivity
          }
        },
        snapshotAfterResponse: {
          status: 200,
          body: {
            currentTurn: {
              chromeControlActivity
            },
            replay: {
              chromeControlActions: [chromeControlActivity]
            }
          }
        },
        tokenLeakDetected: false,
        result: "passed"
      };
    };
    const actionRuns = [
      createDashboardChromeControlActionRun("observe"),
      createDashboardChromeControlActionRun("fill", { selector: "#name", text: "skfiy-dashboard" }),
      createDashboardChromeControlActionRun("click", { selector: "#click-only" }),
      createDashboardChromeControlActionRun("submit", { selector: "form" }),
      createDashboardChromeControlActionRun("scroll", { dy: 600 })
    ];
    const dashboardChromeControlActionApi = {
      productPath: "dist/skfiy dashboard -> /api/chrome-control-action -> dist/skfiy chrome actions -> installed Chrome extension",
      homeMode: "real-user-home",
      realUserHomeDir: "/Users/tester",
      dashboard: {
        cliOutput: {
          command: "dashboard",
          result: "running",
          url: "http://127.0.0.1:51234/",
          statePath: "/Users/tester/Library/Application Support/skfiy/dashboard-server.json"
        },
        cleanup: {
          signal: "SIGTERM",
          exited: true
        }
      },
      apiUrl: "http://127.0.0.1:51234/api/chrome-control-action",
      actionRuns,
      tokenLeakDetected: false,
      result: "passed"
    };

    expect(classifyDashboardSmokeEvidence(passedEvidence)).toBe("passed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        nodeCount: 8,
        linkCount: 8,
        backlinkCount: 6,
        learningLoopCount: 4,
        personalSkillNodeCount: 2,
        pendingMemoryNodeCount: 1,
        pendingMemoryLinkCount: 2,
        nodeTexts: [
          "User preferencesmemoryUser prefers concise Chinese updates.",
          "Concise Chinese progress updatesskillcommunication",
          "Obsidian-style knowledge dashboardskilldashboard",
          "Pending user memorymemoryadd · User wants memory writes reviewed before becoming durable.",
          "Latest sessionsessionCodex: hello",
          "Codexprovidersready",
          "Computer Usecomputer-useblocked",
          "Memory reviewskillPost-turn personalization distills durable notes."
        ],
        linkTexts: [
          "injects promptUser preferences -> Codex",
          "guides promptConcise Chinese progress updates -> Codex",
          "guides promptObsidian-style knowledge dashboard -> Codex",
          "recalls contextLatest session -> Codex",
          "distillsMemory review -> User preferences",
          "stagesMemory review -> Pending user memory",
          "awaits approvalPending user memory -> User preferences"
        ],
        backlinkTexts: [
          "User preferencesinjects promptCodex",
          "Latest sessionrecalls contextCodex",
          "Memory reviewdistillsUser preferences",
          "Memory reviewstagesPending user memory",
          "Pending user memoryawaits approvalUser preferences"
        ],
        learningLoopTexts: [
          "Latest session -> teaches -> Memory review",
          "Memory review -> distills -> User preferences",
          "User preferences -> injects prompt -> Codex",
          "Codex -> answered -> Latest session"
        ],
        personalSkillTexts: [
          "Concise Chinese progress updatesskillcommunication",
          "Obsidian-style knowledge dashboardskilldashboard"
        ],
        vaultNoteTexts: [
          "User preferences.mdmemoryBacklinks 2injects prompt -> CodexMemory review -> distills",
          "Pending user memory.mdmemoryBacklinks 2Memory review -> stagesawaits approval -> User preferences",
          "Latest session.mdsessionBacklinks 1recalls context -> Codex",
          "Memory review.mdskillBacklinks 1distills -> User preferences"
        ],
        focusedNeighborhoodTexts: [
          "Codexinjects promptoutgoing",
          "Pending user memoryawaits approvalincoming"
        ]
      }
    })).toBe("passed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      personalMemoryApi: undefined
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        nodeTexts: passedEvidence.knowledgeGraphEvidence.nodeTexts.filter((text) => !text.includes("Pending user memory")),
        linkTexts: passedEvidence.knowledgeGraphEvidence.linkTexts.filter((text) => (
          !text.includes("stages") && !text.includes("awaits approval")
        )),
        vaultNoteTexts: passedEvidence.knowledgeGraphEvidence.vaultNoteTexts.filter((text) => !text.includes("Pending user memory")),
        focusedNeighborhoodTexts: passedEvidence.knowledgeGraphEvidence.focusedNeighborhoodTexts.filter((text) => (
          !text.includes("Pending user memory")
        ))
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        learningLoopCount: 0,
        learningLoopTexts: []
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        backlinkCount: 0,
        backlinkTexts: []
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        sessionNodeCount: 1
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        vaultNoteCount: 1
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        focusedNoteFound: false,
        focusedBacklinkCount: 0
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        vaultLensCount: 0,
        vaultLensTexts: []
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      knowledgeGraphEvidence: {
        ...passedEvidence.knowledgeGraphEvidence,
        focusedNeighborhoodCount: 0,
        focusedNeighborhoodTexts: []
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      shellResponse: {
        status: 200,
        body: '<!doctype html><html lang="en"><head><title>skfiy dashboard</title><script type="module" crossorigin src="./assets/dashboard-test.js"></script></head><body><div id="dashboard-root"></div></body></html>'
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      shellResponse: {
        status: 200,
        body: '<!doctype html><html lang="en"><head><title>skfiy dashboard</title><script type="module" crossorigin src="./assets/dashboard-test.js"></script></head><body><div id="dashboard-root"></div></body></html>'
      },
      reactContentEvidence: {
        productPath: "dist/skfiy dashboard -> React asset content",
        assetUrl: "http://127.0.0.1:51234/assets/dashboard-test.js",
        status: 200,
        requiredMarkers: [
          "Assistant Provider",
          "Computer Use",
          "Chrome Browser Context",
          "Current Turn",
          "Chrome readiness",
          "Finder readiness",
          "Ghostty readiness",
          "Activity",
          "Latest blocker",
          "Runtime evidence",
          "Assistant providers",
          "Provider settings",
          "Knowledge graph",
          "User preferences",
          "Forget memory",
          "Latest session",
          "Browser Context",
          "injects prompt",
          "recalls context",
          "Vault lens",
          "Vault notes",
          "Focused note",
          "Focused neighborhood",
          "Vault backlinks",
          "Learning loop",
          "Recent session recall",
          "Chrome control actions",
          "Chrome host policy controls",
          "Observe current tab",
          "Screenshot current tab",
          "Click selector",
          "Fill selector",
          "Submit form",
          "Scroll page",
          "Chrome action selector",
          "Chrome fill text",
          "Chrome scroll delta",
          "Chrome host policy host",
          "Always allow",
          "Allow current turn",
          "Reset policy"
        ],
        foundMarkers: [
          "Assistant Provider",
          "Computer Use",
          "Chrome Browser Context",
          "Current Turn",
          "Chrome readiness",
          "Finder readiness",
          "Ghostty readiness",
          "Activity",
          "Latest blocker",
          "Runtime evidence",
          "Assistant providers",
          "Provider settings",
          "Knowledge graph",
          "User preferences",
          "Forget memory",
          "Latest session",
          "Browser Context",
          "injects prompt",
          "recalls context",
          "Vault lens",
          "Vault notes",
          "Focused note",
          "Focused neighborhood",
          "Vault backlinks",
          "Learning loop",
          "Recent session recall",
          "Chrome control actions",
          "Chrome host policy controls",
          "Observe current tab",
          "Screenshot current tab",
          "Click selector",
          "Fill selector",
          "Submit form",
          "Scroll page",
          "Chrome action selector",
          "Chrome fill text",
          "Chrome scroll delta",
          "Chrome host policy host",
          "Always allow",
          "Allow current turn",
          "Reset policy"
        ],
        missingMarkers: []
      }
    })).toBe("passed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      dashboardChromeControlActionApi
    })).toBe("passed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      dashboardChromeControlActionApi: {
        ...dashboardChromeControlActionApi,
        actionRuns: actionRuns.filter((run) => run.action !== "scroll")
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      dashboardChromeControlActionApi: {
        ...dashboardChromeControlActionApi,
        homeMode: "isolated-home"
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      dashboardChromeControlActionApi: {
        ...dashboardChromeControlActionApi,
        actionRuns: actionRuns.map((run) => run.action === "click"
          ? { ...run, response: { status: 200, body: { ...run.response.body, result: "failed" } } }
          : run)
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          operatorReadiness: {
            ...passedEvidence.snapshotResponse.body.operatorReadiness,
            state: "blocked",
            extensionReadiness: {
              state: "blocked",
              bridge: "native-messaging",
              liveConnection: "unknown",
              nativeHostState: "missing",
              reason: "Chrome extension native messaging path is not ready."
            },
            recentSmokeEvidence: {
              state: "needs-evidence",
              requiredTargets: ["chrome", "cli"],
              recentPassedTargets: ["cli"],
              missingTargets: ["chrome"]
            }
          },
          smokeEvidence: {
            artifacts: [
              {
                target: "chrome",
                result: "blocked",
                path: "/repo/.skfiy-smoke/chrome-reload.json",
                productPath: "cli -> helper activate_app -> helper observe_app -> helper ocr_image -> helper click -> extension wake page -> native-host heartbeat",
                command: "chrome reload-extension"
              },
              {
                target: "cli",
                result: "passed",
                path: "/repo/.skfiy-smoke/cli-basic.json",
                productPath: "dist/skfiy -> skfiy CLI command matrix"
              }
            ]
          }
        }
      }
    })).toBe("blocked");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      freshInstallRuntimeSnapshot: undefined
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      freshInstallRuntimeSnapshot: {
        ...freshInstallRuntimeSnapshot,
        runtimeSnapshotExistsAfterFetch: true
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      missingAfterTurnRuntimeSnapshot: undefined
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      dashboardStatusAutoDiscovery: undefined
    })).toBe("failed");
    expect(passedEvidence.runtimeSnapshotCoverage).toMatchObject({
      result: "passed",
      reason: "Seeded runtime snapshot currentTurn and replay are visible at /snapshot.json.",
      path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
      observedAt: "2026-06-20T00:00:00.000Z",
      currentTurnFields: expect.arrayContaining([
        "command",
        "targetApp",
        "approvalState",
        "stopState",
        "latestAction",
        "latestVerification",
        "latestScreenshot",
        "source"
      ]),
      replayFields: expect.arrayContaining([
        "screenshotCount",
        "verificationCount",
        "screenshots",
        "actions",
        "verifications",
        "timelineTail",
        "source"
      ])
    });
    expect(createRuntimeSnapshotCoverage({
      ...passedEvidence,
      runtimeSnapshotFixture: undefined
    })).toMatchObject({
      result: "skipped",
      reason: "Runtime snapshot fixture was not seeded in the isolated HOME."
    });
    expect(createRuntimeSnapshotCoverage({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          currentTurn: {
            ...passedEvidence.snapshotResponse.body.currentTurn,
            command: "not the seeded fixture"
          }
        }
      }
    })).toMatchObject({
      result: "failed",
      reason: expect.stringContaining("currentTurn.command"),
      failures: expect.arrayContaining([
        "currentTurn.command does not match the seeded fixture"
      ])
    });
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            runtimeSnapshot: {
              state: "repaired",
              path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
              isolatedPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json.corrupt-20260620T000000000Z-abcdef123456.json",
              replacementPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
              sha256: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
              observedAt: "2026-06-20T00:00:00.000Z",
              reason: "Unexpected token d in JSON at position 2"
            }
          },
          currentTurn: {
            state: "idle",
            source: "runtime-snapshot",
            path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
            reason: "Unexpected token d in JSON at position 2",
            recovery: {
              state: "repaired",
              isolatedPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json.corrupt-20260620T000000000Z-abcdef123456.json",
              replacementPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json"
            }
          },
          replay: {
            state: "empty",
            source: "runtime-snapshot",
            path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
            reason: "Unexpected token d in JSON at position 2",
            recovery: {
              state: "repaired",
              isolatedPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json.corrupt-20260620T000000000Z-abcdef123456.json",
              replacementPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json"
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            runtimeSnapshot: {
              state: "repair-failed",
              path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
              isolatedPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json.corrupt-20260620T000000000Z-abcdef123456.json",
              replacementPath: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
              sha256: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
              observedAt: "2026-06-20T00:00:00.000Z",
              reason: "Unexpected token d in JSON at position 2",
              repairError: "permission denied"
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            extension: {
              state: "connected",
              bridge: "native-messaging",
              liveConnection: "connected",
              nativeHostState: "installed",
              manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
              allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
              hostPolicy: {
                schemaVersion: 1,
                state: "configured",
                path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
                policy: {
                  defaultMode: "ask",
                  allowedHosts: ["example.com"],
                  currentTurnAllowedHosts: ["turn.example"],
                  blockedHosts: ["blocked.example"]
                }
              },
              connection: {
                state: "connected",
                liveConnection: "connected",
                path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
                ageSeconds: 42,
                observedAt: "2026-06-19T23:59:18.000Z",
                launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                messageType: "skfiy.page.observe",
                requestId: "request-smoke"
              }
            }
          }
        }
      }
    })).toBe("passed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          smokeEvidence: {
            artifacts: [
              {
                target: "chrome",
                result: "passed",
                path: "/repo/.skfiy-smoke/chrome-current.json",
                productPath: "renderer -> preload -> main -> CDP -> Chrome",
                nativeHostBridge: {
                  result: "passed",
                  productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
                  responseResult: "accepted",
                  heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home/Library/Application Support/skfiy/chrome-extension-connection.json",
                  heartbeatHostName: "com.sskift.skfiy",
                  heartbeatLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                  heartbeatMessageType: "skfiy.page.observe",
                  heartbeatRequestId: "chrome-smoke-native-host"
                }
              }
            ]
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          smokeEvidence: {
            artifacts: [
              {
                target: "chrome",
                result: "passed",
                path: "/repo/.skfiy-smoke/chrome-current.json",
                productPath: "renderer -> preload -> main -> CDP -> Chrome"
              }
            ]
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          longHorizon: {
            session: "money-run"
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          dogfoodRelease: {
            ...passedEvidence.snapshotResponse.body.dogfoodRelease,
            releaseDrift: undefined
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          dogfoodRelease: undefined
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      eventsResponse: undefined
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      eventsResponse: {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform"
        },
        body: "event: ping\ndata: {}\n\n"
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      runnerHasTmux: true
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      cliPath: "/repo/scripts/skfiy-cli.mjs"
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      cliOutput: {
        ...passedEvidence.cliOutput,
        shouldOpen: true
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        status: 404,
        body: "Not Found"
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          operatorReadiness: undefined
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          operatorReadiness: {
            ...passedEvidence.snapshotResponse.body.operatorReadiness,
            recentSmokeEvidence: {
              state: "needs-evidence",
              requiredTargets: ["chrome", "cli"],
              recentPassedTargets: ["chrome", "cli"],
              missingTargets: []
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            cli: {
              state: "missing",
              path: "/repo/dist/skfiy"
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            dashboard: {
              ...passedEvidence.snapshotResponse.body.runtimeHealth.dashboard,
              pid: undefined
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            app: {
              ...passedEvidence.snapshotResponse.body.runtimeHealth.app,
              signing: {
                state: "unknown"
              }
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          permissions: {
            screenRecording: "unknown",
            accessibility: "unknown",
            finderAutomation: "unknown"
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            desktopSession: {
              state: "unknown"
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      snapshotResponse: {
        ...passedEvidence.snapshotResponse,
        body: {
          ...passedEvidence.snapshotResponse.body,
          runtimeHealth: {
            ...passedEvidence.snapshotResponse.body.runtimeHealth,
            nativeHost: {
              state: "unknown"
            }
          }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      descriptorResponse: {
        status: 200,
        body: {
          ...passedEvidence.descriptorResponse.body,
          bind: { host: "0.0.0.0", port: 51234 }
        }
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      shellResponse: {
        status: 200,
        body: '<!doctype html><title>skfiy Dashboard</title><a href="/descriptor.json"></a><a href="/snapshot.json"></a>'
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      shellResponse: {
        status: 200,
        body: "<!doctype html><title>other app</title>"
      }
    })).toBe("failed");
    expect(classifyDashboardSmokeEvidence({
      ...passedEvidence,
      tokenLeakDetected: true
    })).toBe("failed");
  });
});
