import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("assistant tool bridge main-process wiring", () => {
  it("creates an assistant turn before invoking existing Computer Use routes", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const helperSource = readFileSync(path.join(process.cwd(), "src/main/main-command-routing.ts"), "utf8");
    const assistantTurnIndex = source.indexOf("const assistantTurn = await createAssistantAgentTaskTurn(command)");
    const routeIndex = source.indexOf("const route = assistantTurn.route", assistantTurnIndex);
    const routeDecisionIndex = source.indexOf("const routeDecision = createRunCommandRouteDecision({");
    const clarificationIndex = source.indexOf("if (routeDecision.kind === \"needs_clarification\")");
    const terminalRouteStateIndex = source.indexOf("if (routeDecision.kind === \"terminal_route_state\")");
    const confirmationIndex = source.indexOf("if (routeDecision.kind === \"needs_confirmation\")");
    const executorPlanIndex = source.indexOf("assistantComputerUseExecutor.planToolCall");
    const toolPlanIndex = source.indexOf("emitAssistantToolPlanTaskEvent(window, assistantTurn, command, route)");
    const continuationIndex = source.indexOf("await continueComputerUseTask({", toolPlanIndex);
    const tmuxIndex = source.indexOf("if (route.kind === \"tmux_supervision\")");

    expect(source).toContain("AssistantAgentTurnRuntimeError");
    expect(source).toContain("createAssistantToolPlanRouteTaskEvent");
    expect(source).toContain("createAssistantComputerUseExecutor({");
    expect(source).toContain("createRunCommandRouteDecision");
    expect(helperSource).toContain("assistantTurnStatus !== \"completed\"");
    expect(helperSource.indexOf("if (route.kind === \"chat\")"))
      .toBeLessThan(helperSource.indexOf("if (assistantTurnStatus !== \"completed\")"));
    expect(routeIndex).toBeGreaterThan(-1);
    expect(routeIndex).toBeGreaterThan(assistantTurnIndex);
    expect(routeDecisionIndex).toBeGreaterThan(assistantTurnIndex);
    expect(terminalRouteStateIndex).toBeGreaterThan(clarificationIndex);
    expect(terminalRouteStateIndex).toBeLessThan(executorPlanIndex);
    expect(executorPlanIndex).toBeGreaterThan(assistantTurnIndex);
    expect(executorPlanIndex).toBeLessThan(toolPlanIndex);
    expect(toolPlanIndex).toBeGreaterThan(clarificationIndex);
    expect(confirmationIndex).toBeGreaterThan(toolPlanIndex);
    expect(confirmationIndex).toBeLessThan(continuationIndex);
    expect(continuationIndex).toBeGreaterThan(toolPlanIndex);
    expect(tmuxIndex).toBeGreaterThan(-1);
  });

  it("stores approval continuations by assistant Computer Use tool identity", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const helperSource = readFileSync(path.join(process.cwd(), "src/main/main-pending-approval.ts"), "utf8");

    expect(source).toContain("type PendingApproval");
    expect(helperSource).toContain("interface PendingApproval extends AssistantComputerUseToolIdentity");
    expect(source).toContain("identity: AssistantComputerUseToolIdentity");
    expect(source).toContain("activeComputerUseToolIdentity = toolIdentity");
  });

  it("does not report a failed chat provider turn as completed", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const helperSource = readFileSync(path.join(process.cwd(), "src/main/main-route-task-events.ts"), "utf8");
    const chatRouteStart = source.indexOf("if (routeDecision.kind === \"chat\")");
    const nextRouteStart = source.indexOf("if (routeDecision.kind === \"assistant_failed\")", chatRouteStart);
    const chatRouteBlock = source.slice(chatRouteStart, nextRouteStart);

    expect(chatRouteStart).toBeGreaterThan(-1);
    expect(nextRouteStart).toBeGreaterThan(chatRouteStart);
    expect(chatRouteBlock).toContain("createAssistantChatRouteTaskEvent({");
    expect(helperSource).toContain("status === \"completed\" ? \"completed\" : \"failed\"");
  });

  it("resumes approval, denial, and stop through the existing Computer Use continuation", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const approveHandlerStart = source.indexOf("ipcMain.handle(\"skfiy:approve-task\"");
    const denyHandlerStart = source.indexOf("ipcMain.handle(\"skfiy:deny-task\"");
    const stopHandlerStart = source.indexOf("ipcMain.handle(\"skfiy:stop-task\"");
    const approveHandler = source.slice(approveHandlerStart, denyHandlerStart);
    const denyHandler = source.slice(denyHandlerStart, stopHandlerStart);
    const stopHandler = source.slice(stopHandlerStart);

    expect(approveHandler).toContain("await resumePendingApprovalTask(window, approval)");
    expect(approveHandler).not.toContain("runCommandTask(");
    expect(denyHandler).toContain("assistantComputerUseExecutor.resumeApproval({");
    expect(denyHandler).toContain("decision: \"denied\"");
    expect(denyHandler).toContain("createPendingApprovalDeniedTaskEvent(approval)");
    expect(stopHandler).toContain("const stopTask = createStopTaskEventDecision({");
    expect(stopHandler).toContain("activeRoute: activeComputerUseRoute");
    expect(stopHandler).toContain("pendingApproval");
    expect(stopHandler).toContain("cancelActiveComputerUseToolCall(stopTask.cancellationReason)");
  });

  it("records structured route terminal and approval events into replay", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const taskDispatchToolResult = sliceSource(
      source,
      "if (dispatch.toolResult) {",
      "\n  }\n\n  emitTurnReplayTaskEvent(window, dispatch.taskStatus);"
    );
    const appPolicyBlocked = sliceSource(
      source,
      "if (appPolicyPreflight.kind === \"blocked\")",
      "if (appPolicyPreflight.kind === \"approval_required\")"
    );
    const appPolicyApproval = sliceSource(
      source,
      "if (appPolicyPreflight.kind === \"approval_required\")",
      "if (approved && route.kind === \"chrome\")"
    );
    const plannerUnavailable = sliceSource(
      source,
      "if (plannerRuntime.decision === \"unavailable\")",
      "const plannedCommand = await resolvePlannerCommand({"
    );
    const computerUseFailure = sliceSource(
      source,
      "const message = error instanceof Error ? error.message : \"Task failed.\"",
      "async function runTmuxSupervisionCommandTask("
    );
    const tmuxFailure = sliceSource(
      source,
      "const message = error instanceof Error ? error.message : \"tmux supervision failed.\"",
      "async function runCommandTask("
    );
    const routeConfirmation = sliceSource(
      source,
      "if (routeDecision.kind === \"needs_confirmation\")",
      "if (approved) {"
    );
    const denyHandler = sliceSource(
      source,
      "ipcMain.handle(\"skfiy:deny-task\"",
      "ipcMain.handle(\"skfiy:take-screenshot\""
    );
    const stopHandler = sliceSource(
      source,
      "ipcMain.handle(\"skfiy:stop-task\"",
      "ipcMain.handle(\"skfiy:get-permissions\""
    );

    expect(taskDispatchToolResult).toContain("completeComputerUseToolCall(toolIdentity, dispatch.toolResult)");
    expect(taskDispatchToolResult).toContain("emitTurnReplayTaskEvent(window, dispatch.taskStatus)");
    expect(taskDispatchToolResult).not.toContain("emitTaskEvent(window, dispatch.taskStatus)");
    expect(appPolicyBlocked).toContain("emitTurnReplayTaskEvent(window, appPolicyPreflight.taskEvent)");
    expect(appPolicyBlocked).not.toContain("emitTaskEvent(window, appPolicyPreflight.taskEvent)");
    expect(appPolicyApproval).toContain("emitTurnReplayTaskEvent(window, appPolicyPreflight.taskEvent)");
    expect(appPolicyApproval).not.toContain("emitTaskEvent(window, appPolicyPreflight.taskEvent)");
    expect(plannerUnavailable).toContain("emitTurnReplayTaskEvent(window, createPlannerUnavailableTaskEvent({");
    expect(plannerUnavailable).not.toContain("emitTaskEvent(window, createPlannerUnavailableTaskEvent({");
    expect(computerUseFailure).toContain("emitTurnReplayTaskEvent(window, createComputerUseFailureTaskEvent({");
    expect(tmuxFailure).toContain("emitTurnReplayTaskEvent(window, createComputerUseFailureTaskEvent({");
    expect(routeConfirmation).toContain("emitTurnReplayTaskEvent(window, createNeedsConfirmationRouteTaskEvent({");
    expect(routeConfirmation).not.toContain("emitTaskEvent(window, createNeedsConfirmationRouteTaskEvent({");
    expect(denyHandler).toContain("const denialEvent = createPendingApprovalDeniedTaskEvent(approval)");
    expect(denyHandler).toContain("if (approval) {\n    emitTurnReplayTaskEvent(window, denialEvent);");
    expect(denyHandler).toContain("emitTaskEvent(window, denialEvent)");
    expect(stopHandler).toContain("const stopTask = createStopTaskEventDecision({");
    expect(stopHandler).toContain("if (stopTask.delivery === \"turn-replay\") {\n    emitTurnReplayTaskEvent(window, stopTask.event);");
    expect(stopHandler).toContain("emitTaskEvent(window, stopTask.event)");
  });
});

function sliceSource(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}
