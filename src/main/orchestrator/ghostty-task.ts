import { classifyTerminalCommand } from "../../shared/risk-policy.js";
import {
  runDesktopActionPlan,
  type DesktopActionExecutor,
  type DesktopActionPlanStepResult
} from "../computer-use/action-runner.js";
import type {
  DesktopAction,
  DesktopActionResult,
  DesktopAppState,
  OpenGhosttySessionResult,
} from "../computer-use/types.js";
import type { GhosttyTaskEvent } from "./events.js";

const GHOSTTY_APP_NAME = "Ghostty";
const GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty";
const SKFIY_GHOSTTY_SESSION_MARKER = "skfiy";
const SKFIY_GHOSTTY_SESSION_TITLE = "skfiy-shell";
const TYPE_SETTLE_WAIT_MS = 90;
const SUBMIT_SETTLE_WAIT_MS = 300;

export interface DesktopApp {
  name: string;
  bundleId: string;
}

export interface DesktopClient extends DesktopActionExecutor {
  listApps(): Promise<DesktopApp[]>;
}

export interface GhosttyTaskOptions {
  approved?: boolean;
  signal?: AbortSignal;
  createScreenshotPath?: (stage: "before" | "after") => string;
}

export async function* runGhosttyCommandTask(
  client: DesktopClient,
  command: string,
  options: GhosttyTaskOptions = {}
): AsyncGenerator<GhosttyTaskEvent> {
  const risk = classifyTerminalCommand(command);

  yield {
    type: "started",
    command,
    risk
  };

  if (risk.requiresApproval) {
    yield {
      type: "approval_required",
      command,
      risk
    };

    if (!options.approved || risk.level === "blocked") {
      return;
    }
  }

  if (isAborted(options.signal)) {
    return;
  }

  yield {
    type: "locating_app",
    appName: GHOSTTY_APP_NAME
  };

  if (isAborted(options.signal)) {
    return;
  }

  const session = readOpenGhosttySessionResult(
    await client.executeAction({ type: "open_ghostty_session", title: SKFIY_GHOSTTY_SESSION_TITLE })
  );
  yield {
    type: "session_opened",
    appName: GHOSTTY_APP_NAME,
    title: session.title,
    pid: session.pid
  };

  if (isAborted(options.signal)) {
    return;
  }

  assertPlanSucceeded(await runDesktopActionPlan(
    client,
    [{ type: "activate_app", bundleId: session.bundleId, pid: session.pid }],
    { signal: options.signal }
  ));
  yield {
    type: "app_activated",
    appName: GHOSTTY_APP_NAME,
    bundleId: session.bundleId,
    pid: session.pid
  };

  if (isAborted(options.signal)) {
    return;
  }

  const before = await observeApp(
    client,
    session.bundleId,
    createScreenshotPath("before", options),
    options.signal,
    0,
    session.pid
  );
  yield {
    type: "screenshot_before",
    path: before.screenshotPath,
    observation: before
  };

  if (isAborted(options.signal)) {
    return;
  }

  assertOwnedGhosttySession(before, session.pid);

  assertPlanSucceeded(await runDesktopActionPlan(
    client,
    [
      { type: "type_text", text: command },
      { type: "wait", ms: TYPE_SETTLE_WAIT_MS }
    ],
    { signal: options.signal }
  ));
  yield {
    type: "typing",
    command
  };

  if (isAborted(options.signal)) {
    return;
  }

  assertPlanSucceeded(await runDesktopActionPlan(
    client,
    [{ type: "press_key", key: "enter" }],
    { signal: options.signal }
  ));
  yield {
    type: "submitted",
    key: "enter"
  };

  if (isAborted(options.signal)) {
    return;
  }

  const after = await observeApp(
    client,
    session.bundleId,
    createScreenshotPath("after", options),
    options.signal,
    SUBMIT_SETTLE_WAIT_MS,
    session.pid
  );
  yield {
    type: "screenshot_after",
    path: after.screenshotPath,
    observation: after
  };

  yield {
    type: "completed",
    command,
    summary: "Command submitted to Ghostty."
  };
}

