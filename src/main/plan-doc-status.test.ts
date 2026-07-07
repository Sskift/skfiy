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

const activePlanPath = path.join(
  process.cwd(),
  "docs",
  "superpowers",
  "plans",
  "2026-07-07-code-health-cleanup.md"
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
  it("keeps exactly one active implementation plan in repo docs", () => {
    const planDir = path.join(process.cwd(), "docs", "superpowers", "plans");
    const activePlanFiles = existsSync(planDir)
      ? readdirSync(planDir).filter((entry) => entry.endsWith(".md"))
      : [];

    expect(activePlanFiles).toEqual(["2026-07-07-code-health-cleanup.md"]);
  });

  it("keeps AGENTS pointed at the current active plan", () => {
    const agents = readFileSync(path.join(process.cwd(), "AGENTS.md"), "utf8");

    expect(agents).toContain("docs/superpowers/plans/2026-07-07-code-health-cleanup.md");
    expect(agents).toContain("retired 2026-06-23 browser/dashboard plan");
    expect(agents).not.toContain("docs/superpowers/plans/2026-06-23-pet-agent-browser-dashboard.md");
  });

  it("documents output-free default smoke runs in README instead of plan archives", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("## Smoke Policy");
    expect(readme).toContain("Default smoke runs are output-free");
    expect(readme).toContain("npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed");
    expect(readme).toContain("For release or dogfood evidence capture");
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
    const activePlan = readFileSync(activePlanPath, "utf8");
    const combined = [readme, workflow, internalAlpha, activePlan].join("\n");

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

  it("keeps the active plan focused on current code-health cleanup", () => {
    const activePlan = readFileSync(activePlanPath, "utf8");

    expect(activePlan).toContain("# skfiy Code Health Cleanup Plan");
    expect(activePlan).toContain("For agentic workers");
    expect(activePlan).toContain("previous long-form implementation log");
    expect(activePlan).toContain("including the 2026-06-23 browser/dashboard plan");
    expect(activePlan).toContain("was retired");
    expect(activePlan).toContain("Slim The CLI Command Surface");
    expect(activePlan).toContain("Finish Chrome Extension Background Test Diet");
    expect(activePlan).toContain("Extract Pure Logic From Main And Renderer");
    expect(activePlan).toContain("Refresh Product Readiness After Cleanup");
    expect(activePlan).toContain("Codex");
    expect(activePlan).toContain("Claude Code");
    expect(activePlan).toContain("bounded Hermes (`hermes`)");
    expect(activePlan).toContain("Computer Use");
    expect(activePlan).toContain("Chrome extension");
    expect(activePlan).toContain("Dashboard");
    expect(activePlan).toContain("dist/skfiy.app");
    expect(activePlan).toContain("dist/skfiy");
    expect(activePlan).not.toContain("smoke:voice");
    expect(activePlan).not.toContain("native-macos voice");
  });

  it("documents panic stop behavior evidence in alpha and report instructions", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(path.join(process.cwd(), "docs", "development-workflow.md"), "utf8");
    const alphaBuild = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const activePlan = readFileSync(activePlanPath, "utf8");
    const issueTemplate = readFileSync(
      path.join(process.cwd(), ".github", "ISSUE_TEMPLATE", "skfiy-dogfood.yml"),
      "utf8"
    );

    const combined = [readme, workflow, alphaBuild, activePlan, issueTemplate].join("\n");

    expect(combined).toContain("stopTurnBehavior");
    expect(combined).toContain("Task stopped");
  });
});
