import { Camera, CirclePause, Play, Sparkles, X } from "lucide-react";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
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
type SwitchingMode = "auto" | "manual";

export interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
}

export interface SkfiyApi {
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

declare global {
  interface Window {
    skfiy?: SkfiyApi;
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
    message: "Ready for a command.",
    pulse: "Tucked"
  },
  observing: {
    label: "Observing",
    message: "Looking at the desktop.",
    pulse: "Review"
  },
  executing: {
    label: "Executing",
    message: "Working in Ghostty.",
    pulse: "Running"
  },
  approval_required: {
    label: "Approval required",
    message: "Waiting for a human check.",
    pulse: "Waiting"
  },
  completed: {
    label: "Completed",
    message: "Task finished.",
    pulse: "Waving"
  },
  failed: {
    label: "Failed",
    message: "Could not complete the task.",
    pulse: "Fault"
  }
};

const fallbackApi: SkfiyApi = {
  runCommand: async () => undefined,
  approveTask: async () => undefined,
  denyTask: async () => undefined,
  takeScreenshot: async () => undefined,
  stopTask: async () => undefined,
  setIgnoreMouse: () => undefined,
  setOverlayState: () => undefined,
  moveWindowBy: () => undefined,
  onTaskEvent: () => () => undefined
};

function getSkfiyApi(): SkfiyApi {
  return window.skfiy ?? fallbackApi;
}

function deriveAutoMode(status: TaskStatus): ManualMode {
  return status === "idle" || status === "completed" ? "quiet" : "active";
}

function SkfiyPet({
  state,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  state: PetAtlasState;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const animation = PET_ATLAS.states[state];

  return (
    <button
      type="button"
      aria-label="Skfiy Codex-style pet"
      className={`skfiy-pet pet-state-${state}`}
      data-atlas-state={state}
      data-frame-count={animation.frames}
      data-interactive="true"
      style={getPetSpriteStyle(state)}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="pet-sprite-frame" aria-hidden="true" />
    </button>
  );
}

export default function App() {
  const api = useMemo(getSkfiyApi, []);
  const [command, setCommand] = useState("");
  const [manualMode, setManualMode] = useState<ManualMode>("active");
  const [switchingMode, setSwitchingMode] = useState<SwitchingMode>("manual");
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [task, setTask] = useState<TaskView>({
    status: "idle",
    message: STATUS_COPY.idle.message
  });
  const dragStateRef = useRef<PetDragState | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    return api.onTaskEvent((event) => {
      setTask({
        status: event.status,
        message: event.message ?? STATUS_COPY[event.status].message
      });

      if (event.status !== "idle") {
        setBubbleOpen(true);
      }
    });
  }, [api]);

  const status = STATUS_COPY[task.status];
  const petState = getPetStateForTask(task.status);
  const effectiveMode = switchingMode === "auto" ? deriveAutoMode(task.status) : manualMode;
  const quiet = effectiveMode === "quiet";
  const showBubble = bubbleOpen || task.status === "approval_required";

  useEffect(() => {
    api.setOverlayState({ capsuleOpen: showBubble });

    return () => {
      api.setOverlayState({ capsuleOpen: false, dragging: false });
    };
  }, [api, showBubble]);

  async function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBubbleOpen(true);

    const nextCommand = command.trim();
    if (!nextCommand) {
      setTask({
        status: "failed",
        message: "Enter a command before running."
      });
      return;
    }

    setTask({
      status: "executing",
      message: quiet ? "Queued quietly." : `Running "${nextCommand}".`
    });

