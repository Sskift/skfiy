import { describe, expect, it, vi } from "vitest";
import {
  createChromeExtensionConnectionStatePath,
  type ChromeNativeHostIo
} from "./chrome-native-host";
import {
  createChromeExtensionManagerUrl,
  createChromeExtensionWakeUrl,
  findChromeExtensionReloadTarget,
  reloadChromeExtensionWithDesktopControl
} from "./chrome-extension-reloader";
import type {
  DesktopAppState,
  OcrLabelObservation
} from "./computer-use/types";
import type { ObservedElement } from "./computer-use/observed-elements";

const EXTENSION_ID = "plcpkkhlcacihjfohlojdknnkademlno";
const GENERATED_AT = "2026-06-21T00:00:10.000Z";

function createTextElement(
  id: string,
  label: string,
  bounds: { x: number; y: number; width: number; height: number }
): ObservedElement {
  return {
    id,
    role: "text",
    source: "ocr",
    label,
    bounds,
    confidence: 0.9,
    metadata: { bundleId: "com.google.Chrome" }
  };
}

function createAppState(screenshotPath = "/tmp/chrome-extension-list.png"): DesktopAppState {
  return {
    bundleId: "com.google.Chrome",
    isRunning: true,
    isActive: true,
    screenshotPath,
    windows: [
      {
        title: "扩展程序",
        layer: 0,
        bounds: {
          x: 5,
          y: 0,
          width: 1298,
          height: 848
        }
      }
    ]
  };
}

function createMemoryIo(files: Record<string, string>): ChromeNativeHostIo {
  return {
    exists: async (targetPath) => Object.hasOwn(files, targetPath),
    mkdir: async () => undefined,
    readFile: async (targetPath) => files[targetPath] ?? "",
    writeFile: async (targetPath, content) => {
      files[targetPath] = content;
    },
    rm: async (targetPath) => {
      delete files[targetPath];
    }
  };
}

