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
      expect.arrayContaining(["activeTab", "downloads", "nativeMessaging", "scripting", "storage", "tabs"])
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
    expect(background).toContain('"skfiy.page.diagnostics"');
    expect(background).toContain("readCurrentTabDiagnostics");
    expect(background).toContain("createPageControlReadiness");
    expect(background).toContain("chrome_host_permission_missing");
    expect(background).toContain('"skfiy.page.action"');
    expect(background).toContain('"skfiy.page.screenshot"');
    expect(background).toContain('"skfiy.downloads.status"');
    expect(background).toContain("download_path_exposure_requires_confirmation");
    expect(background).toContain("clampDownloadsLimit");
    expect(background).toContain('"skfiy.host_policy.request"');
    expect(background).toContain('"skfiy.host_policy.response"');
    expect(background).toContain('"skfiy.host_policy.sync_status"');
    expect(background).toContain('"skfiy.host_policy.sync_refresh"');
    expect(background).toContain("captureVisibleTab");
    expect(background).toContain("chrome.downloads.search");
    expect(background).toContain("sendNativeMessage");
    expect(background).toContain("persistHostPolicyResponse");
    expect(background).toContain("response?.hostPolicy?.policy");
    expect(background).toContain('HOST_POLICY_SYNC_STORAGE_KEY = "skfiyHostPolicySync"');
    expect(background).toContain("syncHostPolicy");
    expect(background).toContain("writeHostPolicySyncStatus");
    expect(background).toContain('"native_host_connect"');
    expect(background).toContain("chrome.runtime.onInstalled.addListener");
    expect(background).toContain("chrome.runtime.onStartup.addListener");
    expect(background).toContain("port.onMessage.addListener");
    expect(background).toContain("port.onDisconnect.addListener");

    expect(contentScript).toContain('"skfiy.page.observe"');
    expect(contentScript).toContain('"skfiy.page.diagnostics"');
    expect(contentScript).toContain("readContentScriptSession");
    expect(contentScript).toContain("readPageControlReadiness");
    expect(contentScript).toContain('"skfiy.page.action"');
    expect(contentScript).toContain('"skfiy.page.sensitive_pause"');
    expect(contentScript).toContain("collectFormMetadata");
    expect(contentScript).toContain("SENSITIVE_FIELD_PATTERNS");
    expect(contentScript).toContain("PAGE_RISK_PATTERNS");
    expect(contentScript).toContain("collectPageSafety");
    expect(contentScript).toContain("pageSafety");
    expect(contentScript).toContain("Sensitive page content requires confirmation");
    expect(contentScript).toContain("data-skfiy-sensitive-paused");
    expect(contentScript).toContain("data-skfiy-sensitive-pause-kind");
    expect(contentScript).toContain("elementByText");
    expect(contentScript).toContain("elementByRole");
    expect(contentScript).toContain('action.kind === "submit"');

    expect(popupHtml).toContain("skfiy Chrome Adapter");
    expect(popupHtml).toContain("Manifest");
    expect(popupHtml).toContain("Launch origin");
    expect(popupHtml).toContain("Host permission");
    expect(popupHtml).toContain("Page session");
    expect(popupHtml).toContain("Page control");
    expect(popupHtml).toContain("Refresh host policy");
    expect(popupScript).toContain("Ask by default");
    expect(popupScript).toContain("formatBridgeState");
    expect(popupScript).toContain("formatLaunchOrigin");
    expect(popupScript).toContain("formatHostPermission");
    expect(popupScript).toContain("formatPageControlReadiness");
    expect(popupScript).toContain("Sensitive content pause");
    expect(popupScript).toContain("HOST_POLICY_SYNC_STATUS");
    expect(popupScript).toContain("HOST_POLICY_SYNC_REFRESH");
  });
});
