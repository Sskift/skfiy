import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const extensionRoot = path.join(process.cwd(), "chrome-extension");
const HOST_POLICY_SYNC_STATUS = "skfiy.host_policy.sync_status";
const HOST_POLICY_SYNC_REFRESH = "skfiy.host_policy.sync_refresh";

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

  return {
    chrome: {
      runtime: {
        sendMessage
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
    sendMessage
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
            syncState: "synced",
            policyState: "configured",
            lastError: null,
            updatedAt: "2026-06-20T10:00:00.000Z"
          },
          hostPolicy: {
            defaultMode: "ask",
            entryCount: 3,
            allowedHosts: 1,
            currentTurnAllowedHosts: 1,
            blockedHosts: 1
          }
        }
      }
    });
    globalThis.chrome = mock.chrome;

    await importPopup();

    await waitForAssertion(() => {
      expect(document.getElementById("connection-status").textContent).toBe("Synced with skfiy app");
      expect(document.getElementById("extension-version").textContent).toBe("v0.0.1");
      expect(document.getElementById("extension-capabilities").textContent).toContain("Native messaging");
      expect(document.getElementById("current-host").textContent).toBe("example.com");
      expect(document.getElementById("host-policy").textContent).toBe("Always allowed");
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
                syncState: "synced",
                policyState: "configured",
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
});
