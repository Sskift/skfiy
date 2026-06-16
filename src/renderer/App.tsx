import { CirclePause, ExternalLink, Play, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { getPetSpriteStyle, getPetStateForTask, PET_ATLAS, type PetAtlasState } from "./pet-atlas";

export type TaskStatus =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "failed";

export type ManualMode = "active" | "quiet";
export type PetWindowMode = "compact" | "expanded";
export type DoubaoVoiceTrigger = "skfiy-shortcut" | "fn-double-tap" | "none";
export type DictationProviderSelection = "doubao" | "browser" | "native-macos";
export type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
export type PermissionSettingsTarget =
  | "screen-recording"
  | "accessibility"
  | "microphone"
  | "speech-recognition";
export type StartupWarningId = "tmux-launch" | "dev-server" | "unbundled-electron";
export type DictationProviderId = "doubao" | "browser" | "native-macos";
export type AppPolicy = "allow" | "ask" | "deny";
export type PlannerProviderMode = "local-deterministic" | "external-cua" | "disabled";
export type RiskLevel = "low" | "medium" | "high" | "blocked";
export type TurnTranscriptOutcome =
  | "completed"
  | "approval_required"
  | "verification_failed"
  | "failed"
  | "running";
export type DictationProviderState =
  | "unavailable"
  | "waiting_for_shortcut_configuration"
  | "listening"
  | "no_transcript"
  | "cancelled"
  | "stopped"
  | "failed";

export interface DictationPreparation {
  providerId?: DictationProviderId;
  voiceTrigger: DoubaoVoiceTrigger;
  nativeDictationActive?: boolean;
  providerState?: DictationProviderState;
  sessionId?: string;
}

export interface DictationProviderEvent {
  providerId: DictationProviderId;
  state: DictationProviderState;
  message: string;
}

export interface DictationTranscriptUpdate {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

export interface DictationTranscriptEvent extends DictationTranscriptUpdate {
  providerId: DictationProviderId;
  sessionId?: string;
}

export interface DictationSettings {
  provider: DictationProviderSelection;
  doubaoVoiceTrigger: Exclude<DoubaoVoiceTrigger, "none">;
  doubaoShortcutLabel: string;
}

export interface ControlledAppPolicyEntry {
  name: string;
  bundleId: string;
  policy: AppPolicy;
}

export interface AppPolicySettings {
  apps: ControlledAppPolicyEntry[];
}

export interface PlannerProviderSettings {
  mode: PlannerProviderMode;
  externalProviderLabel: string;
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}

export interface TurnTranscript {
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
    bundleId?: string;
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
    actionType?: string;
    status?: string;
    stage?: string;
    message?: string;
    reason?: string;
    providerLabel?: string;
    command?: string;
    rationale?: string;
  }>;
  outcome: TurnTranscriptOutcome;
}

export interface TurnReplay {
  transcript: TurnTranscript;
  timeline: Array<{
    status: TaskStatus;
    message?: string;
    command?: string;
  }>;
}

export interface PermissionSummary {
  screenRecording: { state: PermissionState };
  accessibility: { state: PermissionState };
  microphone: { state: PermissionState };
  speechRecognition: { state: PermissionState };
}

export interface StartupWarning {
  id: StartupWarningId;
  title: string;
  message: string;
}

export interface RuntimeStatus {
  stopTurnHotkey: {
    accelerator: string;
    label: string;
    registered: boolean;
  };
}

export interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
  replayReset?: boolean;
  replayRecord?: ObserveAppReplayRecord;
  finderSelection?: FinderSelectionResult;
  finderPlanPreview?: FinderPlanPreview;
}

export interface FinderPlanPreview {
  rootPath: string;
  operationCount: number;
  destructiveOperationCount: number;
  createFolders: string[];
  moveFiles: Array<{
    from: string;
    to: string;
  }>;
}

export interface FinderSelectionResult {
  source: "finder-applescript";
  frontmostBundleId?: string;
  targetPath?: string;
  selection: Array<{
    path: string;
    name: string;
    kind: "file" | "directory" | "other";
  }>;
}

