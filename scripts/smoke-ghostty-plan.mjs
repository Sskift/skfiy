import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const DEFAULT_COMMAND = "打开 Ghostty 执行 pwd 并截图";
export const DEFAULT_PORT = 9233;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_SETTLE_MS = 500;
export const STRICT_APPROVAL_ENV = "SKFIY_BYPASS_APPROVAL=strict";
export const PRODUCT_PATH = "renderer -> preload -> main -> helper -> Ghostty";
export const PLANNER_MODES = new Set(["local-deterministic", "external-cua", "disabled"]);
export const GHOSTTY_FOCUS_STEAL_MESSAGE =
  "smoke:ghostty product path requires frontmost app control. "
  + "Re-run with --allow-focus-steal only when it is acceptable to focus Ghostty/skfiy and use the active desktop.";

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
    command: "在 Ghostty 执行 mkdir skfiy-demo",
    expectedResults: ["needs-user-confirmation"]
  },
  {
    id: "clipboard-read-approval",
    command: "在 Ghostty 执行 pbpaste",
    expectedResults: ["needs-user-confirmation"]
  },
  {
    id: "clipboard-write-approval",
    command: "在 Ghostty 执行 echo skfiy | pbcopy",
    expectedResults: ["needs-user-confirmation"]
  },
  {
    id: "rm-rf-deny",
    command: "在 Ghostty 执行 rm -rf ~/Desktop",
    approvalAction: "deny",
    expectedResults: ["denied"]
  },
  {
    id: "chat-question-route-guard",
    command: "你是谁，能做什么",
    requiresComputerUseEvidence: false,
    expectedResults: ["answered-without-computer-use"]
  },
  {
    id: "unsupported-desktop-route-guard",
    command: "帮我整理一下桌面",
    requiresComputerUseEvidence: false,
    expectedResults: ["needs-clarification"]
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
    allowFocusSteal: false,
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
      case "--allow-focus-steal":
        options.allowFocusSteal = true;
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

export function assertGhosttyFocusStealAllowed(options) {
  const blocker = readGhosttyFocusStealBlocker(options);
  if (!blocker) {
    return;
  }

  throw new Error(blocker);
}

export function readGhosttyFocusStealBlocker(options) {
  if (options.allowFocusSteal === true) {
    return null;
  }

  return GHOSTTY_FOCUS_STEAL_MESSAGE;
}

export function buildSmokeRunPlan(options) {
  if (options.matrix) {
    return GHOSTTY_PRODUCT_SMOKE_MATRIX.map((run) => ({ ...run }));
  }

  return [
    {
      id: "single-command",
      command: options.command,
      expectedResults: ["passed", "blocked", "needs-user-confirmation", "needs-clarification"]
    }
  ];
}

export function classifySmokeResult(events) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (events.some((event) => event?.status === "denied")) {
    return "denied";
  }

  if (events.some((event) => event?.status === "blocked" && isDeniedByRoutePolicyMessage(event.message))) {
    return "denied";
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

  if (last.status === "needs_clarification") {
    return "needs-clarification";
  }

  if (
    last.status === "failed"
    && typeof last.message === "string"
    && isBlockedEnvironmentMessage(last.message)
  ) {
    return "blocked";
  }

  return last.status;
}

export function classifySmokeRunEvidence({
  desktopPreflight,
  events,
  screenshots = [],
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  productPath,
  requiresComputerUseEvidence = true
}) {
  if (desktopPreflight?.result === "blocked") {
    return "blocked";
  }

  const eventResult = classifySmokeResult(events);

  if (eventResult !== "passed") {
    return eventResult;
  }

  if (!requiresComputerUseEvidence) {
    return "answered-without-computer-use";
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

function isBlockedEnvironmentMessage(message) {
  const normalized = message.toLowerCase();
  return (
    isPermissionBlockedMessage(normalized)
    || normalized.includes("desktop session is not controllable")
    || normalized.includes("loginwindow is frontmost")
  );
}

function isDeniedByRoutePolicyMessage(message) {
  return typeof message === "string"
    && message.toLowerCase().includes("route policy blocks destructive or sensitive terminal commands");
}

function isPermissionBlockedMessage(normalizedMessage) {
  return (
    normalizedMessage.includes("permission")
    && (
      normalizedMessage.includes("accessibility")
      || normalizedMessage.includes("screen recording")
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
  return `open -na ${options.appPath} --env ${STRICT_APPROVAL_ENV} --args --remote-debugging-port=${options.port}`;
}

export function createHelpText(defaults) {
  return `Usage: npm run smoke:ghostty -- [options]

Runs the packaged skfiy app through the real product path:
renderer -> preload -> main -> helper -> Ghostty.

Options:
  --app <path>          App bundle path. Default: dist/skfiy.app
  --command <text>      Task command text. Default: ${DEFAULT_COMMAND}
  --matrix              Run the Week 2 Ghostty task matrix: pwd, date, mkdir approval, clipboard approvals, rm deny, and non-terminal route guards.
  --port <number>       Electron remote debugging port. Default: ${defaults.port}
  --timeout-ms <ms>     Wait time for the renderer CDP page. Default: ${defaults.timeoutMs}
  --settle-ms <ms>      Wait after command completion before reading evidence. Default: ${defaults.settleMs}
  --planner-mode <mode> Set planner mode before running: local-deterministic, external-cua, disabled.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  --allow-focus-steal   Allow this field smoke to focus Ghostty/skfiy and use active keyboard input.
  --require-passed      Exit non-zero unless the task or matrix reaches passed.
  --output <path>       Optional: write the full JSON result to a file.
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
