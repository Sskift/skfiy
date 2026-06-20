import path from "node:path";

export const CHROME_NATIVE_HOST_NAME = "com.sskift.skfiy";

export interface ChromeNativeHostManifestInput {
  cliShimPath: string;
  extensionIds: string[];
}

export interface ChromeNativeHostManifest {
  name: typeof CHROME_NATIVE_HOST_NAME;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export interface ChromeNativeHostInstallPlanInput extends ChromeNativeHostManifestInput {
  homeDir: string;
}

export interface ChromeNativeHostInstallPlan {
  hostName: typeof CHROME_NATIVE_HOST_NAME;
  manifestPath: string;
  manifest: ChromeNativeHostManifest;
}

export function createChromeNativeHostManifest({
  cliShimPath,
  extensionIds
}: ChromeNativeHostManifestInput): ChromeNativeHostManifest {
  if (!path.isAbsolute(cliShimPath)) {
    throw new Error("Chrome native messaging host path must be absolute.");
  }

  return {
    name: CHROME_NATIVE_HOST_NAME,
    description: "skfiy desktop Computer Use bridge",
    path: cliShimPath,
    type: "stdio",
    allowed_origins: extensionIds.map((extensionId) => `chrome-extension://${extensionId}/`)
  };
}

export function createChromeNativeHostInstallPlan({
  homeDir,
  cliShimPath,
  extensionIds
}: ChromeNativeHostInstallPlanInput): ChromeNativeHostInstallPlan {
  return {
    hostName: CHROME_NATIVE_HOST_NAME,
    manifestPath: path.join(
      homeDir,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      `${CHROME_NATIVE_HOST_NAME}.json`
    ),
    manifest: createChromeNativeHostManifest({
      cliShimPath,
      extensionIds
    })
  };
}
