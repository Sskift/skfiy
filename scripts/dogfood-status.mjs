#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { readRealTesterDecision } from "./dogfood-tester-id.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GITHUB_ISSUE_URL_PATTERN = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/g;
const ASSIGNMENT_PACKET_HEADING = "# skfiy dogfood tester assignments";
const ASSIGNMENT_PERMISSION_PREFLIGHT_HEADING = "## Permission Preflight";
const REQUIRED_PERMISSION_KEYS = [
  "screenRecording",
  "accessibility",
  "microphone",
  "speechRecognition"
];
const REQUIRED_WORKFLOW_IDS = [
  "coding-terminal",
  "screenshot-inspection",
  "finder-file",
  "browser-fallback"
];
const PREPARED_ALPHA_MANIFEST_PLACEHOLDER = "<path-to-downloaded-alpha-manifest.json>";
const BLOCKING_PERMISSION_STATES = new Set([
  "denied",
  "not-determined",
  "blocked",
  "unavailable"
]);
const APP_RELEVANT_PATH_PREFIXES = [
  "src/",
  "macos-helper/",
  "release/"
];
const APP_RELEVANT_PATHS = new Set([
  "index.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.electron.json",
  "vite.config.ts",
  "vitest.config.ts",
  "scripts/build-helper.sh",
  "scripts/create-alpha-artifact.mjs",
  "scripts/package-macos-app.mjs"
]);
export function createDefaultDogfoodStatusOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    trackingIssueUrl: undefined,
    trackingIssueFile: undefined,
    summaryPath: undefined,
    requireCurrentHead: false,
    currentHeadSha: undefined,
    help: false
  };
}

export function parseDogfoodStatusArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--tracking-issue-url":
        options.trackingIssueUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--tracking-issue-file":
        options.trackingIssueFile = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--summary":
        options.summaryPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--require-current-head":
        options.requireCurrentHead = true;
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

export async function createDogfoodStatus(options, io = createDefaultIo()) {
  validateStatusOptions(options);

  const manifest = await io.readJson(options.manifestPath);
  const trackingIssueUrl = readTrackingIssueUrl(options);
  const trackingIssue = normalizeIssueEvidence(await readTrackingIssue(options, io));
  const currentAlpha = validateTrackingIssueCurrentAlpha({
    body: trackingIssue.body,
    manifest,
    manifestPath: options.manifestPath
  });
  const assignmentComment = validateTrackingIssueAssignmentComment({
    comments: trackingIssue.comments,
    commentsAvailable: trackingIssue.commentsAvailable,
    manifest
  });
  const acceptedReportIssueUrls = readAcceptedReportIssueUrls(
    trackingIssue.body,
    options.trackingIssueUrl
  );
  const reportIssueValidation = await validateAcceptedReportIssues({
    manifest,
    manifestPath: options.manifestPath,
    issueUrls: acceptedReportIssueUrls,
    io
  });
  const verifiedAcceptedReportIssueUrls = reportIssueValidation
    .filter((issue) => issue.ok)
    .map((issue) => issue.issueUrl);
  const verifiedRealAcceptedReportIssueUrls = reportIssueValidation
    .filter((issue) => issue.ok && issue.realTester)
    .map((issue) => issue.issueUrl);
  const workflowCoverage = readVerifiedReportWorkflowCoverage(reportIssueValidation);
  const passedWorkflowCoverage = readPassedReportWorkflowCoverage(reportIssueValidation);
  const smokeArtifacts = await readSmokeArtifacts(manifest, io);
  const artifactResults = readArtifactResults(smokeArtifacts);
  const permissionBlockers = readPermissionBlockers(smokeArtifacts);
  const manifestChecks = await readManifestChecks(manifest, options, io);
  const missingRequiredReports = Math.max(0, 3 - verifiedRealAcceptedReportIssueUrls.length);
  const invalidReportIssueCount = reportIssueValidation.filter((issue) => !issue.ok).length;
  const currentHeadGateOk = !manifestChecks.currentHead?.required
    || manifestChecks.currentHead.ok === true;
  const canRunCollect = verifiedRealAcceptedReportIssueUrls.length >= 3
    && verifiedRealAcceptedReportIssueUrls.length <= 5
    && invalidReportIssueCount === 0
    && currentAlpha.ok
    && currentHeadGateOk
    && workflowCoverage.missing.length === 0;
  const canRunPassedCohort = canRunCollect && passedWorkflowCoverage.missing.length === 0;
  const result = canRunCollect ? "ready-to-collect" : "waiting-for-dogfood";
  const testerAssignments = createTesterAssignments({
    manifest,
    manifestPath: options.manifestPath,
    trackingIssueUrl: options.trackingIssueUrl,
    trackingIssueFile: options.trackingIssueFile,
    currentAlpha,
    verifiedRealAcceptedReportCount: verifiedRealAcceptedReportIssueUrls.length,
    usedTesterIds: readUsedTesterIds(reportIssueValidation),
    missingRequiredReports,
    workflowCoverage,
    passedWorkflowCoverage
  });
  const nextActions = createNextActions({
    canRunCollect,
    canRunPassedCohort,
    trackingIssueTarget: readTrackingIssueTarget(options),
    permissionBlockers,
    missingRequiredReports,
    manifestChecks,
    currentAlpha,
    workflowCoverage,
    passedWorkflowCoverage,
    invalidReportIssueCount,
    assignmentComment,
    testerAssignmentCount: testerAssignments.length
  });

  const status = {
    result,
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: options.manifestPath,
    trackingIssueUrl,
    trackingIssueFile: options.trackingIssueFile,
    manifest: {
      appName: manifest?.appName,
      commitSha: manifest?.commitSha,
      bundleIdentifier: manifest?.bundleIdentifier,
      artifactBaseName: manifest?.artifactBaseName,
      zipPath: manifest?.zip?.path,
      checks: manifestChecks
    },
    trackingIssue: {
      currentAlpha,
      assignmentComment,
      acceptedReportIssueUrls,
      acceptedReportCount: acceptedReportIssueUrls.length,
      verifiedAcceptedReportIssueUrls,
      verifiedAcceptedReportCount: verifiedAcceptedReportIssueUrls.length,
      verifiedRealAcceptedReportIssueUrls,
      verifiedRealAcceptedReportCount: verifiedRealAcceptedReportIssueUrls.length,
      reportIssueValidation,
      missingRequiredReports,
      workflowCoverage,
      passedWorkflowCoverage
    },
    localSmoke: {
      artifactResults,
      permissionBlockers
    },
    readiness: {
      canRunCollect,
      canRunPassedCohort,
      cohortReady: false
    },
    testerAssignments,
    nextActions
  };

  if (typeof options.summaryPath === "string") {
    await io.writeText(options.summaryPath, createDogfoodStatusMarkdown(status));
  }

  return status;
}

