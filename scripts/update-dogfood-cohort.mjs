#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { REQUIRED_DOGFOOD_WORKFLOWS } from "./verify-dogfood-cohort.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_COHORT_NAME = "internal-alpha";
const ACCEPTED_DOGFOOD_LABEL = "dogfood:accepted";
const DOGFOOD_WORKFLOW_LABEL_PREFIX = "workflow:";
const DOGFOOD_SMOKE_ARTIFACT_SECTIONS = [
  ["uiSmokeArtifactPath", "UI smoke artifact"],
  ["ghosttySmokeArtifactPath", "smoke artifact"],
  ["chromeSmokeArtifactPath", "Chrome smoke artifact"],
  ["finderSmokeArtifactPath", "Finder smoke artifact"],
  ["voiceSmokeArtifactPath", "voice smoke artifact"]
];

export function createDefaultDogfoodReportOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    reportPath: undefined,
    manifestPath: undefined,
    testerId: undefined,
    issueUrl: undefined,
    issueLabels: [],
    workflows: [],
    cohortPath: path.join(rootDir, ".skfiy-dogfood", "internal-alpha-cohort.json"),
    cohortName: DEFAULT_COHORT_NAME,
    help: false
  };
}

export function parseDogfoodReportArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--report":
        options.reportPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--tester-id":
        options.testerId = readValue(argv, index, arg);
        index += 1;
        break;
      case "--issue-url":
        options.issueUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--issue-labels":
        options.issueLabels = readLabelList(readValue(argv, index, arg));
        index += 1;
        break;
      case "--workflows":
        options.workflows = readWorkflowList(readValue(argv, index, arg));
        index += 1;
        break;
      case "--cohort":
        options.cohortPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--cohort-name":
        options.cohortName = readValue(argv, index, arg);
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

export async function updateDogfoodCohort(options, io = createDefaultIo()) {
  if (typeof options.reportPath !== "string") {
    throw new Error("Missing --report <path>.");
  }
  if (typeof options.cohortPath !== "string") {
    throw new Error("Missing --cohort <path>.");
  }

  const report = typeof options.manifestPath === "string"
    ? await createDogfoodReportFromManifest(options, io)
    : await io.readJson(options.reportPath);
  if (typeof options.manifestPath === "string") {
    await io.mkdir(path.dirname(options.reportPath), { recursive: true });
    await io.writeJson(options.reportPath, report);
  }

  const reportTesterId = readTesterId(report);
  const reportManifestPath = readManifestPath(report);
  const cohortExists = await io.exists(options.cohortPath);
  const existingCohort = cohortExists ? await io.readJson(options.cohortPath) : undefined;
  const reports = Array.isArray(existingCohort?.reports) ? [...existingCohort.reports] : [];
  const cohortManifestPath = typeof existingCohort?.manifestPath === "string"
    ? existingCohort.manifestPath
    : reportManifestPath;

  if (path.resolve(cohortManifestPath) !== path.resolve(reportManifestPath)) {
    throw new Error("Report manifestPath must match cohort manifestPath.");
  }

  const existingReportIndex = reports.findIndex((item) => readTesterId(item) === reportTesterId);
  const action = existingReportIndex >= 0 ? "replaced" : "appended";

  if (existingReportIndex >= 0) {
    reports[existingReportIndex] = report;
  } else {
    reports.push(report);
  }

  const cohort = {
    schemaVersion: 1,
    cohortName: typeof options.cohortName === "string" && options.cohortName.trim().length > 0
      ? options.cohortName
      : DEFAULT_COHORT_NAME,
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: cohortManifestPath,
    reports
  };

  await io.mkdir(path.dirname(options.cohortPath), { recursive: true });
  await io.writeJson(options.cohortPath, cohort);

  return {
    result: "updated",
    action,
    reportPath: options.reportPath,
    cohortPath: options.cohortPath,
    reportTesterId,
    summary: createCollectionSummary(reports)
  };
}

