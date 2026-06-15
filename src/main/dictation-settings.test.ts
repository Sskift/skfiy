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
      doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space"
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
});
