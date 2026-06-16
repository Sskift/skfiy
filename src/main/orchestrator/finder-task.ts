import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { createFinderOrganizationPlan } from "../computer-use/finder-organizer.js";
import type {
  DesktopActionResult,
  DesktopExecutableAction,
  DesktopAppState,
  FinderSelectionResult
} from "../computer-use/types.js";
import type { RiskDecision } from "../../shared/types.js";

const FINDER_APP_NAME = "Finder";
const FINDER_BUNDLE_ID = "com.apple.finder";
const FINDER_ORGANIZE_PREFIX = "整理 Finder 测试文件夹 ";
const FINDER_ORGANIZE_CURRENT_FOLDER = "整理 Finder 当前文件夹";
const FINDER_ORGANIZE_SELECTED_FOLDER = "整理 Finder 选中文件夹";
const FINDER_CURRENT_FOLDER_COMMAND = "Finder current folder";
const FINDER_SELECTED_FOLDER_COMMAND = "Finder selected folder";

const FINDER_ORGANIZATION_RISK: RiskDecision = {
  level: "medium",
  reason: "Finder organization moves files inside a user-approved folder.",
  requiresApproval: true
};

type FinderOrganizationTarget =
  | { kind: "absolute_path"; rootPath: string }
  | { kind: "current_finder_folder" }
  | { kind: "selected_finder_folder" };

type FinderObservationOutcome =
  | { ok: true; selection?: FinderSelectionResult }
  | { ok: false };

export type FinderTaskEvent =
  | {
      type: "started";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "approval_required";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "locating_app";
      appName: string;
    }
  | {
      type: "app_activated";
      appName: string;
      bundleId: string;
    }
  | {
      type: "screenshot_before";
      path: string;
      observation: DesktopAppState;
    }
  | {
      type: "finder_selection_observed";
      context: FinderSelectionResult;
    }
  | {
      type: "action_verified";
      actionType: "create_folder" | "move_file";
      status: "passed";
      message: string;
    }
  | {
      type: "verification_failed";
      stage: "input" | "file_operation" | "activate" | "observe" | "selection";
      reason: string;
    }
  | {
      type: "completed";
      command: string;
      summary: string;
    };

export interface FinderTaskOptions {
  approved?: boolean;
  desktopClient?: FinderDesktopClient;
  createScreenshotPath?: (stage: "before") => string;
}

export interface FinderDesktopClient {
  executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult>;
  getFinderSelection?(): Promise<FinderSelectionResult>;
}

export async function* runFinderOrganizationTask(
  input: string,
  options: FinderTaskOptions = {}
): AsyncGenerator<FinderTaskEvent> {
  const parsed = parseFinderOrganizationIntent(input);
  const command = parsed.ok ? parsed.command : input.trim();

  yield {
    type: "started",
    command,
    risk: parsed.ok ? FINDER_ORGANIZATION_RISK : blockedDecision(parsed.reason)
  };

  if (!parsed.ok) {
    yield {
      type: "verification_failed",
      stage: "input",
      reason: parsed.reason
    };
    return;
  }

  yield {
    type: "approval_required",
    command: parsed.command,
    risk: FINDER_ORGANIZATION_RISK
  };

  if (!options.approved) {
    return;
  }

  let rootPath: string;

  if (parsed.target.kind === "current_finder_folder" || parsed.target.kind === "selected_finder_folder") {
    yield {
      type: "locating_app",
      appName: FINDER_APP_NAME
    };

    const observation = yield* observeFinder(options);
    if (!observation.ok) {
      return;
    }

    const semanticFolder = resolveSemanticFinderFolder(parsed.target.kind, observation.selection);
    if (!semanticFolder.ok) {
      yield {
        type: "verification_failed",
        stage: "selection",
        reason: semanticFolder.reason
      };
      return;
    }

    rootPath = semanticFolder.rootPath;
  } else {
    rootPath = parsed.target.rootPath;
  }

  const rootStatus = await readDirectoryStatus(rootPath);
  if (!rootStatus.ok) {
    yield {
      type: "verification_failed",
      stage: "file_operation",
      reason: rootStatus.reason
    };
    return;
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const plan = createFinderOrganizationPlan({
    rootPath,
    entries: entries.map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file"
    }))
  });

  if (parsed.target.kind === "absolute_path") {
    yield {
      type: "locating_app",
      appName: FINDER_APP_NAME
    };

    yield* observeFinder(options);
  }

  for (const operation of plan.operations) {
    if (operation.type === "create_folder") {
      await mkdir(operation.path, { recursive: true });
      yield {
        type: "action_verified",
        actionType: "create_folder",
        status: "passed",
        message: `Created folder: ${operation.path}`
      };
      continue;
    }

    if (await pathExists(operation.to)) {
      yield {
        type: "verification_failed",
        stage: "file_operation",
        reason: `Destination already exists: ${operation.to}`
      };
      return;
    }

    await rename(operation.from, operation.to);
    yield {
      type: "action_verified",
      actionType: "move_file",
      status: "passed",
      message: `Moved file: ${operation.from} -> ${operation.to}`
    };
  }

  yield {
    type: "completed",
    command: rootPath,
    summary: "Finder test folder organized."
  };
}

