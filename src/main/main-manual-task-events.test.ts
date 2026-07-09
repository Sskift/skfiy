import { describe, expect, it } from "vitest";

import {
  createManualScreenshotCompletedTaskEvent,
  createManualScreenshotFailedTaskEvent,
  createManualScreenshotStartedTaskEvent,
  createRejectedRunCommandTaskEvent
} from "./main-manual-task-events";

describe("main manual task event helpers", () => {
  it("creates rejected run-command task events from validated IPC input", () => {
    expect(createRejectedRunCommandTaskEvent("No command was provided.")).toEqual({
      status: "failed",
      message: "No command was provided."
    });
  });

  it("creates manual screenshot lifecycle task events", () => {
    expect(createManualScreenshotStartedTaskEvent()).toEqual({
      status: "observing",
      message: "Capturing the desktop."
    });

    expect(createManualScreenshotCompletedTaskEvent("/tmp/manual.png")).toEqual({
      status: "completed",
      message: "Screenshot saved: /tmp/manual.png"
    });
  });

  it("preserves manual screenshot error messages and keeps non-Error failures generic", () => {
    expect(createManualScreenshotFailedTaskEvent(new Error("Screen Recording is denied."))).toEqual({
      status: "failed",
      message: "Screen Recording is denied."
    });

    expect(createManualScreenshotFailedTaskEvent("boom")).toEqual({
      status: "failed",
      message: "Screenshot failed."
    });
  });
});
