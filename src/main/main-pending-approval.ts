import type { AssistantComputerUseToolIdentity } from "./assistant-computer-use-executor.js";
import type { ExecutableCommandRoute } from "./task-routing.js";
import {
  withRouteTaskEventMetadata,
  type ManualMode,
  type TaskEvent
} from "./task-event-view.js";

export type ComputerUseCommandRoute = ExecutableCommandRoute;

export interface PendingApproval extends AssistantComputerUseToolIdentity {
  command: string;
  mode: ManualMode;
  route: ComputerUseCommandRoute;
  planApproved?: boolean;
}

export const USER_DENIED_COMPUTER_USE_REASON = "User denied this Computer Use turn.";

export function createPendingApproval(
  command: string,
  mode: ManualMode,
  identity: AssistantComputerUseToolIdentity,
  route: ComputerUseCommandRoute,
  planApproved = false
): PendingApproval {
  return {
    ...identity,
    command,
    mode,
    route,
    ...(planApproved ? { planApproved } : {})
  };
}

export function createPendingApprovalDeniedTaskEvent(
  approval: PendingApproval | null
): TaskEvent {
  const taskEvent: TaskEvent = {
    status: approval ? "denied" : "idle",
    message: approval ? "Task denied." : "No task is waiting for approval.",
    ...(approval ? { command: approval.command } : {})
  };

  return approval
    ? withRouteTaskEventMetadata(taskEvent, approval.route, {
      routeReason: USER_DENIED_COMPUTER_USE_REASON,
      denialKind: "user"
    })
    : taskEvent;
}