async function* observeFinder(options: FinderTaskOptions): AsyncGenerator<FinderTaskEvent> {
  if (!options.desktopClient) {
    return { ok: true };
  }

  const activationResult = await executeFinderAction(
    options.desktopClient,
    { type: "activate_app", bundleId: FINDER_BUNDLE_ID }
  );

  if (!activationResult.ok) {
    yield {
      type: "verification_failed",
      stage: "activate",
      reason: activationResult.reason
    };
    return { ok: false };
  }

  yield {
    type: "app_activated",
    appName: FINDER_APP_NAME,
    bundleId: FINDER_BUNDLE_ID
  };

  const screenshotOutputPath = options.createScreenshotPath?.("before")
    ?? defaultFinderScreenshotPath();
  const observationResult = await executeFinderAction(
    options.desktopClient,
    {
      type: "observe_app",
      bundleId: FINDER_BUNDLE_ID,
      screenshotOutputPath
    }
  );

  if (!observationResult.ok) {
    yield {
      type: "verification_failed",
      stage: "observe",
      reason: observationResult.reason
    };
    return { ok: false };
  }

  if (!isDesktopAppState(observationResult.result)) {
    yield {
      type: "verification_failed",
      stage: "observe",
      reason: "Finder observation did not return app state."
    };
    return { ok: false };
  }

  yield {
    type: "screenshot_before",
    path: observationResult.result.screenshotPath,
    observation: observationResult.result
  };

  const selection = yield* observeFinderSelection(options.desktopClient);
  return { ok: true, selection };
}

async function* observeFinderSelection(
  desktopClient: FinderDesktopClient
): AsyncGenerator<FinderTaskEvent, FinderSelectionResult | undefined> {
  if (!desktopClient.getFinderSelection) {
    return undefined;
  }

  try {
    const context = await desktopClient.getFinderSelection();
    yield {
      type: "finder_selection_observed",
      context
    };
    return context;
  } catch (error) {
    yield {
      type: "verification_failed",
      stage: "selection",
      reason: readErrorMessage(error)
    };
    return undefined;
  }
}

async function executeFinderAction(
  desktopClient: FinderDesktopClient,
  action: DesktopExecutableAction
): Promise<
  | { ok: true; result: DesktopActionResult }
  | { ok: false; reason: string }
> {
  try {
    const result = await desktopClient.executeAction(action);

    if (isFailedActionResult(result)) {
      return {
        ok: false,
        reason: result.message ?? `Desktop helper could not ${action.type}.`
      };
    }

    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      reason: readErrorMessage(error)
    };
  }
}

