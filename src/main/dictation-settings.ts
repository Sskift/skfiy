import {
  readDoubaoVoiceTrigger,
  type DoubaoVoiceTrigger
} from "./dictation-backend.js";

export type DictationProviderSelection = "doubao" | "browser" | "native-macos";

export interface DictationSettings {
  provider: DictationProviderSelection;
  doubaoVoiceTrigger: Exclude<DoubaoVoiceTrigger, "none">;
  doubaoShortcutLabel: string;
  nativeSpeechMaxDurationMs: number;
  nativeSpeechSilenceTimeoutMs: number;
}

export interface DictationSettingsUpdate {
  provider?: DictationProviderSelection;
  nativeSpeechMaxDurationMs?: number;
  nativeSpeechSilenceTimeoutMs?: number;
}

export const DOUBAO_SHORTCUT_LABEL = "Ctrl Opt Cmd Shift Space";
export const NATIVE_SPEECH_DEFAULT_MAX_DURATION_MS = 7_000;
export const NATIVE_SPEECH_DEFAULT_SILENCE_TIMEOUT_MS = 900;

export function readInitialDictationSettings(
  env: {
    SKFIY_DICTATION_PROVIDER?: string;
    SKFIY_DOUBAO_VOICE_TRIGGER?: string;
    SKFIY_NATIVE_SPEECH_MAX_DURATION_MS?: string;
    SKFIY_NATIVE_SPEECH_SILENCE_TIMEOUT_MS?: string;
  }
): DictationSettings {
  const voiceTrigger = readDoubaoVoiceTrigger(env);
  const configuredProvider = readDictationProviderSelection(env.SKFIY_DICTATION_PROVIDER);

  return {
    provider: configuredProvider ?? (voiceTrigger === "none" ? "browser" : "doubao"),
    doubaoVoiceTrigger: voiceTrigger === "fn-double-tap" ? "fn-double-tap" : "skfiy-shortcut",
    doubaoShortcutLabel: DOUBAO_SHORTCUT_LABEL,
    nativeSpeechMaxDurationMs: readPositiveInteger(
      env.SKFIY_NATIVE_SPEECH_MAX_DURATION_MS,
      NATIVE_SPEECH_DEFAULT_MAX_DURATION_MS
    ),
    nativeSpeechSilenceTimeoutMs: readPositiveInteger(
      env.SKFIY_NATIVE_SPEECH_SILENCE_TIMEOUT_MS,
      NATIVE_SPEECH_DEFAULT_SILENCE_TIMEOUT_MS
    )
  };
}

export function resolveDictationVoiceTrigger(settings: DictationSettings): DoubaoVoiceTrigger {
  return settings.provider === "doubao" ? settings.doubaoVoiceTrigger : "none";
}

export function createDictationSettingsStore(initialSettings: DictationSettings) {
  let settings = initialSettings;

  return {
    get(): DictationSettings {
      return settings;
    },
    set(update: DictationSettingsUpdate): DictationSettings {
      settings = {
        ...settings,
        provider: isDictationProviderSelection(update.provider)
          ? update.provider
          : settings.provider,
        nativeSpeechMaxDurationMs: isPositiveInteger(update.nativeSpeechMaxDurationMs)
          ? update.nativeSpeechMaxDurationMs
          : settings.nativeSpeechMaxDurationMs,
        nativeSpeechSilenceTimeoutMs: isPositiveInteger(update.nativeSpeechSilenceTimeoutMs)
          ? update.nativeSpeechSilenceTimeoutMs
          : settings.nativeSpeechSilenceTimeoutMs
      };

      return settings;
    }
  };
}

function readDictationProviderSelection(value: unknown): DictationProviderSelection | undefined {
  return isDictationProviderSelection(value) ? value : undefined;
}

function isDictationProviderSelection(value: unknown): value is DictationProviderSelection {
  return value === "doubao" || value === "browser" || value === "native-macos";
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : fallback;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
