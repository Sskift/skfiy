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
  | "completed"
  | "failed";

export type ManualMode = "active" | "quiet";
export type PetWindowMode = "compact" | "expanded";
export type DoubaoVoiceTrigger = "skfiy-shortcut" | "fn-double-tap" | "none";
export type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
export type PermissionSettingsTarget = "screen-recording" | "accessibility" | "microphone";
export type StartupWarningId = "tmux-launch" | "dev-server" | "unbundled-electron";
export type DictationProviderId = "doubao";
export type DictationProviderState =
  | "unavailable"
  | "waiting_for_shortcut_configuration"
  | "listening"
  | "stopped"
  | "failed";

export interface DictationPreparation {
  providerId?: DictationProviderId;
  voiceTrigger: DoubaoVoiceTrigger;
  nativeDictationActive?: boolean;
  providerState?: DictationProviderState;
}

export interface DictationProviderEvent {
  providerId: DictationProviderId;
  state: DictationProviderState;
  message: string;
}

export interface PermissionSummary {
  screenRecording: { state: PermissionState };
  accessibility: { state: PermissionState };
  microphone: { state: PermissionState };
}

export interface StartupWarning {
  id: StartupWarningId;
  title: string;
  message: string;
}

export interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

export interface DesktopApi {
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
  moveWindowBy: (deltaX: number, deltaY: number) => void;
  setWindowMode: (mode: PetWindowMode) => void;
  onDictationProviderEvent: (callback: (event: DictationProviderEvent) => void) => () => void;
  onTaskEvent: (callback: (event: TaskEvent) => void) => () => void;
}