export async function createDogfoodReportFromManifest(options, io = createDefaultIo()) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.issueUrl !== "string" || options.issueUrl.trim().length === 0) {
    throw new Error("Missing --issue-url <url>.");
  }
  if (!isAcceptedIssueUrl(options.issueUrl)) {
    throw new Error("--issue-url must be an http(s) GitHub issue URL.");
  }
  const issue = await resolveAcceptedIssue(options, io);
  const testerId = resolveTesterId(options, issue);
  const workflows = resolveWorkflows(options, issue);
  const issueLabels = validateAcceptedIssueLabels(
    resolveAcceptedIssueLabels(options, issue),
    workflows
  );

  const manifest = await io.readJson(options.manifestPath);
  const issueAlphaIdentity = validateIssueAlphaIdentity(manifest, options.manifestPath, issue);
  const smokeArtifactSelection = readSmokeArtifactSelection(manifest, issue);
  const smokePaths = smokeArtifactSelection.paths;
  const smokeArtifacts = {
    ui: await io.readJson(smokePaths.uiSmokeArtifactPath),
    ghostty: await io.readJson(smokePaths.ghosttySmokeArtifactPath),
    chrome: await io.readJson(smokePaths.chromeSmokeArtifactPath),
    finder: await io.readJson(smokePaths.finderSmokeArtifactPath),
    voice: await io.readJson(smokePaths.voiceSmokeArtifactPath)
  };
  validateSmokeArtifactPaths(smokeArtifacts, smokePaths);
  const artifactResults = Object.fromEntries(
    Object.entries(smokeArtifacts).map(([key, artifact]) => [key, readSmokeResult(artifact)])
  );

  return {
    testerId,
    result: chooseReportResult(Object.values(artifactResults)),
    manifestPath: options.manifestPath,
    commitSha: typeof manifest?.commitSha === "string" ? manifest.commitSha : undefined,
    appLaunchViaOpen: Object.values(smokeArtifacts).every((artifact) => artifact?.appLaunchViaOpen === true),
    runnerHasTmux: Object.values(smokeArtifacts).some((artifact) => artifact?.runnerHasTmux === true),
    workflows,
    source: {
      type: "github-issue",
      issueUrl: options.issueUrl.trim(),
      issueLabels,
      collectedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
      generatedBy: "dogfood:report",
      artifactSource: smokeArtifactSelection.artifactSource,
      ...issueAlphaIdentity
    },
    permissionStates: readPermissionStates(smokeArtifacts),
    artifacts: smokePaths,
    artifactResults
  };
}

export function createDogfoodReportHelpText() {
  return [
    "Usage: npm run dogfood:report -- --report <path> [--cohort <path>]",
    "       npm run dogfood:report -- --manifest <alpha-manifest> --issue-url <accepted-issue-url> --report <path> [--cohort <path>] [--tester-id <id>] [--workflows <ids>] [--issue-labels <labels>]",
    "",
    "Adds or replaces one real single-user dogfood report in a cohort JSON file.",
    "With --manifest, generates the single-user report from the alpha manifest and tester issue artifacts first.",
    "Use --issue-url to link the generated report to the accepted GitHub dogfood issue.",
    "By default testerId, workflows, smoke artifact paths, and labels are read from GitHub with gh issue view.",
    "When the issue body is readable, dogfood:report requires all five issue smoke artifact paths.",
    "It also requires the issue alpha manifest, zip, and commit sha to match --manifest.",
    "Every smoke artifact JSON artifactPath must match the issue artifact path it was read from.",
    "Use --tester-id and --workflows as explicit overrides for the issue body fields.",
    "Use --issue-labels as an explicit/offline override proving dogfood:accepted plus matching workflow:* labels.",
    "This is an incremental collection helper; it does not claim dogfood completion.",
    "",
    "After collecting 3-5 distinct testers and all required workflows, run:",
    "  npm run dogfood:cohort -- --cohort .skfiy-dogfood/internal-alpha-cohort.json",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

function readManifestSmokePaths(manifest) {
  return {
    uiSmokeArtifactPath: readAbsoluteManifestPath(manifest, "uiSmokeArtifactPath"),
    ghosttySmokeArtifactPath: readAbsoluteManifestPath(manifest, "smokeArtifactPath"),
    chromeSmokeArtifactPath: readAbsoluteManifestPath(manifest, "chromeSmokeArtifactPath"),
    finderSmokeArtifactPath: readAbsoluteManifestPath(manifest, "finderSmokeArtifactPath"),
    voiceSmokeArtifactPath: readAbsoluteManifestPath(manifest, "voiceSmokeArtifactPath")
  };
}

function readSmokeArtifactSelection(manifest, issue) {
  const manifestPaths = readManifestSmokePaths(manifest);
  if (!hasIssueBody(issue)) {
    return {
      artifactSource: "alpha-manifest-smoke-artifacts",
      paths: manifestPaths
    };
  }

  return {
    artifactSource: "github-issue-smoke-artifacts",
    paths: Object.fromEntries(
      DOGFOOD_SMOKE_ARTIFACT_SECTIONS.map(([key, sectionTitle]) => [
        key,
        readRequiredIssueArtifactPath(issue, sectionTitle)
      ])
    )
  };
}

function validateSmokeArtifactPaths(smokeArtifacts, smokePaths) {
  validateSmokeArtifactPath("UI smoke artifact", smokeArtifacts.ui, smokePaths.uiSmokeArtifactPath);
  validateSmokeArtifactPath("Ghostty smoke artifact", smokeArtifacts.ghostty, smokePaths.ghosttySmokeArtifactPath);
  validateSmokeArtifactPath("Chrome smoke artifact", smokeArtifacts.chrome, smokePaths.chromeSmokeArtifactPath);
  validateSmokeArtifactPath("Finder smoke artifact", smokeArtifacts.finder, smokePaths.finderSmokeArtifactPath);
  validateSmokeArtifactPath("voice smoke artifact", smokeArtifacts.voice, smokePaths.voiceSmokeArtifactPath);
}

function validateSmokeArtifactPath(label, artifact, expectedPath) {
  if (!samePath(artifact?.artifactPath, expectedPath)) {
    throw new Error(`${label} artifactPath must match the issue artifact path.`);
  }
}

function validateIssueAlphaIdentity(manifest, manifestPath, issue) {
  if (!hasIssueBody(issue)) {
    return {};
  }

  const issueAlphaManifest = readRequiredIssueValue(issue, "alpha manifest");
  const issueAlphaZip = readRequiredIssueValue(issue, "alpha zip");
  const issueCommitSha = readRequiredIssueValue(issue, "commit sha");
  const manifestCommitSha = readManifestCommitSha(manifest);
  const manifestZipPath = readManifestZipPath(manifest);

  if (issueCommitSha !== manifestCommitSha) {
    throw new Error("Issue commit sha must match manifest commitSha.");
  }
  if (!matchesIssuePathOrBasename(issueAlphaManifest, manifestPath)) {
    throw new Error("Issue alpha manifest must match --manifest.");
  }
  if (!matchesIssuePathOrBasename(issueAlphaZip, manifestZipPath)) {
    throw new Error("Issue alpha zip must match manifest zip.path.");
  }

  return {
    issueAlphaManifest,
    issueAlphaZip,
    issueCommitSha
  };
}

function readAbsoluteManifestPath(manifest, field) {
  const value = manifest?.[field];
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`Manifest ${field} must be an absolute path.`);
  }

  return value;
}

