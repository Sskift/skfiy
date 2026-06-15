import { app, BrowserWindow, ipcMain } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import type { DesktopHelperActionResult } from "./computer-use/types.js";
import type { GhosttyTaskEvent } from "./orchestrator/events.js";
import { runGhosttyCommandTask, type DesktopClient } from "./orchestrator/ghostty-task.js";

type ManualMode = "active" | "quiet";
type TaskStatus = "idle" | "observing" | "executing" | "approval_required" | "completed" | "failed";

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

function assertActionResult(result: DesktopHelperActionResult, label: string): void {
  if (!result.ok) {
    throw new Error(result.message ?? `Desktop helper could not ${label}.`);
  }
}

function createGhosttyDesktopClient(helper: DesktopHelperClient): DesktopClient {
  return {
    listApps: async () => helper.listApps(),
    activateApp: async (bundleId) => {
      assertActionResult(await helper.activateApp(bundleId), "activate Ghostty");
    },
    screenshot: async () => {
      const screenshot = await helper.screenshot(createScreenshotPath("ghostty"));
      return { path: screenshot.outputPath };
    },
    typeText: async (text) => {
      assertActionResult(await helper.typeText(text), "type in Ghostty");
    },
    pressKey: async (key) => {
      assertActionResult(await helper.pressKey(key), `press ${key}`);
    }
  };
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
  mainWindow = new BrowserWindow({
    width: 340,
    height: 276,
    minWidth: 320,
    minHeight: 250,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "Skfiy",
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
