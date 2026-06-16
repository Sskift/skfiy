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
      "tester id",
      "cohort workflows",
      "coding-terminal",
      "screenshot-inspection",
      "finder-file",
      "browser-fallback",
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
      "Native voice transcript-to-task evidence",
      "transcriptEvents",
      "taskEvents",
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
      "Chrome current-page observation",
      "Chrome real current-page BYO observation",
      "realCurrentPageRun.result: passed",
      "--current-page-endpoint",
      "currentPageRun.result: passed",
      "Verified current_page_snapshot",
      "Chrome current page extracted",
      "Chrome sensitive-page pause",
      "Chrome form action",
      "formRun.fields: #name, #email, #role",
      "Verified fill_selector: Filled #email.",
      "Verified fill_selector: Filled #role.",
      "Chrome screenshot fallback",
      "fallbackRun.result: fallback-observed or fallback-blocked",
      "Chrome fallback switching",
      "fallbackSwitchRun.result: fallback-switched-observed or fallback-switched-blocked",
      "Switching Chrome control from CDP to screenshot_fallback",
      "com.apple.finder",
      "Finder observe_app",
      "Finder semantic selection",
      "Finder plan preview",
      "finderPlanPreview",
      "destructiveOperationCount: 0",
      "Finder plan preview: 3 folders, 3 moves, 0 destructive operations.",
      "Finder plan confirmation",
      "finderPlanConfirmation",
      "confirmedAfterPreview: true",
      "finderItemDragDrop",
      "Finder before tree / after tree",
      "Verified item_drag_drop",
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