interface BrowserSpeechRecognitionResult {
  0?: {
    transcript?: string;
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
  { key: "microphone", settingsTarget: "microphone", label: "麦克风" }
];

const PERMISSION_STATE_COPY: Record<PermissionState, string> = {
  granted: "已授权",
  denied: "未授权",
  "not-determined": "待授权",
  unknown: "未知"
};

const UNKNOWN_PERMISSIONS: PermissionSummary = {
  screenRecording: { state: "unknown" },
  accessibility: { state: "unknown" },
  microphone: { state: "unknown" }
};

const fallbackApi: DesktopApi = {
  runCommand: async () => undefined,
  prepareDictation: async () => ({ voiceTrigger: "none" }),
  stopDictation: async () => undefined,
  approveTask: async () => undefined,
  denyTask: async () => undefined,
  takeScreenshot: async () => undefined,
  stopTask: async () => undefined,
  getPermissions: async () => UNKNOWN_PERMISSIONS,
  openPermissionSettings: async () => undefined,
  getStartupWarnings: async () => [],
  moveWindowBy: () => undefined,
  setWindowMode: () => undefined,
  onDictationProviderEvent: () => () => undefined,
  onTaskEvent: () => () => undefined
};

const DICTATION_AUTO_SUBMIT_DELAY_MS = 900;

function getDesktopApi(): DesktopApi {
  return window.skfiy ?? fallbackApi;
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
  const [permissions, setPermissions] = useState<PermissionSummary>(UNKNOWN_PERMISSIONS);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [startupWarnings, setStartupWarnings] = useState<StartupWarning[]>([]);
  const [dictationProvider, setDictationProvider] = useState<DictationProviderEvent | null>(null);
  const [task, setTask] = useState<TaskView>({
    status: "idle",
    message: STATUS_COPY.idle.message
  });
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDictationSubmitRef = useRef("");
  const petDragRef = useRef<PetDragState | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const nativeDictationActiveRef = useRef(false);
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
      setDictationText(readSpeechTranscript(event));
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
        message: event.message ?? STATUS_COPY[event.status].message
      });

      if (event.status !== "idle") {
        stopBrowserSpeechRecognition();
        nativeDictationActiveRef.current = false;
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
      } else if (event.state === "stopped" || event.state === "failed" || event.state === "unavailable") {
        setListening(false);
      }
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

  const refreshPermissions = useCallback(async () => {
    setPermissionsLoading(true);

    try {
      setPermissions(await api.getPermissions());
    } catch {
      setPermissions(UNKNOWN_PERMISSIONS);
    } finally {
      setPermissionsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (detailsOpen) {
      void refreshPermissions();
    }
  }, [detailsOpen, refreshPermissions]);

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
      nativeDictationActiveRef.current = false;
      stopBrowserSpeechRecognition();
      setListening(false);
      setDetailsOpen(false);
      setDictationText("");
      setTask({
        status: "executing",
        message: `听到: ${nextCommand}`
      });

      try {
        if (shouldStopNativeDictation) {
          await api.stopDictation();
        }

        await api.runCommand(nextCommand, { mode: "active" });
      } catch {
        setTask({
          status: "failed",
          message: "语音指令发送失败."
        });
      }
    },
    [api]
  );

  useEffect(() => {
    if (!listening) {
      return undefined;
    }

    const nextCommand = dictationText.trim();
    if (!nextCommand || nextCommand === lastDictationSubmitRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void submitDictation(nextCommand);
    }, DICTATION_AUTO_SUBMIT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [dictationText, listening, submitDictation]);

  async function startDictation() {
    lastDictationSubmitRef.current = "";
    setDictationText("");
    setListening(true);
    setDetailsOpen(false);
    setTask({
      status: "idle",
      message: "正在听你说."
    });

    try {
      const preparation = await api.prepareDictation();
      if (preparation.providerState === "failed" || preparation.providerState === "unavailable") {
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
    stopBrowserSpeechRecognition();
    nativeDictationActiveRef.current = false;
    setListening(false);
    setDetailsOpen(false);
    setDictationText("");
    setDictationProvider(null);
    setTask({
      status: "idle",
      message: STATUS_COPY.idle.message
    });

    try {
      await api.stopDictation();
    } catch {
      setTask({
        status: "failed",
        message: "停止语音失败."
      });
    }
  }

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
      await refreshPermissions();
    } catch {
      setTask({
        status: "failed",
        message: "打开系统设置失败."
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

    void startDictation();
  }

  function toggleDetailsFromPet(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    lastDictationSubmitRef.current = "";
    setDictationText("");
    stopBrowserSpeechRecognition();
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
    && task.status === "idle";
  const showProviderStatus = Boolean(dictationProvider)
    && !listening
    && !detailsOpen
    && task.status === "idle";
  const showPanel =
    listening || detailsOpen || task.status !== "idle" || showStartupWarning || showProviderStatus;

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
          className={`voice-bubble${detailsOpen ? " settings-bubble" : ""}`}
          aria-label={detailsOpen ? "skfiy settings" : "skfiy voice status"}
        >
          {detailsOpen ? (
            <>
              <p>设置</p>
              <div className="settings-grid">
                <span>入口</span>
                <strong>左键</strong>
                <span>豆包</span>
                <strong>skfiy 快捷键</strong>
                <span>组合键</span>
                <strong>Ctrl Opt Cmd Shift Space</strong>
              </div>
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
          ) : listening ? (
            <>
              <p>{dictationProvider?.message ?? "正在听你说"}</p>
              <textarea
                ref={transcriptRef}
                aria-label="语音转写"
                className="voice-transcript"
                value={dictationText}
                onChange={(event) => setDictationText(event.currentTarget.value)}
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
              <strong>{dictationProvider.providerId === "doubao" ? "豆包" : "语音"}</strong>
              <span>{dictationProvider.message}</span>
            </div>
          ) : showStartupWarning && startupWarning ? (
            <div className="startup-warning" aria-label="启动警告">
              <strong>{startupWarning.title}</strong>
              <span>{startupWarning.message}</span>
            </div>
          ) : (
            <p>{task.message}</p>
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
