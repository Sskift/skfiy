import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const activePlanPath = path.join(
  process.cwd(),
  "docs",
  "superpowers",
  "plans",
  "2026-07-07-code-health-cleanup.md"
);
const activePlanReference = "docs/superpowers/plans/2026-07-07-code-health-cleanup.md";
const activePlanDate = Date.parse("2026-07-07T00:00:00.000Z");

const repoMarkdownSkipDirs = new Set([
  ".git",
  ".skfiy-alpha",
  ".skfiy-cli-smoke",
  ".skfiy-dogfood",
  ".skfiy-smoke",
  ".build",
  "dist",
  "node_modules"
]);
const repositoryTextFileExtensions = new Set([
  ".css",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);

function collectMarkdownDocs(rootPath: string): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownDocs(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function collectRepositoryMarkdownDocs(rootPath: string): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    if (repoMarkdownSkipDirs.has(entry.name)) {
      return [];
    }

    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return collectRepositoryMarkdownDocs(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function collectRepositoryDirectories(rootPath: string): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || repoMarkdownSkipDirs.has(entry.name)) {
      return [];
    }

    const entryPath = path.join(rootPath, entry.name);
    return [entryPath, ...collectRepositoryDirectories(entryPath)];
  });
}

function collectRepositoryTextFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    if (repoMarkdownSkipDirs.has(entry.name)) {
      return [];
    }

    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return collectRepositoryTextFiles(entryPath);
    }

    return entry.isFile() && repositoryTextFileExtensions.has(path.extname(entry.name).toLowerCase())
      ? [entryPath]
      : [];
  });
}

function findMarkdownBasenameDateStamp(docPath: string): string | null {
  return /(?:^|[-_])(\d{4}-\d{2}-\d{2})(?:[-_]|$)/.exec(path.basename(docPath))?.[1] ?? null;
}

