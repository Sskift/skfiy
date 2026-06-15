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

function createDesktopClient(): DesktopClient & {
  executeAction: ReturnType<typeof vi.fn>;
  ocrImage: ReturnType<typeof vi.fn>;
} {
  const client: DesktopClient & {
    executeAction: ReturnType<typeof vi.fn>;
    ocrImage: ReturnType<typeof vi.fn>;
  } = {
    listApps: vi.fn(async () => [
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty" }
    ]),
    ocrImage: vi.fn(async () => ({ labels: [] })),
    executeAction: vi.fn(async (action: DesktopExecutableAction): Promise<DesktopActionResult> => {
      switch (action.type) {
        case "open_ghostty_session":
          return {
            bundleId: "com.mitchellh.ghostty",
            title: "skfiy-shell",
            pid: 54502,
            opened: true
          };
        case "activate_app":
        case "type_text":
        case "press_key":
          return { ok: true };
        case "observe_app":
          return {
            bundleId: action.bundleId,
            pid: action.pid,
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.mitchellh.ghostty",
            accessibilityTrusted: true,
            windows: [
              {
                title: "skfiy-shell",
                layer: 0,
                bounds: { x: 10, y: 20, width: 640, height: 480 }
              }
            ]
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
      "session_opened",
      "app_activated",
      "session_initialized",
      "screenshot_before",
      "typing",
      "submitted",
      "screenshot_after",
      "completed"
    ]);
    expect(events.find((event) => event.type === "session_initialized")).toMatchObject({
      type: "session_initialized",
      title: "skfiy-shell",
      marker: "skfiy"
    });
    expect(events.find((event) => event.type === "screenshot_before")).toMatchObject({
      type: "screenshot_before",
      path: "/tmp/before.png",
      observation: {
        screenshotPath: "/tmp/before.png",
        pid: 54502,
        frontmostBundleId: "com.mitchellh.ghostty",
        accessibilityTrusted: true,
        windows: [
          {
            title: "skfiy-shell",
            layer: 0,
            bounds: { x: 10, y: 20, width: 640, height: 480 }
          }
        ]
      }
    });
    expect(events.find((event) => event.type === "screenshot_after")).toMatchObject({
      type: "screenshot_after",
      path: "/tmp/after.png",
      observation: {
        screenshotPath: "/tmp/after.png",
        accessibilityTrusted: true
      }
    });
    expect(client.listApps).not.toHaveBeenCalled();
    expect(client.executeAction).toHaveBeenNthCalledWith(1, {
      type: "open_ghostty_session",
      title: "skfiy-shell"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(2, {
      type: "activate_app",
      bundleId: "com.mitchellh.ghostty",
      pid: 54502
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(3, {
      type: "type_text",
      text: expect.stringContaining("skfiy-shell")
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(4, {
      type: "press_key",
      key: "enter"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(5, {
      type: "observe_app",
      bundleId: "com.mitchellh.ghostty",
      pid: 54502,
      screenshotOutputPath: "/tmp/before.png"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(6, {
      type: "type_text",
      text: "pwd"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(7, {
      type: "press_key",
      key: "enter"
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(8, {
      type: "observe_app",
      bundleId: "com.mitchellh.ghostty",
      pid: 54502,
      screenshotOutputPath: "/tmp/after.png"
    });
  });

  it("adds OCR labels to screenshot observations without turning OCR into a desktop action", async () => {
    const client = createDesktopClient();
    client.ocrImage.mockResolvedValue({
      labels: [
        {
          text: "pwd",
          confidence: 0.88,
          bounds: { x: 36, y: 88, width: 42, height: 18 }
        }
      ]
    });

    const events = await collectEvents(
      runGhosttyCommandTask(client, "pwd", { createScreenshotPath })
    );

    expect(events.find((event) => event.type === "screenshot_before")).toMatchObject({
      observation: {
        ocrLabels: [
          {
            text: "pwd",
            confidence: 0.88,
            bounds: { x: 36, y: 88, width: 42, height: 18 }
          }
        ]
      }
    });
    expect(client.ocrImage).toHaveBeenCalledWith("/tmp/before.png");
    expect(client.ocrImage).toHaveBeenCalledWith("/tmp/after.png");
    expect(client.executeAction).not.toHaveBeenCalledWith({
      type: "ocr_image",
      inputPath: "/tmp/before.png"
    });
  });

  it("initializes the skfiy shell marker before observing or typing the user command", async () => {
    const client = createDesktopClient();

    await collectEvents(runGhosttyCommandTask(client, "pwd", { createScreenshotPath }));

    const actions = client.executeAction.mock.calls.map(([action]) => action);
    const initIndex = actions.findIndex(
      (action) => action.type === "type_text" && action.text.includes("SKFIY_SESSION=1")
    );
    const beforeObserveIndex = actions.findIndex(
      (action) => action.type === "observe_app" && action.screenshotOutputPath === "/tmp/before.png"
    );
    const userTypeIndex = actions.findIndex(
      (action) => action.type === "type_text" && action.text === "pwd"
    );

    expect(initIndex).toBeGreaterThan(-1);
    expect(beforeObserveIndex).toBeGreaterThan(initIndex);
    expect(userTypeIndex).toBeGreaterThan(beforeObserveIndex);
  });

  it("plans a voice request into the terminal command before typing", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(
      runGhosttyCommandTask(client, "打开 Ghostty 执行 pwd 并截图", { createScreenshotPath })
    );

    expect(events[0]).toMatchObject({
      type: "started",
      command: "pwd"
    });
    expect(client.executeAction).toHaveBeenCalledWith({
      type: "type_text",
      text: "pwd"
    });
    expect(client.executeAction).not.toHaveBeenCalledWith({
      type: "type_text",
      text: "打开 Ghostty 执行 pwd 并截图"
    });
  });

  it("blocks unrecognized natural language before opening Ghostty", async () => {
    const client = createDesktopClient();

    const events = await collectEvents(
      runGhosttyCommandTask(client, "帮我整理一下桌面", { createScreenshotPath })
    );

    expect(events.map((event) => event.type)).toEqual(["started", "approval_required"]);
    expect(events[0]).toMatchObject({
      type: "started",
      risk: {
        level: "blocked"
      }
    });
    expect(client.executeAction).not.toHaveBeenCalled();
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
      if (action.type === "open_ghostty_session") {
        return {
          bundleId: "com.mitchellh.ghostty",
          title: "skfiy-shell",
          pid: 54502,
          opened: true
        };
      }

      if (action.type === "observe_app") {
        controller.abort();
        return {
          bundleId: action.bundleId,
          pid: action.pid,
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
      "session_opened",
      "app_activated",
      "session_initialized",
      "screenshot_before"
    ]);
    expect(client.executeAction).toHaveBeenCalledTimes(5);
  });

  it("asks for confirmation instead of typing when the observed Ghostty window is unsafe", async () => {
    const client = createDesktopClient();
    client.executeAction.mockImplementation(async (action: DesktopExecutableAction) => {
      if (action.type === "open_ghostty_session") {
        return {
          bundleId: "com.mitchellh.ghostty",
          title: "skfiy-shell",
          pid: 54502,
          opened: true
        };
      }

      if (action.type === "observe_app") {
        return {
          bundleId: action.bundleId,
          pid: action.pid,
          isRunning: true,
          isActive: true,
          screenshotPath: action.screenshotOutputPath,
          frontmostBundleId: "com.mitchellh.ghostty",
          accessibilityTrusted: true,
          windows: [
            {
              title: "Codex",
              layer: 0,
              bounds: { x: 10, y: 20, width: 640, height: 480 }
            }
          ]
        };
      }

      return { ok: true };
    });

    const events = await collectEvents(runGhosttyCommandTask(client, "pwd", { createScreenshotPath }));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "session_opened",
      "app_activated",
      "session_initialized",
      "screenshot_before",
      "verification_failed"
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "verification_failed",
      stage: "before",
      reason: "Observed Ghostty window is not a skfiy-owned session."
    });
    expect(client.executeAction).not.toHaveBeenCalledWith({
      type: "type_text",
      text: "pwd"
    });
  });

  it("fails closed when the opened session is not the exact Ghostty bundle id", async () => {
    const client = createDesktopClient();
    client.executeAction.mockResolvedValueOnce({
      bundleId: "com.example.fakeghostty",
      title: "skfiy-shell",
      pid: 54502,
      opened: true
    });

    await expect(collectEvents(runGhosttyCommandTask(client, "pwd"))).rejects.toThrow(
      "Opened Ghostty session reported an unexpected bundle id."
    );
    expect(client.executeAction).toHaveBeenCalledTimes(1);
    expect(client.executeAction).not.toHaveBeenCalledWith({
      type: "type_text",
      text: "pwd"
    });
  });

  it("asks for confirmation when Ghostty cannot become the focused app", async () => {
    const client = createDesktopClient();
    client.executeAction
      .mockResolvedValueOnce({
        bundleId: "com.mitchellh.ghostty",
        title: "skfiy-shell",
        pid: 54502,
        opened: true
      })
      .mockResolvedValueOnce({
        ok: false,
        message: "Ghostty did not become frontmost."
      });

    const events = await collectEvents(runGhosttyCommandTask(client, "pwd", { createScreenshotPath }));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "session_opened",
      "verification_failed"
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "verification_failed",
      stage: "activate",
      reason: "Ghostty did not become frontmost."
    });
    expect(client.executeAction).toHaveBeenCalledTimes(2);
  });

  it("recovers by reactivating when the before screenshot is not frontmost", async () => {
    const client = createDesktopClient();
    let observeCount = 0;
    client.executeAction.mockImplementation(async (action: DesktopExecutableAction) => {
      if (action.type === "open_ghostty_session") {
        return {
          bundleId: "com.mitchellh.ghostty",
          title: "skfiy-shell",
          pid: 54502,
          opened: true
        };
      }

      if (action.type === "observe_app") {
        observeCount += 1;
        return {
          bundleId: action.bundleId,
          pid: action.pid,
          isRunning: true,
          isActive: observeCount > 1,
          screenshotPath: action.screenshotOutputPath,
          frontmostBundleId: observeCount === 1 ? "com.apple.finder" : "com.mitchellh.ghostty",
          accessibilityTrusted: true,
          windows: [
            {
              title: "skfiy-shell",
              layer: 0,
              bounds: { x: 10, y: 20, width: 640, height: 480 }
            }
          ]
        };
      }

      return { ok: true };
    });

    const events = await collectEvents(runGhosttyCommandTask(client, "pwd", { createScreenshotPath }));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "session_opened",
      "app_activated",
      "session_initialized",
      "screenshot_before",
      "recovery_attempted",
      "screenshot_before",
      "typing",
      "submitted",
      "screenshot_after",
      "completed"
    ]);
    expect(events.find((event) => event.type === "recovery_attempted")).toMatchObject({
      type: "recovery_attempted",
      stage: "before",
      action: "activate",
      reason: "Target app is running but not frontmost."
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(6, {
      type: "activate_app",
      bundleId: "com.mitchellh.ghostty",
      pid: 54502
    });
    expect(client.executeAction).toHaveBeenNthCalledWith(8, {
      type: "type_text",
      text: "pwd"
    });
  });

  it("asks for confirmation when the after screenshot no longer observes the owned session", async () => {
    const client = createDesktopClient();
    let observeCount = 0;
    client.executeAction.mockImplementation(async (action: DesktopExecutableAction) => {
      if (action.type === "open_ghostty_session") {
        return {
          bundleId: "com.mitchellh.ghostty",
          title: "skfiy-shell",
          pid: 54502,
          opened: true
        };
      }

      if (action.type === "observe_app") {
        observeCount += 1;
        return {
          bundleId: action.bundleId,
          pid: observeCount === 1 ? action.pid : 12345,
          isRunning: true,
          isActive: true,
          screenshotPath: action.screenshotOutputPath,
          frontmostBundleId: "com.mitchellh.ghostty",
          accessibilityTrusted: true,
          windows: [
            {
              title: observeCount === 1 ? "skfiy-shell" : "other-shell",
              layer: 0,
              bounds: { x: 10, y: 20, width: 640, height: 480 }
            }
          ]
        };
      }

      return { ok: true };
    });

    const events = await collectEvents(runGhosttyCommandTask(client, "pwd", { createScreenshotPath }));

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "locating_app",
      "session_opened",
      "app_activated",
      "session_initialized",
      "screenshot_before",
      "typing",
      "submitted",
      "screenshot_after",
      "verification_failed"
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "verification_failed",
      stage: "after",
      reason: "Observed Ghostty window is not a skfiy-owned session."
    });
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
      "session_opened",
      "app_activated",
      "session_initialized",
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
