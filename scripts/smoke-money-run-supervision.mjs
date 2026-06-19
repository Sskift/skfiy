#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import { SKFIY_APP_PROCESS_PATTERN } from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";
const PRODUCT_PATH = "LaunchServices -> renderer -> preload -> main -> tmux supervision -> tmux read-only probes";
const DEFAULT_CDP_PORT = 9250;
const WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";

export function createDefaultMoneyRunSupervisionOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    sessionName: "money-run",
    command: "监督 tmux money-run 这个 session",
    port: DEFAULT_CDP_PORT,
    timeoutMs: 12_000,
    settleMs: 500,
    tailLines: 120,
    jsonOutputPath: undefined,
    modulePath: path.join(rootDir, "dist/main/computer-use/tmux-supervisor.js"),
    directTmux: false,
    dryRun: false,
    help: false
  };
}

export function parseMoneyRunSupervisionArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--session":
        options.sessionName = readValue(argv, index, arg);
        options.command = `监督 tmux ${options.sessionName} 这个 session`;
        index += 1;
        break;
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
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
      case "--tail-lines":
        options.tailLines = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--json-output":
        options.jsonOutputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--module":
        options.modulePath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--direct-tmux":
        options.directTmux = true;
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

export function createTmuxProbePlan(options) {
  const sessionName = readSessionName(options);
  const tailLines = readTailLines(options);

  return [
    {
      id: "has-session",
      command: "tmux",
      args: ["has-session", "-t", sessionName],
      mutatesSession: false
    },
    {
      id: "list-windows",
      command: "tmux",
      args: [
        "list-windows",
        "-t",
        sessionName,
        "-F",
        WINDOW_FORMAT
      ],
      mutatesSession: false
    },
    {
      id: "list-panes",
      command: "tmux",
      args: [
        "list-panes",
        "-t",
        sessionName,
        "-s",
        "-F",
        PANE_FORMAT
      ],
      mutatesSession: false
    },
    {
      id: "capture-pane-template",
      command: "tmux",
      args: ["capture-pane", "-p", "-t", "<pane-id>", "-S", `-${tailLines}`],
      mutatesSession: false
    }
  ];
}

export function createMoneyRunSupervisionHelpText(defaults) {
  return [
    "Usage: npm run smoke:money-run -- [--session <name>] [--app <path>] [--tail-lines <count>] [--json-output <path>] [--direct-tmux] [--dry-run]",
    "",
    "Product-path read-only supervision smoke for the money-run session.",
    "By default it launches the compiled skfiy.app, sends the tmux supervision command through",
    "renderer -> preload -> main, approves the read-only tmux probe, and records task events.",
    "",
    "Options:",
    `  --app <path>           Packaged app bundle. Default: ${defaults.appPath}`,
    `  --session <name>       tmux session to supervise (default: ${defaults.sessionName})`,
    `  --port <count>         remote debugging port for skfiy.app (default: ${defaults.port})`,
    `  --timeout-ms <count>   timeout waiting for app/task events (default: ${defaults.timeoutMs})`,
    `  --settle-ms <count>    settle delay after renderer calls (default: ${defaults.settleMs})`,
    `  --tail-lines <count>   recent lines captured per pane (default: ${defaults.tailLines})`,
    "  --json-output <path>   write the report JSON to a file instead of stdout only",
    `  --module <path>        compiled supervisor module (default: ${defaults.modulePath})`,
    "  --direct-tmux          run the old direct tmux diagnostic path without launching skfiy.app",
    "  --dry-run              print the product-path probe plan without launching skfiy.app",
    "  --help, -h             show this help",
    "",
    "This script does not create sessions, send keys, kill panes, attach, detach, or otherwise mutate tmux."
  ].join("\n");
}

export function createMoneyRunProductDryRun(options) {
  return {
    sessionName: readSessionName(options),
    command: options.command,
    appPath: options.appPath,
    launch: formatLaunchCommand(options),
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: PRODUCT_PATH,
    approvalRequired: true,
    mutatesSession: false,
    probePlan: createTmuxProbePlan(options)
  };
}

