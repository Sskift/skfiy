import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Chrome approval main-process wiring", () => {
  it("records approved Chrome tasks into host policy before execution", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const routeEventSource = readFileSync(path.join(process.cwd(), "src/main/main-route-task-events.ts"), "utf8");
    const importIndex = source.indexOf("applyApprovedChromeTaskHostPolicy");
    const approvalIndex = source.indexOf("if (approved && route.kind === \"chrome\")");
    const runIndex = source.indexOf("if (route.kind === \"chrome\")", approvalIndex + 1);
    const taskIdIndex = source.indexOf("const taskId = currentTaskId + 1", approvalIndex);

    expect(importIndex).toBeGreaterThan(-1);
    expect(approvalIndex).toBeGreaterThan(importIndex);
    expect(taskIdIndex).toBeGreaterThan(approvalIndex);
    expect(runIndex).toBeGreaterThan(taskIdIndex);
    expect(source).toContain("createChromeHostPolicyAllowedTaskEvent");
    expect(source).toContain("createChromeHostPolicyBlockedTaskEvent");
    expect(source).toContain("createChromeHostPolicyApprovalFailedTaskEvent");
    expect(routeEventSource).toContain("Chrome host policy allowed for current turn");
    expect(routeEventSource).toContain("Chrome host policy blocked this approved task");
    expect(routeEventSource).toContain("Chrome host policy approval failed");
  });
});
