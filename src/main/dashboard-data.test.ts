import { describe, expect, it } from "vitest";
import { createDashboardDescriptor } from "./dashboard-status";
import {
  createDashboardSnapshot,
  createDashboardWorkspaceSnapshot
} from "./dashboard-data";
import {
  createRuntimeSnapshotStatePath,
  createRuntimeTurnMarkerStatePath,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION,
  RUNTIME_TURN_MARKER_SCHEMA_VERSION
} from "./runtime-snapshot";

function createPageControlStatus({
  extension
}: {
  extension: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    permissions: {
      screenRecording: "granted",
      accessibility: "granted",
      finderAutomation: "granted"
    },
    desktopSession: {
      state: "controllable",
      frontmostBundleId: "com.google.Chrome",
      mainDisplayAsleep: false
    },
    nativeHost: {
      state: "installed",
      hostName: "com.sskift.skfiy"
    },
    extension: {
      bridge: "native-messaging",
      liveConnection: "connected",
      nativeHostState: "installed",
      ...extension
    },
    cli: {
      state: "installed",
      path: "/repo/dist/skfiy"
    },
    app: {
      state: "installed",
      path: "/repo/dist/skfiy.app",
      signing: {
        state: "valid"
      }
    },
    helper: {
      state: "installed",
      path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
    }
  };
}

