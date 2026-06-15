import { describe, expect, it } from "vitest";
import {
  DOUBAO_INPUT_SOURCE_ID,
  prepareDoubaoDictation,
  readDoubaoVoiceTrigger,
  shouldStopDoubaoDictation
} from "./dictation-backend";
import type { DesktopHelperActionResult } from "./computer-use/types";

interface HelperCall {
  name: "selectInputSource" | "doubleTapFunctionKey" | "pressShortcut";
  value?: string;
  modifiers?: string[];
}

function createDictationHelper(options: {
  selectResult?: DesktopHelperActionResult;
  shortcutResult?: DesktopHelperActionResult;
  selectError?: Error;
  shortcutError?: Error;
} = {}) {
  const calls: HelperCall[] = [];

  return {
    calls,
    helper: {
      async selectInputSource(sourceId: string): Promise<DesktopHelperActionResult> {
        calls.push({ name: "selectInputSource", value: sourceId });

        if (options.selectError) {
          throw options.selectError;
        }

        return options.selectResult ?? { ok: true };
      },
      async doubleTapFunctionKey(): Promise<DesktopHelperActionResult> {
        calls.push({ name: "doubleTapFunctionKey" });

        if (options.shortcutError) {
          throw options.shortcutError;
        }

        return options.shortcutResult ?? { ok: true };
      },
      async pressShortcut(key: string, modifiers: readonly string[]): Promise<DesktopHelperActionResult> {
        calls.push({ name: "pressShortcut", value: key, modifiers: [...modifiers] });

        if (options.shortcutError) {
          throw options.shortcutError;
        }

        return options.shortcutResult ?? { ok: true };
      }
    }
  };
}

describe("readDoubaoVoiceTrigger", () => {
  it("defaults to the skfiy-owned trigger instead of touching Doubao native shortcuts", () => {
    expect(readDoubaoVoiceTrigger({})).toBe("skfiy-shortcut");
  });

  it("does not trigger a voice shortcut for empty or invalid configuration", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "" })).toBe("none");
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "invalid" })).toBe(
      "none"
    );
  });

  it("supports disabling the voice shortcut trigger", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "none" })).toBe("none");
  });

  it("supports the skfiy-owned voice shortcut explicitly", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "skfiy-shortcut" })).toBe(
      "skfiy-shortcut"
    );
  });

  it("keeps the old Fn trigger available only as an explicit opt-in", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "fn-double-tap" })).toBe(
      "fn-double-tap"
    );
  });
});

describe("prepareDoubaoDictation", () => {
  it("selects Doubao and triggers the skfiy-owned voice shortcut by default", async () => {
    const { calls, helper } = createDictationHelper();

    await prepareDoubaoDictation(helper, "skfiy-shortcut");

    expect(calls).toEqual([
      { name: "selectInputSource", value: DOUBAO_INPUT_SOURCE_ID },
      {
        name: "pressShortcut",
        value: "space",
        modifiers: ["control", "option", "command", "shift"]
      }
    ]);
  });

  it("can select the Doubao input source without touching voice shortcuts", async () => {
    const { calls, helper } = createDictationHelper();

    await prepareDoubaoDictation(helper, "none");

    expect(calls).toEqual([
      { name: "selectInputSource", value: DOUBAO_INPUT_SOURCE_ID }
    ]);
  });

  it("can still double tap Fn when explicitly configured for local debugging", async () => {
    const { calls, helper } = createDictationHelper();

    await prepareDoubaoDictation(helper, "fn-double-tap");

    expect(calls).toEqual([
      { name: "selectInputSource", value: DOUBAO_INPUT_SOURCE_ID },
      { name: "doubleTapFunctionKey" }
    ]);
  });

  it("reports input source selection failures separately from shortcut failures", async () => {
    const { calls, helper } = createDictationHelper({
      selectResult: { ok: false, message: "Input source not installed." }
    });

    await expect(prepareDoubaoDictation(helper, "fn-double-tap")).rejects.toThrow(
      "Could not select Doubao input source: Input source not installed."
    );
    expect(calls).toEqual([
      { name: "selectInputSource", value: DOUBAO_INPUT_SOURCE_ID }
    ]);
  });

  it("reports voice shortcut trigger failures separately from input source failures", async () => {
    const { helper } = createDictationHelper({
      shortcutError: new Error("Accessibility permission denied.")
    });

    await expect(prepareDoubaoDictation(helper, "fn-double-tap")).rejects.toThrow(
      "Could not trigger Doubao voice shortcut: Accessibility permission denied."
    );
  });
});

describe("shouldStopDoubaoDictation", () => {
  it("does not send a native stop key when skfiy owns the trigger", () => {
    expect(shouldStopDoubaoDictation("skfiy-shortcut")).toBe(true);
  });

  it("does not stop native dictation when shortcuts are disabled", () => {
    expect(shouldStopDoubaoDictation("none")).toBe(false);
  });

  it("stops native dictation for explicit native shortcut triggers", () => {
    expect(shouldStopDoubaoDictation("fn-double-tap")).toBe(true);
  });
});
