import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const HOST_POLICY_STORAGE_KEY = "skfiyHostPolicy";
const HOST_POLICY_SYNC_STORAGE_KEY = "skfiyHostPolicySync";
const HOST_POLICY_SYNC_STATUS = "skfiy.host_policy.sync_status";
const HOST_POLICY_SYNC_REFRESH = "skfiy.host_policy.sync_refresh";
const NATIVE_HEARTBEAT = "skfiy.native.heartbeat";
const DEV_RELOAD_REQUEST = "skfiy.dev.reload";
const PAGE_CONTROL_HEALTH = "skfiy.page_control.health";

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener: vi.fn((listener) => {
      listeners.push(listener);
    })
  };
}

function readStorageSelection(storage, keys) {
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }

  if (typeof keys === "string") {
    return { [keys]: storage[keys] };
  }

  if (keys && typeof keys === "object") {
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        Object.hasOwn(storage, key) ? storage[key] : fallback
      ])
    );
  }

  return { ...storage };
}

function createPolicyResponse(policy = {}) {
  return {
    schemaVersion: 1,
    type: "skfiy.native.response",
    requestId: "policy-sync-response",
    result: "accepted",
    bridgeState: "connected",
    launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
    messageType: "skfiy.host_policy.request",
    hostPolicy: {
      schemaVersion: 1,
      state: "configured",
      path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
      policy: {
        defaultMode: "ask",
        allowedHosts: ["example.com"],
        currentTurnAllowedHosts: ["turn.example"],
        blockedHosts: ["blocked.example"],
        ...policy
      }
    }
  };
}

function createChromeMock(nativeResponses = [], options = {}) {
  const storage = {};
  const postedMessages = [];
  const ports = [];
  const grantedOrigins = new Set(options.grantedOrigins ?? []);
  const activeTab = options.activeTab;
  const contentScriptSession = options.contentScriptSession;
  const runtime = {
    id: "abcdefghijklmnopabcdefghijklmnop",
    lastError: undefined,
    onMessage: createEvent(),
    onInstalled: createEvent(),
    onStartup: createEvent(),
    ...(options.reloadUnavailable ? {} : { reload: options.reload ?? vi.fn() }),
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      name: "skfiy Chrome Adapter",
      version: "0.0.1",
      minimum_chrome_version: "116",
      permissions: ["activeTab", "downloads", "nativeMessaging", "scripting", "storage", "tabs"],
      optional_host_permissions: ["http://*/*", "https://*/*"],
      ...(options.manifest ?? {})
    })),
    connectNative: vi.fn(() => {
      const onMessage = createEvent();
      const onDisconnect = createEvent();
      const port = {
        onMessage,
        onDisconnect,
        disconnect: vi.fn(),
        postMessage: vi.fn((message) => {
          postedMessages.push(message);
          const response = nativeResponses.shift();

          queueMicrotask(() => {
            if (response?.disconnect) {
              runtime.lastError = {
                message: response.error ?? "native_host_disconnected"
              };
              for (const listener of onDisconnect.listeners) {
                listener();
              }
              runtime.lastError = undefined;
              return;
            }

            for (const listener of onMessage.listeners) {
              listener(response);
            }
          });
        })
      };
      ports.push(port);
      return port;
    })
  };

  return {
    chrome: {
      runtime,
      storage: {
        local: {
          get: vi.fn(async (keys) => readStorageSelection(storage, keys)),
          set: vi.fn(async (items) => {
            Object.assign(storage, items);
          })
        }
      },
      permissions: {
        contains: vi.fn(async (permissions) => {
          const origins = permissions?.origins ?? [];
          return origins.every((origin) => grantedOrigins.has(origin));
        }),
        request: vi.fn()
      },
      tabs: {
        query: vi.fn(async () => activeTab ? [activeTab] : []),
        get: vi.fn(),
        sendMessage: vi.fn(async (_tabId, message) => {
          if (message?.type === "skfiy.page.diagnostics" && contentScriptSession) {
            return {
              type: "skfiy.page.diagnostics_result",
              schemaVersion: 1,
              requestId: message.requestId,
              session: contentScriptSession
            };
          }
          return undefined;
        }),
        captureVisibleTab: vi.fn()
      },
      scripting: {
        executeScript: vi.fn()
      },
      downloads: {
        search: vi.fn()
      }
    },
    ports,
    postedMessages,
    storage
  };
}