describe("implementation plan status docs", () => {
  it("keeps exactly one active implementation plan in repo docs", () => {
    const planDir = path.join(process.cwd(), "docs", "superpowers", "plans");
    const activePlanFiles = existsSync(planDir)
      ? readdirSync(planDir).filter((entry) => entry.endsWith(".md"))
      : [];

    expect(activePlanFiles).toEqual(["2026-07-07-code-health-cleanup.md"]);
  });

  it("keeps retired plan-like markdown files out of docs", () => {
    const activePlanReference = "docs/superpowers/plans/2026-07-07-code-health-cleanup.md";
    const docsRoot = path.join(process.cwd(), "docs");
    const markdownDocs = collectMarkdownDocs(docsRoot).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const retiredPlanLikeDocs = markdownDocs.filter((docPath) => {
      if (docPath === activePlanReference) {
        return false;
      }

      const basename = path.basename(docPath);
      return /(^|[-_.])plans?($|[-_.])/i.test(basename)
        || /(^|[-_.])planning($|[-_.])/i.test(basename)
        || /(^|\/)plans($|\/)/i.test(docPath);
    });

    expect(retiredPlanLikeDocs).toEqual([]);
  });

  it("keeps dated research and implementation logs out of docs", () => {
    const docsRoot = path.join(process.cwd(), "docs");
    const markdownDocs = collectMarkdownDocs(docsRoot).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const datedResearchOrLogs = markdownDocs.filter((docPath) => (
      /(^|\/)research\//i.test(docPath)
      || /(^|[-_.])(research|implementation-log|work-log|handoff)($|[-_.])/i.test(path.basename(docPath))
    ));

    expect(datedResearchOrLogs).toEqual([]);
  });

  it("keeps dated non-decision markdown out of docs", () => {
    const activePlanReference = "docs/superpowers/plans/2026-07-07-code-health-cleanup.md";
    const docsRoot = path.join(process.cwd(), "docs");
    const markdownDocs = collectMarkdownDocs(docsRoot).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const datedNonDecisionDocs = markdownDocs.filter((docPath) => {
      if (docPath === activePlanReference || docPath.startsWith("docs/decisions/")) {
        return false;
      }

      return /^\d{4}-\d{2}-\d{2}-/.test(path.basename(docPath));
    });

    expect(datedNonDecisionDocs).toEqual([]);
  });

  it("keeps stale dated plan material out of repository markdown", () => {
    const markdownDocs = collectRepositoryMarkdownDocs(process.cwd()).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const staleDatedPlanDocs = markdownDocs.filter((docPath) => {
      if (docPath === activePlanReference || docPath.startsWith("docs/decisions/")) {
        return false;
      }

      const basename = path.basename(docPath);
      const hasDateStamp = findMarkdownBasenameDateStamp(docPath) !== null;
      const looksLikePlanningMaterial = /(^|[-_.])(plans?|planning|research|implementation-log|work-log|handoff|checklist|backlog)($|[-_.])/i.test(basename)
        || /(^|\/)(plans?|research|handoffs?|checklists?|backlogs?)($|\/)/i.test(docPath);

      return hasDateStamp && looksLikePlanningMaterial;
    });

    expect(staleDatedPlanDocs).toEqual([]);
  });

  it("keeps inactive plan-like markdown out of the repository", () => {
    const markdownDocs = collectRepositoryMarkdownDocs(process.cwd()).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const inactivePlanLikeDocs = markdownDocs.filter((docPath) => {
      if (docPath === activePlanReference || docPath.startsWith("docs/decisions/")) {
        return false;
      }

      const basename = path.basename(docPath);
      return /(^|[-_.])(plans?|planning|research|implementation-log|work-log|handoff|checklist|backlog|cleanup)($|[-_.])/i.test(basename)
        || /(^|\/)(plans?|research|handoffs?|checklists?|backlogs?|archives?|parking)($|\/)/i.test(docPath);
    });

    expect(inactivePlanLikeDocs).toEqual([]);
  });

  it("keeps retired planning container directories out of docs", () => {
    const docsRoot = path.join(process.cwd(), "docs");
    const docsDirectories = collectRepositoryDirectories(docsRoot).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const retiredPlanningContainers = docsDirectories.filter((docPath) => (
      /(^|\/)(research|release-evidence|handoffs?|checklists?|backlogs?|archives?|parking)($|\/)/i.test(docPath)
    ));

    expect(retiredPlanningContainers).toEqual([]);
  });

  it("keeps pre-active-plan dated markdown out of repository docs except ADRs", () => {
    const markdownDocs = collectRepositoryMarkdownDocs(process.cwd()).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const staleDatedDocs = markdownDocs.filter((docPath) => {
      if (docPath === activePlanReference || docPath.startsWith("docs/decisions/")) {
        return false;
      }

      const dateStamp = findMarkdownBasenameDateStamp(docPath);
      return dateStamp ? Date.parse(`${dateStamp}T00:00:00.000Z`) < activePlanDate : false;
    });

    expect(staleDatedDocs).toEqual([]);
  });

  it("keeps pre-active-plan date anchors out of non-ADR repository markdown", () => {
    const markdownDocs = collectRepositoryMarkdownDocs(process.cwd()).map((docPath) => (
      path.relative(process.cwd(), docPath).split(path.sep).join("/")
    ));
    const staleDateAnchors = markdownDocs.flatMap((docPath) => {
      if (docPath.startsWith("docs/decisions/")) {
        return [];
      }

      const contents = readFileSync(path.join(process.cwd(), docPath), "utf8");
      return [...contents.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)]
        .map((match) => match[0])
        .filter((dateStamp) => Date.parse(`${dateStamp}T00:00:00.000Z`) < activePlanDate)
        .map((dateStamp) => `${docPath}: ${dateStamp}`);
    });

    expect(staleDateAnchors).toEqual([]);
  });

  it("keeps decision records from becoming retired implementation plans", () => {
    const decisionsRoot = path.join(process.cwd(), "docs", "decisions");
    const decisionDocs = collectMarkdownDocs(decisionsRoot);
    const planLikeDecisionDocs = decisionDocs.filter((docPath) => {
      const contents = readFileSync(docPath, "utf8");
      return /^##\s+(?:Active Scope|Next Work Order|Execution Rules|Handoff Requirements|Audit Queue|Current Cleanup Evidence)\b/im.test(contents)
        || /^##\s+Task\s+\d+\b/im.test(contents)
        || /^\s*Focused verification:/im.test(contents)
        || /^\s*Acceptance:/im.test(contents)
        || /^\s*Status:\s+(?:pending|in progress|complete)\b/im.test(contents)
        || /^\s*-\s+\[[ x]\]\s+/im.test(contents)
        || /docs\/superpowers\/plans\//i.test(contents);
    }).map((docPath) => path.relative(process.cwd(), docPath).split(path.sep).join("/"));

    expect(planLikeDecisionDocs).toEqual([]);
  });

  it("keeps canonical docs from carrying stale cleanup queues", () => {
    const canonicalDocPaths = [
      "README.md",
      "docs/README.md",
      "docs/development-workflow.md",
      "docs/internal-alpha-build.md",
      "docs/chrome-extension-setup.md",
      "docs/product-readiness-matrix.md"
    ];
    const staleCleanupPatterns = [
      /^##\s+(?:Audit Queue|Current Cleanup Evidence|Subagent Convergence)\b/im,
      /^\s*Cleanup baseline commit:/im,
      /^\s*Latest local alpha evidence recorded during this cleanup:/im,
      /\bcurrent supervisor queue\b/i,
      /\bcleanup batch\b/i,
      /\bsubagent audits converged\b/i,
      /\bactive handoff\b/i
    ];
    const staleDocs = canonicalDocPaths.filter((docPath) => {
      const contents = readFileSync(path.join(process.cwd(), docPath), "utf8");
      return staleCleanupPatterns.some((pattern) => pattern.test(contents));
    });

    expect(staleDocs).toEqual([]);
  });

  it("keeps repository markdown pointed at the current active plan path only", () => {
    const activePlanReference = "docs/superpowers/plans/2026-07-07-code-health-cleanup.md";
    const planReferencePattern = /docs\/superpowers\/plans\/[^\s`'"),]+\.md/g;
    const workflowDocPaths = collectRepositoryMarkdownDocs(process.cwd());

    for (const docPath of workflowDocPaths) {
      const contents = readFileSync(docPath, "utf8");
      const stalePlanReferences = [...contents.matchAll(planReferencePattern)]
        .map((match) => match[0])
        .filter((reference) => reference !== activePlanReference);

      expect(stalePlanReferences).toEqual([]);
    }
  });

  it("keeps repository workflow files pointed at the current active plan path only", () => {
    const planReferencePattern = /docs\/superpowers\/plans\/[^\s`'"),]+\.md/g;
    const workflowFilePaths = collectRepositoryTextFiles(process.cwd());
    const stalePlanReferences = workflowFilePaths.flatMap((filePath) => {
      const contents = readFileSync(filePath, "utf8");
      return [...contents.matchAll(planReferencePattern)]
        .map((match) => match[0])
        .filter((reference) => reference !== activePlanReference)
        .map((reference) => `${path.relative(process.cwd(), filePath).split(path.sep).join("/")}: ${reference}`);
    });

    expect(stalePlanReferences).toEqual([]);
  });

  it("keeps AGENTS pointed at the current active plan", () => {
    const agents = readFileSync(path.join(process.cwd(), "AGENTS.md"), "utf8");

    expect(agents).toContain("docs/superpowers/plans/2026-07-07-code-health-cleanup.md");
    expect(agents).toContain("Historical implementation material lives in git history only");
    expect(agents).toContain("Retired dated plans must not be restored");
    expect(agents).toContain("must not be restored");
    expect(agents).toContain("not repo docs or");
    expect(agents).toContain("exactly one newer active plan");
    expect(agents).not.toContain("old 20");
  });

  it("documents output-free default smoke runs in README instead of retired plan docs", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("## Smoke Policy");
    expect(readme).toContain("Default smoke runs are output-free");
    expect(readme).toContain("npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed");
    expect(readme).toContain("For release or dogfood evidence capture");
    expect(readme).not.toContain("skfiy-alpha-2e292e9");
  });

  it("keeps product readiness default smoke examples output-free", () => {
    const readiness = readFileSync(
      path.join(process.cwd(), "docs", "product-readiness-matrix.md"),
      "utf8"
    );

    expect(readiness).toContain("For default\ndevelopment verification, run packaged smokes without `--output`");
    expect(readiness).toContain("npm run smoke:dashboard -- --cli dist/skfiy");
    expect(readiness).toContain("Add commit-scoped output paths only for explicit release, dogfood, or debugging");
    expect(readiness).not.toContain("--output .skfiy-smoke");
    expect(readiness).not.toContain("active handoff");
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

  it("keeps the active plan focused on current code health work", () => {
    const activePlan = readFileSync(activePlanPath, "utf8");

    expect(activePlan).toContain("# skfiy Active Code Health Plan");
    expect(activePlan).toContain("For agentic workers");
    expect(activePlan).toContain("only active implementation plan");
    expect(activePlan).toContain("Retired dated implementation plans");
    expect(activePlan).toContain("must stay out of repo docs");
    expect(activePlan).toContain("zero retired dated implementation Markdown");
    expect(activePlan).toContain("ADR-only context");
    expect(activePlan).toContain("Guard coverage must stay structural");
    expect(activePlan).toContain("Task 1: React Dashboard Operator Evidence");
    expect(activePlan).toContain("Task 2: Dashboard Advanced Control Migration");
    expect(activePlan).toContain("Task 3: Route State Semantics");
    expect(activePlan).toContain("Task 4: Code-Health Slimming");
    expect(activePlan).toContain("Task 5: Product Readiness Gates");
    expect(activePlan).toContain("Background Agent");
    expect(activePlan).toContain("Computer Use Planner");
    expect(activePlan).toContain("Computer Use");
    expect(activePlan).toContain("Chrome extension");
    expect(activePlan).toContain("Dashboard");
    expect(activePlan).toContain("/api/operator-evidence");
    expect(activePlan).toContain("dist/skfiy.app");
    expect(activePlan).toContain("dist/skfiy");
    expect(activePlan).not.toContain("Completed in this pass");
    expect(activePlan).not.toContain("smoke:voice");
    expect(activePlan).not.toContain("native-macos voice");
  });

  it("keeps retired plan date anchors out of the active plan", () => {
    const activePlan = readFileSync(activePlanPath, "utf8");
    const staleDateAnchors = [...activePlan.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)]
      .map((match) => match[0])
      .filter((dateStamp) => Date.parse(`${dateStamp}T00:00:00.000Z`) < activePlanDate);

    expect(staleDateAnchors).toEqual([]);
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