    try {
      await api.runCommand(nextCommand, {
        mode: switchingMode === "auto" ? deriveAutoMode("executing") : manualMode
      });
    } catch {
      setTask({
        status: "failed",
        message: "Command could not be sent."
      });
    }
  }

  async function takeScreenshot() {
    setBubbleOpen(true);
    setTask({
      status: "observing",
      message: "Capturing the desktop."
    });

    try {
      await api.takeScreenshot();
    } catch {
      setTask({
        status: "failed",
        message: "Screenshot request failed."
      });
    }
  }

  async function approveTask() {
    setBubbleOpen(true);

    try {
      await api.approveTask();
    } catch {
      setTask({
        status: "failed",
        message: "Approval request failed."
      });
    }
  }

  async function denyTask() {
    setBubbleOpen(true);

    try {
      await api.denyTask();
    } catch {
      setTask({
        status: "failed",
        message: "Deny request failed."
      });
    }
  }

  async function stopTask() {
    setBubbleOpen(true);
    setTask({
      status: "idle",
      message: "Stopping current task."
    });

    try {
      await api.stopTask();
    } catch {
      setTask({
        status: "failed",
        message: "Stop request failed."
      });
    }
  }

  function toggleCommandCapsule() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    setBubbleOpen((open) => !open);
  }

  function startPetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    api.setOverlayState({ dragging: true });
  }

  function movePetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.screenX - dragState.lastScreenX;
    const deltaY = event.screenY - dragState.lastScreenY;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    dragState.moved = true;
    dragState.lastScreenX = event.screenX;
    dragState.lastScreenY = event.screenY;
    api.moveWindowBy(deltaX, deltaY);
  }

  function finishPetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    api.setOverlayState({ dragging: false });

    if (dragState.moved) {
      suppressNextClickRef.current = true;
    }
  }

  return (
    <main className={`pet-stage status-${task.status}${showBubble ? " capsule-open" : ""}`} aria-label="Skfiy desktop pet">
      <div className="status-orb" role="status" aria-label="Task status">
        <strong>{status.label}</strong>
        <span>{status.pulse}</span>
      </div>

      <SkfiyPet
        state={petState}
        onClick={toggleCommandCapsule}
        onPointerDown={startPetDrag}
        onPointerMove={movePetDrag}
        onPointerUp={finishPetDrag}
      />

      {showBubble ? (
        <section className="command-capsule" aria-label="Skfiy command capsule" data-interactive="true">
          <div className="capsule-header">
            <div>
              <p>Skfiy</p>
              <strong>{task.message}</strong>
            </div>
            <button
              type="button"
              aria-label="Close command capsule"
              className="icon-button"
              onClick={() => setBubbleOpen(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <form className="command-row" onSubmit={runCommand}>
            <label className="sr-only" htmlFor="command-input">
              Command
            </label>
            <input
              id="command-input"
              value={command}
              onChange={(event) => setCommand(event.currentTarget.value)}
              placeholder="pwd"
              spellCheck={false}
            />
            <button type="submit" aria-label="Run command" className="primary-action">
              <Play size={16} aria-hidden="true" />
              <span>Run</span>
            </button>
          </form>

          <div className="mode-row" aria-label="Mode controls">
            <label className="mode-toggle">
              <input
                type="checkbox"
                role="switch"
                aria-label="Switching mode"
                checked={switchingMode === "auto"}
                onChange={(event) => setSwitchingMode(event.currentTarget.checked ? "auto" : "manual")}
              />
              <span>{switchingMode === "auto" ? "Auto" : "Manual"}</span>
            </label>
            <label className="mode-toggle">
              <input
                type="checkbox"
                role="switch"
                aria-label="Manual mode"
                checked={!quiet}
                disabled={switchingMode === "auto"}
                onChange={(event) => setManualMode(event.currentTarget.checked ? "active" : "quiet")}
              />
              <span>{quiet ? "Quiet" : "Active"}</span>
            </label>
            <div className="intent-chip" aria-hidden="true">
              <Sparkles size={14} />
              <span>{switchingMode === "auto" ? `auto/${effectiveMode}` : effectiveMode}</span>
            </div>
          </div>

          <div className="tool-row">
            {task.status === "approval_required" ? (
              <>
                <button type="button" aria-label="Approve task" onClick={approveTask}>
                  <Play size={16} aria-hidden="true" />
                  <span>Approve</span>
                </button>
                <button type="button" aria-label="Deny task" onClick={denyTask}>
                  <CirclePause size={16} aria-hidden="true" />
                  <span>Deny</span>
                </button>
              </>
            ) : (
              <>
                <button type="button" aria-label="Take screenshot" onClick={takeScreenshot}>
                  <Camera size={16} aria-hidden="true" />
                  <span>Shot</span>
                </button>
                <button type="button" aria-label="Stop task" onClick={stopTask}>
                  <CirclePause size={16} aria-hidden="true" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
