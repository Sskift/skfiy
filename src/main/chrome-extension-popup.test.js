import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const extensionRoot = path.join(process.cwd(), "chrome-extension");
const HOST_POLICY_SYNC_STATUS = "skfiy.host_policy.sync_status";
const HOST_POLICY_SYNC_REFRESH = "skfiy.host_policy.sync_refresh";
const NATIVE_HEARTBEAT = "skfiy.native.heartbeat";
const DEV_RELOAD_REQUEST = "skfiy.dev.reload";
const PAGE_OBSERVE = "skfiy.page.observe";
const NATIVE_MESSAGE = "skfiy.native.message";

function readExtensionFile(relativePath) {
  return readFileSync(path.join(extensionRoot, relativePath), "utf8");
}

function readStorageSelection(storage, keys) {
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }

  if (typeof keys === "string") {
    return { [keys]: storage[keys] };
  }

  return { ...storage };
}

function installPopupDocument() {
  const html = readExtensionFile("popup.html").replace(
    '<script src="popup.js"></script>',
    ""
  );
  document.open();
  document.write(html);
  document.close();
}

function createPolicy(overrides = {}) {
  return {
    defaultMode: "ask",
    allowedHosts: [],
    currentTurnAllowedHosts: [],
    blockedHosts: [],
    ...overrides
  };
}

function createPopupChromeMock(options = {}) {
  const storage = {
    skfiyHostPolicy: options.policy ?? createPolicy(),
    lastSensitivePause: options.sensitivePause
  };
  const tab = options.tab ?? { id: 1, url: "https://example.com/page" };
  const sendMessage = vi.fn(async (message) => {
    if (typeof options.onSendMessage === "function") {
      return options.onSendMessage(message);
    }
    return options.snapshot;
  });
  const requestPermission = vi.fn(async () => options.permissionGranted ?? true);

  return {
    chrome: {
      runtime: {
        sendMessage
      },
      permissions: {
        request: requestPermission
      },
      storage: {
        local: {
          get: vi.fn(async (keys) => readStorageSelection(storage, keys))
        }
      },
      tabs: {
        query: vi.fn(async () => [tab])
      }
    },
    storage,
    sendMessage,
    requestPermission
  };
}

