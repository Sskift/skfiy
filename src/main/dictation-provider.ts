import type { DesktopHelperActionResult } from "./computer-use/types.js";
import {
  DOUBAO_INPUT_SOURCE_ID,
  SKFIY_DOUBAO_SHORTCUT_KEY,
  SKFIY_DOUBAO_SHORTCUT_MODIFIERS,
  type DoubaoVoiceTrigger
} from "./dictation-backend.js";

export type DictationProviderId = "doubao" | "browser";

export type DictationProviderState =
  | "unavailable"
  | "waiting_for_shortcut_configuration"
  | "listening"
  | "stopped"
  | "failed";

export interface DictationProviderEvent {
  providerId: DictationProviderId;
  state: DictationProviderState;
  message: string;
}

export interface DictationPreparation {
  providerId: DictationProviderId;
  voiceTrigger: DoubaoVoiceTrigger;
  nativeDictationActive: boolean;
  providerState?: DictationProviderState;
}

export interface DictationProvider {
  id: DictationProviderId;
  prepare: () => Promise<DictationPreparation>;
  stop: () => Promise<void>;
}

export interface DoubaoDictationProviderHelper {
  selectInputSource(sourceId: string): Promise<DesktopHelperActionResult>;
  doubleTapFunctionKey(): Promise<DesktopHelperActionResult>;
  pressShortcut(key: string, modifiers: readonly string[]): Promise<DesktopHelperActionResult>;
  pressKey(key: string): Promise<DesktopHelperActionResult>;
}

interface DoubaoDictationProviderOptions {
  helper: DoubaoDictationProviderHelper;
  voiceTrigger: DoubaoVoiceTrigger;
  emit: (event: DictationProviderEvent) => void;
}

export function createDoubaoDictationProvider({
  helper,
  voiceTrigger,
  emit
}: DoubaoDictationProviderOptions): DictationProvider {
  return {
    id: "doubao",
    async prepare() {
      try {
        await runDictationStep(
          () => helper.selectInputSource(DOUBAO_INPUT_SOURCE_ID),
          "Could not select Doubao input source"
        );
      } catch (error) {
        const message = readErrorMessage(error);
        emit({ providerId: "doubao", state: "unavailable", message });
        throw error;
      }

      if (voiceTrigger === "none") {
        emit({
          providerId: "doubao",
          state: "waiting_for_shortcut_configuration",
          message: "豆包快捷键未配置，等待浏览器语音兜底."
        });
        return { providerId: "doubao", voiceTrigger, nativeDictationActive: false };
      }

      try {
        if (voiceTrigger === "skfiy-shortcut") {
          await runDictationStep(
            () => helper.pressShortcut(SKFIY_DOUBAO_SHORTCUT_KEY, SKFIY_DOUBAO_SHORTCUT_MODIFIERS),
            "Could not trigger skfiy Doubao voice shortcut"
          );
        } else {
          await runDictationStep(
            () => helper.doubleTapFunctionKey(),
            "Could not trigger Doubao voice shortcut"
          );
        }
      } catch (error) {
        const message = readErrorMessage(error);
        emit({ providerId: "doubao", state: "failed", message });
        throw error;
      }

      emit({
        providerId: "doubao",
        state: "listening",
        message: "豆包语音已启动."
      });
      return { providerId: "doubao", voiceTrigger, nativeDictationActive: true };
    },
    async stop() {
      if (voiceTrigger !== "none") {
        await runDictationStep(
          () => helper.pressKey("escape"),
          "Could not stop Doubao voice shortcut"
        );
      }

      emit({
        providerId: "doubao",
        state: "stopped",
        message: "豆包语音已停止."
      });
    }
  };
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
    const detail = readErrorMessage(error);
    throw new Error(`${failurePrefix}: ${detail}`);
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown helper error.";
}
