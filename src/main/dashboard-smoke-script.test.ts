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

    expect(existsSync(sourcePath)).toBe(true);
    expect(packageJson.scripts).toMatchObject({
      "smoke:dashboard": "node scripts/smoke-dashboard-product.mjs"
    });

    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("acquireSmokeLock");
    expect(source).toContain("createDefaultDashboardSmokeOptions");
    expect(source).toContain("\"dashboard\"");
    expect(source).toContain("\"--no-open\"");
    expect(source).toContain("\"--port\"");
    expect(source).toContain("\"0\"");
    expect(source).toContain("\"--json\"");
    expect(source).toContain("/descriptor.json");
    expect(source).toContain("/events");
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
      "--timeout-ms",
      "1200",
      "--require-passed"
    ], defaults)).toMatchObject({
      cliPath: path.resolve("dist/skfiy"),
      outputPath: path.resolve(".skfiy-smoke/dashboard.json"),
      timeoutMs: 1200,
      requirePassed: true
    });
    expect(createDashboardHelpText(defaults)).toContain("smoke:dashboard");
    expect(createDashboardHelpText(defaults)).toContain("--require-passed");
  });

  it("classifies dashboard evidence as passed only for the built CLI loopback path", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-dashboard-plan.mjs");
    const {
      PRODUCT_PATH,
      classifyDashboardSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      PRODUCT_PATH: string;
      classifyDashboardSmokeEvidence: (input: Record<string, unknown>) => string;
    };
    const passedEvidence = {
      cliPath: "/repo/dist/skfiy",
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      command: ["/repo/dist/skfiy", "dashboard", "--no-open", "--port", "0", "--json"],
      cliOutput: {
        command: "dashboard",
        result: "running",
        bind: { host: "127.0.0.1", port: 51234 },
        url: "http://127.0.0.1:51234/",
        shouldOpen: false,
        tokenPrinted: false
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
              state: "missing",
              path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
              reason: "Runtime snapshot has not been recorded yet."
            },
            desktopSession: {
              state: "blocked",
              controllable: false,
              frontmostBundleId: "com.apple.loginwindow",
              mainDisplayAsleep: false
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
            state: "idle",
            source: "runtime-snapshot",
            path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
            reason: "Runtime snapshot has not been recorded yet."
          },
          replay: {
            state: "empty",
            source: "runtime-snapshot",
            path: "/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json",
            reason: "Runtime snapshot has not been recorded yet."
          },
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
        body: '<!doctype html><main data-dashboard-root><span data-snapshot-state>Loading snapshot</span><a href="/descriptor.json"></a><a href="/snapshot.json"></a><section data-panel-body="long-horizon-supervision"></section><script>new EventSource("/events"); fetch("/snapshot.json", { cache: "no-store" }); function renderLongHorizonPanel(){}</script></main><title>skfiy Dashboard</title>'
      },
      tokenLeakDetected: false
    };

    expect(classifyDashboardSmokeEvidence(passedEvidence)).toBe("passed");
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
    })).toBe("passed");
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
            microphone: "unknown",
            speechRecognition: "unknown",
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
