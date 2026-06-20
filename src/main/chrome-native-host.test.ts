import { describe, expect, it } from "vitest";
import {
  CHROME_NATIVE_HOST_NAME,
  createChromeNativeHostInstallPlan,
  createChromeNativeHostManifest
} from "./chrome-native-host";

describe("Chrome Native Messaging host plan", () => {
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
});
