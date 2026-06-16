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
type DictationProviderSelection = "doubao" | "browser" | "native-macos";
type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
type PermissionSettingsTarget =
  | "screen-recording"
  | "accessibility"
  | "microphone"
  | "speech-recognition";
type StartupWarningId = "tmux-launch" | "dev-server" | "unbundled-electron";
type DictationProviderId = "doubao" | "browser" | "native-macos";
type AppPolicy = "allow" | "ask" | "deny";
type PlannerProviderMode = "local-deterministic" | "external-cua" | "disabled";
type RiskLevel = "low" | "medium" | "high" | "blocked";
type TurnTranscriptOutcome =
  | "completed"
  | "approval_required"
  | "verification_failed"
  | "failed"
  | "running";
type DictationProviderState =
  | "unavailable"
  | "waiting_for_shortcut_configuration"
  | "listening"
  | "no_transcript"
  | "cancelled"
  | "stopped"
  | "failed";

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
  replayReset?: boolean;
  replayRecord?: ObserveAppReplayRecord;
  finderSelection?: FinderSelectionResult;
  finderPlanPreview?: FinderPlanPreview;
}

interface FinderPlanPreview {
  rootPath: string;
  operationCount: number;
  destructiveOperationCount: number;
  createFolders: string[];
  moveFiles: Array<{
    from: string;
    to: string;
  }>;
}

