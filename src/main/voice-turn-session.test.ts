import { describe, expect, it } from "vitest";
import { createVoiceTurnSessionStore } from "./voice-turn-session";

describe("voice turn session store", () => {
  it("tracks a voice turn from listening through final transcript", () => {
    const store = createVoiceTurnSessionStore({ now: () => 1_000, defaultTimeoutMs: 10_000 });

    const session = store.start({
      providerId: "doubao",
      trigger: "pet-click"
    });

    expect(session).toMatchObject({
      id: "voice-turn-1",
      providerId: "doubao",
      trigger: "pet-click",
      status: "listening",
      startedAt: 1_000,
      updatedAt: 1_000,
      timeoutAt: 11_000
    });
    expect(store.getActive()?.id).toBe(session.id);

    expect(store.appendPartial(session.id, { text: "打开 Ghost", confidence: 0.62 }))
      .toMatchObject({
        id: session.id,
        status: "transcribing",
        partialTranscript: "打开 Ghost",
        confidence: 0.62
      });
    expect(store.finalize(session.id, { text: "打开 Ghostty 执行 pwd", confidence: 0.91 }))
      .toMatchObject({
        id: session.id,
        status: "finalized",
        finalTranscript: "打开 Ghostty 执行 pwd",
        confidence: 0.91
      });
    expect(store.getActive()).toBeNull();
  });

  it("cancels an active voice turn and rejects transcript updates afterward", () => {
    const store = createVoiceTurnSessionStore({ now: () => 2_000 });
    const session = store.start({ providerId: "browser", trigger: "global-hotkey" });

    expect(store.cancel(session.id, "manual-stop")).toMatchObject({
      id: session.id,
      status: "cancelled",
      stopReason: "manual-stop"
    });
    expect(store.getActive()).toBeNull();
    expect(() => store.appendPartial(session.id, { text: "late" })).toThrow(
      "Voice turn voice-turn-1 is not active."
    );
  });

  it("expires an active listening turn without final text", () => {
    let currentTime = 5_000;
    const store = createVoiceTurnSessionStore({
      now: () => currentTime,
      defaultTimeoutMs: 1_000
    });
    const session = store.start({ providerId: "doubao", trigger: "pet-click" });

    currentTime = 6_001;

    expect(store.expireActive()).toMatchObject({
      id: session.id,
      status: "failed",
      stopReason: "timeout",
      failureMessage: "Voice turn timed out before a final transcript was received."
    });
    expect(store.getActive()).toBeNull();
  });
});
