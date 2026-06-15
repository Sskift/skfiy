import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import type {
  DesktopActionResult,
  DesktopAppState,
  PermissionSettingsTarget
} from "./computer-use/types.js";
import {
  createDictationSettingsStore,
  readInitialDictationSettings,
  resolveDictationVoiceTrigger
} from "./dictation-settings.js";
import {
  createDoubaoDictationProvider,
  type DictationProviderEvent
} from "./dictation-provider.js";
import { resolveHelperPath as resolveDesktopHelperPath } from "./helper-path.js";
import type { GhosttyTaskEvent } from "./orchestrator/events.js";
import { runGhosttyCommandTask, type DesktopClient } from "./orchestrator/ghostty-task.js";
import {
  readPermissionsForRenderer
} from "./permissions.js";
import { readStartupWarnings } from "./startup-guard.js";
import {
  readStopTurnHotkeyStatus,
  registerStopTurnHotkey,
  STOP_TURN_ACCELERATOR
} from "./stop-turn-hotkey.js";
import {
  calculatePetWindowBounds,
  readWindowPositionOverride,
  resizePetWindowBoundsKeepingBottom,
  type Size
} from "./window-position.js";

type ManualMode = "active" | "quiet";
type TaskStatus =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "failed";
type PetWindowMode = "compact" | "expanded";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
  replayReset?: boolean;
  replayRecord?: ObserveAppReplayRecord;
}

interface PendingApproval {
  command: string;
  mode: ManualMode;
}

interface ObserveAppReplayRecord extends DesktopAppState {
  stage: "before" | "after";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.SKFIY_DEV_SERVER_URL;
const COMPACT_WINDOW_SIZE: Size = { width: 320, height: 224 };
const EXPANDED_WINDOW_SIZE: Size = { width: 320, height: 500 };
const dictationSettingsStore = createDictationSettingsStore(
  readInitialDictationSettings(process.env)
);

let mainWindow: BrowserWindow | null = null;
let currentTaskId = 0;
let screenshotSerial = 0;
let activeTaskController: AbortController | null = null;
let pendingApproval: PendingApproval | null = null;
let stopTurnHotkeyRegistered = false;

function emitTaskEvent(window: BrowserWindow | null, event: TaskEvent) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:task-event", event);
}

function emitDictationProviderEvent(window: BrowserWindow | null, event: DictationProviderEvent) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:dictation-provider-event", event);
}

function resolveHelperPath(): string {
  return resolveDesktopHelperPath({
    env: process.env,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  });
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
        message: `${prefix}Risk ${event.risk.level}: ${event.risk.reason}`,
        replayReset: true
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
    case "session_opened":
      return {
        status: "observing",
        message: `${prefix}Opened ${event.appName} session: ${event.title}.`
      };
    case "app_activated":
      return {
        status: "executing",
        message: `${prefix}Activated ${event.appName}.`
      };
    case "session_initialized":
      return {
        status: "executing",
        message: `${prefix}Initialized Ghostty session marker: ${event.title}.`
      };
    case "verification_failed":
      return {
        status: "needs_confirmation",
        message: `${prefix}Verification failed (${event.stage}): ${event.reason}`
      };
    case "recovery_attempted":
      return {
        status: "executing",
        message: `${prefix}Recovering ${event.stage} observation with ${event.action}: ${event.reason}`
      };
    case "screenshot_before":
      return {
        status: "observing",
        message: `${prefix}Captured before screenshot: ${event.path}`,
        replayRecord: createObserveAppReplayRecord("before", event.observation)
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
        message: `${prefix}Captured after screenshot: ${event.path}`,
        replayRecord: createObserveAppReplayRecord("after", event.observation)
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

function createObserveAppReplayRecord(
  stage: "before" | "after",
  observation: DesktopAppState
): ObserveAppReplayRecord {
  return {
    ...observation,
    stage
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

function readPermissionSettingsTarget(value: unknown): PermissionSettingsTarget | undefined {
  return value === "screen-recording" || value === "accessibility" || value === "microphone"
    ? value
    : undefined;
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
    title: "skfiy",
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
  const dictationSettings = dictationSettingsStore.get();
  const voiceTrigger = resolveDictationVoiceTrigger(dictationSettings);
  let lastProviderState: DictationProviderEvent["state"] | undefined;

  if (window && !window.isDestroyed()) {
    window.setFocusable(true);
    window.show();
    window.focus();
  }

  if (dictationSettings.provider === "browser") {
    return {
      providerId: "browser",
      voiceTrigger: "none",
      nativeDictationActive: false
    };
  }

  try {
    const provider = createDoubaoDictationProvider({
      helper: createDesktopHelper(),
      voiceTrigger,
      emit: (providerEvent) => {
        lastProviderState = providerEvent.state;
        emitDictationProviderEvent(window, providerEvent);
      }
    });
    return await provider.prepare();
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Doubao dictation could not be prepared."
    });
  }

  return {
    providerId: "doubao",
    voiceTrigger,
    nativeDictationActive: false,
    providerState: lastProviderState ?? "failed"
  };
});

ipcMain.handle("skfiy:stop-dictation", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const dictationSettings = dictationSettingsStore.get();

  if (dictationSettings.provider === "browser") {
    return;
  }

  const voiceTrigger = resolveDictationVoiceTrigger(dictationSettings);

  try {
    const provider = createDoubaoDictationProvider({
      helper: createDesktopHelper(),
      voiceTrigger,
      emit: (providerEvent) => emitDictationProviderEvent(window, providerEvent)
    });
    await provider.stop();
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

ipcMain.handle("skfiy:get-permissions", async (event) => {
  return readPermissionsForRenderer({ helper: createDesktopHelper() });
});

ipcMain.handle("skfiy:open-permission-settings", async (event, permission: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const target = readPermissionSettingsTarget(permission);

  if (!target) {
    emitTaskEvent(window, {
      status: "failed",
      message: "Unknown permission settings target."
    });
    return;
  }

  try {
    const result = await createDesktopHelper().openPermissionSettings(target);
    assertDesktopActionResult(result, "open permission settings");
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Permission settings could not be opened."
    });
  }
});

ipcMain.handle("skfiy:get-startup-warnings", () => {
  return readStartupWarnings({
    appPath: app.getAppPath(),
    devServerUrl,
    env: process.env,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  });
});

ipcMain.handle("skfiy:get-dictation-settings", () => {
  return dictationSettingsStore.get();
});

ipcMain.handle("skfiy:set-dictation-settings", (_event, update: unknown) => {
  return dictationSettingsStore.set(
    update && typeof update === "object" ? update : {}
  );
});

ipcMain.handle("skfiy:get-runtime-status", () => {
  return {
    stopTurnHotkey: readStopTurnHotkeyStatus(stopTurnHotkeyRegistered)
  };
});

app.whenReady().then(async () => {
  await createWindow();
  if (!stopTurnHotkeyRegistered) {
    stopTurnHotkeyRegistered = registerStopTurnHotkey({
      registry: globalShortcut,
      getWindow: () => mainWindow
    });
  }

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

app.on("will-quit", () => {
  if (stopTurnHotkeyRegistered) {
    globalShortcut.unregister(STOP_TURN_ACCELERATOR);
    stopTurnHotkeyRegistered = false;
  }
});
