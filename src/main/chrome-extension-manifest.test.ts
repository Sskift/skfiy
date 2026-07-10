import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = path.join(process.cwd(), "chrome-extension");

function readExtensionFile(relativePath: string): string {
  return readFileSync(path.join(extensionRoot, relativePath), "utf8");
}

describe("Chrome extension manifest", () => {
  it("declares the MV3 extension entrypoints and permissions", () => {
    const requiredFiles = ["manifest.json", "background.js", "content-script.js", "popup.html", "popup.js"];
    const missingFiles = requiredFiles.filter((relativePath) => {
      return !existsSync(path.join(extensionRoot, relativePath));
    });

    expect(missingFiles).toEqual([]);

    const manifest = JSON.parse(readExtensionFile("manifest.json")) as {
      manifest_version?: number;
      background?: { service_worker?: string; type?: string };
      action?: { default_popup?: string };
      version?: string;
      permissions?: string[];
      host_permissions?: string[];
      optional_host_permissions?: string[];
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toMatchObject({
      service_worker: "background.js",
      type: "module"
    });
    expect(manifest.action).toMatchObject({ default_popup: "popup.html" });
    expect(manifest.version).toBe("0.0.16");
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["activeTab", "downloads", "nativeMessaging", "scripting", "storage", "tabs"])
    );
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining(["http://*/*", "https://*/*", "<all_urls>"]));
  });
});