interface FinderSelectionResult {
  source: "finder-applescript";
  frontmostBundleId?: string;
  targetPath?: string;
  selection: Array<{
    path: string;
    name: string;
    kind: "file" | "directory" | "other";
  }>;
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
  ocrLabels?: Array<{
    text: string;
    confidence: number;
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
  sessionId?: string;
}

interface DictationProviderEvent {
  providerId: DictationProviderId;
  state: DictationProviderState;
  message: string;
}

interface DictationTranscriptUpdate {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

interface DictationTranscriptEvent extends DictationTranscriptUpdate {
  providerId: DictationProviderId;
  sessionId?: string;
}

interface DictationSettings {
  provider: DictationProviderSelection;
  doubaoVoiceTrigger: Exclude<DoubaoVoiceTrigger, "none">;
  doubaoShortcutLabel: string;
  nativeSpeechMaxDurationMs: number;
  nativeSpeechSilenceTimeoutMs: number;
}

interface ControlledAppPolicyEntry {
  name: string;
  bundleId: string;
  policy: AppPolicy;
}

interface AppPolicySettings {
  apps: ControlledAppPolicyEntry[];
}

interface PlannerProviderSettings {
  mode: PlannerProviderMode;
  externalProviderLabel: string;
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}

interface TurnTranscript {
  command?: string;
  risk?: {
    level: RiskLevel;
    reason: string;
    requiresApproval: boolean;
  };
  planner?: {
    providerLabel: string;
    input: string;
    command: string;
    rationale?: string;
  };
  approvalRequired: boolean;
  apps: Array<{
    name: string;
    bundleId?: string;
    pid?: number;
  }>;
  screenshots: Array<{
    stage: "before" | "after";
    path: string;
    bundleId: string;
    pid?: number;
    accessibilityTrusted?: boolean;
    grounding?: {
      recommendation: string;
      sources: Array<{
        source: string;
        status: string;
        observedElementCount: number;
        labelCount: number;
        notes?: string[];
      }>;
    };
  }>;
  actions: Array<{
    type: string;
    appName?: string;
    bundleId?: string;
    pid?: number;
    text?: string;
    key?: string;
    action?: string;
    stage?: string;
    reason?: string;
    providerLabel?: string;
    command?: string;
    rationale?: string;
  }>;
  outcome: TurnTranscriptOutcome;
}

interface TurnReplay {
  transcript: TurnTranscript;
  timeline: Array<{
    status: TaskStatus;
    message?: string;
    command?: string;
  }>;
}

interface PermissionSummary {
  screenRecording: { state: PermissionState };
  accessibility: { state: PermissionState };
  microphone: { state: PermissionState };
  speechRecognition: { state: PermissionState };
}

interface NativeSpeechStatus {
  locale: string;
  recognizerAvailable: boolean;
  speechRecognition: { state: PermissionState };
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
  stopDictation: (sessionId?: string) => Promise<void>;
  updateDictationTranscript: (
    sessionId: string | undefined,
    update: DictationTranscriptUpdate
  ) => Promise<void>;
  submitDictation: (
    sessionId: string | undefined,
    command: string,
    options: { stopNativeDictation: boolean }
  ) => Promise<void>;
  approveTask: () => Promise<void>;
  denyTask: () => Promise<void>;
  takeScreenshot: () => Promise<void>;
  stopTask: () => Promise<void>;
  getPermissions: () => Promise<PermissionSummary>;
  getNativeSpeechStatus: (locale: string) => Promise<NativeSpeechStatus>;
  openPermissionSettings: (permission: PermissionSettingsTarget) => Promise<void>;
  getStartupWarnings: () => Promise<StartupWarning[]>;
  getDictationSettings: () => Promise<DictationSettings>;
  setDictationSettings: (
    update: Partial<
      Pick<
        DictationSettings,
        "provider" | "nativeSpeechMaxDurationMs" | "nativeSpeechSilenceTimeoutMs"
      >
    >
  ) => Promise<DictationSettings>;
  getAppPolicySettings: () => Promise<AppPolicySettings>;
  setAppPolicy: (update: { bundleId: string; policy: AppPolicy }) => Promise<AppPolicySettings>;
  getPlannerProviderSettings: () => Promise<PlannerProviderSettings>;
  setPlannerProviderSettings: (
    update: Partial<Pick<PlannerProviderSettings, "mode">>
  ) => Promise<PlannerProviderSettings>;
  getTurnReplay: () => Promise<TurnReplay | null>;
  getRuntimeStatus: () => Promise<RuntimeStatus>;
  moveWindowBy: (deltaX: number, deltaY: number) => void;
  setWindowMode: (mode: PetWindowMode) => void;
  onDictationProviderEvent: (callback: (event: DictationProviderEvent) => void) => () => void;
  onDictationTranscriptEvent: (callback: (event: DictationTranscriptEvent) => void) => () => void;
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
  async stopDictation(sessionId) {
    await ipcRenderer.invoke("skfiy:stop-dictation", sessionId);
  },
  async updateDictationTranscript(sessionId, update) {
    await ipcRenderer.invoke("skfiy:update-dictation-transcript", sessionId, update);
  },
  async submitDictation(sessionId, command, options) {
    await ipcRenderer.invoke("skfiy:submit-dictation", sessionId, command, options);
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
  async getNativeSpeechStatus(locale) {
    const payload = await ipcRenderer.invoke("skfiy:get-native-speech-status", locale);
    return isNativeSpeechStatus(payload) ? payload : createUnknownNativeSpeechStatus(locale);
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
    const nativeSpeechMaxDurationMs =
      update && typeof update === "object" && "nativeSpeechMaxDurationMs" in update
        ? update.nativeSpeechMaxDurationMs
        : undefined;
    const nativeSpeechSilenceTimeoutMs =
      update && typeof update === "object" && "nativeSpeechSilenceTimeoutMs" in update
        ? update.nativeSpeechSilenceTimeoutMs
        : undefined;
    const payload = await ipcRenderer.invoke("skfiy:set-dictation-settings", {
      provider: isDictationProviderSelection(provider) ? provider : undefined,
      nativeSpeechMaxDurationMs: isPositiveInteger(nativeSpeechMaxDurationMs)
        ? nativeSpeechMaxDurationMs
        : undefined,
      nativeSpeechSilenceTimeoutMs: isPositiveInteger(nativeSpeechSilenceTimeoutMs)
        ? nativeSpeechSilenceTimeoutMs
        : undefined
    });
    return isDictationSettings(payload) ? payload : createDefaultDictationSettings();
  },
  async getAppPolicySettings() {
    const payload = await ipcRenderer.invoke("skfiy:get-app-policy-settings");
    return isAppPolicySettings(payload) ? payload : createDefaultAppPolicySettings();
  },
  async setAppPolicy(update) {
    const payload = await ipcRenderer.invoke("skfiy:set-app-policy", {
      bundleId: typeof update.bundleId === "string" ? update.bundleId : undefined,
      policy: isAppPolicy(update.policy) ? update.policy : undefined
    });
    return isAppPolicySettings(payload) ? payload : createDefaultAppPolicySettings();
  },
  async getPlannerProviderSettings() {
    const payload = await ipcRenderer.invoke("skfiy:get-planner-provider-settings");
    return isPlannerProviderSettings(payload)
      ? payload
      : createDefaultPlannerProviderSettings();
  },
  async setPlannerProviderSettings(update) {
    const mode =
      update && typeof update === "object" && "mode" in update
        ? update.mode
        : undefined;
    const payload = await ipcRenderer.invoke("skfiy:set-planner-provider-settings", {
      mode: isPlannerProviderMode(mode) ? mode : undefined
    });
    return isPlannerProviderSettings(payload)
      ? payload
      : createDefaultPlannerProviderSettings();
  },
  async getTurnReplay() {
    const payload = await ipcRenderer.invoke("skfiy:get-turn-replay");
    return isTurnReplay(payload) ? payload : null;
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
  onDictationTranscriptEvent(callback) {
    const listener = (_event: IpcRendererEvent, payload: unknown) => {
      if (isDictationTranscriptEvent(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on("skfiy:dictation-transcript-event", listener);
    return () => ipcRenderer.removeListener("skfiy:dictation-transcript-event", listener);
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
    isDictationProviderId(event.providerId)
    && isDictationProviderState(event.state)
    && typeof event.message === "string"
  );
}

function isDictationTranscriptEvent(value: unknown): value is DictationTranscriptEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<DictationTranscriptEvent>;
  return (
    isDictationProviderId(event.providerId)
    && typeof event.text === "string"
    && typeof event.isFinal === "boolean"
    && (event.sessionId === undefined || typeof event.sessionId === "string")
    && (event.confidence === undefined || typeof event.confidence === "number")
  );
}

function isDictationProviderId(value: unknown): value is DictationProviderId {
  return value === "doubao" || value === "browser" || value === "native-macos";
}

function isDictationProviderState(value: unknown): value is DictationProviderState {
  return (
    value === "unavailable"
    || value === "waiting_for_shortcut_configuration"
    || value === "listening"
    || value === "no_transcript"
    || value === "cancelled"
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
    && isPositiveInteger(settings.nativeSpeechMaxDurationMs)
    && isPositiveInteger(settings.nativeSpeechSilenceTimeoutMs)
  );
}

function isDictationProviderSelection(value: unknown): value is DictationProviderSelection {
  return value === "doubao" || value === "browser" || value === "native-macos";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isAppPolicySettings(value: unknown): value is AppPolicySettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Partial<AppPolicySettings>;
  return Array.isArray(settings.apps) && settings.apps.every(isControlledAppPolicyEntry);
}

function isControlledAppPolicyEntry(value: unknown): value is ControlledAppPolicyEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ControlledAppPolicyEntry>;
  return (
    typeof entry.name === "string"
    && typeof entry.bundleId === "string"
    && isAppPolicy(entry.policy)
  );
}

function isAppPolicy(value: unknown): value is AppPolicy {
  return value === "allow" || value === "ask" || value === "deny";
}

function isPlannerProviderSettings(value: unknown): value is PlannerProviderSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Partial<PlannerProviderSettings>;
  return (
    isPlannerProviderMode(settings.mode)
    && typeof settings.externalProviderLabel === "string"
    && (
      settings.externalEndpoint === undefined
      || typeof settings.externalEndpoint === "string"
    )
    && typeof settings.externalApiKeyConfigured === "boolean"
  );
}

function isPlannerProviderMode(value: unknown): value is PlannerProviderMode {
  return (
    value === "local-deterministic"
    || value === "external-cua"
    || value === "disabled"
  );
}

function isTurnReplay(value: unknown): value is TurnReplay {
  if (!value || typeof value !== "object") {
    return false;
  }

  const replay = value as Partial<TurnReplay>;
  return isTurnTranscript(replay.transcript) && Array.isArray(replay.timeline)
    && replay.timeline.every(isTurnReplayTimelineEvent);
}

function isTurnTranscript(value: unknown): value is TurnTranscript {
  if (!value || typeof value !== "object") {
    return false;
  }

  const transcript = value as Partial<TurnTranscript>;
  return (
    (transcript.command === undefined || typeof transcript.command === "string")
    && (transcript.risk === undefined || isRiskDecision(transcript.risk))
    && (transcript.planner === undefined || isTurnTranscriptPlanner(transcript.planner))
    && typeof transcript.approvalRequired === "boolean"
    && Array.isArray(transcript.apps)
    && transcript.apps.every(isTurnTranscriptApp)
    && Array.isArray(transcript.screenshots)
    && transcript.screenshots.every(isTurnTranscriptScreenshot)
    && Array.isArray(transcript.actions)
    && transcript.actions.every(isTurnTranscriptAction)
    && isTurnTranscriptOutcome(transcript.outcome)
  );
}

function isTurnTranscriptPlanner(value: unknown): value is NonNullable<TurnTranscript["planner"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const planner = value as NonNullable<TurnTranscript["planner"]>;
  return (
    typeof planner.providerLabel === "string"
    && typeof planner.input === "string"
    && typeof planner.command === "string"
    && (planner.rationale === undefined || typeof planner.rationale === "string")
  );
}

function isRiskDecision(value: unknown): value is TurnTranscript["risk"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const risk = value as NonNullable<TurnTranscript["risk"]>;
  return (
    isRiskLevel(risk.level)
    && typeof risk.reason === "string"
    && typeof risk.requiresApproval === "boolean"
  );
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high" || value === "blocked";
}

function isTurnTranscriptApp(value: unknown): value is TurnTranscript["apps"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const app = value as TurnTranscript["apps"][number];
  return (
    typeof app.name === "string"
    && (app.bundleId === undefined || typeof app.bundleId === "string")
    && (app.pid === undefined || typeof app.pid === "number")
  );
}

function isTurnTranscriptScreenshot(
  value: unknown
): value is TurnTranscript["screenshots"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const screenshot = value as TurnTranscript["screenshots"][number];
  return (
    (screenshot.stage === "before" || screenshot.stage === "after")
    && typeof screenshot.path === "string"
    && typeof screenshot.bundleId === "string"
    && (screenshot.pid === undefined || typeof screenshot.pid === "number")
    && (
      screenshot.accessibilityTrusted === undefined
      || typeof screenshot.accessibilityTrusted === "boolean"
    )
    && (
      screenshot.grounding === undefined
      || isTurnTranscriptGrounding(screenshot.grounding)
    )
  );
}

function isTurnTranscriptGrounding(
  value: unknown
): value is NonNullable<TurnTranscript["screenshots"][number]["grounding"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const grounding = value as NonNullable<TurnTranscript["screenshots"][number]["grounding"]>;
  return (
    typeof grounding.recommendation === "string"
    && Array.isArray(grounding.sources)
    && grounding.sources.every(isTurnTranscriptGroundingSource)
  );
}

function isTurnTranscriptGroundingSource(
  value: unknown
): value is NonNullable<TurnTranscript["screenshots"][number]["grounding"]>["sources"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const source =
    value as NonNullable<TurnTranscript["screenshots"][number]["grounding"]>["sources"][number];
  return (
    typeof source.source === "string"
    && typeof source.status === "string"
    && typeof source.observedElementCount === "number"
    && typeof source.labelCount === "number"
    && (source.notes === undefined
      || (Array.isArray(source.notes) && source.notes.every((note) => typeof note === "string")))
  );
}

function isTurnTranscriptAction(value: unknown): value is TurnTranscript["actions"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const action = value as TurnTranscript["actions"][number];
  return (
    typeof action.type === "string"
    && (action.appName === undefined || typeof action.appName === "string")
    && (action.bundleId === undefined || typeof action.bundleId === "string")
    && (action.pid === undefined || typeof action.pid === "number")
    && (action.text === undefined || typeof action.text === "string")
    && (action.key === undefined || typeof action.key === "string")
    && (action.action === undefined || typeof action.action === "string")
    && (action.stage === undefined || typeof action.stage === "string")
    && (action.reason === undefined || typeof action.reason === "string")
    && (action.providerLabel === undefined || typeof action.providerLabel === "string")
    && (action.command === undefined || typeof action.command === "string")
    && (action.rationale === undefined || typeof action.rationale === "string")
  );
}

function isTurnTranscriptOutcome(value: unknown): value is TurnTranscriptOutcome {
  return (
    value === "completed"
    || value === "approval_required"
    || value === "verification_failed"
    || value === "failed"
    || value === "running"
  );
}

function isTurnReplayTimelineEvent(
  value: unknown
): value is TurnReplay["timeline"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as TurnReplay["timeline"][number];
  return (
    isTaskStatus(event.status)
    && (event.message === undefined || typeof event.message === "string")
    && (event.command === undefined || typeof event.command === "string")
  );
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && taskStatuses.has(value as TaskStatus);
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
    && isPermissionStatus(summary.speechRecognition)
  );
}

function isNativeSpeechStatus(value: unknown): value is NativeSpeechStatus {
  if (!value || typeof value !== "object") {
    return false;
  }

  const status = value as Partial<NativeSpeechStatus>;
  return (
    typeof status.locale === "string"
    && typeof status.recognizerAvailable === "boolean"
    && isPermissionStatus(status.speechRecognition)
    && isPermissionStatus(status.microphone)
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
    || value === "speech-recognition"
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
    microphone: { state: "unknown" },
    speechRecognition: { state: "unknown" }
  };
}

function createUnknownNativeSpeechStatus(locale: string): NativeSpeechStatus {
  return {
    locale,
    recognizerAvailable: false,
    speechRecognition: { state: "unknown" },
    microphone: { state: "unknown" }
  };
}

function createDefaultDictationSettings(): DictationSettings {
  return {
    provider: "doubao",
    doubaoVoiceTrigger: "skfiy-shortcut",
    doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space",
    nativeSpeechMaxDurationMs: 7000,
    nativeSpeechSilenceTimeoutMs: 900
  };
}

function createDefaultAppPolicySettings(): AppPolicySettings {
  return {
    apps: [
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
      { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
      { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
    ]
  };
}

function createDefaultPlannerProviderSettings(): PlannerProviderSettings {
  return {
    mode: "local-deterministic",
    externalProviderLabel: "External CUA",
    externalEndpoint: undefined,
    externalApiKeyConfigured: false
  };
}

contextBridge.exposeInMainWorld("skfiy", api);
