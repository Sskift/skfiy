import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { type DesktopApi, type DictationProviderEvent, type TaskEvent } from "./App";

let emitTaskEvent: (event: TaskEvent) => void;
let emitDictationProviderEvent: (event: DictationProviderEvent) => void;
let emitStopTurnHotkey: () => void;
const speechRecognitionInstances: MockSpeechRecognition[] = [];

interface MockSpeechRecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}

interface MockSpeechRecognitionResultEvent {
  resultIndex: number;
  results: MockSpeechRecognitionResult[];
}

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: MockSpeechRecognitionResultEvent) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    speechRecognitionInstances.push(this);
  }
}

beforeEach(() => {
  emitTaskEvent = () => undefined;
  emitDictationProviderEvent = () => undefined;
  emitStopTurnHotkey = () => undefined;
  speechRecognitionInstances.length = 0;

  window.webkitSpeechRecognition =
    MockSpeechRecognition as unknown as NonNullable<typeof window.webkitSpeechRecognition>;

  window.skfiy = {
    runCommand: vi.fn<DesktopApi["runCommand"]>().mockResolvedValue(undefined),
    prepareDictation: vi.fn<DesktopApi["prepareDictation"]>().mockResolvedValue({
      voiceTrigger: "none"
    }),
    stopDictation: vi.fn<DesktopApi["stopDictation"]>().mockResolvedValue(undefined),
    approveTask: vi.fn<DesktopApi["approveTask"]>().mockResolvedValue(undefined),
    denyTask: vi.fn<DesktopApi["denyTask"]>().mockResolvedValue(undefined),
    takeScreenshot: vi.fn<DesktopApi["takeScreenshot"]>().mockResolvedValue(undefined),
    stopTask: vi.fn<DesktopApi["stopTask"]>().mockResolvedValue(undefined),
    getPermissions: vi.fn<DesktopApi["getPermissions"]>().mockResolvedValue({
      screenRecording: { state: "unknown" },
      accessibility: { state: "unknown" },
      microphone: { state: "unknown" }
    }),
    openPermissionSettings: vi.fn<DesktopApi["openPermissionSettings"]>().mockResolvedValue(
      undefined
    ),
    getStartupWarnings: vi.fn<DesktopApi["getStartupWarnings"]>().mockResolvedValue([]),
    getRuntimeStatus: vi.fn<DesktopApi["getRuntimeStatus"]>().mockResolvedValue({
      stopTurnHotkey: {
        accelerator: "Control+Alt+Shift+Esc",
        label: "Ctrl Opt Shift Esc",
        registered: true
      }
    }),
    moveWindowBy: vi.fn<DesktopApi["moveWindowBy"]>(),
    setWindowMode: vi.fn<DesktopApi["setWindowMode"]>(),
    onDictationProviderEvent: vi.fn((callback: (event: DictationProviderEvent) => void) => {
      emitDictationProviderEvent = callback;
      return vi.fn();
    }),
    onStopTurnHotkey: vi.fn((callback: () => void) => {
      emitStopTurnHotkey = callback;
      return vi.fn();
    }),
    onTaskEvent: vi.fn((callback: (event: TaskEvent) => void) => {
      emitTaskEvent = callback;
      return vi.fn();
    })
  } satisfies DesktopApi;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.webkitSpeechRecognition;
});

