import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("assistant tool bridge main-process wiring", () => {
  it("creates an assistant turn before invoking existing Computer Use routes", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const routeIndex = source.indexOf("const route = selectCommandRoute(command)");
    const assistantTurnIndex = source.indexOf("const assistantTurn = await createAssistantAgentTaskTurn(command)");
    const clarificationIndex = source.indexOf("if (route.kind === \"needs_clarification\")");
    const toolPlanIndex = source.indexOf("emitAssistantToolPlanTaskEvent(window, assistantTurn, command)");
    const tmuxIndex = source.indexOf("if (route.kind === \"tmux_supervision\")");

    expect(source).toContain("AssistantAgentTurnRuntimeError");
    expect(source).toContain("summarizeAssistantToolPlan");
    expect(routeIndex).toBeGreaterThan(-1);
    expect(assistantTurnIndex).toBeGreaterThan(routeIndex);
    expect(toolPlanIndex).toBeGreaterThan(clarificationIndex);
    expect(tmuxIndex).toBeGreaterThan(toolPlanIndex);
  });
});
