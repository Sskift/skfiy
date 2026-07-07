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
const PAGE_CONTROL_WAKE = "skfiy.page_control.wake";
const PAGE_OBSERVE = "skfiy.page.observe";
const PAGE_ACTION = "skfiy.page.action";
const PAGE_SCREENSHOT = "skfiy.page.screenshot";
const TABS_DISCOVER = "skfiy.tabs.discover";

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

function createPageObserveResponse() {
  return {
    schemaVersion: 1,
    type: "skfiy.native.response",
    requestId: "page-control-heartbeat-response",
    result: "accepted",
    bridgeState: "connected",
    launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
    messageType: "skfiy.page.observe"
  };
}

function createChromeMock(nativeResponses = [], options = {}) {
  const storage = {};
  const postedMessages = [];
  const ports = [];
  const grantedOrigins = new Set(options.grantedOrigins ?? []);
  const activeTab = options.activeTab;
  const contentScriptSession = options.contentScriptSession;
  const pageObserveSnapshot = options.pageObserveSnapshot;
  const pageActionResults = Array.isArray(options.pageActionResults)
    ? [...options.pageActionResults]
    : undefined;
  const contentScriptSessions = Array.isArray(options.contentScriptSessions)
    ? [...options.contentScriptSessions]
    : undefined;
  const stalledDiagnosticTabIds = new Set(options.stalledDiagnosticTabIds ?? []);
  const allTabs = Array.isArray(options.allTabs) ? options.allTabs : undefined;
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
        onCreated: createEvent(),
        onActivated: createEvent(),
        onUpdated: createEvent(),
        query: vi.fn(async (queryInfo = {}) => {
          if (options.queryTabsError) {
            throw new Error(options.queryTabsError);
          }
          if (allTabs) {
            if (queryInfo.active === true && queryInfo.currentWindow === true) {
              const active = allTabs.find((tab) => tab.active) ?? activeTab;
              return active ? [active] : [];
            }
            if (Number.isInteger(queryInfo.windowId)) {
              return allTabs.filter((tab) => tab.windowId === queryInfo.windowId);
            }
            return allTabs;
          }
          return activeTab ? [activeTab] : [];
        }),
        get: vi.fn(async (tabId) => (
          activeTab && (activeTab.id === tabId || typeof tabId === "undefined")
            ? activeTab
            : undefined
        )),
        update: vi.fn(async (tabId, updateProperties) => ({
          id: tabId,
          ...(updateProperties ?? {})
        })),
        remove: vi.fn(async () => undefined),
        sendMessage: vi.fn(async (tabId, message) => {
          if (message?.type === "skfiy.page.diagnostics" && stalledDiagnosticTabIds.has(tabId)) {
            return new Promise(() => {});
          }
          if (message?.type === "skfiy.page.diagnostics" && contentScriptSessions) {
            const session = contentScriptSessions.shift();
            if (session) {
              return {
                type: "skfiy.page.diagnostics_result",
                schemaVersion: 1,
                requestId: message.requestId,
                session
              };
            }
            return undefined;
          }
          if (message?.type === "skfiy.page.diagnostics" && contentScriptSession) {
            return {
              type: "skfiy.page.diagnostics_result",
              schemaVersion: 1,
              requestId: message.requestId,
              session: contentScriptSession
            };
          }
          if (message?.type === PAGE_OBSERVE && pageObserveSnapshot) {
            return {
              type: "skfiy.page.observe_result",
              schemaVersion: 1,
              requestId: message.requestId,
              snapshot: pageObserveSnapshot
            };
          }
          if (message?.type === PAGE_ACTION && pageActionResults) {
            return {
              type: "skfiy.page.action_result",
              schemaVersion: 1,
              requestId: message.requestId,
              ...(pageActionResults.shift() ?? {
                result: "passed",
                action: message.payload?.action?.kind
              })
            };
          }
          return undefined;
        }),
        captureVisibleTab: vi.fn(async () => {
          if (options.captureVisibleTabError) {
            throw new Error(options.captureVisibleTabError);
          }
          return options.captureVisibleTabDataUrl;
        })
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

async function loadBackground(mock, options) {
  globalThis.chrome = mock.chrome;
  const background = await importBackground(options);

  return { mock, background };
}

function sendRuntimeMessage(mock, message, sender = {}, sendResponse = vi.fn()) {
  const keepChannelOpen = mock.chrome.runtime.onMessage.listeners[0](message, sender, sendResponse);

  return {
    keepChannelOpen,
    sendResponse
  };
}

function dispatchRuntimeInstalled(mock) {
  mock.chrome.runtime.onInstalled.listeners[0]();
}

function dispatchRuntimeStartup(mock) {
  mock.chrome.runtime.onStartup.listeners[0]();
}

function dispatchTabCreated(mock, tab) {
  mock.chrome.tabs.onCreated.listeners[0](tab);
}

function dispatchTabUpdated(mock, tabId, changeInfo, tab) {
  const listener = mock.chrome.tabs.onUpdated.listeners[0];
  if (arguments.length > 3) {
    listener(tabId, changeInfo, tab);
    return;
  }
  listener(tabId, changeInfo);
}

function dispatchWakeTabCreated(mock, url, { tabId = 99, active = true } = {}) {
  dispatchTabCreated(mock, {
    id: tabId,
    windowId: 7,
    active,
    url
  });
}

function dispatchWakeTabUpdated(mock, url, { tabId = 99, changeInfo = { status: "complete" }, active } = {}) {
  dispatchTabUpdated(mock, tabId, changeInfo, {
    id: tabId,
    windowId: 7,
    ...(active === undefined ? {} : { active }),
    url
  });
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
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: "skfiy.page.observe",
      requestId: "observe-allowed"
    });

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

  it("preserves structured site-access blockers in wake action native evidence", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "page-control-fill-cli-current",
        result: "accepted",
        bridgeState: "connected",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: PAGE_ACTION
      }
    ], {
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
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: PAGE_CONTROL_WAKE,
      requestId: "wake-fill-current",
      directive: {
        wakeId: "wake-fill-current",
        requestId: "page-control-fill-cli-current",
        targetTabId: 42,
        wakeAction: "fill",
        selector: "#name",
        text: "skfiy"
      }
    });

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: PAGE_CONTROL_WAKE,
        schemaVersion: 1,
        requestId: "wake-fill-current",
        result: "executed"
      }));
      expect(mock.postedMessages).toEqual([
        expect.objectContaining({
          type: PAGE_ACTION,
          requestId: "page-control-fill-cli-current",
          payload: expect.objectContaining({
            source: "popup_wake",
            targetTabId: 42,
            pageActionResult: expect.objectContaining({
              type: "skfiy.host_policy.response",
              requestId: "page-control-fill-cli-current",
              result: "blocked",
              reason: "chrome_host_permission_missing",
              code: "chrome_host_permission_missing",
              message: "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run.",
              chromeHostPermission: expect.objectContaining({
                state: "missing",
                origins: ["https://allowed.example/*"]
              })
            })
          })
        })
      ]);
    });
    expect(mock.chrome.permissions.request).not.toHaveBeenCalled();
    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(mock.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("returns bounded Chrome tab discovery blockers without page content", async () => {
    const mock = createChromeMock([
      createPolicyResponse({
        allowedHosts: ["allowed.example", "missing-permission.example", "content-missing.example"],
        currentTurnAllowedHosts: [],
        blockedHosts: ["blocked.example"]
      }),
      createPageObserveResponse()
    ], {
      grantedOrigins: [
        "https://allowed.example/*",
        "https://content-missing.example/*"
      ],
      allTabs: [
        {
          id: 41,
          windowId: 7,
          active: true,
          title: "Allowed app",
          url: "https://allowed.example/dashboard?token=secret#section"
        },
        {
          id: 42,
          windowId: 7,
          title: "Extensions",
          url: "chrome://extensions/"
        },
        {
          id: 43,
          windowId: 7,
          title: "skfiy popup",
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1"
        },
        {
          id: 44,
          windowId: 7,
          title: "Local file",
          url: "file:///Users/tester/private/report.html"
        },
        {
          id: 45,
          windowId: 7,
          title: "Ask host",
          url: "https://ask.example/dashboard"
        },
        {
          id: 46,
          windowId: 7,
          title: "Missing permission",
          url: "https://missing-permission.example/dashboard"
        },
        {
          id: 47,
          windowId: 7,
          title: "Blocked host",
          url: "https://blocked.example/dashboard"
        },
        {
          id: 48,
          windowId: 7,
          title: "Content missing",
          url: "https://content-missing.example/dashboard"
        }
      ],
      contentScriptSessions: [
        {
          state: "loaded",
          url: "https://allowed.example/dashboard",
          pageControl: {
            state: "ready",
            capable: true
          },
          visibleText: "must not be exported"
        }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example", "missing-permission.example", "content-missing.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: ["blocked.example"]
    };
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: TABS_DISCOVER,
      requestId: "tabs-discover-test"
    });

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.tabs.discover_result",
        schemaVersion: 1,
        requestId: "tabs-discover-test",
        result: "passed",
        tabs: [
          expect.objectContaining({
            id: 41,
            windowId: 7,
            title: "Allowed app",
            url: "https://allowed.example/dashboard?token=<redacted>",
            host: "allowed.example",
            scheme: "https:",
            state: "eligible",
            eligible: true
          }),
          expect.objectContaining({
            id: 42,
            state: "blocked",
            eligible: false,
            blocker: "internal_chrome_page"
          }),
          expect.objectContaining({
            id: 43,
            state: "blocked",
            eligible: false,
            blocker: "chrome_extension_page"
          }),
          expect.objectContaining({
            id: 44,
            url: "file://<redacted>",
            state: "blocked",
            eligible: false,
            blocker: "file_url_not_supported"
          }),
          expect.objectContaining({
            id: 45,
            state: "blocked",
            eligible: false,
            blocker: "blocked_by_host_policy"
          }),
          expect.objectContaining({
            id: 46,
            state: "blocked",
            eligible: false,
            blocker: "blocked_by_chrome_host_permission"
          }),
          expect.objectContaining({
            id: 47,
            state: "blocked",
            eligible: false,
            blocker: "blocked_by_host_policy"
          }),
          expect.objectContaining({
            id: 48,
            state: "blocked",
            eligible: false,
            blocker: "content_script_not_loaded"
          })
        ]
      }));
    });
    const responseJson = JSON.stringify(sendResponse.mock.calls[0][0]);
    expect(responseJson).not.toContain("must not be exported");
    expect(responseJson).not.toContain("/Users/tester/private");
    expect(mock.chrome.permissions.request).not.toHaveBeenCalled();
    expect(mock.chrome.scripting.executeScript).not.toHaveBeenCalled();

    await waitForAssertion(() => {
      expect(mock.postedMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "skfiy.tabs.discover",
          requestId: "tabs-discover-test",
          payload: {
            pageTabs: expect.objectContaining({
              tabs: expect.arrayContaining([
                expect.objectContaining({ id: 41, state: "eligible" }),
                expect.objectContaining({ id: 44, url: "file://<redacted>" })
              ])
            })
          }
        })
      ]));
    });
    expect(JSON.stringify(mock.postedMessages)).not.toContain("must not be exported");
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
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status"
    });

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
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-missing-permission"
    });

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
                screenshot: false,
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

  it("uses the requested target tab for popup policy status diagnostics", async () => {
    const mock = createChromeMock([], {
      activeTab: {
        id: 99,
        windowId: 7,
        url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyTargetTabId=42"
      }
    });
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "https://target.example/dashboard"
        };
      }
      return {
        id: 99,
        windowId: 7,
        url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyTargetTabId=42"
      };
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["target.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-target",
      tabId: 42
    });

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.host_policy.response",
        requestId: "popup-status-target",
        diagnostics: expect.objectContaining({
          currentTab: expect.objectContaining({
            state: "available",
            tabId: 42,
            host: "target.example",
            hostPolicy: {
              decision: "allowed",
              reason: "host_allowed"
            },
            chromeHostPermission: expect.objectContaining({
              state: "missing",
              origins: ["https://target.example/*"]
            })
          })
        }),
        pageControl: expect.objectContaining({
          activeTab: expect.objectContaining({
            tabId: 42,
            host: "target.example"
          })
        })
      }));
    });
  });

  it("queries existing content-script session diagnostics when policy and Chrome host permission allow it", async () => {
    const mock = createChromeMock([], {
      activeTab: {
        id: 43,
        windowId: 8,
        url: "https://allowed.example/dashboard"
      },
      grantedOrigins: ["https://allowed.example/*", "<all_urls>"],
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
    await loadBackground(mock);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-session"
    });

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
      grantedOrigins: ["https://allowed.example/*", "<all_urls>"],
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
    await loadBackground(mock);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: PAGE_CONTROL_HEALTH,
      requestId: "health-smoke"
    });

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
      grantedOrigins: ["https://allowed.example/*", "<all_urls>"]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["allowed.example"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    await loadBackground(mock);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-no-content-script"
    });

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
    await loadBackground(mock);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_STATUS,
      requestId: "popup-status-no-screenshot"
    });

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        pageControl: expect.objectContaining({
          capable: true,
          state: "partial",
          reason: "Chrome visible-tab capture requires <all_urls> permission or an activeTab user gesture.",
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
            reason: "Chrome visible-tab capture requires <all_urls> permission or an activeTab user gesture.",
            nextAction: "grant_chrome_capture_permission"
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
    const { background } = await loadBackground(mock);

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
      createPageObserveResponse(),
      createPolicyResponse({ allowedHosts: ["startup.example"] }),
      createPageObserveResponse()
    ]);
    await loadBackground(mock);

    dispatchRuntimeInstalled(mock);
    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "runtime_installed"
      });
    });

    dispatchRuntimeStartup(mock);
    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "runtime_startup"
      });
    });

    expect(mock.postedMessages.map((message) => message.type)).toEqual([
      "skfiy.host_policy.request",
      "skfiy.page.observe",
      "skfiy.host_policy.request",
      "skfiy.page.observe"
    ]);
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-runtime_installed-/);
    expect(mock.postedMessages[1]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        source: "page_control_health",
        pageControl: expect.objectContaining({
          state: "unavailable"
        })
      })
    });
    expect(mock.postedMessages[2].requestId).toMatch(/^host-policy-sync-runtime_startup-/);
    expect(mock.storage[HOST_POLICY_STORAGE_KEY].allowedHosts).toEqual(["startup.example"]);
  });

  it("records a native heartbeat when the service worker loads after extension reload", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["loaded.example"] }),
      createPageObserveResponse()
    ]);
    await loadBackground(mock, { autoHeartbeat: true });

    await waitForAssertion(() => {
      expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY]).toMatchObject({
        state: "synced",
        trigger: "service_worker_loaded"
      });
    });

    expect(mock.postedMessages.map((message) => message.type)).toEqual([
      "skfiy.host_policy.request",
      "skfiy.page.observe"
    ]);
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-service_worker_loaded-/);
    expect(mock.postedMessages[1]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        source: "page_control_health",
        pageControl: expect.objectContaining({
          state: "unavailable"
        })
      })
    });
    expect(mock.storage[HOST_POLICY_STORAGE_KEY].allowedHosts).toEqual(["loaded.example"]);
  });

  it("runs tab discovery when the service worker starts after a tabs wake page already loaded", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "tabs-discover-response",
        result: "accepted",
        bridgeState: "connected",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: TABS_DISCOVER
      },
      createPolicyResponse({ allowedHosts: ["loaded.example"] }),
      createPageObserveResponse()
    ], {
      allTabs: [
        {
          id: 99,
          windowId: 7,
          active: true,
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=late-tabs&skfiyWakeAction=tabs"
        },
        {
          id: 41,
          windowId: 7,
          title: "Loaded app",
          url: "https://loaded.example/dashboard"
        }
      ]
    });
    await loadBackground(mock, { autoHeartbeat: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await waitForAssertion(() => {
      expect(mock.postedMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          type: TABS_DISCOVER,
          payload: expect.objectContaining({
            pageTabs: expect.objectContaining({
              result: "passed",
              tabs: expect.arrayContaining([
                expect.objectContaining({
                  id: 99,
                  blocker: "chrome_extension_page"
                }),
                expect.objectContaining({
                  id: 41,
                  host: "loaded.example"
                })
              ])
            })
          })
        })
      ]));
    });
  });

  it("records tab discovery blocker evidence when Chrome tab query fails", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "tabs-discover-response",
        result: "accepted",
        bridgeState: "connected",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: TABS_DISCOVER
      }
    ], {
      queryTabsError: "Tabs cannot be queried in this context"
    });
    await loadBackground(mock);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: TABS_DISCOVER,
      requestId: "tabs-query-error"
    });

    await waitForAssertion(() => {
      expect(mock.postedMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          type: TABS_DISCOVER,
          payload: expect.objectContaining({
            pageTabs: expect.objectContaining({
              result: "blocked",
              reason: "Tabs cannot be queried in this context",
              tabs: []
            })
          })
        })
      ]));
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: "skfiy.tabs.discover_result",
        result: "blocked",
        reason: "Tabs cannot be queried in this context",
        tabs: []
      }));
    });
  });

  it("runs tab discovery from created wake tabs without relying on delayed timers", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "tabs-discover-immediate",
        result: "accepted",
        bridgeState: "connected",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: TABS_DISCOVER
      }
    ], {
      allTabs: [
        {
          id: 99,
          windowId: 7,
          active: true,
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs-immediate&skfiyWakeAction=tabs&skfiyRequestId=tabs-discover-immediate"
        },
        {
          id: 41,
          windowId: 7,
          title: "Immediate app",
          url: "https://immediate.example/dashboard"
        }
      ]
    });
    await loadBackground(mock);

    dispatchWakeTabCreated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs-immediate&skfiyWakeAction=tabs&skfiyRequestId=tabs-discover-immediate"
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    await waitForAssertion(() => {
      const discoveryMessage = mock.postedMessages.find((message) => message.type === TABS_DISCOVER);
      expect(discoveryMessage?.requestId).toBe("tabs-discover-immediate");
      expect(discoveryMessage?.payload?.pageTabs?.tabs).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 41, host: "immediate.example" })
      ]));
    });
  });

  it("closes tabs-discovery wake tabs after native evidence is recorded", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "tabs-discover-close-wake",
        result: "accepted",
        bridgeState: "connected",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: TABS_DISCOVER
      }
    ], {
      allTabs: [
        {
          id: 99,
          windowId: 7,
          active: true,
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs-close&skfiyWakeAction=tabs&skfiyRequestId=tabs-discover-close-wake"
        },
        {
          id: 41,
          windowId: 7,
          title: "Close wake app",
          url: "https://close-wake.example/dashboard"
        }
      ]
    });
    await loadBackground(mock);

    dispatchWakeTabCreated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs-close&skfiyWakeAction=tabs&skfiyRequestId=tabs-discover-close-wake"
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    await waitForAssertion(() => {
      expect(mock.postedMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          type: TABS_DISCOVER,
          requestId: "tabs-discover-close-wake"
        })
      ]));
      expect(mock.chrome.tabs.remove).toHaveBeenCalledWith(99);
    });
  });

  it("times out stalled content diagnostics during tab discovery", async () => {
    vi.useFakeTimers();
    try {
      const mock = createChromeMock([
        {
          schemaVersion: 1,
          type: "skfiy.native.response",
          requestId: "tabs-discover-stalled-diagnostics",
          result: "accepted",
          bridgeState: "connected",
          launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          messageType: TABS_DISCOVER
        }
      ], {
        grantedOrigins: ["http://127.0.0.1/*"],
        stalledDiagnosticTabIds: [41],
        contentScriptSessions: [
          {
            pageControl: {
              capabilities: {
                domActions: true
              }
            }
          }
        ],
        allTabs: [
          {
            id: 41,
            windowId: 7,
            title: "Stalled fixture",
            url: "http://127.0.0.1:60329/?skfiy_action_live=smoke"
          },
          {
            id: 42,
            windowId: 7,
            title: "Ready fixture",
            url: "http://127.0.0.1:63852/?skfiy_action_live=smoke"
          }
        ]
      });
      mock.storage[HOST_POLICY_STORAGE_KEY] = {
        schemaVersion: 1,
        defaultMode: "ask",
        allowedHosts: ["127.0.0.1:60329", "127.0.0.1:63852"],
        currentTurnAllowedHosts: [],
        blockedHosts: []
      };
      await loadBackground(mock);

      sendRuntimeMessage(mock, {
        type: TABS_DISCOVER,
        schemaVersion: 1,
        requestId: "tabs-discover-stalled-diagnostics"
      });

      await vi.advanceTimersByTimeAsync(1_000);

      const discoveryMessage = mock.postedMessages.find((message) => message.type === TABS_DISCOVER);
      expect(discoveryMessage?.requestId).toBe("tabs-discover-stalled-diagnostics");
      expect(discoveryMessage?.payload?.pageTabs?.tabs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 41,
          state: "blocked",
          blocker: "content_script_diagnostics_timeout"
        }),
        expect.objectContaining({
          id: 42,
          state: "eligible"
        })
      ]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers tab discovery when an extension wake update omits the query string", async () => {
    const mock = createChromeMock([
      {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "tabs-discover-response",
        result: "accepted",
        bridgeState: "connected",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: TABS_DISCOVER
      }
    ], {
      allTabs: [
        {
          id: 99,
          windowId: 7,
          active: true,
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=recovered-tabs&skfiyWakeAction=tabs"
        },
        {
          id: 41,
          windowId: 7,
          title: "Recovered app",
          url: "https://recovered.example/dashboard"
        }
      ]
    });
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html",
      { active: true }
    );
    await new Promise((resolve) => setTimeout(resolve, 450));

    await waitForAssertion(() => {
      expect(mock.postedMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          type: TABS_DISCOVER,
          payload: expect.objectContaining({
            pageTabs: expect.objectContaining({
              result: "passed",
              tabs: expect.arrayContaining([
                expect.objectContaining({
                  id: 99,
                  blocker: "chrome_extension_page"
                }),
                expect.objectContaining({
                  id: 41,
                  host: "recovered.example"
                })
              ])
            })
          })
        })
      ]));
    });
  });

  it("refreshes page-control heartbeat when the active tab finishes loading", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["127.0.0.1:63852"], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ], {
      activeTab: {
        id: 42,
        windowId: 7,
        url: "http://127.0.0.1:63852/"
      }
    });
    await loadBackground(mock);

    dispatchTabUpdated(mock, 42, { status: "complete" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await waitForAssertion(() => {
      expect(mock.postedMessages.map((message) => message.type)).toEqual([
        "skfiy.host_policy.request",
        "skfiy.page.observe"
      ]);
    });

    expect(mock.postedMessages[1]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        source: "page_control_health",
        pageControl: expect.objectContaining({
          state: "blocked_by_chrome_host_permission",
          activeTab: expect.objectContaining({
            host: "127.0.0.1:63852"
          }),
          chromeHostPermission: expect.objectContaining({
            origins: ["http://127.0.0.1/*"]
          })
        })
      })
    });
  });

  it("does not record page-control heartbeat for the extension popup tab", async () => {
    const mock = createChromeMock([]);
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1"
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mock.postedMessages).toEqual([]);
  });

  it("routes extension wake tab heartbeats to the requested target tab", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["127.0.0.1:63852"], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*", "<all_urls>"],
      contentScriptSession: {
        state: "loaded",
        host: "127.0.0.1:63852",
        pageControl: {
          state: "ready",
          capabilities: {
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            submit: true,
            scroll: true
          }
        }
      }
    });
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 99) {
        return {
          id: 99,
          windowId: 7,
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42"
        };
      }
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42"
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mock.postedMessages[1]).toMatchObject({
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        pageControl: expect.objectContaining({
          state: "ready",
          activeTab: expect.objectContaining({
            tabId: 42,
            host: "127.0.0.1:63852"
          })
        })
      })
    });
  });

  it("routes observe wake URLs through page observation native heartbeat", async () => {
    const pageObserveSnapshot = {
      schemaVersion: 1,
      title: "skfiy observe smoke",
      url: "http://127.0.0.1:63852/",
      visibleText: "skfiy observe live smoke 2026-06-21 compiled binary path"
    };
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*", "<all_urls>"],
      pageObserveSnapshot
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 99) {
        return {
          id: 99,
          windowId: 7,
          url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=observe"
        };
      }
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=observe"
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mock.postedMessages).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        type: PAGE_OBSERVE,
        payload: expect.objectContaining({
          source: "popup_wake",
          targetTabId: 42,
          pageObservation: pageObserveSnapshot
        })
      })
    ]);
  });

  it("routes screenshot and action wake URLs through bounded native heartbeats", async () => {
    const screenshotDataUrl = `data:image/png;base64,${"a".repeat(2048)}`;
    const mock = createChromeMock([
      createPageObserveResponse(),
      createPageObserveResponse(),
      createPageObserveResponse(),
      createPageObserveResponse(),
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*", "<all_urls>"],
      captureVisibleTabDataUrl: screenshotDataUrl,
      pageActionResults: [
        { result: "passed", action: "click" },
        { result: "passed", action: "fill" },
        { result: "passed", action: "submit" },
        { result: "passed", action: "scroll" }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const wakeUrls = [
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=screenshot&skfiyRequestId=cli-screenshot-current",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=click&skfiySelector=%23submit&skfiyRequestId=cli-click-current",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=fill&skfiySelector=%23name&skfiyText=skfiy&skfiyRequestId=cli-fill-current",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=submit&skfiySelector=form&skfiyRequestId=cli-submit-current",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=scroll&skfiyDy=600&skfiyRequestId=cli-scroll-current"
    ];

    for (const [index, url] of wakeUrls.entries()) {
      dispatchWakeTabUpdated(mock, url);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await waitForAssertion(() => {
        expect(mock.postedMessages).toHaveLength(index + 1);
      });
    }

    expect(mock.chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(7, {
      format: "png"
    });
    expect(mock.chrome.tabs.update).toHaveBeenCalledWith(42, {
      active: true
    });
    expect(mock.chrome.tabs.sendMessage).toHaveBeenNthCalledWith(1, 42, expect.objectContaining({
      type: PAGE_ACTION,
      tabId: 42,
      payload: {
        action: {
          kind: "click",
          selector: "#submit"
        }
      }
    }));
    expect(mock.chrome.tabs.sendMessage).toHaveBeenNthCalledWith(2, 42, expect.objectContaining({
      type: PAGE_ACTION,
      tabId: 42,
      payload: {
        action: {
          kind: "fill",
          selector: "#name",
          value: "skfiy"
        }
      }
    }));
    expect(mock.chrome.tabs.sendMessage).toHaveBeenNthCalledWith(3, 42, expect.objectContaining({
      type: PAGE_ACTION,
      tabId: 42,
      payload: {
        action: {
          kind: "submit",
          selector: "form",
          confirmed: true
        }
      }
    }));
    expect(mock.chrome.tabs.sendMessage).toHaveBeenNthCalledWith(4, 42, expect.objectContaining({
      type: PAGE_ACTION,
      tabId: 42,
      payload: {
        action: {
          kind: "scroll",
          deltaY: 600
        }
      }
    }));

    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: PAGE_SCREENSHOT,
      requestId: "cli-screenshot-current",
      payload: {
        source: "popup_wake",
        targetTabId: 42,
        format: "png",
        pageScreenshot: {
          type: "skfiy.page.screenshot_result",
          requestId: "cli-screenshot-current",
          tabId: 42,
          targetTabId: 42,
          host: "127.0.0.1:63852",
          format: "png",
          hasDataUrl: true,
          dataUrlBytes: screenshotDataUrl.length
        }
      }
    });
    expect(mock.postedMessages[0].payload.pageScreenshot.dataUrl).toBeUndefined();

    expect(mock.postedMessages.slice(1).map((message) => message.requestId)).toEqual([
      "cli-click-current",
      "cli-fill-current",
      "cli-submit-current",
      "cli-scroll-current"
    ]);
    expect(mock.postedMessages.slice(1).map((message) => message.payload.pageActionResult)).toEqual([
      expect.objectContaining({
        requestId: "cli-click-current",
        result: "passed",
        action: "click",
        targetTabId: 42,
        selector: "#submit"
      }),
      expect.objectContaining({
        requestId: "cli-fill-current",
        result: "passed",
        action: "fill",
        targetTabId: 42,
        selector: "#name"
      }),
      expect.objectContaining({
        requestId: "cli-submit-current",
        result: "passed",
        action: "submit",
        targetTabId: 42,
        selector: "form"
      }),
      expect.objectContaining({
        requestId: "cli-scroll-current",
        result: "passed",
        action: "scroll",
        targetTabId: 42,
        deltaY: 600
      })
    ]);
    expect(mock.postedMessages[2].payload.pageActionResult.value).toBeUndefined();
    expect(mock.postedMessages[2].payload.pageActionResult.text).toBeUndefined();
  });

  it("records current request blockers when submit and scroll wake actions return no page response", async () => {
    const mock = createChromeMock([
      createPageObserveResponse(),
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*"]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const wakeUrls = [
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=submit-no-response&skfiyTargetTabId=42&skfiyWakeAction=submit&skfiyRequestId=page-control-submit-cli-1&skfiySelector=form",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=scroll-no-response&skfiyTargetTabId=42&skfiyWakeAction=scroll&skfiyRequestId=page-control-scroll-cli-2&skfiyDy=600"
    ];

    for (const [index, url] of wakeUrls.entries()) {
      dispatchWakeTabUpdated(mock, url);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await waitForAssertion(() => {
        expect(mock.postedMessages).toHaveLength(index + 1);
      });
    }

    expect(mock.postedMessages[0]).toMatchObject({
      type: PAGE_ACTION,
      requestId: "page-control-submit-cli-1",
      payload: {
        pageActionResult: {
          type: "skfiy.page.action_result",
          requestId: "page-control-submit-cli-1",
          result: "blocked",
          reason: "page_action_no_response",
          action: "submit",
          targetTabId: 42,
          selector: "form"
        }
      }
    });
    expect(mock.postedMessages[1]).toMatchObject({
      type: PAGE_ACTION,
      requestId: "page-control-scroll-cli-2",
      payload: {
        pageActionResult: {
          type: "skfiy.page.action_result",
          requestId: "page-control-scroll-cli-2",
          result: "blocked",
          reason: "page_action_no_response",
          action: "scroll",
          targetTabId: 42,
          deltaY: 600
        }
      }
    });
  });

  it("schedules popup-delegated page action wake directives through background dedupe", async () => {
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*", "<all_urls>"],
      pageActionResults: [
        { result: "passed", action: "fill" }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: PAGE_CONTROL_WAKE,
      schemaVersion: 1,
      requestId: "page-control-fill-cli-1",
      directive: {
        wakeId: "popup-fill",
        requestId: "page-control-fill-cli-1",
        targetTabId: 42,
        wakeAction: "fill",
        selector: "#name",
        text: "skfiy",
        dy: 0
      }
    });

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: PAGE_CONTROL_WAKE,
        result: "executed",
        requestId: "page-control-fill-cli-1"
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({
      type: PAGE_ACTION,
      requestId: "page-control-fill-cli-1",
      payload: {
        action: {
          kind: "fill",
          selector: "#name",
          value: "skfiy"
        }
      }
    }));
    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      type: PAGE_ACTION,
      requestId: "page-control-fill-cli-1",
      payload: {
        pageActionResult: {
          requestId: "page-control-fill-cli-1",
          result: "passed",
          action: "fill",
          targetTabId: 42,
          selector: "#name"
        }
      }
    });

    sendRuntimeMessage(mock, {
      type: PAGE_CONTROL_WAKE,
      schemaVersion: 1,
      requestId: "page-control-fill-cli-1",
      directive: {
        wakeId: "popup-fill",
        requestId: "page-control-fill-cli-1",
        targetTabId: 42,
        wakeAction: "fill",
        selector: "#name",
        text: "skfiy",
        dy: 0
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
  });

  it("does not let scheduled wake dedupe suppress an immediate popup delegated action", async () => {
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*"],
      pageActionResults: [
        { result: "passed", action: "fill" }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const wakeUrl = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=popup-fill-race&skfiyTargetTabId=42&skfiyWakeAction=fill&skfiyRequestId=page-control-fill-cli-race&skfiySelector=%23name&skfiyText=skfiy";
    dispatchWakeTabUpdated(mock, wakeUrl);

    const { sendResponse } = sendRuntimeMessage(mock, {
      type: PAGE_CONTROL_WAKE,
      schemaVersion: 1,
      requestId: "page-control-fill-cli-race",
      directive: {
        wakeId: "popup-fill-race",
        requestId: "page-control-fill-cli-race",
        targetTabId: 42,
        wakeAction: "fill",
        selector: "#name",
        text: "skfiy",
        dy: 0
      }
    });

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: PAGE_CONTROL_WAKE,
        result: "executed",
        requestId: "page-control-fill-cli-race"
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      type: PAGE_ACTION,
      requestId: "page-control-fill-cli-race",
      payload: {
        pageActionResult: {
          requestId: "page-control-fill-cli-race",
          result: "passed",
          action: "fill",
          targetTabId: 42,
          selector: "#name"
        }
      }
    });
  });

  it("executes popup-delegated page action wake before responding to the popup", async () => {
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*"],
      pageActionResults: [
        { result: "passed", action: "click" }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const sendResponse = vi.fn(() => {
      expect(mock.postedMessages).toHaveLength(1);
      expect(mock.postedMessages[0]).toMatchObject({
        type: PAGE_ACTION,
        requestId: "page-control-click-cli-1",
        payload: {
          pageActionResult: {
            action: "click",
            requestId: "page-control-click-cli-1"
          }
        }
      });
    });
    sendRuntimeMessage(mock, {
      type: PAGE_CONTROL_WAKE,
      schemaVersion: 1,
      requestId: "page-control-click-cli-1",
      directive: {
        wakeId: "popup-click",
        requestId: "page-control-click-cli-1",
        targetTabId: 42,
        wakeAction: "click",
        selector: "#click-only",
        text: "",
        dy: 0
      }
    }, {}, sendResponse);

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: PAGE_CONTROL_WAKE,
        result: "executed"
      }));
    });
  });

  it("deduplicates repeated tab update events for the same action wake URL", async () => {
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*"],
      pageActionResults: [
        { result: "passed", action: "fill" }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const url = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=dedupe-1&skfiyTargetTabId=42&skfiyWakeAction=fill&skfiySelector=%23name&skfiyText=skfiy";
    dispatchWakeTabUpdated(mock, url, { changeInfo: { url } });
    dispatchWakeTabUpdated(mock, url);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      type: PAGE_ACTION,
      payload: {
        pageActionResult: {
          action: "fill",
          targetTabId: 42,
          selector: "#name"
        }
      }
    });
  });

  it("ignores stale timestamped action wake URLs when old extension tabs are still open", async () => {
    const now = Date.now();
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*"],
      pageActionResults: [
        { result: "passed", action: "fill" }
      ]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    const staleUrl = `chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=${now - 600_000}&skfiyTargetTabId=42&skfiyWakeAction=click&skfiyRequestId=page-control-click-cli-stale&skfiySelector=%23click-only`;
    const currentUrl = `chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=${now}&skfiyTargetTabId=42&skfiyWakeAction=fill&skfiyRequestId=page-control-fill-cli-current&skfiySelector=%23name&skfiyText=skfiy`;

    dispatchWakeTabUpdated(mock, staleUrl);
    dispatchWakeTabUpdated(mock, currentUrl, { tabId: 100 });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
    expect(mock.postedMessages[0]).toMatchObject({
      type: PAGE_ACTION,
      requestId: "page-control-fill-cli-current",
      payload: {
        pageActionResult: {
          requestId: "page-control-fill-cli-current",
          action: "fill",
          targetTabId: 42,
          selector: "#name"
        }
      }
    });
  });

  it("records a bounded screenshot blocker when Chrome captureVisibleTab fails", async () => {
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*", "<all_urls>"],
      captureVisibleTabError: "The active tab cannot be captured"
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=screenshot"
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    await waitForAssertion(() => {
      expect(mock.postedMessages).toHaveLength(1);
      expect(mock.postedMessages[0]).toMatchObject({
        schemaVersion: 1,
        type: PAGE_SCREENSHOT,
        payload: {
          source: "popup_wake",
          targetTabId: 42,
          pageScreenshot: {
            type: "skfiy.page.screenshot_result",
            result: "blocked",
            targetTabId: 42,
            reason: "The active tab cannot be captured",
            hasDataUrl: false
          }
        }
      });
    });
  });

  it("does not call captureVisibleTab when the background wake lacks all-urls capture permission", async () => {
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: ["http://127.0.0.1/*"]
    });
    mock.storage[HOST_POLICY_STORAGE_KEY] = {
      defaultMode: "ask",
      allowedHosts: ["127.0.0.1:63852"],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    };
    mock.chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 42) {
        return {
          id: 42,
          windowId: 7,
          url: "http://127.0.0.1:63852/"
        };
      }
      return undefined;
    });
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=screenshot&skfiyRequestId=missing-capture-permission"
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    await waitForAssertion(() => {
      expect(mock.postedMessages).toHaveLength(1);
      expect(mock.postedMessages[0]).toMatchObject({
        schemaVersion: 1,
        type: PAGE_SCREENSHOT,
        requestId: "missing-capture-permission",
        payload: {
          source: "popup_wake",
          targetTabId: 42,
          pageScreenshot: {
            type: "skfiy.page.screenshot_result",
            requestId: "missing-capture-permission",
            result: "blocked",
            targetTabId: 42,
            reason: "Chrome visible-tab capture requires <all_urls> permission or an activeTab user gesture.",
            hasDataUrl: false
          }
        }
      });
    });
    expect(mock.chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ["<all_urls>"]
    });
    expect(mock.chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it("lets the popup trigger a manual native host policy refresh", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["manual.example"], blockedHosts: [] })
    ]);
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: HOST_POLICY_SYNC_REFRESH,
      requestId: "popup-refresh"
    });

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
      createPolicyResponse({ allowedHosts: ["heartbeat.example"], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ]);
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: NATIVE_HEARTBEAT,
      requestId: "popup-heartbeat"
    });

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
        pageControlHeartbeat: expect.objectContaining({
          state: "recorded",
          result: "accepted"
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

    expect(mock.postedMessages).toHaveLength(2);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.postedMessages[0].requestId).toMatch(/^host-policy-sync-popup_heartbeat-/);
    expect(mock.postedMessages[1]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        source: "page_control_health",
        pageControl: expect.objectContaining({
          state: "unavailable"
        })
      })
    });
  });

  it("injects the content script before page-control heartbeat when a granted page has no receiver yet", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["127.0.0.1:63852"], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ], {
      activeTab: {
        id: 42,
        windowId: 7,
        url: "http://127.0.0.1:63852/"
      },
      grantedOrigins: ["http://127.0.0.1/*", "<all_urls>"],
      contentScriptSessions: [
        undefined,
        {
          state: "loaded",
          host: "127.0.0.1:63852",
          pageControl: {
            state: "ready",
            capabilities: {
              observe: true,
              domActions: true,
              click: true,
              fill: true,
              submit: true,
              scroll: true
            },
            counts: {
              interactiveElements: 3,
              forms: 1
            }
          }
        }
      ]
    });
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: NATIVE_HEARTBEAT,
      requestId: "popup-heartbeat-target",
      tabId: 42
    });

    expect(keepChannelOpen).toBe(true);
    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        pageControl: expect.objectContaining({
          state: "ready",
          capable: true,
          activeTab: expect.objectContaining({
            tabId: 42,
            host: "127.0.0.1:63852"
          }),
          chromeHostPermission: expect.objectContaining({
            state: "granted"
          }),
          contentScript: expect.objectContaining({
            state: "loaded"
          }),
          capabilities: expect.objectContaining({
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            submit: true,
            scroll: true,
            screenshot: true
          })
        })
      }));
    });

    expect(mock.chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content-script.js"]
    });
    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(mock.postedMessages[1]).toMatchObject({
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        pageControl: expect.objectContaining({
          state: "ready",
          activeTab: expect.objectContaining({
            tabId: 42
          })
        })
      })
    });
  });

  it("schedules an extension reload after recording a diagnostic heartbeat", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: ["reload.example"], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ]);
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: DEV_RELOAD_REQUEST,
      requestId: "popup-dev-reload"
    });

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
        pageControlHeartbeat: expect.objectContaining({
          state: "recorded",
          result: "accepted"
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

    expect(mock.postedMessages).toHaveLength(2);
    expect(mock.postedMessages[0]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.host_policy.request"
    });
    expect(mock.postedMessages[1]).toMatchObject({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      payload: expect.objectContaining({
        source: "page_control_health",
        pageControl: expect.objectContaining({
          state: "unavailable"
        })
      })
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
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendRuntimeMessage(mock, {
      type: "skfiy.native.message",
      requestId: "outer-request",
      payload: {
        schemaVersion: 1,
        type: "skfiy.page.observe",
        requestId: "observe-native"
      }
    });

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
    const { background } = await loadBackground(mock);

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
    const { background } = await loadBackground(mock);

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
