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

  it("does not synthesize a late Doubao Escape stop after the provider handle is gone", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const start = source.indexOf("async function stopCurrentDictationProvider");
    const end = source.indexOf("function emitTurnReplayTaskEvent", start);
    const stopCurrentDictationProvider = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(stopCurrentDictationProvider).not.toContain("createDoubaoDictationProvider");
    expect(stopCurrentDictationProvider).not.toContain("voiceTrigger");
  });

  it("lets the Doubao stop key settle before starting Computer Use", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const stopIndex = source.indexOf("await stopCurrentDictationProvider(window);");
    const settleIndex = source.indexOf("await waitForDictationStopKeyToSettle();");
    const computerUseIndex = source.indexOf("await runCommandTask(window, trimmed, \"active\", false)");

    expect(stopIndex).toBeGreaterThan(-1);
    expect(settleIndex).toBeGreaterThan(stopIndex);
    expect(computerUseIndex).toBeGreaterThan(settleIndex);
  });
});
