#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createDefaultMacReleaseOptions,
  createHelpText,
  createMacReleaseReadinessReport,
  createMacReleaseSteps,
  parseMacReleaseArgs
} from "./sign-notarize-macos-plan.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

export async function runMacReleaseCli({
  rootDir = DEFAULT_ROOT_DIR,
  argv = process.argv.slice(2),
  env = process.env,
  io = createDefaultIo()
} = {}) {
  const defaults = createDefaultMacReleaseOptions({ rootDir, env });
  const options = parseMacReleaseArgs(argv, defaults);

  if (options.help) {
    io.write(createHelpText(defaults));
    return { status: "help" };
  }

  const readiness = createMacReleaseReadinessReport(options);
  const steps = createMacReleaseSteps(options);
  const report = {
    status: "checked",
    dryRun: options.dryRun,
    sign: options.sign,
    notarize: options.notarize,
    plan: options.plan,
    readiness,
    steps: steps.map((step) => ({
      name: step.name,
      command: redactCommand(step.command)
    }))
  };

  io.write(`${JSON.stringify(report, null, 2)}\n`);

  if (options.dryRun) {
    return report;
  }

  const missing = missingForRequestedActions(options, readiness);
  if (missing.length > 0) {
    throw new Error(`macOS release credentials are incomplete: ${missing.join(", ")}`);
  }

  if ((options.sign || options.notarize) && !io.exists(options.plan.appPath)) {
    throw new Error(`App bundle is missing at ${options.plan.appPath}. Run npm run build first.`);
  }

  await io.mkdir(options.plan.outputDir, { recursive: true });
  for (const step of steps) {
    await io.execFile(step.command.command, step.command.args);
  }

  return {
    ...report,
    status: "executed"
  };
}

function missingForRequestedActions(options, readiness) {
  if (options.notarize) {
    return readiness.missing;
  }

  if (options.sign) {
    return readiness.signing.missing;
  }

  return [];
}

function redactCommand(command) {
  const args = command.args.map((arg, index, args) => {
    if (args[index - 1] === "--password") {
      return "<redacted>";
    }
    return arg;
  });

  return {
    command: command.command,
    args
  };
}

function createDefaultIo() {
  return {
    exists: existsSync,
    mkdir,
    execFile: execFileAsync,
    write: (message) => process.stdout.write(message)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMacReleaseCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