async function importPopup() {
  const popupUrl = pathToFileURL(path.join(extensionRoot, "popup.js"));
  popupUrl.search = `?test=${Date.now()}-${Math.random()}`;
  return import(popupUrl.href);
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
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("Chrome extension popup policy sync status", () => {
  it("renders the latest native host policy sync status", async () => {
    installPopupDocument();
    const policy = createPolicy({
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: ["turn.example"],
      blockedHosts: ["blocked.example"]
    });
    const mock = createPopupChromeMock({
      policy,
      snapshot: {
        type: "skfiy.host_policy.response",
        schemaVersion: 1,
        requestId: "popup-status",
        policy,
        syncStatus: {
          schemaVersion: 1,
          state: "synced",
          source: "native_host",
          updatedAt: "2026-06-20T10:00:00.000Z",
          entryCount: 3,
          hostPolicyState: "configured",
          nativeHostPolicyState: "configured",
          nativeBridgeState: "connected",
          nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          nativeMessageType: "skfiy.host_policy.request",
          lastError: null,
          error: null
        },
        diagnostics: {
          schemaVersion: 1,
          extension: {
            id: "abcdefghijklmnopabcdefghijklmnop",
            name: "skfiy Chrome Adapter",
            version: "0.0.1",
            manifestVersion: 3,
            minimumChromeVersion: "116"
          },
          capabilities: {
            activeTab: true,
            downloads: true,
            nativeMessaging: true,
            scripting: true,
            storage: true,
            tabs: true,
            optionalHostPermissions: ["http://*/*", "https://*/*"]
          },
          nativeHost: {
            name: "com.sskift.skfiy",
            connectionState: "connected",
            bridgeState: "connected",
            syncState: "synced",
            syncSource: "native_host",
            policyState: "configured",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            messageType: "skfiy.host_policy.request",
            responseType: "skfiy.native.response",
            responseResult: "accepted",
            lastError: null,
            updatedAt: "2026-06-20T10:00:00.000Z"
          },
          hostPolicy: {
            defaultMode: "ask",
            entryCount: 3,
            allowedHosts: 1,
            currentTurnAllowedHosts: 1,
            blockedHosts: 1
          },
          currentTab: {
            state: "available",
            tabId: 1,
            windowId: 1,
            host: "example.com",
            origin: "https://example.com",
            hostPolicy: {
              decision: "allowed",
              reason: "host_allowed"
            },
            chromeHostPermission: {
              state: "granted",
              origin: "https://example.com",
              host: "example.com",
              origins: ["https://example.com/*"]
            },
            contentScript: {
              state: "loaded",
              host: "example.com",
              title: "Example",
              sensitivePaused: false
            },
            pageControl: {
              state: "ready",
              capabilities: {
                screenshot: true,
                domActions: true,
                click: true,
                fill: true,
                scroll: true
              },
              reason: "Current page is ready for Computer Use controls."
            }
          },
          session: {
            state: "loaded",
            host: "example.com",
            contentScript: {
              state: "loaded",
              host: "example.com",
              title: "Example",
              sensitivePaused: false
            },
            pageControl: {
              state: "ready",
              capabilities: {
                screenshot: true,
                domActions: true,
                click: true,
                fill: true,
                scroll: true
              }
            }
          },
          lastError: null
        }
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(document.getElementById("connection-status").textContent).toBe("Synced with skfiy app");
      expect(document.getElementById("interaction-summary").textContent)
        .toBe("Ready to control this page.");
      expect(document.getElementById("connection-chip").textContent).toBe("Connected");
      expect(document.getElementById("page-control-chip").textContent).toBe("Ready");
      expect(document.getElementById("page-action-summary").textContent)
        .toBe("example.com can be observed and controlled through skfiy.");
      expect(document.getElementById("heartbeat-button").textContent).toBe("Observe current page");
      expect(document.getElementById("native-host").textContent).toBe("com.sskift.skfiy");
      expect(document.getElementById("native-bridge-state").textContent).toBe("Connected");
      expect(document.getElementById("native-launch-origin").textContent)
        .toBe("chrome-extension://abcdefghijklmnopabcdefghijklmnop/");
      expect(document.getElementById("extension-version").textContent).toBe("v0.0.1");
      expect(document.getElementById("extension-manifest-version").textContent).toBe("MV3");
      expect(document.getElementById("extension-capabilities").textContent).toContain("Native messaging");
      expect(document.getElementById("current-host").textContent).toBe("example.com");
      expect(document.getElementById("host-policy").textContent).toBe("Always allowed");
      expect(document.getElementById("host-policy-reason").textContent).toBe("Host allowed");
      expect(document.getElementById("chrome-host-permission").textContent).toBe("Granted for https://example.com/*");
      expect(document.getElementById("content-script-session").textContent).toBe("Loaded");
      expect(document.getElementById("page-control-readiness").textContent)
        .toBe("Ready (screenshot, DOM actions, click, fill, scroll)");
      expect(document.getElementById("native-host-policy-state").textContent).toBe("Configured");
      expect(document.getElementById("policy-sync-state").textContent).toBe("Synced");
      expect(document.getElementById("policy-sync-source").textContent).toBe("Native host");
      expect(document.getElementById("policy-sync-entry-count").textContent).toBe("3");
      expect(document.getElementById("policy-sync-updated-at").textContent).not.toBe("Never");
      expect(document.getElementById("policy-sync-error").hidden).toBe(true);
    });

    expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: HOST_POLICY_SYNC_STATUS,
      schemaVersion: 1
    }));
  });

  it("renders missing optional host permission status and wording", async () => {
    installPopupDocument();
    const policy = createPolicy({
      allowedHosts: ["example.com"]
    });
    const mock = createPopupChromeMock({
      policy,
      snapshot: {
        type: "skfiy.host_policy.response",
        schemaVersion: 1,
        requestId: "popup-status",
        policy,
        syncStatus: {
          schemaVersion: 1,
          state: "error",
          source: "native_host",
          updatedAt: "2026-06-20T10:03:00.000Z",
          entryCount: 1,
          hostPolicyState: "configured",
          nativeHostPolicyState: "configured",
          nativeBridgeState: "unavailable",
          nativeLaunchOrigin: null,
          nativeMessageType: "skfiy.host_policy.request",
          lastError: "Specified native messaging host not found.",
          error: "Specified native messaging host not found."
        },
        diagnostics: {
          schemaVersion: 1,
          extension: {
            version: "0.0.1",
            manifestVersion: 3
          },
          capabilities: {
            activeTab: true,
            nativeMessaging: true,
            scripting: true,
            storage: true,
            tabs: true,
            downloads: true
          },
          nativeHost: {
            name: "com.sskift.skfiy",
            connectionState: "unavailable",
            bridgeState: "unavailable",
            syncState: "error",
            syncSource: "native_host",
            policyState: "configured",
            launchOrigin: null,
            messageType: "skfiy.host_policy.request",
            lastError: "Specified native messaging host not found."
          },
          hostPolicy: {
            defaultMode: "ask",
            entryCount: 1,
            allowedHosts: 1,
            currentTurnAllowedHosts: 0,
            blockedHosts: 0
          },
          currentTab: {
            state: "available",
            host: "example.com",
            origin: "https://example.com",
            hostPolicy: {
              decision: "allowed",
              reason: "host_allowed"
            },
            chromeHostPermission: {
              state: "missing",
              reason: "chrome_host_permission_missing",
              code: "chrome_host_permission_missing",
              origin: "https://example.com",
              host: "example.com",
              origins: ["https://example.com/*"],
              message: "Missing optional Chrome host permission for https://example.com/*. Grant site access before page diagnostics or actions can run."
            },
            contentScript: {
              state: "blocked_by_chrome_host_permission",
              reason: "chrome_host_permission_missing",
              lastError: "Missing optional Chrome host permission for https://example.com/*. Grant site access before page diagnostics or actions can run."
            },
            pageControl: {
              state: "blocked_by_chrome_host_permission",
              capabilities: {
                screenshot: true,
                domActions: false
              },
              reason: "Missing optional Chrome host permission for https://example.com/*. Grant site access before page diagnostics or actions can run."
            }
          },
          session: {
            state: "blocked_by_chrome_host_permission",
            host: "example.com",
            contentScript: {
              state: "blocked_by_chrome_host_permission",
              reason: "chrome_host_permission_missing",
              lastError: "Missing optional Chrome host permission for https://example.com/*. Grant site access before page diagnostics or actions can run."
            },
            pageControl: {
              state: "blocked_by_chrome_host_permission"
            }
          },
          lastError: "Specified native messaging host not found."
        }
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(document.getElementById("connection-status").textContent).toBe("skfiy app unavailable");
      expect(document.getElementById("interaction-summary").textContent)
        .toBe("Grant site access to control this page.");
      expect(document.getElementById("connection-chip").textContent).toBe("Disconnected");
      expect(document.getElementById("page-control-chip").textContent).toBe("Needs access");
      expect(document.getElementById("page-action-summary").textContent)
        .toBe("Chrome needs permission for https://example.com/* before skfiy can observe or act.");
      expect(document.getElementById("native-bridge-state").textContent).toBe("Unavailable");
      expect(document.getElementById("native-launch-origin").textContent).toBe("Not observed");
      expect(document.getElementById("extension-manifest-version").textContent).toBe("MV3");
      expect(document.getElementById("host-policy").textContent).toBe("Always allowed");
      expect(document.getElementById("host-policy-reason").textContent).toBe("Host allowed");
      expect(document.getElementById("chrome-host-permission").textContent)
        .toBe("Missing optional Chrome host permission for https://example.com/*. Grant site access before page diagnostics or actions can run.");
      expect(document.getElementById("content-script-session").textContent)
        .toBe("Blocked by missing host permission");
      expect(document.getElementById("page-control-readiness").textContent)
        .toBe("Blocked by missing host permission");
      expect(document.getElementById("policy-sync-error").hidden).toBe(false);
      expect(document.getElementById("policy-sync-error").textContent)
        .toBe("Specified native messaging host not found.");
      expect(document.getElementById("grant-site-access-button").hidden).toBe(false);
      expect(document.getElementById("grant-site-access-button").textContent)
        .toBe("Grant https://example.com/*");
    });

    document.getElementById("grant-site-access-button").click();

    await waitForAssertion(() => {
      expect(mock.requestPermission).toHaveBeenCalledWith({
        origins: ["https://example.com/*"]
      });
      expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: HOST_POLICY_SYNC_REFRESH
      }));
    });
  });

  it("renders page safety and sensitive pause diagnostics from the session", async () => {
    installPopupDocument();
    const policy = createPolicy({
      allowedHosts: ["example.com"]
    });
    const mock = createPopupChromeMock({
      policy,
      snapshot: {
        type: "skfiy.host_policy.response",
        schemaVersion: 1,
        requestId: "popup-status",
        policy,
        syncStatus: {
          schemaVersion: 1,
          state: "synced",
          source: "native_host",
          updatedAt: "2026-06-20T10:04:00.000Z",
          entryCount: 1,
          hostPolicyState: "configured",
          nativeHostPolicyState: "configured",
          nativeBridgeState: "connected",
          nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          nativeMessageType: "skfiy.host_policy.request",
          lastError: null,
          error: null
        },
        diagnostics: {
          schemaVersion: 1,
          extension: {
            version: "0.0.1",
            manifestVersion: 3
          },
          capabilities: {
            activeTab: true,
            nativeMessaging: true,
            scripting: true,
            storage: true,
            tabs: true,
            downloads: true
          },
          nativeHost: {
            name: "com.sskift.skfiy",
            connectionState: "connected",
            bridgeState: "connected",
            syncState: "synced",
            syncSource: "native_host",
            policyState: "configured",
            launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
            lastError: null
          },
          currentTab: {
            state: "available",
            host: "example.com",
            origin: "https://example.com",
            hostPolicy: {
              decision: "allowed",
              reason: "host_allowed"
            },
            chromeHostPermission: {
              state: "granted",
              origin: "https://example.com",
              host: "example.com",
              origins: ["https://example.com/*"]
            },
            contentScript: {
              state: "loaded",
              host: "example.com",
              title: "Example"
            }
          },
          session: {
            state: "loaded",
            host: "example.com",
            pageSafety: {
              state: "sensitive",
              reason: "credential fields visible"
            },
            sensitivePaused: true,
            sensitivePauseReason: "credential fields visible",
            contentScript: {
              state: "loaded",
              host: "example.com",
              title: "Example"
            }
          },
          lastError: null
        }
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(document.getElementById("content-script-session").textContent)
        .toBe("Loaded, sensitive pause active");
      expect(document.getElementById("page-safety").textContent)
        .toBe("Sensitive: credential fields visible");
      expect(document.getElementById("sensitive-pause-status").textContent)
        .toBe("Active: credential fields visible");
      expect(document.getElementById("sensitive-pause").hidden).toBe(false);
      expect(document.getElementById("sensitive-pause").textContent)
        .toBe("Sensitive content pause: credential fields visible");
    });
  });

  it("lets the user manually refresh host policy from the popup", async () => {
    installPopupDocument();
    const initialPolicy = createPolicy();
    const refreshedPolicy = createPolicy({
      allowedHosts: ["example.com"]
    });
    const mock = createPopupChromeMock({
      policy: initialPolicy,
      onSendMessage: (message) => {
        if (message.type === HOST_POLICY_SYNC_REFRESH) {
          return {
            type: "skfiy.host_policy.response",
            schemaVersion: 1,
            requestId: "popup-refresh",
            policy: refreshedPolicy,
            syncStatus: {
              schemaVersion: 1,
              state: "synced",
              source: "native_host",
              updatedAt: "2026-06-20T10:02:00.000Z",
              entryCount: 1,
              hostPolicyState: "configured",
              nativeHostPolicyState: "configured",
              nativeBridgeState: "connected",
              nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
              nativeMessageType: "skfiy.host_policy.request",
              lastError: null,
              error: null
            },
            diagnostics: {
              schemaVersion: 1,
              extension: {
                version: "0.0.1"
              },
              capabilities: {
                nativeMessaging: true,
                scripting: true,
                tabs: true,
                downloads: true
              },
              nativeHost: {
                name: "com.sskift.skfiy",
                bridgeState: "connected",
                syncState: "synced",
                policyState: "configured",
                launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                lastError: null
              },
              hostPolicy: {
                defaultMode: "ask",
                entryCount: 1,
                allowedHosts: 1,
                currentTurnAllowedHosts: 0,
                blockedHosts: 0
              }
            }
          };
        }

        return {
          type: "skfiy.host_policy.response",
          schemaVersion: 1,
          requestId: "popup-status",
          policy: initialPolicy,
          syncStatus: {
            schemaVersion: 1,
            state: "unknown",
            source: "local_storage",
            updatedAt: null,
            entryCount: 0,
            hostPolicyState: null,
            nativeHostPolicyState: null,
            nativeBridgeState: "unknown",
            nativeLaunchOrigin: null,
            nativeMessageType: null,
            lastError: null,
            error: null
          },
          diagnostics: {
            schemaVersion: 1,
            extension: {
              version: "0.0.1"
            },
            capabilities: {
              nativeMessaging: true
            },
            nativeHost: {
              name: "com.sskift.skfiy",
              bridgeState: "unknown",
              syncState: "unknown",
              policyState: null,
              lastError: null
            },
            hostPolicy: {
              defaultMode: "ask",
              entryCount: 0,
              allowedHosts: 0,
              currentTurnAllowedHosts: 0,
              blockedHosts: 0
            }
          }
        };
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();
    await waitForAssertion(() => {
      expect(document.getElementById("policy-sync-state").textContent).toBe("Unknown");
    });

    document.getElementById("sync-policy-button").click();

    await waitForAssertion(() => {
      expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: HOST_POLICY_SYNC_REFRESH,
        schemaVersion: 1
      }));
      expect(document.getElementById("host-policy").textContent).toBe("Always allowed");
      expect(document.getElementById("native-host-policy-state").textContent).toBe("Configured");
      expect(document.getElementById("policy-sync-state").textContent).toBe("Synced");
      expect(document.getElementById("policy-sync-entry-count").textContent).toBe("1");
    });
  });

  it("lets the user trigger a native heartbeat from the popup", async () => {
    installPopupDocument();
    const policy = createPolicy();
    const mock = createPopupChromeMock({
      policy,
      onSendMessage: (message) => {
        if (message.type === NATIVE_HEARTBEAT) {
          return {
            type: "skfiy.native.heartbeat_result",
            schemaVersion: 1,
            requestId: "popup-heartbeat",
            policy,
            syncStatus: {
              schemaVersion: 1,
              state: "synced",
              source: "native_host",
              updatedAt: "2026-06-21T08:00:00.000Z",
              completedAt: "2026-06-21T08:00:00.000Z",
              entryCount: 0,
              nativeBridgeState: "connected",
              nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
              nativeMessageType: "skfiy.host_policy.request",
              nativeResponseType: "skfiy.native.response",
              nativeResponseResult: "accepted",
              lastError: null,
              error: null
            },
            diagnostics: {
              schemaVersion: 1,
              capabilities: {
                nativeMessaging: true
              },
              nativeHost: {
                name: "com.sskift.skfiy",
                connectionState: "connected",
                bridgeState: "connected",
                syncState: "synced",
                launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                lastError: null
              },
              devReload: {
                schemaVersion: 1,
                state: "idle",
                reloadAvailable: true,
                heartbeat: {
                  state: "connected",
                  completedAt: "2026-06-21T08:00:00.000Z",
                  launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                  messageType: "skfiy.host_policy.request",
                  responseResult: "accepted",
                  lastError: null
                }
              }
            }
          };
        }

        return {
          type: "skfiy.host_policy.response",
          schemaVersion: 1,
          requestId: "popup-status",
          policy,
          syncStatus: {
            schemaVersion: 1,
            state: "unknown",
            source: "local_storage",
            entryCount: 0
          },
          diagnostics: {
            schemaVersion: 1,
            capabilities: {
              nativeMessaging: true
            },
            nativeHost: {
              name: "com.sskift.skfiy",
              bridgeState: "unknown",
              syncState: "unknown",
              lastError: null
            },
            devReload: {
              state: "idle",
              reloadAvailable: true,
              heartbeat: {
                state: "unknown"
              }
            }
          }
        };
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();
    await waitForAssertion(() => {
      expect(document.getElementById("native-heartbeat").textContent).toBe("Not checked");
    });

    document.getElementById("heartbeat-button").click();

    await waitForAssertion(() => {
      expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: NATIVE_HEARTBEAT,
        schemaVersion: 1
      }));
      expect(document.getElementById("native-heartbeat").textContent).toContain("Connected");
      expect(document.getElementById("native-bridge-state").textContent).toBe("Connected");
      expect(document.getElementById("native-launch-origin").textContent)
        .toBe("chrome-extension://abcdefghijklmnopabcdefghijklmnop/");
    });
  });

  it("auto-checks native heartbeat on the reload wake page", async () => {
    window.history.replaceState({}, "", "/popup.html?skfiyWake=1");
    installPopupDocument();
    const policy = createPolicy();
    const mock = createPopupChromeMock({
      policy,
      onSendMessage: (message) => {
        if (message.type === NATIVE_HEARTBEAT) {
          return {
            type: "skfiy.native.heartbeat_result",
            schemaVersion: 1,
            requestId: "popup-wake-heartbeat",
            policy,
            syncStatus: {
              schemaVersion: 1,
              state: "synced",
              source: "native_host",
              updatedAt: "2026-06-21T08:00:00.000Z",
              completedAt: "2026-06-21T08:00:00.000Z",
              entryCount: 0,
              nativeBridgeState: "connected",
              nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
              nativeMessageType: "skfiy.host_policy.request",
              nativeResponseType: "skfiy.native.response",
              nativeResponseResult: "accepted"
            },
            diagnostics: {
              schemaVersion: 1,
              capabilities: { nativeMessaging: true },
              nativeHost: {
                name: "com.sskift.skfiy",
                connectionState: "connected",
                bridgeState: "connected",
                launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
              },
              devReload: {
                state: "idle",
                reloadAvailable: true,
                heartbeat: {
                  state: "connected",
                  completedAt: "2026-06-21T08:00:00.000Z",
                  launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                  messageType: "skfiy.host_policy.request",
                  responseResult: "accepted"
                }
              }
            }
          };
        }

        return {
          type: "skfiy.host_policy.response",
          schemaVersion: 1,
          requestId: "popup-status",
          policy,
          syncStatus: {
            schemaVersion: 1,
            state: "unknown",
            source: "local_storage",
            entryCount: 0
          },
          diagnostics: {
            schemaVersion: 1,
            capabilities: { nativeMessaging: true },
            nativeHost: {
              name: "com.sskift.skfiy",
              bridgeState: "unknown",
              syncState: "unknown"
            },
            devReload: {
              state: "idle",
              reloadAvailable: true,
              heartbeat: { state: "unknown" }
            }
          }
        };
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: NATIVE_HEARTBEAT,
        schemaVersion: 1
      }));
      expect(document.getElementById("native-heartbeat").textContent).toContain("Connected");
      expect(document.getElementById("native-bridge-state").textContent).toBe("Connected");
    });
  });

  it("lets the user schedule an extension reload from the popup", async () => {
    installPopupDocument();
    const policy = createPolicy();
    const mock = createPopupChromeMock({
      policy,
      onSendMessage: (message) => {
        if (message.type === DEV_RELOAD_REQUEST) {
          return {
            type: "skfiy.dev.reload_result",
            schemaVersion: 1,
            requestId: "popup-dev-reload",
            policy,
            syncStatus: {
              schemaVersion: 1,
              state: "synced",
              source: "native_host",
              updatedAt: "2026-06-21T08:01:00.000Z",
              completedAt: "2026-06-21T08:01:00.000Z",
              entryCount: 0,
              nativeBridgeState: "connected",
              nativeLaunchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
              nativeMessageType: "skfiy.host_policy.request",
              nativeResponseType: "skfiy.native.response",
              nativeResponseResult: "accepted",
              lastError: null,
              error: null
            },
            devReload: {
              schemaVersion: 1,
              state: "scheduled",
              reloadAvailable: true,
              reloadAt: "2026-06-21T08:01:01.000Z",
              reason: "heartbeat_connected",
              browserPolicy: "extension_context_reload",
              heartbeat: {
                state: "connected",
                completedAt: "2026-06-21T08:01:00.000Z",
                messageType: "skfiy.host_policy.request",
                responseResult: "accepted"
              }
            },
            diagnostics: {
              schemaVersion: 1,
              capabilities: {
                nativeMessaging: true
              },
              nativeHost: {
                name: "com.sskift.skfiy",
                bridgeState: "connected",
                syncState: "synced",
                launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                lastError: null
              },
              devReload: {
                state: "scheduled",
                reloadAvailable: true,
                heartbeat: {
                  state: "connected",
                  completedAt: "2026-06-21T08:01:00.000Z"
                }
              }
            }
          };
        }

        return {
          type: "skfiy.host_policy.response",
          schemaVersion: 1,
          requestId: "popup-status",
          policy,
          syncStatus: {
            schemaVersion: 1,
            state: "unknown",
            source: "local_storage",
            entryCount: 0
          },
          diagnostics: {
            schemaVersion: 1,
            capabilities: {
              nativeMessaging: true
            },
            nativeHost: {
              name: "com.sskift.skfiy",
              bridgeState: "unknown",
              syncState: "unknown",
              lastError: null
            },
            devReload: {
              state: "idle",
              reloadAvailable: true,
              heartbeat: {
                state: "unknown"
              }
            }
          }
        };
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();
    await waitForAssertion(() => {
      expect(document.getElementById("dev-reload-status").textContent).toBe("Idle");
    });

    document.getElementById("dev-reload-button").click();

    await waitForAssertion(() => {
      expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: DEV_RELOAD_REQUEST,
        schemaVersion: 1
      }));
      expect(document.getElementById("dev-reload-status").textContent)
        .toContain("Reload scheduled");
      expect(document.getElementById("native-heartbeat").textContent).toContain("Connected");
    });
  });

  it("passes skfiyTargetTabId from wake URLs into automatic heartbeat checks", async () => {
    installPopupDocument();
    window.history.replaceState({}, "", "/popup.html?skfiyWake=1&skfiyTargetTabId=42");
    const policy = createPolicy();
    const sentMessages = [];
    const mock = createPopupChromeMock({
      policy,
      onSendMessage: (message) => {
        sentMessages.push(message);
        return {
          type: message.type === NATIVE_HEARTBEAT
            ? "skfiy.native.heartbeat_result"
            : "skfiy.host_policy.response",
          schemaVersion: 1,
          requestId: message.requestId,
          policy,
          syncStatus: {
            schemaVersion: 1,
            state: "synced",
            source: "native_host",
            entryCount: 0
          },
          diagnostics: {
            nativeHost: {
              name: "com.sskift.skfiy",
              connectionState: "connected"
            },
            currentTab: {
              chromeHostPermission: {
                state: "not_applicable",
                origins: []
              }
            },
            session: {
              pageControl: {
                state: "unavailable",
                capabilities: {}
              }
            }
          }
        };
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(sentMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: NATIVE_HEARTBEAT,
          tabId: 42
        })
      ]));
    });
  });

  it("runs page observe from wake URLs when skfiyWakeAction is observe", async () => {
    installPopupDocument();
    window.history.replaceState({}, "", "/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=observe");
    const policy = createPolicy();
    const sentMessages = [];
    const mock = createPopupChromeMock({
      policy,
      onSendMessage: (message) => {
        sentMessages.push(message);
        if (message.type === PAGE_OBSERVE) {
          return {
            type: "skfiy.page.observe_result",
            schemaVersion: 1,
            requestId: message.requestId,
            snapshot: {
              title: "skfiy page control live test",
              url: "http://127.0.0.1:63852/",
              visibleText: "skfiy chrome smoke ready"
            }
          };
        }
        if (message.type === NATIVE_MESSAGE) {
          return {
            type: "skfiy.native.response",
            schemaVersion: 1,
            requestId: message.payload.requestId,
            result: "accepted"
          };
        }
        return {
          type: "skfiy.host_policy.response",
          schemaVersion: 1,
          requestId: message.requestId,
          policy,
          syncStatus: {
            schemaVersion: 1,
            state: "synced",
            source: "native_host",
            entryCount: 0
          },
          diagnostics: {
            nativeHost: {
              name: "com.sskift.skfiy",
              connectionState: "connected"
            },
            currentTab: {
              chromeHostPermission: {
                state: "not_applicable",
                origins: []
              }
            },
            session: {
              pageControl: {
                state: "ready",
                capabilities: {
                  observe: true
                }
              }
            }
          }
        };
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(sentMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: PAGE_OBSERVE,
          tabId: 42
        }),
        expect.objectContaining({
          type: NATIVE_MESSAGE,
          payload: expect.objectContaining({
            type: PAGE_OBSERVE,
            payload: expect.objectContaining({
              source: "popup_observe",
              pageObservation: expect.objectContaining({
                title: "skfiy page control live test",
                visibleText: "skfiy chrome smoke ready"
              })
            })
          })
        })
      ]));
    });
  });
});