function isFailedActionResult(result: DesktopActionResult): result is { ok: false; message?: string } {
  return "ok" in result && result.ok === false;
}

function isDesktopAppState(result: DesktopActionResult): result is DesktopAppState {
  return "bundleId" in result
    && "isRunning" in result
    && "isActive" in result
    && "screenshotPath" in result;
}

function defaultFinderScreenshotPath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", "skfiy", `finder-before-${timestamp}.png`);
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Finder desktop observation failed.";
}

export function parseFinderOrganizationIntent(input: string):
  | { ok: true; command: string; target: FinderOrganizationTarget }
  | { ok: false; reason: string } {
  const trimmed = input.trim();

  if (trimmed === FINDER_ORGANIZE_CURRENT_FOLDER) {
    return {
      ok: true,
      command: FINDER_CURRENT_FOLDER_COMMAND,
      target: { kind: "current_finder_folder" }
    };
  }

  if (trimmed === FINDER_ORGANIZE_SELECTED_FOLDER) {
    return {
      ok: true,
      command: FINDER_SELECTED_FOLDER_COMMAND,
      target: { kind: "selected_finder_folder" }
    };
  }

  if (!trimmed.startsWith(FINDER_ORGANIZE_PREFIX)) {
    return {
      ok: false,
      reason: "Finder organization requires: 整理 Finder 测试文件夹 <absolute-path>, 整理 Finder 当前文件夹, or 整理 Finder 选中文件夹"
    };
  }

  const rootPath = trimmed.slice(FINDER_ORGANIZE_PREFIX.length).trim();
  if (!path.isAbsolute(rootPath)) {
    return {
      ok: false,
      reason: "Finder organization requires an absolute folder path."
    };
  }

  return {
    ok: true,
    command: path.resolve(rootPath),
    target: {
      kind: "absolute_path",
      rootPath: path.resolve(rootPath)
    }
  };
}

function resolveSemanticFinderFolder(
  kind: "current_finder_folder" | "selected_finder_folder",
  selection: FinderSelectionResult | undefined
):
  | { ok: true; rootPath: string }
  | { ok: false; reason: string } {
  if (kind === "current_finder_folder") {
    return resolveCurrentFinderFolder(selection);
  }

  return resolveSelectedFinderFolder(selection);
}

function resolveSelectedFinderFolder(selection: FinderSelectionResult | undefined):
  | { ok: true; rootPath: string }
  | { ok: false; reason: string } {
  const selectedFolders = selection?.selection
    .filter((item) => item.kind === "directory" && path.isAbsolute(item.path))
    ?? [];

  if (selectedFolders.length === 1) {
    return {
      ok: true,
      rootPath: path.resolve(selectedFolders[0].path)
    };
  }

  return {
    ok: false,
    reason: "Finder selected-folder organization needs exactly one selected folder."
  };
}

function resolveCurrentFinderFolder(selection: FinderSelectionResult | undefined):
  | { ok: true; rootPath: string }
  | { ok: false; reason: string } {
  if (selection?.targetPath && path.isAbsolute(selection.targetPath)) {
    return {
      ok: true,
      rootPath: path.resolve(selection.targetPath)
    };
  }

  const selectedFolder = resolveSelectedFinderFolder(selection);

  if (selectedFolder.ok) {
    return selectedFolder;
  }

  return {
    ok: false,
    reason: "Finder current-folder organization needs a Finder window target path or one selected folder."
  };
}

function blockedDecision(reason: string): RiskDecision {
  return {
    level: "blocked",
    reason,
    requiresApproval: true
  };
}

async function readDirectoryStatus(rootPath: string): Promise<
  | { ok: true }
  | { ok: false; reason: string }
> {
  try {
    const root = await stat(rootPath);
    return root.isDirectory()
      ? { ok: true }
      : { ok: false, reason: `Finder organization root is not a directory: ${rootPath}` };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error
        ? error.message
        : `Finder organization root is unavailable: ${rootPath}`
    };
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}
