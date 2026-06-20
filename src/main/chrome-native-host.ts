import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

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

export interface ChromeNativeHostIo {
  exists: (targetPath: string) => boolean | Promise<boolean>;
  mkdir: (targetPath: string) => Promise<void>;
  readFile: (targetPath: string) => Promise<string>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  rm: (targetPath: string) => Promise<void>;
}

export interface ChromeNativeHostCommandInput extends ChromeNativeHostInstallPlanInput {
  io?: ChromeNativeHostIo;
}

export interface ChromeNativeHostMutationResult {
  result: "installed" | "uninstalled";
  hostName: typeof CHROME_NATIVE_HOST_NAME;
  manifestPath: string;
  cliShimPath?: string;
  allowedOrigins?: string[];
}

export interface ChromeNativeHostStatus {
  state: "installed" | "missing" | "mismatched" | "cli-missing" | "invalid";
  hostName: typeof CHROME_NATIVE_HOST_NAME;
  manifestPath: string;
  cliShimPath: string;
  allowedOrigins: string[];
  reason: string;
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

export async function installChromeNativeHost({
  homeDir,
  cliShimPath,
  extensionIds,
  io = createDefaultChromeNativeHostIo()
}: ChromeNativeHostCommandInput): Promise<ChromeNativeHostMutationResult> {
  const plan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });

  if (!(await io.exists(cliShimPath))) {
    throw new Error(`skfiy CLI shim is missing at ${cliShimPath}. Run npm run build first.`);
  }

  await io.mkdir(path.dirname(plan.manifestPath));
  await io.writeFile(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);

  return {
    result: "installed",
    hostName: plan.hostName,
    manifestPath: plan.manifestPath,
    cliShimPath,
    allowedOrigins: plan.manifest.allowed_origins
  };
}

export async function uninstallChromeNativeHost({
  homeDir,
  cliShimPath,
  extensionIds,
  io = createDefaultChromeNativeHostIo()
}: ChromeNativeHostCommandInput): Promise<ChromeNativeHostMutationResult> {
  const plan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });

  await io.rm(plan.manifestPath);

  return {
    result: "uninstalled",
    hostName: plan.hostName,
    manifestPath: plan.manifestPath
  };
}

export async function readChromeNativeHostStatus({
  homeDir,
  cliShimPath,
  extensionIds,
  io = createDefaultChromeNativeHostIo()
}: ChromeNativeHostCommandInput): Promise<ChromeNativeHostStatus> {
  const plan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });

  if (!(await io.exists(cliShimPath))) {
    return createStatus(plan, "cli-missing", `skfiy CLI shim is missing at ${cliShimPath}.`);
  }

  if (!(await io.exists(plan.manifestPath))) {
    return createStatus(plan, "missing", "Chrome Native Messaging host manifest is not installed.");
  }

  let installedManifest: ChromeNativeHostManifest;
  try {
    installedManifest = JSON.parse(await io.readFile(plan.manifestPath)) as ChromeNativeHostManifest;
  } catch {
    return createStatus(plan, "invalid", "Chrome Native Messaging host manifest is not valid JSON.");
  }

  if (JSON.stringify(installedManifest) !== JSON.stringify(plan.manifest)) {
    return createStatus(
      plan,
      "mismatched",
      "Chrome Native Messaging host manifest does not match the current skfiy CLI."
    );
  }

  return createStatus(plan, "installed", "Chrome Native Messaging host is installed.");
}

function createStatus(
  plan: ChromeNativeHostInstallPlan,
  state: ChromeNativeHostStatus["state"],
  reason: string
): ChromeNativeHostStatus {
  return {
    state,
    hostName: plan.hostName,
    manifestPath: plan.manifestPath,
    cliShimPath: plan.manifest.path,
    allowedOrigins: plan.manifest.allowed_origins,
    reason
  };
}

function createDefaultChromeNativeHostIo(): ChromeNativeHostIo {
  return {
    exists: (targetPath) => existsSync(targetPath),
    mkdir: async (targetPath) => {
      await mkdir(targetPath, { recursive: true });
    },
    readFile: async (targetPath) => readFile(targetPath, "utf8"),
    writeFile,
    rm: async (targetPath) => {
      await rm(targetPath, { force: true });
    }
  };
}
