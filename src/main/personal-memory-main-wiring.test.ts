import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("personal memory main-process wiring", () => {
  it("falls back to narrow local preference extraction when provider review is empty or unavailable", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const scheduleIndex = source.indexOf("function schedulePersonalMemoryPostTurnReview");
    const scheduleBlock = source.slice(scheduleIndex, source.indexOf("function createAssistantAgentTaskMessage", scheduleIndex));

    expect(scheduleIndex).toBeGreaterThan(-1);
    expect(scheduleBlock).toContain("createFallbackPersonalMemoryOperations");
    expect(scheduleBlock).toContain("const applyFallbackMemory = () =>");
    expect(scheduleBlock).toContain("if (operations.length > 0)");
    expect(scheduleBlock).toContain("applyFallbackMemory();");
    expect(scheduleBlock).toContain("}).catch(() => {");
    expect(source).toContain("SKFIY_PERSONAL_MEMORY_WRITE_APPROVAL");
    expect(scheduleBlock).toContain("applyOrStagePersonalMemoryOperations");
    expect(scheduleBlock).toContain("source: \"post-turn-review\"");
  });
});
