import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type ManualMode = "active" | "quiet";
type TaskStatus = "idle" | "observing" | "executing" | "approval_required" | "completed" | "failed";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

interface SkfiyApi {
  runCommand: (command: string, options: { mode: ManualMode }) => Promise<void>;
  approveTask: () => Promise<void>;
  denyTask: () => Promise<void>;
  takeScreenshot: () => Promise<void>;
  stopTask: () => Promise<void>;
  setIgnoreMouse: (ignore: boolean) => void;
  setOverlayState: (state: { capsuleOpen?: boolean; dragging?: boolean }) => void;
  moveWindowBy: (deltaX: number, deltaY: number) => void;
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

const api: SkfiyApi = {
  async runCommand(command, options) {
    await ipcRenderer.invoke("skfiy:run-command", command, options);
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
  setIgnoreMouse(ignore) {
    ipcRenderer.send("skfiy:set-ignore-mouse", ignore === true);
  },
  setOverlayState(state) {
    ipcRenderer.send("skfiy:set-overlay-state", {
      ...(typeof state.capsuleOpen === "boolean" ? { capsuleOpen: state.capsuleOpen } : {}),
      ...(typeof state.dragging === "boolean" ? { dragging: state.dragging } : {})
    });
  },
  moveWindowBy(deltaX, deltaY) {
    ipcRenderer.send("skfiy:move-window-by", deltaX, deltaY);
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

contextBridge.exposeInMainWorld("skfiy", api);
