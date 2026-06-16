#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

export const REQUIRED_DOGFOOD_WORKFLOWS = [
  "coding-terminal",
  "screenshot-inspection",
  "finder-file",
  "browser-fallback"
];

const REQUIRED_ARTIFACT_FIELDS = [
  "uiSmokeArtifactPath",
  "ghosttySmokeArtifactPath",
  "chromeSmokeArtifactPath",
  "finderSmokeArtifactPath",
  "voiceSmokeArtifactPath"
];

const REQUIRED_PERMISSION_KEYS = [
  "screenRecording",
  "accessibility",
  "microphone",
  "speechRecognition"
];

const ACCEPTED_REPORT_RESULTS = new Set([
  "passed",
  "blocked",
  "needs-user-confirmation",
  "no-transcript",
  "sensitive-paused"
]);

const BLOCKING_PERMISSION_STATES = new Set([
  "denied",
  "not-determined",
  "blocked",
  "unavailable"
]);

const ACCEPTED_DOGFOOD_LABEL = "dogfood:accepted";
const DOGFOOD_WORKFLOW_LABEL_PREFIX = "workflow:";

export function createDefaultDogfoodCohortOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    cohortPath: undefined,
    summaryPath: undefined,
    rootDir,
    help: false
  };
}

export function parseDogfoodCohortArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--cohort":
        options.cohortPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--summary":
        options.summaryPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function verifyDogfoodCohort(options, io = createDefaultIo()) {
  const cohortPath = await resolveCohortPath(options, io);
  const checks = [];
  const cohort = await readCohortJson(cohortPath, io, checks);
  const reports = Array.isArray(cohort?.reports) ? cohort.reports : [];
  const cohortManifestPath = typeof cohort?.manifestPath === "string" ? cohort.manifestPath : undefined;

  check(checks, "cohort.schemaVersion", cohort?.schemaVersion === 1, "cohort schemaVersion must be 1");
  check(checks, "cohort.reports", reports.length > 0, "cohort reports must be a non-empty array");
  check(
    checks,
    "cohort.manifestPath",
    hasSharedCohortManifestPath(cohortManifestPath, reports),
    "cohort manifestPath must be an absolute alpha manifest path shared by all reports"
  );

  const testerIds = collectDistinctTesterIds(reports);
  check(
    checks,
    "cohort.distinctTesters",
    testerIds.size >= 3 && testerIds.size <= 5,
    "cohort must include 3-5 distinct testerId values"
  );

  const eligibleReports = reports.filter((report) =>
    isWorkflowCoverageEligibleReport(report, cohortManifestPath)
  );
  const requiredWorkflowCoverage = Object.fromEntries(
    REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => [
      workflow,
      eligibleReports.some((report) =>
        Array.isArray(report?.workflows) && report.workflows.includes(workflow)
      )
    ])
  );

  for (const workflow of REQUIRED_DOGFOOD_WORKFLOWS) {
    check(
      checks,
      `cohort.workflowCoverage.${workflow}`,
      requiredWorkflowCoverage[workflow] === true,
      `cohort must include at least one report for ${workflow}`
    );
  }

  for (const [index, report] of reports.entries()) {
    verifyReport(report, index, cohortManifestPath, checks);
  }

  const errors = checks
    .filter((item) => !item.ok)
    .map((item) => `${item.id}: ${item.message}`);

  const result = {
    result: errors.length === 0 ? "passed" : "failed",
    cohortPath,
    summaryPath: typeof options.summaryPath === "string" ? options.summaryPath : undefined,
    errors,
    summary: createCohortSummary(reports, testerIds, requiredWorkflowCoverage),
    checks
  };

  if (typeof options.summaryPath === "string") {
    const markdown = createDogfoodCohortMarkdown({
      result,
      reports,
      requiredWorkflowCoverage,
      testerIds
    });
    await io.writeText(options.summaryPath, markdown);
  }

  return result;
}

