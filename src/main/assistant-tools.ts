import type { AssistantAgentTurnResult } from "./assistant-agent.js";
import type { CommandRoute } from "./task-routing.js";

export interface AssistantToolPlanSummary {
  providerLabel: AssistantAgentTurnResult["providerLabel"];
  turnId: string;
  route: CommandRoute;
  plannedToolCount: number;
  message: string;
}

export function summarizeAssistantToolPlan(
  turn: AssistantAgentTurnResult
): AssistantToolPlanSummary | undefined {
  const plannedToolCount = turn.toolCalls.filter((toolCall) => toolCall.status === "planned").length;
  if (plannedToolCount === 0) {
    return undefined;
  }

  return {
    providerLabel: turn.providerLabel,
    turnId: turn.id,
    route: turn.route,
    plannedToolCount,
    message: `${turn.providerLabel} planned ${formatToolCount(plannedToolCount)} for ${formatCommandRoute(turn.route)}.`
  };
}

function formatToolCount(count: number): string {
  return count === 1 ? "1 Computer Use tool call" : `${count} Computer Use tool calls`;
}

function formatCommandRoute(route: CommandRoute): string {
  switch (route.kind) {
    case "chrome":
      return "Chrome";
    case "finder":
      return "Finder";
    case "ghostty":
      return "Ghostty";
    case "tmux_supervision":
      return "money-run supervision";
    case "chat":
      return "chat";
    case "needs_clarification":
      return "clarification";
  }
}
