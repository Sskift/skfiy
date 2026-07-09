import type { AssistantComputerUseToolIdentity } from "./assistant-computer-use-executor.js";
import { isSameComputerUseToolIdentity } from "./main-computer-use-tool-result.js";
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

export interface ComputerUseToolCallState {
  pendingApproval: PendingApproval | null;
  activeToolIdentity: AssistantComputerUseToolIdentity | null;
}

export interface ComputerUseToolCallRouteState extends ComputerUseToolCallState {
  activeRoute: ComputerUseCommandRoute | null;
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

export function completeComputerUseToolCallState(
  state: ComputerUseToolCallState,
  identity: AssistantComputerUseToolIdentity
): ComputerUseToolCallState {
  return {
    pendingApproval: isSameComputerUseToolIdentity(state.pendingApproval, identity) ? null : state.pendingApproval,
    activeToolIdentity: isSameComputerUseToolIdentity(state.activeToolIdentity, identity)
      ? null
      : state.activeToolIdentity
  };
}

export function readComputerUseToolCallIdentityToCancel(
  state: ComputerUseToolCallState
): AssistantComputerUseToolIdentity | null {
  return state.pendingApproval ?? state.activeToolIdentity;
}

export function cancelComputerUseToolCallState(
  state: ComputerUseToolCallState,
  identity: AssistantComputerUseToolIdentity
): ComputerUseToolCallState {
  return {
    pendingApproval: null,
    activeToolIdentity: isSameComputerUseToolIdentity(state.activeToolIdentity, identity)
      ? null
      : state.activeToolIdentity
  };
}

export function readComputerUseRouteForToolCallState(
  state: ComputerUseToolCallRouteState
): ComputerUseCommandRoute | null {
  if (state.pendingApproval) {
    return state.pendingApproval.route;
  }

  return state.activeToolIdentity ? state.activeRoute : null;
}
