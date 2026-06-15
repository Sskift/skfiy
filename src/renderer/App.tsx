import { CirclePause, Mic, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
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

export interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

export interface SkfiyApi {
  runCommand: (command: string, options: { mode: ManualMode }) => Promise<void>;
  prepareDictation: () => Promise<void>;
  stopDictation: () => Promise<void>;
  approveTask: () => Promise<void>;
  denyTask: () => Promise<void>;
  takeScreenshot: () => Promise<void>;
  stopTask: () => Promise<void>;
  moveWindowBy: (deltaX: number, deltaY: number) => void;
  setWindowMode: (mode: PetWindowMode) => void;
  onTaskEvent: (callback: (event: TaskEvent) => void) => () => void;
}

declare global {
  interface Window {
    skfiy?: SkfiyApi;
  }
}

interface TaskView {
  status: TaskStatus;
  message: string;
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
  prepareDictation: async () => undefined,
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

function SkfiyPet({ state }: { state: PetAtlasState }) {
  const animation = PET_ATLAS.states[state];

  return (
    <div
      aria-label="Skfiy Codex-style pet"
      className={`skfiy-pet pet-state-${state}`}
      data-atlas-state={state}
      data-frame-count={animation.frames}
      data-drag-mode="native"
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
  const [task, setTask] = useState<TaskView>({
    status: "idle",
    message: STATUS_COPY.idle.message
  });
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDictationSubmitRef = useRef("");

  useEffect(() => {
    return api.onTaskEvent((event) => {
      setTask({
        status: event.status,
        message: event.message ?? STATUS_COPY[event.status].message
      });

      if (event.status !== "idle") {
        setListening(false);
      }
    });
  }, [api]);

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
      setListening(false);
      setDictationText("");
      setTask({
        status: "executing",
        message: `听到: ${nextCommand}`
      });

      try {
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
    setTask({
      status: "idle",
      message: "正在听你说."
    });

    try {
      await api.prepareDictation();
    } finally {
      transcriptRef.current?.focus();
    }
  }

  async function stopDictation() {
    lastDictationSubmitRef.current = "";
    setListening(false);
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
    try {
      await api.denyTask();
    } catch {
      setTask({
        status: "failed",
        message: "拒绝请求失败."
      });
    }
  }

  const status = STATUS_COPY[task.status];
  const petState = getPetStateForTask(listening ? "observing" : task.status);
  const showVoiceStatus = listening || task.status !== "idle";

  useEffect(() => {
    api.setWindowMode(showVoiceStatus ? "expanded" : "compact");
  }, [api, showVoiceStatus]);

  return (
    <main
      className={`pet-stage status-${task.status}${listening ? " listening" : ""}`}
      aria-label="Skfiy desktop pet"
    >
      <div className="status-orb" role="status" aria-label="Task status">
        <strong>{status.label}</strong>
        <span>{status.pulse}</span>
      </div>

      {showVoiceStatus ? (
        <section className="voice-bubble" aria-label="Skfiy voice status">
          <p>{listening ? "正在听你说" : task.message}</p>
          {listening ? (
            <>
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
          ) : null}
        </section>
      ) : null}

      <SkfiyPet state={petState} />

      <button
        type="button"
        aria-label="语音"
        aria-pressed={listening}
        className={`voice-button${listening ? " is-listening" : ""}`}
        onClick={startDictation}
      >
        <Mic size={14} aria-hidden="true" />
        <span>{listening ? "听写中" : "语音"}</span>
      </button>
    </main>
  );
}
