import { describe, expect, it, vi } from "vitest";
import { invokeChromeExtensionPageControl } from "./chrome-extension-page-control";
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
});
