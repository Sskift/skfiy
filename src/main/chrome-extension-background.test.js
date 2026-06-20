import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const HOST_POLICY_STORAGE_KEY = "skfiyHostPolicy";
const HOST_POLICY_SYNC_STORAGE_KEY = "skfiyHostPolicySync";
const HOST_POLICY_SYNC_STATUS = "skfiy.host_policy.sync_status";
const HOST_POLICY_SYNC_REFRESH = "skfiy.host_policy.sync_refresh";

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

function createChromeMock(nativeResponses = []) {
  const storage = {};
  const postedMessages = [];
  const ports = [];
  const runtime = {
    lastError: undefined,
    onMessage: createEvent(),
    onInstalled: createEvent(),
    onStartup: createEvent(),
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
      tabs: {
        query: vi.fn(),
        get: vi.fn(),
        sendMessage: vi.fn(),
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

async function importBackground() {
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
          entryCount: 3,
          error: null
        })
      });
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
          entryCount: 2,
          error: null
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
      hostPolicyState: "configured",
      entryCount: 1
    });
    expect(mock.storage[HOST_POLICY_SYNC_STORAGE_KEY].error).toBeUndefined();
  });
});