describe("App", () => {
  it("starts as a Codex-style pet overlay with controls tucked away", () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    expect(pet).toBeInTheDocument();
    expect(pet).toHaveAttribute("data-atlas-state", "idle");
    expect(pet).toHaveAttribute("data-frame-count", "6");
    expect(pet).toHaveAttribute("data-voice-entry", "left-click");
    expect(pet).toHaveAttribute("data-settings-entry", "right-click");
    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
  });

  it("starts dictation from a plain left click on the pet", async () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    fireEvent.click(pet);

    expect(pet).toHaveAttribute("data-drag-mode", "manual");
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });
    expect((window.skfiy as DesktopApi).prepareDictation).toHaveBeenCalledTimes(1);
    expect(speechRecognitionInstances).toHaveLength(1);
    expect(speechRecognitionInstances[0]).toMatchObject({
      continuous: true,
      interimResults: true,
      lang: "zh-CN"
    });
    expect(speechRecognitionInstances[0].start).toHaveBeenCalledTimes(1);
  });

  it("uses native Doubao dictation without starting browser speech recognition", async () => {
    (window.skfiy as DesktopApi).prepareDictation = vi
      .fn<DesktopApi["prepareDictation"]>()
      .mockResolvedValue({ voiceTrigger: "skfiy-shortcut" });

    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });
    expect(speechRecognitionInstances).toHaveLength(0);
    expect((window.skfiy as DesktopApi).prepareDictation).toHaveBeenCalledTimes(1);
  });

  it("does not start browser fallback when the provider reports a failed preparation", async () => {
    (window.skfiy as DesktopApi).prepareDictation = vi
      .fn<DesktopApi["prepareDictation"]>()
      .mockResolvedValue({
        providerId: "doubao",
        voiceTrigger: "skfiy-shortcut",
        nativeDictationActive: false,
        providerState: "failed"
      });

    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect((window.skfiy as DesktopApi).prepareDictation).toHaveBeenCalledTimes(1);
    });
    expect(speechRecognitionInstances).toHaveLength(0);
  });

  it("renders dictation provider state events in the voice bubble", async () => {
    render(<App />);

    act(() => emitDictationProviderEvent({
      providerId: "doubao",
      state: "listening",
      message: "豆包语音已启动."
    }));

    expect(screen.getByLabelText(/skfiy voice status/i)).toHaveTextContent("豆包语音已启动.");
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
  });

  it("opens settings details from a right click on the pet without starting dictation", () => {
    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    expect(screen.getByLabelText(/skfiy settings/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
    expect((window.skfiy as DesktopApi).prepareDictation).not.toHaveBeenCalled();
  });

  it("shows startup guard warnings as a non-blocking pet bubble", async () => {
    const api = window.skfiy as DesktopApi;
    api.getStartupWarnings = vi.fn<DesktopApi["getStartupWarnings"]>().mockResolvedValue([
      {
        id: "tmux-launch",
        title: "tmux 启动会影响权限归属",
        message: "用户可见测试请通过 open -na dist/skfiy.app 启动。"
      }
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("tmux 启动会影响权限归属")).toBeInTheDocument();
    });
    expect(screen.getByText("用户可见测试请通过 open -na dist/skfiy.app 启动。")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    expect(api.setWindowMode).toHaveBeenLastCalledWith("expanded");
  });

  it("shows permission status in settings and opens the matching macOS settings pane", async () => {
    const api = window.skfiy as DesktopApi & {
      getPermissions: () => Promise<{
        screenRecording: { state: "granted" | "denied" | "not-determined" | "unknown" };
        accessibility: { state: "granted" | "denied" | "not-determined" | "unknown" };
        microphone: { state: "granted" | "denied" | "not-determined" | "unknown" };
      }>;
      openPermissionSettings: (
        permission: "screen-recording" | "accessibility" | "microphone"
      ) => Promise<void>;
    };
    api.getPermissions = vi.fn().mockResolvedValue({
      screenRecording: { state: "denied" },
      accessibility: { state: "granted" },
      microphone: { state: "not-determined" }
    });
    api.openPermissionSettings = vi.fn().mockResolvedValue(undefined);

    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByText("权限")).toBeInTheDocument();
    });
    expect(screen.getByText("屏幕录制")).toBeInTheDocument();
    expect(screen.getByText("辅助功能")).toBeInTheDocument();
    expect(screen.getByText("麦克风")).toBeInTheDocument();
    expect(screen.getByText("未授权")).toBeInTheDocument();
    expect(screen.getByText("已授权")).toBeInTheDocument();
    expect(screen.getByText("待授权")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开屏幕录制设置" }));

    expect(api.openPermissionSettings).toHaveBeenCalledWith("screen-recording");
  });

  it("switches from listening to settings on right click without sending a native stop key", async () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    fireEvent.click(pet);
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });

    fireEvent.contextMenu(pet);

    expect(screen.getByLabelText(/skfiy settings/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
    expect((window.skfiy as DesktopApi).stopDictation).not.toHaveBeenCalled();
    expect(speechRecognitionInstances[0].stop).toHaveBeenCalledTimes(1);
  });

  it("renders each task status and switches pet animation from task events", () => {
    render(<App />);

    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    expect(pet).toHaveAttribute("data-atlas-state", "idle");

    const cases: Array<[TaskEvent["status"], string, string, string]> = [
      ["observing", "Observing", "Reading the screen", "review"],
      ["executing", "Executing", "Typing in Ghostty", "running"],
      ["approval_required", "Approval required", "Needs a human check", "waiting"],
      ["completed", "Completed", "Task finished", "waving"],
      ["failed", "Failed", "Could not complete", "failed"]
    ];

    for (const [status, label, message, animation] of cases) {
      act(() => emitTaskEvent({ status, message }));

      expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent(label);
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(pet).toHaveAttribute("data-atlas-state", animation);
    }
  });

  it("does not show a focusable box around the pet", () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    expect(pet.tagName.toLowerCase()).not.toBe("button");
    expect(pet).not.toHaveAttribute("tabindex");
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("moves the window from pet pointer dragging, including upward movement", () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    const api = window.skfiy as DesktopApi;

    fireEvent.pointerDown(pet, { button: 0, pointerId: 7, screenX: 100, screenY: 100 });
    fireEvent.pointerMove(pet, { pointerId: 7, screenX: 112, screenY: 42 });
    fireEvent.pointerMove(pet, { pointerId: 7, screenX: 112, screenY: 12 });
    fireEvent.pointerUp(pet, { pointerId: 7, screenX: 112, screenY: 12 });
    fireEvent.click(pet);

    expect(pet).toHaveAttribute("data-drag-mode", "manual");
    expect(api.moveWindowBy).toHaveBeenNthCalledWith(1, 12, -58);
    expect(api.moveWindowBy).toHaveBeenNthCalledWith(2, 0, -30);
    expect(api.prepareDictation).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("uses a compact transparent window until a voice or task bubble is visible", async () => {
    render(<App />);

    const api = window.skfiy as DesktopApi;
    expect(screen.getByLabelText(/skfiy desktop pet/i)).not.toHaveClass("panel-open");
    expect(api.setWindowMode).toHaveBeenLastCalledWith("compact");

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(api.setWindowMode).toHaveBeenLastCalledWith("expanded");
    });
    expect(screen.getByLabelText(/skfiy desktop pet/i)).toHaveClass("panel-open");

    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    await waitFor(() => {
      expect(api.setWindowMode).toHaveBeenLastCalledWith("compact");
    });
    expect(screen.getByLabelText(/skfiy desktop pet/i)).not.toHaveClass("panel-open");
  });

  it("focuses a visible Doubao transcript area without showing a command input", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
    expect((window.skfiy as DesktopApi).prepareDictation).toHaveBeenCalledTimes(1);
  });

  it("can manually stop dictation without submitting the current transcript", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    const transcript = screen.getByLabelText("语音转写");
    fireEvent.change(transcript, {
      target: { value: "不要提交这句话" }
    });
    await waitFor(() => {
      expect(speechRecognitionInstances).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    expect((window.skfiy as DesktopApi).runCommand).not.toHaveBeenCalled();
    expect((window.skfiy as DesktopApi).stopDictation).toHaveBeenCalledTimes(1);
    expect(speechRecognitionInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
  });

  it("stops dictation with the Escape stop-turn hotkey", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect((window.skfiy as DesktopApi).stopDictation).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
  });

  it("stops dictation when the main process panic hotkey fires", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });

    act(() => emitStopTurnHotkey());

    expect((window.skfiy as DesktopApi).stopDictation).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
  });

  it("stops an active task with the Escape stop-turn hotkey", () => {
    render(<App />);

    act(() => emitTaskEvent({ status: "executing", message: "Running" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect((window.skfiy as DesktopApi).stopTask).toHaveBeenCalledTimes(1);
  });

  it("writes browser speech recognition results into the transcript", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });

    act(() => {
      speechRecognitionInstances[0].onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: "打开 Ghostty 并截图" },
            isFinal: true
          }
        ]
      });
    });

    expect(screen.getByDisplayValue("打开 Ghostty 并截图")).toBeInTheDocument();
  });

  it("auto-submits settled Doubao dictation text", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    fireEvent.change(screen.getByLabelText("语音转写"), {
      target: { value: "打开 Ghostty 并截图" }
    });

    expect(screen.getByDisplayValue("打开 Ghostty 并截图")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(899);
    });

    const api = window.skfiy as DesktopApi;
    expect(api.runCommand).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(api.runCommand).toHaveBeenCalledWith("打开 Ghostty 并截图", { mode: "active" });
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
  });

  it("exposes approval controls when a command is waiting for approval", () => {
    render(<App />);

    act(() => emitTaskEvent({ status: "approval_required", message: "Needs a human check" }));
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    const api = window.skfiy as DesktopApi;
    expect(api.approveTask).toHaveBeenCalledTimes(1);
    expect(api.denyTask).toHaveBeenCalledTimes(1);
  });
});
