#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_PATH,
  classifyDashboardSmokeEvidence,
  createDashboardHelpText,
  createDefaultDashboardSmokeOptions,
  parseDashboardSmokeArgs,
  writeDashboardSmokeEvidence
} from "./smoke-dashboard-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DASHBOARD_ARGS = ["dashboard", "--no-open", "--port", "0", "--json"];

async function main() {
  const defaults = createDefaultDashboardSmokeOptions(ROOT_DIR);
  const options = parseDashboardSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createDashboardHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    cliPath: options.cliPath,
    command: [options.cliPath, ...DASHBOARD_ARGS],
    productPath: PRODUCT_PATH,
    runnerHasTmux: Boolean(process.env.TMUX),
    artifactPath: options.outputPath,
    cliOutput: undefined,
    cliStdout: "",
    cliStderr: "",
    descriptorResponse: undefined,
    snapshotResponse: undefined,
    shellResponse: undefined,
    tokenLeakDetected: false,
    result: "not-run"
  };
  let smokeLock;
  let dashboardProcess;

  try {
    assertDashboardSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:dashboard"
    });

    const launched = await launchDashboardCli(options);
    dashboardProcess = launched.child;
    evidence.pid = dashboardProcess.pid;
    evidence.cliOutput = launched.cliOutput;
    evidence.cliStdout = launched.stdout;
    evidence.cliStderr = launched.stderr;
    evidence.descriptorResponse = await readJsonResponse(
      new URL("/descriptor.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.snapshotResponse = await readJsonResponse(
      new URL("/snapshot.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.shellResponse = await readTextResponse(launched.cliOutput.url, options.timeoutMs);
    evidence.tokenLeakDetected = hasTokenLeak([
      evidence.cliStdout,
      evidence.cliStderr,
      JSON.stringify(evidence.descriptorResponse),
      JSON.stringify(evidence.snapshotResponse),
      evidence.shellResponse?.body ?? ""
    ]);
    evidence.result = classifyDashboardSmokeEvidence(evidence);

    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    if (dashboardProcess) {
      evidence.cleanup = await terminateDashboardProcess(dashboardProcess);
    }
    await smokeLock?.release();

    if (options.outputPath) {
      try {
        await writeDashboardSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertDashboardSmokeReady(options) {
  if (!existsSync(options.cliPath)) {
    throw new Error(`Built CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }

  if (typeof fetch !== "function") {
    throw new Error("This smoke script requires a Node runtime with global fetch support.");
  }
}

function launchDashboardCli(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.cliPath, DASHBOARD_ARGS, {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Timed out waiting for dashboard CLI JSON after ${options.timeoutMs}ms.`));
      }
    }, options.timeoutMs);
    const settle = (callback) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        callback();
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      try {
        const cliOutput = JSON.parse(stdout);

        settle(() => resolve({
          child,
          cliOutput,
          stdout,
          stderr
        }));
      } catch {
        // Pretty-printed JSON arrives over multiple chunks while the server keeps running.
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle(() => reject(error));
    });
    child.once("exit", (code, signal) => {
      settle(() => reject(new Error(
        `Dashboard CLI exited before printing JSON: code=${code ?? "null"} signal=${signal ?? "null"} stderr=${stderr.trim()}`
      )));
    });
  });
}

async function readJsonResponse(url, timeoutMs) {
  const textResponse = await readTextResponse(url, timeoutMs);
  let body;

  try {
    body = JSON.parse(textResponse.body);
  } catch (error) {
    return {
      ...textResponse,
      jsonParseError: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    status: textResponse.status,
    headers: textResponse.headers,
    body,
    rawBody: textResponse.body
  };
}

async function readTextResponse(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
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

async function terminateDashboardProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      signal: "none",
      exited: true,
      code: child.exitCode,
      signalCode: child.signalCode
    };
  }

  child.kill("SIGTERM");

  const result = await Promise.race([
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

  return result;
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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