export async function runMoneyRunSupervision(options, io = createDefaultIo()) {
  const supervisor = await loadSupervisorModule(options.modulePath);
  const sessionName = readSessionName(options);
  const tailLines = readTailLines(options);
  const hasSessionResult = await io.tmux(
    ["has-session", "-t", sessionName],
    { allowFailure: true }
  );

  if (hasSessionResult.exitCode !== 0) {
    return supervisor.createTmuxSupervisionReport({
      sessionName,
      hasSession: false,
      commandError: hasSessionResult.stderr || hasSessionResult.stdout
    });
  }

  const windowsResult = await io.tmux([
    "list-windows",
    "-t",
    sessionName,
    "-F",
    WINDOW_FORMAT
  ]);
  const panesResult = await io.tmux([
    "list-panes",
    "-t",
    sessionName,
    "-s",
    "-F",
    PANE_FORMAT
  ]);
  const panes = supervisor.parseTmuxPaneList(panesResult.stdout);
  const paneTails = {};

  for (const pane of panes) {
    const tailResult = await io.tmux(
      ["capture-pane", "-p", "-t", pane.id, "-S", `-${tailLines}`],
      { allowFailure: true }
    );
    paneTails[pane.id] = tailResult.stdout || tailResult.stderr || "";
  }

  return supervisor.createTmuxSupervisionReport({
    sessionName,
    hasSession: true,
    windowsOutput: windowsResult.stdout,
    panesOutput: panesResult.stdout,
    paneTails
  });
}

function createDefaultIo() {
  return {
    async tmux(args, options = {}) {
      try {
        const result = await execFileAsync("tmux", args, {
          maxBuffer: 4 * 1024 * 1024
        });

        return {
          exitCode: 0,
          stdout: result.stdout,
          stderr: result.stderr
        };
      } catch (error) {
        const result = {
          exitCode: readExitCode(error),
          stdout: typeof error?.stdout === "string" ? error.stdout : "",
          stderr: typeof error?.stderr === "string" ? error.stderr : String(error?.message ?? error)
        };

        if (options.allowFailure) {
          return result;
        }

        throw error;
      }
    }
  };
}

