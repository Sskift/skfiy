import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    moneyRun: string;
  };
}

const longPlanPath = path.join(
  process.cwd(),
  "docs",
  "research",
  "2026-06-22-agent-computer-use-long-plan.md"
);

function readLatestAlphaEvidence(): LatestAlphaEvidence {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "docs", "release-evidence", "latest-alpha.json"),
      "utf8"
    )
  ) as LatestAlphaEvidence;
}

describe("implementation plan status docs", () => {
  it("keeps no stale executable implementation plan in repo docs", () => {
    const planDir = path.join(process.cwd(), "docs", "superpowers", "plans");
    const activePlanFiles = existsSync(planDir)
      ? readdirSync(planDir).filter((entry) => entry.endsWith(".md"))
      : [];

    expect(activePlanFiles).toEqual([]);
  });

  it("documents the current local packaged-app evidence in README instead of plan archives", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("## Current Local Evidence");
    expect(readme).toContain("<commit>");
    expect(readme).toContain("Finder Automation");
    expect(readme).toContain(".skfiy-smoke/finder-<commit>.json");
    expect(readme).not.toContain("skfiy-alpha-2e292e9");
  });

  it("keeps latest published alpha release evidence internally consistent without voice artifacts", () => {
    const evidence = readLatestAlphaEvidence();
    const shortSha = evidence.commitSha.slice(0, 7);

    expect(evidence.appName).toBe("skfiy");
    expect(evidence.tagName).toBe(`skfiy-alpha-${shortSha}`);
    expect(evidence.releaseUrl).toContain(evidence.tagName);
    expect(evidence.zipSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.smokeArtifacts.ui).toContain(shortSha);
    expect(evidence.smokeArtifacts.ghostty).toContain(shortSha);
    expect(evidence.smokeArtifacts.chrome).toContain(shortSha);
    expect(evidence.smokeArtifacts.finder).toContain(shortSha);
    expect(evidence.smokeArtifacts.moneyRun).toContain(shortSha);
    expect(JSON.stringify(evidence.smokeArtifacts)).not.toContain("voice");
  });

  it("documents the active alpha and dogfood workflow around Computer Use gates", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const internalAlpha = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const longPlan = readFileSync(longPlanPath, "utf8");
    const combined = [readme, workflow, internalAlpha, longPlan].join("\n");

    expect(combined).toContain("agent-first");
    expect(combined).toContain("Computer Use is a tool capability");
    expect(combined).toContain("Screen Recording");
    expect(combined).toContain("Accessibility");
    expect(combined).toContain("npm run smoke:ui");
    expect(combined).toContain("npm run smoke:ghostty");
    expect(combined).toContain("npm run smoke:chrome");
    expect(combined).toContain("npm run smoke:finder");
    expect(combined).toContain("npm run smoke:money-run");
    expect(combined).toContain("dist/skfiy.app");
    expect(combined).toContain("dist/skfiy");
  });

  it("documents generic visible-app control as an unsupported product route", () => {
    const readiness = readFileSync(
      path.join(process.cwd(), "docs", "product-readiness-matrix.md"),
      "utf8"
    );

    expect(readiness).toContain("Generic visible-app fallback is not a product route");
    expect(readiness).toContain("Shared action-runner and app-capabilities are internal building blocks");
    expect(readiness).not.toContain("generic visible apps");
    expect(readiness).not.toContain("Route explicit generic visible-app requests through");
    expect(readiness).not.toContain("app-agnostic observe any visible app");
  });

  it("keeps the long plan focused on agent providers, dashboard, extension, CLI, and long-horizon testing", () => {
    const longPlan = readFileSync(longPlanPath, "utf8");

    expect(longPlan).toContain("# skfiy Agent and Computer Use Implementation Plan");
    expect(longPlan).toContain("For agentic workers");
    expect(longPlan).toContain("Agent provider");
    expect(longPlan).toContain("Codex");
    expect(longPlan).toContain("Claude Code");
    expect(longPlan).toContain("Computer Use");
    expect(longPlan).toContain("Chrome extension");
    expect(longPlan).toContain("dashboard");
    expect(longPlan).toContain("HeroUI");
    expect(longPlan).toContain("binary");
    expect(longPlan).toContain("CLI");
    expect(longPlan).toContain("money-run");
    expect(longPlan).toContain("Workstream A: Dashboard UX");
    expect(longPlan).toContain("Workstream B: Agent Provider Foundation");
    expect(longPlan).toContain("Workstream C: Pet and Conversation Surface");
    expect(longPlan).toContain("Workstream D: Computer Use as Agent Tool");
    expect(longPlan).toContain("Workstream E: Chromium and Chrome Extension Control");
    expect(longPlan).toContain("Workstream F: Binary, CLI, and Release Path");
    expect(longPlan).toContain("Workstream G: Real Scenario Dogfood and Long-horizon Supervision");
    expect(longPlan).toContain("Workstream H: Documentation and Plan Hygiene");
    expect(longPlan).toContain("docs/superpowers/plans/");
    expect(longPlan).toContain("input-method integration");
    expect(longPlan).not.toContain("smoke:voice");
    expect(longPlan).not.toContain("native-macos voice");
  });

  it("documents panic stop behavior evidence in alpha and report instructions", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const alphaBuild = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const longPlan = readFileSync(longPlanPath, "utf8");
    const issueTemplate = readFileSync(
      path.join(process.cwd(), ".github", "ISSUE_TEMPLATE", "skfiy-dogfood.yml"),
      "utf8"
    );

    const combined = [readme, workflow, alphaBuild, longPlan, issueTemplate].join("\n");

    expect(combined).toContain("stopTurnBehavior");
    expect(combined).toContain("Task stopped");
  });
});
