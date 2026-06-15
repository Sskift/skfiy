import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AIME integration decision record", () => {
  const decisionPath = path.join(
    process.cwd(),
    "docs",
    "decisions",
    "2026-06-16-skfiy-aime-integration.md"
  );

  it("records a current integration path with explicit options, evidence, and revisit triggers", () => {
    expect(existsSync(decisionPath)).toBe(true);

    const decision = readFileSync(decisionPath, "utf8");
    const requiredPhrases = [
      "Decision: Option A now, Option B later",
      "Option A: skfiy as standalone experimental shell",
      "Option B: skfiy as AIME native Computer Use plugin",
      "Option C: skfiy only provides helper/runtime, AIME owns UX",
      "AIME Buddy overlap",
      "AIME Chrome Extension overlap",
      "native macOS app Computer Use",
      "AIOS Computer Use",
      "bytedcli insearch query",
      "2026-06-16",
      "Trigger to revisit",
      "dogfood:verify",
      "require-passed"
    ];

    for (const phrase of requiredPhrases) {
      expect(decision).toContain(phrase);
    }
  });
});
