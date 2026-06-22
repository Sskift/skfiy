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
const STOP_TURN_ACCELERATOR = "Control+Alt+Shift+Esc";
const STOP_TURN_LABEL = "Ctrl Opt Shift Esc";
const STOP_TURN_EVIDENCE_SOURCE = "runtimeStatus.stopTurnHotkey";
const DOGFOOD_SMOKE_ARTIFACT_SECTIONS = [
  ["uiSmokeArtifactPath", "UI smoke artifact"],
  ["ghosttySmokeArtifactPath", "smoke artifact"],
  ["chromeSmokeArtifactPath", "Chrome smoke artifact"],
  ["finderSmokeArtifactPath", "Finder smoke artifact"]
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
  requireIssueBodyForReport(issue);
  const testerId = resolveTesterId(options, issue);
  const workflows = resolveWorkflows(options, issue);
  const issueLabels = validateAcceptedIssueLabels(
    resolveAcceptedIssueLabels(options, issue),
    workflows
  );

  const manifest = await io.readJson(options.manifestPath);
  const issueAlphaIdentity = validateIssueAlphaIdentity(manifest, options.manifestPath, issue);
  const smokeArtifactSelection = readSmokeArtifactSelection(issue);
  const smokePaths = smokeArtifactSelection.paths;
  const smokeArtifacts = {
    ui: await io.readJson(smokePaths.uiSmokeArtifactPath),
    ghostty: await io.readJson(smokePaths.ghosttySmokeArtifactPath),
    chrome: await io.readJson(smokePaths.chromeSmokeArtifactPath),
    finder: await io.readJson(smokePaths.finderSmokeArtifactPath)
  };
  validateSmokeArtifactPaths(smokeArtifacts, smokePaths);
  validateNoLockedDesktopPreflight(smokeArtifacts);
  validateIssueAppBundlePreflight(issue, smokeArtifacts.ui);
  validateIssueUiPetDragEvidence(issue, smokeArtifacts.ui);
  const stopTurnEvidence = validateIssueStopTurnEvidence(issue, smokeArtifacts);
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
    artifactResults,
    uiPetDragEvidence: createUiPetDragReportEvidence(smokeArtifacts.ui?.petDrag),
    stopTurnEvidence
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
    "dogfood:report requires a readable accepted issue body from gh issue view.",
    "testerId, workflows, smoke artifact paths, alpha identity, and labels are read from GitHub by default.",
    "The issue body must include the required issue smoke artifact paths.",
    "The issue body must include app bundle preflight evidence matching the UI smoke artifact appPath, launch, appLaunchViaOpen, runnerHasTmux, and productPath.",
    "The issue body must include UI pet drag evidence matching the UI smoke artifact petDrag window-bounds proof.",
    "The issue body must include panic stop evidence matching runtimeStatus.stopTurnHotkey from the smoke artifacts.",
    "It also requires the issue alpha manifest, zip, and commit sha to match --manifest.",
    "Every smoke artifact JSON artifactPath must match the issue artifact path it was read from.",
    "Use --tester-id and --workflows only as explicit overrides for tester/workflow body fields.",
    "Use --issue-labels only as an explicit override proving dogfood:accepted plus matching workflow:* labels.",
    "summary.sourceEligibleReports counts reports that already satisfy final source/artifact identity gates.",
    "summary.cohortReady requires 3-5 testers, full workflow coverage, and sourceEligibleReports=totalReports.",
    "This is an incremental collection helper; it does not claim dogfood completion.",
    "",
    "After collecting 3-5 distinct testers and all required workflows, run:",
    "  npm run dogfood:cohort -- --cohort .skfiy-dogfood/internal-alpha-cohort.json",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

function readSmokeArtifactSelection(issue) {
  if (!hasIssueBody(issue)) {
    throw new Error("Accepted GitHub issue body is required for dogfood:report artifact evidence.");
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
}

function validateSmokeArtifactPath(label, artifact, expectedPath) {
  if (!samePath(artifact?.artifactPath, expectedPath)) {
    throw new Error(`${label} artifactPath must match the issue artifact path.`);
  }
}

function validateNoLockedDesktopPreflight(smokeArtifacts) {
  for (const [name, artifact] of Object.entries(smokeArtifacts)) {
    const preflight = artifact?.desktopPreflight;
    if (!isLockedDesktopPreflight(preflight)) {
      continue;
    }

    throw new Error(
      `${name} smoke artifact is blocked by a locked desktop session. Unlock the Mac and rerun the product smoke before collecting this report.`
    );
  }
}

function isLockedDesktopPreflight(preflight) {
  if (!preflight || preflight.result !== "blocked") {
    return false;
  }
  const reason = typeof preflight.reason === "string" ? preflight.reason.toLowerCase() : "";

  return preflight.frontmost?.bundleId === "com.apple.loginwindow"
    || preflight.display?.mainDisplayAsleep === true
    || reason.includes("loginwindow")
    || reason.includes("unlock")
    || reason.includes("display is asleep");
}

function validateIssueAppBundlePreflight(issue, uiArtifact) {
  const preflight = readIssueAppBundlePreflight(issue);
  const appPath = readRequiredAppBundlePreflightValue(preflight, "appPath");
  const launch = readRequiredAppBundlePreflightValue(preflight, "launch");
  const appLaunchViaOpen = readRequiredAppBundlePreflightValue(preflight, "appLaunchViaOpen");
  const runnerHasTmux = readRequiredAppBundlePreflightValue(preflight, "runnerHasTmux");
  const productPath = readRequiredAppBundlePreflightValue(preflight, "productPath");

  if (!path.isAbsolute(appPath)) {
    throw new Error("Issue app bundle preflight appPath must be an absolute path.");
  }
  if (path.basename(appPath) !== "skfiy.app") {
    throw new Error("Issue app bundle preflight appPath must point to lowercase skfiy.app.");
  }
  if (!samePath(uiArtifact?.appPath, appPath)) {
    throw new Error("Issue app bundle preflight appPath must match the UI smoke artifact appPath.");
  }
  if (typeof uiArtifact?.launch !== "string" || uiArtifact.launch.trim().length === 0) {
    throw new Error("UI smoke artifact launch must be recorded for app bundle preflight.");
  }
  if (launch !== uiArtifact.launch.trim()) {
    throw new Error("Issue app bundle preflight launch must match the UI smoke artifact launch.");
  }
  if (!launch.includes("open -na")) {
    throw new Error("Issue app bundle preflight launch must use LaunchServices open -na.");
  }
  if (!launch.includes(appPath)) {
    throw new Error("Issue app bundle preflight launch must include appPath.");
  }
  if (appLaunchViaOpen !== "true" || uiArtifact?.appLaunchViaOpen !== true) {
    throw new Error("Issue app bundle preflight appLaunchViaOpen must be true and match the UI smoke artifact.");
  }
  if (runnerHasTmux !== "false" || uiArtifact?.runnerHasTmux !== false) {
    throw new Error("Issue app bundle preflight runnerHasTmux must be false and match the UI smoke artifact.");
  }
  if (productPath === "not available") {
    throw new Error("Issue app bundle preflight productPath must be recorded.");
  }
  if (typeof uiArtifact?.productPath !== "string" || uiArtifact.productPath.trim().length === 0) {
    throw new Error("UI smoke artifact productPath must be recorded for app bundle preflight.");
  }
  if (productPath !== uiArtifact.productPath.trim()) {
    throw new Error("Issue app bundle preflight productPath must match the UI smoke artifact productPath.");
  }
}

function readIssueAppBundlePreflight(issue) {
  const section = readIssueSection(issue.body, "app bundle preflight");
  const values = new Map();

  for (const line of section.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length > 0 && value.length > 0 && value !== "_No response_") {
      values.set(key, value);
    }
  }

  return values;
}

function readRequiredAppBundlePreflightValue(preflight, key) {
  const value = preflight.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Issue app bundle preflight must include ${key}.`);
  }

  return value.trim();
}

function validateIssueUiPetDragEvidence(issue, uiArtifact) {
  const evidence = readIssueKeyValueSection(issue, "UI pet drag evidence");
  const result = readRequiredIssueKeyValue(evidence, "UI pet drag evidence", "result");
  const source = readRequiredIssueKeyValue(evidence, "UI pet drag evidence", "source");
  const beforeBounds = readRequiredIssueJsonValue(evidence, "UI pet drag evidence", "beforeBounds");
  const afterBounds = readRequiredIssueJsonValue(evidence, "UI pet drag evidence", "afterBounds");
  const moveEvents = readRequiredIssueNumberValue(evidence, "UI pet drag evidence", "moveEvents");
  const totalDeltaX = readRequiredIssueNumberValue(evidence, "UI pet drag evidence", "totalDeltaX");
  const totalDeltaY = readRequiredIssueNumberValue(evidence, "UI pet drag evidence", "totalDeltaY");
  const upwardMovement = readRequiredIssueKeyValue(evidence, "UI pet drag evidence", "upwardMovement");
  const suppressedClickAfterDrag = readRequiredIssueKeyValue(evidence, "UI pet drag evidence", "suppressedClickAfterDrag");
  const petDrag = uiArtifact?.petDrag;

  if (!petDrag || typeof petDrag !== "object") {
    throw new Error("UI smoke artifact petDrag evidence must be recorded.");
  }
  if (result !== "passed" || petDrag.result !== "passed") {
    throw new Error("Issue UI pet drag evidence result must be passed and match the UI smoke artifact.");
  }
  if (source !== petDrag.source || source !== "renderer-pointer-events-window-bounds") {
    throw new Error("Issue UI pet drag evidence source must match the UI smoke artifact.");
  }
  validateIssueWindowBounds("beforeBounds", beforeBounds, petDrag.beforeBounds);
  validateIssueWindowBounds("afterBounds", afterBounds, petDrag.afterBounds);
  if (!Array.isArray(petDrag.moveEvents) || petDrag.moveEvents.length <= 0) {
    throw new Error("UI smoke artifact petDrag moveEvents must be recorded.");
  }
  if (moveEvents !== petDrag.moveEvents.length) {
    throw new Error("Issue UI pet drag evidence moveEvents must match the UI smoke artifact.");
  }
  if (totalDeltaX !== petDrag.totalDeltaX || totalDeltaY !== petDrag.totalDeltaY) {
    throw new Error("Issue UI pet drag evidence deltas must match the UI smoke artifact.");
  }
  if (totalDeltaY >= 0 || petDrag.totalDeltaY >= 0) {
    throw new Error("Issue UI pet drag evidence must prove upward movement.");
  }
  if (upwardMovement !== "true" || petDrag.upwardMovement !== true) {
    throw new Error("Issue UI pet drag evidence upwardMovement must be true and match the UI smoke artifact.");
  }
  if (suppressedClickAfterDrag !== "true" || petDrag.suppressedClickAfterDrag !== true) {
    throw new Error("Issue UI pet drag evidence suppressedClickAfterDrag must be true and match the UI smoke artifact.");
  }
}

function createUiPetDragReportEvidence(petDrag) {
  return {
    result: petDrag.result,
    source: petDrag.source,
    beforeBounds: petDrag.beforeBounds,
    afterBounds: petDrag.afterBounds,
    moveEvents: petDrag.moveEvents.length,
    totalDeltaX: petDrag.totalDeltaX,
    totalDeltaY: petDrag.totalDeltaY,
    upwardMovement: petDrag.upwardMovement,
    suppressedClickAfterDrag: petDrag.suppressedClickAfterDrag,
    verifiedBy: "dogfood:report"
  };
}

function validateIssueStopTurnEvidence(issue, smokeArtifacts) {
  const evidence = readIssueKeyValueSection(issue, "panic stop");
  const accelerator = readRequiredIssueKeyValue(evidence, "panic stop evidence", "accelerator");
  const label = readRequiredIssueKeyValue(evidence, "panic stop evidence", "label");
  const registered = readRequiredIssueKeyValue(evidence, "panic stop evidence", "registered");
  const source = readRequiredIssueKeyValue(evidence, "panic stop evidence", "source");
  const behaviorResult = readRequiredIssueKeyValue(evidence, "panic stop evidence", "behaviorResult");
  const behaviorSource = readRequiredIssueKeyValue(evidence, "panic stop evidence", "behaviorSource");
  const behaviorBeforeStatus = readRequiredIssueKeyValue(evidence, "panic stop evidence", "behaviorBeforeStatus");
  const behaviorAfterStatus = readRequiredIssueKeyValue(evidence, "panic stop evidence", "behaviorAfterStatus");
  const behaviorAfterMessage = readRequiredIssueKeyValue(evidence, "panic stop evidence", "behaviorAfterMessage");
  const status = readStopTurnHotkeyStatus(smokeArtifacts);
  const behavior = readStopTurnBehavior(smokeArtifacts);

  if (!status) {
    throw new Error("Smoke artifacts must include runtimeStatus.stopTurnHotkey panic stop evidence.");
  }
  if (!behavior) {
    throw new Error("Smoke artifacts must include stopTurnBehavior panic stop evidence.");
  }
  if (accelerator !== status.accelerator || accelerator !== STOP_TURN_ACCELERATOR) {
    throw new Error("Issue panic stop evidence accelerator must match the smoke artifact stopTurnHotkey.");
  }
  if (label !== status.label || label !== STOP_TURN_LABEL) {
    throw new Error("Issue panic stop evidence label must match the smoke artifact stopTurnHotkey.");
  }
  if (registered !== "true" || status.registered !== true) {
    throw new Error("Issue panic stop evidence registered must be true and match the smoke artifact.");
  }
  if (source !== STOP_TURN_EVIDENCE_SOURCE) {
    throw new Error("Issue panic stop evidence source must be runtimeStatus.stopTurnHotkey.");
  }
  if (behaviorResult !== "passed" || behavior.result !== "passed") {
    throw new Error("Issue panic stop behaviorResult must be passed and match the smoke artifact.");
  }
  if (behaviorSource !== "renderer-escape-key-product-path" || behavior.source !== "renderer-escape-key-product-path") {
    throw new Error("Issue panic stop behaviorSource must match the smoke artifact stopTurnBehavior.");
  }
  if (behaviorBeforeStatus !== "approval_required" || behavior.beforeStatus !== "approval_required") {
    throw new Error("Issue panic stop behaviorBeforeStatus must be approval_required and match the smoke artifact.");
  }
  if (behaviorAfterStatus !== "idle" || behavior.afterStatus !== "idle") {
    throw new Error("Issue panic stop behaviorAfterStatus must be idle and match the smoke artifact.");
  }
  if (behaviorAfterMessage !== behavior.afterMessage || !behaviorAfterMessage.includes("Task stopped")) {
    throw new Error("Issue panic stop behaviorAfterMessage must match the smoke artifact stopTurnBehavior.");
  }

  return createStopTurnReportEvidence(status, behavior);
}

function readStopTurnHotkeyStatus(smokeArtifacts) {
  for (const artifact of Object.values(smokeArtifacts)) {
    const status = artifact?.runtimeStatus?.stopTurnHotkey;
    if (status && typeof status === "object") {
      return status;
    }
  }

  return undefined;
}

function readStopTurnBehavior(smokeArtifacts) {
  for (const artifact of Object.values(smokeArtifacts)) {
    const behavior = artifact?.stopTurnBehavior;
    if (behavior && typeof behavior === "object") {
      return behavior;
    }
  }

  return undefined;
}

function createStopTurnReportEvidence(status, behavior) {
  return {
    accelerator: status.accelerator,
    label: status.label,
    registered: status.registered,
    source: STOP_TURN_EVIDENCE_SOURCE,
    behaviorResult: behavior.result,
    behaviorSource: behavior.source,
    behaviorBeforeStatus: behavior.beforeStatus,
    behaviorAfterStatus: behavior.afterStatus,
    behaviorAfterMessage: behavior.afterMessage,
    verifiedBy: "dogfood:report"
  };
}

function validateIssueWindowBounds(key, issueBounds, artifactBounds) {
  if (!hasWindowBounds(issueBounds) || !hasWindowBounds(artifactBounds)) {
    throw new Error(`Issue UI pet drag evidence ${key} must include window bounds.`);
  }
  for (const field of ["x", "y", "width", "height"]) {
    if (issueBounds[field] !== artifactBounds[field]) {
      throw new Error(`Issue UI pet drag evidence ${key} must match the UI smoke artifact.`);
    }
  }
}

function hasWindowBounds(value) {
  return value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.width)
    && Number.isFinite(value.height);
}

function readIssueKeyValueSection(issue, sectionTitle) {
  const section = readIssueSection(issue.body, sectionTitle);
  const values = new Map();

  for (const line of section.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length > 0 && value.length > 0 && value !== "_No response_") {
      values.set(key, value);
    }
  }

  return values;
}

function readRequiredIssueKeyValue(values, sectionTitle, key) {
  const value = values.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Issue ${sectionTitle} must include ${key}.`);
  }

  return value.trim();
}

