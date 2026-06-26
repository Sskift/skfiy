#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import { filterSkfiyAppProcessLines } from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";
const DEFAULT_PORT = 9257;
const PRODUCT_PATH = [
  "LaunchServices",
  "renderer preload",
  "main automation monitor manager",
  "tmux read-only probes",
  "persisted automation-monitors.json",
  "Dashboard snapshot"
].join(" -> ");

const DEFAULT_OPTIONS = {
  appPath: path.join(ROOT_DIR, "dist", "skfiy.app"),
  sessionName: "money-run-goal",
  label: "money-run goal",
  intervalMs: 30_000,
  port: DEFAULT_PORT,
  timeoutMs: 12_000,
  tickWaitMs: 34_000,
  outputPath: undefined,
  requirePassed: false,
  help: false
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(createHelpText());
    return;
  }

  const evidence = await runAutomationMonitorSmoke(options);
  await writeJsonArtifact(evidence, options.outputPath);

  if (options.requirePassed && evidence.result !== "passed") {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--session":
        options.sessionName = readValue(argv, index, arg);
        options.label = options.sessionName;
        index += 1;
        break;
      case "--label":
        options.label = readValue(argv, index, arg);
        index += 1;
        break;
      case "--interval-ms":
        options.intervalMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--port":
        options.port = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--tick-wait-ms":
        options.tickWaitMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--output":
      case "--json-output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function runAutomationMonitorSmoke(options) {
  assertReady(options);
  const statePath = createAutomationMonitorStatePath(os.homedir());
  const monitorId = `tmux-session:${options.sessionName}`;
  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    artifactPath: options.outputPath,
    productPath: PRODUCT_PATH,
    appLaunchViaOpen: true,
    launch: formatLaunchCommand(options),
    sessionName: options.sessionName,
    monitorId,
    intervalMs: options.intervalMs,
    tickWaitMs: options.tickWaitMs,
    statePath,
    mutatesSession: false,
    requirePassed: options.requirePassed === true,
    tmuxBefore: undefined,
    tmuxAfter: undefined,
    initialSnapshot: undefined,
    afterUpsertSnapshot: undefined,
    afterTickSnapshot: undefined,
    persistedState: undefined,
    processesAfterLaunch: undefined,
    processesAfterCleanup: undefined,
    checkCountAdvancedByScheduler: false,
    tmuxSessionUnchanged: false,
    result: "not-run"
  };
  let lock;
  let launched = false;

  try {
    lock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:automation-monitor"
    });
    await quitSkfiy();
    await sleep(700);

    evidence.tmuxBefore = await readTmuxSessionState(options.sessionName);
    await launchSkfiy(options);
    launched = true;
    evidence.processesAfterLaunch = await readSkfiyProcesses();

    const page = await waitForRendererPage(options.port, options.timeoutMs);
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);

    try {
      await cdp.send("Runtime.enable");
      await evaluateValue(cdp, "Boolean(window.skfiy && window.skfiy.upsertTmuxMonitor)");
      evidence.initialSnapshot = await evaluateValue(cdp, "window.skfiy.getAutomationMonitors()");
      evidence.afterUpsertSnapshot = await evaluateValue(
        cdp,
        `window.skfiy.upsertTmuxMonitor(${JSON.stringify({
          sessionName: options.sessionName,
          label: options.label,
          intervalMs: options.intervalMs,
          enabled: true
        })})`
      );
      await sleep(options.tickWaitMs);
      evidence.afterTickSnapshot = await evaluateValue(cdp, "window.skfiy.getAutomationMonitors()");
    } finally {
      cdp.close();
    }

    evidence.persistedState = await readPersistedState(statePath);
    evidence.tmuxAfter = await readTmuxSessionState(options.sessionName);
    evidence.checkCountAdvancedByScheduler = didSchedulerAdvance({
      monitorId,
      before: evidence.afterUpsertSnapshot,
      after: evidence.afterTickSnapshot
    });
    evidence.tmuxSessionUnchanged = evidence.tmuxBefore?.stableStdout === evidence.tmuxAfter?.stableStdout;
    evidence.result = classifyEvidence(evidence);
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (launched) {
      await quitSkfiy();
      await quitSkfiy();
      await sleep(700);
      evidence.processesAfterCleanup = await readSkfiyProcesses();
    }
    await lock?.release();
  }

  return evidence;
}

