import { describe, expect, it, vi } from "vitest";
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

function createDesktopClient(): DesktopClient {
  return {
    listApps: vi.fn(async () => [
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty" }
    ]),
    activateApp: vi.fn(async () => undefined),
    screenshot: vi
      .fn()
      .mockResolvedValueOnce({ path: "/tmp/before.png" })
      .mockResolvedValueOnce({ path: "/tmp/after.png" }),
    typeText: vi.fn(async () => undefined),
    pressKey: vi.fn(async () => undefined)
  };
}

describe("runGhosttyCommandTask", () => {
  it("runs a low-risk command in Ghostty and emits task progress events", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(runGhosttyCommandTask(client, "pwd"));

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
    expect(client.activateApp).toHaveBeenCalledWith("com.mitchellh.ghostty");
    expect(client.screenshot).toHaveBeenCalledTimes(2);
    expect(client.typeText).toHaveBeenCalledWith("pwd");
    expect(client.pressKey).toHaveBeenCalledWith("enter");
  });

  it("requires approval for high-risk commands before typing or submitting", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(runGhosttyCommandTask(client, "rm -rf ~/Desktop"));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "approval_required"
    ]);
    expect(client.listApps).not.toHaveBeenCalled();
    expect(client.activateApp).not.toHaveBeenCalled();
    expect(client.screenshot).not.toHaveBeenCalled();
    expect(client.typeText).not.toHaveBeenCalled();
    expect(client.pressKey).not.toHaveBeenCalled();
  });

  it("stops before typing when aborted after the before screenshot", async () => {
    const client = createDesktopClient();
    const controller = new AbortController();
    vi.mocked(client.screenshot).mockReset();
    vi.mocked(client.screenshot).mockImplementationOnce(async () => {
      controller.abort();
      return { path: "/tmp/before.png" };
    });

    const events = await collectEvents(
      runGhosttyCommandTask(client, "pwd", { signal: controller.signal })
    );

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "app_activated",
      "screenshot_before"
    ]);
    expect(client.typeText).not.toHaveBeenCalled();
    expect(client.pressKey).not.toHaveBeenCalled();
  });

  it("fails closed when the running app is not the exact Ghostty bundle id", async () => {
    const client = createDesktopClient();
    vi.mocked(client.listApps).mockResolvedValueOnce([
      { name: "Ghostty", bundleId: "com.example.fakeghostty" }
    ]);

    await expect(collectEvents(runGhosttyCommandTask(client, "pwd"))).rejects.toThrow(
      "Ghostty is not running or could not be found."
    );
    expect(client.activateApp).not.toHaveBeenCalled();
  });

  it("runs an approved high-risk command after emitting approval context", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(
      runGhosttyCommandTask(client, "sudo spctl --master-disable", {
        approved: true
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
    expect(client.typeText).toHaveBeenCalledWith("sudo spctl --master-disable");
    expect(client.pressKey).toHaveBeenCalledWith("enter");
  });
});
