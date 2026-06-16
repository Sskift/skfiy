import path from "node:path";

export const DEFAULT_PORT = 9244;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_SETTLE_MS = 500;
export const PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> fs -> Finder";
export const FINDER_TARGET_MODES = new Set(["explicit-path", "current-finder-folder"]);
export const EXPECTED_AFTER_TREE = [
  "Code/script.ts",
  "Documents/notes.pdf",
  "Images/photo.png"
];

export function createDefaultFinderSmokeOptions(rootDir) {
  return {
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    keepExisting: false,
    keepOpen: false,
    requirePassed: false,
    targetMode: "explicit-path",
    outputPath: undefined,
    help: false
  };
}

export function parseFinderSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
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
      case "--keep-existing":
        options.keepExisting = true;
        break;
      case "--keep-open":
        options.keepOpen = true;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--current-folder":
        options.targetMode = "current-finder-folder";
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

export function createHelpText(defaults) {
  return `Usage: npm run smoke:finder -- [options]

Runs the packaged skfiy app through a Finder test-folder organization product path.

Options:
  --app <path>          App bundle path. Default: ${defaults.appPath}
  --port <number>       Remote debugging port. Default: ${defaults.port}
  --timeout-ms <number> Renderer wait timeout. Default: ${defaults.timeoutMs}
  --settle-ms <number>  Delay after renderer actions. Default: ${defaults.settleMs}
  --output <path>       Persist smoke evidence JSON.
  --require-passed      Exit non-zero unless the smoke result is passed.
  --current-folder      Open the fixture in Finder and run "整理 Finder 当前文件夹".
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  -h, --help            Show this help.
`;
}

export function classifyFinderSmokeEvidence({
  events = [],
  afterTree = [],
  finderObservation,
  finderSemanticObservation,
  targetMode = "explicit-path",
  fixtureRoot,
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  productPath
}) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (last.status === "approval_required") {
    return "needs-user-confirmation";
  }

  if (hasPermissionBlockedFinderObservation(finderObservation)) {
    return "blocked";
  }

  if (hasPermissionBlockedFinderSemanticObservation(finderSemanticObservation)) {
    return "blocked";
  }

  if (
    last.status === "failed"
    && typeof last.message === "string"
    && isPermissionBlockedMessage(last.message)
  ) {
    return "blocked";
  }

  if (last.status !== "completed") {
    return last.status ?? "failed";
  }

  if (runnerHasTmux || appLaunchViaOpen !== true || productPath !== PRODUCT_PATH) {
    return "failed";
  }

  if (
    !hasExpectedAfterTree(afterTree)
    || !hasPassedFinderObservation(finderObservation)
    || !hasPassedFinderSemanticObservation(finderSemanticObservation, { targetMode, fixtureRoot })
  ) {
    return "failed";
  }

  return "passed";
}

function hasExpectedAfterTree(afterTree) {
  const entries = new Set(Array.isArray(afterTree) ? afterTree : []);
  return EXPECTED_AFTER_TREE.every((entry) => entries.has(entry));
}

function hasPassedFinderObservation(finderObservation) {
  return finderObservation?.result === "passed"
    && typeof finderObservation.screenshotPath === "string"
    && finderObservation.screenshotPath.length > 0
    && finderObservation.frontmostBundleId === "com.apple.finder";
}

function hasPermissionBlockedFinderObservation(finderObservation) {
  return finderObservation?.result === "blocked"
    && typeof finderObservation.reason === "string"
    && isPermissionBlockedMessage(finderObservation.reason);
}

function hasPassedFinderSemanticObservation(finderSemanticObservation, options = {}) {
  const hasBaseEvidence = finderSemanticObservation?.result === "passed"
    && finderSemanticObservation.source === "finder-applescript"
    && finderSemanticObservation.frontmostBundleId === "com.apple.finder"
    && Number.isFinite(finderSemanticObservation.selectedCount);

  if (!hasBaseEvidence) {
    return false;
  }

  if (options.targetMode === "current-finder-folder") {
    return typeof options.fixtureRoot === "string"
      && path.resolve(finderSemanticObservation.targetPath ?? "") === path.resolve(options.fixtureRoot);
  }

  return true;
}

function hasPermissionBlockedFinderSemanticObservation(finderSemanticObservation) {
  return finderSemanticObservation?.result === "blocked"
    && typeof finderSemanticObservation.reason === "string"
    && isPermissionBlockedMessage(finderSemanticObservation.reason);
}

function isPermissionBlockedMessage(message) {
  const normalized = message.toLowerCase();
  return normalized.includes("permission")
    && (
      normalized.includes("accessibility")
      || normalized.includes("screen recording")
      || normalized.includes("automation")
    );
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}