export interface ObserveAppReplayRecord {
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

export interface DesktopApi {
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
  openPermissionSettings: (permission: PermissionSettingsTarget) => Promise<void>;
  getStartupWarnings: () => Promise<StartupWarning[]>;
  getDictationSettings: () => Promise<DictationSettings>;
  setDictationSettings: (
    update: Partial<Pick<DictationSettings, "provider">>
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

interface BrowserSpeechRecognitionResult {
  0?: {
    transcript?: string;
    confidence?: number;
  };
  isFinal?: boolean;
}

interface BrowserSpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
}

interface BrowserSpeechRecognitionErrorEvent {
  error?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    skfiy?: DesktopApi;
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

interface TaskView {
  status: TaskStatus;
  message: string;
  finderPlanPreview?: FinderPlanPreview;
}

interface PetDragState {
  pointerId: number;
  lastScreenX: number;
  lastScreenY: number;
  moved: boolean;
}

const STATUS_COPY: Record<TaskStatus, { label: string; message: string; pulse: string }> = {
  idle: {
    label: "Idle",
    message: "待命中.",
    pulse: "Tucked"
  },
  observing: {
    label: "Observing",
    message: "正在看桌面.",
    pulse: "Review"
  },
  executing: {
    label: "Executing",
    message: "正在执行.",
    pulse: "Running"
  },
  approval_required: {
    label: "Approval required",
    message: "需要确认.",
    pulse: "Waiting"
  },
  needs_confirmation: {
    label: "Needs confirmation",
    message: "需要人工确认.",
    pulse: "Waiting"
  },
  completed: {
    label: "Completed",
    message: "完成了.",
    pulse: "Waving"
  },
  failed: {
    label: "Failed",
    message: "执行失败.",
    pulse: "Fault"
  }
};

const PERMISSION_ROWS: Array<{
  key: keyof PermissionSummary;
  settingsTarget: PermissionSettingsTarget;
  label: string;
}> = [
  { key: "screenRecording", settingsTarget: "screen-recording", label: "屏幕录制" },
  { key: "accessibility", settingsTarget: "accessibility", label: "辅助功能" },
  { key: "microphone", settingsTarget: "microphone", label: "麦克风" },
  { key: "speechRecognition", settingsTarget: "speech-recognition", label: "语音识别" }
];

const PERMISSION_STATE_COPY: Record<PermissionState, string> = {
  granted: "已授权",
  denied: "未授权",
  "not-determined": "待授权",
  unknown: "未知"
};

const BLOCKING_PERMISSION_STATES: readonly PermissionState[] = ["denied", "not-determined"];

const APP_POLICY_OPTIONS: Array<{ policy: AppPolicy; label: string }> = [
  { policy: "allow", label: "允许" },
  { policy: "ask", label: "询问" },
  { policy: "deny", label: "拒绝" }
];

const PLANNER_PROVIDER_OPTIONS: Array<{ mode: PlannerProviderMode; label: string; aria: string }> = [
  { mode: "local-deterministic", label: "本地确定性", aria: "选择本地确定性规划" },
  { mode: "external-cua", label: "External CUA", aria: "选择 External CUA 规划" },
  { mode: "disabled", label: "关闭", aria: "选择关闭规划" }
];

const DICTATION_PROVIDER_OPTIONS: Array<{
  provider: DictationProviderSelection;
  label: string;
  aria: string;
}> = [
  { provider: "doubao", label: "豆包", aria: "选择豆包语音" },
  { provider: "browser", label: "浏览器", aria: "选择浏览器语音" },
  { provider: "native-macos", label: "macOS", aria: "选择 macOS 系统语音" }
];

const UNKNOWN_PERMISSIONS: PermissionSummary = {
  screenRecording: { state: "unknown" },
  accessibility: { state: "unknown" },
  microphone: { state: "unknown" },
  speechRecognition: { state: "unknown" }
};

const DEFAULT_DICTATION_SETTINGS: DictationSettings = {
  provider: "doubao",
  doubaoVoiceTrigger: "skfiy-shortcut",
  doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space"
};

const DEFAULT_APP_POLICY_SETTINGS: AppPolicySettings = {
  apps: [
    { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
    { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
    { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
  ]
};

const DEFAULT_PLANNER_PROVIDER_SETTINGS: PlannerProviderSettings = {
  mode: "local-deterministic",
  externalProviderLabel: "External CUA",
  externalEndpoint: undefined,
  externalApiKeyConfigured: false
};

const fallbackApi: DesktopApi = {
  runCommand: async () => undefined,
  prepareDictation: async () => ({ voiceTrigger: "none" }),
  stopDictation: async () => undefined,
  updateDictationTranscript: async () => undefined,
  submitDictation: async () => undefined,
  approveTask: async () => undefined,
  denyTask: async () => undefined,
  takeScreenshot: async () => undefined,
  stopTask: async () => undefined,
  getPermissions: async () => UNKNOWN_PERMISSIONS,
  openPermissionSettings: async () => undefined,
  getStartupWarnings: async () => [],
  getDictationSettings: async () => DEFAULT_DICTATION_SETTINGS,
  setDictationSettings: async (update) => ({
    ...DEFAULT_DICTATION_SETTINGS,
    provider: isDictationProviderSelection(update.provider) ? update.provider : "doubao"
  }),
  getAppPolicySettings: async () => DEFAULT_APP_POLICY_SETTINGS,
  setAppPolicy: async (update) => ({
    apps: DEFAULT_APP_POLICY_SETTINGS.apps.map((entry) =>
      entry.bundleId === update.bundleId
        ? { ...entry, policy: update.policy }
        : entry
    )
  }),
  getPlannerProviderSettings: async () => DEFAULT_PLANNER_PROVIDER_SETTINGS,
  setPlannerProviderSettings: async (update) => ({
    ...DEFAULT_PLANNER_PROVIDER_SETTINGS,
    mode: update.mode ?? DEFAULT_PLANNER_PROVIDER_SETTINGS.mode
  }),
  getTurnReplay: async () => null,
  getRuntimeStatus: async () => ({
    stopTurnHotkey: {
      accelerator: "",
      label: "",
      registered: false
    }
  }),
  moveWindowBy: () => undefined,
  setWindowMode: () => undefined,
  onDictationProviderEvent: () => () => undefined,
  onDictationTranscriptEvent: () => () => undefined,
  onStopTurnHotkey: () => () => undefined,
  onTaskEvent: () => () => undefined
};

const DICTATION_AUTO_SUBMIT_DELAY_MS = 900;
const MIN_BROWSER_ASR_AUTO_SUBMIT_CONFIDENCE = 0.55;

function getDesktopApi(): DesktopApi {
  return window.skfiy ?? fallbackApi;
}

function isDictationProviderSelection(value: unknown): value is DictationProviderSelection {
  return value === "doubao" || value === "browser" || value === "native-macos";
}

function readDictationProviderLabel(provider: DictationProviderSelection): string {
  return DICTATION_PROVIDER_OPTIONS.find((option) => option.provider === provider)?.label ?? "语音";
}

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function readSpeechTranscript(event: BrowserSpeechRecognitionResultEvent): string {
  const parts: string[] = [];

  for (let index = 0; index < event.results.length; index += 1) {
    const transcript = event.results[index]?.[0]?.transcript;
    if (transcript) {
      parts.push(transcript);
    }
  }

  return parts.join("").trim();
}

function readSpeechTranscriptUpdate(
  event: BrowserSpeechRecognitionResultEvent
): DictationTranscriptUpdate {
  let isFinal = false;
  let confidence: number | undefined;

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (result?.isFinal) {
      isFinal = true;
    }

    const nextConfidence = result?.[0]?.confidence;
    if (typeof nextConfidence === "number" && Number.isFinite(nextConfidence)) {
      confidence = nextConfidence;
    }
  }

  return {
    text: readSpeechTranscript(event),
    isFinal,
    confidence
  };
}

function mergeReplayRecord(
  records: ObserveAppReplayRecord[],
  nextRecord: ObserveAppReplayRecord
): ObserveAppReplayRecord[] {
  const byStage = new Map<ObserveAppReplayRecord["stage"], ObserveAppReplayRecord>();

  for (const record of records) {
    byStage.set(record.stage, record);
  }

  byStage.set(nextRecord.stage, nextRecord);
  return ["before", "after"].flatMap((stage) => {
    const record = byStage.get(stage as ObserveAppReplayRecord["stage"]);
    return record ? [record] : [];
  });
}

function getReplayAccessibilityLabel(record: ObserveAppReplayRecord): string {
  if (record.accessibilityTrusted === true) {
    return "AX ok";
  }

  if (record.accessibilityTrusted === false) {
    return "AX denied";
  }

  return "AX unknown";
}

function getReplayOcrLabel(record: ObserveAppReplayRecord): string | null {
  if (!record.ocrLabels) {
    return null;
  }

  return `OCR ${record.ocrLabels.length}`;
}

function TaskReplay({ records }: { records: ObserveAppReplayRecord[] }) {
  if (records.length === 0) {
    return null;
  }

  return (
    <div className="task-replay" aria-label="Computer Use replay">
      {records.map((record) => (
        <div className="task-replay-row" key={record.stage}>
          <strong>{record.stage}</strong>
          <span title={record.screenshotPath}>{record.screenshotPath}</span>
          <em data-state={record.accessibilityTrusted === false ? "denied" : "ok"}>
            {getReplayAccessibilityLabel(record)}
          </em>
          {getReplayOcrLabel(record) ? (
            <em data-state="ok">{getReplayOcrLabel(record)}</em>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FinderPlanPreviewSummary({ preview }: { preview: FinderPlanPreview }) {
  return (
    <div className="finder-plan-preview" aria-label="Finder plan preview">
      <strong>Finder plan preview</strong>
      <div className="finder-plan-stats">
        <span>{preview.operationCount} operations</span>
        <span>{preview.destructiveOperationCount} destructive</span>
        <span>{preview.moveFiles.length} moves</span>
      </div>
      <div className="finder-plan-moves">
        {preview.moveFiles.slice(0, 3).map((move) => (
          <em key={`${move.from}->${move.to}`}>
            {formatFinderPreviewMove(move, preview.rootPath)}
          </em>
        ))}
      </div>
    </div>
  );
}

function formatFinderPreviewMove(
  move: FinderPlanPreview["moveFiles"][number],
  rootPath: string
): string {
  return `${readPathPreview(move.from, rootPath)} -> ${readPathPreview(move.to, rootPath)}`;
}

function readPathPreview(filePath: string, rootPath: string): string {
  const normalizedRoot = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
  return filePath.startsWith(normalizedRoot)
    ? filePath.slice(normalizedRoot.length)
    : filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

function LocalReplayViewer({ replay }: { replay: TurnReplay | null }) {
  const transcript = replay?.transcript;

  return (
    <div className="turn-replay-panel" aria-label="本地回放">
      <div className="turn-replay-heading">
        <strong>本地回放</strong>
        <span>{transcript?.outcome ?? "empty"}</span>
      </div>
      {transcript ? (
        <>
          <div className="turn-replay-summary">
            <span>命令</span>
            <strong>{transcript.command ?? "未记录"}</strong>
            <span>风险</span>
            <strong>{transcript.risk?.level ?? "unknown"}</strong>
          </div>
          <ReplayList
            title="规划"
            items={transcript.planner ? [formatReplayPlanner(transcript.planner)] : []}
          />
          <ReplayList title="动作" items={transcript.actions.map(formatReplayAction)} />
          <ReplayList
            title="截图"
            items={transcript.screenshots.map((screenshot) =>
              `${screenshot.stage}: ${screenshot.path}`
                + (screenshot.grounding ? ` (${screenshot.grounding.recommendation})` : "")
            )}
          />
          <ReplayList
            title="时间线"
            items={(replay?.timeline ?? []).map((event) =>
              `${event.status}: ${event.message ?? event.command ?? ""}`
            )}
          />
        </>
      ) : (
        <p>暂无回放</p>
      )}
    </div>
  );
}

function ReplayList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="turn-replay-list">
      <span>{title}</span>
      {items.map((item, index) => (
        <em key={`${title}-${index}`}>{item}</em>
      ))}
    </div>
  );
}

function formatReplayPlanner(planner: NonNullable<TurnTranscript["planner"]>): string {
  return `${planner.providerLabel}: ${planner.command}`
    + (planner.rationale ? ` (${planner.rationale})` : "");
}

function formatReplayAction(action: TurnTranscript["actions"][number]): string {
  if (action.type === "plan") {
    return `${action.type}: ${action.providerLabel ?? ""} ${action.command ?? ""}`.trim();
  }

  if (action.type === "type_text") {
    return `${action.type}: ${action.text ?? ""}`;
  }

  if (action.type === "press_key") {
    return `${action.type}: ${action.key ?? ""}`;
  }

  if (action.type === "activate_app" || action.type === "open_session") {
    return `${action.type}: ${action.appName ?? action.bundleId ?? ""}`;
  }

  if (action.type === "recover") {
    return `${action.type}: ${action.action ?? ""} ${action.stage ?? ""}`.trim();
  }

  if (action.type === "verify") {
    const detail = action.reason ?? action.message ?? "";
    return `${action.type}: ${action.actionType ?? ""} ${action.status ?? ""} ${detail}`.trim();
  }

  return action.type;
}

function readMissingPermissionRows(permissions: PermissionSummary): typeof PERMISSION_ROWS {
  return PERMISSION_ROWS.filter((permission) =>
    BLOCKING_PERMISSION_STATES.includes(permissions[permission.key].state)
  );
}

function DesktopPet({
  state,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  state: PetAtlasState;
  onClick: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const animation = PET_ATLAS.states[state];

  return (
    <div
      aria-label="skfiy Codex-style pet"
      className={`skfiy-pet pet-state-${state}`}
      data-atlas-state={state}
      data-frame-count={animation.frames}
      data-drag-mode="manual"
      data-voice-entry="left-click"
      data-settings-entry="right-click"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={getPetSpriteStyle(state)}
    >
      <span className="pet-sprite-frame" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  const api = useMemo(getDesktopApi, []);
  const [dictationText, setDictationText] = useState("");
  const [listening, setListening] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [permissionOnboardingOpen, setPermissionOnboardingOpen] = useState(false);
  const [permissions, setPermissions] = useState<PermissionSummary>(UNKNOWN_PERMISSIONS);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [startupWarnings, setStartupWarnings] = useState<StartupWarning[]>([]);
  const [dictationSettings, setDictationSettings] = useState<DictationSettings>(
    DEFAULT_DICTATION_SETTINGS
  );
  const [appPolicySettings, setAppPolicySettings] = useState<AppPolicySettings>(
    DEFAULT_APP_POLICY_SETTINGS
  );
  const [plannerProviderSettings, setPlannerProviderSettings] =
    useState<PlannerProviderSettings>(DEFAULT_PLANNER_PROVIDER_SETTINGS);
  const [turnReplay, setTurnReplay] = useState<TurnReplay | null>(null);
  const [dictationProvider, setDictationProvider] = useState<DictationProviderEvent | null>(null);
  const [dictationTranscriptCandidate, setDictationTranscriptCandidate] =
    useState<DictationTranscriptUpdate | null>(null);
  const [task, setTask] = useState<TaskView>({
    status: "idle",
    message: STATUS_COPY.idle.message,
    finderPlanPreview: undefined
  });
  const [replayRecords, setReplayRecords] = useState<ObserveAppReplayRecord[]>([]);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDictationSubmitRef = useRef("");
  const petDragRef = useRef<PetDragState | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const nativeDictationActiveRef = useRef(false);
  const voiceSessionIdRef = useRef<string | undefined>(undefined);
  const manualDictationTextRef = useRef<string | null>(null);
  const suppressNextPetClickRef = useRef(false);

  function stopBrowserSpeechRecognition() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.stop();
    recognitionRef.current = null;
  }

  function startBrowserSpeechRecognition(): boolean {
    stopBrowserSpeechRecognition();

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setListening(false);
      setTask({
        status: "failed",
        message: "当前环境不支持语音识别."
      });
      return false;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";
    recognition.onresult = (event) => {
      const transcriptUpdate = readSpeechTranscriptUpdate(event);
      setDictationTranscriptCandidate(transcriptUpdate);
      manualDictationTextRef.current = null;
      setDictationText(transcriptUpdate.text);

      if (transcriptUpdate.text) {
        void api.updateDictationTranscript(voiceSessionIdRef.current, transcriptUpdate);
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      setTask({
        status: "failed",
        message: `语音识别失败${event.error ? `: ${event.error}` : "."}`
      });
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
      return true;
    } catch (error) {
      recognitionRef.current = null;
      setListening(false);
      setTask({
        status: "failed",
        message: error instanceof Error ? error.message : "语音识别启动失败."
      });
      return false;
    }
  }

  useEffect(() => {
    return api.onTaskEvent((event) => {
      setTask({
        status: event.status,
        message: event.message ?? STATUS_COPY[event.status].message,
        finderPlanPreview: event.finderPlanPreview
      });
      setReplayRecords((records) => {
        if (event.replayReset) {
          return event.replayRecord ? [event.replayRecord] : [];
        }

        if (event.replayRecord) {
          return mergeReplayRecord(records, event.replayRecord);
        }

        return event.status === "idle" ? [] : records;
      });

      if (event.status !== "idle") {
        stopBrowserSpeechRecognition();
        nativeDictationActiveRef.current = false;
        setDictationTranscriptCandidate(null);
        manualDictationTextRef.current = null;
        setListening(false);
        setDetailsOpen(false);
        setDictationProvider(null);
      }
    });
  }, [api]);

  useEffect(() => {
    return api.onDictationProviderEvent((event) => {
      setDictationProvider(event);

      if (event.state === "listening") {
        setListening(true);
      } else if (
        event.state === "no_transcript"
        || event.state === "cancelled"
        || event.state === "stopped"
        || event.state === "failed"
        || event.state === "unavailable"
      ) {
        setListening(false);
      }
    });
  }, [api]);

  useEffect(() => {
    return api.onDictationTranscriptEvent((event) => {
      if (event.sessionId && event.sessionId !== voiceSessionIdRef.current) {
        return;
      }

      const transcriptUpdate = {
        text: event.text,
        isFinal: event.isFinal,
        confidence: event.confidence
      };
      setDictationTranscriptCandidate(transcriptUpdate);
      manualDictationTextRef.current = null;
      setDictationText(event.text);
    });
  }, [api]);

  useEffect(() => {
    return () => stopBrowserSpeechRecognition();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void api.getStartupWarnings().then((warnings) => {
      if (!cancelled) {
        setStartupWarnings(warnings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    void api.getDictationSettings().then((settings) => {
      if (!cancelled) {
        setDictationSettings(settings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    void api.getAppPolicySettings().then((settings) => {
      if (!cancelled) {
        setAppPolicySettings(settings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    void api.getPlannerProviderSettings().then((settings) => {
      if (!cancelled) {
        setPlannerProviderSettings(settings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const refreshPermissions = useCallback(async () => {
    setPermissionsLoading(true);

    try {
      const nextPermissions = await api.getPermissions();
      setPermissions(nextPermissions);
      return nextPermissions;
    } catch {
      setPermissions(UNKNOWN_PERMISSIONS);
      return UNKNOWN_PERMISSIONS;
    } finally {
      setPermissionsLoading(false);
    }
  }, [api]);

  const refreshTurnReplay = useCallback(async () => {
    try {
      setTurnReplay(await api.getTurnReplay());
    } catch {
      setTurnReplay(null);
    }
  }, [api]);

  useEffect(() => {
    if (detailsOpen) {
      void refreshPermissions();
      void refreshTurnReplay();
    }
  }, [detailsOpen, refreshPermissions, refreshTurnReplay]);

  useEffect(() => {
    if (listening) {
      transcriptRef.current?.focus();
    }
  }, [listening]);

  const submitDictation = useCallback(
    async (rawCommand: string) => {
      const nextCommand = rawCommand.trim();
      if (!nextCommand || nextCommand === lastDictationSubmitRef.current) {
        return;
      }

      lastDictationSubmitRef.current = nextCommand;
      const shouldStopNativeDictation = nativeDictationActiveRef.current;
      const sessionId = voiceSessionIdRef.current;
      voiceSessionIdRef.current = undefined;
      nativeDictationActiveRef.current = false;
      setDictationTranscriptCandidate(null);
      manualDictationTextRef.current = null;
      stopBrowserSpeechRecognition();
      setListening(false);
      setDetailsOpen(false);
      setDictationText("");
      setTask({
        status: "executing",
        message: `听到: ${nextCommand}`
      });

      try {
        await api.submitDictation(sessionId, nextCommand, {
          stopNativeDictation: shouldStopNativeDictation
        });
      } catch {
        setTask({
          status: "failed",
          message: "语音指令发送失败."
        });
      }
    },
    [api]
  );

  function canAutoSubmitDictation(command: string): boolean {
    if (!dictationTranscriptCandidate && (nativeDictationActiveRef.current || !recognitionRef.current)) {
      return true;
    }

    if (manualDictationTextRef.current?.trim() === command) {
      return true;
    }

    const candidate = dictationTranscriptCandidate;

    if (!candidate || candidate.text.trim() !== command) {
      return false;
    }

    if (!candidate.isFinal) {
      return false;
    }

    return candidate.confidence === undefined
      || candidate.confidence >= MIN_BROWSER_ASR_AUTO_SUBMIT_CONFIDENCE;
  }

  useEffect(() => {
    if (!listening) {
      return undefined;
    }

    const nextCommand = dictationText.trim();
    if (!nextCommand || nextCommand === lastDictationSubmitRef.current) {
      return undefined;
    }

    if (!canAutoSubmitDictation(nextCommand)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void submitDictation(nextCommand);
    }, DICTATION_AUTO_SUBMIT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [dictationTranscriptCandidate, dictationText, listening, submitDictation]);

  async function startDictation() {
    lastDictationSubmitRef.current = "";
    setDictationText("");
    setDictationTranscriptCandidate(null);
    manualDictationTextRef.current = null;
    setListening(true);
    setDetailsOpen(false);
    setPermissionOnboardingOpen(false);
    setTask({
      status: "idle",
      message: "正在听你说."
    });

    try {
      const preparation = await api.prepareDictation();
      voiceSessionIdRef.current = preparation.sessionId;

      if (preparation.providerState === "failed" || preparation.providerState === "unavailable") {
        voiceSessionIdRef.current = undefined;
        nativeDictationActiveRef.current = false;
        setListening(false);
        return;
      }

      nativeDictationActiveRef.current =
        preparation.nativeDictationActive ?? preparation.voiceTrigger !== "none";

      if (!nativeDictationActiveRef.current && !startBrowserSpeechRecognition()) {
        return;
      }
    } catch {
      voiceSessionIdRef.current = undefined;
      setListening(false);
      setTask({
        status: "failed",
        message: "语音准备失败."
      });
      return;
    }

    transcriptRef.current?.focus();
  }

  async function stopDictation() {
    lastDictationSubmitRef.current = "";
    const sessionId = voiceSessionIdRef.current;
    voiceSessionIdRef.current = undefined;
    setDictationTranscriptCandidate(null);
    manualDictationTextRef.current = null;
    stopBrowserSpeechRecognition();
    nativeDictationActiveRef.current = false;
    setListening(false);
    setDetailsOpen(false);
    setPermissionOnboardingOpen(false);
    setDictationText("");
    setDictationProvider(null);
    setTask({
      status: "idle",
      message: STATUS_COPY.idle.message
    });

    try {
      await api.stopDictation(sessionId);
    } catch {
      setTask({
        status: "failed",
        message: "停止语音失败."
      });
    }
  }

  const stopCurrentTurn = useCallback(async () => {
    if (listening) {
      await stopDictation();
      return;
    }

    if (
      task.status === "observing"
      || task.status === "executing"
      || task.status === "approval_required"
      || task.status === "needs_confirmation"
    ) {
      setDetailsOpen(false);
      setDictationProvider(null);
      setTask({
        status: "idle",
        message: STATUS_COPY.idle.message
      });

      try {
        await api.stopTask();
      } catch {
        setTask({
          status: "failed",
          message: "停止任务失败."
        });
      }
    }
  }, [api, listening, task.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      void stopCurrentTurn();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stopCurrentTurn]);

  useEffect(() => {
    return api.onStopTurnHotkey(() => {
      void stopCurrentTurn();
    });
  }, [api, stopCurrentTurn]);

  async function approveTask() {
    setDetailsOpen(false);

    try {
      await api.approveTask();
    } catch {
      setTask({
        status: "failed",
        message: "确认请求失败."
      });
    }
  }

  async function denyTask() {
    setDetailsOpen(false);

    try {
      await api.denyTask();
    } catch {
      setTask({
        status: "failed",
        message: "拒绝请求失败."
      });
    }
  }

  async function openPermissionSettings(permission: PermissionSettingsTarget) {
    try {
      await api.openPermissionSettings(permission);
      const nextPermissions = await refreshPermissions();
      if (permissionOnboardingOpen && readMissingPermissionRows(nextPermissions).length === 0) {
        setPermissionOnboardingOpen(false);
      }
    } catch {
      setTask({
        status: "failed",
        message: "打开系统设置失败."
      });
    }
  }

  async function refreshPermissionOnboarding() {
    const nextPermissions = await refreshPermissions();
    if (readMissingPermissionRows(nextPermissions).length === 0) {
      setPermissionOnboardingOpen(false);
      setTask({
        status: "idle",
        message: "权限已就绪，再次左键开始语音."
      });
    }
  }

  async function selectDictationProvider(provider: DictationProviderSelection) {
    try {
      setDictationSettings(await api.setDictationSettings({ provider }));
    } catch {
      setTask({
        status: "failed",
        message: "切换语音入口失败."
      });
    }
  }

  async function selectAppPolicy(bundleId: string, policy: AppPolicy) {
    try {
      setAppPolicySettings(await api.setAppPolicy({ bundleId, policy }));
    } catch {
      setTask({
        status: "failed",
        message: "切换应用策略失败."
      });
    }
  }

  async function selectPlannerProviderMode(mode: PlannerProviderMode) {
    try {
      setPlannerProviderSettings(await api.setPlannerProviderSettings({ mode }));
    } catch {
      setTask({
        status: "failed",
        message: "切换规划模式失败."
      });
    }
  }

  function startPetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    petDragRef.current = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = petDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.screenX - drag.lastScreenX;
    const deltaY = event.screenY - drag.lastScreenY;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    petDragRef.current = {
      pointerId: drag.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      moved: true
    };
    api.moveWindowBy(deltaX, deltaY);
  }

  function stopPetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = petDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    petDragRef.current = null;

    if (drag.moved) {
      suppressNextPetClickRef.current = true;
    }
  }

  function startDictationFromPet() {
    if (suppressNextPetClickRef.current) {
      suppressNextPetClickRef.current = false;
      return;
    }

    void startDictationAfterPermissionCheck();
  }

  async function startDictationAfterPermissionCheck() {
    const nextPermissions = await refreshPermissions();
    const missingPermissions = readMissingPermissionRows(nextPermissions);

    if (missingPermissions.length > 0) {
      lastDictationSubmitRef.current = "";
      setDictationText("");
      stopBrowserSpeechRecognition();
      nativeDictationActiveRef.current = false;
      setListening(false);
      setDetailsOpen(false);
      setPermissionOnboardingOpen(true);
      setTask({
        status: "idle",
        message: "需要授权后才能开始."
      });
      return;
    }

    setPermissionOnboardingOpen(false);
    await startDictation();
  }

  function toggleDetailsFromPet(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    lastDictationSubmitRef.current = "";
    setDictationText("");
    stopBrowserSpeechRecognition();
    setPermissionOnboardingOpen(false);
    if (nativeDictationActiveRef.current) {
      nativeDictationActiveRef.current = false;
      void api.stopDictation();
    }
    setListening(false);

    setDetailsOpen((open) => !open);
  }

  const status = STATUS_COPY[task.status];
  const petState = getPetStateForTask(listening ? "observing" : task.status);
  const startupWarning = startupWarnings[0];
  const showStartupWarning = Boolean(startupWarning)
    && !listening
    && !detailsOpen
    && !permissionOnboardingOpen
    && task.status === "idle";
  const showProviderStatus = Boolean(dictationProvider)
    && !listening
    && !detailsOpen
    && !permissionOnboardingOpen
    && task.status === "idle";
  const showPanel =
    listening
    || detailsOpen
    || permissionOnboardingOpen
    || task.status !== "idle"
    || showStartupWarning
    || showProviderStatus;
  const permissionOnboardingRows = readMissingPermissionRows(permissions);

  useEffect(() => {
    api.setWindowMode(showPanel ? "expanded" : "compact");
  }, [api, showPanel]);

  return (
    <main
      className={`pet-stage status-${task.status}${listening ? " listening" : ""}${showPanel ? " panel-open" : ""}`}
      aria-label="skfiy desktop pet"
    >
      <div className="status-orb" role="status" aria-label="Task status">
        <strong>{status.label}</strong>
        <span>{status.pulse}</span>
      </div>

      {showPanel ? (
        <section
          className={`voice-bubble${detailsOpen || permissionOnboardingOpen ? " settings-bubble" : ""}`}
          aria-label={
            detailsOpen
              ? "skfiy settings"
              : permissionOnboardingOpen
                ? "权限引导"
                : "skfiy voice status"
          }
        >
          {detailsOpen ? (
            <>
              <p>设置</p>
              <div className="provider-panel" aria-label="语音入口">
                <div className="provider-heading">
                  <strong>语音入口</strong>
                  <span>{readDictationProviderLabel(dictationSettings.provider)}</span>
                </div>
                <div className="provider-switch" role="group" aria-label="ASR provider">
                  {DICTATION_PROVIDER_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.provider}
                      aria-label={option.aria}
                      aria-pressed={dictationSettings.provider === option.provider}
                      onClick={() => void selectDictationProvider(option.provider)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-grid">
                <span>入口</span>
                <strong>左键</strong>
                <span>豆包输入法语音快捷键</span>
                <strong>{dictationSettings.doubaoShortcutLabel}</strong>
              </div>
              <div className="app-policy-panel" aria-label="应用策略">
                <div className="app-policy-heading">
                  <strong>应用策略</strong>
                  <span>Computer Use</span>
                </div>
                <div className="app-policy-list">
                  {appPolicySettings.apps.map((entry) => (
                    <div className="app-policy-row" key={entry.bundleId}>
                      <span>{entry.name}</span>
                      <div className="app-policy-switch" role="group" aria-label={`${entry.name} policy`}>
                        {APP_POLICY_OPTIONS.map((option) => (
                          <button
                            type="button"
                            key={option.policy}
                            aria-label={`${option.label} ${entry.name}`}
                            aria-pressed={entry.policy === option.policy}
                            onClick={() => void selectAppPolicy(entry.bundleId, option.policy)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="app-policy-panel" aria-label="规划模式">
                <div className="app-policy-heading">
                  <strong>规划模式</strong>
                  <span>
                    {plannerProviderSettings.mode === "external-cua"
                      ? plannerProviderSettings.externalProviderLabel
                      : "Computer Use"}
                  </span>
                </div>
                <div className="provider-switch" role="group" aria-label="Computer Use planner">
                  {PLANNER_PROVIDER_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.mode}
                      aria-label={option.aria}
                      aria-pressed={plannerProviderSettings.mode === option.mode}
                      onClick={() => void selectPlannerProviderMode(option.mode)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {plannerProviderSettings.mode === "external-cua" ? (
                  <div className="settings-grid" aria-label="External CUA 配置">
                    <span>Endpoint</span>
                    <strong>
                      {plannerProviderSettings.externalEndpoint ? "Endpoint 已配置" : "Endpoint 未配置"}
                    </strong>
                    <span>API Key</span>
                    <strong>
                      {plannerProviderSettings.externalApiKeyConfigured ? "API Key 已配置" : "API Key 未配置"}
                    </strong>
                  </div>
                ) : null}
              </div>
              <LocalReplayViewer replay={turnReplay} />
              <div className="permissions-panel" aria-label="权限">
                <div className="permissions-heading">
                  <strong>权限</strong>
                  <button type="button" aria-label="刷新权限状态" onClick={() => void refreshPermissions()}>
                    <RefreshCw size={12} aria-hidden="true" />
                  </button>
                </div>
                <div className="permissions-list">
                  {PERMISSION_ROWS.map((permission) => {
                    const state = permissions[permission.key].state;
                    return (
                      <div className="permission-row" key={permission.key}>
                        <span>{permission.label}</span>
                        <strong data-state={state}>
                          {permissionsLoading ? "检查中" : PERMISSION_STATE_COPY[state]}
                        </strong>
                        <button
                          type="button"
                          aria-label={`打开${permission.label}设置`}
                          onClick={() => void openPermissionSettings(permission.settingsTarget)}
                        >
                          <ExternalLink size={12} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : permissionOnboardingOpen ? (
            <>
              <p>需要授权</p>
              <div className="permissions-panel" aria-label="缺失权限">
                <div className="permissions-heading">
                  <strong>权限</strong>
                  <button
                    type="button"
                    aria-label="刷新权限状态"
                    onClick={() => void refreshPermissionOnboarding()}
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                  </button>
                </div>
                <div className="permissions-list">
                  {permissionOnboardingRows.map((permission) => {
                    const state = permissions[permission.key].state;
                    return (
                      <div className="permission-row" key={permission.key}>
                        <span>{permission.label}</span>
                        <strong data-state={state}>
                          {permissionsLoading ? "检查中" : PERMISSION_STATE_COPY[state]}
                        </strong>
                        <button
                          type="button"
                          aria-label={`打开${permission.label}设置`}
                          onClick={() => void openPermissionSettings(permission.settingsTarget)}
                        >
                          <ExternalLink size={12} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : listening ? (
            <>
              <p>{dictationProvider?.message ?? "正在听你说"}</p>
              <textarea
                ref={transcriptRef}
                aria-label="语音转写"
                className="voice-transcript"
                value={dictationText}
                onChange={(event) => {
                  manualDictationTextRef.current = event.currentTarget.value;
                  setDictationTranscriptCandidate(null);
                  setDictationText(event.currentTarget.value);
                }}
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="voice-actions">
                <button type="button" aria-label="停止" onClick={stopDictation}>
                  <CirclePause size={14} aria-hidden="true" />
                  <span>停止</span>
                </button>
              </div>
            </>
          ) : task.status === "approval_required" ? (
            <>
              <p>{task.message}</p>
              {task.finderPlanPreview ? (
                <FinderPlanPreviewSummary preview={task.finderPlanPreview} />
              ) : null}
              <div className="approval-actions">
                <button type="button" aria-label="确认" onClick={approveTask}>
                  <Play size={14} aria-hidden="true" />
                  <span>确认</span>
                </button>
                <button type="button" aria-label="拒绝" onClick={denyTask}>
                  <CirclePause size={14} aria-hidden="true" />
                  <span>拒绝</span>
                </button>
              </div>
            </>
          ) : showProviderStatus && dictationProvider ? (
            <div className="provider-status" aria-label="语音 provider 状态">
              <strong>{readDictationProviderLabel(dictationProvider.providerId)}</strong>
              <span>{dictationProvider.message}</span>
            </div>
          ) : showStartupWarning && startupWarning ? (
            <div className="startup-warning" aria-label="启动警告">
              <strong>{startupWarning.title}</strong>
              <span>{startupWarning.message}</span>
            </div>
          ) : (
            <>
              <p>{task.message}</p>
              <TaskReplay records={replayRecords} />
            </>
          )}
        </section>
      ) : null}

      <DesktopPet
        state={petState}
        onClick={startDictationFromPet}
        onContextMenu={toggleDetailsFromPet}
        onPointerDown={startPetDrag}
        onPointerMove={movePetDrag}
        onPointerUp={stopPetDrag}
      />
    </main>
  );
}
