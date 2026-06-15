import { app, BrowserWindow, ipcMain, screen } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import type { DesktopActionResult } from "./computer-use/types.js";
import {
  prepareDoubaoDictation,
  readDoubaoVoiceTrigger,
  shouldStopDoubaoDictation
} from "./dictation-backend.js";
import type { GhosttyTaskEvent } from "./orchestrator/events.js";
import { runGhosttyCommandTask, type DesktopClient } from "./orchestrator/ghostty-task.js";
import {
  calculatePetWindowBounds,
  readWindowPositionOverride,
  resizePetWindowBoundsKeepingBottom,
  type Size
} from "./window-position.js";

type ManualMode = "active" | "quiet";
type TaskStatus = "idle" | "observing" | "executing" | "approval_required" | "completed" | "failed";
type PetWindowMode = "compact" | "expanded";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

interface PendingApproval {
  command: string;
  mode: ManualMode;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.SKFIY_DEV_SERVER_URL;
const COMPACT_WINDOW_SIZE: Size = { width: 320, height: 224 };
const EXPANDED_WINDOW_SIZE: Size = { width: 320, height: 360 };

let mainWindow: BrowserWindow | null = null;
let currentTaskId = 0;
let screenshotSerial = 0;
let activeTaskController: AbortController | null = null;
let pendingApproval: PendingApproval | null = null;

function emitTaskEvent(window: BrowserWindow | null, event: TaskEvent) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:task-event", event);
}

function resolveHelperPath(): string {
  if (process.env.SKFIY_HELPER_PATH) {
    return process.env.SKFIY_HELPER_PATH;
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "skfiy-helper");
  }

  return path.join(app.getAppPath(), "dist", "skfiy-helper");
}

function createScreenshotPath(scope: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  screenshotSerial += 1;
  return path.join(os.tmpdir(), "skfiy", `${scope}-${timestamp}-${screenshotSerial}.png`);
}

function createGhosttyDesktopClient(helper: DesktopHelperClient): DesktopClient {
  return {
    listApps: async () => helper.listApps(),
    executeAction: async (action) => {
      const result = await helper.executeAction(action);
      assertDesktopActionResult(result, action.type);
      return result;
    }
  };
}

function assertDesktopActionResult(result: DesktopActionResult, label: string): void {
  if ("ok" in result && !result.ok) {
    throw new Error(result.message ?? `Desktop helper could not ${label}.`);
  }
}

function createTaskEvent(event: GhosttyTaskEvent, mode: ManualMode): TaskEvent {
  const prefix = mode === "quiet" ? "Quiet mode: " : "";

  switch (event.type) {
    case "started":
      return {
        status: "executing",
        message: `${prefix}Risk ${event.risk.level}: ${event.risk.reason}`
      };
    case "approval_required":
      return {
        status: "approval_required",
        message: `Approval required (${event.risk.level}): ${event.risk.reason}`,
        command: event.command
      };
    case "locating_app":
      return {
        status: "observing",
        message: `${prefix}Finding ${event.appName}.`
      };
    case "app_activated":
      return {
        status: "executing",
        message: `${prefix}Activated ${event.appName}.`
      };
    case "screenshot_before":
      return {
        status: "observing",
        message: `${prefix}Captured before screenshot: ${event.path}`
      };
    case "typing":
      return {
        status: "executing",
        message: `${prefix}Typing command in Ghostty.`
      };
    case "submitted":
      return {
        status: "executing",
        message: `${prefix}Submitted command with ${event.key}.`
      };
    case "screenshot_after":
      return {
        status: "observing",
        message: `${prefix}Captured after screenshot: ${event.path}`
      };
    case "completed":
      return {
        status: "completed",
        message: event.summary
      };
  }

  return {
    status: "failed",
    message: "Unknown task event."
  };
}

function createDesktopHelper(): DesktopHelperClient {
  return new DesktopHelperClient({
    helperPath: resolveHelperPath()
  });
}

function readMode(value: unknown): ManualMode {
  return value === "quiet" || value === "active" ? value : "active";
}

function readPetWindowMode(value: unknown): PetWindowMode | undefined {
  return value === "compact" || value === "expanded" ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function runCommandTask(
  window: BrowserWindow | null,
  command: string,
  mode: ManualMode,
  approved: boolean
) {
  const taskId = currentTaskId + 1;
  currentTaskId = taskId;
  pendingApproval = null;
  activeTaskController?.abort();

  const controller = new AbortController();
  activeTaskController = controller;

  try {
    const helper = createDesktopHelper();
    const desktopClient = createGhosttyDesktopClient(helper);

    for await (const taskEvent of runGhosttyCommandTask(desktopClient, command, {
      approved,
      createScreenshotPath: (stage) => createScreenshotPath(`ghostty-${stage}`),
      signal: controller.signal
    })) {
      if (controller.signal.aborted || taskId !== currentTaskId) {
        return;
      }

      if (taskEvent.type === "approval_required" && !approved) {
        pendingApproval = { command, mode };
      }

      emitTaskEvent(window, createTaskEvent(taskEvent, mode));
    }
  } catch (error) {
    if (controller.signal.aborted || taskId !== currentTaskId) {
      return;
    }

    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Task failed."
    });
  } finally {
    if (activeTaskController === controller) {
      activeTaskController = null;
    }
  }
}

