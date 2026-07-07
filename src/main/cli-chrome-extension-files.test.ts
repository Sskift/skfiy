import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ChromeNativeHostIo } from "./chrome-native-host";
import {
  readChromeExtensionManifest,
  readChromeExtensionRegistrationStatus
} from "./cli-chrome-extension-files";

function createMemoryChromeIo(files: Record<string, string>): ChromeNativeHostIo {
  return {
    exists: async (targetPath) => Object.prototype.hasOwnProperty.call(files, targetPath),
    readFile: async (targetPath) => files[targetPath] ?? "",
    writeFile: async (targetPath, content) => {
      files[targetPath] = content;
    },
    mkdir: async () => {},
    rm: async (targetPath) => {
      delete files[targetPath];
    }
  };
}

describe("CLI Chrome extension files", () => {
  it("reads a compact local extension manifest summary", () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), "skfiy-extension-manifest-"));
    const manifestPath = path.join(rootDir, "manifest.json");

    try {
      writeFileSync(manifestPath, JSON.stringify({
        manifest_version: 3,
        name: "skfiy",
        version: "0.0.6",
        description: "Local extension",
        minimum_chrome_version: "120",
        permissions: ["storage", "tabs"],
        host_permissions: ["https://example.test/*"],
        optional_host_permissions: ["https://optional.test/*"],
        background: {
          service_worker: "background.js"
        },
        action: {
          default_popup: "popup.html"
        }
      }));

      expect(readChromeExtensionManifest(manifestPath)).toEqual({
        state: "available",
        manifest: {
          manifestVersion: 3,
          name: "skfiy",
          version: "0.0.6",
          description: "Local extension",
          minimumChromeVersion: "120",
          permissions: ["storage", "tabs"],
          hostPermissions: ["https://example.test/*"],
          optionalHostPermissions: ["https://optional.test/*"],
          backgroundServiceWorker: "background.js",
          actionDefaultPopup: "popup.html"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("detects stale Chrome extension registration from profile preferences", async () => {
    const rootDir = "/repo";
    const homeDir = "/Users/tester";
    const extensionId = "abcdefghijklmnopabcdefghijklmnop";
    const files = {
      [path.join(rootDir, "chrome-extension", "manifest.json")]: JSON.stringify({ version: "0.0.6" }),
      [path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Preferences")]: JSON.stringify({
        extensions: {
          settings: {
            [extensionId]: {
              path: "/repo/chrome-extension",
              service_worker_registration_info: {
                version: "0.0.5"
              }
            }
          }
        }
      })
    };

    await expect(readChromeExtensionRegistrationStatus({
      rootDir,
      homeDir,
      extensionId,
      io: createMemoryChromeIo(files)
    })).resolves.toEqual({
      state: "stale",
      localManifestVersion: "0.0.6",
      registeredVersion: "0.0.5",
      extensionPath: "/repo/chrome-extension",
      manifestPath: "/repo/chrome-extension/manifest.json",
      preferencesPath: "/Users/tester/Library/Application Support/Google/Chrome/Default/Preferences"
    });
  });

  it("reports missing Chrome profile preferences with local manifest version", async () => {
    const rootDir = "/repo";
    const homeDir = "/Users/tester";

    await expect(readChromeExtensionRegistrationStatus({
      rootDir,
      homeDir,
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      io: createMemoryChromeIo({
        [path.join(rootDir, "chrome-extension", "manifest.json")]: JSON.stringify({ version: "0.0.6" })
      })
    })).resolves.toEqual({
      state: "missing",
      localManifestVersion: "0.0.6",
      manifestPath: "/repo/chrome-extension/manifest.json",
      preferencesPath: "/Users/tester/Library/Application Support/Google/Chrome/Default/Preferences",
      reason: "Chrome profile preferences are missing."
    });
  });
});
