import { describe, expect, it } from "vitest";
import {
  DOUBAO_INPUT_SOURCE_ID,
  prepareDoubaoDictation,
  readDoubaoVoiceTrigger,
  shouldStopDoubaoDictation
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
  it("defaults to the Skfiy-owned trigger without touching Doubao native shortcuts", () => {
    expect(readDoubaoVoiceTrigger({})).toBe("none");
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "" })).toBe("none");
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "invalid" })).toBe(
      "none"
    );
  });

  it("supports disabling the voice shortcut trigger", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "none" })).toBe("none");
  });

  it("keeps the old Fn trigger available only as an explicit opt-in", () => {
    expect(readDoubaoVoiceTrigger({ SKFIY_DOUBAO_VOICE_TRIGGER: "fn-double-tap" })).toBe(
      "fn-double-tap"
    );
  });
});

describe("prepareDoubaoDictation", () => {
  it("selects the Doubao input source without touching native voice shortcuts by default", async () => {
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
  it("does not send a native stop key when Skfiy owns the trigger", () => {
    expect(shouldStopDoubaoDictation("none")).toBe(false);
  });

  it("stops native dictation only for explicit native shortcut triggers", () => {
    expect(shouldStopDoubaoDictation("fn-double-tap")).toBe(true);
  });
});
