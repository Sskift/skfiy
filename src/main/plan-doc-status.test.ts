import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface LatestAlphaEvidence {
  appName: string;
  tagName: string;
  releaseUrl: string;
  commitSha: string;
  zipSha256: string;
  smokeArtifacts: {
    ui: string;
    ghostty: string;
    chrome: string;
    finder: string;
    voice: string;
  };
}

function readLatestAlphaEvidence(): LatestAlphaEvidence {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "docs", "release-evidence", "latest-alpha.json"),
      "utf8"
    )
  ) as LatestAlphaEvidence;
}

describe("implementation plan status docs", () => {
  it("marks the skfiy MVP implementation plan as completed with shipped evidence", () => {
    const plan = readFileSync(
      path.join(
        process.cwd(),
        "docs",
        "superpowers",
        "plans",
        "2026-06-15-skfiy-mvp.md"
      ),
      "utf8"
    );

    expect(plan).not.toContain("- [ ]");
    expect(plan).toContain("Implemented evidence");
    expect(plan).toContain("src/shared/risk-policy.test.ts");
    expect(plan).toContain("src/main/computer-use/desktop-helper.test.ts");
    expect(plan).toContain("src/main/orchestrator/ghostty-task.test.ts");
    expect(plan).toContain("npm run smoke:ghostty");
  });

  it("marks the pixel cosmic pet UI plan as completed with shipped evidence", () => {
    const plan = readFileSync(
      path.join(
        process.cwd(),
        "docs",
        "superpowers",
        "plans",
        "2026-06-15-pixel-cosmic-pet-ui.md"
      ),
      "utf8"
    );

    expect(plan).not.toContain("- [ ]");
    expect(plan).toContain("Implemented evidence");
    expect(plan).toContain("src/renderer/App.test.tsx");
    expect(plan).toContain("src/main/main.ts");
    expect(plan).toContain("npm run smoke:ui");
  });

  it("keeps plan release evidence synced to the latest alpha evidence source", () => {
    const evidence = readLatestAlphaEvidence();
    const shortSha = evidence.commitSha.slice(0, 7);
    const plans = [
      readFileSync(
        path.join(
          process.cwd(),
          "docs",
          "superpowers",
          "plans",
          "2026-06-15-skfiy-mvp.md"
        ),
        "utf8"
      ),
      readFileSync(
        path.join(
          process.cwd(),
          "docs",
          "superpowers",
          "plans",
          "2026-06-15-pixel-cosmic-pet-ui.md"
        ),
        "utf8"
      )
    ];

    expect(evidence.appName).toBe("skfiy");
    expect(evidence.tagName).toBe(`skfiy-alpha-${shortSha}`);
    expect(evidence.releaseUrl).toContain(evidence.tagName);
    expect(evidence.zipSha256).toMatch(/^[a-f0-9]{64}$/);

    for (const plan of plans) {
      expect(plan).toContain(evidence.tagName);
      expect(plan).toContain(shortSha);
      expect(plan).toContain(evidence.smokeArtifacts.ui);
      expect(plan).toContain(evidence.smokeArtifacts.ghostty);
      expect(plan).toContain(evidence.smokeArtifacts.chrome);
      expect(plan).toContain(evidence.smokeArtifacts.finder);
      expect(plan).toContain(evidence.smokeArtifacts.voice);
      expect(plan).not.toContain("skfiy-alpha-9102f9a");
      expect(plan).not.toContain(".skfiy-smoke/ui-9102f9a.json");
    }
  });
});
