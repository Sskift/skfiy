import { describe, expect, it } from "vitest";
import {
  DOUBAO_INPUT_SOURCE_ID,
  prepareDoubaoDictation,
  readDoubaoVoiceTrigger
} from "./dictation-backend";
import type { DesktopHelperActionResult } from "./computer-use/types";

interface HelperCall {
  name: "selectInputSource" | "doubleTapFunctionKey";
  value?: string;
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
      }
    }
  };
}

describe("readDoubaoVoiceTrigger", () => {
  it("defaults to fn-double-tap", () => {
    expect(readDoubaoVoiceTrigger({})).toBe("fn-double-tap");
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "" })).toBe("fn-double-tap");
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "invalid" })).toBe(
      "fn-double-tap"
    );
  });

  it("supports disabling the voice shortcut trigger", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "none" })).toBe("none");
  });
});

describe("prepareDoubaoDictation", () => {
  it("selects the Doubao input source and double taps Fn by default", async () => {
    const { calls, helper } = createDictationHelper();

    await prepareDoubaoDictation(helper, "fn-double-tap");

    expect(calls).toEqual([
      { name: "selectInputSource", value: DOUBAO_INPUT_SOURCE_ID },
      { name: "doubleTapFunctionKey" }
    ]);
  });

  it("selects the Doubao input source without double tapping Fn when trigger is none", async () => {
    const { calls, helper } = createDictationHelper();

    await prepareDoubaoDictation(helper, "none");

    expect(calls).toEqual([
      { name: "selectInputSource", value: DOUBAO_INPUT_SOURCE_ID }
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
