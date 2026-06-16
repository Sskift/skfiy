import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("voice intent admission main-process wiring", () => {
  it("gates submitted dictation before entering Computer Use", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const admissionIndex = source.indexOf("const voiceAdmission = decideVoiceIntentAdmission");
    const computerUseIndex = source.indexOf("await runCommandTask(window, trimmed, \"active\", false)");

    expect(source).toContain("decideVoiceIntentAdmission");
    expect(admissionIndex).toBeGreaterThan(-1);
    expect(computerUseIndex).toBeGreaterThan(-1);
    expect(admissionIndex).toBeLessThan(computerUseIndex);
    expect(source).toContain("voiceAdmission.decision === \"computer_use\"");
    expect(source).toContain("Voice intent needs clarification");
    expect(source).toContain("Voice intent routed to chat");
  });
});
