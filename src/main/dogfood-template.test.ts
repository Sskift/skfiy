import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("skfiy dogfood issue template", () => {
  const templatePath = path.join(
    process.cwd(),
    ".github",
    "ISSUE_TEMPLATE",
    "skfiy-dogfood.yml"
  );

  it("requires dogfood reports to include alpha, smoke, permission, voice, and screenshot evidence", () => {
    expect(existsSync(templatePath)).toBe(true);

    const template = readFileSync(templatePath, "utf8");
    const requiredEvidence = [
      "alpha manifest",
      "alpha zip",
      "commit sha",
      "UI smoke artifact",
      "smoke artifact",
      "Chrome smoke artifact",
      "Finder smoke artifact",
      "voice smoke artifact",
      "runnerHasTmux",
      "Screen Recording",
      "Accessibility",
      "Microphone",
      "ASR provider",
      "Speech Recognition",
      "Computer Use result",
      "before screenshot",
      "after screenshot",
      "action verification events",
      "Verified type_text",
      "Verified press_key",
      "app policy settings",
      "com.mitchellh.ghostty",
      "com.google.Chrome",
      "Chrome extracted text",
      "Chrome sensitive-page pause",
      "Chrome form action",
      "com.apple.finder",
      "Finder observe_app",
      "Finder semantic selection",
      "Finder before tree / after tree",
      "Verified create_folder",
      "Verified move_file",
      "panic stop"
    ];

    for (const evidence of requiredEvidence) {
      expect(template).toContain(evidence);
    }

    expect(template).toContain("labels:");
    expect(template).toContain("dogfood");
    expect(template).toContain("skfiy");
  });
});