async function observeApp(
  client: DesktopClient,
  bundleId: string,
  screenshotOutputPath: string,
  signal: AbortSignal | undefined,
  waitMs = 0,
  pid?: number
): Promise<DesktopAppState> {
  const actions: DesktopAction[] = [];

  if (waitMs > 0) {
    actions.push({ type: "wait", ms: waitMs });
  }

  actions.push({
    type: "observe_app",
    bundleId,
    pid,
    screenshotOutputPath
  });

  const results = await runDesktopActionPlan(client, actions, { signal });
  const observeStep = results.find((step) => step.action.type === "observe_app");

  if (!observeStep) {
    throw new Error("Desktop observe action did not produce a result.");
  }

  return readAppStateResult(observeStep);
}

function readAppStateResult(step: DesktopActionPlanStepResult): DesktopAppState {
  const result = step.result;

  if (isDesktopAppState(result)) {
    return result;
  }

  throw new Error("Desktop observe action returned an invalid app state.");
}

function readOpenGhosttySessionResult(result: DesktopActionResult): OpenGhosttySessionResult {
  if (isOpenGhosttySessionResult(result)) {
    if (result.bundleId !== GHOSTTY_BUNDLE_ID) {
      throw new Error("Opened Ghostty session reported an unexpected bundle id.");
    }

    return result;
  }

  if (isFailedActionResult(result)) {
    throw new Error(result.message ?? "Could not open a skfiy Ghostty session.");
  }

  throw new Error("Desktop open Ghostty action returned an invalid session.");
}

function assertPlanSucceeded(results: readonly DesktopActionPlanStepResult[]): void {
  for (const step of results) {
    if (isFailedActionResult(step.result)) {
      throw new Error(step.result.message ?? `Desktop action failed: ${step.action.type}`);
    }
  }
}

function isOpenGhosttySessionResult(
  result: DesktopActionResult
): result is OpenGhosttySessionResult {
  return (
    typeof result === "object"
    && result !== null
    && "opened" in result
    && result.opened === true
    && "bundleId" in result
    && typeof result.bundleId === "string"
    && "title" in result
    && typeof result.title === "string"
    && "pid" in result
    && typeof result.pid === "number"
  );
}

function assertOwnedGhosttySession(observation: DesktopAppState, expectedPid: number): void {
  if (observation.frontmostBundleId && observation.frontmostBundleId !== GHOSTTY_BUNDLE_ID) {
    throw new Error("Observed Ghostty window is not frontmost.");
  }

  const windows = observation.windows ?? [];
  const hasUnsafeWindow = windows.some((window) => {
    const title = window.title?.toLowerCase() ?? "";
    return title.includes("codex");
  });

  if (hasUnsafeWindow) {
    throw new Error("Observed Ghostty window is not a skfiy-owned session.");
  }

  if (observation.pid === expectedPid) {
    return;
  }

  const hasMarkedWindow = windows.some((window) => {
    const title = window.title?.toLowerCase() ?? "";
    return title.includes(SKFIY_GHOSTTY_SESSION_MARKER);
  });

  if (!hasMarkedWindow) {
    throw new Error("Observed Ghostty window is not a skfiy-owned session.");
  }
}

function isFailedActionResult(
  result: DesktopActionResult
): result is { ok: false; message?: string } {
  return (
    typeof result === "object"
    && result !== null
    && "ok" in result
    && result.ok === false
  );
}

function isDesktopAppState(result: DesktopActionResult): result is DesktopAppState {
  return (
    typeof result === "object"
    && result !== null
    && "bundleId" in result
    && "isRunning" in result
    && "isActive" in result
    && "screenshotPath" in result
  );
}

function createScreenshotPath(stage: "before" | "after", options: GhosttyTaskOptions): string {
  return options.createScreenshotPath?.(stage) ?? `/tmp/skfiy-ghostty-${stage}.png`;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
