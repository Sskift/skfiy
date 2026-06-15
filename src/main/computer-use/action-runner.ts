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
  verifyStep?: DesktopActionStepVerifier;
}

export interface DesktopActionPlanStepResult {
  action: DesktopAction;
  result: DesktopActionResult;
  verification?: DesktopActionVerification;
}

export type DesktopActionVerification =
  | { status: "passed"; message?: string }
  | { status: "failed"; reason: string }
  | { status: "needs_user_confirmation"; reason: string };

export interface DesktopActionVerificationContext {
  action: DesktopExecutableAction;
  result: DesktopActionResult;
  stepIndex: number;
  previousResults: readonly DesktopActionPlanStepResult[];
}

export type DesktopActionStepVerifier = (
  context: DesktopActionVerificationContext
) => DesktopActionVerification | Promise<DesktopActionVerification>;

export class DesktopActionVerificationError extends Error {
  readonly stepIndex: number;
  readonly action: DesktopExecutableAction;
  readonly verification: Exclude<DesktopActionVerification, { status: "passed" }>;
  readonly partialResults: DesktopActionPlanStepResult[];

  constructor(options: {
    stepIndex: number;
    action: DesktopExecutableAction;
    verification: Exclude<DesktopActionVerification, { status: "passed" }>;
    partialResults: DesktopActionPlanStepResult[];
  }) {
    super(createVerificationFailureMessage(options.action, options.verification));
    this.name = "DesktopActionVerificationError";
    this.stepIndex = options.stepIndex;
    this.action = options.action;
    this.verification = options.verification;
    this.partialResults = options.partialResults;
  }
}

const MAX_WAIT_MS = 30_000;

export async function runDesktopActionPlan(
  executor: DesktopActionExecutor,
  actions: readonly DesktopAction[],
  options: RunDesktopActionPlanOptions = {}
): Promise<DesktopActionPlanStepResult[]> {
  const results: DesktopActionPlanStepResult[] = [];

  for (const [stepIndex, action] of actions.entries()) {
    throwIfAborted(options.signal);

    if (isWaitAction(action)) {
      results.push({
        action,
        result: await waitForAction(action, options.signal)
      });
      continue;
    }

    const result = await executor.executeAction(action);
    const stepResult: DesktopActionPlanStepResult = {
      action,
      result
    };

    if (options.verifyStep) {
      const verification = await options.verifyStep({
        action,
        result,
        stepIndex,
        previousResults: [...results]
      });
      stepResult.verification = verification;
      results.push(stepResult);

      if (verification.status !== "passed") {
        throw new DesktopActionVerificationError({
          stepIndex,
          action,
          verification,
          partialResults: [...results]
        });
      }

      continue;
    }

    results.push(stepResult);
  }

  return results;
}

function createVerificationFailureMessage(
  action: DesktopExecutableAction,
  verification: Exclude<DesktopActionVerification, { status: "passed" }>
): string {
  const prefix = verification.status === "needs_user_confirmation"
    ? "Desktop action verification needs user confirmation"
    : "Desktop action verification failed";

  return `${prefix} after ${action.type}: ${verification.reason}`;
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
