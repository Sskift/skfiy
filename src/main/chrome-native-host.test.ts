import { describe, expect, it } from "vitest";
import {
  CHROME_NATIVE_HOST_NAME,
  createChromeNativeHostInstallPlan,
  createChromeNativeHostManifest,
  readChromeNativeHostStatus,
  installChromeNativeHost,
  uninstallChromeNativeHost
} from "./chrome-native-host";

describe("Chrome Native Messaging host plan", () => {
  function createMemoryChromeHostIo(files: Record<string, string> = {}) {
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

  it("creates the Chrome native host manifest for the packaged skfiy CLI", () => {
    expect(createChromeNativeHostManifest({
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
    })).toEqual({
      name: CHROME_NATIVE_HOST_NAME,
      description: "skfiy desktop Computer Use bridge",
      path: "/repo/dist/skfiy",
      type: "stdio",
      allowed_origins: [
        "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
      ]
    });
  });

  it("plans a user-level Chrome manifest path without requiring root install", () => {
    expect(createChromeNativeHostInstallPlan({
      homeDir: "/Users/tester",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
    })).toEqual({
      hostName: "com.sskift.skfiy",
      manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
      manifest: {
        name: "com.sskift.skfiy",
        description: "skfiy desktop Computer Use bridge",
        path: "/repo/dist/skfiy",
        type: "stdio",
        allowed_origins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ]
      }
    });
  });

  it("rejects relative CLI paths because Chrome will launch the host directly", () => {
    expect(() => createChromeNativeHostManifest({
      cliShimPath: "dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
    })).toThrow("Chrome native messaging host path must be absolute");
  });

  it("installs the user-level manifest with a built CLI shim path", async () => {
    const io = createMemoryChromeHostIo({
      "/repo/dist/skfiy": "#!/usr/bin/env node\n"
    });

    await expect(installChromeNativeHost({
      homeDir: "/Users/tester",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      io
    })).resolves.toEqual({
      result: "installed",
      hostName: "com.sskift.skfiy",
      manifestPath: "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
      cliShimPath: "/repo/dist/skfiy",
      allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
    });

    expect(JSON.parse(
      io.files["/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json"]
    )).toEqual(createChromeNativeHostManifest({
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
    }));
  });

  it("reports installed, missing, and mismatched native host status", async () => {
    const manifestPath = "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json";
    const manifest = createChromeNativeHostManifest({
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
    });

    await expect(readChromeNativeHostStatus({
      homeDir: "/Users/tester",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      io: createMemoryChromeHostIo({
        "/repo/dist/skfiy": "#!/usr/bin/env node\n",
        [manifestPath]: JSON.stringify(manifest)
      })
    })).resolves.toEqual({
      state: "installed",
      hostName: "com.sskift.skfiy",
      manifestPath,
      cliShimPath: "/repo/dist/skfiy",
      allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
      reason: "Chrome Native Messaging host is installed."
    });

    await expect(readChromeNativeHostStatus({
      homeDir: "/Users/tester",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      io: createMemoryChromeHostIo({
        "/repo/dist/skfiy": "#!/usr/bin/env node\n"
      })
    })).resolves.toMatchObject({
      state: "missing",
      reason: "Chrome Native Messaging host manifest is not installed."
    });

    await expect(readChromeNativeHostStatus({
      homeDir: "/Users/tester",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      io: createMemoryChromeHostIo({
        "/repo/dist/skfiy": "#!/usr/bin/env node\n",
        [manifestPath]: JSON.stringify({
          ...manifest,
          path: "/tmp/old-skfiy"
        })
      })
    })).resolves.toMatchObject({
      state: "mismatched",
      reason: "Chrome Native Messaging host manifest does not match the current skfiy CLI."
    });
  });

  it("uninstalls the user-level manifest without touching the CLI shim", async () => {
    const manifestPath = "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json";
    const io = createMemoryChromeHostIo({
      "/repo/dist/skfiy": "#!/usr/bin/env node\n",
      [manifestPath]: "{}"
    });

    await expect(uninstallChromeNativeHost({
      homeDir: "/Users/tester",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      io
    })).resolves.toEqual({
      result: "uninstalled",
      hostName: "com.sskift.skfiy",
      manifestPath
    });
    expect(io.files["/repo/dist/skfiy"]).toBe("#!/usr/bin/env node\n");
    expect(io.files[manifestPath]).toBeUndefined();
  });
});