export function createDogfoodCohortHelpText() {
  return [
    "Usage: npm run dogfood:cohort -- --cohort <path> [--summary <markdown-path>]",
    "",
    "Verifies a skfiy internal dogfood cohort report.",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`),
    "",
    "Each report must include testerId, manifestPath, appLaunchViaOpen=true, runnerHasTmux=false,",
    "permissionStates for Screen Recording, Accessibility, Microphone, and Speech Recognition,",
    "UI/Ghostty/Chrome/Finder/voice smoke artifact paths from the packaged app,",
    "source.issueUrl/source.collectedAt linking back to an accepted GitHub dogfood issue,",
    "artifactSource=github-issue-smoke-artifacts, and issue alpha manifest/zip/commit identity",
    "matching the report manifestPath and commitSha.",
    "Workflow coverage counts only reports that satisfy these report-level gates.",
    "",
    "Use --summary to write a short Markdown readiness report for maintainers."
  ].join("\n");
}

export function createDogfoodCohortMarkdown({
  result,
  reports,
  requiredWorkflowCoverage,
  testerIds
}) {
  const missingWorkflows = REQUIRED_DOGFOOD_WORKFLOWS.filter((workflow) =>
    requiredWorkflowCoverage[workflow] !== true
  );
  const lines = [
    "# skfiy dogfood cohort summary",
    "",
    `Result: ${result.result}`,
    `Cohort: ${result.cohortPath}`,
    `Distinct testers: ${testerIds.size}/3-5`,
    `Total reports: ${reports.length}`,
    `Passed reports: ${result.summary.passedReports}`,
    `Permission-blocked reports: ${result.summary.permissionBlockedReports}`,
    "",
    "## Workflow Coverage",
    ""
  ];

  for (const workflow of REQUIRED_DOGFOOD_WORKFLOWS) {
    lines.push(`- ${workflow}: ${requiredWorkflowCoverage[workflow] === true ? "covered" : "missing"}`);
  }

  if (missingWorkflows.length > 0) {
    lines.push("", "## Missing Workflows", "");
    for (const workflow of missingWorkflows) {
      lines.push(`- ${workflow}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("", "## Blocking Checks", "");
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }

  lines.push(
    "",
    "## Reports",
    "",
    "| testerId | result | workflows | permission-blocked | issue |",
    "| --- | --- | --- | --- | --- |"
  );

  for (const report of reports) {
    const testerId = typeof report?.testerId === "string" ? report.testerId : "unknown";
    const reportResult = typeof report?.result === "string" ? report.result : "unknown";
    const workflows = Array.isArray(report?.workflows) && report.workflows.length > 0
      ? report.workflows.join(", ")
      : "none";
    const issueUrl = typeof report?.source?.issueUrl === "string"
      ? report.source.issueUrl
      : "missing";
    lines.push(
      `| ${escapeMarkdownTableCell(testerId)} | ${escapeMarkdownTableCell(reportResult)} | ${escapeMarkdownTableCell(workflows)} | ${hasBlockingPermissionState(report?.permissionStates) ? "yes" : "no"} | ${escapeMarkdownTableCell(issueUrl)} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

function verifyReport(report, index, cohortManifestPath, checks) {
  const checkId = createReportCheckId(report, index);
  const reportManifestPath = typeof report?.manifestPath === "string" ? report.manifestPath : undefined;

  check(
    checks,
    `${checkId}.testerId`,
    typeof report?.testerId === "string" && report.testerId.trim().length > 0,
    "report testerId is required"
  );
  check(
    checks,
    `${checkId}.result`,
    ACCEPTED_REPORT_RESULTS.has(report?.result),
    "report result must be passed, blocked, needs-user-confirmation, no-transcript, or sensitive-paused"
  );
  check(
    checks,
    `${checkId}.manifestPath`,
    typeof reportManifestPath === "string"
      && path.isAbsolute(reportManifestPath)
      && (
        typeof cohortManifestPath !== "string"
        || path.resolve(reportManifestPath) === path.resolve(cohortManifestPath)
      ),
    "report manifestPath must be an absolute alpha manifest path matching the cohort manifestPath"
  );
  check(
    checks,
    `${checkId}.appLaunchViaOpen`,
    report?.appLaunchViaOpen === true,
    "report must launch dist/skfiy.app through LaunchServices/open"
  );
  check(
    checks,
    `${checkId}.runnerHasTmux`,
    report?.runnerHasTmux === false,
    "report must not be captured from tmux or a detached backend shell"
  );
  check(
    checks,
    `${checkId}.workflows`,
    hasKnownWorkflow(report?.workflows),
    "report workflows must include at least one required dogfood workflow"
  );
  check(
    checks,
    `${checkId}.artifacts`,
    hasRequiredArtifactPaths(report?.artifacts),
    "report artifacts must include absolute UI, Ghostty, Chrome, Finder, and voice smoke artifact paths"
  );
  check(
    checks,
    `${checkId}.permissionStates`,
    hasRequiredPermissionStates(report?.permissionStates),
    "report permissionStates must include Screen Recording, Accessibility, Microphone, and Speech Recognition states"
  );
  check(
    checks,
    `${checkId}.source`,
    hasRequiredSource(report?.source, report?.workflows, {
      commitSha: report?.commitSha,
      manifestPath: reportManifestPath
    }),
    "report source must include type=github-issue, source.issueUrl, collectedAt, generatedBy=dogfood:report, artifactSource=github-issue-smoke-artifacts, issue alpha manifest/zip/commit identity, dogfood:accepted, and matching workflow:* issue labels"
  );
}

function createCohortSummary(reports, testerIds, requiredWorkflowCoverage) {
  return {
    totalReports: reports.length,
    distinctTesters: testerIds.size,
    passedReports: reports.filter((report) => report?.result === "passed").length,
    blockedReports: reports.filter((report) => report?.result === "blocked").length,
    permissionBlockedReports: reports.filter((report) =>
      hasBlockingPermissionState(report?.permissionStates)
    ).length,
    sourceLinkedReports: reports.filter((report) =>
      hasRequiredSource(report?.source, report?.workflows, {
        commitSha: report?.commitSha,
        manifestPath: report?.manifestPath
      })
    ).length,
    eligibleWorkflowCoverage: requiredWorkflowCoverage,
    requiredWorkflowCoverage
  };
}

function isWorkflowCoverageEligibleReport(report, cohortManifestPath) {
  const reportManifestPath = typeof report?.manifestPath === "string" ? report.manifestPath : undefined;

  return typeof report?.testerId === "string"
    && report.testerId.trim().length > 0
    && ACCEPTED_REPORT_RESULTS.has(report?.result)
    && typeof reportManifestPath === "string"
    && path.isAbsolute(reportManifestPath)
    && (
      typeof cohortManifestPath !== "string"
      || path.resolve(reportManifestPath) === path.resolve(cohortManifestPath)
    )
    && report?.appLaunchViaOpen === true
    && report?.runnerHasTmux === false
    && hasKnownWorkflow(report?.workflows)
    && hasRequiredArtifactPaths(report?.artifacts)
    && hasRequiredPermissionStates(report?.permissionStates)
    && hasRequiredSource(report?.source, report?.workflows, {
      commitSha: report?.commitSha,
      manifestPath: reportManifestPath
    });
}

function collectDistinctTesterIds(reports) {
  return new Set(
    reports
      .map((report) => typeof report?.testerId === "string" ? report.testerId.trim() : "")
      .filter(Boolean)
  );
}

function hasSharedCohortManifestPath(cohortManifestPath, reports) {
  return typeof cohortManifestPath === "string"
    && path.isAbsolute(cohortManifestPath)
    && reports.every((report) =>
      typeof report?.manifestPath === "string"
        && path.isAbsolute(report.manifestPath)
        && path.resolve(report.manifestPath) === path.resolve(cohortManifestPath)
    );
}

function createReportCheckId(report, index) {
  if (typeof report?.testerId === "string" && report.testerId.trim().length > 0) {
    return `report.${sanitizeCheckId(report.testerId)}`;
  }

  return `report.${index + 1}`;
}

function sanitizeCheckId(value) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function hasKnownWorkflow(value) {
  return Array.isArray(value)
    && value.some((workflow) => REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow));
}

function hasRequiredArtifactPaths(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return REQUIRED_ARTIFACT_FIELDS.every((field) =>
    typeof value[field] === "string" && path.isAbsolute(value[field])
  );
}

function hasRequiredPermissionStates(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return REQUIRED_PERMISSION_KEYS.every((key) =>
    typeof value[key]?.state === "string" && value[key].state.length > 0
  );
}

function hasRequiredSource(value, workflows, reportIdentity = {}) {
  return Boolean(value)
    && typeof value === "object"
    && value.type === "github-issue"
    && typeof value.issueUrl === "string"
    && isAcceptedIssueUrl(value.issueUrl)
    && hasAcceptedIssueLabels(value.issueLabels, workflows)
    && typeof value.collectedAt === "string"
    && !Number.isNaN(Date.parse(value.collectedAt))
    && value.generatedBy === "dogfood:report"
    && value.artifactSource === "github-issue-smoke-artifacts"
    && isNonEmptyString(value.issueAlphaManifest)
    && isNonEmptyString(value.issueAlphaZip)
    && path.basename(value.issueAlphaZip).endsWith(".zip")
    && isNonEmptyString(value.issueCommitSha)
    && isNonEmptyString(reportIdentity.commitSha)
    && value.issueCommitSha.trim() === reportIdentity.commitSha.trim()
    && matchesIssuePathOrBasename(value.issueAlphaManifest, reportIdentity.manifestPath);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function matchesIssuePathOrBasename(issueValue, expectedPath) {
  return isNonEmptyString(issueValue)
    && isNonEmptyString(expectedPath)
    && (
      issueValue.trim() === expectedPath.trim()
      || path.basename(issueValue.trim()) === path.basename(expectedPath.trim())
    );
}

function hasAcceptedIssueLabels(issueLabels, workflows) {
  if (!Array.isArray(issueLabels)) {
    return false;
  }

  const labels = issueLabels
    .map((label) => typeof label === "string" ? label.trim() : "")
    .filter(Boolean);
  if (!labels.includes(ACCEPTED_DOGFOOD_LABEL)) {
    return false;
  }

  const expectedWorkflowLabels = Array.isArray(workflows)
    ? workflows
      .filter((workflow) => REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow))
      .map((workflow) => `${DOGFOOD_WORKFLOW_LABEL_PREFIX}${workflow}`)
    : [];

  if (expectedWorkflowLabels.length === 0) {
    return false;
  }

  const expectedWorkflowLabelSet = new Set(expectedWorkflowLabels);
  const hasEveryWorkflowLabel = expectedWorkflowLabels.every((label) => labels.includes(label));
  const hasUnexpectedWorkflowLabel = labels.some((label) =>
    label.startsWith(DOGFOOD_WORKFLOW_LABEL_PREFIX) && !expectedWorkflowLabelSet.has(label)
  );

  return hasEveryWorkflowLabel && !hasUnexpectedWorkflowLabel;
}

function isAcceptedIssueUrl(value) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:")
      && url.pathname.includes("/issues/");
  } catch {
    return false;
  }
}

function hasBlockingPermissionState(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).some((permission) =>
    typeof permission?.state === "string"
      && BLOCKING_PERMISSION_STATES.has(permission.state)
  );
}

async function readCohortJson(cohortPath, io, checks) {
  try {
    return await io.readJson(cohortPath);
  } catch (error) {
    check(
      checks,
      "cohort.readJson",
      false,
      error instanceof Error ? error.message : "could not read cohort report"
    );
    return undefined;
  }
}

async function resolveCohortPath(options, io) {
  if (typeof options.cohortPath === "string") {
    return options.cohortPath;
  }

  if (typeof io.findLatestCohort === "function") {
    const found = await io.findLatestCohort(options.rootDir ?? DEFAULT_ROOT_DIR);
    if (found) {
      return found;
    }
  }

  throw new Error("Missing --cohort <path>.");
}

function createDefaultIo() {
  return {
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async writeText(filePath, value) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, value);
    }
  };
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function check(checks, id, ok, message) {
  checks.push({ id, ok: Boolean(ok), message });
}

function escapeMarkdownTableCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function runCli() {
  const defaults = createDefaultDogfoodCohortOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodCohortArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodCohortHelpText());
    return;
  }

  const result = await verifyDogfoodCohort(options);
  console.log(JSON.stringify(result, null, 2));

  if (result.result !== "passed") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
