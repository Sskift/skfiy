import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type ManualMode = "active" | "quiet";
type PetWindowMode = "compact" | "expanded";
type TaskStatus =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "failed";
type DoubaoVoiceTrigger = "skfiy-shortcut" | "fn-double-tap" | "none";
type DictationProviderSelection = "doubao" | "browser";
type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
type PermissionSettingsTarget = "screen-recording" | "accessibility" | "microphone";
type StartupWarningId = "tmux-launch" | "dev-server" | "unbundled-electron";
type DictationProviderId = "doubao" | "browser";
type DictationProviderState =
  | "unavailable"
  | "waiting_for_shortcut_configuration"
  | "listening"
  | "stopped"
  | "failed";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
  replayRecord?: ObserveAppReplayRecord;
}

interface ObserveAppReplayRecord {
  stage: "before" | "after";
  bundleId: string;
  isRunning: boolean;
  isActive: boolean;
  screenshotPath: string;
  frontmostBundleId?: string;
  accessibilityTrusted?: boolean;
  windows?: Array<{
    title?: string;
    layer: number;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

interface DictationPreparation {
  providerId?: DictationProviderId;
  voiceTrigger: DoubaoVoiceTrigger;
  nativeDictationActive?: boolean;
  providerState?: DictationProviderState;
}

interface DictationProviderEvent {
  providerId: DictationProviderId;
  state: DictationProviderState;
  message: string;
}

interface DictationSettings {
  provider: DictationProviderSelection;
  doubaoVoiceTrigger: Exclude<DoubaoVoiceTrigger, "none">;
  doubaoShortcutLabel: string;
}

interface PermissionSummary {
  screenRecording: { state: PermissionState };
  accessibility: { state: PermissionState };
  microphone: { state: PermissionState };
}

interface StartupWarning {
  id: StartupWarningId;
  title: string;
  message: string;
}

interface RuntimeStatus {
  stopTurnHotkey: {
    accelerator: string;
    label: string;
    registered: boolean;
  };
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
  getStartupWarnings: () => Promise<StartupWarning[]>;
  getDictationSettings: () => Promise<DictationSettings>;
  setDictationSettings: (
    update: Partial<Pick<DictationSettings, "provider">>
  ) => Promise<DictationSettings>;
  getRuntimeStatus: () => Promise<RuntimeStatus>;
  moveWindowBy: (deltaX: number, deltaY: number) => void;
  setWindowMode: (mode: PetWindowMode) => void;
  onDictationProviderEvent: (callback: (event: DictationProviderEvent) => void) => () => void;
  onStopTurnHotkey: (callback: () => void) => () => void;
  onTaskEvent: (callback: (event: TaskEvent) => void) => () => void;
}

const taskStatuses = new Set<TaskStatus>([
  "idle",
  "observing",
  "executing",
  "approval_required",
  "needs_confirmation",
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
  async getStartupWarnings() {
    const payload = await ipcRenderer.invoke("skfiy:get-startup-warnings");
    return Array.isArray(payload) ? payload.filter(isStartupWarning) : [];
  },
  async getDictationSettings() {
    const payload = await ipcRenderer.invoke("skfiy:get-dictation-settings");
    return isDictationSettings(payload) ? payload : createDefaultDictationSettings();
  },
  async setDictationSettings(update) {
    const provider =
      update && typeof update === "object" && "provider" in update
        ? update.provider
        : undefined;
    const payload = await ipcRenderer.invoke("skfiy:set-dictation-settings", {
      provider: isDictationProviderSelection(provider) ? provider : undefined
    });
    return isDictationSettings(payload) ? payload : createDefaultDictationSettings();
  },
  async getRuntimeStatus() {
    const payload = await ipcRenderer.invoke("skfiy:get-runtime-status");
    return isRuntimeStatus(payload)
      ? payload
      : {
        stopTurnHotkey: {
          accelerator: "",
          label: "",
          registered: false
        }
      };
  },
  moveWindowBy(deltaX, deltaY) {
    ipcRenderer.send("skfiy:move-window-by", deltaX, deltaY);
  },
  setWindowMode(mode) {
    ipcRenderer.send("skfiy:set-window-mode", mode);
  },
  onDictationProviderEvent(callback) {
    const listener = (_event: IpcRendererEvent, payload: unknown) => {
      if (isDictationProviderEvent(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("skfiy:dictation-provider-event", listener);
    return () => ipcRenderer.removeListener("skfiy:dictation-provider-event", listener);
  },
  onStopTurnHotkey(callback) {
    const listener = () => callback();

    ipcRenderer.on("skfiy:stop-turn-hotkey", listener);
    return () => ipcRenderer.removeListener("skfiy:stop-turn-hotkey", listener);
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

function isDictationProviderEvent(value: unknown): value is DictationProviderEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<DictationProviderEvent>;
  return (
    event.providerId === "doubao"
    && isDictationProviderState(event.state)
    && typeof event.message === "string"
  );
}

function isDictationProviderState(value: unknown): value is DictationProviderState {
  return (
    value === "unavailable"
    || value === "waiting_for_shortcut_configuration"
    || value === "listening"
    || value === "stopped"
    || value === "failed"
  );
}

function isDictationSettings(value: unknown): value is DictationSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Partial<DictationSettings>;
  return (
    isDictationProviderSelection(settings.provider)
    && (settings.doubaoVoiceTrigger === "skfiy-shortcut"
      || settings.doubaoVoiceTrigger === "fn-double-tap")
    && typeof settings.doubaoShortcutLabel === "string"
  );
}

function isDictationProviderSelection(value: unknown): value is DictationProviderSelection {
  return value === "doubao" || value === "browser";
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

function isStartupWarning(value: unknown): value is StartupWarning {
  if (!value || typeof value !== "object") {
    return false;
  }

  const warning = value as Partial<StartupWarning>;
  return (
    isStartupWarningId(warning.id)
    && typeof warning.title === "string"
    && typeof warning.message === "string"
  );
}

function isStartupWarningId(value: unknown): value is StartupWarningId {
  return value === "tmux-launch" || value === "dev-server" || value === "unbundled-electron";
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  if (!value || typeof value !== "object") {
    return false;
  }

  const status = value as Partial<RuntimeStatus>;
  const stopTurnHotkey = status.stopTurnHotkey;
  return (
    Boolean(stopTurnHotkey)
    && typeof stopTurnHotkey === "object"
    && typeof stopTurnHotkey.accelerator === "string"
    && typeof stopTurnHotkey.label === "string"
    && typeof stopTurnHotkey.registered === "boolean"
  );
}

function createUnknownPermissionSummary(): PermissionSummary {
  return {
    screenRecording: { state: "unknown" },
    accessibility: { state: "unknown" },
    microphone: { state: "unknown" }
  };
}

function createDefaultDictationSettings(): DictationSettings {
  return {
    provider: "doubao",
    doubaoVoiceTrigger: "skfiy-shortcut",
    doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space"
  };
}

contextBridge.exposeInMainWorld("skfiy", api);
