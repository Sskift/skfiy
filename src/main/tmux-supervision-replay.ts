import type { ComputerUseTurnEvent } from "./computer-use/turn-transcript.js";
import type { TmuxSupervisionTaskEvent } from "./orchestrator/tmux-supervision-task.js";

export function createTmuxSupervisionReplayEvent(
  event: TmuxSupervisionTaskEvent
): ComputerUseTurnEvent | undefined {
  switch (event.type) {
    case "started":
      return {
        type: "started",
        command: formatTmuxSupervisionReplayCommand(event.sessionName),
        risk: event.risk
      };
    case "approval_required":
      return {
        type: "approval_required",
        command: formatTmuxSupervisionReplayCommand(event.sessionName),
        risk: event.risk
      };
    case "completed":
      return {
        type: "completed",
        command: formatTmuxSupervisionReplayCommand(event.sessionName),
        summary: event.summary
      };
    case "verification_failed":
      return {
        type: "verification_failed",
        stage: event.stage,
        reason: event.reason
      };
    case "observing":
      return undefined;
  }
}

function formatTmuxSupervisionReplayCommand(sessionName: string): string {
  return `监督 tmux ${sessionName} 这个 session`;
}