function classifyEvidence(evidence) {
  const monitor = findMonitor(evidence.afterTickSnapshot, evidence.monitorId);
  const persistedMonitor = findMonitor(evidence.persistedState, evidence.monitorId);
  const status = monitor?.status;

  if (!monitor) {
    return "failed";
  }

  if (evidence.afterTickSnapshot?.scheduler?.state !== "active") {
    return "failed";
  }

  if (evidence.afterTickSnapshot?.scheduler?.scope !== "app-process") {
    return "failed";
  }

  if (evidence.afterTickSnapshot?.scheduler?.mutatesSession !== false) {
    return "failed";
  }

  if (!persistedMonitor) {
    return "failed";
  }

  if (monitor.schedulerState !== "active" || monitor.mutatesSession !== false) {
    return "failed";
  }

  if (typeof monitor.lastResult !== "string") {
    return "failed";
  }

  if (!evidence.checkCountAdvancedByScheduler) {
    return "failed";
  }

  if (evidence.tmuxSessionUnchanged !== true) {
    return "failed";
  }

  return status === "observing" || status === "needs_attention" ? "passed" : "failed";
}

function didSchedulerAdvance({ monitorId, before, after }) {
  const beforeCount = findMonitor(before, monitorId)?.checkCount;
  const afterCount = findMonitor(after, monitorId)?.checkCount;

  return (
    typeof beforeCount === "number"
    && typeof afterCount === "number"
    && afterCount > beforeCount
  );
}

function findMonitor(snapshot, monitorId) {
  return Array.isArray(snapshot?.monitors)
    ? snapshot.monitors.find((monitor) => monitor.id === monitorId)
    : undefined;
}

async function readPersistedState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readTmuxSessionState(sessionName) {
  const result = await execFileAsync("tmux", [
    "list-panes",
    "-t",
    sessionName,
    "-s",
    "-F",
    "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}"
  ]);

  return {
    command: "tmux list-panes",
    exitCode: 0,
    stdout: result.stdout,
    stableStdout: readStablePaneTopology(result.stdout),
    stderr: result.stderr
  };
}

function readStablePaneTopology(stdout) {
  return String(stdout)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t").slice(0, 9).join("\t"))
    .join("\n");
}

function assertReady(options) {
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

async function quitSkfiy() {
  await execFileAsync("osascript", [
    "-e",
    `tell application id "${BUNDLE_IDENTIFIER}" to quit`
  ]).catch(() => undefined);
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

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  ws.addEventListener("message", (raw) => {
    const message = JSON.parse(raw.data.toString());

    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
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

async function evaluateValue(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }

  return response.result?.value;
}

async function readSkfiyProcesses() {
  const result = await execFileAsync("ps", ["-axo", "pid=,command="]).catch((error) => ({
    stdout: error.stdout ?? "",
    stderr: error.stderr ?? error.message
  }));

  return filterSkfiyAppProcessLines(String(result.stdout).split("\n").filter(Boolean));
}

async function writeJsonArtifact(report, outputPath) {
  const content = `${JSON.stringify(report, null, 2)}\n`;

  if (!outputPath) {
    process.stdout.write(content);
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
}

function createAutomationMonitorStatePath(homeDir) {
  return path.join(homeDir, "Library", "Application Support", "skfiy", "automation-monitors.json");
}

function formatLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }
  return value;
}

function readPositiveInteger(value, arg) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${arg} must be a positive integer.`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHelpText() {
  return `Usage: npm run smoke:automation-monitor -- [options]

Runs the packaged skfiy app through a real skfiy-owned automation monitor:

  --app <path>          App bundle path. Default: dist/skfiy.app
  --session <name>      tmux session to monitor. Default: money-run-goal
  --interval-ms <ms>    Monitor interval. Values below 30000 are normalized by skfiy.
  --tick-wait-ms <ms>   Time to wait for one scheduler tick. Default: 34000
  --output <path>       Write JSON evidence to a file.
  --require-passed      Exit non-zero unless scheduler evidence passed.
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
