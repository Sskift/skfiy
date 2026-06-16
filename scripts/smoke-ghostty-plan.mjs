import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const DEFAULT_COMMAND = "打开 Ghostty 执行 pwd 并截图";
export const DEFAULT_PORT = 9233;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_SETTLE_MS = 500;
export const PRODUCT_PATH = "renderer -> preload -> main -> helper -> Ghostty";
export const PLANNER_MODES = new Set(["local-deterministic", "external-cua", "disabled"]);

export const GHOSTTY_PRODUCT_SMOKE_MATRIX = [
  {
    id: "pwd-readonly",
    command: "打开 Ghostty 执行 pwd 并截图",
    expectedResults: ["passed", "blocked"]
  },
  {
    id: "date-readonly",
    command: "打开终端运行 date",
    expectedResults: ["passed", "blocked"]
  },
  {
    id: "mkdir-approval",
    command: "创建 skfiy-demo 文件夹",
    expectedResults: ["needs-user-confirmation"]
  },
  {
    id: "clipboard-read-approval",
    command: "pbpaste",
    expectedResults: ["needs-user-confirmation"]
  },
  {
    id: "clipboard-write-approval",
    command: "echo skfiy | pbcopy",
    expectedResults: ["needs-user-confirmation"]
  },
  {
    id: "rm-rf-deny",
    command: "rm -rf ~/Desktop",
    approvalAction: "deny",
    expectedResults: ["denied"]
  }
];

export function createDefaultSmokeOptions(rootDir) {
  return {
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    command: DEFAULT_COMMAND,
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    plannerMode: undefined,
    matrix: false,
    keepExisting: false,
    keepOpen: false,
    requirePassed: false,
    outputPath: undefined,
    help: false
  };
}

export function parseSmokeArgs(argv, defaults) {
  const options = { ...defaults };

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
      case "--matrix":
        options.matrix = true;
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
      case "--output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
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

export function buildSmokeRunPlan(options) {
  if (options.matrix) {
    return GHOSTTY_PRODUCT_SMOKE_MATRIX.map((run) => ({ ...run }));
  }

  return [
    {
      id: "single-command",
      command: options.command,
      expectedResults: ["passed", "blocked", "needs-user-confirmation"]
    }
  ];
}

export function classifySmokeResult(events) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (last.status === "completed") {
    return "passed";
  }

  if (
    last.status === "idle"
    && typeof last.message === "string"
    && last.message.toLowerCase().includes("denied")
  ) {
    return "denied";
  }

  if (last.status === "needs_confirmation" || last.status === "approval_required") {
    return "needs-user-confirmation";
  }

  if (
    last.status === "failed"
    && typeof last.message === "string"
    && isPermissionBlockedMessage(last.message)
  ) {
    return "blocked";
  }

  return last.status;
}

export function classifySmokeRunEvidence({
  events,
  screenshots = [],
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  productPath
}) {
  const eventResult = classifySmokeResult(events);

  if (eventResult !== "passed") {
    return eventResult;
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || productPath !== PRODUCT_PATH
    || !hasNonEmptyScreenshotStage(screenshots, "before")
    || !hasNonEmptyScreenshotStage(screenshots, "after")
    || !hasRequiredActionVerification(events)
  ) {
    return "failed";
  }

  return "passed";
}

function isPermissionBlockedMessage(message) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission")
    && (
      normalized.includes("accessibility")
      || normalized.includes("screen recording")
    )
  );
}

function hasNonEmptyScreenshotStage(screenshots, stage) {
  return screenshots.some((screenshot) =>
    screenshot?.stage === stage
    && screenshot.exists === true
    && screenshot.nonEmpty === true
    && Number.isFinite(screenshot.bytes)
    && screenshot.bytes > 0
  );
}

function hasRequiredActionVerification(events) {
  return hasVerifiedAction(events, "type_text") && hasVerifiedAction(events, "press_key");
}

function hasVerifiedAction(events, actionType) {
  return events.some((event) => {
    const message = typeof event?.message === "string" ? event.message : "";
    return event?.status === "executing"
      && message.includes(`Verified ${actionType}:`)
      && message.toLowerCase().includes("accepted");
  });
}

export function classifyMatrixResult(runs) {
  if (runs.some((run) => !run.expectedResults.includes(run.result))) {
    return "failed";
  }

  if (runs.some((run) => run.result === "blocked")) {
    return "blocked";
  }

  return "passed";
}

export function formatLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

export function createHelpText(defaults) {
  return `Usage: npm run smoke:ghostty -- [options]

Runs the packaged skfiy app through the real product path:
renderer -> preload -> main -> helper -> Ghostty.

Options:
  --app <path>          App bundle path. Default: dist/skfiy.app
  --command <text>      Voice command text. Default: ${DEFAULT_COMMAND}
  --matrix              Run the Week 2 Ghostty task matrix: pwd, date, mkdir approval, clipboard approvals, rm deny.
  --port <number>       Electron remote debugging port. Default: ${defaults.port}
  --timeout-ms <ms>     Wait time for the renderer CDP page. Default: ${defaults.timeoutMs}
  --settle-ms <ms>      Wait after command completion before reading evidence. Default: ${defaults.settleMs}
  --planner-mode <mode> Set planner mode before running: local-deterministic, external-cua, disabled.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  --require-passed      Exit non-zero unless the task or matrix reaches passed.
  --output <path>       Write the complete smoke JSON evidence to this file.
  -h, --help            Show this help.
`;
}

export async function writeSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);
  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
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