async function loadSupervisorModule(modulePath) {
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch (error) {
    throw new Error(
      `Unable to load compiled tmux supervisor module at ${modulePath}. `
      + "Run npm run build or tsc -p tsconfig.electron.json first, "
      + "or pass --module <path> to a compiled tmux-supervisor.js. "
      + `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];

  if (!value) {
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

function readSessionName(options) {
  if (typeof options.sessionName !== "string" || options.sessionName.trim().length === 0) {
    throw new Error("--session must be a non-empty tmux session name.");
  }

  return options.sessionName;
}

function readTailLines(options) {
  if (!Number.isInteger(options.tailLines) || options.tailLines <= 0) {
    throw new Error("--tail-lines must be a positive integer.");
  }

  return options.tailLines;
}

function readExitCode(error) {
  if (typeof error?.code === "number") {
    return error.code;
  }

  return 1;
}

async function writeJsonOutput(outputPath, report) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

function formatLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

async function runMoneyRunProductSmoke(options) {
  assertMoneyRunProductSmokeReady(options);

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    command: options.command,
    sessionName: readSessionName(options),
    launch: formatLaunchCommand(options),
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: PRODUCT_PATH,
    approvalRequired: true,
    mutatesSession: false,
    probePlan: createTmuxProbePlan(options),
    events: [],
    tmuxSupervisionReport: undefined,
    permissions: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    result: "not-run"
  };
  let smokeLock;
  let launchedSkfiy = false;

  try {
    smokeLock = await acquireSmokeLock({
      rootDir: options.rootDir,
      scriptName: "smoke:money-run"
    });
    await quitSkfiy();
    await sleep(700);
    await launchSkfiy(options);
    launchedSkfiy = true;
    evidence.processesAfterLaunch = await readSkfiyProcesses();

    const page = await waitForRendererPage(options.port, options.timeoutMs);
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);

    try {
      await cdp.send("Runtime.enable");
      await cdp.send("Runtime.addBinding", { name: "skfiyMoneyRunSmokeEvent" });
      await cdp.send("Runtime.evaluate", {
        expression: installEventSinkExpression(),
        awaitPromise: true,
        returnByValue: true
      });
      const startIndex = cdp.events.length;
      await cdp.send("Runtime.evaluate", {
        expression: `window.skfiy.runCommand(${JSON.stringify(options.command)}, { mode: "active" })`,
        awaitPromise: true,
        returnByValue: true
      });
      await waitForTaskStatus(cdp, options.timeoutMs, "approval_required");
      await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.approveTask()",
        awaitPromise: true,
        returnByValue: true
      });
      await waitForTerminalTaskEvent(cdp, options.timeoutMs);

      evidence.events = cdp.events.slice(startIndex);
      evidence.tmuxSupervisionReport = readFinalTmuxSupervisionReport(evidence.events);
      evidence.permissions = await evaluateValue(cdp, "window.skfiy.getPermissions()");
      evidence.runtimeStatus = await evaluateValue(cdp, "window.skfiy.getRuntimeStatus()");
      evidence.startupWarnings = await evaluateValue(cdp, "window.skfiy.getStartupWarnings()");
      evidence.result = classifyMoneyRunProductEvidence(evidence);
    } finally {
      cdp.close();
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (launchedSkfiy) {
      await quitSkfiy();
      await sleep(700);
      evidence.processesAfterCleanup = await readSkfiyProcesses();
    }
    await smokeLock?.release();
  }

  return evidence;
}

function readFinalTmuxSupervisionReport(events) {
  return [...events]
    .reverse()
    .find((event) => event.status === "completed" && event.tmuxSupervisionReport)
    ?.tmuxSupervisionReport;
}

function assertMoneyRunProductSmokeReady(options) {
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
      && message.params?.name === "skfiyMoneyRunSmokeEvent"
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

function installEventSinkExpression() {
  return `(() => {
    if (!window.skfiy) {
      throw new Error("window.skfiy preload API is unavailable.");
    }

    if (!window.__skfiyMoneyRunSmokeInstalled) {
      window.__skfiyMoneyRunSmokeInstalled = true;
      window.skfiy.onTaskEvent((event) => {
        globalThis.skfiyMoneyRunSmokeEvent(JSON.stringify(event));
      });
    }

    return true;
  })()`;
}

async function waitForTaskStatus(cdp, timeoutMs, status) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (cdp.events.some((event) => event.status === status)) {
      return;
    }
    await sleep(100);
  }

  throw new Error(`Timed out waiting for task status ${status}.`);
}

async function waitForTerminalTaskEvent(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = cdp.events.at(-1)?.status;
    if (status === "completed" || status === "failed" || status === "needs_confirmation") {
      return;
    }
    await sleep(100);
  }

  throw new Error("Timed out waiting for money-run supervision to finish.");
}

function classifyMoneyRunProductEvidence(evidence) {
  if (!evidence.events.some((event) => event.status === "approval_required")) {
    return "blocked";
  }

  if (!evidence.events.some((event) => event.status === "observing" && String(event.message).includes("Reading tmux session"))) {
    return "blocked";
  }

  const finalEvent = evidence.events.at(-1);
  if (finalEvent?.status === "completed") {
    const message = String(finalEvent.message ?? "");
    if (message.includes("supervision: observing.")) {
      return "passed";
    }
    if (message.includes("supervision: needs_attention.")) {
      return "needs_attention";
    }
    if (message.includes("supervision: blocked.")) {
      return "blocked";
    }
    return "completed";
  }

  if (finalEvent?.status === "failed") {
    return "blocked";
  }

  return "blocked";
}

async function readSkfiyProcesses() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,command="]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => new RegExp(SKFIY_APP_PROCESS_PATTERN).test(line));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const defaults = createDefaultMoneyRunSupervisionOptions();
  const options = parseMoneyRunSupervisionArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createMoneyRunSupervisionHelpText(defaults));
    return;
  }

  if (options.dryRun) {
    console.log(JSON.stringify(
      options.directTmux
        ? {
            sessionName: options.sessionName,
            mode: "direct-tmux",
            mutatesSession: false,
            probePlan: createTmuxProbePlan(options)
          }
        : createMoneyRunProductDryRun(options),
      null,
      2
    ));
    return;
  }

  const report = options.directTmux
    ? await runMoneyRunSupervision(options)
    : await runMoneyRunProductSmoke(options);

  console.log(JSON.stringify(report, null, 2));

  if (typeof options.jsonOutputPath === "string") {
    await writeJsonOutput(options.jsonOutputPath, report);
  }

  process.exitCode = report.status === "observing" || report.result === "passed" ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