export function createDogfoodStatusHelpText() {
  return [
    "Usage: npm run dogfood:status -- --manifest <alpha-manifest> (--tracking-issue-url <issue-url> | --tracking-issue-file <markdown-path>) [--summary <markdown-path>] [--require-current-head]",
    "",
    "Creates a non-mutating dogfood readiness status report.",
    "It summarizes the alpha manifest, local smoke artifact results, permission blockers,",
    "and accepted report URLs recorded in the tracking issue or local tracking issue markdown file.",
    "It separates real tester readiness from local synthetic reports such as local-* and preflight-* runs.",
    "It separates verified accepted workflow coverage from passed product-path workflow coverage.",
    "It warns when app-build inputs changed after the selected alpha manifest commit.",
    "It reports whether the current alpha tester assignment packet is already posted as a tracking issue comment.",
    "It also emits recommended tester assignments with prepare/tester/review commands.",
    "Assignments whose purpose is passed-workflow-evidence include --require-passed.",
    "Use this before dogfood:collect to see what is still missing without fabricating evidence."
  ].join("\n");
}

export function createDogfoodStatusMarkdown(status) {
  const lines = [
    "# skfiy dogfood status",
    "",
    `Result: ${status.result}`,
    `Generated: ${status.generatedAt}`,
    `Manifest: ${status.manifestPath}`,
    `Commit: ${status.manifest.commitSha ?? "unknown"}`,
    ...(status.manifest.checks.currentHead
      ? [
        `Current HEAD: ${status.manifest.checks.currentHead.expected}`,
        `Alpha is current HEAD: ${status.manifest.checks.currentHead.ok ? "yes" : "no"}`,
        `Alpha app code current: ${readCurrentHeadAppCodeLabel(status.manifest.checks.currentHead)}`
      ]
      : []),
    `Accepted report URLs: ${status.trackingIssue.acceptedReportCount}/3 minimum`,
    `Verified accepted report URLs: ${status.trackingIssue.verifiedAcceptedReportCount}/3 minimum`,
    `Verified real accepted report URLs: ${status.trackingIssue.verifiedRealAcceptedReportCount}/3 minimum`,
    `Passed cohort gate ready: ${status.readiness.canRunPassedCohort ? "yes" : "no"}`,
    "",
    "## Current Alpha Identity",
    "",
    ...(status.trackingIssue.currentAlpha.ok
      ? ["- ok"]
      : status.trackingIssue.currentAlpha.reasons.map((reason) => `- invalid: ${reason}`)),
    "",
    "## Assignment Comment",
    "",
    ...formatAssignmentCommentMarkdown(status.trackingIssue.assignmentComment),
    "",
    "## Local Smoke",
    ""
  ];

  for (const [name, result] of Object.entries(status.localSmoke.artifactResults)) {
    lines.push(`- ${name}: ${result}`);
  }

  lines.push("", "## Permission Blockers", "");
  if (status.localSmoke.permissionBlockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of status.localSmoke.permissionBlockers) {
      lines.push(`- ${blocker.permission}: ${blocker.state}`);
    }
  }

  lines.push("", "## Accepted Report Issue URLs", "");
  if (status.trackingIssue.acceptedReportIssueUrls.length === 0) {
    lines.push("- none");
  } else {
    for (const issueUrl of status.trackingIssue.acceptedReportIssueUrls) {
      lines.push(`- ${issueUrl}`);
    }
  }

  lines.push("", "## Report Issue Validation", "");
  if (status.trackingIssue.reportIssueValidation.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of status.trackingIssue.reportIssueValidation) {
      const state = issue.ok ? "ok" : `invalid: ${issue.reasons.join("; ")}`;
      const tester = issue.testerId ? ` tester=${issue.testerId}` : "";
      const synthetic = issue.ok && !issue.realTester && issue.realTesterReasons.length > 0
        ? `; synthetic: ${issue.realTesterReasons.join("; ")}`
        : "";
      lines.push(`- ${issue.issueUrl}: ${state}${tester}${synthetic}`);
    }
  }

  lines.push("", "## Workflow Coverage", "");
  for (const workflow of REQUIRED_WORKFLOW_IDS) {
    const state = status.trackingIssue.workflowCoverage.covered.includes(workflow)
      ? "covered"
      : "missing";
    lines.push(`- ${workflow}: ${state}`);
  }

  lines.push("", "## Passed Workflow Coverage", "");
  for (const workflow of REQUIRED_WORKFLOW_IDS) {
    const state = status.trackingIssue.passedWorkflowCoverage.covered.includes(workflow)
      ? "passed"
      : "blocked-or-missing";
    lines.push(`- ${workflow}: ${state}`);
  }

  lines.push("", "## Next Actions", "");
  for (const action of status.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("", "## Recommended Tester Assignments", "");
  if (!Array.isArray(status.testerAssignments) || status.testerAssignments.length === 0) {
    lines.push("- none");
  } else {
    for (const assignment of status.testerAssignments) {
      lines.push(`- ${assignment.testerId}: ${assignment.workflows.join(", ")}`);
      lines.push(`  - Purpose: ${assignment.purpose}`);
      lines.push("  - Prepare:");
      lines.push(`    \`${assignment.commands.prepareAlpha}\``);
      lines.push("  - After Prepare finishes, copy `nextCommands.tester` from the prepare-alpha JSON output.");
      lines.push("  - Run:");
      lines.push(`    \`${assignment.commands.tester}\``);
      lines.push("  - Review:");
      lines.push(`    \`${assignment.commands.review}\``);
      lines.push("  - After filing the dogfood issue, copy `nextCommands.review` from the same prepare-alpha JSON output and replace `<filed-dogfood-issue-url>`.");
    }
  }

  return `${lines.join("\n")}\n`;
}

function validateStatusOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  const hasTrackingIssueUrl =
    typeof options.trackingIssueUrl === "string" && options.trackingIssueUrl.trim().length > 0;
  const hasTrackingIssueFile =
    typeof options.trackingIssueFile === "string" && options.trackingIssueFile.trim().length > 0;

  if (!hasTrackingIssueUrl && !hasTrackingIssueFile) {
    throw new Error("Missing --tracking-issue-url <url> or --tracking-issue-file <markdown-path>.");
  }
  if (hasTrackingIssueUrl && !isGitHubIssueUrl(options.trackingIssueUrl)) {
    throw new Error("--tracking-issue-url must be a GitHub issue URL.");
  }
}

async function readTrackingIssue(options, io) {
  if (typeof options.trackingIssueFile === "string" && options.trackingIssueFile.trim().length > 0) {
    return {
      body: await io.readText(options.trackingIssueFile),
      labels: [],
      comments: undefined
    };
  }

  return await io.readIssue(options.trackingIssueUrl);
}

function readTrackingIssueUrl(options) {
  return typeof options.trackingIssueUrl === "string" && options.trackingIssueUrl.trim().length > 0
    ? options.trackingIssueUrl
    : "local-tracking-issue";
}

function readTrackingIssueTarget(options) {
  if (typeof options.trackingIssueFile === "string" && options.trackingIssueFile.trim().length > 0) {
    return `local tracking issue file ${options.trackingIssueFile}`;
  }

  const issueNumber = readGitHubIssueNumber(options.trackingIssueUrl);
  return issueNumber.length > 0 ? `GitHub issue #${issueNumber}` : "the tracking issue";
}

function readGitHubIssueNumber(issueUrl) {
  if (typeof issueUrl !== "string" || issueUrl.trim().length === 0) {
    return "";
  }
  try {
    return parseGitHubIssueUrl(issueUrl).number;
  } catch {
    return "";
  }
}

async function readSmokeArtifacts(manifest, io) {
  return {
    ui: await readOptionalJson(manifest?.uiSmokeArtifactPath, io),
    ghostty: await readOptionalJson(manifest?.smokeArtifactPath, io),
    chrome: await readOptionalJson(manifest?.chromeSmokeArtifactPath, io),
    finder: await readOptionalJson(manifest?.finderSmokeArtifactPath, io),
    voice: await readOptionalJson(manifest?.voiceSmokeArtifactPath, io)
  };
}

async function readOptionalJson(filePath, io) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return undefined;
  }

  return await io.readJson(filePath);
}

function readArtifactResults(smokeArtifacts) {
  return Object.fromEntries(
    Object.entries(smokeArtifacts).map(([name, artifact]) => [
      name,
      typeof artifact?.result === "string" ? artifact.result : "missing"
    ])
  );
}

function readPermissionBlockers(smokeArtifacts) {
  const permissions = readPermissionStates(smokeArtifacts);

  return REQUIRED_PERMISSION_KEYS
    .map((permission) => ({
      permission,
      state: permissions[permission]?.state ?? "unknown"
    }))
    .filter((item) => BLOCKING_PERMISSION_STATES.has(item.state));
}

function readPermissionStates(smokeArtifacts) {
  const permissionStates = {};

  for (const key of REQUIRED_PERMISSION_KEYS) {
    const state = Object.values(smokeArtifacts)
      .map((artifact) =>
        artifact?.permissionStates?.[key]?.state
        ?? artifact?.permissions?.[key]?.state
        ?? artifact?.speechStatus?.[key]?.state
      )
      .find((value) =>
        typeof value === "string"
          && value.trim().length > 0
          && value !== "unknown"
      );
    permissionStates[key] = { state: state ?? "unknown" };
  }

  return permissionStates;
}

async function readManifestChecks(manifest, options, io) {
  const checks = {
    currentHead: undefined,
    zipReadable: false
  };

  if (options.requireCurrentHead || typeof io.readCurrentHead === "function") {
    const currentHeadSha = typeof options.currentHeadSha === "string"
      ? options.currentHeadSha
      : await readOptionalCurrentHead(options, io);
    const manifestSha = typeof manifest?.commitSha === "string" ? manifest.commitSha : undefined;
    const currentHead = {
      expected: currentHeadSha,
      actual: manifestSha,
      ok: manifestSha === currentHeadSha,
      required: options.requireCurrentHead === true
    };
    if (
      currentHead.ok !== true
      && currentHead.required !== true
      && typeof manifestSha === "string"
      && typeof currentHeadSha === "string"
      && typeof io.readChangedFilesBetween === "function"
    ) {
      const changedFiles = await io.readChangedFilesBetween(
        manifestSha,
        currentHeadSha,
        options.rootDir ?? DEFAULT_ROOT_DIR
      );
      if (Array.isArray(changedFiles)) {
        currentHead.changedFiles = changedFiles
          .map((filePath) => typeof filePath === "string" ? normalizeRepoPath(filePath) : "")
          .filter(Boolean);
        currentHead.appRelevantChangedFiles = await readAppRelevantChangedFiles({
          changedFiles: currentHead.changedFiles,
          baseSha: manifestSha,
          headSha: currentHeadSha,
          rootDir: options.rootDir ?? DEFAULT_ROOT_DIR,
          io
        });
        currentHead.appCodeOk = currentHead.appRelevantChangedFiles.length === 0;
      }
    }
    checks.currentHead = {
      ...currentHead
    };
  }

  if (typeof manifest?.zip?.path === "string") {
    try {
      const zipStat = await io.statFile(manifest.zip.path);
      checks.zipReadable = Number.isFinite(zipStat?.size) && zipStat.size > 0;
    } catch {
      checks.zipReadable = false;
    }
  }

  return checks;
}

function normalizeRepoPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isAppRelevantChangedPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  if (isTestSourcePath(normalized)) {
    return false;
  }
  return APP_RELEVANT_PATHS.has(normalized)
    || APP_RELEVANT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function readAppRelevantChangedFiles({
  changedFiles,
  baseSha,
  headSha,
  rootDir,
  io
}) {
  const relevant = [];

  for (const filePath of changedFiles) {
    if (filePath === "package.json" && typeof io.readFileAtCommit === "function") {
      if (await packageJsonRuntimeChanged({ baseSha, headSha, filePath, rootDir, io })) {
        relevant.push(filePath);
      }
      continue;
    }
    if (isAppRelevantChangedPath(filePath)) {
      relevant.push(filePath);
    }
  }

  return relevant;
}

