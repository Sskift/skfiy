#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import {
  createDefaultDesktopSessionPreflightOptions,
  createDesktopSessionPreflightHelpText,
  explainDesktopSessionPreflightEvidence,
  parseDesktopSessionPreflightArgs,
  runDesktopSessionPreflight
} from "./desktop-session-preflight.mjs";
import {
  createGenericDesktopCapabilityReadiness
} from "./smoke-desktop-preflight.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const defaults = createDefaultDesktopSessionPreflightOptions(ROOT_DIR);
  const options = parseDesktopSessionPreflightArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(`${createDesktopSessionPreflightHelpText(defaults)}\n`);
    return;
  }

  let smokeLock;
  let evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    helperPath: options.helperPath,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: "packaged helper -> permissions-status/desktop-session-status/screenshot",
    artifactPath: options.outputPath,
    screenshotOutputPath: options.screenshotOutputPath,
    result: "not-run"
  };

  try {
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:desktop-session"
    });
    evidence = await runDesktopSessionPreflight(options);
    evidence.reason = explainDesktopSessionPreflightEvidence(evidence);
    evidence.capabilityReadiness = createGenericDesktopCapabilityReadiness({
      permissions: evidence.permissions,
      desktopSession: evidence.desktopSessionStatus
    });

    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    await smokeLock?.release();

    if (options.outputPath) {
      try {
        await import("node:fs/promises").then(({ mkdir, writeFile }) =>
          mkdir(path.dirname(options.outputPath), { recursive: true })
            .then(() => writeFile(options.outputPath, `${JSON.stringify(evidence, null, 2)}\n`))
        );
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
