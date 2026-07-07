import {
  AlertTriangle,
  CheckCircle2,
  CirclePause,
  ClipboardList,
  ExternalLink,
  History,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal
} from "lucide-react";
import {
  useCallback,
  useEffect,
  type FormEvent,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  getConfiguredPetAtlas,
  getPetSpriteStyle,
  getPetStateForTask,
  isPetAtlasManifest,
  resolvePetAtlas,
  type PetAtlas,
  type PetAtlasManifest,
  type PetAtlasState
} from "./pet-atlas";
import {
  DESKTOP_SESSION_STATE_COPY,
  PERMISSION_ROWS,
  PERMISSION_STATE_COPY,
  canDismissTaskBubble,
  canStopTurn,
  formatFinderPreviewMove,
  formatReplayAction,
  formatReplayPlanner,
  getDashboardStatusCopy,
  getPermissionHealthCopy,
  getPanelVisibilityState,
  getPolicySummary,
  getRecentExecutionCopy,
  getRiskCopy,
  getReplayAccessibilityLabel,
  getReplayOcrLabel,
  readAssistantAgentProviderDetail,
  readAssistantAgentReadinessLabel,
  readDesktopSessionPermissionState,
  readExternalCuaStatusLabel,
  readMissingPermissionRows,
  readSelectedAssistantAgentProvider,
  readVisiblePetRect
} from "./app-view-model";
import {
  STATUS_COPY,
  appendAssistantConversationReply,
  appendAssistantConversationSubmission,
  appendAssistantConversationSubmissionFailure,
  createInitialTaskView,
  createAssistantSubmissionFailureTaskView,
  createAssistantSubmissionTaskView,
  createTaskViewFromEvent,
  createTaskStatusView,
  isAssistantConversationReplyEvent,
  updateReplayRecordsForTaskEvent,
  type AssistantConversationMessage,
  type TaskView
} from "./app-task-state";
import {
  INITIAL_PANEL_STATE,
  reducePanelState,
  type PanelStateAction
} from "./app-panel-state";
import {
  DEFAULT_APP_POLICY_SETTINGS,
  DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE,
  DEFAULT_PLANNER_PROVIDER_SETTINGS,
  reduceAppPolicySettings,
  reduceAssistantAgentSettingsResponse,
  reducePlannerProviderSettings
} from "./app-settings-state";

export type TaskStatus =
  | "idle"
  | "planned"
  | "observing"
  | "executing"
  | "running"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "denied"
  | "blocked"
  | "failed"
  | "cancelled";

export type ManualMode = "active" | "quiet";
export type PetWindowMode = "compact" | "expanded";
export type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
export type DesktopSessionDiagnosticState = "controllable" | "blocked" | "unknown";
export type PermissionSettingsTarget =
  | "screen-recording"
  | "accessibility";
export type StartupWarningId = "tmux-launch" | "dev-server" | "unbundled-electron";
export type AppPolicy = "allow" | "ask" | "deny";
export type AssistantAgentMode = "codex" | "claude-code" | "hermes";
export type AssistantAgentProviderReadiness = "ready" | "unconfigured" | "unavailable";
export type PlannerProviderMode = "local-deterministic" | "external-cua" | "disabled";
export type RiskLevel = "low" | "medium" | "high" | "blocked";
export type TurnTranscriptOutcome =
  | "completed"
  | "approval_required"
  | "verification_failed"
  | "denied"
  | "blocked"
  | "cancelled"
  | "failed"
  | "running";

export interface ControlledAppPolicyEntry {
  name: string;
  bundleId: string;
  policy: AppPolicy;
}

export interface AppPolicySettings {
  apps: ControlledAppPolicyEntry[];
}

export interface AssistantAgentSettings {
  mode: AssistantAgentMode;
  codexBinary: string;
  codexBinarySource: "default" | "env";
  claudeCodeBinary: string;
  claudeCodeBinarySource: "default" | "env";
  hermesBinary: string;
  hermesBinarySource: "default" | "env";
  cwd: string;
  timeoutMs: number;
}

