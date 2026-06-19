import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("voice product smoke script", () => {
  it("is exposed as an npm script for packaged-app voice evidence", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "smoke:voice": "node scripts/smoke-voice-product.mjs"
    });
  });

  it("parses product-path voice smoke options", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      createDefaultVoiceSmokeOptions,
      parseVoiceSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultVoiceSmokeOptions: (rootDir: string) => Record<string, unknown>;
      parseVoiceSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultVoiceSmokeOptions("/repo");

    expect(defaults).toMatchObject({
      appPath: path.join("/repo", "dist", "skfiy.app"),
      provider: "doubao",
      locale: "zh-CN",
      productPath: "renderer -> preload -> main -> external Doubao Input Method -> text bridge -> Computer Use"
    });
    expect(parseVoiceSmokeArgs([
      "--provider",
      "native-macos",
      "--output",
      "artifacts/voice.json",
      "--listen-ms",
      "1234",
      "--locale",
      "en-US",
      "--require-passed"
    ], defaults)).toMatchObject({
      provider: "native-macos",
      outputPath: path.resolve("artifacts/voice.json"),
      listenMs: 1234,
      locale: "en-US",
      requirePassed: true,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech"
    });
  });

  it("classifies permission-denied native speech preparation as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: {
        provider?: string;
        providerEvents?: Array<{ state: string; message?: string }>;
        taskEvents?: Array<{ status: string; message?: string }>;
        transcriptEvents?: Array<{
          providerId?: string;
          isFinal?: boolean;
          text?: string;
          provenance?: Record<string, unknown>;
        }>;
        externalInput?: unknown;
        turnReplay?: unknown;
        runnerHasTmux?: boolean;
        appLaunchViaOpen?: boolean;
        productPath?: string;
      }) => string;
    };

    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents: [
        {
          state: "unavailable",
          message: "macOS speech recognition permission is denied."
        }
      ],
      taskEvents: [
        {
          status: "failed",
          message: "macOS speech recognition permission is denied."
        }
      ],
      transcriptEvents: []
    })).toBe("blocked");
  });

  it("requires native speech transcript and downstream task evidence before classifying a run as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: {
        provider?: string;
        providerEvents?: Array<{ state: string; message?: string }>;
        taskEvents?: Array<{ status: string; message?: string }>;
        transcriptEvents?: Array<{ providerId?: string; isFinal?: boolean; text?: string }>;
        externalInput?: unknown;
        turnReplay?: unknown;
        runnerHasTmux?: boolean;
        appLaunchViaOpen?: boolean;
        productPath?: string;
      }) => string;
    };
    const providerEvents = [
      { state: "listening", message: "macOS system speech is listening." },
      { state: "stopped", message: "macOS system speech finished." }
    ];
    const transcriptEvents = [
      {
        isFinal: true,
        text: "打开 Ghostty 执行 pwd",
        provenance: {
          source: "native-macos-speech-helper",
          locale: "zh-CN",
          durationMs: 1400,
          silenceTimedOut: true,
          maxDurationMs: 12000,
          silenceTimeoutMs: 1500
        }
      }
    ];
    const taskEvents = [
      { status: "observing", message: "Preparing Computer Use command from voice transcript." }
    ];

    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents,
      taskEvents
    })).toBe("failed");
    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents,
      taskEvents: [
        { status: "completed", message: "Task completed from voice transcript." }
      ],
      turnReplay: createPassedGhosttyTurnReplay()
    })).toBe("passed");
    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents: [
        { isFinal: true, text: "打开 Ghostty 执行 pwd" }
      ],
      taskEvents: [
        { status: "completed", message: "Task completed from voice transcript." }
      ],
      turnReplay: createPassedGhosttyTurnReplay()
    })).toBe("failed");
    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: true,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents,
      taskEvents,
      turnReplay: createPassedGhosttyTurnReplay()
    })).toBe("failed");
    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents: []
    })).toBe("no-transcript");
    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents,
      taskEvents: []
    })).toBe("failed");
    expect(classifyVoiceSmokeEvidence({
      provider: "native-macos",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents: [
        { state: "listening", message: "macOS system speech is listening." },
        { state: "no_transcript", message: "没有识别到语音内容，请重试或检查麦克风输入." }
      ],
      transcriptEvents: []
    })).toBe("no-transcript");
  });

  it("classifies external Doubao input-method transcript evidence without Speech Recognition status", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: {
        provider?: string;
        providerEvents?: Array<{ providerId?: string; state: string; message?: string }>;
        taskEvents?: Array<{ status: string; message?: string }>;
        transcriptEvents?: Array<{ providerId?: string; isFinal?: boolean; text?: string }>;
        externalInput?: unknown;
        turnReplay?: unknown;
        runnerHasTmux?: boolean;
        appLaunchViaOpen?: boolean;
        productPath?: string;
      }) => string;
    };
    const productPath = "renderer -> preload -> main -> external Doubao Input Method -> text bridge -> Computer Use";
    const providerEvents = [
      { providerId: "doubao", state: "listening", message: "Triggered external Doubao Input Method." },
      { providerId: "doubao", state: "stopped", message: "External Doubao text was submitted." }
    ];
    const transcriptEvents = [
      { providerId: "doubao", isFinal: true, text: "打开 Ghostty 执行 pwd" }
    ];
    const externalInput = {
      source: "doubao-input-method",
      embedded: false,
      textBridge: "renderer-textarea"
    };

    expect(classifyVoiceSmokeEvidence({
      provider: "doubao",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath,
      providerEvents,
      transcriptEvents,
      taskEvents: [
        { status: "completed", message: "Command completed from external Doubao transcript." }
      ],
      externalInput,
      turnReplay: createPassedGhosttyTurnReplay()
    })).toBe("passed");

    expect(classifyVoiceSmokeEvidence({
      provider: "doubao",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath,
      providerEvents,
      transcriptEvents,
      taskEvents: [
        { status: "completed", message: "Command completed from external Doubao transcript." }
      ],
      turnReplay: createPassedGhosttyTurnReplay()
    })).toBe("failed");
  });

  it("classifies external Doubao voice runs blocked when downstream Computer Use is lockscreen-blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: {
        provider?: string;
        providerEvents?: Array<{ providerId?: string; state: string; message?: string }>;
        taskEvents?: Array<{ status: string; message?: string }>;
        transcriptEvents?: Array<{ providerId?: string; isFinal?: boolean; text?: string }>;
        externalInput?: unknown;
        turnReplay?: unknown;
        runnerHasTmux?: boolean;
        appLaunchViaOpen?: boolean;
        productPath?: string;
      }) => string;
    };
    const productPath = "renderer -> preload -> main -> external Doubao Input Method -> text bridge -> Computer Use";

    expect(classifyVoiceSmokeEvidence({
      provider: "doubao",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath,
      providerEvents: [
        { providerId: "doubao", state: "listening", message: "Triggered external Doubao Input Method." },
        { providerId: "doubao", state: "stopped", message: "External Doubao text was submitted." }
      ],
      transcriptEvents: [
        { providerId: "doubao", isFinal: true, text: "打开 Ghostty 执行 pwd" }
      ],
      externalInput: {
        source: "doubao-input-method",
        embedded: false,
        textBridge: "renderer-textarea"
      },
      taskEvents: [
        { status: "observing", message: "Opened Ghostty session: skfiy-shell." },
        {
          status: "failed",
          message: "Desktop session is not controllable because loginwindow is frontmost. Unlock the Mac and keep the display awake, then try again."
        }
      ]
    })).toBe("blocked");
  });

  it("lets desktop preflight block voice smoke classification before target apps open", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyVoiceSmokeEvidence({
      desktopPreflight: {
        result: "blocked",
        reason: "Desktop session is not controllable because loginwindow is frontmost."
      },
      providerEvents: [],
      transcriptEvents: [],
      taskEvents: []
    })).toBe("blocked");
  });

  it("drives external Doubao text through the preload API while keeping native macOS speech optional", () => {
    const sourcePath = path.join(process.cwd(), "scripts", "smoke-voice-product.mjs");

    expect(existsSync(sourcePath)).toBe(true);

    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("acquireSmokeLock");
    expect(source).toContain("externalInput");
    expect(source).toContain("window.skfiy.setDictationSettings({ provider: ${JSON.stringify(options.provider)}");
    expect(source).toContain("speechStatus");
    expect(source).toContain("options.provider === \"native-macos\"");
    expect(source).toContain(
      "window.skfiy.getNativeSpeechStatus(${JSON.stringify(options.locale)})"
    );
    expect(source).toContain("window.skfiy.prepareDictation()");
    expect(source).toContain("window.skfiy.submitDictation(");
    expect(source).toContain("window.skfiy.getTurnReplay()");
    expect(source).toContain("window.skfiy.stopDictation(");
    expect(source).toContain("window.skfiy.onDictationProviderEvent");
    expect(source).toContain("window.skfiy.onDictationTranscriptEvent");
    expect(source).toContain("window.skfiy.onTaskEvent");
  });
});

function createPassedGhosttyTurnReplay() {
  return {
    transcript: {
      command: "pwd",
      apps: [
        {
          name: "Ghostty",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502
        }
      ],
      screenshots: [
        {
          stage: "before",
          path: "/tmp/skfiy-voice-before.png",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          bytes: 1200
        },
        {
          stage: "after",
          path: "/tmp/skfiy-voice-after.png",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          bytes: 1400
        }
      ],
      actions: [
        { type: "type_text", text: "pwd" },
        { type: "verify", actionType: "type_text", status: "passed" },
        { type: "press_key", key: "enter" },
        { type: "verify", actionType: "press_key", status: "passed" }
      ],
      outcome: "completed"
    },
    timeline: [
      { status: "observing", message: "Preparing Computer Use command from voice transcript." },
      { status: "completed", message: "Command completed from voice transcript." }
    ]
  };
}
