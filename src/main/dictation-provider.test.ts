import { describe, expect, it } from "vitest";
import {
  createDoubaoDictationProvider,
  type DictationProviderEvent
} from "./dictation-provider";
import type { DesktopHelperActionResult } from "./computer-use/types";

interface HelperCall {
  name: "selectInputSource" | "doubleTapFunctionKey" | "pressShortcut" | "pressKey";
  value?: string;
  modifiers?: string[];
}

function createHelper(options: {
  selectResult?: DesktopHelperActionResult;
  shortcutError?: Error;
} = {}) {
  const calls: HelperCall[] = [];

  return {
    calls,
    helper: {
      async selectInputSource(sourceId: string): Promise<DesktopHelperActionResult> {
        calls.push({ name: "selectInputSource", value: sourceId });
        return options.selectResult ?? { ok: true };
      },
      async doubleTapFunctionKey(): Promise<DesktopHelperActionResult> {
        calls.push({ name: "doubleTapFunctionKey" });

        if (options.shortcutError) {
          throw options.shortcutError;
        }

        return { ok: true };
      },
      async pressShortcut(
        key: string,
        modifiers: readonly string[]
      ): Promise<DesktopHelperActionResult> {
        calls.push({ name: "pressShortcut", value: key, modifiers: [...modifiers] });

        if (options.shortcutError) {
          throw options.shortcutError;
        }

        return { ok: true };
      },
      async pressKey(key: string): Promise<DesktopHelperActionResult> {
        calls.push({ name: "pressKey", value: key });
        return { ok: true };
      }
    }
  };
}

describe("createDoubaoDictationProvider", () => {
  it("emits listening when the skfiy-owned shortcut starts Doubao dictation", async () => {
    const { calls, helper } = createHelper();
    const events: DictationProviderEvent[] = [];
    const provider = createDoubaoDictationProvider({
      helper,
      voiceTrigger: "skfiy-shortcut",
      emit: (event) => events.push(event)
    });

    await expect(provider.prepare()).resolves.toEqual({
      providerId: "doubao",
      voiceTrigger: "skfiy-shortcut",
      nativeDictationActive: true
    });
    expect(events).toEqual([
      {
        providerId: "doubao",
        state: "listening",
        message: "豆包语音已启动."
      }
    ]);
    expect(calls.map((call) => call.name)).toEqual(["selectInputSource", "pressShortcut"]);
  });

  it("emits waiting_for_shortcut_configuration when Doubao shortcut triggering is disabled", async () => {
    const { helper } = createHelper();
    const events: DictationProviderEvent[] = [];
    const provider = createDoubaoDictationProvider({
      helper,
      voiceTrigger: "none",
      emit: (event) => events.push(event)
    });

    await expect(provider.prepare()).resolves.toEqual({
      providerId: "doubao",
      voiceTrigger: "none",
      nativeDictationActive: false
    });
    expect(events).toEqual([
      {
        providerId: "doubao",
        state: "waiting_for_shortcut_configuration",
        message: "豆包快捷键未配置，等待浏览器语音兜底."
      }
    ]);
  });

  it("emits stopped when native Doubao dictation is stopped", async () => {
    const { calls, helper } = createHelper();
    const events: DictationProviderEvent[] = [];
    const provider = createDoubaoDictationProvider({
      helper,
      voiceTrigger: "skfiy-shortcut",
      emit: (event) => events.push(event)
    });

    await provider.stop();

    expect(calls).toEqual([{ name: "pressKey", value: "escape" }]);
    expect(events).toEqual([
      {
        providerId: "doubao",
        state: "stopped",
        message: "豆包语音已停止."
      }
    ]);
  });

  it("emits unavailable when Doubao input source cannot be selected", async () => {
    const { helper } = createHelper({
      selectResult: { ok: false, message: "Input source not installed." }
    });
    const events: DictationProviderEvent[] = [];
    const provider = createDoubaoDictationProvider({
      helper,
      voiceTrigger: "skfiy-shortcut",
      emit: (event) => events.push(event)
    });

    await expect(provider.prepare()).rejects.toThrow(
      "Could not select Doubao input source: Input source not installed."
    );
    expect(events.at(-1)).toEqual({
      providerId: "doubao",
      state: "unavailable",
      message: "Could not select Doubao input source: Input source not installed."
    });
  });

  it("emits failed when Doubao shortcut triggering fails", async () => {
    const { helper } = createHelper({
      shortcutError: new Error("Accessibility permission denied.")
    });
    const events: DictationProviderEvent[] = [];
    const provider = createDoubaoDictationProvider({
      helper,
      voiceTrigger: "fn-double-tap",
      emit: (event) => events.push(event)
    });

    await expect(provider.prepare()).rejects.toThrow(
      "Could not trigger Doubao voice shortcut: Accessibility permission denied."
    );
    expect(events.at(-1)).toEqual({
      providerId: "doubao",
      state: "failed",
      message: "Could not trigger Doubao voice shortcut: Accessibility permission denied."
    });
  });
});