describe("Chrome extension reloader", () => {
  it("opens the Chrome extension list instead of relying on chrome://extensions internals", () => {
    expect(createChromeExtensionManagerUrl(EXTENSION_ID)).toBe("chrome://extensions/");
    expect(createChromeExtensionWakeUrl(EXTENSION_ID)).toMatch(
      /^chrome-extension:\/\/plcpkkhlcacihjfohlojdknnkademlno\/popup\.html\?skfiyWake=\d+$/
    );
  });

  it("targets the reload icon on the skfiy extension card", () => {
    const target = findChromeExtensionReloadTarget([
      createTextElement("ocr:0", "skf iy Chrome Adapter O.0.1", {
        x: 442,
        y: 395,
        width: 165,
        height: 12.5
      }),
      createTextElement("ocr:1", `ID: ${EXTENSION_ID}`, {
        x: 442,
        y: 483,
        width: 233,
        height: 12.5
      }),
      createTextElement("ocr:2", "irttlLn J: Service Worker", {
        x: 441.5,
        y: 502,
        width: 160.5,
        height: 12.5
      })
    ], createAppState(), EXTENSION_ID);

    expect(target).toEqual({
      strategy: "extension-card-layout",
      label: `ID: ${EXTENSION_ID}`,
      x: 677,
      y: 558,
      confidence: 0.74
    });
  });

  it("falls back to the extension detail page reload icon when Chrome opens a detail page", () => {
    const detailState = createAppState();
    if (detailState.windows?.[0]) {
      detailState.windows[0].title = "扩展程序 - skfiy Chrome Adapter";
    }

    const target = findChromeExtensionReloadTarget([
      createTextElement("ocr:0", "skfiy Chrome Adapter", {
        x: 430,
        y: 286,
        width: 180,
        height: 20
      }),
      createTextElement("ocr:1", "Service Worker", {
        x: 390,
        y: 678,
        width: 96,
        height: 20
      })
    ], detailState);

    expect(target).toEqual({
      strategy: "extension-detail-layout",
      label: "skfiy Chrome Adapter",
      x: 979,
      y: 296,
      confidence: 0.72
    });
  });

  it("does not click a generic window fallback when OCR cannot see the extension card", () => {
    expect(findChromeExtensionReloadTarget([], createAppState(), EXTENSION_ID)).toBeUndefined();
  });

  it("clicks reload and verifies the native host heartbeat", async () => {
    const homeDir = "/Users/tester";
    const files: Record<string, string> = {};
    const connectionPath = createChromeExtensionConnectionStatePath(homeDir);
    const opener = vi.fn(async () => undefined);
    const appState = createAppState("/tmp/list.png");
    const labels: OcrLabelObservation[] = [
      {
        text: "skf iy Chrome Adapter O.0.1",
        confidence: 0.9,
        bounds: { x: 442, y: 395, width: 165, height: 12.5 }
      },
      {
        text: `ID: ${EXTENSION_ID}`,
        confidence: 0.9,
        bounds: { x: 442, y: 483, width: 233, height: 12.5 }
      },
      {
        text: "irttlLn J: Service Worker",
        confidence: 0.9,
        bounds: { x: 441.5, y: 502, width: 160.5, height: 12.5 }
      }
    ];
    const helper = {
      activateApp: vi.fn(async () => ({ ok: true })),
      getAppState: vi.fn(async () => appState),
      ocrImage: vi.fn(async () => ({ labels })),
      click: vi.fn(async () => {
        files[connectionPath] = `${JSON.stringify({
          schemaVersion: 1,
          hostName: "com.sskift.skfiy",
          observedAt: GENERATED_AT,
          launchOrigin: `chrome-extension://${EXTENSION_ID}/`,
          messageType: "skfiy.host_policy.request",
          requestId: "host-policy-sync-service_worker_loaded-1"
        }, null, 2)}\n`;
        return { ok: true };
      })
    };

    await expect(reloadChromeExtensionWithDesktopControl({
      extensionId: EXTENSION_ID,
      homeDir,
      generatedAt: GENERATED_AT,
      helper,
      opener,
      io: createMemoryIo(files),
      wait: async () => undefined
    })).resolves.toMatchObject({
      result: "verified",
      extensionId: EXTENSION_ID,
      managerUrl: "chrome://extensions/",
      wakeUrl: expect.stringMatching(
        /^chrome-extension:\/\/plcpkkhlcacihjfohlojdknnkademlno\/popup\.html\?skfiyWake=\d+$/
      ),
      target: {
        strategy: "extension-card-layout",
        x: 677,
        y: 558
      },
      extensionConnection: {
        state: "connected",
        liveConnection: "connected",
        messageType: "skfiy.host_policy.request"
      }
    });

    expect(opener).toHaveBeenNthCalledWith(1, "chrome://extensions/");
    expect(opener).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /^chrome-extension:\/\/plcpkkhlcacihjfohlojdknnkademlno\/popup\.html\?skfiyWake=\d+$/
      )
    );
    expect(helper.click).toHaveBeenCalledWith(677, 558);
  });

  it("blocks reload without clicking when screen observation is empty", async () => {
    const homeDir = "/Users/tester";
    const helper = {
      activateApp: vi.fn(async () => ({ ok: true })),
      getAppState: vi.fn(async () => createAppState("/tmp/black.png")),
      ocrImage: vi.fn(async () => ({ labels: [] })),
      click: vi.fn(async () => ({ ok: true }))
    };

    await expect(reloadChromeExtensionWithDesktopControl({
      extensionId: EXTENSION_ID,
      homeDir,
      generatedAt: GENERATED_AT,
      helper,
      opener: vi.fn(async () => undefined),
      io: createMemoryIo({}),
      wait: async () => undefined
    })).resolves.toMatchObject({
      result: "blocked",
      reason: "screen-observation-empty",
      nextAction: expect.stringContaining("Wake the display")
    });

    expect(helper.click).not.toHaveBeenCalled();
  });

  it("blocks reload before OCR when the desktop session is locked", async () => {
    const lockedState = {
      ...createAppState("/tmp/locked.png"),
      isActive: false,
      frontmostBundleId: "com.apple.loginwindow",
      windows: [
        {
          title: "skfiy Chrome Adapter",
          layer: 0,
          bounds: {
            x: 5,
            y: 30,
            width: 1298,
            height: 848
          }
        }
      ]
    };
    const helper = {
      activateApp: vi.fn(async () => ({ ok: true })),
      getAppState: vi.fn(async () => lockedState),
      ocrImage: vi.fn(async () => ({ labels: [] })),
      click: vi.fn(async () => ({ ok: true }))
    };

    await expect(reloadChromeExtensionWithDesktopControl({
      extensionId: EXTENSION_ID,
      homeDir: "/Users/tester",
      generatedAt: GENERATED_AT,
      helper,
      opener: vi.fn(async () => undefined),
      io: createMemoryIo({}),
      wait: async () => undefined
    })).resolves.toMatchObject({
      result: "blocked",
      reason: "desktop-session-locked",
      observedWindowTitle: "skfiy Chrome Adapter",
      nextAction: expect.stringContaining("Unlock the desktop")
    });

    expect(helper.ocrImage).not.toHaveBeenCalled();
    expect(helper.click).not.toHaveBeenCalled();
  });
});
