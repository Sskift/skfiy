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
});
