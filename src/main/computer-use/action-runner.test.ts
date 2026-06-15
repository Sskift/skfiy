import { afterEach, describe, expect, it, vi } from "vitest";
import { runDesktopActionPlan, type DesktopActionExecutor } from "./action-runner";
import type { DesktopAction, DesktopActionResult, DesktopExecutableAction } from "./types";

function createExecutor(
  responses: DesktopActionResult[] = []
): DesktopActionExecutor & { calls: DesktopExecutableAction[] } {
  const calls: DesktopExecutableAction[] = [];

  return {
    calls,
    executeAction: async (action) => {
      calls.push(action);
      return responses.shift() ?? { ok: true };
    }
  };
}

describe("runDesktopActionPlan", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes desktop actions in order and returns each step result", async () => {
    const executor = createExecutor([
      { ok: true, message: "activated" },
      { outputPath: "/tmp/shot.png" },
      { ok: true, message: "clicked" }
    ]);
    const actions: DesktopAction[] = [
      { type: "activate_app", bundleId: "com.mitchellh.ghostty" },
      { type: "screenshot", outputPath: "/tmp/shot.png" },
      { type: "click", x: 12, y: 34 }
    ];

    await expect(runDesktopActionPlan(executor, actions)).resolves.toEqual([
      {
        action: { type: "activate_app", bundleId: "com.mitchellh.ghostty" },
        result: { ok: true, message: "activated" }
      },
      {
        action: { type: "screenshot", outputPath: "/tmp/shot.png" },
        result: { outputPath: "/tmp/shot.png" }
      },
      {
        action: { type: "click", x: 12, y: 34 },
        result: { ok: true, message: "clicked" }
      }
    ]);
    expect(executor.calls).toEqual(actions);
  });

  it("handles wait actions without invoking the executor", async () => {
    vi.useFakeTimers();
    const executor = createExecutor([{ ok: true, message: "typed" }]);
    const actions: DesktopAction[] = [
      { type: "type_text", text: "hello" },
      { type: "wait", ms: 25 },
      { type: "press_key", key: "enter" }
    ];

    const resultPromise = runDesktopActionPlan(executor, actions);
    await vi.advanceTimersByTimeAsync(25);

    await expect(resultPromise).resolves.toEqual([
      {
        action: { type: "type_text", text: "hello" },
        result: { ok: true, message: "typed" }
      },
      {
        action: { type: "wait", ms: 25 },
        result: { ok: true, waitedMs: 25 }
      },
      {
        action: { type: "press_key", key: "enter" },
        result: { ok: true }
      }
    ]);
    expect(executor.calls).toEqual([
      { type: "type_text", text: "hello" },
      { type: "press_key", key: "enter" }
    ]);
  });

  it("rejects invalid wait durations before invoking later actions", async () => {
    const executor = createExecutor();

    await expect(
      runDesktopActionPlan(executor, [
        { type: "wait", ms: Number.NaN },
        { type: "press_key", key: "enter" }
      ])
    ).rejects.toThrow("wait.ms must be a finite number.");
    await expect(runDesktopActionPlan(executor, [{ type: "wait", ms: -1 }])).rejects.toThrow(
      "wait.ms must be greater than or equal to 0."
    );
    await expect(runDesktopActionPlan(executor, [{ type: "wait", ms: 30001 }])).rejects.toThrow(
      "wait.ms must be less than or equal to 30000."
    );
    expect(executor.calls).toEqual([]);
  });

  it("throws a clear error when aborted before the next step starts", async () => {
    const executor = createExecutor([{ ok: true }]);
    const controller = new AbortController();

    await expect(
      runDesktopActionPlan(
        {
          executeAction: async (action) => {
            const result = await executor.executeAction(action);
            controller.abort("user stopped the plan");
            return result;
          }
        },
        [
          { type: "click", x: 1, y: 2 },
          { type: "press_key", key: "enter" }
        ],
        { signal: controller.signal }
      )
    ).rejects.toThrow("Desktop action plan aborted: user stopped the plan");
    expect(executor.calls).toEqual([{ type: "click", x: 1, y: 2 }]);
  });

  it("interrupts a wait when the signal is aborted", async () => {
    vi.useFakeTimers();
    const executor = createExecutor();
    const controller = new AbortController();

    const resultPromise = runDesktopActionPlan(
      executor,
      [
        { type: "wait", ms: 1000 },
        { type: "press_key", key: "enter" }
      ],
      { signal: controller.signal }
    );

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();

    await expect(resultPromise).rejects.toThrow("Desktop action plan aborted.");
    expect(executor.calls).toEqual([]);
  });
});