async function createWindow() {
  const initialBounds = calculatePetWindowBounds({
    cursorPoint: screen.getCursorScreenPoint(),
    displays: screen.getAllDisplays(),
    windowSize: COMPACT_WINDOW_SIZE,
    margin: 28,
    positionOverride: readWindowPositionOverride(process.env)
  });

  mainWindow = new BrowserWindow({
    width: COMPACT_WINDOW_SIZE.width,
    height: COMPACT_WINDOW_SIZE.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: COMPACT_WINDOW_SIZE.width,
    minHeight: COMPACT_WINDOW_SIZE.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "Skfiy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function setPetWindowMode(window: BrowserWindow, mode: PetWindowMode) {
  const nextSize = mode === "expanded" ? EXPANDED_WINDOW_SIZE : COMPACT_WINDOW_SIZE;
  const currentBounds = window.getBounds();

  if (currentBounds.width === nextSize.width && currentBounds.height === nextSize.height) {
    return;
  }

  window.setBounds(resizePetWindowBoundsKeepingBottom(currentBounds, nextSize));
}

ipcMain.on("skfiy:move-window-by", (event, deltaX: unknown, deltaY: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const x = readFiniteNumber(deltaX);
  const y = readFiniteNumber(deltaY);

  if (!window || window.isDestroyed() || x === undefined || y === undefined) {
    return;
  }

  const bounds = window.getBounds();
  window.setPosition(Math.round(bounds.x + x), Math.round(bounds.y + y));
});

ipcMain.on("skfiy:set-window-mode", (event, mode: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const nextMode = readPetWindowMode(mode);

  if (!window || window.isDestroyed() || !nextMode) {
    return;
  }

  setPetWindowMode(window, nextMode);
});

ipcMain.handle(
  "skfiy:run-command",
  async (event, command: unknown, options: { mode?: unknown } = {}) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (typeof command !== "string") {
      emitTaskEvent(window, {
        status: "failed",
        message: "Command must be text."
      });
      return;
    }

    const trimmed = command.trim();
    const mode = readMode(options.mode);

    if (!trimmed) {
      emitTaskEvent(window, {
        status: "failed",
        message: "No command was provided."
      });
      return;
    }

    await runCommandTask(window, trimmed, mode, false);
  }
);

ipcMain.handle("skfiy:prepare-dictation", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (window && !window.isDestroyed()) {
    window.setFocusable(true);
    window.show();
    window.focus();
  }

  try {
    await prepareDoubaoDictation(
      createDesktopHelper(),
      readDoubaoVoiceTrigger(process.env)
    );
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Doubao dictation could not be prepared."
    });
  }
});

ipcMain.handle("skfiy:stop-dictation", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const voiceTrigger = readDoubaoVoiceTrigger(process.env);

  if (!shouldStopDoubaoDictation(voiceTrigger)) {
    return;
  }

  try {
    const result = await createDesktopHelper().pressKey("escape");
    assertDesktopActionResult(result, "stop Doubao dictation");
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Doubao dictation could not be stopped."
    });
  }
});

ipcMain.handle("skfiy:approve-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const approval = pendingApproval;

  if (!approval) {
    emitTaskEvent(window, {
      status: "idle",
      message: "No task is waiting for approval."
    });
    return;
  }

  await runCommandTask(window, approval.command, approval.mode, true);
});

ipcMain.handle("skfiy:deny-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  currentTaskId += 1;

  emitTaskEvent(window, {
    status: "idle",
    message: "Task denied."
  });
});

ipcMain.handle("skfiy:take-screenshot", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const helper = createDesktopHelper();

  emitTaskEvent(window, {
    status: "observing",
    message: "Capturing the desktop."
  });

  try {
    const screenshot = await helper.screenshot(createScreenshotPath("manual"));
    emitTaskEvent(window, {
      status: "completed",
      message: `Screenshot saved: ${screenshot.outputPath}`
    });
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Screenshot failed."
    });
  }
});

ipcMain.handle("skfiy:stop-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  currentTaskId += 1;

  emitTaskEvent(window, {
    status: "idle",
    message: "Task stopped."
  });
});

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