async function packageJsonRuntimeChanged({ baseSha, headSha, filePath, rootDir, io }) {
  const [baseText, headText] = await Promise.all([
    io.readFileAtCommit(baseSha, filePath, rootDir),
    io.readFileAtCommit(headSha, filePath, rootDir)
  ]);
  const baseRuntime = readPackageRuntimeFields(JSON.parse(baseText));
  const headRuntime = readPackageRuntimeFields(JSON.parse(headText));

  return JSON.stringify(baseRuntime) !== JSON.stringify(headRuntime);
}

function readPackageRuntimeFields(packageJson) {
  return {
    name: packageJson?.name,
    version: packageJson?.version,
    type: packageJson?.type,
    main: packageJson?.main,
    dependencies: packageJson?.dependencies ?? {},
    devDependencies: packageJson?.devDependencies ?? {},
    optionalDependencies: packageJson?.optionalDependencies ?? {},
    peerDependencies: packageJson?.peerDependencies ?? {}
  };
}

function isTestSourcePath(filePath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)
    || filePath.includes("/__tests__/");
}

function readCurrentHeadAppCodeLabel(currentHead) {
  if (currentHead.ok === true || currentHead.appCodeOk === true) {
    return "yes";
  }
  if (Array.isArray(currentHead.appRelevantChangedFiles)) {
    return "no";
  }
  return "unknown";
}

async function readOptionalCurrentHead(options, io) {
  if (typeof io.readCurrentHead !== "function") {
    return undefined;
  }

  return await io.readCurrentHead(options.rootDir ?? DEFAULT_ROOT_DIR);
}

function createNextActions({
  canRunCollect,
  canRunPassedCohort,
  trackingIssueTarget,
  permissionBlockers,
  missingRequiredReports,
  manifestChecks,
  currentAlpha,
  workflowCoverage,
  passedWorkflowCoverage,
  invalidReportIssueCount,
  assignmentComment,
  testerAssignmentCount
}) {
  const actions = [];

  if (currentAlpha.ok !== true) {
    actions.push(`Update ${trackingIssueTarget} Current Alpha section to match the selected manifest before collecting reports.`);
  }
  if (missingRequiredReports > 0) {
    actions.push(`Collect at least 3 accepted real tester report issue URLs in ${trackingIssueTarget}.`);
  }
  if (
    assignmentComment?.available === true
    && assignmentComment.ok !== true
    && testerAssignmentCount > 0
  ) {
    actions.push(`Post the current ${assignmentComment.currentAlphaTag} tester assignment packet to ${trackingIssueTarget} before asking more testers to run it.`);
  }
  if (invalidReportIssueCount > 0) {
    actions.push("Review or replace stale/invalid dogfood report issue URLs before collecting the cohort.");
  }
  if (workflowCoverage.missing.length > 0) {
    actions.push(`Collect accepted reports covering missing workflows: ${workflowCoverage.missing.join(", ")}.`);
  }
  if (passedWorkflowCoverage.missing.length > 0) {
    actions.push(`Collect passed product-path evidence for workflows: ${passedWorkflowCoverage.missing.join(", ")}.`);
  }
  if (permissionBlockers.some((item) => item.permission === "screenRecording")) {
    actions.push("Grant Screen Recording to dist/skfiy.app or the alpha app bundle before requiring passed Computer Use evidence.");
  }
  if (permissionBlockers.some((item) => item.permission === "accessibility")) {
    actions.push("Grant Accessibility to dist/skfiy.app or the alpha app bundle before requiring passed click/type evidence.");
  }
  if (permissionBlockers.some((item) => item.permission === "microphone")) {
    actions.push("Grant Microphone to dist/skfiy.app or the alpha app bundle before requiring passed native voice evidence.");
  }
  if (permissionBlockers.some((item) => item.permission === "speechRecognition")) {
    actions.push("Grant Speech Recognition to dist/skfiy.app or the alpha app bundle before requiring passed native speech evidence.");
  }
  if (
    manifestChecks.currentHead
    && manifestChecks.currentHead.ok !== true
    && (manifestChecks.currentHead.required === true || manifestChecks.currentHead.appCodeOk !== true)
  ) {
    actions.push(
      manifestChecks.currentHead.required === true
        ? "Regenerate the alpha artifact so manifest commitSha matches the current HEAD."
        : "Publish a fresh alpha artifact from the current HEAD before assigning new dogfood testers, or intentionally keep testing the older selected alpha."
    );
  }
  if (canRunCollect) {
    actions.push("Run npm run dogfood:collect with the current manifest and tracking issue.");
    if (canRunPassedCohort) {
      actions.push("After collecting, run npm run dogfood:cohort -- --require-passed on the collected cohort JSON.");
    } else {
      actions.push("Do not run npm run dogfood:cohort -- --require-passed until passed workflow coverage is complete.");
    }
  }
  if (actions.length === 0) {
    actions.push("Run npm run dogfood:collect, then npm run dogfood:cohort on the collected cohort JSON.");
  }

  return actions;
}

