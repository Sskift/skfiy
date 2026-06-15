import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CUA provider decision record", () => {
  const decisionPath = path.join(
    process.cwd(),
    "docs",
    "decisions",
    "2026-06-16-skfiy-cua-provider.md"
  );

  it("records the default provider path, evaluation gates, and fail-closed modes", () => {
    expect(existsSync(decisionPath)).toBe(true);

    const decision = readFileSync(decisionPath, "utf8");
    const requiredPhrases = [
      "Decision: local deterministic baseline, external CUA evaluation, no default cloud autonomy",
      "local-deterministic",
      "external-cua",
      "disabled",
      "AIOS Computer Use",
      "OpenAI Computer Use",
      "computer-use-preview",
      "Responses API",
      "terminal-command capability",
      "dogfood:verify",
      "require-passed",
      "fail closed",
      "Trigger to promote external CUA"
    ];

    for (const phrase of requiredPhrases) {
      expect(decision).toContain(phrase);
    }
  });
});
