export type VoiceTurnProviderId = "doubao" | "browser" | "native-macos" | "local" | "cloud";
export type VoiceTurnTrigger = "pet-click" | "global-hotkey" | "doubao-shortcut" | "browser-speech";
export type VoiceTurnStatus =
  | "listening"
  | "transcribing"
  | "finalized"
  | "cancelled"
  | "failed";
export type VoiceTurnStopReason = "manual-stop" | "timeout" | "provider-error";

export interface VoiceTurnSession {
  id: string;
  providerId: VoiceTurnProviderId;
  trigger: VoiceTurnTrigger;
  status: VoiceTurnStatus;
  startedAt: number;
  updatedAt: number;
  timeoutAt: number;
  partialTranscript?: string;
  finalTranscript?: string;
  confidence?: number;
  stopReason?: VoiceTurnStopReason;
  failureMessage?: string;
}

export interface VoiceTurnStartInput {
  providerId: VoiceTurnProviderId;
  trigger: VoiceTurnTrigger;
  timeoutMs?: number;
}

export interface VoiceTurnTranscriptInput {
  text: string;
  confidence?: number;
}

export interface VoiceTurnTranscriptCandidateInput extends VoiceTurnTranscriptInput {
  isFinal: boolean;
}

export interface VoiceTurnSessionStoreOptions {
  now?: () => number;
  defaultTimeoutMs?: number;
}

export type VoiceIntentAdmissionRoute =
  | { kind: "ghostty" | "chrome" | "finder"; bundleId: string }
  | { kind: "tmux_supervision"; sessionName: string }
  | { kind: "chat"; reason: string }
  | { kind: "needs_clarification"; reason: string };

export type VoiceIntentAdmissionDecision =
  | {
    decision: "computer_use";
    routeKind: "ghostty" | "chrome" | "finder" | "tmux_supervision";
    transcript: string;
    confidence?: number;
  }
  | {
    decision: "chat";
    transcript: string;
    reason: string;
  }
  | {
    decision: "needs_clarification";
    transcript: string;
    reason: string;
  };

export interface VoiceIntentAdmissionInput {
  session: VoiceTurnSession;
  submittedText: string;
  route: VoiceIntentAdmissionRoute;
  minConfidence?: number;
}

const DEFAULT_VOICE_INTENT_MIN_CONFIDENCE = 0.6;
const FINAL_TRANSCRIPT_REQUIRED_PROVIDERS = new Set<VoiceTurnProviderId>([
  "browser",
  "native-macos",
  "local",
  "cloud"
]);

