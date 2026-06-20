import { describe, expect, it } from "vitest";
import { createChromeHostPolicyStatePath } from "./chrome-host-policy";
import {
  createChromeNativeHostManifest,
  createChromeExtensionConnectionStatePath
} from "./chrome-native-host";
import {
  createChromeReadinessConnectionPath,
  createChromeReadinessDiagnostics
} from "./chrome-readiness";

function createMemoryChromeReadinessIo(files: Record<string, string> = {}) {
  const store = { ...files };

  return {
    files: store,
    exists: async (targetPath: string) => Object.hasOwn(store, targetPath),
    mkdir: async (targetPath: string) => {
      store[targetPath] = store[targetPath] ?? "__dir__";
    },
    readFile: async (targetPath: string) => store[targetPath],
    writeFile: async (targetPath: string, content: string) => {
      store[targetPath] = content;
    },
    rm: async (targetPath: string) => {
      delete store[targetPath];
    }
  };
}

describe("Chrome extension readiness diagnostics", () => {
  const homeDir = "/Users/tester";
  const cliShimPath = "/repo/dist/skfiy";
  const extensionIds = ["abcdefghijklmnopabcdefghijklmnop"];
  const manifestPath = "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json";
  const hostPolicyPath = createChromeHostPolicyStatePath(homeDir);
  const connectionPath = createChromeExtensionConnectionStatePath(homeDir);

  it("summarizes installed native host, host policy, approval policy, and live connection evidence", async () => {
    const manifest = createChromeNativeHostManifest({
      cliShimPath,
      extensionIds
    });
    const io = createMemoryChromeReadinessIo({
      [cliShimPath]: "#!/usr/bin/env node\n",
      [manifestPath]: JSON.stringify(manifest),
      [hostPolicyPath]: JSON.stringify({
        schemaVersion: 1,
        policy: {
          defaultMode: "ask",
          allowedHosts: ["always.example"],
          currentTurnAllowedHosts: ["turn.example"],
          blockedHosts: []
        }
      }),
      [connectionPath]: JSON.stringify({
        schemaVersion: 1,
        hostName: "com.sskift.skfiy",
        observedAt: "2026-06-20T00:00:00.000Z",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: "skfiy.page.observe",
        requestId: "request-1"
      })
    });

    await expect(createChromeReadinessDiagnostics({
      homeDir,
      cliShimPath,
      extensionIds,
      approvalProbeCommand: "打开 Chrome 测试页面 https://Example.com/path 并提取正文",
      generatedAt: "2026-06-20T00:02:00.000Z",
      io
    })).resolves.toEqual({
      schemaVersion: 1,
      state: "ready",
      generatedAt: "2026-06-20T00:02:00.000Z",
      nativeHost: {
        hostName: "com.sskift.skfiy",
        state: "installed",
        manifestPath,
        cliShimPath,
        allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
        reason: "Chrome Native Messaging host is installed."
      },
      extensionManifest: {
        state: "planned",
        manifestVersion: 3,
        hostName: "com.sskift.skfiy",
        allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
        nativeMessaging: true,
        optionalHostPermissions: ["http://*/*", "https://*/*"]
      },
      hostPolicy: {
        schemaVersion: 1,
        state: "configured",
        path: hostPolicyPath,
        defaultMode: "ask",
        entryCount: 2
      },
      approvalPolicy: {
        state: "ready",
        host: "example.com",
        defaultAction: "allow_current_turn_after_user_approval",
        failClosed: true
      },
      liveConnection: {
        state: "connected",
        liveConnection: "connected",
        path: connectionPath,
        ageSeconds: 120,
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: "skfiy.page.observe",
        requestId: "request-1"
      }
    });
  });

  it("reports needs_setup when the packaged native host manifest is missing", async () => {
    const io = createMemoryChromeReadinessIo({
      [cliShimPath]: "#!/usr/bin/env node\n"
    });

    await expect(createChromeReadinessDiagnostics({
      homeDir,
      cliShimPath,
      extensionIds,
      generatedAt: "2026-06-20T00:00:00.000Z",
      io
    })).resolves.toMatchObject({
      state: "needs_setup",
      nativeHost: {
        state: "missing"
      },
      hostPolicy: {
        state: "default",
        defaultMode: "ask",
        entryCount: 0
      },
      approvalPolicy: {
        state: "no_probe"
      },
      liveConnection: {
        state: "unknown",
        liveConnection: "unknown",
        path: connectionPath
      }
    });
  });

  it("fails closed when stored host policy JSON is invalid", async () => {
    const manifest = createChromeNativeHostManifest({
      cliShimPath,
      extensionIds
    });
    const io = createMemoryChromeReadinessIo({
      [cliShimPath]: "#!/usr/bin/env node\n",
      [manifestPath]: JSON.stringify(manifest),
      [hostPolicyPath]: "{"
    });

    await expect(createChromeReadinessDiagnostics({
      homeDir,
      cliShimPath,
      extensionIds,
      generatedAt: "2026-06-20T00:00:00.000Z",
      io
    })).resolves.toMatchObject({
      state: "blocked",
      nativeHost: {
        state: "installed"
      },
      hostPolicy: {
        state: "invalid",
        reason: "Chrome host policy file is not valid JSON."
      }
    });
  });

  it("exposes the same heartbeat path used by native-host connection evidence", () => {
    expect(createChromeReadinessConnectionPath(homeDir)).toBe(connectionPath);
  });
});