function createTesterAssignments({
  manifest,
  manifestPath,
  trackingIssueUrl,
  trackingIssueFile,
  currentAlpha,
  verifiedRealAcceptedReportCount,
  usedTesterIds = [],
  missingRequiredReports,
  workflowCoverage,
  passedWorkflowCoverage
}) {
  const slotsRemaining = Math.max(0, 5 - verifiedRealAcceptedReportCount);
  if (slotsRemaining === 0) {
    return [];
  }

  const sourceWorkflows = workflowCoverage.missing.length > 0
    ? workflowCoverage.missing
    : passedWorkflowCoverage.missing.length > 0
      ? passedWorkflowCoverage.missing
      : REQUIRED_WORKFLOW_IDS;
  let assignmentCount = 0;
  let purpose = "";

  if (missingRequiredReports > 0 || workflowCoverage.missing.length > 0) {
    assignmentCount = missingRequiredReports > 0 ? missingRequiredReports : 1;
    purpose = "real-tester-count-and-workflow-coverage";
  } else if (passedWorkflowCoverage.missing.length > 0) {
    assignmentCount = 1;
    purpose = "passed-workflow-evidence";
  }

  assignmentCount = Math.min(slotsRemaining, assignmentCount);
  if (assignmentCount <= 0) {
    return [];
  }

  const testerIds = createSuggestedTesterIds({
    assignmentCount,
    usedTesterIds
  });
  const releaseUrl = readTesterAssignmentReleaseUrl({
    currentAlpha,
    manifest,
    trackingIssueUrl
  });

  return distributeWorkflows(sourceWorkflows, assignmentCount).map((workflows, index) => {
    const testerId = testerIds[index];

    return {
      testerId,
      workflows,
      purpose,
      commands: createTesterAssignmentCommands({
        testerId,
        workflows,
        manifestPath,
        trackingIssueUrl,
        trackingIssueFile,
        releaseUrl,
        requirePassed: purpose === "passed-workflow-evidence"
      })
    };
  });
}

function readTesterAssignmentReleaseUrl({ currentAlpha, manifest, trackingIssueUrl }) {
  if (
    currentAlpha?.ok === true
    && typeof currentAlpha.fields?.release === "string"
    && currentAlpha.fields.release.trim().length > 0
  ) {
    return currentAlpha.fields.release.trim();
  }

  return readManifestReleaseUrl(manifest, trackingIssueUrl);
}

function readManifestReleaseUrl(manifest, trackingIssueUrl) {
  const repo = readGitHubRepoFromIssueUrl(trackingIssueUrl) ?? "Sskift/skfiy";
  return `https://github.com/${repo}/releases/tag/${readManifestAlphaTag(manifest)}`;
}

function readGitHubRepoFromIssueUrl(issueUrl) {
  if (typeof issueUrl !== "string") {
    return undefined;
  }

  const match = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/\d+/.exec(issueUrl.trim());
  if (!match) {
    return undefined;
  }

  return `${match[1]}/${match[2]}`;
}

function readUsedTesterIds(reportIssueValidation) {
  if (!Array.isArray(reportIssueValidation)) {
    return [];
  }

  return reportIssueValidation
    .map((issue) => typeof issue?.testerId === "string" ? issue.testerId.trim() : "")
    .filter(Boolean);
}

function createSuggestedTesterIds({ assignmentCount, usedTesterIds }) {
  const used = new Set(
    (Array.isArray(usedTesterIds) ? usedTesterIds : [])
      .map((testerId) => String(testerId).trim().toLowerCase())
      .filter(Boolean)
  );
  const testerIds = [];
  let candidate = 1;

  while (testerIds.length < assignmentCount) {
    const testerId = `tester-${candidate}`;
    const normalizedTesterId = testerId.toLowerCase();
    if (!used.has(normalizedTesterId)) {
      testerIds.push(testerId);
      used.add(normalizedTesterId);
    }
    candidate += 1;
  }

  return testerIds;
}

function distributeWorkflows(workflows, assignmentCount) {
  const remaining = [...workflows];
  const groups = [];

  for (let index = 0; index < assignmentCount; index += 1) {
    const slotsLeft = assignmentCount - index;
    const take = Math.max(1, Math.ceil(remaining.length / slotsLeft));
    const group = remaining.splice(0, take);
    groups.push(group.length > 0 ? group : [REQUIRED_WORKFLOW_IDS[index % REQUIRED_WORKFLOW_IDS.length]]);
  }

  return groups;
}

function createTesterAssignmentCommands({
  testerId,
  workflows,
  trackingIssueUrl,
  trackingIssueFile,
  releaseUrl,
  requirePassed = false
}) {
  const workflowList = workflows.join(",");
  const trackingIssueArgs = readPrepareAlphaTrackingIssueArgs({
    trackingIssueUrl,
    trackingIssueFile,
    workflowList
  });
  const reviewTrackingIssueArgs = readReviewTrackingIssueArgs({ trackingIssueUrl });

  return {
    prepareAlpha: [
      "npm run dogfood:prepare-alpha --",
      "--release-url",
      releaseUrl || "<github-alpha-release-url>",
      "--tester-id",
      testerId,
      ...trackingIssueArgs,
      ...(requirePassed ? ["--require-passed"] : []),
      "--execute"
    ].join(" "),
    tester: [
      "npm run dogfood:tester --",
      "--manifest",
      PREPARED_ALPHA_MANIFEST_PLACEHOLDER,
      "--app",
      "<path-to-unzipped-skfiy.app>",
      "--tester-id",
      testerId,
      "--workflows",
      workflowList,
      "--artifacts-dir",
      `.skfiy-smoke/dogfood/${testerId}`,
      "--issue-output",
      `.skfiy-dogfood/issues/${testerId}.md`,
      "--summary",
      `.skfiy-dogfood/${testerId}-summary.md`,
      "--file-issue",
      ...(requirePassed ? ["--require-passed"] : [])
    ].join(" "),
    review: [
      "npm run dogfood:review --",
      "--manifest",
      PREPARED_ALPHA_MANIFEST_PLACEHOLDER,
      "--issue-url",
      "<filed-dogfood-issue-url>",
      ...reviewTrackingIssueArgs,
      "--summary",
      `.skfiy-dogfood/reviews/${testerId}.md`
    ].join(" ")
  };
}

function readPrepareAlphaTrackingIssueArgs({ trackingIssueUrl, trackingIssueFile, workflowList }) {
  if (typeof trackingIssueUrl === "string" && trackingIssueUrl.trim().length > 0) {
    return ["--tracking-issue-url", trackingIssueUrl.trim()];
  }
  if (typeof trackingIssueFile === "string" && trackingIssueFile.trim().length > 0) {
    return ["--tracking-issue-file", trackingIssueFile.trim()];
  }
  return ["--workflows", workflowList];
}

function readReviewTrackingIssueArgs({ trackingIssueUrl }) {
  if (typeof trackingIssueUrl === "string" && trackingIssueUrl.trim().length > 0) {
    return ["--tracking-issue-url", trackingIssueUrl.trim()];
  }

  return [];
}

