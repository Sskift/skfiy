#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const APP_BUNDLE_NAME = "skfiy.app";
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";
export const ELECTRON_APP_COPY_OPTIONS = {
  recursive: true,
  verbatimSymlinks: true
};

export function createPackagePlan({
  rootDir,
  electronAppPath = path.join(rootDir, "node_modules/electron/dist/Electron.app")
}) {
  const appBundlePath = path.join(rootDir, "dist", APP_BUNDLE_NAME);
  const resourcesPath = path.join(appBundlePath, "Contents", "Resources");

  return {
    appBundlePath,
    adhocSignCommand: createAdhocCodeSignCommand(appBundlePath),
    bundleIdentifier: BUNDLE_IDENTIFIER,
    electronAppPath,
    infoPlistPath: path.join(appBundlePath, "Contents", "Info.plist"),
    resourcesPath,
    bundledAppPath: path.join(resourcesPath, "app"),
    bundledExecutablePath: path.join(appBundlePath, "Contents", "MacOS", "skfiy"),
    bundledHelperPath: path.join(resourcesPath, "skfiy-helper"),
    appPackageJsonPath: path.join(resourcesPath, "app", "package.json"),
    sourceHelperPath: path.join(rootDir, "dist", "skfiy-helper"),
    sourceMainPath: path.join(rootDir, "dist", "main"),
    sourceRendererPath: path.join(rootDir, "dist", "renderer"),
    sourceSharedPath: path.join(rootDir, "dist", "shared")
  };
}

export async function packageMacosApp({
  rootDir = DEFAULT_ROOT_DIR,
  electronAppPath
} = {}) {
  const plan = createPackagePlan({ rootDir, electronAppPath });

  assertPathExists(plan.electronAppPath, "Electron.app");
  assertPathExists(plan.sourceMainPath, "compiled main process");
  assertPathExists(plan.sourceRendererPath, "compiled renderer");
  assertPathExists(plan.sourceSharedPath, "compiled shared modules");
  assertPathExists(plan.sourceHelperPath, "compiled skfiy helper");

  await fs.rm(plan.appBundlePath, { force: true, recursive: true });
  await fs.cp(plan.electronAppPath, plan.appBundlePath, ELECTRON_APP_COPY_OPTIONS);
  const electronExecutablePath = path.join(plan.appBundlePath, "Contents", "MacOS", "Electron");
  await fs.rename(electronExecutablePath, plan.bundledExecutablePath);
  await rewriteInfoPlist(plan.infoPlistPath);
  await fs.rm(plan.bundledAppPath, { force: true, recursive: true });
  await fs.mkdir(path.join(plan.bundledAppPath, "dist"), { recursive: true });
  await fs.cp(plan.sourceMainPath, path.join(plan.bundledAppPath, "dist", "main"), {
    recursive: true
  });
  await fs.cp(plan.sourceRendererPath, path.join(plan.bundledAppPath, "dist", "renderer"), {
    recursive: true
  });
  await fs.cp(plan.sourceSharedPath, path.join(plan.bundledAppPath, "dist", "shared"), {
    recursive: true
  });
  await fs.writeFile(
    plan.appPackageJsonPath,
    `${JSON.stringify(createRuntimePackageJson(rootDir), null, 2)}\n`
  );
  await fs.copyFile(plan.sourceHelperPath, plan.bundledHelperPath);
  await fs.chmod(plan.bundledHelperPath, 0o755);
  await execFileAsync(plan.adhocSignCommand.command, plan.adhocSignCommand.args);

  return plan;
}

export function createAdhocCodeSignCommand(appPath) {
  return {
    command: "codesign",
    args: [
      "--force",
      "--deep",
      "--sign",
      "-",
      appPath
    ]
  };
}

function createRuntimePackageJson(rootDir) {
  const packageJson = JSON.parse(
    existsSync(path.join(rootDir, "package.json"))
      ? readTextSync(path.join(rootDir, "package.json"))
      : "{}"
  );

  return {
    name: "skfiy",
    version: typeof packageJson.version === "string" ? packageJson.version : "0.0.0",
    private: true,
    type: "module",
    main: "dist/main/main.js"
  };
}

async function rewriteInfoPlist(infoPlistPath) {
  const current = await fs.readFile(infoPlistPath, "utf8");
  const withExecutable = setInfoPlistString(current, "CFBundleExecutable", "skfiy");
  const next = setInfoPlistString(
    setInfoPlistString(
      setInfoPlistString(
        setInfoPlistString(
          setInfoPlistString(withExecutable, "CFBundleIdentifier", BUNDLE_IDENTIFIER),
          "CFBundleName",
          "skfiy"
        ),
        "CFBundleDisplayName",
        "skfiy"
      ),
      "NSMicrophoneUsageDescription",
      "skfiy needs microphone access for local voice command recognition."
    ),
    "NSSpeechRecognitionUsageDescription",
    "skfiy needs speech recognition access to transcribe local voice commands."
  );

  await fs.writeFile(infoPlistPath, next);
}

export function setInfoPlistString(plist, key, value) {
  const escapedKey = escapeRegExp(key);
  const pattern = new RegExp(`(<key>${escapedKey}</key>\\s*<string>)[^<]*(</string>)`);

  if (pattern.test(plist)) {
    return plist.replace(pattern, `$1${escapeXml(value)}$2`);
  }

  return plist.replace(
    /<\/dict>\s*<\/plist>\s*$/,
    `\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>\n</dict>\n</plist>\n`
  );
}

function assertPathExists(targetPath, label) {
  if (!existsSync(targetPath)) {
    throw new Error(`${label} is missing at ${targetPath}. Run npm run build first.`);
  }
}

function readTextSync(targetPath) {
  return Buffer.from(readFileSync(targetPath)).toString("utf8");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = await packageMacosApp();
    console.log(`Packaged app: ${plan.appBundlePath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
