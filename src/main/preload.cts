import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type ManualMode = "active" | "quiet";
type PetWindowMode = "compact" | "expanded";
type TaskStatus = "idle" | "observing" | "executing" | "approval_required" | "completed" | "failed";
type DoubaoVoiceTrigger = "skfiy-shortcut" | "fn-double-tap" | "none";
type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
type PermissionSettingsTarget = "screen-recording" | "accessibility" | "microphone";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

interface DictationPreparation {
  voiceTrigger: DoubaoVoiceTrigger;
}

interface PermissionSummary {
  screenRecording: { state: PermissionState };
  accessibility: { state: PermissionState };
  microphone: { state: PermissionState };
}

interface DesktopApi {
  runCommand: (command: string, options: { mode: ManualMode }) => Promise<void>;
  prepareDictation: () => Promise<DictationPreparation>;
  stopDictation: () => Promise<void>;
  approveTask: () => Promise<void>;
  denyTask: () => Promise<void>;
  takeScreenshot: () => Promise<void>;
  stopTask: () => Promise<void>;
  getPermissions: () => Promise<PermissionSummary>;
  openPermissionSettings: (permission: PermissionSettingsTarget) => Promise<void>;
  moveWindowBy: (deltaX: number, deltaY: number) => void;
  setWindowMode: (mode: PetWindowMode) => void;
  onTaskEvent: (callback: (event: TaskEvent) => void) => () => void;
}

const taskStatuses = new Set<TaskStatus>([
  "idle",
  "observing",
  "executing",
  "approval_required",
  "completed",
  "failed"
]);

function isTaskEvent(value: unknown): value is TaskEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TaskEvent>;
  return typeof candidate.status === "string" && taskStatuses.has(candidate.status);
}

const api: DesktopApi = {
  async runCommand(command, options) {
    await ipcRenderer.invoke("skfiy:run-command", command, options);
  },
  async prepareDictation() {
    const payload = await ipcRenderer.invoke("skfiy:prepare-dictation");
    return isDictationPreparation(payload) ? payload : { voiceTrigger: "none" };
  },
  async stopDictation() {
    await ipcRenderer.invoke("skfiy:stop-dictation");
  },
  async approveTask() {
    await ipcRenderer.invoke("skfiy:approve-task");
  },
  async denyTask() {
    await ipcRenderer.invoke("skfiy:deny-task");
  },
  async takeScreenshot() {
    await ipcRenderer.invoke("skfiy:take-screenshot");
  },
  async stopTask() {
    await ipcRenderer.invoke("skfiy:stop-task");
  },
  async getPermissions() {
    const payload = await ipcRenderer.invoke("skfiy:get-permissions");
    return isPermissionSummary(payload) ? payload : createUnknownPermissionSummary();
  },
  async openPermissionSettings(permission) {
    if (!isPermissionSettingsTarget(permission)) {
      return;
    }

    await ipcRenderer.invoke("skfiy:open-permission-settings", permission);
  },
  moveWindowBy(deltaX, deltaY) {
    ipcRenderer.send("skfiy:move-window-by", deltaX, deltaY);
  },
  setWindowMode(mode) {
    ipcRenderer.send("skfiy:set-window-mode", mode);
  },
  onTaskEvent(callback) {
    const listener = (_event: IpcRendererEvent, payload: unknown) => {
      if (isTaskEvent(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("skfiy:task-event", listener);
    return () => ipcRenderer.removeListener("skfiy:task-event", listener);
  }
};

function isDictationPreparation(value: unknown): value is DictationPreparation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const trigger = (value as Partial<DictationPreparation>).voiceTrigger;
  return trigger === "skfiy-shortcut" || trigger === "fn-double-tap" || trigger === "none";
}

function isPermissionSummary(value: unknown): value is PermissionSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const summary = value as Partial<PermissionSummary>;
  return (
    isPermissionStatus(summary.screenRecording)
    && isPermissionStatus(summary.accessibility)
    && isPermissionStatus(summary.microphone)
  );
}

function isPermissionStatus(value: unknown): value is { state: PermissionState } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = (value as { state?: unknown }).state;
  return isPermissionState(state);
}

function isPermissionState(value: unknown): value is PermissionState {
  return (
    value === "granted"
    || value === "denied"
    || value === "not-determined"
    || value === "unknown"
  );
}

function isPermissionSettingsTarget(value: unknown): value is PermissionSettingsTarget {
  return (
    value === "screen-recording"
    || value === "accessibility"
    || value === "microphone"
  );
}

function createUnknownPermissionSummary(): PermissionSummary {
  return {
    screenRecording: { state: "unknown" },
    accessibility: { state: "unknown" },
    microphone: { state: "unknown" }
  };
}

contextBridge.exposeInMainWorld("skfiy", api);