export interface AssistantAgentProviderState {
  provider: "assistant";
  id: AssistantAgentMode;
  label: "Codex" | "Claude Code" | "Hermes";
  selected: boolean;
  configured: boolean;
  executablePath?: string;
  executableSource: "default" | "env";
  resolvedExecutablePath?: string;
  readiness: AssistantAgentProviderReadiness;
  lastError?: string;
}

export interface AssistantAgentSettingsResponse {
  settings: AssistantAgentSettings;
  providers: AssistantAgentProviderState[];
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
}

export interface PermissionDiagnostics {
  active: PermissionSummary;
  appProcess: PermissionSummary;
  helperProcess: PermissionSummary;
  mismatches: Array<{
    permission: keyof PermissionSummary;
    appProcess: PermissionState;
    helperProcess: PermissionState;
  }>;
  identity: {
    appPath: string;
    executablePath: string;
    helperPath: string;
    resourcesPath: string;
    isPackaged: boolean;
  };
}

export interface DesktopSessionStatus {
  frontmostBundleId?: string;
  frontmostLocalizedName?: string;
  frontmostProcessIdentifier?: number;
  controllable: boolean;
}

export interface DesktopSessionDiagnostics {
  state: DesktopSessionDiagnosticState;
  status: DesktopSessionStatus | null;
  reason: string;
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

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisiblePetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
  replayReset?: boolean;
  replayRecord?: ObserveAppReplayRecord;
  finderSelection?: FinderSelectionResult;
  finderPlanPreview?: FinderPlanPreview;
  tmuxSupervisionReport?: unknown;
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
  approveTask: () => Promise<void>;
  denyTask: () => Promise<void>;
  takeScreenshot: () => Promise<void>;
  stopTask: () => Promise<void>;
  getPermissions: () => Promise<PermissionSummary>;
  getPermissionDiagnostics: () => Promise<PermissionDiagnostics>;
  getDesktopSessionDiagnostics: () => Promise<DesktopSessionDiagnostics>;
  openPermissionSettings: (permission: PermissionSettingsTarget) => Promise<void>;
  getStartupWarnings: () => Promise<StartupWarning[]>;
  getAppPolicySettings: () => Promise<AppPolicySettings>;
  setAppPolicy: (update: { bundleId: string; policy: AppPolicy }) => Promise<AppPolicySettings>;
  getAssistantAgentSettings: () => Promise<AssistantAgentSettingsResponse>;
  setAssistantAgentSettings: (
    update: Partial<Pick<AssistantAgentSettings, "mode">>
  ) => Promise<AssistantAgentSettingsResponse>;
  getPlannerProviderSettings: () => Promise<PlannerProviderSettings>;
  setPlannerProviderSettings: (
    update: Partial<Pick<PlannerProviderSettings, "mode">>
  ) => Promise<PlannerProviderSettings>;
  getTurnReplay: () => Promise<TurnReplay | null>;
  getRuntimeStatus: () => Promise<RuntimeStatus>;
  getPetSkin: () => Promise<PetAtlasManifest | null>;
  getWindowBounds: () => Promise<WindowBounds | null>;
  moveWindowBy: (deltaX: number, deltaY: number, visibleRect?: VisiblePetRect) => void;
  setWindowMode: (mode: PetWindowMode) => void;
  onStopTurnHotkey: (callback: () => void) => () => void;
  onTaskEvent: (callback: (event: TaskEvent) => void) => () => void;
}

declare global {
  interface Window {
    skfiy?: DesktopApi;
  }
}

interface PetDragState {
  pointerId: number;
  lastScreenX: number;
  lastScreenY: number;
  moved: boolean;
  visibleRect: VisiblePetRect;
}

