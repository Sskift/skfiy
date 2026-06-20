#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_PATH,
  classifyDashboardSmokeEvidence,
  createDashboardHelpText,
  createDefaultDashboardSmokeOptions,
  createRuntimeSnapshotCoverage,
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
    isolatedHomeDir: undefined,
    descriptorResponse: undefined,
    snapshotResponse: undefined,
    operatorReadiness: undefined,
    eventsResponse: undefined,
    shellResponse: undefined,
    chromeHostPolicyApi: undefined,
    runtimeSnapshotFixture: undefined,
    runtimeSnapshotCoverage: undefined,
    freshInstallRuntimeSnapshot: undefined,
    tokenLeakDetected: false,
    result: "not-run"
  };
  let smokeLock;
  let dashboardProcess;
  let isolatedHomeDir;

  try {
    assertDashboardSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:dashboard"
    });
    isolatedHomeDir = await mkdtemp(path.join(tmpdir(), "skfiy-dashboard-smoke-home-"));
    evidence.isolatedHomeDir = isolatedHomeDir;
    evidence.runtimeSnapshotFixture = await seedRuntimeSnapshotFixture(isolatedHomeDir);

    const launched = await launchDashboardCli(options, {
      homeDir: isolatedHomeDir
    });
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
    evidence.operatorReadiness = evidence.snapshotResponse?.body?.operatorReadiness;
    evidence.eventsResponse = await readEventStreamResponse(
      new URL("/events", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.shellResponse = await readTextResponse(launched.cliOutput.url, options.timeoutMs);
    evidence.chromeHostPolicyApi = await exerciseChromeHostPolicyApi({
      dashboardUrl: launched.cliOutput.url,
      timeoutMs: options.timeoutMs
    });
    evidence.freshInstallRuntimeSnapshot = await collectFreshInstallRuntimeSnapshotEvidence(options);
    evidence.tokenLeakDetected = hasTokenLeak([
      evidence.cliStdout,
      evidence.cliStderr,
      JSON.stringify(evidence.descriptorResponse),
      JSON.stringify(evidence.snapshotResponse),
      JSON.stringify(evidence.eventsResponse),
      JSON.stringify(evidence.chromeHostPolicyApi),
      JSON.stringify(evidence.freshInstallRuntimeSnapshot),
      evidence.shellResponse?.body ?? ""
    ]);
    evidence.runtimeSnapshotCoverage = createRuntimeSnapshotCoverage(evidence);
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
    if (isolatedHomeDir) {
      await rm(isolatedHomeDir, { recursive: true, force: true }).catch((error) => {
        evidence.isolatedHomeCleanupError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      });
    }
    await smokeLock?.release();

    if (!evidence.runtimeSnapshotCoverage) {
      evidence.runtimeSnapshotCoverage = createRuntimeSnapshotCoverage(evidence);
    }

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

async function seedRuntimeSnapshotFixture(homeDir) {
  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  const snapshot = createRuntimeSnapshotFixture(new Date().toISOString());

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    productPath: "smoke:dashboard -> isolated HOME -> runtime-snapshot.json",
    path: snapshotPath,
    snapshot
  };
}

async function collectFreshInstallRuntimeSnapshotEvidence(options) {
  const isolatedHomeDir = await mkdtemp(path.join(tmpdir(), "skfiy-dashboard-fresh-home-"));
  const runtimeSnapshotPath = createRuntimeSnapshotStatePath(isolatedHomeDir);
  const evidence = {
    productPath: "smoke:dashboard -> isolated fresh HOME -> missing runtime-snapshot.json",
    isolatedHomeDir,
    runtimeSnapshotPath,
    runtimeSnapshotExistsBeforeLaunch: existsSync(runtimeSnapshotPath),
    runtimeSnapshotExistsAfterFetch: undefined,
    cliOutput: undefined,
    cliStdout: "",
    cliStderr: "",
    snapshotResponse: undefined,
    eventsResponse: undefined,
    cleanup: undefined,
    result: "not-run"
  };
  let dashboardProcess;

  try {
    const launched = await launchDashboardCli(options, {
      homeDir: isolatedHomeDir
    });
    dashboardProcess = launched.child;
    evidence.pid = dashboardProcess.pid;
    evidence.cliOutput = launched.cliOutput;
    evidence.cliStdout = launched.stdout;
    evidence.cliStderr = launched.stderr;
    evidence.snapshotResponse = await readJsonResponse(
      new URL("/snapshot.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.eventsResponse = await readEventStreamResponse(
      new URL("/events", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.runtimeSnapshotExistsAfterFetch = existsSync(runtimeSnapshotPath);
    evidence.result = "collected";
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (dashboardProcess) {
      evidence.cleanup = await terminateDashboardProcess(dashboardProcess);
    }
    await rm(isolatedHomeDir, { recursive: true, force: true }).catch((error) => {
      evidence.isolatedHomeCleanupError = error instanceof Error ? error.message : String(error);
    });
  }

  return evidence;
}

function createRuntimeSnapshotStatePath(homeDir) {
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "runtime-snapshot.json"
  );
}

function createRuntimeSnapshotFixture(observedAt) {
  return {
    schemaVersion: 1,
    observedAt,
    currentTurn: {
      state: "approval_required",
      command: "dashboard smoke runtime snapshot fixture",
      targetApp: "Ghostty",
      targetBundleId: "com.mitchellh.ghostty",
      risk: "low",
      plannerProvider: "Dashboard Smoke Fixture",
      approvalRequired: true,
      approvalState: "required",
      stopState: "available",
      latestMessage: "Dashboard smoke runtime snapshot fixture is visible.",
      latestAction: {
        type: "verify",
        actionType: "type_text",
        status: "passed",
        message: "Dashboard smoke runtime snapshot fixture verification is visible."
      },
      latestVerification: {
        type: "verify",
        actionType: "type_text",
        status: "passed",
        message: "Dashboard smoke runtime snapshot fixture verification is visible."
      },
      latestScreenshot: {
        stage: "before",
        path: "/tmp/skfiy-dashboard-runtime-fixture-before.png",
        bundleId: "com.mitchellh.ghostty",
        recommendation: "structured_first",
        sourceCount: 2
      },
      source: "runtime-snapshot"
    },
    replay: {
      state: "available",
      outcome: "running",
      screenshotCount: 1,
      actionCount: 3,
      verificationCount: 1,
      timelineCount: 2,
      latestMessage: "Dashboard smoke runtime snapshot fixture is visible.",
      screenshots: [
        {
          stage: "before",
          path: "/tmp/skfiy-dashboard-runtime-fixture-before.png",
          bundleId: "com.mitchellh.ghostty",
          recommendation: "structured_first",
          sourceCount: 2
        }
      ],
      actions: [
        {
          type: "plan",
          providerLabel: "Dashboard Smoke Fixture",
          command: "dashboard smoke runtime snapshot fixture"
        },
        {
          type: "type_text",
          textLength: 40
        },
        {
          type: "verify",
          actionType: "type_text",
          status: "passed",
          message: "Dashboard smoke runtime snapshot fixture verification is visible."
        }
      ],
      verifications: [
        {
          type: "verify",
          actionType: "type_text",
          status: "passed",
          message: "Dashboard smoke runtime snapshot fixture verification is visible."
        }
      ],
      timelineTail: [
        {
          status: "executing",
          message: "Dashboard smoke runtime snapshot fixture started."
        },
        {
          status: "approval_required",
          command: "dashboard smoke runtime snapshot fixture",
          message: "Dashboard smoke runtime snapshot fixture is visible."
        }
      ],
      source: "runtime-snapshot"
    }
  };
}

function assertDashboardSmokeReady(options) {
  if (!existsSync(options.cliPath)) {
    throw new Error(`Built CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }

  if (typeof fetch !== "function") {
    throw new Error("This smoke script requires a Node runtime with global fetch support.");
  }
}

function launchDashboardCli(options, { homeDir } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.cliPath, DASHBOARD_ARGS, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...(homeDir ? { HOME: homeDir } : {})
      },
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

async function exerciseChromeHostPolicyApi({ dashboardUrl, timeoutMs }) {
  const apiUrl = new URL("/api/chrome-host-policy", dashboardUrl).toString();
  const productPath = "dist/skfiy -> dashboard /api/chrome-host-policy -> chrome-host-policy.json";
  const showDefault = await readJsonResponse(apiUrl, timeoutMs);
  const setResponse = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify({
      action: "allow-current-turn",
      host: "https://dashboard-smoke.example/path"
    })
  });
  const showConfigured = await readJsonResponse(apiUrl, timeoutMs);
  const resetResponse = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify({
      action: "reset"
    })
  });

  return {
    productPath,
    apiUrl,
    showDefault,
    setResponse,
    showConfigured,
    resetResponse
  };
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

async function readJsonRequest(url, timeoutMs, request = {}) {
  const textResponse = await readTextResponse(url, timeoutMs, request);
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

async function readTextResponse(url, timeoutMs, request = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: request.method ?? "GET",
      headers: request.body ? {
        "content-type": "application/json"
      } : undefined,
      body: request.body,
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

async function readEventStreamResponse(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    const headers = Object.fromEntries(response.headers.entries());
    let body = "";

    if (!response.body) {
      return {
        status: response.status,
        headers,
        body,
        error: "SSE response did not expose a readable body."
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (!body.includes("\n\n")) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      controller.abort();
    }

    return {
      status: response.status,
      headers,
      body: body.includes("\n\n") ? body.slice(0, body.indexOf("\n\n") + 2) : body
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
