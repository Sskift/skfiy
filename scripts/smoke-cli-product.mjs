#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_PATH,
  classifyCliSmokeEvidence,
  createCliSmokeCommandRuns,
  createCliSmokeHelpText,
  createDefaultCliSmokeOptions,
  parseCliSmokeArgs,
  writeCliSmokeEvidence
} from "./smoke-cli-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const defaults = createDefaultCliSmokeOptions(ROOT_DIR);
  const options = parseCliSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createCliSmokeHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    cliPath: options.cliPath,
    isolatedHomeDir: options.isolatedHomeDir,
    scratchDir: options.scratchDir,
    productPath: PRODUCT_PATH,
    runnerHasTmux: Boolean(process.env.TMUX),
    artifactPath: options.outputPath,
    commands: [],
    result: "not-run"
  };
  let smokeLock;

  try {
    assertCliSmokeReady(options);
    await prepareIsolatedHome(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:cli"
    });

    for (const run of createCliSmokeCommandRuns(options)) {
      if (run.nestedProductSmoke && smokeLock) {
        await smokeLock.release();
        smokeLock = undefined;
      }

      const commandEvidence = run.longRunning
        ? await launchLongRunningCommand(run, options)
        : await runCommand(run, options);

      evidence.commands.push(commandEvidence);
    }

    evidence.result = classifyCliSmokeEvidence(evidence);
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
        await writeCliSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertCliSmokeReady(options) {
  if (!existsSync(options.cliPath)) {
    throw new Error(`Built CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }
}

async function prepareIsolatedHome(options) {
  await rm(options.isolatedHomeDir, { force: true, recursive: true });
  await mkdir(options.isolatedHomeDir, { recursive: true });
  await mkdir(options.scratchDir, { recursive: true });
}

function runCommand(run, options) {
  return new Promise((resolve) => {
    const child = spawn(run.command[0], run.command.slice(1), {
      cwd: ROOT_DIR,
      env: createCommandEnv(options),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolve(createCommandEvidence(run, {
        exitCode: 1,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error)
      }));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve(createCommandEvidence(run, {
        exitCode: code ?? 1,
        signal,
        stdout,
        stderr
      }));
    });
  });
}

function launchLongRunningCommand(run, options) {
  return new Promise((resolve) => {
    const child = spawn(run.command[0], run.command.slice(1), {
      cwd: ROOT_DIR,
      env: createCommandEnv(options),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settle(async () => ({
        exitCode: 1,
        stdout,
        stderr,
        error: `Timed out waiting for ${run.id} JSON after ${options.timeoutMs}ms.`,
        cleanup: await terminateLongRunningCommand(child)
      }));
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      try {
        JSON.parse(stdout);
        settle(async () => ({
          exitCode: 0,
          stdout,
          stderr,
          cleanup: await terminateLongRunningCommand(child)
        }));
      } catch {
        // Pretty JSON may arrive over multiple chunks while the process keeps running.
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle(async () => ({
        exitCode: 1,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error),
        cleanup: await terminateLongRunningCommand(child)
      }));
    });
    child.once("exit", (code, signal) => {
      settle(async () => ({
        exitCode: code ?? 1,
        signal,
        stdout,
        stderr
      }));
    });

    async function settle(readResult) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(createCommandEvidence(run, await readResult()));
    }
  });
}

function createCommandEvidence(run, result) {
  const evidence = {
    id: run.id,
    command: run.command,
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutJson: undefined,
    jsonParseError: undefined,
    error: result.error,
    cleanup: result.cleanup,
    tokenLeakDetected: hasTokenLeak([result.stdout, result.stderr])
  };

  try {
    evidence.stdoutJson = JSON.parse(result.stdout);
  } catch (error) {
    evidence.jsonParseError = error instanceof Error ? error.message : String(error);
  }

  return evidence;
}

function createCommandEnv(options) {
  return {
    ...process.env,
    HOME: options.isolatedHomeDir,
    USERPROFILE: options.isolatedHomeDir
  };
}

async function terminateLongRunningCommand(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      signal: "none",
      exited: true,
      code: child.exitCode,
      signalCode: child.signalCode
    };
  }

  child.kill("SIGTERM");

  return Promise.race([
    waitForExit(child).then(({ code, signal }) => ({
      signal: "SIGTERM",
      exited: true,
      code,
      signalCode: signal
    })),
    sleep(1_000).then(async () => {
      child.kill("SIGKILL");
      const { code, signal } = await waitForExit(child);

      return {
        signal: "SIGKILL",
        exited: true,
        code,
        signalCode: signal
      };
    })
  ]);
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }

    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasTokenLeak(parts) {
  return parts
    .filter((part) => typeof part === "string")
    .some((part) =>
      /token=/i.test(part)
      || /"tokenPrinted"\s*:\s*true/i.test(part)
      || /"token"\s*:\s*"[^"]+"/i.test(part)
    );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
