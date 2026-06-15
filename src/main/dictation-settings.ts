import {
  readDoubaoVoiceTrigger,
  type DoubaoVoiceTrigger
} from "./dictation-backend.js";

export type DictationProviderSelection = "doubao" | "browser" | "native-macos";

export interface DictationSettings {
  provider: DictationProviderSelection;
  doubaoVoiceTrigger: Exclude<DoubaoVoiceTrigger, "none">;
  doubaoShortcutLabel: string;
}

export interface DictationSettingsUpdate {
  provider?: DictationProviderSelection;
}

export const DOUBAO_SHORTCUT_LABEL = "Ctrl Opt Cmd Shift Space";

export function readInitialDictationSettings(
  env: { SKFIY_DICTATION_PROVIDER?: string; SKFIY_DOUBAO_VOICE_TRIGGER?: string }
): DictationSettings {
  const voiceTrigger = readDoubaoVoiceTrigger(env);
  const configuredProvider = readDictationProviderSelection(env.SKFIY_DICTATION_PROVIDER);

  return {
    provider: configuredProvider ?? (voiceTrigger === "none" ? "browser" : "doubao"),
    doubaoVoiceTrigger: voiceTrigger === "fn-double-tap" ? "fn-double-tap" : "skfiy-shortcut",
    doubaoShortcutLabel: DOUBAO_SHORTCUT_LABEL
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
          : settings.provider
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
