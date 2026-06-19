#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";

export function createDefaultMoneyRunSupervisionOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    sessionName: "money-run",
    tailLines: 120,
    jsonOutputPath: undefined,
    modulePath: path.join(rootDir, "dist/main/computer-use/tmux-supervisor.js"),
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
    "Usage: npm run smoke:money-run -- [--session <name>] [--tail-lines <count>] [--json-output <path>] [--module <compiled-module>] [--dry-run]",
    "",
    "Read-only tmux supervision scaffold for the money-run session.",
    "It checks for an existing session, summarizes windows and panes, captures recent pane output,",
    "and asks the compiled tmux-supervisor parser for a non-mutating recommendation.",
    "",
    "Options:",
    `  --session <name>       tmux session to supervise (default: ${defaults.sessionName})`,
    `  --tail-lines <count>   recent lines captured per pane (default: ${defaults.tailLines})`,
    "  --json-output <path>   write the report JSON to a file instead of stdout only",
    `  --module <path>        compiled supervisor module (default: ${defaults.modulePath})`,
    "  --dry-run              print the read-only tmux probe plan without running tmux",
    "  --help, -h             show this help",
    "",
    "This script does not create sessions, send keys, kill panes, attach, detach, or otherwise mutate tmux."
  ].join("\n");
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

async function main() {
  const defaults = createDefaultMoneyRunSupervisionOptions();
  const options = parseMoneyRunSupervisionArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createMoneyRunSupervisionHelpText(defaults));
    return;
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      sessionName: options.sessionName,
      mutatesSession: false,
      probePlan: createTmuxProbePlan(options)
    }, null, 2));
    return;
  }

  const report = await runMoneyRunSupervision(options);

  console.log(JSON.stringify(report, null, 2));

  if (typeof options.jsonOutputPath === "string") {
    await writeJsonOutput(options.jsonOutputPath, report);
  }

  process.exitCode = report.status === "observing" ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