async function importBackground({ autoHeartbeat = false } = {}) {
  globalThis.__SKFIY_DISABLE_AUTO_HEARTBEAT = !autoHeartbeat;
  const backgroundUrl = pathToFileURL(path.join(process.cwd(), "chrome-extension", "background.js"));
  backgroundUrl.search = `?test=${Date.now()}-${Math.random()}`;
  return import(backgroundUrl.href);
}

async function waitForAssertion(assertion) {
  let lastError;
  for (let index = 0; index < 25; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.chrome;
  delete globalThis.skfiyChromeAdapterDiagnostics;
  delete globalThis.__SKFIY_DISABLE_AUTO_HEARTBEAT;
});

describe("Chrome extension background page routing", () => {
  it("blocks script injection when host policy allows a host but Chrome host permission is missing", async () => {
    const mock = createChromeMock();
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.query.mockResolvedValue([{
      id: 17,
      windowId: 2,
      url: "https://allowed.example/dashboard"
    }]);
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: "skfiy.page.observe",
      requestId: "observe-allowed"
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: "skfiy.host_policy.response",
        schemaVersion: 1,
        requestId: "observe-allowed",
        result: "blocked",
        reason: "chrome_host_permission_missing",
        code: "chrome_host_permission_missing",
        message: "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run.",
        host: "allowed.example",
        origin: "https://allowed.example",
        chromeHostPermission: {
          state: "missing",
          origins: ["https://allowed.example/*"],
          message: "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run."
        },
        policyDecision: {
          decision: "allowed",
          reason: "host_allowed"
        }
      });
    });
    expect(mock.chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ["https://allowed.example/*"]
    });
    expect(mock.chrome.permissions.request).not.toHaveBeenCalled();
    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe("Chrome extension background policy sync", () => {
  it("returns stored policy sync status with a normalized entry count", async () => {
    const mock = createChromeMock();
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: ["turn.example"],
      blockedHosts: ["blocked.example"]
    };
    mock.storage[HOST_POLICY_SYNC_STORAGE_KEY] = {
      schemaVersion: 1,
      state: "synced",
      source: "native_host",
      trigger: "runtime_startup",
      updatedAt: "2026-06-20T10:00:00.000Z",
      requestId: "host-policy-sync-runtime_startup-1",
      hostPolicyState: "configured"
    };
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status"
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: "skfiy.host_policy.response",
        schemaVersion: 1,
        requestId: "popup-status",
        policy: mock.storage[HOST_POLICY_STORAGE_KEY],
        syncStatus: expect.objectContaining({
          schemaVersion: 1,
          state: "synced",
          source: "native_host",
          trigger: "runtime_startup",
          updatedAt: "2026-06-20T10:00:00.000Z",
          requestId: "host-policy-sync-runtime_startup-1",
          hostPolicyState: "configured",
          nativeHostPolicyState: "configured",
          nativeBridgeState: "connected",
          nativeLaunchOrigin: null,
          nativeMessageType: null,
          entryCount: 3,
          lastError: null,
          error: null
        }),
        pageControl: expect.objectContaining({
          capable: false,
          state: "unavailable",
          activeTab: expect.objectContaining({
            state: "unavailable"
          })
        }),
        diagnostics: expect.objectContaining({
          extension: expect.objectContaining({
            id: "abcdefghijklmnopabcdefghijklmnop",
            name: "skfiy Chrome Adapter",
            version: "0.0.1",
            manifestVersion: 3
          }),
          capabilities: expect.objectContaining({
            nativeMessaging: true,
            scripting: true,
            storage: true,
            optionalHostPermissions: ["http://*/*", "https://*/*"]
          }),
          nativeHost: expect.objectContaining({
            name: "com.sskift.skfiy",
            bridgeState: "connected",
            syncState: "synced",
            policyState: "configured",
            lastError: null
          }),
          hostPolicy: expect.objectContaining({
            defaultMode: "ask",
            entryCount: 3,
            allowedHosts: 1,
            currentTurnAllowedHosts: 1,
            blockedHosts: 1
          })
        })
      });
    });
  });

  it("reports current tab host policy and missing optional host permission in diagnostics", async () => {
    const mock = createChromeMock([], {
      activeTab: {
        id: 42,
        windowId: 7,
        url: "https://allowed.example/dashboard"
      }
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.storage[HOST_POLICY_SYNC_STORAGE_KEY] = {
      schemaVersion: 1,
      state: "error",
      source: "native_host",
      updatedAt: "2026-06-20T10:05:00.000Z",
      lastError: "Specified native messaging host not found."
    };
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-missing-permission"
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.host_policy.response",
        requestId: "popup-status-missing-permission",
        diagnostics: expect.objectContaining({
          lastError: "Specified native messaging host not found.",
          nativeHost: expect.objectContaining({
            connectionState: "unavailable",
            syncState: "error",
            syncSource: "native_host",
            lastError: "Specified native messaging host not found."
          }),
          currentTab: expect.objectContaining({
            state: "available",
            tabId: 42,
            windowId: 7,
            host: "allowed.example",
            origin: "https://allowed.example",
            hostPolicy: {
              decision: "allowed",
              reason: "host_allowed"
            },
            chromeHostPermission: expect.objectContaining({
              state: "missing",
              reason: "chrome_host_permission_missing",
              code: "chrome_host_permission_missing",
              origins: ["https://allowed.example/*"],
              message: "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run."
            }),
            contentScript: expect.objectContaining({
              state: "blocked_by_chrome_host_permission",
              reason: "chrome_host_permission_missing",
              lastError: "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run."
            }),
            pageControl: expect.objectContaining({
              capable: false,
              state: "blocked_by_chrome_host_permission",
              nextAction: "grant_chrome_host_permission",
              capabilities: expect.objectContaining({
                screenshot: true,
                domActions: false
              }),
              actions: {
                click: expect.objectContaining({ capable: false }),
                fill: expect.objectContaining({ capable: false }),
                submit: expect.objectContaining({ capable: false }),
                scroll: expect.objectContaining({ capable: false })
              },
              hostPolicy: {
                decision: "allowed",
                reason: "host_allowed"
              },
              chromeHostPermission: expect.objectContaining({
                state: "missing"
              }),
              blockers: expect.arrayContaining([
                expect.objectContaining({
                  code: "blocked_by_chrome_host_permission",
                  reason: "chrome_host_permission_missing"
                })
              ])
            })
          }),
          session: expect.objectContaining({
            state: "blocked_by_chrome_host_permission",
            host: "allowed.example",
            pageControl: expect.objectContaining({
              state: "blocked_by_chrome_host_permission"
            })
          })
        })
      }));
    });

    expect(mock.chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ["https://allowed.example/*"]
    });
    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("queries existing content-script session diagnostics when policy and Chrome host permission allow it", async () => {
    const mock = createChromeMock([], {
      activeTab: {
        id: 43,
        windowId: 8,
        url: "https://allowed.example/dashboard"
      },
      grantedOrigins: ["https://allowed.example/*"],
      contentScriptSession: {
        state: "loaded",
        url: "https://allowed.example/dashboard",
        host: "allowed.example",
        title: "Dashboard",
        sensitivePaused: false,
        sensitivePauseReason: null,
        pageControl: {
          state: "ready",
          capabilities: {
            diagnostics: true,
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            scroll: true,
            screenshot: "background_required"
          },
          counts: {
            interactiveElements: 4,
            forms: 1,
            fillableForms: 1,
            sensitiveForms: 0
          },
          pageSafety: {
            state: "clear"
          },
          sensitivePause: {
            active: false
          }
        },
        observedAt: "2026-06-20T10:07:00.000Z"
      }
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    mock.chrome.runtime.onMessage.listeners[0]({
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-session"
    }, {}, sendResponse);

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        diagnostics: expect.objectContaining({
          currentTab: expect.objectContaining({
            chromeHostPermission: expect.objectContaining({
              state: "granted",
              origins: ["https://allowed.example/*"]
            }),
            contentScript: expect.objectContaining({
              state: "loaded",
              title: "Dashboard",
              sensitivePaused: false
            }),
            pageControl: expect.objectContaining({
              capable: true,
              state: "ready",
              nextAction: "ingest_page_control",
              capabilities: expect.objectContaining({
                screenshot: true,
                domActions: true,
                click: true,
                fill: true,
                scroll: true
              }),
              screenshot: expect.objectContaining({
                capable: true,
                state: "available"
              }),
              actions: expect.objectContaining({
                click: expect.objectContaining({ capable: true }),
                fill: expect.objectContaining({ capable: true }),
                scroll: expect.objectContaining({ capable: true })
              }),
              counts: expect.objectContaining({
                interactiveElements: 4,
                forms: 1
              })
            })
          }),
          session: expect.objectContaining({
            state: "loaded",
            host: "allowed.example",
            pageControl: expect.objectContaining({
              state: "ready",
              capabilities: expect.objectContaining({
                screenshot: true,
                domActions: true
              })
            })
          })
        })
      }));
    });

    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledWith(43, expect.objectContaining({
      type: "skfiy.page.diagnostics",
      schemaVersion: 1
    }));
  });

  it("returns a read-only page-control health protocol for smoke and operator probes", async () => {
    const pageControl = {
      schemaVersion: 1,
      capable: true,
      state: "ready",
      reason: "Content script loaded and DOM controls are available.",
      nextAction: "send_page_action",
      capabilities: {
        diagnostics: true,
        observe: true,
        domActions: true,
        click: true,
        fill: true,
        scroll: true,
        screenshot: "background_required"
      },
      blockers: []
    };
    const mock = createChromeMock([], {
      activeTab: {
        id: 45,
        windowId: 10,
        url: "https://allowed.example/dashboard"
      },
      grantedOrigins: ["https://allowed.example/*"],
      contentScriptSession: {
        state: "loaded",
        url: "https://allowed.example/dashboard",
        host: "allowed.example",
        title: "Dashboard",
        pageControl,
        observedAt: "2026-06-20T10:08:00.000Z"
      }
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    mock.chrome.runtime.onMessage.listeners[0]({
      type: PAGE_CONTROL_HEALTH,
      requestId: "health-smoke"
    }, {}, sendResponse);

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.page_control.health_result",
        schemaVersion: 1,
        requestId: "health-smoke",
        protocol: expect.objectContaining({
          name: "skfiy.chrome.page-control",
          nativeHostName: "com.sskift.skfiy",
          contentScriptFile: "content-script.js",
          messageTypes: expect.objectContaining({
            health: "skfiy.page_control.health",
            diagnostics: "skfiy.page.diagnostics",
            observe: "skfiy.page.observe",
            action: "skfiy.page.action",
            screenshot: "skfiy.page.screenshot"
          }),
          permissionModel: expect.objectContaining({
            hostPermissions: "optional",
            optionalHostPermissions: ["http://*/*", "https://*/*"]
          })
        }),
        pageControl: expect.objectContaining({
          state: "ready",
          capable: true
        }),
        blockers: [],
        diagnostics: expect.objectContaining({
          session: expect.objectContaining({
            state: "loaded",
            pageControl: expect.objectContaining({
              state: "ready"
            })
          })
        })
      }));
    });

    expect(mock.chrome.permissions.request).not.toHaveBeenCalled();
    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("reports missing content script readiness without injecting during status reads", async () => {
    const mock = createChromeMock([], {
      activeTab: {
        id: 44,
        windowId: 9,
        url: "https://allowed.example/dashboard"
      },
      grantedOrigins: ["https://allowed.example/*"]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    mock.chrome.runtime.onMessage.listeners[0]({
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-no-content-script"
    }, {}, sendResponse);

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        pageControl: expect.objectContaining({
          capable: false,
          state: "content_script_not_loaded",
          nextAction: "reload_or_inject_content_script",
          capabilities: expect.objectContaining({
            screenshot: true,
            domActions: false,
            click: false,
            fill: false,
            submit: false,
            scroll: false
          })
        }),
        diagnostics: expect.objectContaining({
          currentTab: expect.objectContaining({
            contentScript: expect.objectContaining({
              state: "not_loaded",
              reason: "content_script_not_loaded"
            }),
            pageControl: expect.objectContaining({
              state: "content_script_not_loaded"
            })
          })
        })
      }));
    });

    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledWith(44, expect.objectContaining({
      type: "skfiy.page.diagnostics"
    }));
  });

  it("reports DOM actions separately when screenshot permission is unavailable", async () => {
    const mock = createChromeMock([], {
      activeTab: {
        id: 45,
        windowId: 10,
        url: "https://allowed.example/dashboard"
      },
      grantedOrigins: ["https://allowed.example/*"],
      manifest: {
        permissions: ["downloads", "nativeMessaging", "scripting", "storage"]
      },
      contentScriptSession: {
        state: "loaded",
        host: "allowed.example",
        pageControl: {
          capable: true,
          state: "ready",
          capabilities: {
            diagnostics: true,
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            submit: true,
            scroll: true,
            screenshot: "background_required"
          },
          actions: {
            click: { capable: true, state: "available", nextAction: "send_page_action" },
            fill: { capable: true, state: "available", nextAction: "send_page_action" },
            submit: { capable: true, state: "available", nextAction: "send_page_action" },
            scroll: { capable: true, state: "available", nextAction: "send_page_action" }
          }
        }
      }
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    mock.chrome.runtime.onMessage.listeners[0]({
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-no-screenshot"
    }, {}, sendResponse);

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        pageControl: expect.objectContaining({
          capable: true,
          state: "partial",
          reason: "Extension activeTab permission is unavailable.",
          capabilities: expect.objectContaining({
            screenshot: false,
            domActions: true,
            click: true,
            fill: true,
            submit: true,
            scroll: true
          }),
          screenshot: {
            capable: false,
            state: "blocked",
            reason: "Extension activeTab permission is unavailable.",
            nextAction: "ingest_page_control"
          },
          actions: expect.objectContaining({
            click: expect.objectContaining({ capable: true }),
            submit: expect.objectContaining({ capable: true })
          })
        })
      }));
    });
  });

  it("syncs host policy through the native host and records sync status", async () => {
    const mock = createChromeMock([createPolicyResponse()]);
    globalThis.chrome = mock.chrome;
    const background = await importBackground();

    await expect(background.syncHostPolicy("runtime_startup")).resolves.toMatchObject({
      result: "accepted",
      hostPolicy: {
        state: "configured"
      }
    });

    expect(mock.chrome.runtime.connectNative).toHaveBeenCalledWith("com.sskift.skfiy");
    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-runtime_startup-/);
    expect(mock.storage[HOST_POLICY_STORAGE_KEY]).toEqual({
      defaultMode: "ask",
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: ["turn.example"],
      blockedHosts: ["blocked.example"]
    });
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
      schemaVersion: 1,
      state: "synced",
      source: "native_host",
      trigger: "runtime_startup",
      requestId: mock.postedMessages[0].requestId,
      hostPolicyState: "configured",
      nativeBridgeState: "connected",
      nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
      nativeMessageType: "skfiy.host_policy.request",
      nativeResponseType: "skfiy.native.response",
      nativeResponseResult: "accepted",
      entryCount: 3
    });
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY].requestedAt).toEqual(expect.any(String));
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY].completedAt).toEqual(expect.any(String));
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY].updatedAt).toEqual(expect.any(String));
  });

  it("syncs from install and startup lifecycle hooks", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["installed.example"] }),
      createPolicyResponse({ allowedHosts: ["startup.example"] })
    ]);
    globalThis.chrome = mock.chrome;
    await importBackground();

    expect(mock.chrome.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
    expect(mock.chrome.runtime.onStartup.addListener).toHaveBeenCalledTimes(1);

    mock.chrome.runtime.onInstalled.listeners[0]();
    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "runtime_installed"
      });
    });

    mock.chrome.runtime.onStartup.listeners[0]();
    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "runtime_startup"
      });
    });

    expect(mock.postedMessages.map((message) => message.type)).toEqual([
      "skfiy.host_policy.request",
      "skfiy.host_policy.request"
    ]);
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-runtime_installed-/);
    expect(mock.postedMessages[1].requestId).toMatch(/^host-policy-sync-runtime_startup-/);
    expect(mock.storage[HOST_POLICY_STORAGE_KEY].allowedHosts).toEqual(["startup.example"]);
  });

  it("records a native heartbeat when the service worker loads after extension reload", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["loaded.example"] })
    ]);
    globalThis.chrome = mock.chrome;
    await importBackground({ autoHeartbeat: true });

    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "service_worker_loaded"
      });
    });

    expect(mock.postedMessages.map((message) => message.type)).toEqual([
      "skfiy.host_policy.request"
    ]);
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-service_worker_loaded-/);
    expect(mock.storage[HOST_POLICY_STORAGE_KEY].allowedHosts).toEqual(["loaded.example"]);
  });

  it("lets the popup trigger a manual native host policy refresh", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["manual.example"], blockedHosts: [] })
    ]);
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: HOST_POLICY_SYNC_REFRESH,
      requestId: "popup-refresh"
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        type: "skfiy.host_policy.response",
        schemaVersion: 1,
        requestId: "popup-refresh",
        policy: expect.objectContaining({
          allowedHosts: ["manual.example"],
          currentTurnAllowedHosts: ["turn.example"],
          blockedHosts: []
        }),
        syncStatus: expect.objectContaining({
          state: "synced",
          source: "native_host",
          trigger: "popup_manual",
          hostPolicyState: "configured",
          nativeHostPolicyState: "configured",
          entryCount: 2,
          lastError: null,
          error: null
        }),
        pageControl: expect.objectContaining({
          state: "unavailable"
        }),
        diagnostics: expect.objectContaining({
          capabilities: expect.objectContaining({
            nativeMessaging: true
          }),
          nativeHost: expect.objectContaining({
            name: "com.sskift.skfiy",
            bridgeState: "connected",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            messageType: "skfiy.host_policy.request",
            responseType: "skfiy.native.response",
            responseResult: "accepted",
            syncState: "synced",
            policyState: "configured",
            lastError: null
          }),
          hostPolicy: expect.objectContaining({
            entryCount: 2,
            allowedHosts: 1,
            currentTurnAllowedHosts: 1,
            blockedHosts: 0
          })
        })
      });
    });

    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-popup_manual-/);
  });

  it("lets the popup trigger a native heartbeat without changing the host protocol", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["heartbeat.example"], currentTurnAllowedHosts: [], blockedHosts: [] })
    ]);
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: NATIVE_HEARTBEAT,
      requestId: "popup-heartbeat"
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.native.heartbeat_result",
        schemaVersion: 1,
        requestId: "popup-heartbeat",
        heartbeat: expect.objectContaining({
          state: "connected",
          trigger: "popup_heartbeat",
          bridgeState: "connected",
          launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          messageType: "skfiy.host_policy.request",
          responseType: "skfiy.native.response",
          responseResult: "accepted",
          lastError: null
        }),
        diagnostics: expect.objectContaining({
          devReload: expect.objectContaining({
            state: "idle",
            heartbeat: expect.objectContaining({
              state: "connected",
              trigger: "popup_heartbeat"
            })
          }),
          nativeHost: expect.objectContaining({
            bridgeState: "connected",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            messageType: "skfiy.host_policy.request"
          })
        })
      }));
    });

    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-popup_heartbeat-/);
  });

  it("schedules an extension reload after recording a diagnostic heartbeat", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["reload.example"], currentTurnAllowedHosts: [], blockedHosts: [] })
    ]);
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: DEV_RELOAD_REQUEST,
      requestId: "popup-dev-reload"
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.dev.reload_result",
        schemaVersion: 1,
        requestId: "popup-dev-reload",
        heartbeat: expect.objectContaining({
          state: "connected",
          trigger: "popup_dev_reload"
        }),
        devReload: expect.objectContaining({
          state: "scheduled",
          reloadAvailable: true,
          reason: "heartbeat_connected",
          browserPolicy: "extension_context_reload",
          heartbeat: expect.objectContaining({
            state: "connected"
          })
        }),
        diagnostics: expect.objectContaining({
          devReload: expect.objectContaining({
            state: "scheduled",
            heartbeat: expect.objectContaining({
              state: "connected"
            })
          })
        })
      }));
    });

    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.chrome.runtime.reload).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mock.chrome.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it("schedules a host policy sync when forwarding a native host message", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "observe-native",
        result: "accepted"
      },
      createPolicyResponse({ allowedHosts: ["native-connect.example"] })
    ]);
    globalThis.chrome = mock.chrome;
    await importBackground();

    const sendResponse = vi.fn();
    const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0]({
      type: "skfiy.native.message",
      requestId: "outer-request",
      payload: {
        schemaVersion: 1,
        type: "skfiy.page.observe",
        requestId: "observe-native"
      }
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        requestId: "observe-native",
        result: "accepted"
      }));
    });
    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "native_host_connect"
      });
    });

    expect(mock.postedMessages).toHaveLength(2);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: "observe-native"
    });
    expect(mock.postedMessages[1]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.postedMessages[1].requestId).toMatch(/^host-policy-sync-native_host_connect-/);
    expect(mock.storage[HOST_POLICY_STORAGE_KEY].allowedHosts).toEqual(["native-connect.example"]);
  });

  it("records sync errors when the native host is unavailable", async () => {
    const mock = createChromeMock([
      {
        disconnect: true,
        error: "Specified native messaging host not found."
      }
    ]);
    globalThis.chrome = mock.chrome;
    const background = await importBackground();

    await expect(background.syncHostPolicy("runtime_installed")).resolves.toMatchObject({
      ok: false,
      error: "Specified native messaging host not found."
    });

    expect(mock.storage[HOST_POLICY_STORAGE_KEY]).toBeUndefined();
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
      state: "error",
      source: "native_host",
      trigger: "runtime_installed",
      lastError: "Specified native messaging host not found.",
      error: "Specified native messaging host not found."
    });
  });

  it("records malformed native policy responses as errors and recovers on the next refresh", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.host_policy.response",
        requestId: "malformed-policy",
        result: "accepted"
      },
      createPolicyResponse({ allowedHosts: ["recovered.example"], currentTurnAllowedHosts: [], blockedHosts: [] })
    ]);
    globalThis.chrome = mock.chrome;
    const background = await importBackground();

    await expect(background.syncHostPolicy("popup_manual")).resolves.toMatchObject({
      result: "accepted"
    });

    expect(mock.storage[HOST_POLICY_STORAGE_KEY]).toBeUndefined();
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
      state: "error",
      source: "native_host",
      trigger: "popup_manual",
      lastError: "host_policy_unavailable",
      error: "host_policy_unavailable"
    });

    await expect(background.syncHostPolicy("popup_manual")).resolves.toMatchObject({
      hostPolicy: {
        state: "configured",
        policy: expect.objectContaining({
          allowedHosts: ["recovered.example"]
        })
      }
    });

    expect(mock.storage[HOST_POLICY_STORAGE_KEY]).toMatchObject({
      allowedHosts: ["recovered.example"]
    });
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
      state: "synced",
      source: "native_host",
      trigger: "popup_manual",
      nativeHostPolicyState: "configured",
      hostPolicyState: "configured",
      entryCount: 1
    });
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY].error).toBeUndefined();
  });
});
