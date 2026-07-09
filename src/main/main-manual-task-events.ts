import type { TaskEvent } from "./task-event-view.js";

export function createRejectedRunCommandTaskEvent(message: string): TaskEvent {
  return {
    status: "failed",
    message
  };
}

export function createManualScreenshotStartedTaskEvent(): TaskEvent {
  return {
    status: "observing",
    message: "Capturing the desktop."
  };
}

export function createManualScreenshotCompletedTaskEvent(outputPath: string): TaskEvent {
  return {
    status: "completed",
    message: `Screenshot saved: ${outputPath}`
  };
}

export function createManualScreenshotFailedTaskEvent(error: unknown): TaskEvent {
  return {
    status: "failed",
    message: error instanceof Error ? error.message : "Screenshot failed."
  };
}
