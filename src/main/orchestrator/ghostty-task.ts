import { classifyTerminalCommand } from "../../shared/risk-policy.js";
import type { RiskDecision } from "../../shared/types.js";
import { parseTerminalIntent } from "../../shared/terminal-intent.js";
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
const SKFIY_GHOSTTY_INIT_COMMAND = [
  "export SKFIY_SESSION=1",
  "PROMPT='[skfiy] %~ %# '",
  "PS1='[skfiy] \\w \\$ '",
  `printf '\\033]0;${SKFIY_GHOSTTY_SESSION_TITLE}\\007'`
].join("; ");
const SESSION_INIT_SETTLE_WAIT_MS = 90;
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
  input: string,
  options: GhosttyTaskOptions = {}
): AsyncGenerator<GhosttyTaskEvent> {
  const planned = parseTerminalIntent(input);
  const command = planned.ok ? planned.command : input.trim();
  const risk = classifyTerminalCommand(command);
  const effectiveRisk = planned.ok ? risk : blockedDecision(planned.reason);

  yield {
    type: "started",
    command,
    risk: effectiveRisk
  };

  if (effectiveRisk.requiresApproval) {
    yield {
      type: "approval_required",
      command,
      risk: effectiveRisk
    };

    if (!options.approved || effectiveRisk.level === "blocked") {
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

  const activationResults = await runDesktopActionPlan(
    client,
    [{ type: "activate_app", bundleId: session.bundleId, pid: session.pid }],
    { signal: options.signal }
  );
  const activationFailure = readPlanFailure(activationResults);
  if (activationFailure) {
    yield {
      type: "verification_failed",
      stage: "activate",
      reason: activationFailure
    };
    return;
  }

  yield {
    type: "app_activated",
    appName: GHOSTTY_APP_NAME,
    bundleId: session.bundleId,
    pid: session.pid
  };

  if (isAborted(options.signal)) {
    return;
  }

  const initFailure = readPlanFailure(await runDesktopActionPlan(
    client,
    [
      { type: "type_text", text: SKFIY_GHOSTTY_INIT_COMMAND },
      { type: "press_key", key: "enter" },
      { type: "wait", ms: SESSION_INIT_SETTLE_WAIT_MS }
    ],
    { signal: options.signal }
  ));
  if (initFailure) {
    yield {
      type: "verification_failed",
      stage: "initialize",
      reason: initFailure
    };
    return;
  }

  yield {
    type: "session_initialized",
    title: SKFIY_GHOSTTY_SESSION_TITLE,
    marker: SKFIY_GHOSTTY_SESSION_MARKER
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

  const beforeVerificationFailure = readOwnedGhosttySessionFailure(before, session.pid);
  if (beforeVerificationFailure) {
    yield {
      type: "verification_failed",
      stage: "before",
      reason: beforeVerificationFailure
    };
    return;
  }

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

  const afterVerificationFailure = readOwnedGhosttySessionFailure(after, session.pid);
  if (afterVerificationFailure) {
    yield {
      type: "verification_failed",
      stage: "after",
      reason: afterVerificationFailure
    };
    return;
  }

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
  const failure = readPlanFailure(results);
  if (failure) {
    throw new Error(failure);
  }
}

function readPlanFailure(results: readonly DesktopActionPlanStepResult[]): string | undefined {
  for (const step of results) {
    if (isFailedActionResult(step.result)) {
      return step.result.message ?? `Desktop action failed: ${step.action.type}`;
    }
  }

  return undefined;
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

function readOwnedGhosttySessionFailure(
  observation: DesktopAppState,
  expectedPid: number
): string | undefined {
  if (observation.frontmostBundleId && observation.frontmostBundleId !== GHOSTTY_BUNDLE_ID) {
    return "Observed Ghostty window is not frontmost.";
  }

  const windows = observation.windows ?? [];
  const hasUnsafeWindow = windows.some((window) => {
    const title = window.title?.toLowerCase() ?? "";
    return title.includes("codex");
  });

  if (hasUnsafeWindow) {
    return "Observed Ghostty window is not a skfiy-owned session.";
  }

  if (observation.pid === expectedPid) {
    return undefined;
  }

  const hasMarkedWindow = windows.some((window) => {
    const title = window.title?.toLowerCase() ?? "";
    return title.includes(SKFIY_GHOSTTY_SESSION_MARKER);
  });

  if (!hasMarkedWindow) {
    return "Observed Ghostty window is not a skfiy-owned session.";
  }

  return undefined;
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

function blockedDecision(reason: string): RiskDecision {
  return {
    level: "blocked",
    reason,
    requiresApproval: true
  };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
