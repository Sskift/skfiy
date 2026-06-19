import path from "node:path";

export const DEFAULT_PORT = 9244;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_SETTLE_MS = 500;
export const PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> fs -> Finder";
export const DRAG_PROBE_PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder";
export const ITEM_DRAG_DROP_PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder";
export const FINDER_TARGET_MODES = new Set([
  "explicit-path",
  "current-finder-folder",
  "selected-finder-folder",
  "drag-probe",
  "item-drag-drop"
]);
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
    targetDir: undefined,
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
      case "--selected-folder":
        options.targetMode = "selected-finder-folder";
        break;
      case "--drag-probe":
        options.targetMode = "drag-probe";
        break;
      case "--item-drag-drop":
        options.targetMode = "item-drag-drop";
        break;
      case "--target-dir":
        options.targetDir = path.resolve(readValue(argv, index, arg));
        index += 1;
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
  --selected-folder     Select the fixture in Finder and run "整理 Finder 选中文件夹".
  --drag-probe          Open the fixture in Finder, run a helper drag probe, then organize it.
  --item-drag-drop      Open the fixture in Finder, drag photo.png into Images, then organize it.
  --target-dir <path>   Create the isolated Finder fixture inside this existing directory.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  -h, --help            Show this help.
`;
}

export function createFinderTargetDirSafetyEvidence({ fixtureRoot, targetDir } = {}) {
  if (typeof targetDir !== "string") {
    return {
      result: "not-applicable",
      fixtureInsideTargetDir: false
    };
  }

  const normalizedTargetDir = path.resolve(targetDir);
  const normalizedFixtureRoot = typeof fixtureRoot === "string"
    ? path.resolve(fixtureRoot)
    : undefined;
  const fixtureInsideTargetDir = typeof normalizedFixtureRoot === "string"
    && isPathInsideDirectory(normalizedFixtureRoot, normalizedTargetDir);

  return {
    result: fixtureInsideTargetDir ? "passed" : "failed",
    targetDir: normalizedTargetDir,
    fixtureRoot: normalizedFixtureRoot,
    fixtureInsideTargetDir
  };
}

export async function withSmokeTimeout(promise, timeoutMs, label) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseProcessIds(lines) {
  return lines.flatMap((line) => {
    const match = /^(\d+)\s+/.exec(line);
    if (!match) {
      return [];
    }

    return [Number(match[1])];
  });
}

export function classifyFinderSmokeEvidence({
  events = [],
  afterTree = [],
  finderObservation,
  finderSemanticObservation,
  finderPlanPreview,
  finderPlanConfirmation,
  finderDragProbe,
  finderItemDragDrop,
  permissions,
  targetMode = "explicit-path",
  targetDir,
  targetDirSafety,
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

  if (hasPermissionBlockedFinderDragProbe(finderDragProbe)) {
    return "blocked";
  }

  if (hasPermissionBlockedFinderItemDragDrop(finderItemDragDrop)) {
    return "blocked";
  }

  if (
    last.status === "failed"
    && typeof last.message === "string"
    && isPermissionBlockedMessage(last.message)
  ) {
    return "blocked";
  }

  if (hasBlockedEnvironmentEvent(events)) {
    return "blocked";
  }

  if (last.status === "executing" && hasDeniedComputerUsePermission(permissions)) {
    return "blocked";
  }

  if (last.status !== "completed") {
    return last.status ?? "failed";
  }

  if (typeof targetDir === "string") {
    const safetyTargetDir = typeof targetDirSafety?.targetDir === "string"
      ? targetDirSafety.targetDir
      : targetDir;

    if (
      targetDirSafety?.result !== "passed"
      || targetDirSafety.fixtureInsideTargetDir !== true
      || typeof fixtureRoot !== "string"
      || !isPathInsideDirectory(fixtureRoot, safetyTargetDir)
    ) {
      return "failed";
    }
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || productPath !== readFinderProductPath(targetMode)
  ) {
    return "failed";
  }

  if (
    !hasExpectedAfterTree(afterTree)
    || !hasPassedFinderObservation(finderObservation)
    || !hasPassedFinderSemanticObservation(finderSemanticObservation, { targetMode, fixtureRoot })
    || !hasPassedFinderPlanPreview(finderPlanPreview, { fixtureRoot })
    || !hasExpectedFinderPlanConfirmation(finderPlanConfirmation, targetMode)
    || !hasExpectedFinderDragProbe(finderDragProbe, targetMode)
    || !hasExpectedFinderItemDragDrop(finderItemDragDrop, targetMode)
  ) {
    return "failed";
  }

  return "passed";
}

export function createPermissionBlockedFinderEvidence(permissions) {
  if (!hasDeniedComputerUsePermission(permissions)) {
    return undefined;
  }

  const reasons = [
    readPermissionStateReason(permissions?.screenRecording, "Screen Recording"),
    readPermissionStateReason(permissions?.accessibility, "Accessibility")
  ].filter(Boolean);

  return {
    result: "blocked",
    reason: `Finder Computer Use permission blocked: ${reasons.join("; ")}.`
  };
}

export function createBlockedEnvironmentFinderEvidence(events) {
  const blockedEvent = Array.isArray(events)
    ? events.find((event) =>
        typeof event?.message === "string"
          && isBlockedEnvironmentMessage(event.message)
      )
    : undefined;

  if (!blockedEvent) {
    return undefined;
  }

  return {
    result: "blocked",
    reason: `Finder Computer Use environment blocked: ${blockedEvent.message}`
  };
}

export function readFinderProductPath(targetMode) {
  if (targetMode === "drag-probe") {
    return DRAG_PROBE_PRODUCT_PATH;
  }

  if (targetMode === "item-drag-drop") {
    return ITEM_DRAG_DROP_PRODUCT_PATH;
  }

  return PRODUCT_PATH;
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

  if (options.targetMode === "selected-finder-folder") {
    return typeof options.fixtureRoot === "string"
      && Array.isArray(finderSemanticObservation.selectedItems)
      && finderSemanticObservation.selectedItems.some((item) => (
        item?.kind === "directory"
        && typeof item.path === "string"
        && path.resolve(item.path) === path.resolve(options.fixtureRoot)
      ));
  }

  if (options.targetMode === "drag-probe" || options.targetMode === "item-drag-drop") {
    return typeof options.fixtureRoot !== "string"
      || typeof finderSemanticObservation.targetPath !== "string"
      || path.resolve(finderSemanticObservation.targetPath) === path.resolve(options.fixtureRoot);
  }

  return true;
}

function hasPermissionBlockedFinderSemanticObservation(finderSemanticObservation) {
  return finderSemanticObservation?.result === "blocked"
    && typeof finderSemanticObservation.reason === "string"
    && isPermissionBlockedMessage(finderSemanticObservation.reason);
}

function hasPassedFinderPlanPreview(finderPlanPreview, options = {}) {
  if (
    finderPlanPreview?.result !== "passed"
    || typeof finderPlanPreview.rootPath !== "string"
    || !Number.isFinite(finderPlanPreview.operationCount)
    || finderPlanPreview.operationCount <= 0
    || finderPlanPreview.destructiveOperationCount !== 0
    || !Array.isArray(finderPlanPreview.createFolders)
    || !Array.isArray(finderPlanPreview.moveFiles)
    || finderPlanPreview.moveFiles.length === 0
  ) {
    return false;
  }

  if (
    typeof options.fixtureRoot === "string"
    && path.resolve(finderPlanPreview.rootPath) !== path.resolve(options.fixtureRoot)
  ) {
    return false;
  }

  const movedBasenames = new Set(finderPlanPreview.moveFiles.map((move) => path.basename(move?.from ?? "")));
  return ["photo.png", "notes.pdf", "script.ts"].every((name) => movedBasenames.has(name));
}

function hasExpectedFinderPlanConfirmation(finderPlanConfirmation, targetMode) {
  if (targetMode !== "current-finder-folder" && targetMode !== "selected-finder-folder") {
    return true;
  }

  return finderPlanConfirmation?.result === "passed"
    && finderPlanConfirmation.confirmedAfterPreview === true
    && typeof finderPlanConfirmation.reason === "string"
    && finderPlanConfirmation.reason.includes("confirmation after plan preview");
}

function hasExpectedFinderDragProbe(finderDragProbe, targetMode) {
  if (targetMode !== "drag-probe") {
    return true;
  }

  return finderDragProbe?.result === "passed"
    && finderDragProbe.source === "finder-hid-drag"
    && finderDragProbe.frontmostBundleId === "com.apple.finder";
}

function hasPermissionBlockedFinderDragProbe(finderDragProbe) {
  return finderDragProbe?.result === "blocked"
    && typeof finderDragProbe.reason === "string"
    && isPermissionBlockedMessage(finderDragProbe.reason);
}

function hasExpectedFinderItemDragDrop(finderItemDragDrop, targetMode) {
  if (targetMode !== "item-drag-drop") {
    return true;
  }

  return finderItemDragDrop?.result === "passed"
    && finderItemDragDrop.source === "finder-applescript-layout+hid-drag"
    && finderItemDragDrop.frontmostBundleId === "com.apple.finder"
    && finderItemDragDrop.movedItem === "photo.png"
    && finderItemDragDrop.targetItem === "Images";
}

function hasPermissionBlockedFinderItemDragDrop(finderItemDragDrop) {
  return finderItemDragDrop?.result === "blocked"
    && typeof finderItemDragDrop.reason === "string"
    && isPermissionBlockedMessage(finderItemDragDrop.reason);
}

function hasDeniedComputerUsePermission(permissions) {
  return permissions?.screenRecording?.state === "denied"
    || permissions?.accessibility?.state === "denied";
}

function readPermissionStateReason(permission, label) {
  const state = typeof permission?.state === "string" ? permission.state : "";
  if (state !== "denied") {
    return undefined;
  }

  return `${label} permission is denied`;
}

function isPathInsideDirectory(childPath, parentDir) {
  const relativePath = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return relativePath.length > 0
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath);
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

function hasBlockedEnvironmentEvent(events) {
  return events.some((event) =>
    typeof event?.message === "string"
    && isBlockedEnvironmentMessage(event.message)
  );
}

function isBlockedEnvironmentMessage(message) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("desktop session is not controllable")
    || normalized.includes("loginwindow is frontmost")
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
