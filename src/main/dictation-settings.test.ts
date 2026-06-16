import { describe, expect, it } from "vitest";
import {
  createDictationSettingsStore,
  readInitialDictationSettings,
  resolveDictationVoiceTrigger
} from "./dictation-settings";

describe("dictation settings", () => {
  it("defaults to Doubao with the skfiy-owned shortcut", () => {
    const settings = readInitialDictationSettings({});

    expect(settings).toEqual({
      provider: "doubao",
      doubaoVoiceTrigger: "skfiy-shortcut",
      doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space",
      nativeSpeechLocale: "zh-CN",
      nativeSpeechMaxDurationMs: 7000,
      nativeSpeechSilenceTimeoutMs: 900
    });
    expect(resolveDictationVoiceTrigger(settings)).toBe("skfiy-shortcut");
  });

  it("uses browser speech when the Doubao trigger is disabled by environment", () => {
    const settings = readInitialDictationSettings({ SKFIY_DOUBAO_VOICE_TRIGGER: "none" });

    expect(settings.provider).toBe("browser");
    expect(settings.doubaoVoiceTrigger).toBe("skfiy-shortcut");
    expect(resolveDictationVoiceTrigger(settings)).toBe("none");
  });

  it("lets the runtime settings store switch between browser and Doubao providers", () => {
    const store = createDictationSettingsStore(readInitialDictationSettings({}));

    expect(store.set({ provider: "browser" })).toMatchObject({ provider: "browser" });
    expect(resolveDictationVoiceTrigger(store.get())).toBe("none");

    expect(store.set({ provider: "doubao" })).toMatchObject({ provider: "doubao" });
    expect(resolveDictationVoiceTrigger(store.get())).toBe("skfiy-shortcut");
  });

  it("can select native macOS speech without reusing Doubao shortcuts", () => {
    const settings = readInitialDictationSettings({
      SKFIY_DICTATION_PROVIDER: "native-macos"
    });
    const store = createDictationSettingsStore(readInitialDictationSettings({}));

    expect(settings).toMatchObject({
      provider: "native-macos",
      doubaoVoiceTrigger: "skfiy-shortcut"
    });
    expect(resolveDictationVoiceTrigger(settings)).toBe("none");
    expect(store.set({ provider: "native-macos" })).toMatchObject({
      provider: "native-macos"
    });
    expect(resolveDictationVoiceTrigger(store.get())).toBe("none");
  });

  it("lets native macOS speech timeouts be tuned from the environment", () => {
    const settings = readInitialDictationSettings({
      SKFIY_NATIVE_SPEECH_MAX_DURATION_MS: "12000",
      SKFIY_NATIVE_SPEECH_SILENCE_TIMEOUT_MS: "1500"
    });

    expect(settings).toMatchObject({
      nativeSpeechMaxDurationMs: 12000,
      nativeSpeechSilenceTimeoutMs: 1500
    });
  });

  it("lets native macOS speech locale be tuned from the environment", () => {
    expect(
      readInitialDictationSettings({
        SKFIY_NATIVE_SPEECH_LOCALE: " en-US "
      })
    ).toMatchObject({
      nativeSpeechLocale: "en-US"
    });

    expect(
      readInitialDictationSettings({
        SKFIY_NATIVE_SPEECH_LOCALE: "   "
      })
    ).toMatchObject({
      nativeSpeechLocale: "zh-CN"
    });
  });

  it("lets runtime settings tune native macOS speech timeouts", () => {
    const store = createDictationSettingsStore(readInitialDictationSettings({}));

    expect(
      store.set({
        nativeSpeechLocale: "en-US",
        nativeSpeechMaxDurationMs: 11000,
        nativeSpeechSilenceTimeoutMs: 1400
      })
    ).toMatchObject({
      nativeSpeechLocale: "en-US",
      nativeSpeechMaxDurationMs: 11000,
      nativeSpeechSilenceTimeoutMs: 1400
    });

    expect(
      store.set({
        nativeSpeechLocale: "   ",
        nativeSpeechMaxDurationMs: 0,
        nativeSpeechSilenceTimeoutMs: Number.NaN
      })
    ).toMatchObject({
      nativeSpeechLocale: "en-US",
      nativeSpeechMaxDurationMs: 11000,
      nativeSpeechSilenceTimeoutMs: 1400
    });
  });
});
