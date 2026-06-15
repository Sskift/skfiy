import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("native speech status product API", () => {
  it("exposes structured native macOS speech readiness through preload and main IPC", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const preloadPath = path.join(process.cwd(), "src", "main", "preload.cts");

    expect(existsSync(mainPath)).toBe(true);
    expect(existsSync(preloadPath)).toBe(true);

    const mainSource = readFileSync(mainPath, "utf8");
    const preloadSource = readFileSync(preloadPath, "utf8");

    expect(mainSource).toContain("skfiy:get-native-speech-status");
    expect(mainSource).toContain("createDesktopHelper().getSpeechStatus");
    expect(preloadSource).toContain("getNativeSpeechStatus");
    expect(preloadSource).toContain("isNativeSpeechStatus");
    expect(preloadSource).toContain("createUnknownNativeSpeechStatus");
  });

  it("wires Speech Recognition as a first-class macOS permission settings target", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const preloadPath = path.join(process.cwd(), "src", "main", "preload.cts");
    const helperPath = path.join(
      process.cwd(),
      "macos-helper",
      "Sources",
      "skfiy-helper",
      "main.swift"
    );

    const mainSource = readFileSync(mainPath, "utf8");
    const preloadSource = readFileSync(preloadPath, "utf8");
    const helperSource = readFileSync(helperPath, "utf8");

    expect(mainSource).toContain('value === "speech-recognition"');
    expect(preloadSource).toContain('value === "speech-recognition"');
    expect(helperSource).toContain('case speechRecognition = "speech-recognition"');
    expect(helperSource).toContain("Privacy_SpeechRecognition");
  });
});
