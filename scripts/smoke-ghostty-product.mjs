#!/usr/bin/env node
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildSmokeRunPlan,
  classifyMatrixResult,
  classifySmokeRunEvidence,
  createDefaultSmokeOptions,
  createHelpText,
  formatLaunchCommand,
  parseSmokeArgs,
  PRODUCT_PATH,
  writeSmokeEvidence
} from "./smoke-ghostty-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import {
  filterSkfiyGhosttySessionProcessLines,
  parseProcessIds,
  SKFIY_APP_PROCESS_PATTERN,
  SKFIY_GHOSTTY_SESSION_PROCESS_PATTERN
} from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";

async function main() {
  const defaults = createDefaultSmokeOptions(ROOT_DIR);
  const options = parseSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    command: options.matrix ? undefined : options.command,
    matrix: options.matrix || undefined,
    plannerMode: options.plannerMode,
    launch: formatLaunchCommand(options),
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: PRODUCT_PATH,
    artifactPath: options.outputPath,
    events: [],
    permissions: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    plannerProviderSettings: undefined,
    appPolicySettings: undefined,
    replayRecords: [],
    screenshots: [],
    result: "not-run"
  };
  let smokeLock;

  try {
    assertSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:ghostty"
    });

    if (!options.keepExisting) {
      await quitSkfiy();
      await quitSkfiyGhosttySessions();
      await sleep(700);
    }

    await launchSkfiy(options);
    evidence.processesAfterLaunch = await readSkfiyProcesses();

    const page = await waitForRendererPage(options.port, options.timeoutMs);
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);

    try {
      await cdp.send("Runtime.enable");
      await cdp.send("Runtime.addBinding", { name: "skfiySmokeEvent" });
      await cdp.send("Runtime.evaluate", {
        expression: installEventSinkExpression(),
        awaitPromise: true,
        returnByValue: true
      });

      if (options.plannerMode) {
        await cdp.send("Runtime.evaluate", {
          expression:
            `window.skfiy.setPlannerProviderSettings({ mode: ${JSON.stringify(options.plannerMode)} })`,
          awaitPromise: true,
          returnByValue: true
        });
      }

      const runs = [];
      for (const run of buildSmokeRunPlan(options)) {
        runs.push(await runSmokeCommand(cdp, options, run, {
          appLaunchViaOpen: evidence.appLaunchViaOpen,
          productPath: evidence.productPath,
          runnerHasTmux: evidence.runnerHasTmux
        }));
      }

      const permissions = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getPermissions()",
        awaitPromise: true,
        returnByValue: true
      });
      const runtimeStatus = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getRuntimeStatus()",
        awaitPromise: true,
        returnByValue: true
      });
      const startupWarnings = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getStartupWarnings()",
        awaitPromise: true,
        returnByValue: true
      });
      const plannerProviderSettings = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getPlannerProviderSettings()",
        awaitPromise: true,
        returnByValue: true
      });
      const appPolicySettings = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getAppPolicySettings()",
        awaitPromise: true,
        returnByValue: true
      });

      evidence.permissions = permissions.result?.value;
      evidence.runtimeStatus = runtimeStatus.result?.value;
      evidence.startupWarnings = startupWarnings.result?.value;
      evidence.plannerProviderSettings = plannerProviderSettings.result?.value;
      evidence.appPolicySettings = appPolicySettings.result?.value;
      evidence.events = cdp.events;
      evidence.runs = options.matrix ? runs : undefined;
      evidence.replayRecords = readReplayRecords(cdp.events);
      evidence.screenshots = await inspectReplayScreenshots(evidence.replayRecords);
      evidence.result = options.matrix
        ? classifyMatrixResult(runs)
        : runs[0]?.result ?? "no-events";
    } finally {
      cdp.close();
    }

    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    if (!options.keepOpen) {
      await quitSkfiy();
      await quitSkfiyGhosttySessions();
      await sleep(700);
      evidence.processesAfterCleanup = await readSkfiyProcesses();
      evidence.skfiyGhosttyProcessesAfterCleanup = await readSkfiyGhosttyProcesses();
    }
    await smokeLock?.release();

    if (options.outputPath) {
      try {
        await writeSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertSmokeReady(options) {
  if (!existsSync(options.appPath)) {
    throw new Error(`App bundle is missing at ${options.appPath}. Run npm run build first.`);
  }

  if (typeof WebSocket !== "function") {
    throw new Error("This smoke script requires a Node runtime with global WebSocket support.");
  }
}

async function launchSkfiy(options) {
  await execFileAsync("open", [
    "-n",
    "-a",
    options.appPath,
    "--args",
    `--remote-debugging-port=${options.port}`
  ]);
}

async function waitForRendererPage(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => {
        if (!response.ok) {
          throw new Error(`CDP returned HTTP ${response.status}.`);
        }

        return response.json();
      });
      const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);

      if (page) {
        return page;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for skfiy renderer on CDP port ${port}.`
      + (lastError instanceof Error ? ` Last error: ${lastError.message}` : "")
  );
}

async function runSmokeCommand(cdp, options, run, context) {
  const startIndex = cdp.events.length;

  await cdp.send("Runtime.evaluate", {
    expression: `window.skfiy.runCommand(${JSON.stringify(run.command)}, { mode: "active" })`,
    awaitPromise: true,
    returnByValue: true
  });
  await sleep(options.settleMs);

  if (run.approvalAction === "deny") {
    await cdp.send("Runtime.evaluate", {
      expression: "window.skfiy.denyTask()",
      awaitPromise: true,
      returnByValue: true
    });
    await sleep(options.settleMs);
  }

  const events = cdp.events.slice(startIndex);
  const replayRecords = readReplayRecords(events);
  const screenshots = await inspectReplayScreenshots(replayRecords);

  return {
    ...run,
    events,
    replayRecords,
    screenshots,
    result: classifySmokeRunEvidence({
      events,
      screenshots,
      requiresComputerUseEvidence: run.requiresComputerUseEvidence,
      ...context
    })
  };
}

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;

  ws.addEventListener("message", (raw) => {
    const message = JSON.parse(raw.data.toString());

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }

      return;
    }

    if (
      message.method === "Runtime.bindingCalled"
      && message.params?.name === "skfiySmokeEvent"
    ) {
      events.push(JSON.parse(message.params.payload));
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    }
  };
}

function installEventSinkExpression() {
  return `(() => {
    if (!window.skfiy) {
      throw new Error("window.skfiy preload API is unavailable.");
    }

    if (!window.__skfiySmokeInstalled) {
      window.__skfiySmokeInstalled = true;
      window.skfiy.onTaskEvent((event) => {
        globalThis.skfiySmokeEvent(JSON.stringify(event));
      });
    }

    return true;
  })()`;
}

function readReplayRecords(events) {
  return events
    .map((event) => event.replayRecord)
    .filter((record) => record && typeof record.screenshotPath === "string");
}

async function inspectReplayScreenshots(records) {
  return Promise.all(records.map(async (record) => {
    try {
      const file = await stat(record.screenshotPath);
      return {
        stage: record.stage,
        path: record.screenshotPath,
        exists: true,
        bytes: file.size,
        nonEmpty: file.size > 0
      };
    } catch (error) {
      return {
        stage: record.stage,
        path: record.screenshotPath,
        exists: false,
        nonEmpty: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
}

async function quitSkfiy() {
  await execFileAsync("osascript", [
    "-e",
    `tell application id "${BUNDLE_IDENTIFIER}" to quit`
  ]).catch(() => undefined);
}

async function quitSkfiyGhosttySessions() {
  const remaining = parseProcessIds(await readSkfiyGhosttyProcesses());
  if (remaining.length > 0) {
    await terminateProcesses(remaining, "SIGTERM");
    await waitForSkfiyGhosttySessionsExit(2_000);
  }

  const stubborn = parseProcessIds(await readSkfiyGhosttyProcesses());
  if (stubborn.length > 0) {
    await terminateProcesses(stubborn, "SIGKILL");
    await waitForSkfiyGhosttySessionsExit(1_000);
  }
}

async function readSkfiyProcesses() {
  return readProcessLines(SKFIY_APP_PROCESS_PATTERN);
}

async function readSkfiyGhosttyProcesses() {
  return filterSkfiyGhosttySessionProcessLines(
    await readProcessLines(SKFIY_GHOSTTY_SESSION_PROCESS_PATTERN)
  );
}

async function readProcessLines(pattern) {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-fl", pattern]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function waitForSkfiyGhosttySessionsExit(timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await readSkfiyGhosttyProcesses()).length === 0) {
      return;
    }

    await sleep(100);
  }
}

async function terminateProcesses(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

await main();
