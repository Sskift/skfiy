import type {
  DesktopAction,
  DesktopActionResult,
  DesktopExecutableAction,
  WaitAction,
  WaitResult
} from "./types.js";

export interface DesktopActionExecutor {
  executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult>;
}

export interface RunDesktopActionPlanOptions {
  signal?: AbortSignal;
}

export interface DesktopActionPlanStepResult {
  action: DesktopAction;
  result: DesktopActionResult;
}

const MAX_WAIT_MS = 30_000;

export async function runDesktopActionPlan(
  executor: DesktopActionExecutor,
  actions: readonly DesktopAction[],
  options: RunDesktopActionPlanOptions = {}
): Promise<DesktopActionPlanStepResult[]> {
  const results: DesktopActionPlanStepResult[] = [];

  for (const action of actions) {
    throwIfAborted(options.signal);

    if (isWaitAction(action)) {
      results.push({
        action,
        result: await waitForAction(action, options.signal)
      });
      continue;
    }

    results.push({
      action,
      result: await executor.executeAction(action)
    });
  }

  return results;
}

function isWaitAction(action: DesktopAction): action is WaitAction {
  return action.type === "wait";
}

function waitForAction(action: WaitAction, signal: AbortSignal | undefined): Promise<WaitResult> {
  const ms = readWaitMs(action.ms);

  if (ms === 0) {
    return Promise.resolve({ ok: true, waitedMs: ms });
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ ok: true, waitedMs: ms });
    }, ms);

    const abort = () => {
      cleanup();
      reject(createAbortError(signal));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function readWaitMs(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("wait.ms must be a finite number.");
  }

  if (value < 0) {
    throw new Error("wait.ms must be greater than or equal to 0.");
  }

  if (value > MAX_WAIT_MS) {
    throw new Error(`wait.ms must be less than or equal to ${MAX_WAIT_MS}.`);
  }

  return value;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

function createAbortError(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason;

  if (isDefaultAbortReason(reason)) {
    return new Error("Desktop action plan aborted.");
  }

  if (reason instanceof Error && reason.message.length > 0) {
    return new Error(`Desktop action plan aborted: ${reason.message}`);
  }

  if (typeof reason === "string" && reason.length > 0) {
    return new Error(`Desktop action plan aborted: ${reason}`);
  }

  return new Error("Desktop action plan aborted.");
}

function isDefaultAbortReason(reason: unknown): boolean {
  return (
    typeof reason === "object"
    && reason !== null
    && "name" in reason
    && "message" in reason
    && reason.name === "AbortError"
    && reason.message === "This operation was aborted"
  );
}
