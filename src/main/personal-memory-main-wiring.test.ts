import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("personal memory main-process wiring", () => {
  it("delegates completed assistant turns to the tested personalization learning loop", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const scheduleIndex = source.indexOf("function schedulePersonalMemoryPostTurnReview");
    const scheduleBlock = source.slice(scheduleIndex, source.indexOf("function createAssistantAgentTaskMessage", scheduleIndex));

    expect(scheduleIndex).toBeGreaterThan(-1);
    expect(source).toContain("recordCompletedAssistantTurnForPersonalization");
    expect(scheduleBlock).toContain("memoryStore: personalMemoryStore");
    expect(scheduleBlock).toContain("pendingMemoryStore: pendingPersonalMemoryStore");
    expect(scheduleBlock).toContain("sessionMemoryStore");
    expect(scheduleBlock).toContain("memoryWriteApprovalEnabled: personalMemoryWriteApprovalEnabled");
    expect(scheduleBlock).toContain("runReviewTurn: (reviewPrompt, { personalMemory }) => runAssistantAgentTurn(reviewPrompt");
    expect(scheduleBlock).toContain("timeoutMs: Math.min(settings.timeoutMs, PERSONAL_MEMORY_REVIEW_TIMEOUT_MS)");
    expect(source).toContain("SKFIY_PERSONAL_MEMORY_WRITE_APPROVAL");
  });
});