const APP_POLICY_OPTIONS: Array<{ policy: AppPolicy; label: string }> = [
  { policy: "allow", label: "允许" },
  { policy: "ask", label: "询问" },
  { policy: "deny", label: "拒绝" }
];

const ASSISTANT_AGENT_OPTIONS: Array<{ mode: AssistantAgentMode; label: string; aria: string }> = [
  { mode: "codex", label: "Codex", aria: "选择 Codex background agent" },
  { mode: "claude-code", label: "Claude Code", aria: "选择 Claude Code background agent" },
  { mode: "hermes", label: "Hermes", aria: "选择 Hermes background agent" }
];

const PLANNER_PROVIDER_OPTIONS: Array<{ mode: PlannerProviderMode; label: string; aria: string }> = [
  { mode: "local-deterministic", label: "本地确定性", aria: "选择本地确定性规划" },
  { mode: "external-cua", label: "External CUA", aria: "选择 External CUA 规划" },
  { mode: "disabled", label: "关闭", aria: "选择关闭规划" }
];

const UNKNOWN_PERMISSIONS: PermissionSummary = {
  screenRecording: { state: "unknown" },
  accessibility: { state: "unknown" }
};

const UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS: DesktopSessionDiagnostics = {
  state: "unknown",
  status: null,
  reason: "Desktop session status is unknown."
};

const fallbackApi: DesktopApi = {
  runCommand: async () => undefined,
  approveTask: async () => undefined,
  denyTask: async () => undefined,
  takeScreenshot: async () => undefined,
  stopTask: async () => undefined,
  getPermissions: async () => UNKNOWN_PERMISSIONS,
  getPermissionDiagnostics: async () => ({
    active: UNKNOWN_PERMISSIONS,
    appProcess: UNKNOWN_PERMISSIONS,
    helperProcess: UNKNOWN_PERMISSIONS,
    mismatches: [],
    identity: {
      appPath: "",
      executablePath: "",
      helperPath: "",
      resourcesPath: "",
      isPackaged: false
    }
  }),
  getDesktopSessionDiagnostics: async () => UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS,
  openPermissionSettings: async () => undefined,
  getStartupWarnings: async () => [],
  getAppPolicySettings: async () => DEFAULT_APP_POLICY_SETTINGS,
  setAppPolicy: async (update) => reduceAppPolicySettings(DEFAULT_APP_POLICY_SETTINGS, update),
  getAssistantAgentSettings: async () => DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE,
  setAssistantAgentSettings: async (update) =>
    reduceAssistantAgentSettingsResponse(DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE, update),
  getPlannerProviderSettings: async () => DEFAULT_PLANNER_PROVIDER_SETTINGS,
  setPlannerProviderSettings: async (update) =>
    reducePlannerProviderSettings(DEFAULT_PLANNER_PROVIDER_SETTINGS, update),
  getTurnReplay: async () => null,
  getRuntimeStatus: async () => ({
    stopTurnHotkey: {
      accelerator: "",
      label: "",
      registered: false
    }
  }),
  getPetSkin: async () => null,
  getWindowBounds: async () => null,
  moveWindowBy: () => undefined,
  setWindowMode: () => undefined,
  onStopTurnHotkey: () => () => undefined,
  onTaskEvent: () => () => undefined
};

