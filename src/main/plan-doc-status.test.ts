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
    moneyRun: string;
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
      expect(plan).toContain(evidence.smokeArtifacts.moneyRun);
      expect(plan).not.toContain("skfiy-alpha-9102f9a");
      expect(plan).not.toContain(".skfiy-smoke/ui-9102f9a.json");

      const alphaTags = [...plan.matchAll(/skfiy-alpha-([a-f0-9]{7})/g)]
        .map((match) => match[0]);
      expect(new Set(alphaTags)).toEqual(new Set([evidence.tagName]));

      const smokeArtifactShas = [...plan.matchAll(/\.skfiy-smoke\/(?:ui|ghostty|chrome|finder|voice|money-run(?:-supervision)?)-([a-f0-9]{7})\.json/g)]
        .map((match) => match[1]);
      expect(new Set(smokeArtifactShas)).toEqual(new Set([shortSha]));
    }
  });

  it("documents the alpha workflow with Ghostty matrix evidence required by dogfood verification", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain(
      "npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-matrix.json"
    );
    expect(readme).toContain("--smoke-artifact .skfiy-smoke/ghostty-matrix.json");
    expect(readme).not.toContain("--smoke-artifact .skfiy-smoke/ghostty-smoke.json");
  });

  it("documents the maintainer dogfood collection and cohort verification loop", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const longPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-16-voice-computer-control-long-plan.md"),
      "utf8"
    );
    const readmeText = readme.replace(/\s+/g, " ");
    const workflowText = workflow.replace(/\s+/g, " ");

    expect(readme).toContain("npm run dogfood:status -- \\");
    expect(readme).toContain("Recommended Tester Assignments");
    expect(readme).toContain("tracking issue body includes a `Recommended Tester Assignments` section");
    expect(readme).toContain("`dogfood:prepare-alpha` can infer `--workflows` from the tracking issue");
    expect(readme).toContain("tracking issue body includes a `Desktop Session Preflight` section");
    expect(workflow).toContain("The generated tracking issue body includes a `Desktop Session Preflight` section");
    expect(longPlan).toContain("tracking issue body now includes `Desktop Session Preflight`");
    expect(readmeText).toContain("When the downloaded manifest and prepared app already exist locally, `dogfood:status` replaces tester placeholders with the prepared paths and surfaces direct `dogfood:tester` next actions.");
    expect(workflowText).toContain("When local prepared alpha assets already exist, `dogfood:status` replaces the tester command placeholders with those manifest and app paths and emits direct `dogfood:tester` next actions.");
    expect(readme).toContain("--tester-id tester-a \\\n  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(readme).toContain("npm run dogfood:collect -- \\");
    expect(readme).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(readme).toContain("--reports-dir .skfiy-dogfood/reports");
    expect(readme).toContain("--cohort .skfiy-dogfood/internal-alpha-cohort.json");
    expect(readme).toContain("--summary .skfiy-dogfood/internal-alpha-summary.md");
    expect(readme).toContain("npm run dogfood:cohort -- \\");
    expect(readme).toContain("--require-passed");
  });

  it("documents that locked desktop preflight artifacts cannot count as dogfood workflow coverage", () => {
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const internalAlpha = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const workflowText = workflow.replace(/\s+/g, " ");
    const internalAlphaText = internalAlpha.replace(/\s+/g, " ");

    expect(workflowText).toContain("Desktop-session preflight blocked artifacts from `loginwindow`, display sleep, or an otherwise locked console are rejected by `dogfood:report` and cannot cover workflow source evidence.");
    expect(internalAlphaText).toContain("Desktop-session preflight blocked artifacts from `loginwindow`, display sleep, or a locked console are rejected by `dogfood:report` and cannot cover workflow source-quality evidence.");
  });

  it("documents the strict dogfood tester desktop-session preflight", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const internalAlpha = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const longPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-16-voice-computer-control-long-plan.md"),
      "utf8"
    );
    const documents = [readme, workflow, internalAlpha, longPlan].map((document) =>
      document.replace(/\s+/g, " ")
    );

    for (const document of documents) {
      expect(document).toContain("strict desktop-session preflight");
      expect(document).toContain("stops before Ghostty/Chrome/Finder/voice");
      expect(document).toContain("locked console, `com.apple.loginwindow`, display sleep, or black-screen evidence");
      expect(document).toContain("Desktop Session Preflight");
    }
  });

  it("documents panic stop behavior evidence in alpha and report instructions", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const alphaBuild = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const longPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-16-voice-computer-control-long-plan.md"),
      "utf8"
    );
    const issueTemplate = readFileSync(
      path.join(process.cwd(), ".github", "ISSUE_TEMPLATE", "skfiy-dogfood.yml"),
      "utf8"
    );

    for (const document of [readme, workflow, alphaBuild, longPlan, issueTemplate]) {
      expect(document).toContain("stopTurnBehavior");
      expect(document).toContain("behaviorResult");
      expect(document).toContain("approval_required");
      expect(document).toContain("Task stopped");
    }
  });
});
