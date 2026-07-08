import type { AssistantAgentTurnResult } from "./assistant-agent.js";
import type { CommandRoute } from "./task-routing.js";
import {
  withRouteTaskEventMetadata,
  type TaskEvent
} from "./task-event-view.js";

export function createAssistantChatRouteTaskEvent({
  status,
  message
}: {
  status: AssistantAgentTurnResult["status"];
  message: string;
}): TaskEvent {
  return {
    status: status === "completed" ? "completed" : "failed",
    message
  };
}

export function createAssistantTurnFailedRouteTaskEvent({
  command,
  message,
  route
}: {
  command: string;
  message: string;
  route: CommandRoute;
}): TaskEvent {
  return withRouteTaskEventMetadata({
    status: "failed",
    message,
    command
  }, route, {
    routeReason: message
  });
}

export function createNeedsClarificationRouteTaskEvent(
  route: Extract<CommandRoute, { kind: "needs_clarification" }>
): TaskEvent {
  return withRouteTaskEventMetadata({
    status: "needs_clarification",
    message: `${route.reason} 请明确目标应用和动作。`
  }, route);
}

export function createTerminalRouteTaskEvent({
  command,
  route
}: {
  command: string;
  route: Extract<CommandRoute, { kind: "denied" | "blocked" }>;
}): TaskEvent {
  return withRouteTaskEventMetadata({
    status: route.kind,
    message: route.reason,
    command
  }, route);
}

export function createNeedsConfirmationRouteTaskEvent({
  command,
  route
}: {
  command: string;
  route: Extract<CommandRoute, { kind: "needs_confirmation" }>;
}): TaskEvent {
  return withRouteTaskEventMetadata({
    status: "needs_confirmation",
    message: route.reason,
    command
  }, route);
}