function readRequiredIssueNumberValue(values, sectionTitle, key) {
  const value = readRequiredIssueKeyValue(values, sectionTitle, key);
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Issue ${sectionTitle} ${key} must be a finite number.`);
  }

  return numberValue;
}

function readRequiredIssueJsonValue(values, sectionTitle, key) {
  const value = readRequiredIssueKeyValue(values, sectionTitle, key);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Issue ${sectionTitle} ${key} must be valid JSON.`);
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
    accessibility: { state: "unknown" }
  };
}

function hasPermissionStateObject(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.screenRecording?.state === "string"
    && typeof value.accessibility?.state === "string";
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
  const sourceEligibleReports = reports.filter(isCohortEligibleReport).length;

  return {
    totalReports: reports.length,
    distinctTesters: testerIds.size,
    sourceEligibleReports,
    cohortReady: testerIds.size >= 3
      && testerIds.size <= 5
      && coverageComplete
      && sourceEligibleReports === reports.length,
    requiredWorkflowCoverage
  };
}

function isCohortEligibleReport(report) {
  const source = report?.source;
  const workflows = Array.isArray(report?.workflows) ? report.workflows : [];

  try {
    readTesterId(report);
    readManifestPath(report);
    validateAcceptedIssueLabels(source?.issueLabels, workflows);
  } catch {
    return false;
  }

  return report?.appLaunchViaOpen === true
    && report?.runnerHasTmux === false
    && hasRequiredArtifactPaths(report?.artifacts)
    && hasRequiredPermissionStates(report?.permissionStates)
    && hasRequiredStopTurnEvidence(report?.stopTurnEvidence)
    && source?.type === "github-issue"
    && typeof source.issueUrl === "string"
    && isAcceptedIssueUrl(source.issueUrl)
    && typeof source.collectedAt === "string"
    && !Number.isNaN(Date.parse(source.collectedAt))
    && source.generatedBy === "dogfood:report"
    && source.artifactSource === "github-issue-smoke-artifacts"
    && hasNonEmptyString(source.issueAlphaManifest)
    && hasNonEmptyString(source.issueAlphaZip)
    && path.basename(source.issueAlphaZip).endsWith(".zip")
    && hasNonEmptyString(source.issueCommitSha)
    && hasNonEmptyString(report?.commitSha)
    && source.issueCommitSha.trim() === report.commitSha.trim()
    && matchesIssuePathOrBasename(source.issueAlphaManifest, report.manifestPath);
}

function hasRequiredArtifactPaths(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return DOGFOOD_SMOKE_ARTIFACT_SECTIONS.every(([field]) =>
    typeof value[field] === "string" && path.isAbsolute(value[field])
  );
}

function hasRequiredPermissionStates(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return ["screenRecording", "accessibility"].every((key) =>
    typeof value[key]?.state === "string" && value[key].state.length > 0
  );
}

function hasRequiredStopTurnEvidence(value) {
  return Boolean(value)
    && typeof value === "object"
    && value.accelerator === STOP_TURN_ACCELERATOR
    && value.label === STOP_TURN_LABEL
    && value.registered === true
    && value.source === STOP_TURN_EVIDENCE_SOURCE
    && value.verifiedBy === "dogfood:report";
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

  if (typeof io.readIssue === "function") {
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

function requireIssueBodyForReport(issue) {
  if (!hasIssueBody(issue)) {
    throw new Error("Accepted GitHub issue body is required for dogfood:report artifact evidence.");
  }
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