function readManifestCommitSha(manifest) {
  const value = manifest?.commitSha;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Manifest commitSha must be a non-empty string.");
  }

  return value.trim();
}

function readManifestZipPath(manifest) {
  const value = manifest?.zip?.path;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Manifest zip.path must be a non-empty string.");
  }

  return value.trim();
}

function readSmokeResult(artifact) {
  return typeof artifact?.result === "string" ? artifact.result : "blocked";
}

function chooseReportResult(results) {
  if (results.includes("blocked")) {
    return "blocked";
  }
  if (results.includes("needs-user-confirmation")) {
    return "needs-user-confirmation";
  }
  if (results.includes("no-transcript")) {
    return "no-transcript";
  }
  if (results.includes("sensitive-paused")) {
    return "sensitive-paused";
  }

  return "passed";
}

function readPermissionStates(smokeArtifacts) {
  const candidates = Object.values(smokeArtifacts).map((artifact) => artifact?.permissions);
  const permissions = candidates.find(hasPermissionStateObject);

  if (permissions) {
    return permissions;
  }

  return {
    screenRecording: { state: "unknown" },
    accessibility: { state: "unknown" },
    microphone: readSpeechPermission(smokeArtifacts.voice?.speechStatus?.microphone),
    speechRecognition: readSpeechPermission(smokeArtifacts.voice?.speechStatus?.speechRecognition)
  };
}

function readSpeechPermission(status) {
  return typeof status?.state === "string" ? { state: status.state } : { state: "unknown" };
}

function hasPermissionStateObject(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.screenRecording?.state === "string"
    && typeof value.accessibility?.state === "string"
    && typeof value.microphone?.state === "string"
    && typeof value.speechRecognition?.state === "string";
}

function createCollectionSummary(reports) {
  const testerIds = collectDistinctTesterIds(reports);
  const requiredWorkflowCoverage = Object.fromEntries(
    REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => [
      workflow,
      reports.some((report) => Array.isArray(report?.workflows) && report.workflows.includes(workflow))
    ])
  );
  const coverageComplete = Object.values(requiredWorkflowCoverage).every(Boolean);

  return {
    totalReports: reports.length,
    distinctTesters: testerIds.size,
    cohortReady: testerIds.size >= 3 && testerIds.size <= 5 && coverageComplete,
    requiredWorkflowCoverage
  };
}

