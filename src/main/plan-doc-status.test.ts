import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
});