function validateTrackingIssueCurrentAlpha({ body, manifest, manifestPath }) {
  const section = readMarkdownSection(body, "Current Alpha");
  const fields = readCurrentAlphaFields(section);
  const reasons = [];
  const manifestCommitSha = typeof manifest?.commitSha === "string" ? manifest.commitSha.trim() : "";
  const expectedReleaseTag = manifestCommitSha.length > 0
    ? `skfiy-alpha-${manifestCommitSha.slice(0, 7)}`
    : "";

  if (section.length === 0) {
    reasons.push("tracking issue is missing Current Alpha section");
  }

  if (fields.release.length === 0) {
    reasons.push("missing tracking issue release");
  } else if (expectedReleaseTag.length === 0 || !fields.release.includes(`/releases/tag/${expectedReleaseTag}`)) {
    reasons.push("tracking issue release does not match manifest commit");
  }

  if (fields.manifest.length === 0) {
    reasons.push("missing tracking issue manifest");
  } else if (!matchesIssuePathOrBasename(fields.manifest, manifestPath)) {
    reasons.push("tracking issue manifest does not match current manifest");
  }

  const manifestZipPath = typeof manifest?.zip?.path === "string" ? manifest.zip.path : "";
  if (fields.zip.length === 0) {
    reasons.push("missing tracking issue zip");
  } else if (!matchesIssuePathOrBasename(fields.zip, manifestZipPath)) {
    reasons.push("tracking issue zip does not match manifest zip.path");
  }

  const manifestZipSha256 = typeof manifest?.zip?.sha256 === "string" ? manifest.zip.sha256.trim() : "";
  if (fields.zipSha256.length === 0) {
    reasons.push("missing tracking issue zip SHA256");
  } else if (manifestZipSha256.length === 0 || fields.zipSha256 !== manifestZipSha256) {
    reasons.push("tracking issue zip SHA256 does not match manifest zip.sha256");
  }

  if (fields.commit.length === 0) {
    reasons.push("missing tracking issue commit");
  } else if (fields.commit !== manifestCommitSha) {
    reasons.push("tracking issue commit does not match manifest commitSha");
  }

  const bundleIdentifier = typeof manifest?.bundleIdentifier === "string" ? manifest.bundleIdentifier.trim() : "";
  if (fields.bundleId.length === 0) {
    reasons.push("missing tracking issue bundle id");
  } else if (fields.bundleId !== bundleIdentifier) {
    reasons.push("tracking issue bundle id does not match manifest bundleIdentifier");
  }

  const appName = typeof manifest?.appName === "string" ? manifest.appName.trim() : "";
  if (fields.appName.length === 0) {
    reasons.push("missing tracking issue app name");
  } else if (fields.appName !== appName) {
    reasons.push("tracking issue app name does not match manifest appName");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    fields
  };
}

function validateTrackingIssueAssignmentComment({ comments, commentsAvailable, manifest }) {
  const normalizedComments = Array.isArray(comments)
    ? comments.map(normalizeIssueComment).filter((comment) => comment.body.length > 0)
    : [];
  const currentAlphaTag = readManifestAlphaTag(manifest);
  const matchingComments = normalizedComments.filter((comment) =>
    isCurrentAlphaAssignmentComment(comment.body, currentAlphaTag)
  );
  const completeComments = matchingComments.filter((comment) =>
    comment.body.includes(ASSIGNMENT_PERMISSION_PREFLIGHT_HEADING)
  );
  const reasons = [];
  const latestComment = completeComments.at(-1) ?? matchingComments.at(-1);

  if (commentsAvailable !== true) {
    reasons.push("tracking issue comments were not loaded");
  } else if (matchingComments.length === 0) {
    reasons.push(`tracking issue does not have a current ${currentAlphaTag} tester assignment packet comment`);
  } else if (completeComments.length === 0) {
    reasons.push(`current ${currentAlphaTag} tester assignment packet comment is missing Permission Preflight`);
  }

  return {
    available: commentsAvailable === true,
    ok: commentsAvailable === true && reasons.length === 0,
    currentAlphaTag,
    commentCount: normalizedComments.length,
    matchingCommentCount: matchingComments.length,
    latestCommentUrl: latestComment?.url,
    latestCommentCreatedAt: latestComment?.createdAt,
    reasons
  };
}

function normalizeIssueComment(comment) {
  return {
    body: typeof comment?.body === "string" ? comment.body : "",
    url: typeof comment?.url === "string" ? comment.url : undefined,
    createdAt: typeof comment?.createdAt === "string" ? comment.createdAt : undefined
  };
}

function isCurrentAlphaAssignmentComment(body, currentAlphaTag) {
  const alphaLinePattern = new RegExp(
    `^Alpha:\\s*${escapeRegExp(currentAlphaTag)}\\s*$`,
    "im"
  );

  return typeof body === "string"
    && body.includes(ASSIGNMENT_PACKET_HEADING)
    && currentAlphaTag.length > 0
    && alphaLinePattern.test(body);
}

function readManifestAlphaTag(manifest) {
  const commitSha = typeof manifest?.commitSha === "string" ? manifest.commitSha.trim() : "";
  return commitSha.length > 0 ? `skfiy-alpha-${commitSha.slice(0, 7)}` : "skfiy-alpha-unknown";
}

function formatAssignmentCommentMarkdown(assignmentComment) {
  if (!assignmentComment || assignmentComment.available !== true) {
    return ["- unavailable: tracking issue comments were not loaded"];
  }

  const lines = assignmentComment.ok
    ? [`- ok: current ${assignmentComment.currentAlphaTag} packet is posted`]
    : assignmentComment.reasons.map((reason) => `- invalid: ${reason}`);

  lines.push(`- matching comments: ${assignmentComment.matchingCommentCount}/${assignmentComment.commentCount}`);
  if (typeof assignmentComment.latestCommentUrl === "string") {
    lines.push(`- latest: ${assignmentComment.latestCommentUrl}`);
  }
  if (typeof assignmentComment.latestCommentCreatedAt === "string") {
    lines.push(`- latest created: ${assignmentComment.latestCommentCreatedAt}`);
  }

  return lines;
}

function readCurrentAlphaFields(section) {
  return {
    release: readBulletField(section, "Release"),
    manifest: readBulletField(section, "Manifest"),
    zip: readBulletField(section, "Zip"),
    zipSha256: readBulletField(section, "Zip SHA256"),
    commit: readBulletField(section, "Commit"),
    bundleId: readBulletField(section, "Bundle id"),
    appName: readBulletField(section, "App name")
  };
}

