import type { RuntimeSnapshotCurrentTurnInput } from "./runtime-snapshot.js";
import type { TaskEvent } from "./task-event-view.js";

export function createRuntimeSnapshotCurrentTurnFromTaskEvent(
  event: TaskEvent
): RuntimeSnapshotCurrentTurnInput {
  return {
    state: event.status,
    ...(event.message ? { message: event.message } : {}),
    ...(event.command ? { command: event.command } : {})
  };
}
