import {
  createTurnTranscript,
  type ComputerUseTurnEvent,
  type TurnTranscript
} from "./turn-transcript.js";

export type TurnReplayTaskStatus =
  | "idle"
  | "planned"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
  | "running"
  | "completed"
  | "denied"
  | "blocked"
  | "cancelled"
  | "failed";

export interface TurnReplayTaskEvent {
  status: TurnReplayTaskStatus;
  message?: string;
  command?: string;
  turnId?: string;
  toolCallId?: string;
  route?: string;
  routeReason?: string;
  denialKind?: string;
  policyKind?: string;
}

export interface TurnReplay {
  transcript: TurnTranscript;
  timeline: TurnReplayTaskEvent[];
}

export interface TurnReplayStoreOptions {
  onReplayChanged?: (replay: TurnReplay | null) => void;
}

export function createTurnReplayStore(options: TurnReplayStoreOptions = {}) {
  let active = false;
  let hasReplay = false;
  let computerUseEvents: ComputerUseTurnEvent[] = [];
  let timeline: TurnReplayTaskEvent[] = [];

  const notifyReplayChanged = () => {
    options.onReplayChanged?.(readReplay());
  };

  return {
    startTurn(): void {
      active = true;
      hasReplay = true;
      computerUseEvents = [];
      timeline = [];
      notifyReplayChanged();
    },
    recordComputerUseEvent(event: ComputerUseTurnEvent): void {
      if (!hasReplay) {
        return;
      }

      computerUseEvents = [...computerUseEvents, event];

      if (event.type === "completed") {
        active = false;
      }
      notifyReplayChanged();
    },
    recordTaskEvent(event: TurnReplayTaskEvent): void {
      if (!hasReplay) {
        return;
      }

      timeline = [...timeline, { ...event }];

      if (
        event.status === "completed"
        || event.status === "failed"
        || event.status === "denied"
        || event.status === "blocked"
        || event.status === "cancelled"
        || event.status === "needs_confirmation"
        || event.status === "idle"
      ) {
        active = false;
      }
      notifyReplayChanged();
    },
    getReplay(): TurnReplay | null {
      return readReplay();
    }
  };

  function readReplay(): TurnReplay | null {
    if (!hasReplay && !active) {
      return null;
    }

    return {
      transcript: createReplayTranscript(computerUseEvents, timeline),
      timeline: timeline.map((event) => ({ ...event }))
    };
  }
}

function createReplayTranscript(
  events: readonly ComputerUseTurnEvent[],
  timeline: readonly TurnReplayTaskEvent[]
): TurnTranscript {
  const transcript = createTurnTranscript(events);
  const finalStatus = timeline.at(-1)?.status;

  if (
    finalStatus === "failed"
    || finalStatus === "denied"
    || finalStatus === "blocked"
    || finalStatus === "cancelled"
  ) {
    return {
      ...transcript,
      outcome: finalStatus
    };
  }

  return transcript;
}
