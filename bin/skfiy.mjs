#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const binPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(binPath), "..");
const builtCliRelativePath = "dist/main/cli-command-surface.js";
const builtCliPath = path.join(repoRoot, ...builtCliRelativePath.split("/"));
const builtNativeHostPath = path.join(repoRoot, "dist", "main", "chrome-native-host.js");
const argv = process.argv.slice(2);
const launchOrigin = argv.find((arg) => arg.startsWith("chrome-extension://"));
const shouldRunNativeMessagingHost =
  process.stdin.isTTY !== true
  && (
    argv.length === 0
    || typeof launchOrigin === "string"
    || process.env.SKFIY_NATIVE_MESSAGING_HOST === "1"
  );

if (!existsSync(builtCliPath)) {
  process.stderr.write(
    "skfiy CLI is not built yet. Run `npm run build` from the skfiy repository, then retry.\n"
  );
  process.exitCode = 1;
} else {
  const cli = await import(pathToFileURL(builtCliPath).href);
  if (typeof cli.runSkfiyCli !== "function") {
    process.stderr.write("skfiy CLI build is missing runSkfiyCli(). Rebuild the app and retry.\n");
    process.exitCode = 1;
  } else if (shouldRunNativeMessagingHost) {
    const nativeHost = await import(pathToFileURL(builtNativeHostPath).href);
    if (typeof nativeHost.runChromeNativeMessagingHost !== "function") {
      process.stderr.write("skfiy CLI build is missing runChromeNativeMessagingHost(). Rebuild the app and retry.\n");
      process.exitCode = 1;
    } else {
      process.exitCode = await nativeHost.runChromeNativeMessagingHost({
        stdin: process.stdin,
        stdout: { write: (chunk) => process.stdout.write(chunk) },
        stderr: process.stderr,
        policy: { state: "allowed" },
        connectionHeartbeat: async (heartbeat) => {
          if (typeof nativeHost.writeChromeExtensionConnectionHeartbeat === "function") {
            await nativeHost.writeChromeExtensionConnectionHeartbeat({
              homeDir: process.env.HOME ?? "",
              launchOrigin,
              ...heartbeat
            });
          }
        },
        dispatch: typeof nativeHost.createChromeNativeBridgeDispatch === "function"
          ? nativeHost.createChromeNativeBridgeDispatch({
            homeDir: process.env.HOME ?? "",
            launchOrigin
          })
          : async (message) => ({
            result: "accepted",
            bridgeState: "connected",
            launchOrigin,
            messageType: message.type
          })
      });
    }
  } else {
    const exitCode = await cli.runSkfiyCli({
      argv,
      rootDir: repoRoot,
      stdout: process.stdout,
      stderr: process.stderr
    });
    process.exitCode = typeof exitCode === "number" ? exitCode : 0;
  }
}
