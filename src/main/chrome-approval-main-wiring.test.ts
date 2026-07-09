import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Chrome approval main-process wiring", () => {
  it("records approved Chrome tasks into host policy before execution", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const preflightSource = readFileSync(path.join(process.cwd(), "src/main/main-computer-use-preflight.ts"), "utf8");
    const routeEventSource = readFileSync(path.join(process.cwd(), "src/main/main-route-task-events.ts"), "utf8");
    const importIndex = source.indexOf("applyApprovedChromeTaskHostPolicy");
    const approvalIndex = source.indexOf("if (approved && route.kind === \"chrome\")");
    const preflightIndex = source.indexOf("createChromeHostPolicyPreflightDecision", approvalIndex);
    const runIndex = source.indexOf("if (route.kind === \"chrome\")", approvalIndex + 1);
    const taskEpochIndex = source.indexOf("const { controller, taskId } = startComputerUseTaskEpoch();", approvalIndex);

    expect(importIndex).toBeGreaterThan(-1);
    expect(approvalIndex).toBeGreaterThan(importIndex);
    expect(preflightIndex).toBeGreaterThan(approvalIndex);
    expect(preflightIndex).toBeLessThan(taskEpochIndex);
    expect(taskEpochIndex).toBeGreaterThan(approvalIndex);
    expect(runIndex).toBeGreaterThan(taskEpochIndex);
    expect(source).toContain("createStartedComputerUseTaskState");
    expect(preflightSource).toContain("createChromeHostPolicyAllowedTaskEvent");
    expect(preflightSource).toContain("createChromeHostPolicyBlockedTaskEvent");
    expect(preflightSource).toContain("createChromeHostPolicyApprovalFailedTaskEvent");
    expect(routeEventSource).toContain("Chrome host policy allowed for current turn");
    expect(routeEventSource).toContain("Chrome host policy blocked this approved task");
    expect(routeEventSource).toContain("Chrome host policy approval failed");
  });

  it("records Chrome host policy terminal preflight events into replay", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const preflightStart = source.indexOf("const chromeHostPolicyPreflight = createChromeHostPolicyPreflightDecision({");
    const terminalStart = source.indexOf(
      "if (chromeHostPolicyPreflight.kind === \"blocked\" || chromeHostPolicyPreflight.kind === \"failed\")",
      preflightStart
    );
    const allowedStart = source.indexOf("if (chromeHostPolicyPreflight.kind === \"allowed_current_turn\")", terminalStart);
    const terminalBlock = source.slice(terminalStart, allowedStart);

    expect(preflightStart).toBeGreaterThan(-1);
    expect(terminalStart).toBeGreaterThan(preflightStart);
    expect(allowedStart).toBeGreaterThan(terminalStart);
    expect(terminalBlock).toContain("completeComputerUseToolCall(toolIdentity, chromeHostPolicyPreflight.toolResult)");
    expect(terminalBlock).toContain("emitTurnReplayTaskEvent(window, chromeHostPolicyPreflight.taskEvent)");
    expect(terminalBlock).not.toContain("emitTaskEvent(window, chromeHostPolicyPreflight.taskEvent)");
  });
});
