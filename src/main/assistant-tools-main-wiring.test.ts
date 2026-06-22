import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("assistant tool bridge main-process wiring", () => {
  it("creates an assistant turn before invoking existing Computer Use routes", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const routeIndex = source.indexOf("const route = selectCommandRoute(command)");
    const assistantTurnIndex = source.indexOf("const assistantTurn = await createAssistantAgentTaskTurn(command)");
    const clarificationIndex = source.indexOf("if (route.kind === \"needs_clarification\")");
    const executorPlanIndex = source.indexOf("assistantComputerUseExecutor.planToolCall");
    const toolPlanIndex = source.indexOf("emitAssistantToolPlanTaskEvent(window, assistantTurn, command)");
    const continuationIndex = source.indexOf("await continueComputerUseTask({", toolPlanIndex);
    const tmuxIndex = source.indexOf("if (route.kind === \"tmux_supervision\")");

    expect(source).toContain("AssistantAgentTurnRuntimeError");
    expect(source).toContain("summarizeAssistantToolPlan");
    expect(source).toContain("createAssistantComputerUseExecutor({");
    expect(routeIndex).toBeGreaterThan(-1);
    expect(assistantTurnIndex).toBeGreaterThan(routeIndex);
    expect(executorPlanIndex).toBeGreaterThan(assistantTurnIndex);
    expect(executorPlanIndex).toBeLessThan(toolPlanIndex);
    expect(toolPlanIndex).toBeGreaterThan(clarificationIndex);
    expect(continuationIndex).toBeGreaterThan(toolPlanIndex);
    expect(tmuxIndex).toBeGreaterThan(-1);
  });

  it("stores approval continuations by assistant Computer Use tool identity", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");

    expect(source).toContain("interface PendingApproval extends AssistantComputerUseToolIdentity");
    expect(source).toContain("identity: AssistantComputerUseToolIdentity");
    expect(source).toContain("pendingApproval = createPendingApproval(command, mode, toolIdentity");
    expect(source).toContain("activeComputerUseToolIdentity = toolIdentity");
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
    expect(stopHandler).toContain("cancelActiveComputerUseToolCall(\"Task stopped.\")");
  });
});
