#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifySmokeV2Scenario,
  createDefaultSmokeV2Options,
  createSmokeV2Evidence,
  createSmokeV2HelpText,
  createSmokeV2Plan,
  parseSmokeV2Args
} from "./smoke-v2-plan.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const defaults = createDefaultSmokeV2Options(ROOT_DIR);
  const options = parseSmokeV2Args(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createSmokeV2HelpText(defaults));
    return;
  }

  const startedAt = new Date().toISOString();
  const plan = createSmokeV2Plan(options);
  const scenarios = [];

  if (options.dryRun) {
    scenarios.push(...plan.map((scenario) => ({
      ...scenario,
      result: "planned",
      accepted: true
    })));
  } else {
    for (const scenario of plan) {
      scenarios.push(await runScenario(scenario));
    }
  }

  const finishedAt = new Date().toISOString();
  const evidence = createSmokeV2Evidence({
    profile: options.profile,
    startedAt,
    finishedAt,
    scenarios,
    requirePassed: options.requirePassed,
    dryRun: options.dryRun
  });

  if (options.outputPath) {
    await writeJson(options.outputPath, evidence);
  }

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

  if (options.requirePassed && evidence.result !== "passed") {
    process.exitCode = 2;
  }
}

async function runScenario(scenario) {
  const started = Date.now();
  let exitCode = 0;
  let error;

  try {
    exitCode = await runCommand(scenario.command);
  } catch (caught) {
    exitCode = typeof caught?.exitCode === "number" ? caught.exitCode : 1;
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const rawArtifact = readJsonIfExists(scenario.artifactPath);

  return classifySmokeV2Scenario({
    ...scenario,
    rawArtifact,
    exitCode,
    error,
    durationMs: Date.now() - started
  });
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const [file, ...args] = command;
    const child = spawn(file, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        const error = new Error(`Command ${command.join(" ")} exited by signal ${signal}.`);
        error.exitCode = 1;
        reject(error);
        return;
      }

      resolve(code ?? 0);
    });
  });
}

function readJsonIfExists(targetPath) {
  if (!targetPath || !existsSync(targetPath)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(targetPath, "utf8"));
  } catch (error) {
    return {
      result: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function writeJson(targetPath, payload) {
  const resolved = path.resolve(targetPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`);
}

await main();

