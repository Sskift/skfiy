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
  it("does not keep completed implementation plan files as active repo docs", () => {
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

  it("keeps latest published alpha release evidence internally consistent", () => {
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
    expect(evidence.smokeArtifacts.voice).toContain(shortSha);
    expect(evidence.smokeArtifacts.moneyRun).toContain(shortSha);
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
    const internalAlpha = readFileSync(path.join(process.cwd(), "docs", "internal-alpha-build.md"), "utf8");
    const longPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-16-voice-computer-control-long-plan.md"),
      "utf8"
    );
    const readmeText = readme.replace(/\s+/g, " ");
    const workflowText = workflow.replace(/\s+/g, " ");
    const internalAlphaText = internalAlpha.replace(/\s+/g, " ");

    expect(readme).toContain("npm run dogfood:status -- \\");
    expect(readme).toContain("Recommended Tester Assignments");
    expect(readme).toContain("tracking issue body includes a `Recommended Tester Assignments` section");
    expect(readme).toContain("`dogfood:prepare-alpha` can infer `--workflows` from the tracking issue");
    expect(readme).toContain("tracking issue body includes a `Desktop Session Preflight` section");
    expect(readme).toContain("`dogfood:status` validates that the tracking issue body still includes `Desktop Session Preflight`");
    expect(workflow).toContain("The generated tracking issue body includes a `Desktop Session Preflight` section");
    expect(workflow).toContain("It also validates that the tracking issue body still includes `Desktop Session Preflight`");
    expect(longPlan).toContain("tracking issue body now includes `Desktop Session Preflight`");
    expect(longPlan).toContain("dogfood status now validates tracking issue body `Desktop Session Preflight`");
    expect(readmeText).toContain("stale `docs/release-evidence/latest-alpha.json` now blocks collect readiness");
    expect(workflowText).toContain("stale `docs/release-evidence/latest-alpha.json` blocks `dogfood:status` collect readiness");
    expect(longPlan).toContain("stale `docs/release-evidence/latest-alpha.json` now blocks `dogfood:status` collect readiness");
    expect(readmeText).toContain("When the downloaded manifest and prepared app already exist locally, `dogfood:status` replaces tester placeholders with the prepared paths and surfaces direct `dogfood:tester` next actions.");
    expect(workflowText).toContain("When local prepared alpha assets already exist, `dogfood:status` replaces the tester command placeholders with those manifest and app paths and emits direct `dogfood:tester` next actions.");
    expect(workflowText).toContain("`dogfood:status` writes a `Permission Evidence` section");
    expect(workflowText).toContain("app-scoped `smoke:ui` `permissionDiagnostics.active` source");
    expect(workflowText).toContain("direct-helper Speech Recognition readings from `smoke:desktop-session` are diagnostic only");
    expect(workflowText).toContain("current `skfiy-alpha-<commit>` assignment packet comment with `App Bundle Preflight`, `Desktop Session Preflight`, `Permission Preflight`, and `Evidence Preview Gate`");
    expect(internalAlphaText).toContain("current alpha assignment packet comments with `App Bundle Preflight`, `Desktop Session Preflight`, `Permission Preflight`, and `Evidence Preview Gate`");
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

  it("documents the dogfood tester code-signature app bundle preflight", () => {
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
      expect(document).toContain("dogfood:tester app bundle preflight");
      expect(document).toContain("codesign --verify --deep --strict");
      expect(document).toContain('designated => identifier "com.sskift.skfiy"');
    }
  });

  it("keeps the long plan recommended next move focused on app-agnostic product gates", () => {
    const longPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-16-voice-computer-control-long-plan.md"),
      "utf8"
    );
    const recommendedNextMove = longPlan.slice(longPlan.indexOf("## Recommended Next Move"));
    const recommendedNextMoveText = recommendedNextMove.toLowerCase();

    expect(recommendedNextMoveText).toContain("write the chrome extension architecture note first");
    expect(recommendedNextMoveText).toContain("field-prove the packaged cli, dashboard, and codex plugin install path");
    expect(recommendedNextMoveText).toContain("keep expanding the dashboard/control ui as a local audit surface");
    expect(recommendedNextMoveText).toContain("product-path native speech turn after speech recognition permission is granted");
    expect(recommendedNextMoveText).toContain("rerun ghostty, finder, chrome extension, dashboard, codex plugin, and voice product smokes with `--require-passed` after `smoke:desktop-session` passes");
    expect(recommendedNextMoveText).toContain("collect 3-5 accepted real tester reports");
    expect(recommendedNextMoveText).toContain("run the long-horizon `money-run` supervision field task after release gates pass");
    expect(recommendedNextMove).not.toContain("Implement dedicated Ghostty session.");
    expect(recommendedNextMove).not.toContain("Build minimal observe-plan-act-verify loop with replay logs.");
  });

  it("records Codex plugin, dashboard, and binary CLI planning requirements in the long plan", () => {
    const longPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-16-voice-computer-control-long-plan.md"),
      "utf8"
    );
    const dashboardPlan = readFileSync(
      path.join(process.cwd(), "docs", "research", "2026-06-20-dashboard-cli-plan.md"),
      "utf8"
    );

    expect(longPlan).toContain("### 8. Codex Plugin Adapter");
    expect(longPlan).toContain("Codex loads installed plugins from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`");
    expect(longPlan).toContain("build a `skfiy` Codex plugin scaffold only after the binary runtime is stable");
    expect(longPlan).toContain("skfiy smoke <ui|desktop-session|ghostty|chrome|dashboard|codex-plugin|finder|voice|money-run>");
    expect(longPlan).toContain("plugin-installed MCP smoke can start the packaged `skfiy` binary");
    expect(longPlan).toContain("OpenClaw-style dashboard");
    expect(longPlan).toContain("single compiled product entry");
    expect(longPlan).toContain("skfiy.app`, embedded `skfiy-helper`, and `skfiy` CLI");
    expect(dashboardPlan).toContain("OpenClaw Reference Shape");
    expect(dashboardPlan).toContain("Control UI is an admin surface");
    expect(dashboardPlan).toContain("Binary and CLI Product Contract");
    expect(dashboardPlan).toContain("Codex Plugin Install and Marketplace Notes");
    expect(dashboardPlan).toContain("smoke:codex-plugin");
    expect(dashboardPlan).toContain("MCP initialize response should include short safety instructions");
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
