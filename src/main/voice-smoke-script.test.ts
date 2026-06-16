import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("native voice product smoke script", () => {
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
      provider: "native-macos",
      locale: "zh-CN",
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech"
    });
    expect(parseVoiceSmokeArgs([
      "--output",
      "artifacts/voice.json",
      "--listen-ms",
      "1234",
      "--require-passed"
    ], defaults)).toMatchObject({
      outputPath: path.resolve("artifacts/voice.json"),
      listenMs: 1234,
      requirePassed: true
    });
  });

  it("classifies permission-denied native speech preparation as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: {
        providerEvents?: Array<{ state: string; message?: string }>;
        taskEvents?: Array<{ status: string; message?: string }>;
        transcriptEvents?: Array<{ isFinal?: boolean; text?: string }>;
        runnerHasTmux?: boolean;
        appLaunchViaOpen?: boolean;
        productPath?: string;
      }) => string;
    };

    expect(classifyVoiceSmokeEvidence({
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

  it("requires native speech transcript evidence before classifying a run as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-voice-plan.mjs");
    const {
      classifyVoiceSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyVoiceSmokeEvidence: (input: {
        providerEvents?: Array<{ state: string; message?: string }>;
        taskEvents?: Array<{ status: string; message?: string }>;
        transcriptEvents?: Array<{ isFinal?: boolean; text?: string }>;
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
      { isFinal: true, text: "打开 Ghostty 执行 pwd" }
    ];

    expect(classifyVoiceSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents
    })).toBe("passed");
    expect(classifyVoiceSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: true,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents
    })).toBe("failed");
    expect(classifyVoiceSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
      providerEvents,
      transcriptEvents: []
    })).toBe("no-transcript");
    expect(classifyVoiceSmokeEvidence({
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

  it("drives native voice through the preload API rather than the helper directly", () => {
    const sourcePath = path.join(process.cwd(), "scripts", "smoke-voice-product.mjs");

    expect(existsSync(sourcePath)).toBe(true);

    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("acquireSmokeLock");
    expect(source).toContain("speechStatus");
    expect(source).toContain("window.skfiy.getNativeSpeechStatus(\"zh-CN\")");
    expect(source).toContain("window.skfiy.setDictationSettings({ provider: \"native-macos\" })");
    expect(source).toContain("window.skfiy.prepareDictation()");
    expect(source).toContain("window.skfiy.stopDictation(");
    expect(source).toContain("window.skfiy.onDictationProviderEvent");
    expect(source).toContain("window.skfiy.onDictationTranscriptEvent");
    expect(source).toContain("window.skfiy.onTaskEvent");
  });
});
