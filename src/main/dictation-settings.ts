import {
  readDoubaoVoiceTrigger,
  type DoubaoVoiceTrigger
} from "./dictation-backend.js";

export type DictationProviderSelection = "doubao" | "browser";

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
  env: { SKFIY_DOUBAO_VOICE_TRIGGER?: string }
): DictationSettings {
  const voiceTrigger = readDoubaoVoiceTrigger(env);

  return {
    provider: voiceTrigger === "none" ? "browser" : "doubao",
    doubaoVoiceTrigger: voiceTrigger === "fn-double-tap" ? "fn-double-tap" : "skfiy-shortcut",
    doubaoShortcutLabel: DOUBAO_SHORTCUT_LABEL
  };
}

export function resolveDictationVoiceTrigger(settings: DictationSettings): DoubaoVoiceTrigger {
  return settings.provider === "browser" ? "none" : settings.doubaoVoiceTrigger;
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

function isDictationProviderSelection(value: unknown): value is DictationProviderSelection {
  return value === "doubao" || value === "browser";
}
