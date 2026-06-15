import { CirclePause, Play } from "lucide-react";
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

export interface DictationPreparation {
  voiceTrigger: DoubaoVoiceTrigger;
}

export interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

export interface SkfiyApi {
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
    skfiy?: SkfiyApi;
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

const fallbackApi: SkfiyApi = {
  runCommand: async () => undefined,
  prepareDictation: async () => ({ voiceTrigger: "none" }),
  stopDictation: async () => undefined,
  approveTask: async () => undefined,
  denyTask: async () => undefined,
  takeScreenshot: async () => undefined,
  stopTask: async () => undefined,
  moveWindowBy: () => undefined,
  setWindowMode: () => undefined,
  onTaskEvent: () => () => undefined
};

const DICTATION_AUTO_SUBMIT_DELAY_MS = 900;

function getSkfiyApi(): SkfiyApi {
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

function SkfiyPet({
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
      aria-label="Skfiy Codex-style pet"
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
  const api = useMemo(getSkfiyApi, []);
  const [dictationText, setDictationText] = useState("");
  const [listening, setListening] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
      }
    });
  }, [api]);

  useEffect(() => {
    return () => stopBrowserSpeechRecognition();
  }, []);

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
      nativeDictationActiveRef.current = preparation.voiceTrigger !== "none";

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
  const showPanel = listening || detailsOpen || task.status !== "idle";

  useEffect(() => {
    api.setWindowMode(showPanel ? "expanded" : "compact");
  }, [api, showPanel]);

  return (
    <main
      className={`pet-stage status-${task.status}${listening ? " listening" : ""}${showPanel ? " panel-open" : ""}`}
      aria-label="Skfiy desktop pet"
    >
      <div className="status-orb" role="status" aria-label="Task status">
        <strong>{status.label}</strong>
        <span>{status.pulse}</span>
      </div>

      {showPanel ? (
        <section
          className={`voice-bubble${detailsOpen ? " settings-bubble" : ""}`}
          aria-label={detailsOpen ? "Skfiy settings" : "Skfiy voice status"}
        >
          {detailsOpen ? (
            <>
              <p>设置</p>
              <div className="settings-grid">
                <span>入口</span>
                <strong>左键</strong>
                <span>豆包</span>
                <strong>Skfiy 快捷键</strong>
                <span>组合键</span>
                <strong>Ctrl Opt Cmd Shift Space</strong>
              </div>
            </>
          ) : listening ? (
            <>
              <p>正在听你说</p>
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
          ) : (
            <p>{task.message}</p>
          )}
        </section>
      ) : null}

      <SkfiyPet
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
