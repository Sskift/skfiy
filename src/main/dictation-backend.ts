import type { DesktopHelperActionResult } from "./computer-use/types.js";

export const DOUBAO_INPUT_SOURCE_ID = "com.bytedance.inputmethod.doubaoime.pinyin";

export type DoubaoVoiceTrigger = "fn-double-tap" | "none";

export interface DoubaoDictationHelper {
  selectInputSource(sourceId: string): Promise<DesktopHelperActionResult>;
  doubleTapFunctionKey(): Promise<DesktopHelperActionResult>;
}

export function readDoubaoVoiceTrigger(
  env: { SKFIY_DOUBAO_VOICE_TRIGGER?: string }
): DoubaoVoiceTrigger {
  return env.SKFIY_DOUBAO_VOICE_TRIGGER === "fn-double-tap" ? "fn-double-tap" : "none";
}

export async function prepareDoubaoDictation(
  helper: DoubaoDictationHelper,
  voiceTrigger: DoubaoVoiceTrigger
): Promise<void> {
  await runDictationStep(
    () => helper.selectInputSource(DOUBAO_INPUT_SOURCE_ID),
    "Could not select Doubao input source"
  );

  if (voiceTrigger === "none") {
    return;
  }

  await runDictationStep(
    () => helper.doubleTapFunctionKey(),
    "Could not trigger Doubao voice shortcut"
  );
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