describe("dashboard snapshot data", () => {
  it("adds redacted provider readiness summaries to snapshot data", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      providerSettings: {
        assistant: {
          mode: "codex",
          codexBinary: "/private/bin/codex-secret",
          codexBinarySource: "env",
          claudeCodeBinary: "claude",
          claudeCodeBinarySource: "default",
          hermesBinary: "hermes",
          hermesBinarySource: "default",
          cwd: "/repo?token=assistant-secret",
          timeoutMs: 45_000
        },
        planner: {
          mode: "external-cua",
          externalProviderLabel: "OpenAI CUA",
          externalEndpoint: "https://cua.example.test/plan?token=planner-secret",
          externalApiKeyConfigured: true
        }
      }
    });

    expect(snapshot.providers).toEqual({
      assistant: {
        provider: "assistant",
        mode: "codex",
        label: "Codex",
        health: "available",
        detail: "Codex assistant is selected.",
        configured: true,
        readiness: "ready",
        selectedProvider: "codex",
        timeoutMs: 45_000,
        lastHealthAt: "2026-06-20T00:00:00.000Z",
        providers: [
          {
            provider: "assistant",
            id: "codex",
            label: "Codex",
            selected: true,
            configured: true,
            readiness: "ready",
            binaryPath: "configured via SKFIY_CODEX_BIN",
            binarySource: "env"
          },
          {
            provider: "assistant",
            id: "claude-code",
            label: "Claude Code",
            selected: false,
            configured: true,
            readiness: "ready",
            binaryPath: "claude",
            binarySource: "default"
          },
          {
            provider: "assistant",
            id: "hermes",
            label: "Hermes",
            selected: false,
            configured: true,
            readiness: "ready",
            binaryPath: "hermes",
            binarySource: "default"
          }
        ]
      },
      planner: {
        provider: "planner",
        mode: "external-cua",
        label: "OpenAI CUA",
        health: "available",
        detail: "External CUA endpoint and API key are configured.",
        endpointConfigured: true,
        externalApiKeyConfigured: true
      }
    });
    expect(JSON.stringify(snapshot)).not.toContain("codex-secret");
    expect(JSON.stringify(snapshot)).not.toContain("assistant-secret");
    expect(JSON.stringify(snapshot)).not.toContain("planner-secret");
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });

  it("adds personal memory summaries from local memory files", () => {
    const files: Record<string, string> = {
      "/Users/tester/Library/Application Support/skfiy/memory/USER.md": [
        "User prefers concise Chinese updates.",
        "User's API token=secret should not be displayed."
      ].join("\n---\n"),
      "/Users/tester/Library/Application Support/skfiy/memory/AGENT.md": [
        "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
      ].join("\n"),
      "/Users/tester/Library/Application Support/skfiy/memory/sessions.jsonl": [
        JSON.stringify({
          turnId: "turn-1",
          createdAt: "2026-06-23T10:00:00.000Z",
          userInput: "喜欢 Obsidian dashboard token=secret",
          assistantReply: "会保留这个偏好。",
          providerLabel: "Codex",
          browserContext: {
            title: "Obsidian help",
            url: "https://obsidian.md"
          }
        })
      ].join("\n")
    };

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      generatedAt: "2026-06-23T10:10:00.000Z",
      io: {
        exists: (targetPath) => targetPath === "/repo/package.json" || targetPath in files,
        readFile: (targetPath) => files[targetPath],
        readdir: () => [],
        stat: () => ({ mtimeMs: Date.parse("2026-06-23T10:00:00.000Z") }),
        homeDir: () => "/Users/tester"
      }
    });

    expect(snapshot.personalMemory).toEqual({
      userEntryCount: 2,
      agentEntryCount: 1,
      sessionCount: 1,
      latestUpdatedAt: "2026-06-23T10:00:00.000Z",
      recentUserEntries: [
        "User prefers concise Chinese updates.",
        "[redacted sensitive memory]"
      ],
      recentAgentEntries: [
        "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
      ],
      latestSession: {
        createdAt: "2026-06-23T10:00:00.000Z",
        providerLabel: "Codex",
        userInput: "[redacted sensitive memory]",
        browserTitle: "Obsidian help",
        browserUrl: "https://obsidian.md"
      }
    });
    expect(JSON.stringify(snapshot.personalMemory)).not.toContain("token=secret");
  });

  it("reads workspace provider settings from env without exposing raw env values", () => {
    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      generatedAt: "2026-06-20T00:00:00.000Z",
      env: {
        SKFIY_ASSISTANT_AGENT: "claude",
        SKFIY_CLAUDE_CODE_BIN: "/private/bin/claude-secret",
        SKFIY_HERMES_BIN: "/private/bin/hermes-secret",
        SKFIY_ASSISTANT_AGENT_CWD: "/repo?token=assistant-secret",
        SKFIY_PLANNER_MODE: "external-cua",
        SKFIY_EXTERNAL_CUA_ENDPOINT: "https://cua.example.test/plan?token=planner-secret",
        SKFIY_EXTERNAL_CUA_API_KEY: "sk-secret"
      },
      io: {
        exists: (targetPath) => targetPath === "/repo/package.json",
        readFile: () => JSON.stringify({
          name: "skfiy",
          version: "0.1.0",
          description: "Desktop Computer Use prototype"
        }),
        readdir: () => [],
        stat: () => ({ mtimeMs: 0 }),
        homeDir: () => undefined
      }
    });

    expect(snapshot.providers).toEqual({
      assistant: {
        provider: "assistant",
        mode: "claude-code",
        label: "Claude Code",
        health: "available",
        detail: "Claude Code assistant is selected.",
        configured: true,
        readiness: "ready",
        selectedProvider: "claude-code",
        timeoutMs: 45_000,
        lastHealthAt: "2026-06-20T00:00:00.000Z",
        providers: [
          {
            provider: "assistant",
            id: "codex",
            label: "Codex",
            selected: false,
            configured: true,
            readiness: "ready",
            binaryPath: "codex",
            binarySource: "default"
          },
          {
            provider: "assistant",
            id: "claude-code",
            label: "Claude Code",
            selected: true,
            configured: true,
            readiness: "ready",
            binaryPath: "configured via SKFIY_CLAUDE_CODE_BIN",
            binarySource: "env"
          },
          {
            provider: "assistant",
            id: "hermes",
            label: "Hermes",
            selected: false,
            configured: true,
            readiness: "ready",
            binaryPath: "configured via SKFIY_HERMES_BIN",
            binarySource: "env"
          }
        ]
      },
      planner: {
        provider: "planner",
        mode: "external-cua",
        label: "External CUA",
        health: "available",
        detail: "External CUA endpoint and API key are configured.",
        endpointConfigured: true,
        externalApiKeyConfigured: true
      }
    });
    expect(JSON.stringify(snapshot)).not.toContain("claude-secret");
    expect(JSON.stringify(snapshot)).not.toContain("assistant-secret");
    expect(JSON.stringify(snapshot)).not.toContain("planner-secret");
    expect(JSON.stringify(snapshot)).not.toContain("sk-secret");
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });

  it("adds ready Browser Context summary without exposing page text", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-23T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected",
          pageObservation: {
            url: "https://example.test/form",
            title: "Example Form",
            visibleText: "token=page-secret should not be exposed",
            observedAt: "2026-06-23T00:00:00.000Z",
            pageControl: {
              state: "ready"
            }
          }
        }
      })
    });

    expect(snapshot.runtimeHealth.extension).toMatchObject({
      browserContext: {
        schemaVersion: 1,
        state: "ready",
        source: "runtime-health",
        url: "https://example.test/form",
        title: "Example Form",
        observedAt: "2026-06-23T00:00:00.000Z"
      }
    });
    expect(JSON.stringify(snapshot)).not.toContain("visibleText");
    expect(JSON.stringify(snapshot)).not.toContain("page-secret");
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });

  it("adds blocked Browser Context summary from pageControl blockers", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-23T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected",
          pageControl: {
            state: "blocked_by_chrome_host_permission",
            reason: "Chrome host permission missing.",
            nextAction: "Grant site access."
          }
        }
      })
    });

    expect(snapshot.runtimeHealth.extension).toMatchObject({
      browserContext: {
        schemaVersion: 1,
        state: "blocked_by_chrome_host_permission",
        source: "runtime-health",
        reason: "Chrome host permission missing.",
        nextAction: "Grant site access."
      }
    });
  });

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
        agentProvider: "Codex"
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
          reason: "Runtime Chrome extension connection is not probed yet.",
          pageControl: {
            schemaVersion: 1,
            state: "not-probed",
            source: "dashboard-empty",
            capable: false,
            reason: "Chrome pageControl readiness has not been probed yet.",
            capabilities: {},
            nextAction: "Probe pageControl readiness from Chrome extension diagnostics."
          },
          browserContext: {
            schemaVersion: 1,
            state: "missing",
            source: "runtime-health",
            reason: "Chrome page context has not been observed yet.",
            nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
          }
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
      operatorReadiness: {
        state: "blocked",
        commandSurface: {
          state: "blocked",
          reason: "Packaged CLI command surface is missing."
        },
        extensionReadiness: {
          state: "needs-evidence",
          nativeHostState: "installed",
          reason: "Native host is installed, but a live extension heartbeat is not connected."
        },
        packagedBinary: {
          state: "blocked",
          checks: {
            app: true,
            helper: true,
            cli: false,
            signing: false
          },
          appPath: "/repo/dist/skfiy.app",
          helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
        },
        recentSmokeEvidence: {
          state: "needs-evidence",
          requiredTargets: ["chrome", "cli"],
          recentPassedTargets: ["ui"],
          missingTargets: ["chrome", "cli"]
        },
        appReadiness: {
          chrome: {
            app: "Chrome",
            state: "blocked",
            source: "runtime",
            reason: "Chrome pageControl readiness has not been probed yet."
          },
          finder: {
            app: "Finder",
            state: "blocked",
            source: "permission",
            reason: "Finder Automation has not been proven yet."
          },
          ghostty: {
            app: "Ghostty",
            state: "needs-evidence",
            source: "smoke-missing",
            reason: "No fresh Ghostty smoke artifact has been recorded."
          }
        }
      },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "unknown"
      },
      currentTurn: {
        state: "approval_required",
        command: "整理 Finder 当前文件夹",
        targetApp: "Finder",
        risk: "medium",
        agentProvider: "Codex"
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
          code: "desktop-session-loginwindow",
          severity: "error",
          message: "Desktop session is locked or loginwindow is frontmost.",
          frontmostBundleId: "com.apple.loginwindow"
        },
        {
          code: "desktop-display-asleep",
          severity: "error",
          message: "Main display is asleep.",
          mainDisplayAsleep: true
        },
        {
          code: "finder-automation-unknown",
          severity: "info",
          message: "Finder Automation has not been proven yet."
        },
        {
          code: "chrome-extension-not-connected",
          severity: "warning",
          message: "Chrome extension is not connected, so pageControl readiness cannot be trusted.",
          extensionState: "unknown"
        }
      ]
    });
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });

  it("adds precise stale heartbeat and missing TCC alerts for operator dashboards", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: {
        permissions: {
          screenRecording: "granted",
          accessibility: "granted",
          finderAutomation: "granted"
        },
        desktopSession: {
          state: "controllable",
          frontmostBundleId: "com.google.Chrome",
          mainDisplayAsleep: false
        },
        nativeHost: {
          state: "installed",
          hostName: "com.sskift.skfiy",
          manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json"
        },
        extension: {
          state: "native-host-installed",
          bridge: "native-messaging",
          liveConnection: "stale",
          nativeHostState: "installed",
          connection: {
            state: "stale",
            liveConnection: "stale",
            path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
            ageSeconds: 7200,
            observedAt: "2026-06-19T22:00:00.000Z",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            messageType: "skfiy.page.observe",
            requestId: "old-request"
          }
        }
      }
    });

    expect(snapshot.alerts).toContainEqual({
      code: "chrome-extension-heartbeat-stale",
      severity: "warning",
      message: "Chrome extension native-message heartbeat is stale.",
      ageSeconds: 7200,
      path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
      observedAt: "2026-06-19T22:00:00.000Z"
    });
    expect(snapshot.alerts).toContainEqual({
      code: "chrome-extension-not-connected",
      severity: "warning",
      message: "Chrome extension is not connected, so pageControl readiness cannot be trusted.",
      extensionState: "native-host-installed"
    });
  });

  it("creates app-specific readiness lanes and marks unsupported smoke targets as ignored evidence", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-22T09:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: {
        permissions: {
          screenRecording: "granted",
          accessibility: "granted",
          finderAutomation: "unknown"
        },
        desktopSession: {
          state: "blocked",
          frontmostBundleId: "com.apple.loginwindow",
          mainDisplayAsleep: true
        },
        nativeHost: {
          state: "missing"
        },
        extension: {
          state: "native-host-missing",
          liveConnection: "unknown",
          nativeHostState: "missing"
        },
        cli: {
          state: "installed",
          path: "/repo/dist/skfiy"
        },
        app: {
          state: "installed",
          path: "/repo/dist/skfiy.app",
          signing: { state: "valid" }
        },
        helper: {
          state: "installed",
          path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
        }
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "chrome",
            result: "blocked",
            blocker: "Chrome Native Messaging host manifest is not installed.",
            stale: false
          },
          {
            target: "finder",
            result: "blocked",
            stale: false,
            finder: {
              desktopPreflight: {
                result: "blocked",
                reason: "Desktop session is locked or loginwindow is frontmost.",
                frontmostBundleId: "com.apple.loginwindow",
                mainDisplayAsleep: true,
                controllable: false
              }
            }
          },
          {
            target: "ghostty",
            result: "blocked",
            desktopPreflight: {
              result: "blocked",
              reason: "Desktop session is locked or loginwindow is frontmost."
            },
            stale: false
          },
          {
            target: "voice",
            result: "passed",
            stale: true,
            productPath: "obsolete voice smoke"
          }
        ]
      }
    });

    expect(snapshot.operatorReadiness).toMatchObject({
      appReadiness: {
        chrome: {
          app: "Chrome",
          state: "blocked",
          source: "chrome-smoke",
          reason: "Chrome Native Messaging host manifest is not installed."
        },
        finder: {
          app: "Finder",
          state: "blocked",
          source: "finder-smoke",
          reason: "Desktop session is locked or loginwindow is frontmost."
        },
        ghostty: {
          app: "Ghostty",
          state: "blocked",
          source: "ghostty-smoke",
          reason: "Desktop session is locked or loginwindow is frontmost."
        }
      },
      recentSmokeEvidence: {
        unsupportedTargets: ["voice"],
        unsupportedPassedTargets: ["voice"],
        recentPassedTargets: []
      }
    });
    expect(snapshot.alerts).toContainEqual({
      code: "smoke-evidence-unsupported",
      severity: "warning",
      message: "Unsupported smoke evidence is ignored for product readiness: voice.",
      unsupportedTargets: ["voice"],
      unsupportedPassedTargets: ["voice"]
    });
  });

  it("keeps passed Chrome app readiness from inheriting pageControl blocker text", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-22T09:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected",
          pageControl: {
            state: "blocked_by_host_policy",
            capable: false,
            reason: "Host policy has not allowed this page."
          }
        }
      }),
      smokeEvidence: {
        artifacts: [
          {
            target: "chrome",
            result: "passed",
            stale: false,
            pageControl: {
              state: "blocked_by_host_policy",
              reason: "Host policy has not allowed this page."
            }
          }
        ]
      }
    });

    expect(snapshot.operatorReadiness).toMatchObject({
      appReadiness: {
        chrome: {
          app: "Chrome",
          state: "ready",
          source: "chrome-smoke",
          reason: "Fresh Chrome smoke evidence is available."
        }
      }
    });
  });

  it("normalizes connected Chrome pageControl readiness from runtime health", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected",
          pageControl: {
            schemaVersion: 1,
            state: "ready",
            reason: "Content script loaded and DOM controls are available.",
            source: "extension-diagnostics",
            activeTab: {
              state: "available",
              tabId: 7,
              windowId: 1,
              host: "example.test",
              scheme: "https"
            },
            contentScript: {
              state: "loaded"
            },
            capabilities: {
              domActions: true,
              screenshot: true,
              click: true,
              fill: true,
              submit: true,
              scroll: true
            },
            nextAction: "Ready for pageControl actions."
          }
        }
      })
    });

    expect(snapshot.runtimeHealth.extension).toMatchObject({
      state: "connected",
      pageControl: {
        schemaVersion: 1,
        state: "ready",
        source: "runtime-health",
        capable: true,
        reason: "Content script loaded and DOM controls are available.",
        activeTab: {
          state: "available",
          tabId: 7,
          windowId: 1,
          host: "example.test",
          scheme: "https"
        },
        contentScript: {
          state: "loaded"
        },
        capabilities: {
          domActions: true,
          screenshot: true,
          click: true,
          fill: true,
          submit: true,
          scroll: true
        },
        nextAction: "Ready for pageControl actions."
      }
    });
    expect(snapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: expect.stringMatching(/^page-control/)
    }));
  });

  it("synthesizes not-probed pageControl and alerts when connected Chrome has no readiness evidence", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected"
        }
      })
    });

    expect(snapshot.runtimeHealth.extension).toMatchObject({
      state: "connected",
      pageControl: {
        schemaVersion: 1,
        state: "not-probed",
        source: "dashboard-empty",
        capable: false,
        reason: "Chrome pageControl readiness has not been probed yet.",
        capabilities: {},
        nextAction: "Probe pageControl readiness from Chrome extension diagnostics."
      }
    });
    expect(snapshot.alerts).toContainEqual({
      code: "page-control-missing",
      severity: "warning",
      message: "Chrome extension is connected, but pageControl readiness has not been probed."
    });
  });

  it("does not treat pageSafety-only Chrome smoke evidence as pageControl readiness", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected"
        }
      }),
      smokeEvidence: {
        artifacts: [
          {
            target: "chrome",
            result: "passed",
            pageSafety: {
              state: "clear",
              source: "chrome-smoke",
              sensitivePause: false,
              pauseCount: 0,
              checkedRuns: 1
            }
          }
        ]
      }
    });

    expect(snapshot.runtimeHealth.extension).toMatchObject({
      state: "connected",
      pageControl: {
        state: "not-probed",
        source: "dashboard-empty",
        capable: false
      }
    });
    expect(snapshot.alerts).toContainEqual(expect.objectContaining({
      code: "page-control-missing"
    }));
  });

  it("classifies policy-blocked pageControl separately from missing readiness", () => {
    const snapshot = createDashboardSnapshot({
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: createDashboardDescriptor({ port: 8787 }),
      status: createPageControlStatus({
        extension: {
          state: "connected",
          pageControl: {
            schemaVersion: 1,
            state: "blocked_by_host_policy",
            reason: "Host policy has not allowed this page.",
            source: "extension-diagnostics",
            capabilities: {
              domActions: false,
              screenshot: false,
              click: false,
              fill: false,
              submit: false,
              scroll: false
            },
            blockers: [
              {
                code: "blocked_by_host_policy",
                reason: "host_policy_blocked",
                message: "Host policy has not allowed this page."
              }
            ]
          }
        }
      })
    });

    expect(snapshot.alerts).toContainEqual({
      code: "page-control-policy-blocked",
      severity: "warning",
      message: "Chrome pageControl is blocked by host policy or Chrome host permission.",
      state: "blocked_by_host_policy",
      reason: "Host policy has not allowed this page.",
      nextAction: "Allow the current host in dashboard Chrome policy, then rerun diagnostics."
    });
    expect(snapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: "page-control-missing"
    }));
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
          browserSelection: {
            chromeAppName: "Google Chrome",
            source: "fallback-primary-browser",
            loadExtensionFriendly: false,
            availableAppNames: ["Google Chrome"],
            candidateAppNames: ["Google Chrome for Testing", "Chromium"]
          },
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
        readinessDiagnostics: {
          setupGuide: {
            schemaVersion: 1,
            installHostCommand: [
              "skfiy",
              "chrome",
              "install-host",
              "--extension-id",
              "abcdefghijklmnopabcdefghijklmnop"
            ],
            verifyStatusCommand: [
              "skfiy",
              "chrome",
              "status",
              "--extension-id",
              "abcdefghijklmnopabcdefghijklmnop"
            ],
            smokeCommand: [
              "skfiy",
              "smoke",
              "chrome",
              "--output",
              ".skfiy-smoke/chrome.json"
            ],
            nextActions: [
              {
                id: "verify-live-connection",
                state: "waiting",
                owner: "browser",
                title: "Reload the skfiy Chrome extension and verify the native host heartbeat."
              }
            ]
          }
        },
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
          browserSelection: {
            chromeAppName: "Google Chrome",
            source: "fallback-primary-browser",
            loadExtensionFriendly: false,
            availableAppNames: ["Google Chrome"],
            candidateAppNames: ["Google Chrome for Testing", "Chromium"]
          },
          chromeVersion: "Chrome/146.0.7680.80",
          blockedReason: "branded_chrome_load_extension_removed",
          recommendedBrowser: "Chrome for Testing or Chromium",
          diagnosticExtensions: [
            {
              id: "fignfifoniblkonapihmkfakmlgkbkcf",
              manifestName: "Google Network Speech"
            }
          ]
        },
        sensitiveRun: {
          result: "sensitive-paused",
          pageUrl: "file:///tmp/skfiy-login.html",
          safety: {
            state: "needs_confirmation",
            findingCount: 1,
            findings: [
              {
                kind: "credential",
                severity: "sensitive",
                reason: "credential_or_otp_prompt"
              }
            ]
          },
          events: [
            {
              status: "executing",
              message: "Verified navigate: Navigated to: file:///tmp/skfiy-login.html"
            },
            {
              status: "needs_confirmation",
              message: "Verification failed (sensitive): Sensitive UI text is visible."
            }
          ]
        },
        sensitiveFormRun: {
          result: "sensitive-paused",
          pageUrl: "file:///tmp/skfiy-form.html",
          fields: [
            {
              selector: "#password",
              value: "hunter2"
            }
          ],
          events: [
            {
              status: "needs_confirmation",
              message: "Verification failed (sensitive): Sensitive form input is not allowed for Chrome Computer Use."
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
      "/repo/.skfiy-smoke/finder-current.json": JSON.stringify({
        result: "blocked",
        productPath: "dist/skfiy.app -> Finder",
        desktopPreflight: {
          result: "blocked",
          reason: "Desktop session is not controllable before target app launch: frontmostBundleId=com.apple.loginwindow",
          frontmost: {
            bundleId: "com.apple.loginwindow",
            localizedName: "loginwindow",
            processIdentifier: 591
          },
          display: {
            mainDisplayAsleep: false
          },
          controllable: false
        },
        finderObservation: {
          result: "blocked",
          reason: "Skipped because desktop preflight is blocked.",
          accessibilityTrusted: true
        },
        finderSemanticObservation: {
          result: "skipped",
          reason: "Desktop preflight blocked."
        },
        finderItemDragDrop: {
          result: "skipped",
          reason: "Desktop preflight blocked."
        }
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
        "finder-current.json",
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
      "/repo/.skfiy-smoke/finder-current.json": Date.parse("2026-06-19T23:57:00.000Z"),
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
          accessibility: { granted: true, status: "authorized" }
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
    expect(snapshot.operatorReadiness).toMatchObject({
      state: "ready",
      commandSurface: {
        state: "ready",
        path: "/repo/dist/skfiy"
      },
      extensionReadiness: {
        state: "ready",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed"
      },
      packagedBinary: {
        state: "ready",
        checks: {
          app: true,
          helper: true,
          cli: true,
          signing: true
        },
        signingState: "valid"
      },
      recentSmokeEvidence: {
        state: "ready",
        requiredTargets: ["chrome", "cli"],
        recentPassedTargets: ["chrome", "cli", "codex-plugin", "dashboard"],
        missingTargets: []
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
        setupGuide: {
          schemaVersion: 1,
          installHostCommand: [
            "skfiy",
            "chrome",
            "install-host",
            "--extension-id",
            "abcdefghijklmnopabcdefghijklmnop"
          ],
          verifyStatusCommand: [
            "skfiy",
            "chrome",
            "status",
            "--extension-id",
            "abcdefghijklmnopabcdefghijklmnop"
          ],
          smokeCommand: [
            "skfiy",
            "smoke",
            "chrome",
            "--output",
            ".skfiy-smoke/chrome.json"
          ],
          nextActions: [
            {
              id: "verify-live-connection",
              state: "waiting",
              owner: "browser",
              title: "Reload the skfiy Chrome extension and verify the native host heartbeat."
            }
          ]
        },
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
          browserSelection: {
            chromeAppName: "Google Chrome",
            source: "fallback-primary-browser",
            loadExtensionFriendly: false,
            availableAppNames: ["Google Chrome"],
            candidateAppNames: ["Google Chrome for Testing", "Chromium"]
          },
          chromeVersion: "Chrome/146.0.7680.80",
          blockedReason: "branded_chrome_load_extension_removed",
          recommendedBrowser: "Chrome for Testing or Chromium",
          diagnosticExtensionNames: ["Google Network Speech"]
        },
        pageSafety: {
          state: "sensitive-paused",
          source: "chrome-smoke",
          sensitivePause: true,
          pauseCount: 2,
          checkedRuns: 2,
          runs: [
            {
              kind: "sensitive-page",
              result: "sensitive-paused",
              sensitivePause: true,
              pageUrl: "file:///tmp/skfiy-login.html",
              reason: "Sensitive UI text is visible.",
              pageSafety: {
                state: "needs_confirmation",
                findingCount: 1,
                findings: [
                  {
                    kind: "credential",
                    severity: "sensitive",
                    reason: "credential_or_otp_prompt"
                  }
                ]
              }
            },
            {
              kind: "sensitive-form-prefill",
              result: "sensitive-paused",
              sensitivePause: true,
              pageUrl: "file:///tmp/skfiy-form.html",
              reason: "Sensitive form input is not allowed for Chrome Computer Use.",
              fieldSelectors: ["#password"]
            }
          ],
          findingKinds: ["credential"],
          findingReasons: ["credential_or_otp_prompt"]
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
      },
      {
        target: "finder",
        result: "blocked",
        path: "/repo/.skfiy-smoke/finder-current.json",
        productPath: "dist/skfiy.app -> Finder",
        finder: {
          result: "blocked",
          source: "finder-smoke",
          desktopPreflight: {
            result: "blocked",
            reason: "Desktop session is not controllable before target app launch: frontmostBundleId=com.apple.loginwindow",
            frontmostBundleId: "com.apple.loginwindow",
            frontmostLocalizedName: "loginwindow",
            frontmostProcessIdentifier: 591,
            mainDisplayAsleep: false,
            controllable: false
          },
          finderObservation: {
            result: "blocked",
            reason: "Skipped because desktop preflight is blocked.",
            accessibilityTrusted: true
          },
          finderSemanticObservation: {
            result: "skipped",
            reason: "Desktop preflight blocked."
          },
          finderItemDragDrop: {
            result: "skipped",
            reason: "Desktop preflight blocked."
          },
          blockedByDesktopPreflight: true,
          reason: "Desktop session is not controllable before target app launch: frontmostBundleId=com.apple.loginwindow"
        },
        mtimeMs: Date.parse("2026-06-19T23:57:00.000Z"),
        ageSeconds: 180,
        stale: false
      }
    ]);
    expect(snapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: "smoke-evidence-stale"
    }));
    expect(snapshot.alerts).toContainEqual(expect.objectContaining({
      code: "finder-automation-unproven",
      severity: "info",
      frontmostBundleId: "com.apple.loginwindow",
      controllable: false
    }));
    expect(snapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: "finder-automation-unknown"
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

  it("marks Chrome page safety as an explicit smoke empty state when future fields are absent", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0"
      }),
      "/repo/.skfiy-smoke/chrome-current.json": JSON.stringify({
        result: "passed",
        productPath: "renderer -> preload -> main -> CDP -> Chrome"
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": ["chrome-current.json"]
    };

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:00:00.000Z",
      io: {
        exists: (targetPath) =>
          Object.hasOwn(files, targetPath) || Object.hasOwn(directories, targetPath),
        readFile: (targetPath) => files[targetPath],
        readdir: (targetPath) => directories[targetPath] ?? [],
        stat: () => ({ mtimeMs: Date.parse("2026-06-20T00:00:00.000Z") })
      }
    });

    expect(snapshot.smokeEvidence.artifacts).toEqual([
      expect.objectContaining({
        target: "chrome",
        result: "passed",
        pageSafety: {
          state: "empty",
          source: "chrome-smoke-empty",
          sensitivePause: false,
          pauseCount: 0,
          checkedRuns: 0,
          reason: "Chrome smoke artifact has not reported page-level safety evidence yet."
        }
      })
    ]);
  });

  it("uses installed-extension action pageControl evidence for dashboard launchers", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0"
      }),
      "/repo/.skfiy-smoke/chrome-current.json": JSON.stringify({
        result: "passed",
        productPath: "dist/skfiy -> chrome tabs/reload-extension/observe/screenshot/fill/click/submit/scroll -> installed Chrome extension",
        pageControl: {
          state: "unavailable",
          capable: false,
          reason: "Branded Chrome blocked automated extension loading."
        },
        installedExtensionActionRun: {
          classification: "screenshot-blocked",
          selectedTargetTab: {
            id: 123,
            windowId: 7,
            host: "127.0.0.1:60329",
            scheme: "http",
            state: "eligible",
            eligible: true
          },
          finalObserveRun: {
            result: "verified",
            extensionConnection: {
              pageObservation: {
                pageControl: {
                  schemaVersion: 1,
                  capable: true,
                  state: "ready",
                  reason: "Content script loaded and DOM controls are available.",
                  nextAction: "send_page_action",
                  contentScript: {
                    state: "loaded"
                  },
                  capabilities: {
                    diagnostics: true,
                    observe: true,
                    domActions: true,
                    click: true,
                    fill: true,
                    submit: true,
                    scroll: true,
                    screenshot: "background_required"
                  }
                }
              }
            }
          }
        }
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": ["chrome-current.json"]
    };

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-22T00:00:00.000Z",
      io: {
        exists: (targetPath) =>
          Object.hasOwn(files, targetPath) || Object.hasOwn(directories, targetPath),
        readFile: (targetPath) => files[targetPath],
        readdir: (targetPath) => directories[targetPath] ?? [],
        stat: () => ({ mtimeMs: Date.parse("2026-06-22T00:00:00.000Z") })
      }
    });

    expect(snapshot.smokeEvidence.artifacts[0].pageControl).toMatchObject({
      source: "chrome-smoke-action",
      state: "ready",
      capable: true,
      activeTab: {
        state: "eligible",
        tabId: 123,
        windowId: 7,
        host: "127.0.0.1:60329",
        scheme: "http"
      },
      capabilities: {
        domActions: true,
        click: true,
        fill: true,
        submit: true,
        scroll: true,
        screenshot: "background_required"
      }
    });
    const extension = snapshot.runtimeHealth.extension as Record<string, unknown>;
    expect(extension.pageControl).toMatchObject({
      source: "chrome-smoke-action",
      activeTab: {
        tabId: 123,
        host: "127.0.0.1:60329"
      }
    });
  });

  it("marks a missing runtime snapshot as an explicit fresh-install empty state", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const runtimePath = createRuntimeSnapshotStatePath("/Users/tester");
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0",
        description: "Desktop Computer Use prototype"
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": []
    };
    const io = {
      exists: (targetPath: string) =>
        Object.hasOwn(files, targetPath)
        || Object.hasOwn(directories, targetPath),
      readFile: (targetPath: string) => files[targetPath],
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

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:00:00.000Z",
      io
    });

    expect(snapshot.runtimeHealth.runtimeSnapshot).toEqual({
      state: "missing",
      path: runtimePath,
      reason: "Runtime snapshot has not been recorded yet.",
      emptyReasonCode: "runtime-snapshot-missing",
      freshInstall: true
    });
    expect(snapshot.currentTurn).toEqual({
      state: "idle",
      source: "runtime-snapshot",
      reason: "Runtime snapshot has not been recorded yet.",
      emptyReasonCode: "runtime-snapshot-missing",
      freshInstall: true,
      path: runtimePath
    });
    expect(snapshot.replay).toEqual({
      state: "empty",
      source: "runtime-snapshot",
      reason: "Runtime snapshot has not been recorded yet.",
      emptyReasonCode: "runtime-snapshot-missing",
      freshInstall: true,
      path: runtimePath
    });
    expect(snapshot.alerts).not.toContainEqual(expect.objectContaining({
      code: "runtime-snapshot-repaired"
    }));
    expect(JSON.stringify(snapshot)).not.toContain("token=");
  });

  it("marks a missing runtime snapshot after a recent marker as runtime evidence loss", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const runtimePath = createRuntimeSnapshotStatePath("/Users/tester");
    const markerPath = createRuntimeTurnMarkerStatePath("/Users/tester");
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0",
        description: "Desktop Computer Use prototype"
      }),
      [markerPath]: JSON.stringify({
        schemaVersion: RUNTIME_TURN_MARKER_SCHEMA_VERSION,
        observedAt: "2026-06-20T00:04:30.000Z",
        currentTurn: {
          state: "executing",
          command: "open Chrome with token=marker-secret",
          source: "runtime-turn-marker"
        }
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": []
    };

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:05:00.000Z",
      io: {
        exists: (targetPath) =>
          Object.hasOwn(files, targetPath)
          || Object.hasOwn(directories, targetPath),
        readFile: (targetPath) => files[targetPath],
        readdir: (targetPath) => directories[targetPath] ?? [],
        stat: () => ({ mtimeMs: 0 }),
        homeDir: () => "/Users/tester"
      }
    });

    expect(snapshot.runtimeHealth.runtimeSnapshot).toMatchObject({
      state: "missing-after-turn",
      path: runtimePath,
      reason: "Runtime snapshot is missing after a recent app turn was observed.",
      emptyReasonCode: "runtime-snapshot-missing-after-turn",
      freshInstall: false,
      markerPath,
      markerObservedAt: "2026-06-20T00:04:30.000Z",
      markerAgeSeconds: 30,
      markerState: "recent"
    });
    expect(snapshot.currentTurn).toMatchObject({
      state: "executing",
      command: "open Chrome with redacted=[redacted]",
      source: "runtime-turn-marker",
      freshInstall: false,
      markerPath,
      markerAgeSeconds: 30,
      path: runtimePath
    });
    expect(snapshot.replay).toMatchObject({
      state: "empty",
      source: "runtime-snapshot",
      freshInstall: false,
      markerPath,
      markerAgeSeconds: 30,
      path: runtimePath
    });
    expect(snapshot.alerts).toContainEqual(expect.objectContaining({
      code: "runtime-snapshot-missing-after-turn",
      severity: "warning",
      path: runtimePath,
      markerPath,
      markerAgeSeconds: 30
    }));
    expect(JSON.stringify(snapshot)).not.toContain("marker-secret");
  });

  it("marks an older runtime snapshot as stale when a recent marker is newer", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const runtimePath = createRuntimeSnapshotStatePath("/Users/tester");
    const markerPath = createRuntimeTurnMarkerStatePath("/Users/tester");
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0",
        description: "Desktop Computer Use prototype"
      }),
      [runtimePath]: JSON.stringify({
        schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
        observedAt: "2026-06-20T00:00:00.000Z",
        currentTurn: {
          state: "executing",
          command: "stale snapshot command",
          source: "runtime-snapshot"
        },
        replay: {
          state: "available",
          outcome: "running",
          source: "runtime-snapshot"
        }
      }),
      [markerPath]: JSON.stringify({
        schemaVersion: RUNTIME_TURN_MARKER_SCHEMA_VERSION,
        observedAt: "2026-06-20T00:04:30.000Z",
        currentTurn: {
          state: "approval_required",
          command: "newer marker command",
          source: "runtime-turn-marker"
        }
      })
    };
    const directories: Record<string, string[]> = {
      "/repo/.skfiy-smoke": []
    };

    const snapshot = createDashboardWorkspaceSnapshot({
      rootDir: "/repo",
      descriptor,
      generatedAt: "2026-06-20T00:05:00.000Z",
      io: {
        exists: (targetPath) =>
          Object.hasOwn(files, targetPath)
          || Object.hasOwn(directories, targetPath),
        readFile: (targetPath) => files[targetPath],
        readdir: (targetPath) => directories[targetPath] ?? [],
        stat: () => ({ mtimeMs: 0 }),
        homeDir: () => "/Users/tester"
      }
    });

    expect(snapshot.runtimeHealth.runtimeSnapshot).toMatchObject({
      state: "stale-after-turn",
      path: runtimePath,
      observedAt: "2026-06-20T00:00:00.000Z",
      reason: "Runtime snapshot is older than a recent app turn marker.",
      freshInstall: false,
      stale: true,
      markerPath,
      markerObservedAt: "2026-06-20T00:04:30.000Z",
      markerAgeSeconds: 30,
      markerState: "recent",
      snapshotAgeSeconds: 300
    });
    expect(snapshot.currentTurn).toMatchObject({
      state: "executing",
      command: "stale snapshot command",
      source: "runtime-snapshot",
      freshInstall: false,
      stale: true,
      markerPath,
      markerAgeSeconds: 30,
      snapshotAgeSeconds: 300
    });
    expect(snapshot.alerts).toContainEqual(expect.objectContaining({
      code: "runtime-snapshot-stale-after-turn",
      severity: "warning",
      path: runtimePath,
      markerPath,
      markerAgeSeconds: 30,
      snapshotAgeSeconds: 300
    }));
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
