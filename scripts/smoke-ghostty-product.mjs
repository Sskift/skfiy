#!/usr/bin/env node
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_APP_PATH = path.join(ROOT_DIR, "dist", "skfiy.app");
const DEFAULT_COMMAND = "打开 Ghostty 执行 pwd 并截图";
const DEFAULT_PORT = 9233;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_SETTLE_MS = 500;
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";
const PLANNER_MODES = new Set(["local-deterministic", "external-cua", "disabled"]);

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    command: options.command,
    plannerMode: options.plannerMode,
    launch: `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`,
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: "renderer -> preload -> main -> helper -> Ghostty",
    events: [],
    permissions: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    plannerProviderSettings: undefined,
    replayRecords: [],
    screenshots: [],
    result: "not-run"
  };

  try {
    assertSmokeReady(options);

    if (!options.keepExisting) {
      await quitSkfiy();
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

      await cdp.send("Runtime.evaluate", {
        expression: `window.skfiy.runCommand(${JSON.stringify(options.command)}, { mode: "active" })`,
        awaitPromise: true,
        returnByValue: true
      });
      await sleep(options.settleMs);

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

      evidence.permissions = permissions.result?.value;
      evidence.runtimeStatus = runtimeStatus.result?.value;
      evidence.startupWarnings = startupWarnings.result?.value;
      evidence.plannerProviderSettings = plannerProviderSettings.result?.value;
      evidence.events = cdp.events;
      evidence.replayRecords = readReplayRecords(cdp.events);
      evidence.screenshots = await inspectReplayScreenshots(evidence.replayRecords);
      evidence.result = classifySmokeResult(cdp.events);
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
      await sleep(700);
      evidence.processesAfterCleanup = await readSkfiyProcesses();
      evidence.skfiyGhosttyProcessesAfterCleanup = await readSkfiyGhosttyProcesses();
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function parseArgs(argv) {
  const options = {
    appPath: DEFAULT_APP_PATH,
    command: DEFAULT_COMMAND,
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    plannerMode: undefined,
    keepExisting: false,
    keepOpen: false,
    requirePassed: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--command":
        options.command = readValue(argv, index, arg);
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
      case "--settle-ms":
        options.settleMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--planner-mode":
        options.plannerMode = readPlannerMode(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--keep-existing":
        options.keepExisting = true;
        break;
      case "--keep-open":
        options.keepOpen = true;
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

function readPlannerMode(value, name) {
  if (!PLANNER_MODES.has(value)) {
    throw new Error(
      `${name} must be one of ${Array.from(PLANNER_MODES).join(", ")}.`
    );
  }

  return value;
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
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

function classifySmokeResult(events) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (last.status === "completed") {
    return "passed";
  }

  if (last.status === "needs_confirmation" || last.status === "approval_required") {
    return "needs-user-confirmation";
  }

  if (
    last.status === "failed"
    && typeof last.message === "string"
    && last.message.toLowerCase().includes("accessibility")
  ) {
    return "blocked";
  }

  return last.status;
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

async function readSkfiyProcesses() {
  return readProcessLines("dist/skfiy.app|/skfiy.app/Contents/MacOS|Electron.*skfiy");
}

async function readSkfiyGhosttyProcesses() {
  return readProcessLines("/Applications/Ghostty.app/Contents/MacOS/ghostty --title=skfiy-shell");
}

async function readProcessLines(pattern) {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-fl", pattern]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printHelp() {
  process.stdout.write(`Usage: npm run smoke:ghostty -- [options]

Runs the packaged skfiy app through the real product path:
renderer -> preload -> main -> helper -> Ghostty.

Options:
  --app <path>          App bundle path. Default: dist/skfiy.app
  --command <text>      Voice command text. Default: ${DEFAULT_COMMAND}
  --port <number>       Electron remote debugging port. Default: ${DEFAULT_PORT}
  --timeout-ms <ms>     Wait time for the renderer CDP page. Default: ${DEFAULT_TIMEOUT_MS}
  --settle-ms <ms>      Wait after command completion before reading evidence. Default: ${DEFAULT_SETTLE_MS}
  --planner-mode <mode> Set planner mode before running: local-deterministic, external-cua, disabled.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  --require-passed      Exit non-zero unless the task reaches completed.
  -h, --help            Show this help.
`);
}

await main();