function collectDistinctTesterIds(reports) {
  return new Set(
    reports
      .map((report) => {
        try {
          return readTesterId(report);
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
}

function readTesterId(report) {
  if (typeof report?.testerId !== "string" || report.testerId.trim().length === 0) {
    throw new Error("Report testerId is required.");
  }

  return report.testerId.trim();
}

function readManifestPath(report) {
  if (typeof report?.manifestPath !== "string" || !path.isAbsolute(report.manifestPath)) {
    throw new Error("Report manifestPath must be an absolute path.");
  }

  return report.manifestPath;
}

function createDefaultIo() {
  return {
    async exists(filePath) {
      return existsSync(filePath);
    },
    mkdir,
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async writeJson(filePath, value) {
      await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
    },
    async readIssue(issueUrl) {
      return await readIssueFromGitHub(issueUrl);
    },
    async readIssueLabels(issueUrl) {
      return (await readIssueFromGitHub(issueUrl)).labels;
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

function readWorkflowList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveAcceptedIssue(options, io) {
  const needsIssueBody = !hasNonEmptyString(options.testerId)
    || !Array.isArray(options.workflows)
    || options.workflows.length === 0;

  if ((needsIssueBody || !hasIssueLabels(options)) && typeof io.readIssue === "function") {
    return normalizeIssueEvidence(await io.readIssue(options.issueUrl));
  }

  if (needsIssueBody) {
    throw new Error("Missing --tester-id <id> or --workflows <workflow[,workflow]> and GitHub issue body reader is unavailable.");
  }

  if (!hasIssueLabels(options) && typeof io.readIssueLabels === "function") {
    return normalizeIssueEvidence({ labels: await io.readIssueLabels(options.issueUrl) });
  }

  return normalizeIssueEvidence({ labels: options.issueLabels });
}

function resolveTesterId(options, issue) {
  if (hasNonEmptyString(options.testerId)) {
    return options.testerId.trim();
  }

  const testerId = readTesterIdFromIssueBody(issue.body);
  if (!testerId) {
    throw new Error("Missing --tester-id <id> and issue body tester id field is empty.");
  }

  return testerId;
}

function resolveWorkflows(options, issue) {
  if (Array.isArray(options.workflows) && options.workflows.length > 0) {
    return options.workflows;
  }

  const workflows = readWorkflowsFromIssueBody(issue.body);
  if (workflows.length === 0) {
    throw new Error("Missing --workflows <workflow[,workflow]> and issue body cohort workflows field is empty.");
  }

  return workflows;
}

function resolveAcceptedIssueLabels(options, issue) {
  if (Array.isArray(options.issueLabels) && options.issueLabels.length > 0) {
    return options.issueLabels;
  }

  if (!Array.isArray(issue.labels) || issue.labels.length === 0) {
    throw new Error("Missing --issue-labels <label[,label]> and GitHub label reader is unavailable.");
  }

  return issue.labels;
}

function normalizeIssueEvidence(issue) {
  return {
    body: typeof issue?.body === "string" ? issue.body : "",
    labels: Array.isArray(issue?.labels)
      ? issue.labels
        .map((label) => typeof label === "string" ? label.trim() : "")
        .filter(Boolean)
      : []
  };
}

function readTesterIdFromIssueBody(body) {
  const value = readIssueSection(body, "tester id")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "_No response_");

  return value ?? "";
}

function readWorkflowsFromIssueBody(body) {
  const section = readIssueSection(body, "cohort workflows");
  const checkedWorkflows = [];

  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[[xX]\]\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const workflow = normalizeWorkflowLabel(match[1]);
    if (REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow) && !checkedWorkflows.includes(workflow)) {
      checkedWorkflows.push(workflow);
    }
  }

  return checkedWorkflows;
}

function readIssueArtifactPath(issue, sectionTitle) {
  const value = readIssueSection(issue.body, sectionTitle)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "_No response_");

  if (!value) {
    return undefined;
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`Issue ${sectionTitle} must be an absolute path.`);
  }

  return value;
}

function readRequiredIssueValue(issue, sectionTitle) {
  const value = readIssueSection(issue.body, sectionTitle)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "_No response_");

  if (!value) {
    throw new Error(`Issue ${sectionTitle} must be set.`);
  }

  return value;
}

function readRequiredIssueArtifactPath(issue, sectionTitle) {
  const value = readIssueArtifactPath(issue, sectionTitle);
  if (!value) {
    throw new Error(`Issue ${sectionTitle} must include an absolute path.`);
  }

  return value;
}

function hasIssueBody(issue) {
  return typeof issue?.body === "string" && issue.body.trim().length > 0;
}

function matchesIssuePathOrBasename(issueValue, expectedPath) {
  return issueValue === expectedPath
    || path.basename(issueValue) === path.basename(expectedPath);
}

function samePath(actualPath, expectedPath) {
  return typeof actualPath === "string"
    && typeof expectedPath === "string"
    && path.resolve(actualPath) === path.resolve(expectedPath);
}

function readIssueSection(body, title) {
  if (typeof body !== "string" || body.length === 0) {
    return "";
  }

  const headingPattern = new RegExp(`^###\\s+${escapeRegExp(title)}\\s*$`, "im");
  const headingMatch = headingPattern.exec(body);
  if (!headingMatch) {
    return "";
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = body.slice(sectionStart);
  const nextHeadingMatch = /^###\s+/m.exec(rest);
  const section = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;

  return section.trim();
}

function normalizeWorkflowLabel(value) {
  return value.replace(/`/g, "").trim();
}

function readLabelList(value) {
  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function validateAcceptedIssueLabels(issueLabels, workflows) {
  if (!Array.isArray(issueLabels) || issueLabels.length === 0) {
    throw new Error("Missing --issue-labels <label[,label]>.");
  }

  const normalizedLabels = issueLabels
    .map((label) => typeof label === "string" ? label.trim() : "")
    .filter(Boolean);

  if (!normalizedLabels.includes(ACCEPTED_DOGFOOD_LABEL)) {
    throw new Error(`--issue-labels must include ${ACCEPTED_DOGFOOD_LABEL}.`);
  }

  const normalizedWorkflows = Array.isArray(workflows)
    ? workflows.map((workflow) => typeof workflow === "string" ? workflow.trim() : "").filter(Boolean)
    : [];
  const unknownWorkflow = normalizedWorkflows.find((workflow) =>
    !REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow)
  );
  if (unknownWorkflow) {
    throw new Error(`Unknown dogfood workflow: ${unknownWorkflow}.`);
  }

  const expectedWorkflowLabels = normalizedWorkflows.map(createWorkflowLabel);
  const missingWorkflowLabel = expectedWorkflowLabels.find((label) =>
    !normalizedLabels.includes(label)
  );
  if (missingWorkflowLabel) {
    throw new Error(`--issue-labels must include ${missingWorkflowLabel}.`);
  }

  const expectedWorkflowLabelSet = new Set(expectedWorkflowLabels);
  const unexpectedWorkflowLabel = normalizedLabels.find((label) =>
    label.startsWith(DOGFOOD_WORKFLOW_LABEL_PREFIX) && !expectedWorkflowLabelSet.has(label)
  );
  if (unexpectedWorkflowLabel) {
    throw new Error(
      `--issue-labels workflow labels must match --workflows; unexpected ${unexpectedWorkflowLabel}.`
    );
  }

  return normalizedLabels;
}

function createWorkflowLabel(workflow) {
  return `${DOGFOOD_WORKFLOW_LABEL_PREFIX}${workflow}`;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasIssueLabels(options) {
  return Array.isArray(options.issueLabels) && options.issueLabels.length > 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readIssueFromGitHub(issueUrl) {
  const issue = parseGitHubIssueUrl(issueUrl);
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "view",
    issue.number,
    "--repo",
    issue.repository,
    "--json",
    "body,labels"
  ]);
  const payload = JSON.parse(stdout);

  if (!Array.isArray(payload?.labels)) {
    throw new Error(`GitHub issue labels are missing for ${issueUrl}.`);
  }

  return {
    body: typeof payload.body === "string" ? payload.body : "",
    labels: payload.labels
      .map((label) => typeof label?.name === "string" ? label.name.trim() : "")
      .filter(Boolean)
  };
}

function parseGitHubIssueUrl(value) {
  const url = new URL(value.trim());
  const segments = url.pathname.split("/").filter(Boolean);
  const issueIndex = segments.indexOf("issues");

  if (
    url.hostname !== "github.com"
    || issueIndex !== 2
    || segments.length !== 4
    || segments[3].length === 0
  ) {
    throw new Error("--issue-url must be a github.com/<owner>/<repo>/issues/<number> URL.");
  }

  return {
    repository: `${segments[0]}/${segments[1]}`,
    number: segments[3]
  };
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

async function runCli() {
  const defaults = createDefaultDogfoodReportOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodReportArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodReportHelpText());
    return;
  }

  const result = await updateDogfoodCohort(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
