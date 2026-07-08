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
  isPetAtlasManifest,
  resolvePetAtlas,
  type PetAtlas,
  type PetAtlasManifest,
  type PetAtlasState
} from "./pet-atlas";
import {
  getFinderPlanPreviewSummaryViewModel,
  getAppRootViewModel,
  getLocalReplayViewModel,
  getPermissionDisplayRows,
  getPermissionsPanelViewModel,
  getPlannerProviderDisplayViewModel,
  getPolicySummary,
  getTaskReplayRows,
  getUserDashboardPanelViewModel,
  readAssistantAgentProviderDetail,
  readAssistantAgentReadinessLabel,
  readExternalCuaStatusLabel
} from "./app-view-model";
import { getDesktopApi } from "./app-desktop-api";
import {
  appendAssistantConversationSubmission,
  appendAssistantConversationSubmissionFailure,
  createAssistantInputSubmissionTransition,
  createInitialTaskView,
  createAssistantSubmissionFailureTaskView,
  createTaskEventUiTransition,
  createStopTurnUiTransition,
  createTaskStatusView,
  updateAssistantConversationForTaskEvent,
  updateReplayRecordsForTaskEvent,
  type AssistantConversationMessage,
  type TaskView
} from "./app-task-state";
import {
  INITIAL_PANEL_STATE,
  createPetClickPanelTransition,
  reducePanelState,
  type PanelStateAction
} from "./app-panel-state";
import {
  UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS,
  UNKNOWN_PERMISSIONS,
  createUnknownPermissionRefreshState,
  isPermissionOnboardingComplete
} from "./app-permission-state";
import {
  createPetDragState,
  readVisiblePetRect,
  shouldSuppressPetClickAfterDrag,
  updatePetDragStateForPointerMove,
  type PetDragState
} from "./app-pet-drag-state";
import {
  APP_POLICY_OPTIONS,
  ASSISTANT_AGENT_OPTIONS,
  DEFAULT_APP_POLICY_SETTINGS,
  DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE,
  DEFAULT_PLANNER_PROVIDER_SETTINGS,
  PLANNER_PROVIDER_OPTIONS
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
    route?: string;
    routeReason?: string;
    denialKind?: string;
    policyKind?: string;
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
  route?: string;
  routeReason?: string;
  denialKind?: string;
  policyKind?: string;
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

function TaskReplay({ records }: { records: ObserveAppReplayRecord[] }) {
  const rows = getTaskReplayRows(records);

  if (rows.length === 0) return null;

  return (
    <div className="task-replay" aria-label="Computer Use replay">
      {rows.map((row) => (
        <div className="task-replay-row" key={row.key}>
          <strong>{row.stage}</strong>
          <span title={row.screenshotPath}>{row.screenshotPath}</span>
          <em data-state={row.accessibilityState}>
            {row.accessibilityLabel}
          </em>
          {row.ocrLabel ? <em data-state="ok">{row.ocrLabel}</em> : null}
        </div>
      ))}
    </div>
  );
}

function FinderPlanPreviewSummary({ preview }: { preview: FinderPlanPreview }) {
  const previewViewModel = getFinderPlanPreviewSummaryViewModel(preview);

  return (
    <div className="finder-plan-preview" aria-label="Finder plan preview">
      <strong>Finder plan preview</strong>
      <div className="finder-plan-stats">
        <span>{previewViewModel.operationCount} operations</span>
        <span>{previewViewModel.destructiveOperationCount} destructive</span>
        <span>{previewViewModel.moveCount} moves</span>
      </div>
      <div className="finder-plan-moves">
        {previewViewModel.moveItems.map((move) => <em key={move.key}>{move.label}</em>)}
      </div>
    </div>
  );
}

function LocalReplayViewer({ replay }: { replay: TurnReplay | null }) {
  const replayViewModel = getLocalReplayViewModel(replay);

  return (
    <div className="turn-replay-panel" aria-label="本地回放">
      <div className="turn-replay-heading">
        <strong>本地回放</strong>
        <span>{replayViewModel.headingOutcome}</span>
      </div>
      {replayViewModel.hasTranscript ? (
        <>
          <div className="turn-replay-summary">
            <span>命令</span>
            <strong>{replayViewModel.command}</strong>
            <span>风险</span>
            <strong>{replayViewModel.riskLevel}</strong>
          </div>
          <ReplayList title="规划" items={replayViewModel.plannerItems} />
          <ReplayList title="动作" items={replayViewModel.actionItems} />
          <ReplayList title="截图" items={replayViewModel.screenshotItems} />
          <ReplayList title="时间线" items={replayViewModel.timelineItems} />
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
  const plannerProviderDisplay = getPlannerProviderDisplayViewModel(plannerProviderSettings);
  const { canApprove, canStop, permissionHealth, recent, risk, status } =
    getUserDashboardPanelViewModel({ desktopSessionDiagnostics, permissions, task, turnReplay });

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
        <span>{plannerProviderDisplay.runtimeLabel}</span>
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
      const transition = createTaskEventUiTransition(event, pendingAssistantPromptRef.current);

      setTask(transition.task);
      setReplayRecords((records) => updateReplayRecordsForTaskEvent(records, event));

      if (transition.clearPendingAssistantPrompt) pendingAssistantPromptRef.current = null;

      if (transition.conversationAction !== "none") {
        setAssistantConversation((messages) =>
          updateAssistantConversationForTaskEvent(messages, event, transition.conversationAction)
        );
      }

      if (transition.finishAssistantInputSubmitting) setAssistantInputSubmitting(false);

      if (transition.panelAction) {
        transitionPanelState({ type: transition.panelAction });
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
      const fallbackState = createUnknownPermissionRefreshState();
      setPermissions(fallbackState.permissions);
      setDesktopSessionDiagnostics(fallbackState.desktopSessionDiagnostics);
      return fallbackState.permissions;
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
    const transition = createStopTurnUiTransition(task.status);
    if (!transition) {
      return;
    }

    transitionPanelState({ type: transition.panelAction });
    setTask(transition.task);

    try {
      await api.stopTask();
    } catch {
      setTask(createTaskStatusView("failed", "停止任务失败."));
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
        && isPermissionOnboardingComplete(nextPermissions)
      ) {
        transitionPanelState({ type: "close-permission-onboarding" });
      }
    } catch {
      setTask(createTaskStatusView("failed", "打开系统设置失败."));
    }
  }

  async function refreshPermissionOnboarding() {
    const nextPermissions = await refreshPermissions();
    if (isPermissionOnboardingComplete(nextPermissions)) {
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
    const transition = createAssistantInputSubmissionTransition(
      assistantInput,
      assistantInputSubmitting
    );

    if (transition.type === "blocked") {
      assistantInputRef.current?.focus();
      return;
    }

    pendingAssistantPromptRef.current = transition.command;
    setAssistantConversation((messages) => appendAssistantConversationSubmission(messages, transition.command));
    setAssistantInputSubmitting(true);
    transitionPanelState({ type: transition.panelAction });
    setTask(transition.task);
    setAssistantInput("");

    try {
      await api.runCommand(transition.command, { mode: "active" });
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

    petDragRef.current = createPetDragState({
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY
    }, readVisiblePetRect(event.currentTarget.getBoundingClientRect()));
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = petDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const move = updatePetDragStateForPointerMove(drag, {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY
    });

    if (!move) {
      return;
    }

    petDragRef.current = move.nextDrag;

    if (move.startedMoving) {
      transitionPanelState({ type: "close-for-drag" });
    }

    api.moveWindowBy(move.deltaX, move.deltaY, move.nextDrag.visibleRect);
  }

  function stopPetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = petDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    petDragRef.current = null;

    if (shouldSuppressPetClickAfterDrag(drag)) {
      suppressNextPetClickRef.current = true;
    }
  }

  function openAssistantPanelFromPet() {
    const transition = createPetClickPanelTransition({
      suppressNextClick: suppressNextPetClickRef.current,
      taskStatus: task.status
    });

    suppressNextPetClickRef.current = transition.nextSuppressNextClick;

    if (transition.resetTaskBubble) setTask(createTaskStatusView("idle"));
    if (transition.clearReplayRecords) setReplayRecords([]);
    if (transition.panelAction) transitionPanelState(transition.panelAction);
  }

  function toggleDetailsFromPet(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    transitionPanelState({ type: "toggle-details" });
  }

  const {
    panelVisibility,
    permissionOnboardingRows,
    petState,
    selectedAssistantAgentProvider,
    startupWarning,
    status
  } = getAppRootViewModel({
    assistantAgentSettings,
    fallbackAssistantAgentProvider: DEFAULT_ASSISTANT_AGENT_SETTINGS_RESPONSE.providers[0],
    panelState,
    permissions,
    startupWarnings,
    taskStatus: task.status
  });
  const permissionPanelViewModel = getPermissionsPanelViewModel({
    desktopSessionDiagnostics,
    permissions,
    permissionsLoading
  });
  const permissionOnboardingDisplayRows = getPermissionDisplayRows({
    loading: permissionsLoading,
    permissions,
    rows: permissionOnboardingRows
  });
  const plannerProviderDisplay = getPlannerProviderDisplayViewModel(plannerProviderSettings);

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
                        <span>{plannerProviderDisplay.settingsHeading}</span>
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
                      {plannerProviderDisplay.showExternalStatus ? (
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
                      <strong data-state={permissionPanelViewModel.desktopSession.state}>
                        {permissionPanelViewModel.desktopSession.stateLabel}
                      </strong>
                    </div>
                    {permissionPanelViewModel.desktopSession.showReason ? (
                      <p className="permission-hint" aria-label="桌面会话阻塞原因">
                        {permissionPanelViewModel.desktopSession.reason}
                      </p>
                    ) : null}
                    {permissionPanelViewModel.permissionRows.map((permission) => (
                      <div className="permission-row" key={permission.key}>
                        <span>{permission.label}</span>
                        <strong data-state={permission.state}>{permission.stateLabel}</strong>
                        <button
                          type="button"
                          aria-label={`打开${permission.label}设置`}
                          onClick={() => void openPermissionSettings(permission.settingsTarget)}
                        >
                          <ExternalLink size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
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
                  {permissionOnboardingDisplayRows.map((permission) => (
                    <div className="permission-row" key={permission.key}>
                      <span>{permission.label}</span>
                      <strong data-state={permission.state}>{permission.stateLabel}</strong>
                      <button
                        type="button"
                        aria-label={`打开${permission.label}设置`}
                        onClick={() => void openPermissionSettings(permission.settingsTarget)}
                      >
                        <ExternalLink size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
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
