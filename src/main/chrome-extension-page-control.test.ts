import { describe, expect, it, vi } from "vitest";
import {
  invokeChromeExtensionPageControl,
  invokeChromeExtensionTabDiscovery
} from "./chrome-extension-page-control";
import type { ChromeAppleEventsTab } from "./chrome-extension-page-control";
import type { ChromeNativeHostIo } from "./chrome-native-host";

const EXTENSION_ID = "plcpkkhlcacihjfohlojdknnkademlno";
const GENERATED_AT = "2026-06-21T10:10:00.000Z";

function createConnectionRecord(overrides: Record<string, unknown>): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    hostName: "com.sskift.skfiy",
    observedAt: "2026-06-21T10:09:59.900Z",
    launchOrigin: `chrome-extension://${EXTENSION_ID}/`,
    messageType: "skfiy.page.observe",
    requestId: "page-control-health-popup_wake-1",
    pageControl: {
      state: "ready"
    },
    ...overrides
  }, null, 2)}\n`;
}

describe("Chrome extension page control invoker", () => {
  it("catches a transient observe heartbeat before readiness overwrites it", async () => {
    let recordIndex = 0;
    const records = [
      createConnectionRecord({ requestId: "page-control-health-before" }),
      createConnectionRecord({
        requestId: "popup-observe-native-1",
        pageObservation: {
          title: "skfiy observe smoke",
          visibleText: "skfiy observe live smoke 2026-06-21 compiled binary path"
        }
      }),
      createConnectionRecord({ requestId: "page-control-health-after" })
    ];
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => records[recordIndex] ?? records[records.length - 1]),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };
    const waitDurations: number[] = [];

    const result = await invokeChromeExtensionPageControl({
      action: "observe",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async (ms) => {
        waitDurations.push(ms);
        recordIndex = ms > 200 ? 2 : 1;
      },
      pollTimeoutMs: 700
    });

    expect(waitDurations[0]).toBeLessThanOrEqual(100);
    expect(result).toMatchObject({
      result: "verified",
      extensionConnection: {
        requestId: "popup-observe-native-1",
        pageObservation: {
          title: "skfiy observe smoke"
        }
      }
    });
  });

  it("verifies a screenshot heartbeat", async () => {
    const openedUrls: string[] = [];
    const opener = vi.fn(async (url: string) => {
      openedUrls.push(url);
    });
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.screenshot",
        requestId: "page-control-screenshot-native-1",
        pageScreenshot: {
          result: "passed",
          tabId: 42,
          format: "png",
          hasDataUrl: true,
          dataUrlBytes: 128
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "screenshot",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      generatedAt: GENERATED_AT,
      opener,
      io,
      wait: async () => undefined
    });

    expect(openedUrls[0]).toContain("skfiyWakeAction=screenshot");
    expect(result).toMatchObject({
      result: "verified",
      action: "screenshot",
      extensionConnection: {
        requestId: "page-control-screenshot-native-1"
      }
    });
  });

  it("verifies a screenshot command preserved under a later readiness heartbeat", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "ready"
        },
        latestCommand: {
          observedAt: "2026-06-21T10:10:00.100Z",
          messageType: "skfiy.page.screenshot",
          requestId: "popup-screenshot-native-1",
          pageScreenshot: {
            result: "passed",
            tabId: 42,
            targetTabId: 42,
            format: "png",
            hasDataUrl: true,
            dataUrlBytes: 128
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "screenshot",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      result: "verified",
      action: "screenshot",
      extensionConnection: {
        messageType: "skfiy.page.observe",
        latestCommand: {
          requestId: "popup-screenshot-native-1",
          pageScreenshot: {
            hasDataUrl: true
          }
        }
      }
    });
  });

  it("requires preserved command evidence to match the current request id", async () => {
    const openedUrls: string[] = [];
    const opener = vi.fn(async (url: string) => {
      openedUrls.push(url);
    });
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "ready"
        },
        latestCommand: {
          observedAt: "2026-06-21T10:10:00.100Z",
          messageType: "skfiy.page.action",
          requestId: "page-control-fill-cli-previous",
          pageActionResult: {
            result: "passed",
            action: "fill",
            targetTabId: 42,
            selector: "#name"
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "fill",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      selector: "#name",
      text: "skfiy",
      requestId: "page-control-fill-cli-current",
      generatedAt: GENERATED_AT,
      opener,
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });
    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(openedUrl.searchParams.get("skfiyRequestId")).toBe("page-control-fill-cli-current");
    expect(result).toMatchObject({
      result: "blocked",
      action: "fill",
      reason: "page-control-fill-not-verified"
    });
  });

  it("maps missing Chrome site access readiness to an actionable page-control blocker", async () => {
    const siteAccessMessage = "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run.";
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "blocked_by_chrome_host_permission",
          reason: siteAccessMessage,
          nextAction: "grant_chrome_host_permission",
          chromeHostPermission: {
            state: "missing",
            reason: "chrome_host_permission_missing",
            code: "chrome_host_permission_missing",
            origins: ["https://allowed.example/*"],
            message: siteAccessMessage
          },
          blockers: [
            {
              code: "blocked_by_chrome_host_permission",
              reason: "chrome_host_permission_missing",
              message: siteAccessMessage
            }
          ]
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "fill",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      selector: "#name",
      text: "skfiy",
      requestId: "page-control-fill-cli-current",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "fill",
      reason: "chrome-site-access-missing",
      nextAction: "Grant Chrome site access for https://allowed.example/*, then retry `skfiy chrome fill`.",
      extensionConnection: {
        pageControl: {
          state: "blocked_by_chrome_host_permission",
          chromeHostPermission: {
            state: "missing"
          }
        }
      }
    });
  });

  it("maps blocked latest action evidence to the underlying Chrome site-access blocker", async () => {
    const siteAccessMessage = "Missing optional Chrome host permission for https://allowed.example/*. Grant site access before page diagnostics or actions can run.";
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "partial"
        },
        latestCommand: {
          observedAt: "2026-06-21T10:10:00.100Z",
          messageType: "skfiy.page.action",
          requestId: "page-control-fill-cli-current",
          pageActionResult: {
            type: "skfiy.host_policy.response",
            requestId: "page-control-fill-cli-current",
            result: "blocked",
            action: "fill",
            reason: "chrome_host_permission_missing",
            code: "chrome_host_permission_missing",
            message: siteAccessMessage,
            targetTabId: 42,
            selector: "#name",
            chromeHostPermission: {
              state: "missing",
              origins: ["https://allowed.example/*"],
              message: siteAccessMessage
            }
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "fill",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      selector: "#name",
      text: "skfiy",
      requestId: "page-control-fill-cli-current",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "fill",
      reason: "chrome-site-access-missing",
      nextAction: "Grant Chrome site access for https://allowed.example/*, then retry `skfiy chrome fill`."
    });
  });

  it("maps skfiy host policy readiness blocks to an actionable page-control blocker", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "blocked_by_host_policy",
          reason: "Host policy has not allowed this page.",
          nextAction: "allow_host",
          hostPolicy: {
            decision: "ask",
            reason: "default_policy"
          },
          activeTab: {
            host: "ask.example"
          },
          blockers: [
            {
              code: "blocked_by_host_policy",
              reason: "default_policy",
              message: "Host policy has not allowed this page."
            }
          ]
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "observe",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      requestId: "page-control-observe-cli-current",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "observe",
      reason: "chrome-host-policy-blocked",
      nextAction: "Allow ask.example in skfiy Chrome host policy, then retry `skfiy chrome observe`."
    });
  });

  it("verifies preserved command evidence for the current request id", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "ready"
        },
        latestCommand: {
          observedAt: "2026-06-21T10:10:00.100Z",
          messageType: "skfiy.page.action",
          requestId: "page-control-fill-cli-current",
          pageActionResult: {
            result: "passed",
            action: "fill",
            targetTabId: 42,
            selector: "#name"
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "fill",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      selector: "#name",
      text: "skfiy",
      requestId: "page-control-fill-cli-current",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined
    });

    expect(result).toMatchObject({
      result: "verified",
      action: "fill",
      extensionConnection: {
        latestCommand: {
          requestId: "page-control-fill-cli-current"
        }
      }
    });
  });

  it("does not verify a preserved command recorded before the request started", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "ready"
        },
        latestCommand: {
          observedAt: "2026-06-21T10:09:59.999Z",
          messageType: "skfiy.page.screenshot",
          requestId: "popup-screenshot-native-old",
          pageScreenshot: {
            result: "passed",
            hasDataUrl: true,
            dataUrlBytes: 128
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "screenshot",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "screenshot",
      reason: "page-control-screenshot-not-verified"
    });
  });

  it("does not verify screenshot heartbeats that do not contain image data", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.screenshot",
        requestId: "page-control-screenshot-native-blocked",
        pageScreenshot: {
          result: "blocked",
          reason: "The active tab cannot be captured",
          hasDataUrl: false
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "screenshot",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "screenshot",
      reason: "chrome-capture-blocked",
      extensionConnection: {
        requestId: "page-control-screenshot-native-blocked",
        pageScreenshot: {
          result: "blocked",
          reason: "The active tab cannot be captured",
          hasDataUrl: false
        }
      }
    });
  });

  it("maps preserved screenshot capture permission errors to an actionable blocker", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_activated-1",
        pageControl: {
          state: "ready"
        },
        latestCommand: {
          observedAt: "2026-06-21T10:10:00.100Z",
          messageType: "skfiy.page.screenshot",
          requestId: "popup-screenshot-native-1",
          pageScreenshot: {
            result: "blocked",
            reason: "Either the '<all_urls>' or 'activeTab' permission is required.",
            tabId: 42,
            targetTabId: 42,
            format: "png",
            hasDataUrl: false
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "screenshot",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "screenshot",
      reason: "chrome-capture-permission-missing",
      nextAction: expect.stringContaining("<all_urls>")
    });
  });

  it("passes action wake parameters and verifies an action heartbeat", async () => {
    const openedUrls: string[] = [];
    const opener = vi.fn(async (url: string) => {
      openedUrls.push(url);
    });
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.action",
        requestId: "page-control-fill-native-1",
        pageActionResult: {
          result: "passed",
          action: "fill",
          targetTabId: 42,
          selector: "#name"
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "fill",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      selector: "#name",
      text: "skfiy",
      generatedAt: GENERATED_AT,
      opener,
      io,
      wait: async () => undefined
    });
    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(openedUrl.searchParams.get("skfiyWakeAction")).toBe("fill");
    expect(openedUrl.searchParams.get("skfiySelector")).toBe("#name");
    expect(openedUrl.searchParams.get("skfiyText")).toBe("skfiy");
    expect(result).toMatchObject({
      result: "verified",
      action: "fill",
      extensionConnection: {
        requestId: "page-control-fill-native-1"
      }
    });
  });

  it("does not verify an action heartbeat for a different requested action", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.action",
        requestId: "page-control-submit-native-1",
        pageActionResult: {
          result: "passed",
          action: "submit",
          targetTabId: 42,
          selector: "form"
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionPageControl({
      action: "click",
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      targetTabId: 42,
      selector: "#submit",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1
    });

    expect(result).toMatchObject({
      result: "blocked",
      action: "click",
      extensionConnection: {
        requestId: "page-control-submit-native-1",
        pageActionResult: {
          action: "submit"
        }
      }
    });
  });

  it("falls back to Chrome Apple Events when extension tab discovery wake does not return pageTabs", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-popup_wake-1",
        latestCommand: {
          observedAt: "2026-06-21T10:09:59.000Z",
          messageType: "skfiy.page.screenshot"
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionTabDiscovery({
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1,
      fallbackTabLister: vi.fn(async () => [
        {
          id: 42,
          windowId: 7,
          active: true,
          title: "Allowed app",
          url: "https://allowed.example/dashboard"
        },
        {
          id: 43,
          windowId: 7,
          active: false,
          title: "Extensions",
          url: "chrome://extensions/"
        }
      ])
    });

    expect(result).toMatchObject({
      result: "verified",
      discoveryMode: "chrome-apple-events",
      tabs: [
        {
          id: 42,
          windowId: 7,
          active: true,
          title: "Allowed app",
          url: "https://allowed.example/dashboard",
          host: "allowed.example",
          scheme: "https",
          state: "eligible",
          eligible: true
        },
        {
          id: 43,
          windowId: 7,
          active: false,
          title: "Extensions",
          url: "chrome://extensions/",
          scheme: "chrome",
          state: "blocked",
          eligible: false,
          blocker: "internal_chrome_page"
        }
      ]
    });
  });

  it("opens tab discovery wake with a request id and verifies matching pageTabs evidence", async () => {
    const openedUrls: string[] = [];
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-popup_wake-1",
        latestCommand: {
          observedAt: "2026-06-21T10:10:01.000Z",
          messageType: "skfiy.tabs.discover",
          requestId: "tabs-discover-cli-test",
          pageTabs: {
            result: "passed",
            tabs: [
              {
                id: 42,
                windowId: 7,
                active: true,
                title: "Allowed app",
                url: "https://allowed.example/dashboard",
                host: "allowed.example",
                scheme: "https:",
                state: "eligible",
                eligible: true
              }
            ]
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionTabDiscovery({
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      generatedAt: GENERATED_AT,
      requestId: "tabs-discover-cli-test",
      opener: vi.fn(async (url: string) => {
        openedUrls.push(url);
      }),
      io,
      wait: async () => undefined,
      fallbackTabLister: vi.fn(async () => [])
    } as Parameters<typeof invokeChromeExtensionTabDiscovery>[0] & { requestId: string });

    expect(openedUrls[0]).toContain("skfiyWakeAction=tabs");
    expect(openedUrls[0]).toContain("skfiyRequestId=tabs-discover-cli-test");
    expect(result).toMatchObject({
      result: "verified",
      discoveryMode: "extension",
      tabs: [
        {
          id: 42,
          state: "eligible",
          eligible: true
        }
      ],
      extensionConnection: {
        latestCommand: {
          messageType: "skfiy.tabs.discover",
          requestId: "tabs-discover-cli-test"
        }
      }
    });
  });

  it("rejects tab discovery evidence from a different request id before using fallback", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-popup_wake-1",
        latestCommand: {
          observedAt: "2026-06-21T10:10:01.000Z",
          messageType: "skfiy.tabs.discover",
          requestId: "tabs-discover-cli-stale",
          pageTabs: {
            result: "passed",
            tabs: [
              {
                id: 42,
                windowId: 7,
                title: "Stale app",
                url: "https://stale.example/dashboard",
                host: "stale.example",
                scheme: "https:",
                state: "eligible",
                eligible: true
              }
            ]
          }
        }
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };

    const result = await invokeChromeExtensionTabDiscovery({
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      generatedAt: GENERATED_AT,
      requestId: "tabs-discover-cli-current",
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1,
      fallbackTabLister: vi.fn(async () => [
        {
          id: 99,
          windowId: 8,
          active: true,
          title: "Fallback app",
          url: "https://fallback.example/dashboard"
        }
      ])
    } as Parameters<typeof invokeChromeExtensionTabDiscovery>[0] & { requestId: string });

    expect(result).toMatchObject({
      result: "verified",
      discoveryMode: "chrome-apple-events",
      tabs: [
        {
          id: 99,
          host: "fallback.example",
          state: "eligible",
          eligible: true
        }
      ]
    });
  });

  it("normalizes Apple Events tab ids when osascript returns numeric strings", async () => {
    const io: ChromeNativeHostIo = {
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => createConnectionRecord({
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-popup_wake-1"
      })),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };
    const fallbackTabs = [
      {
        id: "1782096419",
        windowId: "1782095132",
        active: true,
        title: "skfiy action smoke",
        url: "http://127.0.0.1:53757/?skfiy_action_live=smoke"
      }
    ] as unknown as ChromeAppleEventsTab[];

    const result = await invokeChromeExtensionTabDiscovery({
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      generatedAt: GENERATED_AT,
      opener: vi.fn(async () => undefined),
      io,
      wait: async () => undefined,
      pollTimeoutMs: 1,
      fallbackTabLister: vi.fn(async () => fallbackTabs)
    });

    expect(result).toMatchObject({
      result: "verified",
      discoveryMode: "chrome-apple-events",
      tabs: [
        {
          id: 1782096419,
          windowId: 1782095132,
          state: "eligible",
          eligible: true
        }
      ]
    });
  });
});
