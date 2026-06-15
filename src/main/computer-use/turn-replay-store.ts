import {
  createTurnTranscript,
  type ComputerUseTurnEvent,
  type TurnTranscript
} from "./turn-transcript.js";

export type TurnReplayTaskStatus =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "failed";

export interface TurnReplayTaskEvent {
  status: TurnReplayTaskStatus;
  message?: string;
  command?: string;
}

export interface TurnReplay {
  transcript: TurnTranscript;
  timeline: TurnReplayTaskEvent[];
}

export function createTurnReplayStore() {
  let active = false;
  let hasReplay = false;
  let computerUseEvents: ComputerUseTurnEvent[] = [];
  let timeline: TurnReplayTaskEvent[] = [];

  return {
    startTurn(): void {
      active = true;
      hasReplay = true;
      computerUseEvents = [];
      timeline = [];
    },
    recordComputerUseEvent(event: ComputerUseTurnEvent): void {
      if (!hasReplay) {
        return;
      }

      computerUseEvents = [...computerUseEvents, event];

      if (event.type === "completed") {
        active = false;
      }
    },
    recordTaskEvent(event: TurnReplayTaskEvent): void {
      if (!hasReplay) {
        return;
      }

      timeline = [...timeline, { ...event }];

      if (
        event.status === "completed"
        || event.status === "failed"
        || event.status === "needs_confirmation"
        || event.status === "idle"
      ) {
        active = false;
      }
    },
    getReplay(): TurnReplay | null {
      if (!hasReplay && !active) {
        return null;
      }

      return {
        transcript: createReplayTranscript(computerUseEvents, timeline),
        timeline: timeline.map((event) => ({ ...event }))
      };
    }
  };
}

function createReplayTranscript(
  events: readonly ComputerUseTurnEvent[],
  timeline: readonly TurnReplayTaskEvent[]
): TurnTranscript {
  const transcript = createTurnTranscript(events);
  const finalStatus = timeline.at(-1)?.status;

  if (finalStatus === "failed") {
    return {
      ...transcript,
      outcome: "failed"
    };
  }

  return transcript;
}