function getDesktopApi(): DesktopApi {
  return window.skfiy ?? fallbackApi;
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

function DashboardSignal({
  detail,
  icon,
  label,
  tone
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className="dashboard-signal" data-tone={tone}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{label}</strong>
        <em>{detail}</em>
      </div>
    </div>
  );
}

function UserDashboardPanel({
  appPolicySettings,
  desktopSessionDiagnostics,
  onApprove,
  onDeny,
  onRefresh,
  onStop,
  permissions,
  permissionsLoading,
  plannerProviderSettings,
  task,
  turnReplay
}: {
  appPolicySettings: AppPolicySettings;
  desktopSessionDiagnostics: DesktopSessionDiagnostics;
  onApprove: () => void;
  onDeny: () => void;
  onRefresh: () => void;
  onStop: () => void;
  permissions: PermissionSummary;
  permissionsLoading: boolean;
  plannerProviderSettings: PlannerProviderSettings;
  task: TaskView;
  turnReplay: TurnReplay | null;
}) {
  const status = getDashboardStatusCopy(task);
  const permissionHealth = getPermissionHealthCopy(permissions, desktopSessionDiagnostics);
  const risk = getRiskCopy(turnReplay?.transcript.risk);
  const recent = getRecentExecutionCopy(turnReplay);
  const canStop = canStopTurn(task.status);
  const canApprove = task.status === "approval_required";

  return (
    <section className="dashboard-panel" aria-label="用户态 dashboard">
      <div className="dashboard-heading">
        <div>
          <strong>助手状态</strong>
          <span>{status.detail}</span>
        </div>
        <em data-tone={status.tone}>{status.label}</em>
      </div>

      <div className="dashboard-signals">
        <DashboardSignal
          icon={<ClipboardList size={14} />}
          label="当前任务"
          detail={status.label}
          tone={status.tone}
        />
        <DashboardSignal
          icon={permissionHealth.tone === "success" ? <ShieldCheck size={14} /> : <ShieldQuestion size={14} />}
          label={permissionsLoading ? "正在检查授权" : permissionHealth.label}
          detail={`${permissionHealth.detail} · ${getPolicySummary(appPolicySettings)}`}
          tone={permissionHealth.tone}
        />
        <DashboardSignal
          icon={risk.tone === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          label={risk.label}
          detail={risk.detail}
          tone={risk.tone}
        />
        <DashboardSignal
          icon={<History size={14} />}
          label={recent.label}
          detail={recent.detail}
          tone={recent.tone}
        />
      </div>

      <div className="dashboard-actions" aria-label="任务操作">
        <button
          type="button"
          className="dashboard-icon-action"
          aria-label="刷新 dashboard 状态"
          onClick={onRefresh}
        >
          <RefreshCw size={13} aria-hidden="true" />
        </button>
        {canStop ? (
          <button type="button" aria-label="停止任务" onClick={onStop}>
            <CirclePause size={13} aria-hidden="true" />
            <span>停止</span>
          </button>
        ) : null}
        {canApprove ? (
          <>
            <button type="button" aria-label="确认" onClick={onApprove}>
              <Play size={13} aria-hidden="true" />
              <span>确认</span>
            </button>
            <button type="button" aria-label="拒绝" onClick={onDeny}>
              <CirclePause size={13} aria-hidden="true" />
              <span>拒绝</span>
            </button>
          </>
        ) : null}
      </div>

      <div className="dashboard-runtime-strip" aria-label="运行偏好">
        <span>agent</span>
        <span>{plannerProviderSettings.mode === "disabled" ? "规划已关闭" : "规划可用"}</span>
      </div>
    </section>
  );
}

function DesktopPet({
  state,
  atlas,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  state: PetAtlasState;
  atlas: PetAtlas;
  onClick: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const animation = atlas.states[state];

  return (
    <div
      aria-label="skfiy Codex-style pet"
      className={`skfiy-pet pet-state-${state}`}
      data-pet-skin={atlas.slug}
      data-atlas-state={state}
      data-frame-count={animation.frames}
      data-drag-mode="manual"
      data-agent-entry="left-click"
      data-settings-entry="right-click"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={getPetSpriteStyle(state, atlas)}
    >
      <span className="pet-sprite-frame" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  const api = useMemo(getDesktopApi, []);
  const [petAtlas, setPetAtlas] = useState<PetAtlas>(() => getConfiguredPetAtlas());
  const [panelState, setPanelState] = useState(INITIAL_PANEL_STATE);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantInputSubmitting, setAssistantInputSubmitting] = useState(false);
  const [assistantConversation, setAssistantConversation] = useState<AssistantConversationMessage[]>([]);
  const [permissions, setPermissions] = useState<PermissionSummary>(UNKNOWN_PERMISSIONS);
  const [desktopSessionDiagnostics, setDesktopSessionDiagnostics] =
    useState<DesktopSessionDiagnostics>(UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [startupWarnings, setStartupWarnings] = useState<StartupWarning[]>([]);
  const [appPolicySettings, setAppPolicySettings] = useState<AppPolicySettings>(
    DEFAULT_APP_POLICY_SETTINGS
  );
  const [assistantAgentSettings, setAssistantAgentSettings] =
    useState<AssistantAgentSettingsResponse>(DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE);
  const [plannerProviderSettings, setPlannerProviderSettings] =
    useState<PlannerProviderSettings>(DEFAULT_PLANNER_PROVIDER_SETTINGS);
  const [turnReplay, setTurnReplay] = useState<TurnReplay | null>(null);
  const [task, setTask] = useState<TaskView>(() => createInitialTaskView());
  const [replayRecords, setReplayRecords] = useState<ObserveAppReplayRecord[]>([]);
  const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);
  const petDragRef = useRef<PetDragState | null>(null);
  const pendingAssistantPromptRef = useRef<string | null>(null);
  const suppressNextPetClickRef = useRef(false);
  const { assistantPanelOpen, detailsOpen, permissionOnboardingOpen } = panelState;

  const transitionPanelState = useCallback((action: PanelStateAction) => {
    setPanelState((state) => reducePanelState(state, action));
  }, []);

  useEffect(() => {
    return api.onTaskEvent((event) => {
      const assistantConversationReply = isAssistantConversationReplyEvent(
        event,
        pendingAssistantPromptRef.current
      );

      setTask(createTaskViewFromEvent(event));
      setReplayRecords((records) => updateReplayRecordsForTaskEvent(records, event));

      if (assistantConversationReply) {
        pendingAssistantPromptRef.current = null;
        setAssistantConversation((messages) => appendAssistantConversationReply(messages, event));
        setAssistantInputSubmitting(false);
        transitionPanelState({ type: "assistant-reply" });
        return;
      }

      if (event.status !== "idle") {
        if (event.command) {
          pendingAssistantPromptRef.current = null;
          setAssistantConversation((messages) => messages.filter((message) => message.state !== "pending"));
        }
        transitionPanelState({ type: "non-idle-task-event" });
      }
    });
  }, [api, transitionPanelState]);

  useEffect(() => {
    let cancelled = false;

    void api.getPetSkin().then((skin) => {
      if (!cancelled && isPetAtlasManifest(skin)) {
        setPetAtlas(resolvePetAtlas({
          selectedSkinId: skin.slug,
          customManifest: skin
        }));
      }
    }).catch(() => {
      // A missing local skin should quietly keep the bundled fallback.
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

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

  const refreshAssistantAgentSettings = useCallback(async () => {
    try {
      setAssistantAgentSettings(await api.getAssistantAgentSettings());
    } catch {
      setAssistantAgentSettings(DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE);
    }
  }, [api]);

  useEffect(() => {
    void refreshAssistantAgentSettings();
  }, [refreshAssistantAgentSettings]);

  const refreshPermissions = useCallback(async () => {
    setPermissionsLoading(true);

    try {
      const [nextPermissions, nextDesktopSessionDiagnostics] = await Promise.all([
        api.getPermissions(),
        api.getDesktopSessionDiagnostics()
      ]);
      setPermissions(nextPermissions);
      setDesktopSessionDiagnostics(nextDesktopSessionDiagnostics);
      return nextPermissions;
    } catch {
      setPermissions(UNKNOWN_PERMISSIONS);
      setDesktopSessionDiagnostics(UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS);
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

  const refreshDashboardStatus = useCallback(() => {
    void refreshAssistantAgentSettings();
    void refreshPermissions();
    void refreshTurnReplay();
  }, [refreshAssistantAgentSettings, refreshPermissions, refreshTurnReplay]);

  useEffect(() => {
    if (assistantPanelOpen) {
      assistantInputRef.current?.focus();
    }
  }, [assistantPanelOpen]);

  useEffect(() => {
    if (detailsOpen) {
      void refreshAssistantAgentSettings();
      void refreshPermissions();
      void refreshTurnReplay();
    }
  }, [detailsOpen, refreshAssistantAgentSettings, refreshPermissions, refreshTurnReplay]);

  const stopCurrentTurn = useCallback(async () => {
    if (canStopTurn(task.status)) {
      transitionPanelState({ type: "non-idle-task-event" });
      setTask(createTaskStatusView("cancelled"));

      try {
        await api.stopTask();
      } catch {
        setTask(createTaskStatusView("failed", "停止任务失败."));
      }
    }
  }, [api, task.status, transitionPanelState]);

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
    transitionPanelState({ type: "close-details" });

    try {
      await api.approveTask();
    } catch {
      setTask(createTaskStatusView("failed", "确认请求失败."));
    }
  }

  async function denyTask() {
    transitionPanelState({ type: "close-details" });

    try {
      await api.denyTask();
    } catch {
      setTask(createTaskStatusView("failed", "拒绝请求失败."));
    }
  }

  async function openPermissionSettings(permission: PermissionSettingsTarget) {
    try {
      await api.openPermissionSettings(permission);
      const nextPermissions = await refreshPermissions();
      if (
        permissionOnboardingOpen
        && readMissingPermissionRows(nextPermissions).length === 0
      ) {
        transitionPanelState({ type: "close-permission-onboarding" });
      }
    } catch {
      setTask(createTaskStatusView("failed", "打开系统设置失败."));
    }
  }

  async function refreshPermissionOnboarding() {
    const nextPermissions = await refreshPermissions();
    if (readMissingPermissionRows(nextPermissions).length === 0) {
      transitionPanelState({ type: "close-permission-onboarding" });
      setTask(createTaskStatusView("idle", "权限已就绪."));
    }
  }

  async function selectAppPolicy(bundleId: string, policy: AppPolicy) {
    try {
      setAppPolicySettings(await api.setAppPolicy({ bundleId, policy }));
    } catch {
      setTask(createTaskStatusView("failed", "切换应用策略失败."));
    }
  }

  async function selectAssistantAgentMode(mode: AssistantAgentMode) {
    try {
      setAssistantAgentSettings(await api.setAssistantAgentSettings({ mode }));
    } catch {
      setTask(createTaskStatusView("failed", "切换 Background Agent 失败."));
    }
  }

  async function selectPlannerProviderMode(mode: PlannerProviderMode) {
    try {
      setPlannerProviderSettings(await api.setPlannerProviderSettings({ mode }));
    } catch {
      setTask(createTaskStatusView("failed", "切换规划模式失败."));
    }
  }

  async function submitAssistantInput(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const command = assistantInput.trim();

    if (!command || assistantInputSubmitting) {
      assistantInputRef.current?.focus();
      return;
    }

    pendingAssistantPromptRef.current = command;
    setAssistantConversation((messages) => appendAssistantConversationSubmission(messages, command));
    setAssistantInputSubmitting(true);
    transitionPanelState({ type: "open-assistant" });
    setTask(createAssistantSubmissionTaskView());
    setAssistantInput("");

    try {
      await api.runCommand(command, { mode: "active" });
    } catch {
      pendingAssistantPromptRef.current = null;
      setAssistantConversation(appendAssistantConversationSubmissionFailure);
      setTask(createAssistantSubmissionFailureTaskView());
    } finally {
      setAssistantInputSubmitting(false);
    }
  }

  function submitAssistantInputFromKeyboard(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitAssistantInput();
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
      moved: false,
      visibleRect: readVisiblePetRect(event.currentTarget.getBoundingClientRect())
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
      moved: true,
      visibleRect: drag.visibleRect
    };

    if (!drag.moved) {
      transitionPanelState({ type: "close-for-drag" });
    }

    api.moveWindowBy(deltaX, deltaY, drag.visibleRect);
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

  function openAssistantPanelFromPet() {
    if (suppressNextPetClickRef.current) {
      suppressNextPetClickRef.current = false;
      return;
    }

    if (canDismissTaskBubble(task.status)) {
      setTask(createTaskStatusView("idle"));
      setReplayRecords([]);
      transitionPanelState({ type: "open-assistant" });
      return;
    }

    transitionPanelState({ type: "toggle-assistant" });
  }

  function toggleDetailsFromPet(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    transitionPanelState({ type: "toggle-details" });
  }

  const status = STATUS_COPY[task.status];
  const petState = getPetStateForTask(task.status);
  const startupWarning = startupWarnings[0];
  const panelVisibility = getPanelVisibilityState({
    assistantPanelOpen,
    detailsOpen,
    hasStartupWarning: Boolean(startupWarning),
    permissionOnboardingOpen,
    taskStatus: task.status
  });
  const selectedAssistantAgentProvider = readSelectedAssistantAgentProvider(
    assistantAgentSettings.providers,
    assistantAgentSettings.settings.mode,
    DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE.providers[0]
  );
  const permissionOnboardingRows = readMissingPermissionRows(permissions);

  useEffect(() => {
    api.setWindowMode(panelVisibility.showPanel ? "expanded" : "compact");
  }, [api, panelVisibility.showPanel]);

  return (
    <main
      className={`pet-stage status-${task.status}${panelVisibility.showPanel ? " panel-open" : ""}`}
      aria-label="skfiy desktop pet"
    >
      <div className="status-orb" role="status" aria-label="Task status">
        <strong>{status.label}</strong>
        <span>{status.pulse}</span>
      </div>

      {panelVisibility.showPanel ? (
        <section
          className={`assistant-bubble${panelVisibility.settingsBubble ? " settings-bubble" : ""}`}
          aria-label={panelVisibility.bubbleAriaLabel}
        >
          {detailsOpen ? (
            <>
              <UserDashboardPanel
                appPolicySettings={appPolicySettings}
                desktopSessionDiagnostics={desktopSessionDiagnostics}
                onApprove={() => void approveTask()}
                onDeny={() => void denyTask()}
                onRefresh={refreshDashboardStatus}
                onStop={() => void stopCurrentTurn()}
                permissions={permissions}
                permissionsLoading={permissionsLoading}
                plannerProviderSettings={plannerProviderSettings}
                task={task}
                turnReplay={turnReplay}
              />
              <div className="settings-layout">
                <div className="settings-section-heading">
                  <strong>日常设置</strong>
                  <span>Agent 与应用策略</span>
                </div>
                <div className="settings-grid">
                  <div className="app-policy-panel" aria-label="Background Agent 设置">
                    <div className="app-policy-heading">
                      <strong>Background Agent</strong>
                      <span>{selectedAssistantAgentProvider.label}</span>
                    </div>
                    <div className="provider-switch" role="group" aria-label="Background Agent provider">
                      {ASSISTANT_AGENT_OPTIONS.map((option) => (
                        <button
                          type="button"
                          key={option.mode}
                          aria-label={option.aria}
                          aria-pressed={assistantAgentSettings.settings.mode === option.mode}
                          onClick={() => void selectAssistantAgentMode(option.mode)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="provider-status-card" aria-label="Background Agent 状态">
                      <strong>{readAssistantAgentReadinessLabel(selectedAssistantAgentProvider.readiness)}</strong>
                      <p>{readAssistantAgentProviderDetail(assistantAgentSettings, selectedAssistantAgentProvider)}</p>
                      {selectedAssistantAgentProvider.lastError ? (
                        <p>{selectedAssistantAgentProvider.lastError}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="app-policy-panel" aria-label="Computer Use 设置">
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
                </div>
                <details className="advanced-panel" aria-label="诊断/高级">
                  <summary>
                    <span>
                      <SlidersHorizontal size={13} aria-hidden="true" />
                      诊断/高级
                    </span>
                    <em>回放与 Computer Use Planner</em>
                  </summary>
                  <div className="advanced-panel-body">
                    <div className="app-policy-panel" aria-label="Computer Use Planner">
                      <div className="app-policy-heading">
                        <strong>Computer Use Planner</strong>
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
                        <div className="provider-status-card" aria-label="External CUA 连接状态">
                          <strong>{readExternalCuaStatusLabel(plannerProviderSettings)}</strong>
                          <p>在 dashboard 中配置</p>
                        </div>
                      ) : null}
                    </div>
                    <LocalReplayViewer replay={turnReplay} />
                  </div>
                </details>
                <div className="permissions-panel" aria-label="权限">
                  <div className="permissions-heading">
                    <strong>权限</strong>
                    <button type="button" aria-label="刷新权限状态" onClick={() => void refreshPermissions()}>
                      <RefreshCw size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="permissions-list">
                    <div className="permission-row desktop-session-row">
                      <span>桌面会话</span>
                      <strong data-state={readDesktopSessionPermissionState(desktopSessionDiagnostics)}>
                        {permissionsLoading
                          ? "检查中"
                          : DESKTOP_SESSION_STATE_COPY[desktopSessionDiagnostics.state]}
                      </strong>
                    </div>
                    {desktopSessionDiagnostics.state === "blocked" ? (
                      <p className="permission-hint" aria-label="桌面会话阻塞原因">
                        {desktopSessionDiagnostics.reason}
                      </p>
                    ) : null}
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
          ) : assistantPanelOpen ? (
            <form
              className="assistant-input-panel"
              aria-label="skfiy assistant input"
              onSubmit={(event) => void submitAssistantInput(event)}
            >
              <div className="agent-status" aria-label="skfiy agent status">
                <strong>agent</strong>
                <span>{selectedAssistantAgentProvider.label}</span>
              </div>
              {assistantConversation.length > 0 ? (
                <div className="assistant-thread" aria-label="skfiy conversation">
                  {assistantConversation.map((message, index) => (
                    <div
                      className="assistant-message"
                      data-role={message.role}
                      data-state={message.state ?? "done"}
                      aria-label={message.role === "user" ? "你发送给 skfiy" : "skfiy 回复"}
                      key={`${message.role}-${index}-${message.text}`}
                    >
                      {message.text}
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={assistantInputRef}
                aria-label="Ask skfiy"
                value={assistantInput}
                placeholder="Ask skfiy..."
                rows={3}
                disabled={assistantInputSubmitting}
                onChange={(event) => setAssistantInput(event.currentTarget.value)}
                onKeyDown={submitAssistantInputFromKeyboard}
              />
              <div className="assistant-input-actions">
                <span>{assistantInputSubmitting ? "等待回复" : `${selectedAssistantAgentProvider.label} · ${readAssistantAgentReadinessLabel(selectedAssistantAgentProvider.readiness)}`}</span>
                <button
                  type="submit"
                  aria-label="发送给 skfiy"
                  disabled={!assistantInput.trim() || assistantInputSubmitting}
                >
                  <Play size={13} aria-hidden="true" />
                  <span>{assistantInputSubmitting ? "发送中" : "发送"}</span>
                </button>
              </div>
            </form>
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
          ) : panelVisibility.showStartupWarning && startupWarning ? (
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
        atlas={petAtlas}
        onClick={openAssistantPanelFromPet}
        onContextMenu={toggleDetailsFromPet}
        onPointerDown={startPetDrag}
        onPointerMove={movePetDrag}
        onPointerUp={stopPetDrag}
      />
    </main>
  );
}
