import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type ManualMode = "active" | "quiet";
type PetWindowMode = "compact" | "expanded";
type TaskStatus = "idle" | "observing" | "executing" | "approval_required" | "completed" | "failed";
type DoubaoVoiceTrigger = "skfiy-shortcut" | "fn-double-tap" | "none";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

interface DictationPreparation {
  voiceTrigger: DoubaoVoiceTrigger;
}

interface DesktopApi {
  runCommand: (command: string, options: { mode: ManualMode }) => Promise<void>;
  prepareDictation: () => Promise<DictationPreparation>;
  stopDictation: () => Promise<void>;
  approveTask: () => Promise<void>;
  denyTask: () => Promise<void>;
  takeScreenshot: () => Promise<void>;
  stopTask: () => Promise<void>;
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

contextBridge.exposeInMainWorld("skfiy", api);
