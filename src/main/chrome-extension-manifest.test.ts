import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = path.join(process.cwd(), "chrome-extension");

function readExtensionFile(relativePath: string): string {
  return readFileSync(path.join(extensionRoot, relativePath), "utf8");
}

describe("Chrome extension adapter skeleton", () => {
  it("defines a static MV3 skeleton with native messaging, host policy, and page message contracts", () => {
    const requiredFiles = ["manifest.json", "background.js", "content-script.js", "popup.html", "popup.js"];
    const missingFiles = requiredFiles.filter((relativePath) => {
      return !existsSync(path.join(extensionRoot, relativePath));
    });

    expect(missingFiles).toEqual([]);

    const manifest = JSON.parse(readExtensionFile("manifest.json")) as {
      manifest_version?: number;
      background?: { service_worker?: string; type?: string };
      action?: { default_popup?: string };
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
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["activeTab", "nativeMessaging", "scripting", "storage", "tabs"])
    );
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining(["http://*/*", "https://*/*"]));

    const background = readExtensionFile("background.js");
    const contentScript = readExtensionFile("content-script.js");
    const popupHtml = readExtensionFile("popup.html");
    const popupScript = readExtensionFile("popup.js");

    expect(background).toContain('NATIVE_MESSAGING_HOST_NAME = "com.sskift.skfiy"');
    expect(background).toContain('defaultMode: "ask"');
    expect(background).toContain('CONTENT_SCRIPT_FILE = "content-script.js"');
    expect(background).toContain('"skfiy.page.observe"');
    expect(background).toContain('"skfiy.page.action"');
    expect(background).toContain('"skfiy.host_policy.request"');
    expect(background).toContain('"skfiy.host_policy.response"');
    expect(background).toContain("sendNativeMessage");
    expect(background).toContain("port.onMessage.addListener");
    expect(background).toContain("port.onDisconnect.addListener");

    expect(contentScript).toContain('"skfiy.page.observe"');
    expect(contentScript).toContain('"skfiy.page.action"');
    expect(contentScript).toContain('"skfiy.page.sensitive_pause"');
    expect(contentScript).toContain("collectFormMetadata");
    expect(contentScript).toContain("SENSITIVE_FIELD_PATTERNS");
    expect(contentScript).toContain("data-skfiy-sensitive-paused");
    expect(contentScript).toContain("elementByText");
    expect(contentScript).toContain("elementByRole");
    expect(contentScript).toContain('action.kind === "submit"');

    expect(popupHtml).toContain("skfiy Chrome Adapter");
    expect(popupScript).toContain("Ask by default");
    expect(popupScript).toContain("Sensitive content pause");
  });
});
