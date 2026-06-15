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

const STATUS_COPY: Record<TaskStatus, { label: string; message: string; pulse: string }> = {
  idle: {
    label: "Idle",
    message: "Ready for a command.",
    pulse: "Listening"
  },
  observing: {
    label: "Observing",
    message: "Looking at the desktop.",
    pulse: "Watching"
  },
  executing: {
    label: "Executing",
    message: "Working in Ghostty.",
    pulse: "Moving"
  },
  approval_required: {
    label: "Approval required",
    message: "Waiting for a human check.",
    pulse: "Paused"
  },
  completed: {
    label: "Completed",
    message: "Task finished.",
    pulse: "Done"
  },
  failed: {
    label: "Failed",
    message: "Could not complete the task.",
    pulse: "Needs help"
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

export default function App() {
  const api = useMemo(getSkfiyApi, []);
  const [command, setCommand] = useState("");
  const [manualMode, setManualMode] = useState<ManualMode>("active");
  const [switchingMode, setSwitchingMode] = useState<SwitchingMode>("manual");
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
    });
  }, [api]);

  const status = STATUS_COPY[task.status];
  const effectiveMode = switchingMode === "auto" ? deriveAutoMode(task.status) : manualMode;
  const quiet = effectiveMode === "quiet";

  async function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
    <main className={`pet-shell status-${task.status}`}>
      <section className="pet-header" aria-label="Skfiy desktop pet">
        <div className="pet-avatar" aria-hidden="true">
          <div className="pet-antenna" />
          <div className="pet-face">
            <span />
            <span />
          </div>
        </div>
        <div className="pet-title">
          <p>Skfiy</p>
          <div role="status" aria-label="Task status" className="status-line">
            <strong>{status.label}</strong>
            <span>{status.pulse}</span>
          </div>
        </div>
        <div className="mode-stack" aria-label="Mode controls">
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
        </div>
      </section>

      <p className="task-message">{task.message}</p>

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
        <div className="intent-chip" aria-hidden="true">
          <Sparkles size={14} />
          <span>{switchingMode === "auto" ? `auto/${effectiveMode}` : effectiveMode}</span>
        </div>
      </div>
    </main>
  );
}