export function createVoiceTurnSessionStore({
  now = () => Date.now(),
  defaultTimeoutMs = 30_000
}: VoiceTurnSessionStoreOptions = {}) {
  let nextId = 1;
  let activeSessionId: string | null = null;
  const sessions = new Map<string, VoiceTurnSession>();

  function save(session: VoiceTurnSession): VoiceTurnSession {
    sessions.set(session.id, session);
    return session;
  }

  function end(session: VoiceTurnSession): VoiceTurnSession {
    activeSessionId = activeSessionId === session.id ? null : activeSessionId;
    return save(session);
  }

  function getActiveSession(id: string): VoiceTurnSession {
    const session = sessions.get(id);

    if (!session || activeSessionId !== id || isTerminalStatus(session.status)) {
      throw new Error(`Voice turn ${id} is not active.`);
    }

    return session;
  }

  return {
    start(input: VoiceTurnStartInput): VoiceTurnSession {
      const timestamp = now();
      const id = `voice-turn-${nextId}`;
      nextId += 1;
      activeSessionId = id;

      return save({
        id,
        providerId: input.providerId,
        trigger: input.trigger,
        status: "listening",
        startedAt: timestamp,
        updatedAt: timestamp,
        timeoutAt: timestamp + (input.timeoutMs ?? defaultTimeoutMs)
      });
    },

    appendPartial(id: string, input: VoiceTurnTranscriptInput): VoiceTurnSession {
      const session = getActiveSession(id);

      return save({
        ...session,
        status: "transcribing",
        updatedAt: now(),
        partialTranscript: input.text,
        confidence: input.confidence
      });
    },

    recordTranscriptCandidate(
      id: string,
      input: VoiceTurnTranscriptCandidateInput
    ): VoiceTurnSession {
      const session = getActiveSession(id);
      const transcript = input.isFinal
        ? { finalTranscript: input.text }
        : { partialTranscript: input.text };

      return save({
        ...session,
        ...transcript,
        status: "transcribing",
        updatedAt: now(),
        confidence: input.confidence
      });
    },

    finalize(id: string, input: VoiceTurnTranscriptInput): VoiceTurnSession {
      const session = getActiveSession(id);

      return end({
        ...session,
        status: "finalized",
        updatedAt: now(),
        finalTranscript: input.text,
        confidence: input.confidence
      });
    },

    cancel(id: string, stopReason: VoiceTurnStopReason = "manual-stop"): VoiceTurnSession {
      const session = getActiveSession(id);

      return end({
        ...session,
        status: "cancelled",
        updatedAt: now(),
        stopReason
      });
    },

    fail(id: string, failureMessage: string, stopReason: VoiceTurnStopReason = "provider-error") {
      const session = getActiveSession(id);

      return end({
        ...session,
        status: "failed",
        updatedAt: now(),
        stopReason,
        failureMessage
      });
    },

    expireActive(): VoiceTurnSession | null {
      const active = activeSessionId ? sessions.get(activeSessionId) : undefined;

      if (!active || now() <= active.timeoutAt) {
        return null;
      }

      return end({
        ...active,
        status: "failed",
        updatedAt: now(),
        stopReason: "timeout",
        failureMessage: "Voice turn timed out before a final transcript was received."
      });
    },

    get(id: string): VoiceTurnSession | null {
      return sessions.get(id) ?? null;
    },

    getActive(): VoiceTurnSession | null {
      return activeSessionId ? sessions.get(activeSessionId) ?? null : null;
    }
  };
}

function isTerminalStatus(status: VoiceTurnStatus): boolean {
  return status === "finalized" || status === "cancelled" || status === "failed";
}

export function decideVoiceIntentAdmission({
  session,
  submittedText,
  route,
  minConfidence = DEFAULT_VOICE_INTENT_MIN_CONFIDENCE
}: VoiceIntentAdmissionInput): VoiceIntentAdmissionDecision {
  const transcript = submittedText.trim();
  const finalTranscript = session.finalTranscript?.trim();

  if (!transcript) {
    return {
      decision: "needs_clarification",
      transcript,
      reason: "Voice command must contain text before Computer Use can start."
    };
  }

  if (FINAL_TRANSCRIPT_REQUIRED_PROVIDERS.has(session.providerId) && !finalTranscript) {
    return {
      decision: "needs_clarification",
      transcript,
      reason: "Voice provider did not produce a final transcript."
    };
  }

  if (finalTranscript && finalTranscript !== transcript) {
    return {
      decision: "needs_clarification",
      transcript,
      reason: "Submitted voice text does not match the final transcript candidate."
    };
  }

  if (
    typeof session.confidence === "number"
    && Number.isFinite(session.confidence)
    && session.confidence < minConfidence
  ) {
    return {
      decision: "needs_clarification",
      transcript,
      reason: `Voice confidence ${formatConfidence(session.confidence)} is below the ${formatConfidence(minConfidence)} admission threshold.`
    };
  }

  if (route.kind === "chat") {
    return {
      decision: "chat",
      transcript,
      reason: route.reason
    };
  }

  if (route.kind === "needs_clarification") {
    return {
      decision: "needs_clarification",
      transcript,
      reason: route.reason
    };
  }

  return {
    decision: "computer_use",
    routeKind: route.kind,
    transcript,
    confidence: session.confidence
  };
}

function formatConfidence(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
