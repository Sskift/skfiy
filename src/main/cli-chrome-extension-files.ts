import path from "node:path";
import {
  existsSync,
  readFileSync
} from "node:fs";

import type { ChromeNativeHostIo } from "./chrome-native-host.js";
import type { ChromeExtensionRegistrationStatus } from "./cli-chrome-command-output.js";
import {
  compactRecord,
  readErrorMessage,
  readRecord,
  readString,
  readStringArray
} from "./cli-record-utils.js";

export function readChromeExtensionManifest(manifestPath: string): Record<string, unknown> {
  if (!existsSync(manifestPath)) {
    return {
      state: "missing",
      reason: `Chrome extension manifest is missing at ${manifestPath}.`
    };
  }

  try {
    const parsed = readRecord(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (!parsed) {
      return {
        state: "invalid",
        reason: "Chrome extension manifest is not a JSON object."
      };
    }

    return {
      state: "available",
      manifest: compactRecord({
        manifestVersion: parsed.manifest_version,
        name: readString(parsed.name),
        version: readString(parsed.version),
        description: readString(parsed.description),
        minimumChromeVersion: readString(parsed.minimum_chrome_version),
        permissions: readStringArray(parsed.permissions),
        hostPermissions: readStringArray(parsed.host_permissions),
        optionalHostPermissions: readStringArray(parsed.optional_host_permissions),
        backgroundServiceWorker: readString(readRecord(parsed.background)?.service_worker),
        actionDefaultPopup: readString(readRecord(parsed.action)?.default_popup)
      })
    };
  } catch (error) {
    return {
      state: "invalid",
      reason: readErrorMessage(error)
    };
  }
}

export async function readChromeExtensionRegistrationStatus({
  rootDir,
  homeDir,
  extensionId,
  io
}: {
  rootDir: string;
  homeDir: string;
  extensionId: string;
  io?: ChromeNativeHostIo;
}): Promise<ChromeExtensionRegistrationStatus> {
  const extensionPath = path.join(rootDir, "chrome-extension");
  const manifestPath = path.join(extensionPath, "manifest.json");
  const localManifest = await readJsonFileForChromeRegistration(manifestPath, io);
  if (localManifest.state === "invalid") {
    return {
      state: "invalid",
      manifestPath,
      reason: localManifest.reason
    };
  }

  const localManifestVersion = readString(readRecord(localManifest.value)?.version);
  const preferencesPaths = [
    path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Secure Preferences"),
    path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Preferences")
  ];

  let lastMissingPath = preferencesPaths[0];
  for (const preferencesPath of preferencesPaths) {
    const preferences = await readJsonFileForChromeRegistration(preferencesPath, io);
    if (preferences.state === "missing") {
      lastMissingPath = preferencesPath;
      continue;
    }
    if (preferences.state === "invalid") {
      return {
        state: "invalid",
        localManifestVersion,
        manifestPath,
        preferencesPath,
        reason: preferences.reason
      };
    }

    const settings = readRecord(readRecord(readRecord(preferences.value)?.extensions)?.settings);
    const extensionEntry = readRecord(settings?.[extensionId]);
    if (!extensionEntry) {
      return {
        state: "missing",
        localManifestVersion,
        manifestPath,
        preferencesPath,
        reason: `Chrome profile does not contain extension ${extensionId}.`
      };
    }

    const registeredVersion = readString(readRecord(extensionEntry.service_worker_registration_info)?.version)
      ?? readString(readRecord(extensionEntry.manifest)?.version);
    const registeredExtensionPath = readString(extensionEntry.path);
    if (localManifestVersion && registeredVersion && localManifestVersion !== registeredVersion) {
      return compactRecord({
        state: "stale",
        localManifestVersion,
        registeredVersion,
        extensionPath: registeredExtensionPath,
        manifestPath,
        preferencesPath
      }) as ChromeExtensionRegistrationStatus;
    }
    if (localManifestVersion && registeredVersion && localManifestVersion === registeredVersion) {
      return compactRecord({
        state: "fresh",
        localManifestVersion,
        registeredVersion,
        extensionPath: registeredExtensionPath,
        manifestPath,
        preferencesPath
      }) as ChromeExtensionRegistrationStatus;
    }

    return compactRecord({
      state: "unknown",
      localManifestVersion,
      registeredVersion,
      extensionPath: registeredExtensionPath,
      manifestPath,
      preferencesPath,
      reason: "Chrome extension registration did not expose both local and registered versions."
    }) as ChromeExtensionRegistrationStatus;
  }

  return {
    state: "missing",
    localManifestVersion,
    manifestPath,
    preferencesPath: lastMissingPath,
    reason: "Chrome profile preferences are missing."
  };
}

async function readJsonFileForChromeRegistration(
  targetPath: string,
  io?: ChromeNativeHostIo
): Promise<{
  state: "available" | "missing" | "invalid";
  value?: unknown;
  reason?: string;
}> {
  try {
    let content: string;
    if (io) {
      if (!(await io.exists(targetPath))) {
        return { state: "missing" };
      }
      content = await io.readFile(targetPath);
    } else {
      if (!existsSync(targetPath)) {
        return { state: "missing" };
      }
      content = readFileSync(targetPath, "utf8");
    }

    return {
      state: "available",
      value: JSON.parse(content) as unknown
    };
  } catch (error) {
    return {
      state: "invalid",
      reason: readErrorMessage(error)
    };
  }
}
