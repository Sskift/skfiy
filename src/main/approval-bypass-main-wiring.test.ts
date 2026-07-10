import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pet approval bypass wiring", () => {
  it("defaults pet Computer Use turns to the approval bypass helper", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");

    expect(source).toContain("readDefaultApprovalBypass(process.env)");
    expect(source).toContain("const request = readRunCommandRequest(command, options);");
    expect(source).toContain("await runCommandTask(window, request.command, request.mode, readDefaultApprovalBypass(process.env));");
    expect(source).toContain("assistantComputerUseExecutor.bypassApproval({");
    expect(source).toContain("reason: \"Default approval bypass enabled for this Computer Use turn.\"");
  });
});