function readBulletField(section, label) {
  if (typeof section !== "string" || section.length === 0) {
    return "";
  }

  const pattern = new RegExp(`^-\\s*${escapeRegExp(label)}:\\s*(.+?)\\s*$`, "im");
  const match = pattern.exec(section);

  return match ? stripMarkdownValue(match[1]) : "";
}

function stripMarkdownValue(value) {
  const trimmed = String(value ?? "").trim();
  const wrappedBackticks = /^`([^`]+)`$/.exec(trimmed);

  return wrappedBackticks ? wrappedBackticks[1].trim() : trimmed;
}

async function validateAcceptedReportIssues({ manifest, manifestPath, issueUrls, io }) {
  const results = [];

  for (const issueUrl of issueUrls) {
    try {
      const issue = normalizeIssueEvidence(await io.readIssue(issueUrl));
      const validation = validateAcceptedReportIssue({
        manifest,
        manifestPath,
        issue
      });
      results.push({
        issueUrl,
        ok: validation.reasons.length === 0,
        reasons: validation.reasons,
        testerId: validation.testerId,
        realTester: validation.realTester,
        realTesterReasons: validation.realTesterReasons,
        workflows: validation.workflows,
        result: validation.result
      });
    } catch (error) {
      results.push({
        issueUrl,
        ok: false,
        reasons: [error instanceof Error ? error.message : "failed to read issue"],
        testerId: "",
        realTester: false,
        realTesterReasons: ["issue could not be read"],
        workflows: [],
        result: "unknown"
      });
    }
  }

  return results;
}

function validateAcceptedReportIssue({ manifest, manifestPath, issue }) {
  const reasons = [];
  const labels = new Set(issue.labels);
  const workflows = readIssueWorkflows(issue.body);
  const result = readIssueResult(issue.body);
  const testerId = readIssueSection(issue.body, "tester id");
  const realTesterDecision = readRealTesterDecision(testerId);

  if (!labels.has("dogfood:accepted")) {
    reasons.push("missing dogfood:accepted label");
  }

  const issueCommitSha = readIssueSection(issue.body, "commit sha");
  const manifestCommitSha = typeof manifest?.commitSha === "string" ? manifest.commitSha.trim() : "";
  if (issueCommitSha.length === 0) {
    reasons.push("missing commit sha");
  } else if (issueCommitSha !== manifestCommitSha) {
    reasons.push("commit sha does not match manifest commitSha");
  }

  const issueAlphaManifest = readIssueSection(issue.body, "alpha manifest");
  if (issueAlphaManifest.length === 0) {
    reasons.push("missing alpha manifest");
  } else if (!matchesIssuePathOrBasename(issueAlphaManifest, manifestPath)) {
    reasons.push("alpha manifest does not match current manifest");
  }

  const issueAlphaZip = readIssueSection(issue.body, "alpha zip");
  const manifestZipPath = typeof manifest?.zip?.path === "string" ? manifest.zip.path : "";
  if (issueAlphaZip.length === 0) {
    reasons.push("missing alpha zip");
  } else if (!matchesIssuePathOrBasename(issueAlphaZip, manifestZipPath)) {
    reasons.push("alpha zip does not match manifest zip.path");
  }

  if (workflows.length === 0) {
    reasons.push("missing checked cohort workflow");
  }

  for (const workflow of workflows) {
    if (!labels.has(`workflow:${workflow}`)) {
      reasons.push(`missing workflow:${workflow} label`);
    }
  }

  for (const label of labels) {
    if (!label.startsWith("workflow:")) {
      continue;
    }
    const workflow = label.slice("workflow:".length);
    if (!workflows.includes(workflow)) {
      reasons.push(`unexpected workflow:${workflow} label`);
    }
  }

  reasons.push(...validateIssueUiPetDragEvidence(issue.body));

  return {
    reasons,
    testerId,
    realTester: realTesterDecision.ok,
    realTesterReasons: realTesterDecision.ok ? [] : [realTesterDecision.message],
    workflows,
    result
  };
}

function validateIssueUiPetDragEvidence(body) {
  const section = readIssueSection(body, "UI pet drag evidence");
  if (section.length === 0) {
    return ["missing UI pet drag evidence"];
  }

  const evidence = readIssueKeyValueSection(section);
  const result = evidence.get("result");
  const source = evidence.get("source");
  const totalDeltaY = Number(evidence.get("totalDeltaY"));
  const upwardMovement = evidence.get("upwardMovement");
  const suppressedClickAfterDrag = evidence.get("suppressedClickAfterDrag");
  const beforeBounds = readJsonEvidence(evidence.get("beforeBounds"));
  const afterBounds = readJsonEvidence(evidence.get("afterBounds"));

  if (result !== "passed") {
    return ["UI pet drag evidence result must be passed"];
  }
  if (source !== "renderer-pointer-events-window-bounds") {
    return ["UI pet drag evidence source must be renderer-pointer-events-window-bounds"];
  }
  if (!hasWindowBounds(beforeBounds) || !hasWindowBounds(afterBounds)) {
    return ["UI pet drag evidence must include beforeBounds and afterBounds"];
  }
  if (!Number.isFinite(totalDeltaY) || totalDeltaY >= 0 || upwardMovement !== "true") {
    return ["UI pet drag evidence must prove upward movement"];
  }
  if (suppressedClickAfterDrag !== "true") {
    return ["UI pet drag evidence must prove suppressedClickAfterDrag"];
  }

  return [];
}

function readIssueKeyValueSection(section) {
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

function readJsonEvidence(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function hasWindowBounds(value) {
  return Boolean(value)
    && typeof value === "object"
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.width)
    && Number.isFinite(value.height);
}

function readVerifiedReportWorkflowCoverage(reportIssueValidation) {
  const covered = [];

  for (const issue of reportIssueValidation) {
    if (!issue.ok || issue.realTester !== true) {
      continue;
    }
    for (const workflow of issue.workflows) {
      if (!covered.includes(workflow)) {
        covered.push(workflow);
      }
    }
  }

  return {
    required: [...REQUIRED_WORKFLOW_IDS],
    covered,
    missing: REQUIRED_WORKFLOW_IDS.filter((workflow) => !covered.includes(workflow))
  };
}

function readPassedReportWorkflowCoverage(reportIssueValidation) {
  const covered = [];

  for (const issue of reportIssueValidation) {
    if (!issue.ok || issue.realTester !== true || issue.result !== "passed") {
      continue;
    }
    for (const workflow of issue.workflows) {
      if (!covered.includes(workflow)) {
        covered.push(workflow);
      }
    }
  }

  return {
    required: [...REQUIRED_WORKFLOW_IDS],
    covered,
    missing: REQUIRED_WORKFLOW_IDS.filter((workflow) => !covered.includes(workflow))
  };
}

function readIssueResult(body) {
  const value = readIssueSection(body, "Computer Use result")
    || readIssueSection(body, "computer use result");
  return value.trim().split(/\s+/)[0] || "unknown";
}

function readIssueWorkflows(body) {
  const section = readIssueSection(body, "cohort workflows");

  return REQUIRED_WORKFLOW_IDS.filter((workflow) => {
    const checkboxPattern = new RegExp(
      `-\\s*\\[\\s*x\\s*\\]\\s*(?:\`${escapeRegExp(workflow)}\`|${escapeRegExp(workflow)})`,
      "i"
    );
    return checkboxPattern.test(section);
  });
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

  return (nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest).trim();
}

