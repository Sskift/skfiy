import { describe, expect, it } from "vitest";
import {
  createVoiceTurnSessionStore,
  decideVoiceIntentAdmission,
  type VoiceTurnSession
} from "./voice-turn-session";

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

  it("records partial and final transcript candidates without ending the active turn", () => {
    const store = createVoiceTurnSessionStore({ now: () => 3_000 });
    const session = store.start({ providerId: "browser", trigger: "pet-click" });

    expect(store.recordTranscriptCandidate(session.id, {
      text: "打开 Ghost",
      isFinal: false,
      confidence: 0.52
    })).toMatchObject({
      id: session.id,
      status: "transcribing",
      partialTranscript: "打开 Ghost",
      confidence: 0.52
    });
    expect(store.getActive()?.id).toBe(session.id);

    expect(store.recordTranscriptCandidate(session.id, {
      text: "打开 Ghostty 执行 pwd",
      isFinal: true,
      confidence: 0.88
    })).toMatchObject({
      id: session.id,
      status: "transcribing",
      partialTranscript: "打开 Ghost",
      finalTranscript: "打开 Ghostty 执行 pwd",
      confidence: 0.88
    });
    expect(store.getActive()?.id).toBe(session.id);
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

describe("decideVoiceIntentAdmission", () => {
  it("requires a recorded final transcript for browser and native speech sessions", () => {
    expect(decideVoiceIntentAdmission({
      session: createSession({
        providerId: "browser",
        finalTranscript: undefined
      }),
      submittedText: "打开 Ghostty 执行 pwd",
      route: { kind: "ghostty", bundleId: "com.mitchellh.ghostty" }
    })).toMatchObject({
      decision: "needs_clarification",
      reason: "Voice provider did not produce a final transcript."
    });
  });

  it("rejects submitted text that differs from the final transcript candidate", () => {
    expect(decideVoiceIntentAdmission({
      session: createSession({
        finalTranscript: "打开 Ghostty 执行 pwd",
        confidence: 0.91
      }),
      submittedText: "rm -rf ~/Desktop",
      route: { kind: "ghostty", bundleId: "com.mitchellh.ghostty" }
    })).toMatchObject({
      decision: "needs_clarification",
      reason: "Submitted voice text does not match the final transcript candidate."
    });
  });

  it("rejects low-confidence final transcript candidates before Computer Use", () => {
    expect(decideVoiceIntentAdmission({
      session: createSession({
        finalTranscript: "打开 Ghostty 执行 pwd",
        confidence: 0.42
      }),
      submittedText: "打开 Ghostty 执行 pwd",
      route: { kind: "ghostty", bundleId: "com.mitchellh.ghostty" },
      minConfidence: 0.6
    })).toMatchObject({
      decision: "needs_clarification",
      reason: "Voice confidence 0.42 is below the 0.6 admission threshold."
    });
  });

  it("routes chat and unsupported voice turns away from Computer Use", () => {
    expect(decideVoiceIntentAdmission({
      session: createSession({
        finalTranscript: "你是谁",
        confidence: 0.9
      }),
      submittedText: "你是谁",
      route: {
        kind: "chat",
        reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
      }
    })).toMatchObject({
      decision: "chat",
      reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
    });

    expect(decideVoiceIntentAdmission({
      session: createSession({
        finalTranscript: "帮我整理一下桌面",
        confidence: 0.9
      }),
      submittedText: "帮我整理一下桌面",
      route: {
        kind: "needs_clarification",
        reason: "No supported desktop control route matched this request."
      }
    })).toMatchObject({
      decision: "needs_clarification",
      reason: "No supported desktop control route matched this request."
    });
  });

  it("admits supported desktop routes after transcript and confidence checks pass", () => {
    expect(decideVoiceIntentAdmission({
      session: createSession({
        finalTranscript: "打开 Ghostty 执行 pwd",
        confidence: 0.91
      }),
      submittedText: "打开 Ghostty 执行 pwd",
      route: { kind: "ghostty", bundleId: "com.mitchellh.ghostty" }
    })).toMatchObject({
      decision: "computer_use",
      routeKind: "ghostty",
      transcript: "打开 Ghostty 执行 pwd"
    });
  });

  it("keeps Doubao text bridge submissions possible when no confidence candidate is available", () => {
    expect(decideVoiceIntentAdmission({
      session: createSession({
        providerId: "doubao",
        finalTranscript: undefined,
        confidence: undefined
      }),
      submittedText: "打开 Ghostty 执行 pwd",
      route: { kind: "ghostty", bundleId: "com.mitchellh.ghostty" }
    })).toMatchObject({
      decision: "computer_use",
      routeKind: "ghostty"
    });
  });
});

function createSession(overrides: Partial<VoiceTurnSession> = {}): VoiceTurnSession {
  return {
    id: "voice-turn-test",
    providerId: "browser",
    trigger: "pet-click",
    status: "transcribing",
    startedAt: 1_000,
    updatedAt: 1_000,
    timeoutAt: 31_000,
    ...overrides
  };
}
