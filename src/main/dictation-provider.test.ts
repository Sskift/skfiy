import { describe, expect, it } from "vitest";
import {
  createDoubaoDictationProvider,
  createNativeMacOSDictationProvider,
  type DictationProviderEvent
} from "./dictation-provider";
import type {
  DesktopHelperActionResult,
  NativeSpeechTranscriptionResult,
  SpeechStatusResult
} from "./computer-use/types";

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createGrantedSpeechStatus(locale = "zh-CN"): SpeechStatusResult {
  return {
    locale,
    recognizerAvailable: true,
    speechRecognition: { state: "granted" },
    microphone: { state: "granted" }
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

describe("createNativeMacOSDictationProvider", () => {
  it("starts native speech recognition and streams the final transcript candidate", async () => {
    const events: DictationProviderEvent[] = [];
    const transcripts: NativeSpeechTranscriptionResult[] = [];
    const transcriptionOptions: Array<{ maxDurationMs: number; silenceTimeoutMs: number }> = [];
    const provider = createNativeMacOSDictationProvider({
      helper: {
        async getSpeechStatus(): Promise<SpeechStatusResult> {
          return {
            locale: "zh-CN",
            recognizerAvailable: true,
            speechRecognition: { state: "granted" },
            microphone: { state: "granted" }
          };
        },
        async transcribeSpeech(options): Promise<NativeSpeechTranscriptionResult> {
          transcriptionOptions.push({
            maxDurationMs: options.maxDurationMs,
            silenceTimeoutMs: options.silenceTimeoutMs
          });
          return {
            text: "打开 Ghostty 执行 pwd",
            isFinal: true,
            confidence: 0.83,
            durationMs: 1400,
            silenceTimedOut: true
          };
        }
      },
      locale: "zh-CN",
      emit: (event) => events.push(event),
      emitTranscript: (transcript) => transcripts.push(transcript),
      maxDurationMs: 12000,
      silenceTimeoutMs: 1500
    });

    await expect(provider.prepare()).resolves.toEqual({
      providerId: "native-macos",
      voiceTrigger: "none",
      nativeDictationActive: true
    });
    await provider.waitForTranscript?.();

    expect(transcripts).toEqual([
      {
        text: "打开 Ghostty 执行 pwd",
        isFinal: true,
        confidence: 0.83,
        durationMs: 1400,
        silenceTimedOut: true
      }
    ]);
    expect(transcriptionOptions).toEqual([
      {
        maxDurationMs: 12000,
        silenceTimeoutMs: 1500
      }
    ]);
    expect(events).toEqual([
      {
        providerId: "native-macos",
        state: "listening",
        message: "macOS 系统语音正在听."
      },
      {
        providerId: "native-macos",
        state: "stopped",
        message: "macOS 系统语音已完成."
      }
    ]);
  });

  it("emits no_transcript when native speech finishes without recognized text", async () => {
    const events: DictationProviderEvent[] = [];
    const transcripts: NativeSpeechTranscriptionResult[] = [];
    const provider = createNativeMacOSDictationProvider({
      helper: {
        async getSpeechStatus(): Promise<SpeechStatusResult> {
          return createGrantedSpeechStatus();
        },
        async transcribeSpeech(): Promise<NativeSpeechTranscriptionResult> {
          return {
            text: "",
            isFinal: true,
            durationMs: 1200,
            silenceTimedOut: true
          };
        }
      },
      locale: "zh-CN",
      emit: (event) => events.push(event),
      emitTranscript: (transcript) => transcripts.push(transcript)
    });

    await provider.prepare();
    await provider.waitForTranscript?.();

    expect(transcripts).toEqual([]);
    expect(events).toEqual([
      {
        providerId: "native-macos",
        state: "listening",
        message: "macOS 系统语音正在听."
      },
      {
        providerId: "native-macos",
        state: "no_transcript",
        message: "没有识别到语音内容，请重试或检查麦克风输入."
      }
    ]);
  });

  it("cancels pending native speech promptly and ignores late helper transcripts", async () => {
    const deferredTranscript = createDeferred<NativeSpeechTranscriptionResult>();
    const events: DictationProviderEvent[] = [];
    const transcripts: NativeSpeechTranscriptionResult[] = [];
    const provider = createNativeMacOSDictationProvider({
      helper: {
        async getSpeechStatus(): Promise<SpeechStatusResult> {
          return createGrantedSpeechStatus();
        },
        transcribeSpeech(): Promise<NativeSpeechTranscriptionResult> {
          return deferredTranscript.promise;
        }
      },
      locale: "zh-CN",
      emit: (event) => events.push(event),
      emitTranscript: (transcript) => transcripts.push(transcript)
    });

    await provider.prepare();
    const transcriptWait = provider.waitForTranscript?.() ?? Promise.resolve();
    let transcriptWaitSettled = false;
    transcriptWait.then(() => {
      transcriptWaitSettled = true;
    });

    await provider.stop();
    await Promise.resolve();

    expect(transcriptWaitSettled).toBe(true);
    expect(transcripts).toEqual([]);
    expect(events).toEqual([
      {
        providerId: "native-macos",
        state: "listening",
        message: "macOS 系统语音正在听."
      },
      {
        providerId: "native-macos",
        state: "cancelled",
        message: "macOS 系统语音已取消."
      }
    ]);

    deferredTranscript.resolve({
      text: "late transcript should not submit",
      isFinal: true,
      confidence: 0.99,
      durationMs: 7000,
      silenceTimedOut: false
    });
    await Promise.resolve();

    expect(transcripts).toEqual([]);
    expect(events).toHaveLength(2);
  });

  it("aborts the in-flight native helper transcription when stopped", async () => {
    const deferredTranscript = createDeferred<NativeSpeechTranscriptionResult>();
    const events: DictationProviderEvent[] = [];
    let transcriptionSignal: AbortSignal | undefined;
    const provider = createNativeMacOSDictationProvider({
      helper: {
        async getSpeechStatus(): Promise<SpeechStatusResult> {
          return createGrantedSpeechStatus();
        },
        transcribeSpeech(options): Promise<NativeSpeechTranscriptionResult> {
          transcriptionSignal = (
            options as typeof options & { signal?: AbortSignal }
          ).signal;
          return deferredTranscript.promise;
        }
      },
      locale: "zh-CN",
      emit: (event) => events.push(event),
      emitTranscript: () => undefined
    });

    await provider.prepare();

    expect(transcriptionSignal).toBeInstanceOf(AbortSignal);
    expect(transcriptionSignal?.aborted).toBe(false);

    await provider.stop();

    expect(transcriptionSignal?.aborted).toBe(true);
    expect(events.at(-1)).toEqual({
      providerId: "native-macos",
      state: "cancelled",
      message: "macOS 系统语音已取消."
    });
  });

  it("fails closed when native speech or microphone permission is missing", async () => {
    const events: DictationProviderEvent[] = [];
    const provider = createNativeMacOSDictationProvider({
      helper: {
        async getSpeechStatus(): Promise<SpeechStatusResult> {
          return {
            locale: "zh-CN",
            recognizerAvailable: true,
            speechRecognition: { state: "denied" },
            microphone: { state: "granted" }
          };
        },
        async transcribeSpeech(): Promise<NativeSpeechTranscriptionResult> {
          throw new Error("should not transcribe without speech permission");
        }
      },
      locale: "zh-CN",
      emit: (event) => events.push(event),
      emitTranscript: () => undefined
    });

    await expect(provider.prepare()).rejects.toThrow(
      "macOS speech recognition permission is denied."
    );
    expect(events).toEqual([
      {
        providerId: "native-macos",
        state: "unavailable",
        message: "macOS speech recognition permission is denied."
      }
    ]);
  });

  it("starts native transcription when macOS speech permissions are not determined", async () => {
    const events: DictationProviderEvent[] = [];
    let transcriptionStarted = false;
    const deferredTranscript = createDeferred<NativeSpeechTranscriptionResult>();
    const provider = createNativeMacOSDictationProvider({
      helper: {
        async getSpeechStatus(): Promise<SpeechStatusResult> {
          return {
            locale: "zh-CN",
            recognizerAvailable: true,
            speechRecognition: { state: "not-determined" },
            microphone: { state: "not-determined" }
          };
        },
        transcribeSpeech(): Promise<NativeSpeechTranscriptionResult> {
          transcriptionStarted = true;
          return deferredTranscript.promise;
        }
      },
      locale: "zh-CN",
      emit: (event) => events.push(event),
      emitTranscript: () => undefined
    });

    await expect(provider.prepare()).resolves.toEqual({
      providerId: "native-macos",
      voiceTrigger: "none",
      nativeDictationActive: true
    });

    expect(transcriptionStarted).toBe(true);
    expect(events).toEqual([
      {
        providerId: "native-macos",
        state: "listening",
        message: "macOS 系统语音正在听."
      }
    ]);

    await provider.stop();
  });
});