function matchesIssuePathOrBasename(issueValue, expectedPath) {
  if (typeof expectedPath !== "string" || expectedPath.trim().length === 0) {
    return false;
  }
  const normalizedIssueValue = issueValue.trim();
  const normalizedExpectedPath = expectedPath.trim();
  const suffixIssueValue = normalizedIssueValue
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");

  return normalizedIssueValue === normalizedExpectedPath
    || normalizedIssueValue === path.basename(normalizedExpectedPath)
    || normalizedExpectedPath.endsWith(`/${suffixIssueValue}`);
}

function readWorkflowCoverage(body) {
  const workflowSection = readMarkdownSection(body, "Required Workflow Coverage");
  const covered = [];

  for (const workflow of REQUIRED_WORKFLOW_IDS) {
    const checkboxPattern = new RegExp(
      `-\\s*\\[\\s*x\\s*\\]\\s*(?:\`${escapeRegExp(workflow)}\`|${escapeRegExp(workflow)})`,
      "i"
    );
    if (checkboxPattern.test(workflowSection)) {
      covered.push(workflow);
    }
  }

  return {
    required: [...REQUIRED_WORKFLOW_IDS],
    covered,
    missing: REQUIRED_WORKFLOW_IDS.filter((workflow) => !covered.includes(workflow))
  };
}

function readAcceptedReportIssueUrls(body, trackingIssueUrl) {
  const testerSection = readMarkdownSection(body, "Required Real Tester Count")
    || readMarkdownSection(body, "Required Tester Count");
  if (testerSection.length === 0) {
    return [];
  }
  const urls = [];

  for (const match of testerSection.matchAll(GITHUB_ISSUE_URL_PATTERN)) {
    const url = match[0];
    if (
      normalizeUrl(url) !== normalizeUrl(trackingIssueUrl)
      && !urls.some((existing) => normalizeUrl(existing) === normalizeUrl(url))
    ) {
      urls.push(url);
    }
  }

  return urls;
}

function readMarkdownSection(body, title) {
  if (typeof body !== "string" || body.length === 0) {
    return "";
  }

  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, "im");
  const headingMatch = headingPattern.exec(body);
  if (!headingMatch) {
    return "";
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = body.slice(sectionStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);

  return (nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest).trim();
}

function normalizeIssueEvidence(issue) {
  const hasComments = Array.isArray(issue?.comments);

  return {
    body: typeof issue?.body === "string" ? issue.body : "",
    labels: Array.isArray(issue?.labels)
      ? issue.labels
        .map((label) => typeof label === "string" ? label.trim() : "")
        .filter(Boolean)
      : [],
    commentsAvailable: hasComments,
    comments: hasComments
      ? issue.comments.map(normalizeIssueComment)
      : undefined
  };
}

function createDefaultIo() {
  return {
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async readText(filePath) {
      return await readFile(filePath, "utf8");
    },
    async statFile(filePath) {
      return await stat(filePath);
    },
    async writeText(filePath, value) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, value);
    },
    async readIssue(issueUrl) {
      return await readIssueFromGitHub(issueUrl);
    },
    async readCurrentHead(rootDir) {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: rootDir
      });
      return stdout.trim();
    },
    async readChangedFilesBetween(baseSha, headSha, rootDir) {
      const { stdout } = await execFileAsync("git", ["diff", "--name-only", `${baseSha}..${headSha}`], {
        cwd: rootDir
      });
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    },
    async readFileAtCommit(commitSha, filePath, rootDir) {
      const { stdout } = await execFileAsync("git", ["show", `${commitSha}:${filePath}`], {
        cwd: rootDir
      });
      return stdout;
    }
  };
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
    "body,labels,comments"
  ]);
  const payload = JSON.parse(stdout);

  return {
    body: typeof payload.body === "string" ? payload.body : "",
    labels: Array.isArray(payload?.labels)
      ? payload.labels
        .map((label) => typeof label?.name === "string" ? label.name.trim() : "")
        .filter(Boolean)
      : [],
    comments: Array.isArray(payload?.comments)
      ? payload.comments.map((comment) => ({
        body: typeof comment?.body === "string" ? comment.body : "",
        url: typeof comment?.url === "string" ? comment.url : undefined,
        createdAt: typeof comment?.createdAt === "string" ? comment.createdAt : undefined
      }))
      : []
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
    || !/^\d+$/.test(segments[3])
  ) {
    throw new Error("issue URL must be a github.com/<owner>/<repo>/issues/<number> URL.");
  }

  return {
    repository: `${segments[0]}/${segments[1]}`,
    number: segments[3]
  };
}

function isGitHubIssueUrl(value) {
  try {
    parseGitHubIssueUrl(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runCli() {
  const defaults = createDefaultDogfoodStatusOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodStatusArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodStatusHelpText());
    return;
  }

  const result = await createDogfoodStatus(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
