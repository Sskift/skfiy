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
const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const EXTENSION_POPUP_URL = `${EXTENSION_ORIGIN}/popup.html`;
const LOCALHOST_TEST_HOST = "127.0.0.1:63852";
const LOCALHOST_TEST_URL = `http://${LOCALHOST_TEST_HOST}/`;
const LOCALHOST_ORIGIN_PERMISSION = "http://127.0.0.1/*";
const LOCALHOST_PAGE_ACCESS = [LOCALHOST_ORIGIN_PERMISSION];
const LOCALHOST_CAPTURE_ACCESS = [LOCALHOST_ORIGIN_PERMISSION, "<all_urls>"];

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

function createNativeResponse(messageType, requestId, overrides = {}) {
  return {
    schemaVersion: 1,
    type: "skfiy.native.response",
    requestId,
    result: "accepted",
    bridgeState: "connected",
    launchOrigin: `${EXTENSION_ORIGIN}/`,
    messageType,
    ...overrides
  };
}

function createWakeUrl(options = {}) {
  const { wake = "1", targetTabId, wakeAction, requestId, selector, text, dy } = options;
  const url = new URL(EXTENSION_POPUP_URL);
  for (const [key, value] of Object.entries({
    skfiyWake: wake,
    skfiyTargetTabId: targetTabId,
    skfiyWakeAction: wakeAction,
    skfiyRequestId: requestId,
    skfiySelector: selector,
    skfiyText: text,
    skfiyDy: dy
  })) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function createPolicyResponse(policy = {}) {
  return {
    ...createNativeResponse("skfiy.host_policy.request", "policy-sync-response"),
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
  return createNativeResponse(PAGE_OBSERVE, "page-control-heartbeat-response");
}

function createPageObserveResponses(count = 1) {
  return Array.from({ length: count }, () => createPageObserveResponse());
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
    id: EXTENSION_ID,
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

function sendPageControlWake(mock, directive, { requestId = directive.requestId, sender = {}, sendResponse } = {}) {
  return sendRuntimeMessage(mock, {
    type: PAGE_CONTROL_WAKE,
    schemaVersion: 1,
    requestId,
    directive
  }, sender, sendResponse);
}

function createFillWakeDirective(overrides = {}) {
  return {
    wakeId: "popup-fill",
    requestId: "page-control-fill-cli-1",
    targetTabId: 42,
    wakeAction: "fill",
    selector: "#name",
    text: "skfiy",
    dy: 0,
    ...overrides
  };
}

function createFillWakeUrl(overrides = {}) {
  return createWakeUrl({
    targetTabId: 42,
    wakeAction: "fill",
    selector: "#name",
    text: "skfiy",
    ...overrides
  });
}

function createReadyLocalhostContentScriptSession(overrides = {}) {
  const { pageControl = {}, ...sessionOverrides } = overrides;
  const { capabilities = {}, ...pageControlOverrides } = pageControl;
  return {
    state: "loaded",
    host: LOCALHOST_TEST_HOST,
    ...sessionOverrides,
    pageControl: {
      state: "ready",
      ...pageControlOverrides,
      capabilities: {
        observe: true,
        domActions: true,
        click: true,
        fill: true,
        submit: true,
        scroll: true,
        ...capabilities
      }
    }
  };
}

function compactExpectedFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
}

function createExpectedPageActionResult(fields) {
  return expect.objectContaining(compactExpectedFields(fields));
}

function expectPostedPageActionResult(message, fields) {
  expect(message).toMatchObject({
    type: PAGE_ACTION,
    ...(fields.requestId === undefined ? {} : { requestId: fields.requestId }),
    payload: {
      pageActionResult: createExpectedPageActionResult(fields)
    }
  });
}

function expectPostedFillActionResult(message, requestId) {
  expectPostedPageActionResult(message, {
    requestId,
    result: "passed",
    action: "fill",
    targetTabId: 42,
    selector: "#name"
  });
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

function storeHostPolicy(mock, policy = {}) {
  mock.storage[HOST_POLICY_STORAGE_KEY] = {
    defaultMode: "ask",
    allowedHosts: [],
    currentTurnAllowedHosts: [],
    blockedHosts: [],
    ...policy
  };

  return mock.storage[HOST_POLICY_STORAGE_KEY];
}

function storeLocalhostHostPolicy(mock) {
  return storeHostPolicy(mock, {
    allowedHosts: [LOCALHOST_TEST_HOST]
  });
}

function mockTabsGet(mock, tabsById, fallback) {
  mock.chrome.tabs.get.mockImplementation(async (tabId) => {
    if (Object.hasOwn(tabsById, tabId)) {
      return tabsById[tabId];
    }
    return typeof fallback === "function" ? fallback(tabId) : fallback;
  });
}

function mockLocalhostTargetTab(mock, { tabId = 42, windowId = 7 } = {}) {
  const targetTab = {
    id: tabId,
    windowId,
    url: LOCALHOST_TEST_URL
  };
  mockTabsGet(mock, { [tabId]: targetTab });

  return targetTab;
}

async function loadLocalhostWakeBackground(nativeResponses = createPageObserveResponses(), options = {}) {
  const mock = createChromeMock(nativeResponses, options);
  storeLocalhostHostPolicy(mock);
  mockLocalhostTargetTab(mock);
  await loadBackground(mock);

  return mock;
}

async function loadLocalhostPageControlWakeBackground(options = {}) {
  const { responseCount = 1, ...mockOptions } = options;
  return loadLocalhostWakeBackground(createPageObserveResponses(responseCount), {
    grantedOrigins: LOCALHOST_PAGE_ACCESS,
    ...mockOptions
  });
}

async function loadLocalhostFillWakeBackground(options = {}) {
  return loadLocalhostPageControlWakeBackground({
    ...options,
    pageActionResults: [
      { result: "passed", action: "fill" }
    ]
  });
}

function mockWakeAndLocalhostTargetTabs(mock, wakeUrl, { wakeTabId = 99, targetTabId = 42 } = {}) {
  mockTabsGet(mock, {
    [wakeTabId]: {
      id: wakeTabId,
      windowId: 7,
      url: wakeUrl
    },
    [targetTabId]: {
      id: targetTabId,
      windowId: 7,
      url: LOCALHOST_TEST_URL
    }
  });
}

function createTabsDiscoveryResponse(requestId = "tabs-discover-response") {
  return createNativeResponse(TABS_DISCOVER, requestId);
}

function createTabsWakeTab(options = {}) {
  const { id = 99, windowId = 7, active = true, wake = "tabs", requestId } = options;
  return {
    id,
    windowId,
    active,
    url: createWakeUrl({ wake, wakeAction: "tabs", requestId })
  };
}

function createHttpsTab({ id, host, title, windowId = 7 }) {
  return {
    id,
    windowId,
    title,
    url: `https://${host}/dashboard`
  };
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

async function waitForPostedTabsDiscovery(mock, tabMatchers, options = {}) {
  await waitForAssertion(() => {
    const discoveryMessage = mock.postedMessages.find((message) => message.type === TABS_DISCOVER);
    if (options.requestId) {
      expect(discoveryMessage?.requestId).toBe(options.requestId);
    }
    expect(discoveryMessage).toMatchObject({
      schemaVersion: 1,
      type: TABS_DISCOVER,
      payload: expect.objectContaining({
        pageTabs: expect.objectContaining({
          tabs: expect.arrayContaining(tabMatchers)
        })
      })
    });
  });
}

async function waitForWakeProcessing(delayMs = 200) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function dispatchWakeUrlAndWait(mock, url, options) {
  dispatchWakeTabUpdated(mock, url, options);
  await waitForWakeProcessing();
}

async function dispatchWakeUrlsAndWaitForPostedMessages(mock, wakeUrls) {
  for (const [index, url] of wakeUrls.entries()) {
    await dispatchWakeUrlAndWait(mock, url);
    await waitForAssertion(() => {
      expect(mock.postedMessages).toHaveLength(index + 1);
    });
  }
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
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
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
      createNativeResponse(PAGE_ACTION, "page-control-fill-cli-current")
    ], {
      activeTab: {
        id: 42,
        windowId: 7,
        url: "https://allowed.example/dashboard"
      }
    });
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
    await loadBackground(mock);

    const { keepChannelOpen, sendResponse } = sendPageControlWake(mock, {
      wakeId: "wake-fill-current",
      requestId: "page-control-fill-cli-current",
      targetTabId: 42,
      wakeAction: "fill",
      selector: "#name",
      text: "skfiy"
    }, { requestId: "wake-fill-current" });

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
          url: createWakeUrl()
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
    storeHostPolicy(mock, {
      allowedHosts: ["allowed.example", "missing-permission.example", "content-missing.example"],
      blockedHosts: ["blocked.example"]
    });
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
    storeHostPolicy(mock, {
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: ["turn.example"],
      blockedHosts: ["blocked.example"]
    });
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
            id: EXTENSION_ID,
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
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
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
    const popupTab = {
      id: 99,
      windowId: 7,
      url: `${EXTENSION_POPUP_URL}?skfiyTargetTabId=42`
    };
    const mock = createChromeMock([], {
      activeTab: popupTab
    });
    mockTabsGet(mock, {
      42: {
        id: 42,
        windowId: 7,
        url: "https://target.example/dashboard"
      }
    }, popupTab);
    storeHostPolicy(mock, { allowedHosts: ["target.example"] });
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
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
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
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
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
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
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
    storeHostPolicy(mock, { allowedHosts: ["allowed.example"] });
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
      nativeLaunchOrigin: `${EXTENSION_ORIGIN}/`,
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
      createTabsDiscoveryResponse(),
      createPolicyResponse({ allowedHosts: ["loaded.example"] }),
      createPageObserveResponse()
    ], {
      allTabs: [
        createTabsWakeTab({ wake: "late-tabs" }),
        createHttpsTab({ id: 41, title: "Loaded app", host: "loaded.example" })
      ]
    });
    await loadBackground(mock, { autoHeartbeat: true });
    await waitForWakeProcessing();

    await waitForPostedTabsDiscovery(mock, [
      expect.objectContaining({ id: 99, blocker: "chrome_extension_page" }),
      expect.objectContaining({ id: 41, host: "loaded.example" })
    ]);
  });

  it("records tab discovery blocker evidence when Chrome tab query fails", async () => {
    const mock = createChromeMock([
      createNativeResponse(TABS_DISCOVER, "tabs-discover-response")
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

  it("runs and closes tab-discovery wake tabs from created events without delayed timers", async () => {
    const wakeUrl = createWakeUrl({ wake: "created-tabs", wakeAction: "tabs", requestId: "tabs-discover-created" });
    const mock = createChromeMock([
      createTabsDiscoveryResponse("tabs-discover-created")
    ], {
      allTabs: [
        createTabsWakeTab({ wake: "created-tabs", requestId: "tabs-discover-created" }),
        createHttpsTab({ id: 41, title: "Created wake app", host: "created.example" })
      ]
    });
    await loadBackground(mock);

    dispatchWakeTabCreated(
      mock,
      wakeUrl
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    await waitForPostedTabsDiscovery(mock, [
      expect.objectContaining({ id: 41, host: "created.example" })
    ], { requestId: "tabs-discover-created" });
    expect(mock.chrome.tabs.remove).toHaveBeenCalledWith(99);
  });

  it("times out stalled content diagnostics during tab discovery", async () => {
    vi.useFakeTimers();
    try {
      const mock = createChromeMock([
        createNativeResponse(TABS_DISCOVER, "tabs-discover-stalled-diagnostics")
      ], {
        grantedOrigins: LOCALHOST_PAGE_ACCESS,
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
      storeHostPolicy(mock, {
        schemaVersion: 1,
        allowedHosts: ["127.0.0.1:60329", "127.0.0.1:63852"],
      });
      await loadBackground(mock);

      sendRuntimeMessage(mock, {
        type: TABS_DISCOVER,
        schemaVersion: 1,
        requestId: "tabs-discover-stalled-diagnostics"
      });

      await vi.advanceTimersByTimeAsync(1_000);

      await waitForPostedTabsDiscovery(mock, [
        expect.objectContaining({
          id: 41,
          state: "blocked",
          blocker: "content_script_diagnostics_timeout"
        }),
        expect.objectContaining({
          id: 42,
          state: "eligible"
        })
      ], { requestId: "tabs-discover-stalled-diagnostics" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers tab discovery when an extension wake update omits the query string", async () => {
    const mock = createChromeMock([
      createTabsDiscoveryResponse()
    ], {
      allTabs: [
        createTabsWakeTab({ wake: "recovered-tabs" }),
        createHttpsTab({ id: 41, title: "Recovered app", host: "recovered.example" })
      ]
    });
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      EXTENSION_POPUP_URL,
      { active: true }
    );
    await new Promise((resolve) => setTimeout(resolve, 450));

    await waitForPostedTabsDiscovery(mock, [
      expect.objectContaining({ id: 99, blocker: "chrome_extension_page" }),
      expect.objectContaining({ id: 41, host: "recovered.example" })
    ]);
  });

  it("refreshes page-control heartbeat when the active tab finishes loading", async () => {
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: [LOCALHOST_TEST_HOST], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ], {
      activeTab: {
        id: 42,
        windowId: 7,
        url: LOCALHOST_TEST_URL
      }
    });
    await loadBackground(mock);

    dispatchTabUpdated(mock, 42, { status: "complete" });
    await waitForWakeProcessing();

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
          })
        })
      })
    });
  });

  it("routes extension wake tab heartbeats to the requested target tab", async () => {
    const wakeUrl = createWakeUrl({ targetTabId: 42 });
    const mock = createChromeMock([
      createPolicyResponse({ allowedHosts: [LOCALHOST_TEST_HOST], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ], {
      grantedOrigins: LOCALHOST_CAPTURE_ACCESS,
      contentScriptSession: createReadyLocalhostContentScriptSession()
    });
    mockWakeAndLocalhostTargetTabs(
      mock,
      wakeUrl
    );
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      wakeUrl
    );

    await waitForWakeProcessing();

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
    const wakeUrl = createWakeUrl({ targetTabId: 42, wakeAction: "observe" });
    const pageObserveSnapshot = {
      schemaVersion: 1,
      title: "skfiy observe smoke",
      url: LOCALHOST_TEST_URL,
      visibleText: "skfiy observe live smoke 2026-06-21 compiled binary path"
    };
    const mock = createChromeMock([
      createPageObserveResponse()
    ], {
      grantedOrigins: LOCALHOST_CAPTURE_ACCESS,
      pageObserveSnapshot
    });
    storeLocalhostHostPolicy(mock);
    mockWakeAndLocalhostTargetTabs(
      mock,
      wakeUrl
    );
    await loadBackground(mock);

    dispatchWakeTabUpdated(
      mock,
      wakeUrl
    );

    await waitForWakeProcessing();

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
    const mock = await loadLocalhostPageControlWakeBackground({
      responseCount: 5,
      grantedOrigins: LOCALHOST_CAPTURE_ACCESS,
      captureVisibleTabDataUrl: screenshotDataUrl,
      pageActionResults: [
        { result: "passed", action: "click" },
        { result: "passed", action: "fill" },
        { result: "passed", action: "submit" },
        { result: "passed", action: "scroll" }
      ]
    });

    const wakeUrls = [
      createWakeUrl({ targetTabId: 42, wakeAction: "screenshot", requestId: "cli-screenshot-current" }),
      createWakeUrl({ targetTabId: 42, wakeAction: "click", selector: "#submit", requestId: "cli-click-current" }),
      createFillWakeUrl({ requestId: "cli-fill-current" }),
      createWakeUrl({ targetTabId: 42, wakeAction: "submit", selector: "form", requestId: "cli-submit-current" }),
      createWakeUrl({ targetTabId: 42, wakeAction: "scroll", dy: 600, requestId: "cli-scroll-current" })
    ];

    await dispatchWakeUrlsAndWaitForPostedMessages(mock, wakeUrls);

    expect(mock.chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(7, {
      format: "png"
    });
    expect(mock.chrome.tabs.update).toHaveBeenCalledWith(42, {
      active: true
    });
    expect(mock.chrome.tabs.sendMessage.mock.calls.map(([tabId, message]) => ({
      tabId,
      type: message.type,
      action: message.payload?.action
    }))).toEqual([
      { tabId: 42, type: PAGE_ACTION, action: { kind: "click", selector: "#submit" } },
      { tabId: 42, type: PAGE_ACTION, action: { kind: "fill", selector: "#name", value: "skfiy" } },
      { tabId: 42, type: PAGE_ACTION, action: { kind: "submit", selector: "form", confirmed: true } },
      { tabId: 42, type: PAGE_ACTION, action: { kind: "scroll", deltaY: 600 } }
    ]);

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
      createExpectedPageActionResult({
        requestId: "cli-click-current",
        result: "passed",
        action: "click",
        targetTabId: 42,
        selector: "#submit"
      }),
      createExpectedPageActionResult({
        requestId: "cli-fill-current",
        result: "passed",
        action: "fill",
        targetTabId: 42,
        selector: "#name"
      }),
      createExpectedPageActionResult({
        requestId: "cli-submit-current",
        result: "passed",
        action: "submit",
        targetTabId: 42,
        selector: "form"
      }),
      createExpectedPageActionResult({
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
    const mock = await loadLocalhostPageControlWakeBackground({
      responseCount: 2
    });

    const wakeUrls = [
      createWakeUrl({ wake: "submit-no-response", targetTabId: 42, wakeAction: "submit", requestId: "page-control-submit-cli-1", selector: "form" }),
      createWakeUrl({ wake: "scroll-no-response", targetTabId: 42, wakeAction: "scroll", requestId: "page-control-scroll-cli-2", dy: 600 })
    ];

    await dispatchWakeUrlsAndWaitForPostedMessages(mock, wakeUrls);

    expectPostedPageActionResult(mock.postedMessages[0], {
      requestId: "page-control-submit-cli-1",
      type: "skfiy.page.action_result",
      result: "blocked",
      reason: "page_action_no_response",
      action: "submit",
      targetTabId: 42,
      selector: "form"
    });
    expectPostedPageActionResult(mock.postedMessages[1], {
      requestId: "page-control-scroll-cli-2",
      type: "skfiy.page.action_result",
      result: "blocked",
      reason: "page_action_no_response",
      action: "scroll",
      targetTabId: 42,
      deltaY: 600
    });
  });

  it("schedules popup-delegated page action wake directives through background dedupe", async () => {
    const mock = await loadLocalhostFillWakeBackground({
      grantedOrigins: LOCALHOST_CAPTURE_ACCESS
    });

    const { sendResponse } = sendPageControlWake(mock, createFillWakeDirective());

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: PAGE_CONTROL_WAKE,
        result: "executed",
        requestId: "page-control-fill-cli-1"
      }));
    });
    await waitForWakeProcessing();

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
    expectPostedFillActionResult(mock.postedMessages[0], "page-control-fill-cli-1");

    sendPageControlWake(mock, createFillWakeDirective());
    await waitForWakeProcessing();

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
  });

  it("does not let scheduled wake dedupe suppress an immediate popup delegated action", async () => {
    const mock = await loadLocalhostFillWakeBackground();

    const wakeUrl = createFillWakeUrl({ wake: "popup-fill-race", requestId: "page-control-fill-cli-race" });
    dispatchWakeTabUpdated(mock, wakeUrl);

    const { sendResponse } = sendPageControlWake(mock, createFillWakeDirective({
      wakeId: "popup-fill-race",
      requestId: "page-control-fill-cli-race"
    }));

    await waitForAssertion(() => {
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
        type: PAGE_CONTROL_WAKE,
        result: "executed",
        requestId: "page-control-fill-cli-race"
      }));
    });
    await waitForWakeProcessing();

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
    expectPostedFillActionResult(mock.postedMessages[0], "page-control-fill-cli-race");
  });

  it("deduplicates repeated tab update events for the same action wake URL", async () => {
    const mock = await loadLocalhostFillWakeBackground();

    const url = createFillWakeUrl({ wake: "dedupe-1" });
    dispatchWakeTabUpdated(mock, url, { changeInfo: { url } });
    dispatchWakeTabUpdated(mock, url);
    await waitForWakeProcessing(250);

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
    expectPostedFillActionResult(mock.postedMessages[0]);
  });

  it("ignores stale timestamped action wake URLs when old extension tabs are still open", async () => {
    const now = Date.now();
    const mock = await loadLocalhostFillWakeBackground();

    const staleUrl = createWakeUrl({ wake: now - 600_000, targetTabId: 42, wakeAction: "click", requestId: "page-control-click-cli-stale", selector: "#click-only" });
    const currentUrl = createFillWakeUrl({ wake: now, requestId: "page-control-fill-cli-current" });

    dispatchWakeTabUpdated(mock, staleUrl);
    dispatchWakeTabUpdated(mock, currentUrl, { tabId: 100 });
    await waitForWakeProcessing(250);

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mock.postedMessages).toHaveLength(1);
    expectPostedPageActionResult(mock.postedMessages[0], {
      requestId: "page-control-fill-cli-current",
      action: "fill",
      targetTabId: 42,
      selector: "#name"
    });
  });

  it("records a bounded screenshot blocker when Chrome captureVisibleTab fails", async () => {
    const mock = await loadLocalhostPageControlWakeBackground({
      grantedOrigins: LOCALHOST_CAPTURE_ACCESS,
      captureVisibleTabError: "The active tab cannot be captured"
    });

    dispatchWakeTabUpdated(
      mock,
      createWakeUrl({ targetTabId: 42, wakeAction: "screenshot" })
    );
    await waitForWakeProcessing();

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
    const mock = await loadLocalhostPageControlWakeBackground();

    dispatchWakeTabUpdated(
      mock,
      createWakeUrl({ targetTabId: 42, wakeAction: "screenshot", requestId: "missing-capture-permission" })
    );
    await waitForWakeProcessing();

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
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
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
        })
      }));
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
          launchOrigin: `${EXTENSION_ORIGIN}/`,
          messageType: "skfiy.host_policy.request",
          responseType: "skfiy.native.response",
          responseResult: "accepted",
          lastError: null
        }),
        pageControlHeartbeat: expect.objectContaining({
          state: "recorded",
          result: "accepted"
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
      createPolicyResponse({ allowedHosts: [LOCALHOST_TEST_HOST], currentTurnAllowedHosts: [], blockedHosts: [] }),
      createPageObserveResponse()
    ], {
      activeTab: {
        id: 42,
        windowId: 7,
        url: LOCALHOST_TEST_URL
      },
      grantedOrigins: LOCALHOST_CAPTURE_ACCESS,
      contentScriptSessions: [
        undefined,
        createReadyLocalhostContentScriptSession({
          pageControl: {
            counts: {
              interactiveElements: 3,
              forms: 1
            }
          }
        })
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
      createNativeResponse(PAGE_OBSERVE, "observe-native"),
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
