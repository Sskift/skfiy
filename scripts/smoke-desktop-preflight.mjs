#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

export async function createDesktopSessionPreflightEvidence({
  appPath = path.join(ROOT_DIR, "dist", "skfiy.app"),
  helperPath = path.join(appPath, "Contents", "MacOS", "skfiy-helper"),
  runner = runProcess
} = {}) {
  const result = await runner(helperPath, ["desktop-session-status"]);
  const payload = JSON.parse(result.stdout);

  if (payload?.ok !== true) {
    throw new Error(`desktop-session-status failed: ${result.stdout}`);
  }

  const data = payload.data ?? {};
  const frontmost = {
    bundleId: typeof data.frontmostBundleId === "string" ? data.frontmostBundleId : undefined,
    localizedName: typeof data.frontmostLocalizedName === "string"
      ? data.frontmostLocalizedName
      : undefined,
    processIdentifier: Number.isInteger(data.frontmostProcessIdentifier)
      ? data.frontmostProcessIdentifier
      : undefined
  };
  const display = typeof data.mainDisplayAsleep === "boolean"
    ? { mainDisplayAsleep: data.mainDisplayAsleep }
    : undefined;
  const resultName = data.controllable === false || frontmost.bundleId === "com.apple.loginwindow"
    ? "blocked"
    : "passed";

  return {
    timestamp: new Date().toISOString(),
    appPath,
    helperPath,
    productPath: "packaged helper -> desktop-session-status",
    frontmost,
    display,
    controllable: data.controllable === true,
    result: resultName,
    reason: createDesktopSessionPreflightReason(frontmost, data.controllable === true, display)
  };
}

export function isDesktopSessionPreflightBlocked(preflight) {
  return preflight?.result === "blocked";
}

export function createDesktopSessionBlockedEvent(preflight) {
  return {
    status: "failed",
    message: preflight?.reason
      ?? "Desktop session preflight blocked. Unlock the Mac and keep the display awake, then retry.",
    desktopPreflight: preflight
  };
}

function createDesktopSessionPreflightReason(frontmost, controllable, display) {
  if (controllable) {
    return "Desktop session preflight passed.";
  }

  const frontmostText = `frontmostBundleId=${frontmost.bundleId ?? "unknown"}`
    + (frontmost.processIdentifier === undefined
      ? ""
      : ` frontmostProcessIdentifier=${frontmost.processIdentifier}`);

  if (display?.mainDisplayAsleep === true) {
    return `Main display is asleep before target app launch and ${frontmostText}. Wake and unlock the Mac, then retry.`;
  }

  return "Desktop session is not controllable before target app launch: "
    + frontmostText
    + ". Unlock the Mac and keep the display awake, then retry.";
}

async function runProcess(file, args) {
  return await execFileAsync(file, args, {
    maxBuffer: 1024 * 1024 * 4,
    timeout: 3_000
  });
}
