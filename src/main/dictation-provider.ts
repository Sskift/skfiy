import type {
  DesktopHelperActionResult,
  NativeSpeechTranscriptionOptions,
  NativeSpeechTranscriptionResult,
  SpeechStatusResult
} from "./computer-use/types.js";
import {
  NATIVE_SPEECH_DEFAULT_MAX_DURATION_MS,
  NATIVE_SPEECH_DEFAULT_SILENCE_TIMEOUT_MS
} from "./dictation-settings.js";
import {
  DOUBAO_INPUT_SOURCE_ID,
  SKFIY_DOUBAO_SHORTCUT_KEY,
  SKFIY_DOUBAO_SHORTCUT_MODIFIERS,
  type DoubaoVoiceTrigger
} from "./dictation-backend.js";

export type DictationProviderId = "doubao" | "browser" | "native-macos";

export type DictationProviderState =
  | "unavailable"
  | "waiting_for_shortcut_configuration"
  | "listening"
  | "no_transcript"
  | "cancelled"
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
  waitForTranscript?: () => Promise<void>;
}

export interface DoubaoDictationProviderHelper {
  selectInputSource(sourceId: string): Promise<DesktopHelperActionResult>;
  doubleTapFunctionKey(): Promise<DesktopHelperActionResult>;
  pressShortcut(key: string, modifiers: readonly string[]): Promise<DesktopHelperActionResult>;
  pressKey(key: string): Promise<DesktopHelperActionResult>;
}

export interface NativeMacOSDictationProviderHelper {
  getSpeechStatus(locale: string): Promise<SpeechStatusResult>;
  transcribeSpeech(
    options: NativeSpeechTranscriptionOptions
  ): Promise<NativeSpeechTranscriptionResult>;
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

interface NativeMacOSDictationProviderOptions {
  helper: NativeMacOSDictationProviderHelper;
  locale: string;
  maxDurationMs?: number;
  silenceTimeoutMs?: number;
  emit: (event: DictationProviderEvent) => void;
  emitTranscript: (transcript: NativeSpeechTranscriptionResult) => void;
}

export function createNativeMacOSDictationProvider({
  helper,
  locale,
  maxDurationMs = NATIVE_SPEECH_DEFAULT_MAX_DURATION_MS,
  silenceTimeoutMs = NATIVE_SPEECH_DEFAULT_SILENCE_TIMEOUT_MS,
  emit,
  emitTranscript
}: NativeMacOSDictationProviderOptions): DictationProvider {
  let providerTask: Promise<void> = Promise.resolve();
  let settleProviderTask: (() => void) | undefined;
  let transcriptionAbortController: AbortController | undefined;
  let turnGeneration = 0;
  let lifecycleState: "idle" | "listening" | "no_transcript" | "cancelled" | "stopped" | "failed" = "idle";

  function beginProviderTask(): void {
    providerTask = new Promise((resolve) => {
      settleProviderTask = resolve;
    });
  }

  function settleProviderLifecycle(): void {
    settleProviderTask?.();
    settleProviderTask = undefined;
  }

  function isCurrentListeningTurn(generation: number): boolean {
    return turnGeneration === generation && lifecycleState === "listening";
  }

  return {
    id: "native-macos",
    async prepare() {
      const status = await helper.getSpeechStatus(locale);
      const unavailableMessage = readNativeSpeechUnavailableMessage(status);

      if (unavailableMessage) {
        emit({
          providerId: "native-macos",
          state: "unavailable",
          message: unavailableMessage
        });
        throw new Error(unavailableMessage);
      }

      turnGeneration += 1;
      const generation = turnGeneration;
      lifecycleState = "listening";
      transcriptionAbortController = new AbortController();
      beginProviderTask();
      emit({
        providerId: "native-macos",
        state: "listening",
        message: "macOS 系统语音正在听."
      });

      void helper.transcribeSpeech({
        locale,
        maxDurationMs,
        silenceTimeoutMs,
        signal: transcriptionAbortController.signal
      }).then((transcript) => {
        if (!isCurrentListeningTurn(generation)) {
          return;
        }

        if (!transcript.text.trim()) {
          lifecycleState = "no_transcript";
          transcriptionAbortController = undefined;
          emit({
            providerId: "native-macos",
            state: "no_transcript",
            message: "没有识别到语音内容，请重试或检查麦克风输入."
          });
          settleProviderLifecycle();
          return;
        }

        lifecycleState = "stopped";
        transcriptionAbortController = undefined;
        emitTranscript(transcript);
        emit({
          providerId: "native-macos",
          state: "stopped",
          message: "macOS 系统语音已完成."
        });
        settleProviderLifecycle();
      }).catch((error: unknown) => {
        if (!isCurrentListeningTurn(generation)) {
          return;
        }

        lifecycleState = "failed";
        transcriptionAbortController = undefined;
        emit({
          providerId: "native-macos",
          state: "failed",
          message: readErrorMessage(error)
        });
        settleProviderLifecycle();
      });

      return {
        providerId: "native-macos",
        voiceTrigger: "none",
        nativeDictationActive: true
      };
    },
    async stop() {
      if (lifecycleState !== "listening") {
        return;
      }

      turnGeneration += 1;
      lifecycleState = "cancelled";
      transcriptionAbortController?.abort();
      transcriptionAbortController = undefined;
      emit({
        providerId: "native-macos",
        state: "cancelled",
        message: "macOS 系统语音已取消."
      });
      settleProviderLifecycle();
    },
    waitForTranscript() {
      return providerTask;
    }
  };
}

function readNativeSpeechUnavailableMessage(status: SpeechStatusResult): string | undefined {
  if (isBlockingNativePermissionState(status.speechRecognition.state)) {
    return `macOS speech recognition permission is ${status.speechRecognition.state}.`;
  }

  if (isBlockingNativePermissionState(status.microphone.state)) {
    return `Microphone permission is ${status.microphone.state}.`;
  }

  if (!status.recognizerAvailable) {
    return `macOS speech recognizer is unavailable for ${status.locale}.`;
  }

  return undefined;
}

function isBlockingNativePermissionState(state: string): boolean {
  return state === "denied" || state === "unknown";
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
