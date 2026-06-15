import { describe, expect, it, vi } from "vitest";
import type { DesktopActionResult, DesktopExecutableAction } from "../computer-use/types";
import { runGhosttyCommandTask, type DesktopClient } from "./ghostty-task";

async function collectEvents(
  task: AsyncGenerator<{ type: string }>
): Promise<Array<{ type: string }>> {
  const events: Array<{ type: string }> = [];

  for await (const event of task) {
    events.push(event);
  }

  return events;
}

function createDesktopClient(): DesktopClient & { executeAction: ReturnType<typeof vi.fn> } {
  const client: DesktopClient & { executeAction: ReturnType<typeof vi.fn> } = {
    listApps: vi.fn(async () => [
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty" }
    ]),
    executeAction: vi.fn(async (action: DesktopExecutableAction): Promise<DesktopActionResult> => {
      switch (action.type) {
        case "activate_app":
        case "type_text":
        case "press_key":
          return { ok: true };
        case "observe_app":
          return {
            bundleId: action.bundleId,
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath
          };
        case "screenshot":
          return { outputPath: action.outputPath };
        case "click":
          return { ok: true };
      }
    })
  };

  return client;
}

function createScreenshotPath(stage: "before" | "after"): string {
  return stage === "before" ? "/tmp/before.png" : "/tmp/after.png";
}

describe("runGhosttyCommandTask", () => {
  it("runs a low-risk command in Ghostty and emits task progress events", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(
      runGhosttyCommandTask(client, "pwd", { createScreenshotPath })
    );

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "app_activated",
      "screenshot_before",
      "typing",
      "submitted",
      "screenshot_after",
      "completed"
    ]);
    expect(client.listApps).toHaveBeenCalledTimes(1);
    expect(client.executeAction).toHaveBeenNthCalledWith(1, {
      type: "activate_app",
      bundleId: "com.mitchellh.ghostty"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(2, {
      type: "observe_app",
      bundleId: "com.mitchellh.ghostty",
      screenshotOutputPath: "/tmp/before.png"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(3, {
      type: "type_text",
      text: "pwd"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(4, {
      type: "press_key",
      key: "enter"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(5, {
      type: "observe_app",
      bundleId: "com.mitchellh.ghostty",
      screenshotOutputPath: "/tmp/after.png"
    });
  });

  it("requires approval for high-risk commands before typing or submitting", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(runGhosttyCommandTask(client, "rm -rf ~/Desktop"));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "approval_required"
    ]);
    expect(client.listApps).not.toHaveBeenCalled();
    expect(client.executeAction).not.toHaveBeenCalled();
  });

  it("stops before typing when aborted after the before screenshot", async () => {
    const client = createDesktopClient();
    const controller = new AbortController();
    client.executeAction.mockImplementation(async (action: DesktopExecutableAction) => {
      if (action.type === "observe_app") {
        controller.abort();
        return {
          bundleId: action.bundleId,
          isRunning: true,
          isActive: true,
          screenshotPath: action.screenshotOutputPath
        };
      }

      return { ok: true };
    });

    const events = await collectEvents(
      runGhosttyCommandTask(client, "pwd", {
        createScreenshotPath,
        signal: controller.signal
      })
    );

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "app_activated",
      "screenshot_before"
    ]);
    expect(client.executeAction).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the running app is not the exact Ghostty bundle id", async () => {
    const client = createDesktopClient();
    vi.mocked(client.listApps).mockResolvedValueOnce([
      { name: "Ghostty", bundleId: "com.example.fakeghostty" }
    ]);

    await expect(collectEvents(runGhosttyCommandTask(client, "pwd"))).rejects.toThrow(
      "Ghostty is not running or could not be found."
    );
    expect(client.executeAction).not.toHaveBeenCalled();
  });

  it("fails closed when Ghostty cannot become the focused app", async () => {
    const client = createDesktopClient();
    client.executeAction.mockResolvedValueOnce({
      ok: false,
      message: "Ghostty did not become frontmost."
    });

    await expect(
      collectEvents(runGhosttyCommandTask(client, "pwd", { createScreenshotPath }))
    ).rejects.toThrow("Ghostty did not become frontmost.");
    expect(client.executeAction).toHaveBeenCalledTimes(1);
  });

  it("runs an approved high-risk command after emitting approval context", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(
      runGhosttyCommandTask(client, "sudo spctl --master-disable", {
        approved: true,
        createScreenshotPath
      })
    );

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "approval_required",
      "locating_app",
      "app_activated",
      "screenshot_before",
      "typing",
      "submitted",
      "screenshot_after",
      "completed"
    ]);
    expect(client.executeAction).toHaveBeenCalledWith({
      type: "type_text",
      text: "sudo spctl --master-disable"
    });
    expect(client.executeAction).toHaveBeenCalledWith({
      type: "press_key",
      key: "enter"
    });
  });
});
