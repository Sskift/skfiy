import { Camera, CirclePause, Play, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

export type TaskStatus =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "completed"
  | "failed";

export type ManualMode = "active" | "quiet";
type SwitchingMode = "auto" | "manual";
type PetAnimation = "idle" | "scanning" | "controlling" | "approval" | "celebrating" | "error";

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

const STATUS_COPY: Record<TaskStatus, { label: string; message: string; pulse: string; animation: PetAnimation }> = {
  idle: {
    label: "Idle",
    message: "Ready for a command.",
    pulse: "Orbiting",
    animation: "idle"
  },
  observing: {
    label: "Observing",
    message: "Looking at the desktop.",
    pulse: "Scanning",
    animation: "scanning"
  },
  executing: {
    label: "Executing",
    message: "Working in Ghostty.",
    pulse: "Piloting",
    animation: "controlling"
  },
  approval_required: {
    label: "Approval required",
    message: "Waiting for a human check.",
    pulse: "Holding",
    animation: "approval"
  },
  completed: {
    label: "Completed",
    message: "Task finished.",
    pulse: "Spark",
    animation: "celebrating"
  },
  failed: {
    label: "Failed",
    message: "Could not complete the task.",
    pulse: "Alert",
    animation: "error"
  }
};

const fallbackApi: SkfiyApi = {
  runCommand: async () => undefined,
  approveTask: async () => undefined,
  denyTask: async () => undefined,
  takeScreenshot: async () => undefined,
  stopTask: async () => undefined,
  onTaskEvent: () => () => undefined
};

function getSkfiyApi(): SkfiyApi {
  return window.skfiy ?? fallbackApi;
}

function deriveAutoMode(status: TaskStatus): ManualMode {
  return status === "idle" || status === "completed" ? "quiet" : "active";
}

function PixelCosmicRobot({
  animation,
  onClick
}: {
  animation: PetAnimation;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Cosmic pixel robot"
      className={`cosmic-robot robot-${animation}`}
      data-animation={animation}
      onClick={onClick}
    >
      <span className="orbit-ring" aria-hidden="true" />
      <span className="star star-a" aria-hidden="true" />
      <span className="star star-b" aria-hidden="true" />
      <span className="robot-shadow" aria-hidden="true" />
      <span className="robot-pack" aria-hidden="true" />
      <span className="robot-body" aria-hidden="true">
        <span className="robot-antenna" />
        <span className="robot-visor">
          <span className="robot-eye eye-left" />
          <span className="robot-eye eye-right" />
          <span className="robot-scanline" />
        </span>
        <span className="robot-cheek cheek-left" />
        <span className="robot-cheek cheek-right" />
        <span className="robot-panel" />
      </span>
      <span className="robot-arm arm-left" aria-hidden="true" />
      <span className="robot-arm arm-right" aria-hidden="true" />
      <span className="robot-leg leg-left" aria-hidden="true" />
      <span className="robot-leg leg-right" aria-hidden="true" />
      <span className="thruster flame-left" aria-hidden="true" />
      <span className="thruster flame-right" aria-hidden="true" />
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
  const effectiveMode = switchingMode === "auto" ? deriveAutoMode(task.status) : manualMode;
  const quiet = effectiveMode === "quiet";
  const showBubble = bubbleOpen || task.status === "approval_required";

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

  return (
    <main className={`pet-stage status-${task.status}${showBubble ? " bubble-open" : ""}`} aria-label="Skfiy desktop pet">
      <div className="status-orb" role="status" aria-label="Task status">
        <strong>{status.label}</strong>
        <span>{status.pulse}</span>
      </div>

      <PixelCosmicRobot animation={status.animation} onClick={() => setBubbleOpen((open) => !open)} />

      {showBubble ? (
        <section className="command-bubble" aria-label="Skfiy command bubble">
          <div className="bubble-header">
            <div>
              <p>Skfiy</p>
              <strong>{task.message}</strong>
            </div>
            <button
              type="button"
              aria-label="Close command bubble"
              className="icon-button"
              onClick={() => setBubbleOpen(false)}
            >
              x
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
