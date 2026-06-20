import { describe, expect, it } from "vitest";
import {
  CHROME_NATIVE_HOST_NAME,
  CHROME_NATIVE_MESSAGE_MAX_BYTES,
  decodeChromeNativeMessageFrame,
  encodeChromeNativeMessageFrame,
  handleChromeNativeBridgeMessage,
  runChromeNativeMessagingHost,
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

describe("Chrome Native Messaging bridge runtime", () => {
  it("encodes and decodes Chrome native messaging length-prefixed JSON frames", () => {
    const frame = encodeChromeNativeMessageFrame({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: "request-1",
      payload: { tabId: 123 }
    });

    expect(frame.readUInt32LE(0)).toBe(frame.byteLength - 4);
    expect(decodeChromeNativeMessageFrame(frame)).toEqual({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: "request-1",
      payload: { tabId: 123 }
    });
  });

  it("rejects malformed, oversized, or policy-blocked native bridge messages before dispatch", async () => {
    await expect(handleChromeNativeBridgeMessage(
      { schemaVersion: 1, type: "skfiy.page.observe" },
      {
        payloadByteLength: 128,
        policy: { state: "allowed" },
        dispatch: async () => ({ result: "unreachable" })
      }
    )).resolves.toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "unknown",
      result: "invalid",
      reason: "missing_request_id"
    });

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.page.observe",
        requestId: "request-oversized"
      },
      {
        payloadByteLength: CHROME_NATIVE_MESSAGE_MAX_BYTES + 1,
        policy: { state: "allowed" },
        dispatch: async () => ({ result: "unreachable" })
      }
    )).resolves.toMatchObject({
      type: "skfiy.native.response",
      requestId: "request-oversized",
      result: "invalid",
      reason: "payload_too_large"
    });

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.page.action",
        requestId: "request-blocked"
      },
      {
        payloadByteLength: 128,
        policy: {
          state: "blocked",
          reason: "host_policy_blocked",
          details: { host: "example.com" }
        },
        dispatch: async () => ({ result: "unreachable" })
      }
    )).resolves.toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "request-blocked",
      result: "blocked",
      reason: "host_policy_blocked",
      details: { host: "example.com" }
    });
  });

  it("dispatches valid native bridge messages with request ids and normalized responses", async () => {
    const dispatched: unknown[] = [];

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.page.observe",
        requestId: "request-dispatch",
        payload: { currentTab: true }
      },
      {
        payloadByteLength: 256,
        policy: { state: "allowed" },
        dispatch: async (message) => {
          dispatched.push(message);
          return {
            result: "accepted",
            observationMode: "extension-structured"
          };
        }
      }
    )).resolves.toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "request-dispatch",
      result: "accepted",
      observationMode: "extension-structured"
    });

    expect(dispatched).toEqual([{
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: "request-dispatch",
      payload: {
        currentTab: true,
        mode: "current_page",
        include: ["title", "url", "visible_text", "forms", "interactive_elements"]
      }
    }]);
  });

  it("validates browser action schema before dispatching native bridge messages", async () => {
    const dispatched: unknown[] = [];

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.page.action",
        requestId: "safe-text-click",
        payload: {
          action: {
            kind: "click",
            text: "Continue"
          }
        }
      },
      {
        payloadByteLength: 256,
        policy: { state: "allowed" },
        dispatch: async (message) => {
          dispatched.push(message);
          return { result: "accepted" };
        }
      }
    )).resolves.toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "safe-text-click",
      result: "accepted"
    });

    expect(dispatched).toEqual([{
      schemaVersion: 1,
      type: "skfiy.page.action",
      requestId: "safe-text-click",
      payload: {
        action: {
          kind: "click",
          text: "Continue"
        }
      }
    }]);

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.page.action",
        requestId: "unsafe-password",
        payload: {
          action: {
            kind: "fill",
            selector: "#password",
            value: "hunter2"
          }
        }
      },
      {
        payloadByteLength: 256,
        policy: { state: "allowed" },
        dispatch: async () => ({ result: "unreachable" })
      }
    )).resolves.toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "unsafe-password",
      result: "blocked",
      reason: "sensitive_form_action"
    });
  });

  it("dispatches screenshot and download status messages after browser schema normalization", async () => {
    const dispatched: unknown[] = [];

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.page.screenshot",
        requestId: "screenshot-native"
      },
      {
        payloadByteLength: 128,
        policy: { state: "allowed" },
        dispatch: async (message) => {
          dispatched.push(message);
          return { result: "accepted" };
        }
      }
    )).resolves.toMatchObject({
      requestId: "screenshot-native",
      result: "accepted"
    });

    await expect(handleChromeNativeBridgeMessage(
      {
        schemaVersion: 1,
        type: "skfiy.downloads.status",
        requestId: "downloads-native",
        payload: {
          includeFilePaths: true
        }
      },
      {
        payloadByteLength: 128,
        policy: { state: "allowed" },
        dispatch: async () => ({ result: "unreachable" })
      }
    )).resolves.toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "downloads-native",
      result: "blocked",
      reason: "download_path_exposure_requires_confirmation"
    });

    expect(dispatched).toEqual([{
      schemaVersion: 1,
      type: "skfiy.page.screenshot",
      requestId: "screenshot-native",
      payload: {
        format: "png"
      }
    }]);
  });

  it("runs a framed native messaging host loop without line-oriented stdout", async () => {
    const inputFrame = encodeChromeNativeMessageFrame({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: "request-framed",
      payload: { currentTab: true }
    });
    const stdout: Buffer[] = [];
    const stderr: string[] = [];

    async function* stdin() {
      yield inputFrame.subarray(0, 3);
      yield inputFrame.subarray(3);
    }

    await expect(runChromeNativeMessagingHost({
      stdin: stdin(),
      stdout: { write: (chunk: Buffer) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      policy: { state: "allowed" },
      dispatch: async () => ({
        result: "accepted",
        observationMode: "extension-structured"
      })
    })).resolves.toBe(0);

    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    expect(decodeChromeNativeMessageFrame(stdout[0])).toEqual({
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "request-framed",
      result: "accepted",
      observationMode: "extension-structured"
    });
  });
});
