import type { DesktopHelperActionResult } from "./computer-use/types.js";

export const DOUBAO_INPUT_SOURCE_ID = "com.bytedance.inputmethod.doubaoime.pinyin";
export const SKFIY_DOUBAO_SHORTCUT_KEY = "space";
export const SKFIY_DOUBAO_SHORTCUT_MODIFIERS = [
  "control",
  "option",
  "command",
  "shift"
] as const;

export type DoubaoVoiceTrigger = "skfiy-shortcut" | "fn-double-tap" | "none";

export interface DoubaoDictationHelper {
  selectInputSource(sourceId: string): Promise<DesktopHelperActionResult>;
  doubleTapFunctionKey(): Promise<DesktopHelperActionResult>;
  pressShortcut(key: string, modifiers: readonly string[]): Promise<DesktopHelperActionResult>;
}

export function readDoubaoVoiceTrigger(
  env: { SKFIY_DOUBAO_VOICE_TRIGGER?: string }
): DoubaoVoiceTrigger {
  const configuredTrigger = env.SKFIY_DOUBAO_VOICE_TRIGGER;

  if (configuredTrigger === undefined) {
    return "skfiy-shortcut";
  }

  if (
    configuredTrigger === "skfiy-shortcut"
    || configuredTrigger === "fn-double-tap"
    || configuredTrigger === "none"
  ) {
    return configuredTrigger;
  }

  return "none";
}

export async function prepareDoubaoDictation(
  helper: DoubaoDictationHelper,
  voiceTrigger: DoubaoVoiceTrigger
): Promise<void> {
  await runDictationStep(
    () => helper.selectInputSource(DOUBAO_INPUT_SOURCE_ID),
    "Could not select Doubao input source"
  );

  if (voiceTrigger === "skfiy-shortcut") {
    await runDictationStep(
      () => helper.pressShortcut(SKFIY_DOUBAO_SHORTCUT_KEY, SKFIY_DOUBAO_SHORTCUT_MODIFIERS),
      "Could not trigger skfiy Doubao voice shortcut"
    );
  } else if (voiceTrigger === "fn-double-tap") {
    await runDictationStep(
      () => helper.doubleTapFunctionKey(),
      "Could not trigger Doubao voice shortcut"
    );
  }
}

export function shouldStopDoubaoDictation(voiceTrigger: DoubaoVoiceTrigger): boolean {
  return voiceTrigger !== "none";
}

async function runDictationStep(
  action: () => Promise<DesktopHelperActionResult>,
  failurePrefix: string
): Promise<void> {
  try {
    const result = await action();

    if (!result.ok) {
      throw new Error(result.message ?? "Desktop helper reported the action failed.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown helper error.";
    throw new Error(`${failurePrefix}: ${detail}`);
  }
}
