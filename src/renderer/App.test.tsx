import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, {
  type AppPolicySettings,
  type DesktopApi,
  type DictationProviderEvent,
  type DictationTranscriptEvent,
  type PlannerProviderSettings,
  type TaskEvent
} from "./App";

type TestDesktopApi = DesktopApi & {
  submitDictation: (
    sessionId: string | undefined,
    command: string,
    options: { stopNativeDictation: boolean }
  ) => Promise<void>;
  updateDictationTranscript: (
    sessionId: string | undefined,
    update: { text: string; isFinal: boolean; confidence?: number }
  ) => Promise<void>;
};

let emitTaskEvent: (event: TaskEvent) => void;
let emitDictationProviderEvent: (event: DictationProviderEvent) => void;
let emitDictationTranscriptEvent: (event: DictationTranscriptEvent) => void;
let emitStopTurnHotkey: () => void;
const speechRecognitionInstances: MockSpeechRecognition[] = [];

interface MockSpeechRecognitionResult {
  0: { transcript: string; confidence?: number };
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
  emitDictationTranscriptEvent = () => undefined;
  emitStopTurnHotkey = () => undefined;
  speechRecognitionInstances.length = 0;

  window.webkitSpeechRecognition =
    MockSpeechRecognition as unknown as NonNullable<typeof window.webkitSpeechRecognition>;
  const appPolicySettings: AppPolicySettings = {
    apps: [
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
      { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
      { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
    ]
  };
  const plannerProviderSettings: PlannerProviderSettings = {
    mode: "local-deterministic",
    externalProviderLabel: "External CUA",
    externalEndpoint: undefined,
    externalApiKeyConfigured: false
  };

  window.skfiy = {
    runCommand: vi.fn<DesktopApi["runCommand"]>().mockResolvedValue(undefined),
    prepareDictation: vi.fn<DesktopApi["prepareDictation"]>().mockResolvedValue({
      voiceTrigger: "none",
      sessionId: "voice-turn-test"
    }),
    stopDictation: vi.fn<DesktopApi["stopDictation"]>().mockResolvedValue(undefined),
    submitDictation: vi.fn<TestDesktopApi["submitDictation"]>().mockResolvedValue(undefined),
    updateDictationTranscript: vi
      .fn<TestDesktopApi["updateDictationTranscript"]>()
      .mockResolvedValue(undefined),
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
    getDictationSettings: vi.fn<DesktopApi["getDictationSettings"]>().mockResolvedValue({
      provider: "doubao",
      doubaoVoiceTrigger: "skfiy-shortcut",
      doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space"
    }),
    setDictationSettings: vi.fn<DesktopApi["setDictationSettings"]>().mockResolvedValue({
      provider: "browser",
      doubaoVoiceTrigger: "skfiy-shortcut",
      doubaoShortcutLabel: "Ctrl Opt Cmd Shift Space"
    }),
    getAppPolicySettings: vi.fn<DesktopApi["getAppPolicySettings"]>().mockResolvedValue(
      appPolicySettings
    ),
    setAppPolicy: vi.fn<DesktopApi["setAppPolicy"]>().mockImplementation(async (update) => ({
      apps: appPolicySettings.apps.map((entry) =>
        entry.bundleId === update.bundleId
          ? { ...entry, policy: update.policy }
          : entry
      )
    })),
    getPlannerProviderSettings: vi
      .fn<DesktopApi["getPlannerProviderSettings"]>()
      .mockResolvedValue(plannerProviderSettings),
    setPlannerProviderSettings: vi
      .fn<DesktopApi["setPlannerProviderSettings"]>()
      .mockImplementation(async (update) => ({
        ...plannerProviderSettings,
        mode: update.mode ?? plannerProviderSettings.mode
      })),
    getTurnReplay: vi.fn<DesktopApi["getTurnReplay"]>().mockResolvedValue(null),
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
    onDictationTranscriptEvent: vi.fn((callback: (event: DictationTranscriptEvent) => void) => {
      emitDictationTranscriptEvent = callback;
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
  } satisfies TestDesktopApi;
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

  it("opens permission onboarding from left click when required permissions are missing", async () => {
    const api = window.skfiy as DesktopApi;
    api.getPermissions = vi.fn<DesktopApi["getPermissions"]>().mockResolvedValue({
      screenRecording: { state: "denied" },
      accessibility: { state: "not-determined" },
      microphone: { state: "granted" }
    });

    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    const onboarding = await screen.findByLabelText("权限引导");
    expect(within(onboarding).getByText("需要授权")).toBeInTheDocument();
    expect(within(onboarding).getByText("屏幕录制")).toBeInTheDocument();
    expect(within(onboarding).getByText("辅助功能")).toBeInTheDocument();
    expect(within(onboarding).queryByText("麦克风")).not.toBeInTheDocument();
    expect(api.prepareDictation).not.toHaveBeenCalled();

    fireEvent.click(within(onboarding).getByRole("button", { name: "打开屏幕录制设置" }));

    expect(api.openPermissionSettings).toHaveBeenCalledWith("screen-recording");
  });

  it("leaves permission onboarding after refresh grants required permissions", async () => {
    const api = window.skfiy as DesktopApi;
    api.getPermissions = vi
      .fn<DesktopApi["getPermissions"]>()
      .mockResolvedValueOnce({
        screenRecording: { state: "denied" },
        accessibility: { state: "granted" },
        microphone: { state: "granted" }
      })
      .mockResolvedValue({
        screenRecording: { state: "granted" },
        accessibility: { state: "granted" },
        microphone: { state: "granted" }
      });

    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    fireEvent.click(pet);
    const onboarding = await screen.findByLabelText("权限引导");
    fireEvent.click(within(onboarding).getByRole("button", { name: "刷新权限状态" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("权限引导")).not.toBeInTheDocument();
    });
    expect(api.prepareDictation).not.toHaveBeenCalled();

    fireEvent.click(pet);

    await waitFor(() => {
      expect(api.prepareDictation).toHaveBeenCalledTimes(1);
    });
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

  it("uses native macOS speech transcripts without starting browser speech recognition", async () => {
    vi.useFakeTimers();
    (window.skfiy as DesktopApi).prepareDictation = vi
      .fn<DesktopApi["prepareDictation"]>()
      .mockResolvedValue({
        providerId: "native-macos",
        voiceTrigger: "none",
        nativeDictationActive: true,
        sessionId: "native-session-test"
      });

    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(speechRecognitionInstances).toHaveLength(0);

    act(() => {
      emitDictationTranscriptEvent({
        providerId: "native-macos",
        sessionId: "native-session-test",
        text: "打开 Ghostty 执行 pwd",
        isFinal: true,
        confidence: 0.91
      });
    });
    expect(screen.getByDisplayValue("打开 Ghostty 执行 pwd")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect((window.skfiy as TestDesktopApi).submitDictation).toHaveBeenCalledWith(
      "native-session-test",
      "打开 Ghostty 执行 pwd",
      { stopNativeDictation: true }
    );
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

  it("shows ASR provider choices and Doubao shortcut instructions in settings", async () => {
    const api = window.skfiy as DesktopApi;
    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByText("语音入口")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "选择豆包语音" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "选择浏览器语音" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByText("豆包输入法语音快捷键")).toBeInTheDocument();
    expect(screen.getByText("Ctrl Opt Cmd Shift Space")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择浏览器语音" }));

    await waitFor(() => {
      expect(api.setDictationSettings).toHaveBeenCalledWith({ provider: "browser" });
    });
    expect(screen.getByRole("button", { name: "选择浏览器语音" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows app policy choices and updates app allowlist decisions from settings", async () => {
    const api = window.skfiy as DesktopApi;
    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByText("应用策略")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "允许 Ghostty" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "询问 Chrome" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "拒绝 Chrome" }));

    await waitFor(() => {
      expect(api.setAppPolicy).toHaveBeenCalledWith({
        bundleId: "com.google.Chrome",
        policy: "deny"
      });
    });
    expect(screen.getByRole("button", { name: "拒绝 Chrome" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows planner provider choices and updates Computer Use planner mode from settings", async () => {
    const api = window.skfiy as DesktopApi;
    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByText("规划模式")).toBeInTheDocument();
    });
    expect(screen.getByText("本地确定性")).toBeInTheDocument();
    expect(screen.getByText("External CUA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择本地确定性规划" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "选择关闭规划" }));

    await waitFor(() => {
      expect(api.setPlannerProviderSettings).toHaveBeenCalledWith({ mode: "disabled" });
    });
    expect(screen.getByRole("button", { name: "选择关闭规划" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows external CUA endpoint and API key configuration status", async () => {
    const api = window.skfiy as DesktopApi;
    api.getPlannerProviderSettings = vi.fn<DesktopApi["getPlannerProviderSettings"]>()
      .mockResolvedValue({
        mode: "external-cua",
        externalProviderLabel: "External CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      });
    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByText("External CUA")).toBeInTheDocument();
    });
    expect(screen.getByText("Endpoint 已配置")).toBeInTheDocument();
    expect(screen.getByText("API Key 已配置")).toBeInTheDocument();
  });

  it("shows the latest local replay transcript in settings", async () => {
    const api = window.skfiy as DesktopApi & {
      getTurnReplay: () => Promise<{
        transcript: {
          command?: string;
          risk?: { level: string; reason: string; requiresApproval: boolean };
          planner?: {
            providerLabel: string;
            input: string;
            command: string;
            rationale?: string;
          };
          approvalRequired: boolean;
          apps: Array<{ name: string; bundleId?: string; pid?: number }>;
          screenshots: Array<{ stage: "before" | "after"; path: string }>;
          actions: Array<{ type: string; text?: string; key?: string }>;
          outcome: string;
        };
        timeline: Array<{ status: string; message?: string }>;
      }>;
    };
    api.getTurnReplay = vi.fn().mockResolvedValue({
      transcript: {
        command: "pwd",
        risk: {
          level: "low",
          reason: "Read-only terminal command.",
          requiresApproval: false
        },
        planner: {
          providerLabel: "External CUA",
          input: "打开 Ghostty 执行 pwd 并截图",
          command: "pwd",
          rationale: "Read the current working directory."
        },
        approvalRequired: false,
        apps: [{ name: "Ghostty", bundleId: "com.mitchellh.ghostty", pid: 54502 }],
        screenshots: [
          {
            stage: "before",
            path: "/tmp/before.png",
            grounding: {
              recommendation: "structured_first",
              sources: [
                {
                  source: "macos_accessibility",
                  status: "covered",
                  observedElementCount: 1,
                  labelCount: 1,
                  notes: []
                }
              ]
            }
          },
          {
            stage: "after",
            path: "/tmp/after.png",
            grounding: {
              recommendation: "structured_first",
              sources: [
                {
                  source: "macos_accessibility",
                  status: "covered",
                  observedElementCount: 1,
                  labelCount: 1,
                  notes: []
                }
              ]
            }
          }
        ],
        actions: [
          { type: "type_text", text: "pwd" },
          { type: "press_key", key: "enter" }
        ],
        outcome: "completed"
      },
      timeline: [
        { status: "executing", message: "Typing command in Ghostty." },
        { status: "completed", message: "Command submitted to Ghostty." }
      ]
    });

    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    let replayPanel: HTMLElement | undefined;
    await waitFor(() => {
      replayPanel = screen.getByLabelText("本地回放");
      expect(replayPanel).toBeInTheDocument();
    });
    const replay = within(replayPanel as HTMLElement);
    expect(replay.getAllByText("pwd").length).toBeGreaterThan(0);
    expect(replay.getByText(/External CUA: pwd/)).toBeInTheDocument();
    expect(replay.getByText(/Read the current working directory/)).toBeInTheDocument();
    expect(replay.getByText("low")).toBeInTheDocument();
    expect(replay.getByText(/type_text/)).toBeInTheDocument();
    expect(replay.getByText(/\/tmp\/after\.png/)).toBeInTheDocument();
    expect(replay.getAllByText(/structured_first/).length).toBeGreaterThan(0);
    expect(replay.getByText(/Command submitted to Ghostty/)).toBeInTheDocument();
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
      ["needs_confirmation", "Needs confirmation", "Verification failed", "waiting"],
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
    const transcript = await screen.findByLabelText("语音转写");
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
            0: { transcript: "打开 Ghostty 并截图", confidence: 0.87 },
            isFinal: true
          }
        ]
      });
    });

    expect(screen.getByDisplayValue("打开 Ghostty 并截图")).toBeInTheDocument();
    expect((window.skfiy as TestDesktopApi).updateDictationTranscript).toHaveBeenCalledWith(
      "voice-turn-test",
      {
        text: "打开 Ghostty 并截图",
        isFinal: true,
        confidence: 0.87
      }
    );
  });

  it("auto-submits settled Doubao dictation text", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText("语音转写"), {
      target: { value: "打开 Ghostty 并截图" }
    });

    expect(screen.getByDisplayValue("打开 Ghostty 并截图")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(899);
    });

    const api = window.skfiy as TestDesktopApi;
    expect(api.runCommand).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(api.submitDictation).toHaveBeenCalledWith("voice-turn-test", "打开 Ghostty 并截图", {
      stopNativeDictation: false
    });
    expect(api.runCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
  });

  it("does not auto-submit interim browser speech candidates", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      speechRecognitionInstances[0].onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: "打开 Ghost", confidence: 0.9 },
            isFinal: false
          }
        ]
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });

    expect((window.skfiy as TestDesktopApi).submitDictation).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("打开 Ghost")).toBeInTheDocument();
  });

  it("does not auto-submit low-confidence final browser speech candidates", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      speechRecognitionInstances[0].onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: "打开 Ghostty 并截图", confidence: 0.34 },
            isFinal: true
          }
        ]
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });

    expect((window.skfiy as TestDesktopApi).submitDictation).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("打开 Ghostty 并截图")).toBeInTheDocument();
  });

  it("auto-submits when an interim browser speech candidate becomes final with confidence", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      speechRecognitionInstances[0].onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: "打开 Ghostty 并截图", confidence: 0.89 },
            isFinal: false
          }
        ]
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    expect((window.skfiy as TestDesktopApi).submitDictation).not.toHaveBeenCalled();

    act(() => {
      speechRecognitionInstances[0].onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: "打开 Ghostty 并截图", confidence: 0.89 },
            isFinal: true
          }
        ]
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect((window.skfiy as TestDesktopApi).submitDictation).toHaveBeenCalledWith(
      "voice-turn-test",
      "打开 Ghostty 并截图",
      { stopNativeDictation: false }
    );
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

  it("shows verification failure as human confirmation without approval execution controls", () => {
    render(<App />);

    act(() => emitTaskEvent({
      status: "needs_confirmation",
      message: "Verification failed: Ghostty did not become frontmost."
    }));

    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent(
      "Needs confirmation"
    );
    expect(screen.getByText("Verification failed: Ghostty did not become frontmost.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
  });

  it("shows observe_app replay records with screenshot paths and accessibility trust", () => {
    render(<App />);

    act(() => emitTaskEvent({
      status: "observing",
      message: "Captured before screenshot: /tmp/before.png",
      replayRecord: {
        stage: "before",
        bundleId: "com.mitchellh.ghostty",
        isRunning: true,
        isActive: true,
        screenshotPath: "/tmp/before.png",
        frontmostBundleId: "com.mitchellh.ghostty",
        accessibilityTrusted: true,
        ocrLabels: [
          {
            text: "pwd",
            confidence: 0.88,
            bounds: { x: 36, y: 88, width: 42, height: 18 }
          }
        ]
      }
    }));
    act(() => emitTaskEvent({
      status: "observing",
      message: "Captured after screenshot: /tmp/after.png",
      replayRecord: {
        stage: "after",
        bundleId: "com.mitchellh.ghostty",
        isRunning: true,
        isActive: true,
        screenshotPath: "/tmp/after.png",
        frontmostBundleId: "com.mitchellh.ghostty",
        accessibilityTrusted: false
      }
    }));

    const replay = screen.getByLabelText("Computer Use replay");
    expect(replay).toHaveTextContent("before");
    expect(replay).toHaveTextContent("/tmp/before.png");
    expect(replay).toHaveTextContent("AX ok");
    expect(replay).toHaveTextContent("OCR 1");
    expect(replay).toHaveTextContent("after");
    expect(replay).toHaveTextContent("/tmp/after.png");
    expect(replay).toHaveTextContent("AX denied");
  });

  it("clears old replay records when a new task starts", () => {
    render(<App />);

    act(() => emitTaskEvent({
      status: "observing",
      message: "Captured before screenshot: /tmp/before.png",
      replayRecord: {
        stage: "before",
        bundleId: "com.mitchellh.ghostty",
        isRunning: true,
        isActive: true,
        screenshotPath: "/tmp/before.png",
        accessibilityTrusted: true
      }
    }));

    expect(screen.getByLabelText("Computer Use replay")).toHaveTextContent("/tmp/before.png");

    act(() => emitTaskEvent({
      status: "executing",
      message: "Risk low: Read-only terminal command.",
      replayReset: true
    }));

    expect(screen.queryByLabelText("Computer Use replay")).not.toBeInTheDocument();
  });
});
