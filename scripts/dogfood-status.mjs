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
const ASSIGNMENT_APP_BUNDLE_PREFLIGHT_HEADING = "## App Bundle Preflight";
const ASSIGNMENT_DESKTOP_SESSION_PREFLIGHT_HEADING = "## Desktop Session Preflight";
const TRACKING_ISSUE_DESKTOP_SESSION_PREFLIGHT_HEADING = "## Desktop Session Preflight";
const TRACKING_ISSUE_STRICT_DESKTOP_SESSION_PREFLIGHT_TEXT = "strict desktop-session preflight";
const ASSIGNMENT_PERMISSION_PREFLIGHT_HEADING = "## Permission Preflight";
const ASSIGNMENT_EVIDENCE_PREVIEW_HEADING = "## Evidence Preview Gate";
const ASSIGNMENT_PACKET_SCHEMA = "dogfood-assignments-v2";
const REPORT_PERMISSION_KEYS = [
  "screenRecording",
  "accessibility",
  "microphone",
  "speechRecognition"
];
const COMPUTER_USE_PERMISSION_KEYS = [
  "screenRecording",
  "accessibility"
];
const REQUIRED_WORKFLOW_IDS = [
  "coding-terminal",
  "screenshot-inspection",
  "finder-file",
  "browser-fallback"
];
const REQUIRED_STATUS_DOGFOOD_EVIDENCE = [
  "Panic stop product-path behavior evidence",
  "Long-horizon money-run supervision evidence",
  "Chrome Native Messaging heartbeat evidence"
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
  "scripts/package-macos-app.mjs"
]);
const LATEST_ALPHA_EVIDENCE_RELATIVE_PATH = path.join(
  "docs",
  "release-evidence",
  "latest-alpha.json"
);
const PASSED_COMPUTER_USE_SMOKE_COMMAND_ACTIONS = [
  "Run npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed --output .skfiy-smoke/ghostty-current.json after desktop preflight passes.",
  "Run npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-current.json after desktop preflight passes.",
  "Run npm run smoke:voice -- --app dist/skfiy.app --provider doubao --require-passed --output .skfiy-smoke/voice-current.json after desktop preflight passes."
];
const PASSED_NATIVE_SPEECH_SMOKE_COMMAND_ACTION = "Run npm run smoke:voice -- --app dist/skfiy.app --provider native-macos --require-passed --output .skfiy-smoke/voice-native-current.json after desktop preflight passes to prove the product-path native speech turn after Speech Recognition permission is granted.";
const APP_SCOPED_NATIVE_SPEECH_PERMISSION_ACTION = "Collect app-scoped Microphone and Speech Recognition evidence from smoke:ui permissionDiagnostics.active or the native voice smoke before requiring passed native speech evidence.";
const NATIVE_SPEECH_PERMISSION_KEYS = ["microphone", "speechRecognition"];
const DEFAULT_DOGFOOD_COHORT_PATH = ".skfiy-dogfood/internal-alpha-cohort.json";
const DEFAULT_DOGFOOD_COHORT_SUMMARY_PATH = ".skfiy-dogfood/internal-alpha-summary.md";
const DEFAULT_STRICT_DOGFOOD_COHORT_SUMMARY_PATH = ".skfiy-dogfood/internal-alpha-summary-strict.md";
const DEFAULT_STRICT_DOGFOOD_COHORT_JSON_PATH = ".skfiy-dogfood/internal-alpha-summary-strict.json";
const DEFAULT_DESKTOP_SESSION_ARTIFACT_PATH = ".skfiy-smoke/desktop-session-current.json";
const DEFAULT_DOGFOOD_STATUS_SUMMARY_PATH = ".skfiy-dogfood/status-current.md";
const DEFAULT_DOGFOOD_STATUS_JSON_PATH = ".skfiy-dogfood/status-current.json";
export function createDefaultDogfoodStatusOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    trackingIssueUrl: undefined,
    trackingIssueFile: undefined,
    summaryPath: undefined,
    jsonOutputPath: undefined,
    desktopSessionArtifactPath: undefined,
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
      case "--json-output":
        options.jsonOutputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--desktop-session-artifact":
        options.desktopSessionArtifactPath = path.resolve(readValue(argv, index, arg));
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
  const bodyPreflight = validateTrackingIssueBodyPreflight({
    body: trackingIssue.body
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
  const smokeArtifacts = await readSmokeArtifacts(manifest, options, io);
  const artifactResults = readArtifactResults(smokeArtifacts);
  const smokeArtifactProblems = readSmokeArtifactProblems(smokeArtifacts);
  const permissionEvidence = readPermissionEvidence(smokeArtifacts);
  const permissionStates = readPermissionStates(smokeArtifacts, permissionEvidence);
  const permissionBlockers = readPermissionBlockers(smokeArtifacts, permissionStates);
  const desktopSessionBlocker = readDesktopSessionBlocker(smokeArtifacts);
  const manifestChecks = await readManifestChecks(manifest, options, io);
  const missingRequiredReports = Math.max(0, 3 - verifiedRealAcceptedReportIssueUrls.length);
  const invalidReportIssueCount = reportIssueValidation.filter((issue) => !issue.ok).length;
  const currentHeadGateOk = !manifestChecks.currentHead?.required
    || manifestChecks.currentHead.ok === true;
  const requiredEvidenceGateOk = manifestChecks.requiredEvidence?.ok === true;
  const releaseEvidenceGateOk = manifestChecks.releaseEvidence?.available !== true
    || manifestChecks.releaseEvidence.ok === true;
  const canRunCollect = verifiedRealAcceptedReportIssueUrls.length >= 3
    && verifiedRealAcceptedReportIssueUrls.length <= 5
    && invalidReportIssueCount === 0
    && currentAlpha.ok
    && currentHeadGateOk
    && requiredEvidenceGateOk
    && releaseEvidenceGateOk
    && workflowCoverage.missing.length === 0;
  const canRunPassedCohort = canRunCollect && passedWorkflowCoverage.missing.length === 0;
  const result = canRunCollect ? "ready-to-collect" : "waiting-for-dogfood";
  const freshAlphaAction = readFreshAlphaBeforeTesterAssignmentAction(manifestChecks.currentHead);
  const testerAssignments = freshAlphaAction
    ? []
    : await readPreparedTesterAssignments({
      assignments: createTesterAssignments({
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
      }),
      manifest,
      rootDir: options.rootDir ?? DEFAULT_ROOT_DIR,
      io
    });
  const nextActions = createNextActions({
    canRunCollect,
    canRunPassedCohort,
    manifestPath: options.manifestPath,
    trackingIssueUrl: options.trackingIssueUrl,
    trackingIssueTarget: readTrackingIssueTarget(options),
    permissionBlockers,
    missingRequiredReports,
    manifestChecks,
    currentAlpha,
    workflowCoverage,
    passedWorkflowCoverage,
    invalidReportIssueCount,
    assignmentComment,
    bodyPreflight,
    testerAssignments,
    smokeArtifacts,
    permissionStates,
    permissionEvidence,
    smokeArtifactProblems,
    desktopSessionBlocker,
    requiredEvidenceCheck: manifestChecks.requiredEvidence
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
      bodyPreflight,
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
      permissionStates,
      permissionEvidence,
      permissionBlockers,
      desktopSessionBlocker
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
  if (typeof options.jsonOutputPath === "string") {
    await io.writeText(options.jsonOutputPath, `${JSON.stringify(status, null, 2)}\n`);
  }

  return status;
}

export function createDogfoodStatusHelpText() {
  return [
    "Usage: npm run dogfood:status -- --manifest <alpha-manifest> (--tracking-issue-url <issue-url> | --tracking-issue-file <markdown-path>) [--summary <markdown-path>] [--json-output <json-path>] [--desktop-session-artifact <json-path>] [--require-current-head]",
    "",
    "Creates a non-mutating dogfood readiness status report.",
    "It summarizes the alpha manifest, local smoke artifact results, permission blockers,",
    "and accepted report URLs recorded in the tracking issue or local tracking issue markdown file.",
    "It separates real tester readiness from local synthetic reports such as local-* and preflight-* runs.",
    "It separates verified accepted workflow coverage from passed product-path workflow coverage.",
    "It warns when app-build inputs changed after the selected alpha manifest commit.",
    "It reports whether the current alpha tester assignment packet is already posted as a tracking issue comment.",
    "It also emits recommended tester assignments with prepare/tester/review commands.",
    "Use --json-output to persist the same machine-readable status object without relying on npm stdout capture.",
    "Use --desktop-session-artifact with the latest smoke:desktop-session JSON to refresh stale loginwindow/display blockers.",
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
    `Required evidence current: ${status.manifest.checks.requiredEvidence?.ok ? "yes" : "no"}`,
    ...(status.manifest.checks.requiredEvidence?.missing?.length > 0
      ? status.manifest.checks.requiredEvidence.missing.map((evidence) => `Missing required evidence: ${evidence}`)
      : []),
    `Release evidence current: ${readReleaseEvidenceLabel(status.manifest.checks.releaseEvidence)}`,
    ...(status.manifest.checks.releaseEvidence?.ok === false
      ? status.manifest.checks.releaseEvidence.reasons.map((reason) => `Release evidence invalid: ${reason}`)
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
    "## Tracking Issue Body Preflight",
    "",
    ...(status.trackingIssue.bodyPreflight.ok
      ? ["- ok"]
      : status.trackingIssue.bodyPreflight.reasons.map((reason) => `- invalid: ${reason}`)),
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

  lines.push("", "## Permission Evidence", "");
  for (const permission of REPORT_PERMISSION_KEYS) {
    lines.push(formatPermissionEvidenceMarkdown(permission, status.localSmoke.permissionEvidence?.[permission]));
  }

  lines.push("", "## Desktop Session", "");
  if (status.localSmoke.desktopSessionBlocker) {
    lines.push(
      `- ${status.localSmoke.desktopSessionBlocker.state}: ${status.localSmoke.desktopSessionBlocker.reason}`
    );
  } else {
    lines.push("- none");
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

function formatPermissionEvidenceMarkdown(permission, evidence) {
  if (!evidence) {
    return `- ${permission}: unknown via none`;
  }

  const appScope = evidence.appScoped === true ? " (app-scoped)" : "";
  const directHelper = evidence.directHelper
    ? `; direct-helper ${evidence.directHelper.artifact} reports ${evidence.directHelper.state}, ${
      evidence.directHelper.authoritativeForAppScopedPermission === false
        ? "not authoritative for app-scoped permission"
        : "authoritative for app-scoped permission"
    }`
    : "";

  return `- ${permission}: ${evidence.state} via ${evidence.source}${appScope}${directHelper}`;
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

async function readSmokeArtifacts(manifest, options, io) {
  return {
    ui: await readOptionalJson(manifest?.uiSmokeArtifactPath, io),
    ghostty: await readOptionalJson(manifest?.smokeArtifactPath, io),
    chrome: await readOptionalJson(manifest?.chromeSmokeArtifactPath, io),
    finder: await readOptionalJson(manifest?.finderSmokeArtifactPath, io),
    voice: await readOptionalJson(manifest?.voiceSmokeArtifactPath, io),
    ...(typeof options.desktopSessionArtifactPath === "string"
      ? { desktopSession: await readOptionalJson(options.desktopSessionArtifactPath, io) }
      : {}),
    ...(typeof manifest?.moneyRunSmokeArtifactPath === "string"
      ? { "money-run": await readOptionalJson(manifest.moneyRunSmokeArtifactPath, io) }
      : {})
  };
}

async function readOptionalJson(filePath, io) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return undefined;
  }

  try {
    return await io.readJson(filePath);
  } catch (error) {
    return {
      artifactPath: filePath,
      artifactReadStatus: isMissingFileError(error) ? "missing" : "unreadable",
      artifactReadError: error instanceof Error ? error.message : String(error)
    };
  }
}

function readArtifactResults(smokeArtifacts) {
  return Object.fromEntries(
    Object.entries(smokeArtifacts).map(([name, artifact]) => [
      name,
      typeof artifact?.result === "string"
        ? artifact.result
        : typeof artifact?.artifactReadStatus === "string"
          ? artifact.artifactReadStatus
          : "missing"
    ])
  );
}

function readSmokeArtifactProblems(smokeArtifacts) {
  return Object.entries(smokeArtifacts)
    .filter(([, artifact]) =>
      artifact?.artifactReadStatus === "missing" || artifact?.artifactReadStatus === "unreadable"
    )
    .map(([name, artifact]) => ({
      name,
      status: artifact.artifactReadStatus,
      path: artifact.artifactPath
    }));
}

function isMissingFileError(error) {
  return error?.code === "ENOENT"
    || (error instanceof Error && /\bmissing\b|no such file/i.test(error.message));
}

function readPermissionBlockers(smokeArtifacts, permissionStates = readPermissionStates(smokeArtifacts)) {
  const requiredPermissionKeys = readRequiredPermissionKeys(smokeArtifacts);

  return requiredPermissionKeys
    .map((permission) => ({
      permission,
      state: permissionStates[permission]?.state ?? "unknown"
    }))
    .filter((item) => BLOCKING_PERMISSION_STATES.has(item.state));
}

function readDesktopSessionBlocker(smokeArtifacts) {
  const explicitDesktopSessionBlocker = readExplicitDesktopSessionBlocker(smokeArtifacts?.desktopSession);
  if (explicitDesktopSessionBlocker !== undefined) {
    return explicitDesktopSessionBlocker;
  }

  const diagnostics = smokeArtifacts?.ui?.desktopSessionDiagnostics;

  if (diagnostics?.state === "blocked") {
    return {
      state: "blocked",
      frontmostBundleId: diagnostics.status?.frontmostBundleId,
      frontmostProcessIdentifier: diagnostics.status?.frontmostProcessIdentifier,
      reason: typeof diagnostics.reason === "string" && diagnostics.reason.trim().length > 0
        ? diagnostics.reason
        : "Desktop session is blocked."
    };
  }

  return readDesktopPreflightBlocker(smokeArtifacts) ?? null;
}

function readExplicitDesktopSessionBlocker(artifact) {
  if (!artifact || artifact.artifactReadStatus) {
    return undefined;
  }

  const session = artifact.desktopSessionStatus ?? {};
  const frontmostBundleId = session.frontmostBundleId ?? artifact.activeApp?.bundleId;
  const frontmostProcessIdentifier =
    session.frontmostProcessIdentifier ?? artifact.activeApp?.pid;
  const displayAsleep = artifact.display?.mainDisplayAsleep === true
    || session.mainDisplayAsleep === true;
  const consoleLock = readConsoleLockStatus(artifact, session);
  const consoleLocked = consoleLock.ioConsoleLocked === true
    || consoleLock.cgSessionScreenIsLocked === true;
  const loginwindowActive = frontmostBundleId === "com.apple.loginwindow";
  const blackScreenshot = artifact.screenshot?.png?.isLikelyBlack === true;
  const blocked = artifact.result === "blocked"
    || session.controllable === false
    || displayAsleep
    || consoleLocked
    || loginwindowActive
    || blackScreenshot;

  if (!blocked) {
    return null;
  }

  return {
    state: "blocked",
    frontmostBundleId,
    frontmostProcessIdentifier,
    ioConsoleLocked: consoleLock.ioConsoleLocked,
    cgSessionScreenIsLocked: consoleLock.cgSessionScreenIsLocked,
    reason: createDesktopSessionArtifactBlockerReason({
      artifact,
      consoleLock,
      displayAsleep,
      frontmostBundleId,
      frontmostProcessIdentifier,
      loginwindowActive
    })
  };
}

function readConsoleLockStatus(artifact, session) {
  return {
    ioConsoleLocked: readOptionalBoolean(
      artifact.consoleLock?.ioConsoleLocked ?? session.ioConsoleLocked
    ),
    cgSessionScreenIsLocked: readOptionalBoolean(
      artifact.consoleLock?.cgSessionScreenIsLocked ?? session.cgSessionScreenIsLocked
    )
  };
}

function readOptionalBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function createDesktopSessionArtifactBlockerReason({
  artifact,
  consoleLock,
  displayAsleep,
  frontmostBundleId,
  frontmostProcessIdentifier,
  loginwindowActive
}) {
  const consoleLockEvidence = [];
  if (consoleLock.ioConsoleLocked === true) {
    consoleLockEvidence.push("IOConsoleLocked=true");
  }
  if (consoleLock.cgSessionScreenIsLocked === true) {
    consoleLockEvidence.push("CGSessionScreenIsLocked=true");
  }

  if (consoleLockEvidence.length > 0) {
    const pid = Number.isInteger(frontmostProcessIdentifier)
      ? ` (pid ${frontmostProcessIdentifier})`
      : "";
    const loginwindow = loginwindowActive ? ` and loginwindow is active${pid}` : "";
    const asleep = displayAsleep ? " while the main display is asleep" : "";
    return `Desktop console is locked (${consoleLockEvidence.join(", ")})${loginwindow}${asleep}. Unlock the Mac and keep the display awake, then retry.`;
  }

  return typeof artifact.reason === "string" && artifact.reason.trim().length > 0
    ? artifact.reason
    : "Desktop session artifact reports an uncontrollable desktop session.";
}

function readDesktopPreflightBlocker(smokeArtifacts) {
  for (const name of ["ghostty", "finder", "voice"]) {
    const preflight = smokeArtifacts?.[name]?.desktopPreflight;
    if (!preflight || preflight.result !== "blocked") {
      continue;
    }

    return {
      state: "blocked",
      frontmostBundleId: preflight.frontmost?.bundleId,
      frontmostProcessIdentifier: preflight.frontmost?.processIdentifier,
      reason: typeof preflight.reason === "string" && preflight.reason.trim().length > 0
        ? preflight.reason
        : "Desktop session is blocked before target app launch."
    };
  }

  return undefined;
}

function readPermissionStates(smokeArtifacts, permissionEvidence = readPermissionEvidence(smokeArtifacts)) {
  const permissionStates = {};

  for (const key of REPORT_PERMISSION_KEYS) {
    permissionStates[key] = { state: permissionEvidence[key]?.state ?? "unknown" };
  }

  return permissionStates;
}

function readPermissionEvidence(smokeArtifacts) {
  return Object.fromEntries(REPORT_PERMISSION_KEYS.map((permission) => [
    permission,
    readPermissionEvidenceForPermission(smokeArtifacts, permission)
  ]));
}

function readPermissionEvidenceForPermission(smokeArtifacts, permission) {
  const directHelper = readDirectHelperPermissionEvidence(smokeArtifacts, permission);
  const candidates = [];

  for (const [artifactName, artifact] of Object.entries(smokeArtifacts)) {
    candidates.push(
      readPermissionCandidate({
        artifact,
        artifactName,
        permission,
        source: `${artifactName}.permissionDiagnostics.active`,
        value: artifact?.permissionDiagnostics?.active?.[permission]?.state,
        appScoped: artifactName === "ui"
      }),
      readPermissionCandidate({
        artifact,
        artifactName,
        permission,
        source: `${artifactName}.permissionStates`,
        value: artifact?.permissionStates?.[permission]?.state,
        appScoped: artifactName === "ui"
      }),
      readPermissionCandidate({
        artifact,
        artifactName,
        permission,
        source: `${artifactName}.permissions`,
        value: artifact?.permissions?.[permission]?.state,
        appScoped: artifactName === "ui"
      }),
      readPermissionCandidate({
        artifact,
        artifactName,
        permission,
        source: `${artifactName}.speechStatus`,
        value: artifact?.speechStatus?.[permission]?.state
      })
    );
  }

  const selected = candidates.find((candidate) => candidate?.state !== "unknown")
    ?? candidates.find(Boolean)
    ?? readAuthoritativeDirectHelperPermissionCandidate(directHelper)
    ?? {
      state: "unknown",
      source: "none",
      artifact: undefined,
      artifactPath: undefined
    };

  return {
    ...selected,
    ...(directHelper ? { directHelper } : {})
  };
}

function readAuthoritativeDirectHelperPermissionCandidate(directHelper) {
  if (
    !directHelper
    || directHelper.authoritativeForAppScopedPermission === false
    || typeof directHelper.state !== "string"
    || directHelper.state.trim().length === 0
  ) {
    return undefined;
  }

  return {
    state: directHelper.state,
    source: `${directHelper.artifact}.permissions`,
    artifact: directHelper.artifact,
    artifactPath: directHelper.artifactPath,
    appScoped: false
  };
}

function readPermissionCandidate({
  artifact,
  artifactName,
  source,
  value,
  appScoped = false
}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return {
    state: value,
    source,
    artifact: artifactName,
    artifactPath: artifact?.artifactPath,
    appScoped
  };
}

function readDirectHelperPermissionEvidence(smokeArtifacts, permission) {
  for (const [artifactName, artifact] of Object.entries(smokeArtifacts)) {
    if (artifact?.permissionProbe?.scope !== "direct-helper") {
      continue;
    }

    const helperPermission = artifact?.permissions?.[permission];
    const state = readDirectHelperPermissionState(helperPermission);
    if (state === undefined) {
      continue;
    }

    return {
      artifact: artifactName,
      artifactPath: artifact.artifactPath,
      state,
      authoritativeForAppScopedPermission:
        !artifact.permissionProbe.nonAuthoritativeForAppScopedPermissionChecks?.includes(permission)
    };
  }

  return undefined;
}

function readDirectHelperPermissionState(permission) {
  return typeof permission?.state === "string" && permission.state.trim().length > 0
    ? permission.state
    : typeof permission?.status === "string" && permission.status.trim().length > 0
      ? permission.status
      : undefined;
}

function readRequiredPermissionKeys(smokeArtifacts) {
  const provider = smokeArtifacts?.voice?.provider;

  if (provider === "native-macos") {
    return REPORT_PERMISSION_KEYS;
  }

  if (provider === "browser") {
    return [...COMPUTER_USE_PERMISSION_KEYS, "microphone"];
  }

  return COMPUTER_USE_PERMISSION_KEYS;
}

async function readManifestChecks(manifest, options, io) {
  const checks = {
    currentHead: undefined,
    requiredEvidence: readRequiredDogfoodEvidenceCheck(manifest),
    zipReadable: false,
    releaseEvidence: await readReleaseEvidenceCheck(manifest, options, io)
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

function readRequiredDogfoodEvidenceCheck(manifest) {
  const evidence = Array.isArray(manifest?.requiredDogfoodEvidence)
    ? manifest.requiredDogfoodEvidence
    : [];
  const missing = REQUIRED_STATUS_DOGFOOD_EVIDENCE.filter((item) => !evidence.includes(item));

  return {
    ok: missing.length === 0,
    required: [...REQUIRED_STATUS_DOGFOOD_EVIDENCE],
    missing
  };
}

async function readReleaseEvidenceCheck(manifest, options, io) {
  const evidencePath = readReleaseEvidencePath(options);

  try {
    const evidence = await io.readJson(evidencePath);
    const reasons = readReleaseEvidenceMismatchReasons({
      evidence,
      manifest,
      manifestPath: options.manifestPath,
      trackingIssueUrl: options.trackingIssueUrl
    });

    return {
      available: true,
      ok: reasons.length === 0,
      path: evidencePath,
      expectedTag: readManifestAlphaTag(manifest),
      actualTag: typeof evidence?.tagName === "string" ? evidence.tagName : undefined,
      reasons
    };
  } catch (error) {
    return {
      available: false,
      ok: null,
      path: evidencePath,
      reason: isMissingFileError(error)
        ? "release evidence file is missing"
        : error instanceof Error ? error.message : String(error)
    };
  }
}

function readReleaseEvidencePath(options) {
  if (typeof options.releaseEvidencePath === "string" && options.releaseEvidencePath.trim().length > 0) {
    return options.releaseEvidencePath;
  }

  return path.join(
    options.rootDir ?? DEFAULT_ROOT_DIR,
    LATEST_ALPHA_EVIDENCE_RELATIVE_PATH
  );
}

function readReleaseEvidenceMismatchReasons({
  evidence,
  manifest,
  manifestPath,
  trackingIssueUrl
}) {
  const reasons = [];
  const expectedTag = readManifestAlphaTag(manifest);
  const expectedReleaseUrl = readManifestReleaseUrl(manifest, trackingIssueUrl);
  const expectedCommitSha = typeof manifest?.commitSha === "string" ? manifest.commitSha.trim() : "";
  const expectedArtifactBaseName =
    typeof manifest?.artifactBaseName === "string" ? manifest.artifactBaseName.trim() : "";
  const expectedZipPath = typeof manifest?.zip?.path === "string" ? manifest.zip.path : "";
  const expectedZipSha256 = typeof manifest?.zip?.sha256 === "string" ? manifest.zip.sha256.trim() : "";
  const expectedMoneyRunSmokePath = typeof manifest?.moneyRunSmokeArtifactPath === "string"
    ? manifest.moneyRunSmokeArtifactPath
    : "";

  if (evidence?.tagName !== expectedTag) {
    reasons.push("release evidence tagName does not match manifest commit");
  }
  if (evidence?.releaseUrl !== expectedReleaseUrl) {
    reasons.push("release evidence releaseUrl does not match manifest commit");
  }
  if (evidence?.commitSha !== expectedCommitSha) {
    reasons.push("release evidence commitSha does not match manifest commitSha");
  }
  if (evidence?.artifactBaseName !== expectedArtifactBaseName) {
    reasons.push("release evidence artifactBaseName does not match manifest artifactBaseName");
  }
  if (!matchesIssuePathOrBasename(String(evidence?.manifestPath ?? ""), manifestPath)) {
    reasons.push("release evidence manifestPath does not match selected manifest");
  }
  if (!matchesIssuePathOrBasename(String(evidence?.zipPath ?? ""), expectedZipPath)) {
    reasons.push("release evidence zipPath does not match manifest zip.path");
  }
  if (evidence?.zipSha256 !== expectedZipSha256) {
    reasons.push("release evidence zipSha256 does not match manifest zip.sha256");
  }
  if (
    expectedMoneyRunSmokePath
    && !matchesIssuePathOrBasename(
      String(evidence?.smokeArtifacts?.moneyRun ?? ""),
      expectedMoneyRunSmokePath
    )
  ) {
    reasons.push("release evidence moneyRun smoke artifact does not match manifest moneyRunSmokeArtifactPath");
  }

  return reasons;
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

function readReleaseEvidenceLabel(releaseEvidence) {
  if (!releaseEvidence || releaseEvidence.available !== true) {
    return "unavailable";
  }
  return releaseEvidence.ok === true ? "yes" : "no";
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
  manifestPath,
  trackingIssueUrl,
  trackingIssueTarget,
  smokeArtifacts,
  permissionStates,
  permissionEvidence,
  permissionBlockers,
  missingRequiredReports,
  manifestChecks,
  currentAlpha,
  workflowCoverage,
  passedWorkflowCoverage,
  invalidReportIssueCount,
  assignmentComment,
  bodyPreflight,
  testerAssignments = [],
  smokeArtifactProblems = [],
  desktopSessionBlocker,
  requiredEvidenceCheck
}) {
  const actions = [];
  const freshAlphaAction = readFreshAlphaBeforeTesterAssignmentAction(manifestChecks.currentHead);

  if (currentAlpha.ok !== true) {
    actions.push(`Update ${trackingIssueTarget} Current Alpha section to match the selected manifest before collecting reports.`);
  }
  if (bodyPreflight?.ok === false) {
    actions.push(`Refresh ${trackingIssueTarget} with dogfood:tracking-issue before asking testers to use --require-passed.`);
    const trackingIssueCommand = createDogfoodTrackingIssueCommand({
      manifestPath,
      trackingIssueUrl,
      currentAlphaTag: assignmentComment?.currentAlphaTag
    });
    if (trackingIssueCommand) {
      actions.push(`${trackingIssueCommand} to refresh ${trackingIssueTarget}.`);
    }
  }
  if (freshAlphaAction) {
    actions.push(freshAlphaAction);
  }
  if (missingRequiredReports > 0) {
    actions.push(`Collect at least 3 accepted real tester report issue URLs in ${trackingIssueTarget}.`);
  }
  if (
    assignmentComment?.available === true
    && assignmentComment.ok !== true
    && testerAssignments.length > 0
  ) {
    actions.push(`Post the current ${assignmentComment.currentAlphaTag} tester assignment packet to ${trackingIssueTarget} before asking more testers to run it.`);
    const assignmentsCommand = createDogfoodAssignmentsCommand({
      manifestPath,
      trackingIssueUrl,
      currentAlphaTag: assignmentComment.currentAlphaTag
    });
    if (assignmentsCommand) {
      actions.push(`${assignmentsCommand} to post the current ${assignmentComment.currentAlphaTag} packet.`);
    }
  }
  if (!freshAlphaAction && assignmentComment?.ok !== false) {
    actions.push(...createTesterPrepareNextActions(testerAssignments));
  }
  if (invalidReportIssueCount > 0) {
    actions.push("Review or replace stale/invalid dogfood report issue URLs before collecting the cohort.");
  }
  if (smokeArtifactProblems.length > 0) {
    const summary = smokeArtifactProblems
      .map((problem) => `${problem.name} (${problem.path})`)
      .join(", ");
    actions.push(`Regenerate or attach missing smoke artifacts before relying on local readiness: ${summary}.`);
  }
  if (requiredEvidenceCheck?.missing?.length > 0) {
    const summary = requiredEvidenceCheck.missing.join(", ");
    actions.push(`Regenerate the alpha artifact so the manifest requires ${summary} before assigning dogfood testers.`);
  }
  if (desktopSessionBlocker) {
    actions.push("Unlock the Mac and keep the display awake before requiring passed Ghostty/Finder/voice Computer Use evidence.");
    actions.push("After unlocking, rerun npm run smoke:desktop-session -- --app dist/skfiy.app --output .skfiy-smoke/desktop-session-current.json before collecting passed Computer Use evidence.");
    const desktopStatusCommand = createDesktopSessionStatusRefreshCommand({
      manifestPath,
      trackingIssueUrl
    });
    if (desktopStatusCommand) {
      actions.push(`${desktopStatusCommand} after smoke:desktop-session rerun to refresh desktop readiness.`);
    }
    actions.push("When desktop preflight passes, rerun packaged product smokes with --require-passed for Ghostty, Finder, and voice.");
    actions.push(...PASSED_COMPUTER_USE_SMOKE_COMMAND_ACTIONS);
  }
  if (needsNativeSpeechProductPathEvidence({ smokeArtifacts, permissionEvidence })) {
    actions.push(PASSED_NATIVE_SPEECH_SMOKE_COMMAND_ACTION);
  } else if (needsAppScopedNativeSpeechPermissionEvidence({ smokeArtifacts, permissionEvidence })) {
    actions.push(APP_SCOPED_NATIVE_SPEECH_PERMISSION_ACTION);
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
  if (manifestChecks.releaseEvidence?.available === true && manifestChecks.releaseEvidence.ok !== true) {
    actions.push(
      `Refresh ${LATEST_ALPHA_EVIDENCE_RELATIVE_PATH} so it points at the selected ${manifestChecks.releaseEvidence.expectedTag} release before handing off the alpha.`
    );
  }
  if (canRunCollect) {
    actions.push("Run npm run dogfood:collect with the current manifest and tracking issue.");
    const collectCommand = createDogfoodCollectCommand({ manifestPath, trackingIssueUrl });
    if (collectCommand) {
      actions.push(`${collectCommand}.`);
    }
    if (canRunPassedCohort) {
      actions.push("After collecting, run npm run dogfood:cohort -- --require-passed on the collected cohort JSON.");
      actions.push(`${createStrictDogfoodCohortCommand()} after dogfood:collect succeeds.`);
    } else {
      actions.push("Do not run npm run dogfood:cohort -- --require-passed until passed workflow coverage is complete.");
    }
  }
  if (actions.length === 0) {
    actions.push("Run npm run dogfood:collect, then npm run dogfood:cohort on the collected cohort JSON.");
  }

  return actions;
}

function readFreshAlphaBeforeTesterAssignmentAction(currentHead) {
  if (
    !currentHead
    || currentHead.ok === true
    || (currentHead.required !== true && currentHead.appCodeOk === true)
  ) {
    return undefined;
  }

  return currentHead.required === true
    ? "Regenerate the alpha artifact so manifest commitSha matches the current HEAD."
    : "Publish a fresh alpha artifact from the current HEAD before assigning new dogfood testers, or intentionally keep testing the older selected alpha.";
}

function needsNativeSpeechProductPathEvidence({ smokeArtifacts, permissionEvidence }) {
  if (smokeArtifacts?.voice?.provider === "native-macos" && smokeArtifacts.voice.result === "passed") {
    return false;
  }

  return NATIVE_SPEECH_PERMISSION_KEYS.every((permission) =>
    isUsableNativeSpeechPermissionEvidence(permissionEvidence?.[permission])
  );
}

function needsAppScopedNativeSpeechPermissionEvidence({ smokeArtifacts, permissionEvidence }) {
  if (smokeArtifacts?.voice?.provider === "native-macos" && smokeArtifacts.voice.result === "passed") {
    return false;
  }

  return NATIVE_SPEECH_PERMISSION_KEYS.some((permission) => {
    const evidence = permissionEvidence?.[permission];
    return isNonBlockingPermissionEvidence(evidence)
      && !isAppLaunchedPermissionEvidence(evidence);
  });
}

function isUsableNativeSpeechPermissionEvidence(evidence) {
  return isNonBlockingPermissionEvidence(evidence) && isAppLaunchedPermissionEvidence(evidence);
}

function isNonBlockingPermissionEvidence(evidence) {
  const state = evidence?.state;
  return typeof state === "string"
    && state.trim().length > 0
    && state !== "unknown"
    && !BLOCKING_PERMISSION_STATES.has(state);
}

function isAppLaunchedPermissionEvidence(evidence) {
  return evidence?.appScoped === true
    || evidence?.artifact === "voice"
    || evidence?.source === "voice.speechStatus";
}

function createTesterPrepareNextActions(testerAssignments) {
  if (!Array.isArray(testerAssignments) || testerAssignments.length === 0) {
    return [];
  }

  return testerAssignments
    .filter((assignment) =>
      typeof assignment?.testerId === "string"
      && assignment.testerId.trim().length > 0
      && Array.isArray(assignment.workflows)
      && assignment.workflows.length > 0
      && typeof assignment.commands?.prepareAlpha === "string"
      && assignment.commands.prepareAlpha.trim().length > 0
    )
    .map((assignment) => {
      if (
        assignment.preparedAlpha?.ok === true
        && typeof assignment.commands?.tester === "string"
        && assignment.commands.tester.trim().length > 0
      ) {
        return `Run ${assignment.commands.tester.trim()} to collect ${assignment.testerId.trim()} evidence for workflows ${assignment.workflows.join(",")} after desktop preflight passes.`;
      }
      return `Run ${assignment.commands.prepareAlpha.trim()} to prepare ${assignment.testerId.trim()} for workflows ${assignment.workflows.join(",")}.`;
    });
}

function createDesktopSessionStatusRefreshCommand({ manifestPath, trackingIssueUrl }) {
  if (
    typeof manifestPath !== "string"
    || manifestPath.trim().length === 0
    || typeof trackingIssueUrl !== "string"
    || !isGitHubIssueUrl(trackingIssueUrl)
  ) {
    return "";
  }

  return [
    "Run npm run dogfood:status --",
    "--manifest",
    manifestPath.trim(),
    "--tracking-issue-url",
    trackingIssueUrl.trim(),
    "--desktop-session-artifact",
    DEFAULT_DESKTOP_SESSION_ARTIFACT_PATH,
    "--summary",
    DEFAULT_DOGFOOD_STATUS_SUMMARY_PATH,
    "--json-output",
    DEFAULT_DOGFOOD_STATUS_JSON_PATH
  ].join(" ");
}

function createDogfoodCollectCommand({ manifestPath, trackingIssueUrl }) {
  if (
    typeof manifestPath !== "string"
    || manifestPath.trim().length === 0
    || typeof trackingIssueUrl !== "string"
    || !isGitHubIssueUrl(trackingIssueUrl)
  ) {
    return "";
  }

  return [
    "Run npm run dogfood:collect --",
    "--manifest",
    manifestPath.trim(),
    "--tracking-issue-url",
    trackingIssueUrl.trim(),
    "--cohort",
    DEFAULT_DOGFOOD_COHORT_PATH,
    "--summary",
    DEFAULT_DOGFOOD_COHORT_SUMMARY_PATH
  ].join(" ");
}

function createDogfoodAssignmentsCommand({ manifestPath, trackingIssueUrl, currentAlphaTag }) {
  if (
    typeof manifestPath !== "string"
    || manifestPath.trim().length === 0
    || typeof trackingIssueUrl !== "string"
    || !isGitHubIssueUrl(trackingIssueUrl)
    || typeof currentAlphaTag !== "string"
    || currentAlphaTag.trim().length === 0
  ) {
    return "";
  }

  const alphaTag = currentAlphaTag.trim();
  return [
    "Run npm run dogfood:assignments --",
    "--manifest",
    manifestPath.trim(),
    "--tracking-issue-url",
    trackingIssueUrl.trim(),
    "--output",
    `.skfiy-dogfood/assignments/${alphaTag}.md`,
    "--json-output",
    `.skfiy-dogfood/assignments/${alphaTag}.json`,
    "--execute"
  ].join(" ");
}

function createDogfoodTrackingIssueCommand({ manifestPath, trackingIssueUrl, currentAlphaTag }) {
  if (
    typeof manifestPath !== "string"
    || manifestPath.trim().length === 0
    || typeof trackingIssueUrl !== "string"
    || !isGitHubIssueUrl(trackingIssueUrl)
    || typeof currentAlphaTag !== "string"
    || currentAlphaTag.trim().length === 0
  ) {
    return "";
  }

  const shortSha = currentAlphaTag.trim().replace(/^skfiy-alpha-/, "");
  return [
    "Run npm run dogfood:tracking-issue --",
    "--manifest",
    manifestPath.trim(),
    "--tracking-issue-url",
    trackingIssueUrl.trim(),
    "--output",
    `.skfiy-dogfood/tracking-issue-${shortSha}.md`,
    "--execute"
  ].join(" ");
}

function createStrictDogfoodCohortCommand() {
  return [
    "Run npm run dogfood:cohort --",
    "--cohort",
    DEFAULT_DOGFOOD_COHORT_PATH,
    "--summary",
    DEFAULT_STRICT_DOGFOOD_COHORT_SUMMARY_PATH,
    "--json-output",
    DEFAULT_STRICT_DOGFOOD_COHORT_JSON_PATH,
    "--require-passed"
  ].join(" ");
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

async function readPreparedTesterAssignments({ assignments, manifest, rootDir, io }) {
  if (!Array.isArray(assignments) || assignments.length === 0 || typeof io.exists !== "function") {
    return assignments;
  }

  const preparedAlpha = await readPreparedAlphaPaths({ manifest, rootDir, io });
  if (preparedAlpha.ok !== true) {
    return assignments;
  }

  return assignments.map((assignment) => ({
    ...assignment,
    preparedAlpha,
    commands: {
      ...assignment.commands,
      tester: replacePreparedAlphaCommandPlaceholders(assignment.commands?.tester, preparedAlpha),
      review: replacePreparedAlphaCommandPlaceholders(assignment.commands?.review, preparedAlpha)
    }
  }));
}

async function readPreparedAlphaPaths({ manifest, rootDir, io }) {
  const alphaTag = readManifestAlphaTag(manifest);
  const artifactBaseName = readManifestArtifactBaseName(manifest);
  if (!artifactBaseName) {
    return { ok: false };
  }

  const manifestPath = path.join(rootDir, ".skfiy-dogfood", "downloads", alphaTag, `${artifactBaseName}.json`);
  const appPath = path.join(rootDir, ".skfiy-dogfood", "apps", alphaTag, "skfiy.app");
  const manifestExists = await io.exists(manifestPath);
  const appExists = await io.exists(appPath);
  const manifestMatches = manifestExists === true
    ? await readPreparedAlphaManifestMatchesSelected({ preparedManifestPath: manifestPath, manifest, io })
    : false;

  return {
    ok: manifestExists === true && appExists === true && manifestMatches === true,
    manifestPath,
    appPath
  };
}

async function readPreparedAlphaManifestMatchesSelected({ preparedManifestPath, manifest, io }) {
  if (typeof io.readJson !== "function") {
    return false;
  }

  try {
    const preparedManifest = await io.readJson(preparedManifestPath);
    return alphaManifestIdentityMatches(preparedManifest, manifest);
  } catch {
    return false;
  }
}

function alphaManifestIdentityMatches(candidate, selected) {
  const candidateIdentity = readAlphaManifestIdentity(candidate);
  const selectedIdentity = readAlphaManifestIdentity(selected);

  return Object.keys(selectedIdentity).every((key) => {
    const expected = selectedIdentity[key];
    return expected.length > 0 && candidateIdentity[key] === expected;
  });
}

function readAlphaManifestIdentity(manifest) {
  return {
    appName: typeof manifest?.appName === "string" ? manifest.appName.trim() : "",
    bundleIdentifier: typeof manifest?.bundleIdentifier === "string" ? manifest.bundleIdentifier.trim() : "",
    commitSha: typeof manifest?.commitSha === "string" ? manifest.commitSha.trim() : "",
    artifactBaseName: readManifestArtifactBaseName(manifest),
    zipSha256: typeof manifest?.zip?.sha256 === "string" ? manifest.zip.sha256.trim() : ""
  };
}

function readManifestArtifactBaseName(manifest) {
  if (typeof manifest?.artifactBaseName === "string" && manifest.artifactBaseName.trim().length > 0) {
    return manifest.artifactBaseName.trim();
  }
  if (typeof manifest?.zip?.path !== "string" || manifest.zip.path.trim().length === 0) {
    return "";
  }
  return path.basename(manifest.zip.path.trim(), ".zip");
}

function replacePreparedAlphaCommandPlaceholders(command, preparedAlpha) {
  if (typeof command !== "string") {
    return command;
  }
  return command
    .replace(PREPARED_ALPHA_MANIFEST_PLACEHOLDER, preparedAlpha.manifestPath)
    .replace("<path-to-unzipped-skfiy.app>", preparedAlpha.appPath);
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
  const testerTrackingIssueArgs = readReviewTrackingIssueArgs({ trackingIssueUrl });

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
      ...testerTrackingIssueArgs,
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

function validateTrackingIssueBodyPreflight({ body }) {
  const issueBody = typeof body === "string" ? body : "";
  const reasons = [];

  if (!issueBody.includes(TRACKING_ISSUE_DESKTOP_SESSION_PREFLIGHT_HEADING)) {
    reasons.push("tracking issue body is missing Desktop Session Preflight");
  } else if (!issueBody.includes(TRACKING_ISSUE_STRICT_DESKTOP_SESSION_PREFLIGHT_TEXT)) {
    reasons.push("tracking issue body is missing strict desktop-session preflight guidance");
  }

  return {
    ok: reasons.length === 0,
    reasons
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
  const commentsWithAppBundlePreflight = matchingComments.filter((comment) =>
    comment.body.includes(ASSIGNMENT_APP_BUNDLE_PREFLIGHT_HEADING)
  );
  const commentsWithDesktopSessionPreflight = commentsWithAppBundlePreflight.filter((comment) =>
    comment.body.includes(ASSIGNMENT_DESKTOP_SESSION_PREFLIGHT_HEADING)
  );
  const commentsWithPermissionPreflight = commentsWithDesktopSessionPreflight.filter((comment) =>
    comment.body.includes(ASSIGNMENT_PERMISSION_PREFLIGHT_HEADING)
  );
  const completeComments = commentsWithPermissionPreflight.filter((comment) =>
    comment.body.includes(ASSIGNMENT_EVIDENCE_PREVIEW_HEADING)
  );
  const currentSchemaComments = completeComments.filter((comment) =>
    hasCurrentAssignmentPacketSchema(comment.body)
  );
  const reasons = [];
  const latestComment = currentSchemaComments.at(-1)
    ?? completeComments.at(-1)
    ?? commentsWithDesktopSessionPreflight.at(-1)
    ?? commentsWithAppBundlePreflight.at(-1)
    ?? matchingComments.at(-1);

  if (commentsAvailable !== true) {
    reasons.push("tracking issue comments were not loaded");
  } else if (matchingComments.length === 0) {
    reasons.push(`tracking issue does not have a current ${currentAlphaTag} tester assignment packet comment`);
  } else if (commentsWithAppBundlePreflight.length === 0) {
    reasons.push(`current ${currentAlphaTag} tester assignment packet comment is missing App Bundle Preflight`);
  } else if (commentsWithDesktopSessionPreflight.length === 0) {
    reasons.push(`current ${currentAlphaTag} tester assignment packet comment is missing Desktop Session Preflight`);
  } else if (commentsWithPermissionPreflight.length === 0) {
    reasons.push(`current ${currentAlphaTag} tester assignment packet comment is missing Permission Preflight`);
  } else if (completeComments.length === 0) {
    reasons.push(`current ${currentAlphaTag} tester assignment packet comment is missing Evidence Preview Gate`);
  } else if (currentSchemaComments.length === 0) {
    reasons.push(`current ${currentAlphaTag} tester assignment packet comment is from an older schema`);
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

function hasCurrentAssignmentPacketSchema(body) {
  const schemaLinePattern = new RegExp(
    `^Packet schema:\\s*${escapeRegExp(ASSIGNMENT_PACKET_SCHEMA)}\\s*$`,
    "im"
  );

  return schemaLinePattern.test(body);
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
  reasons.push(...validateIssueAppBundlePreflightEvidence(issue.body));
  reasons.push(...validateIssuePanicStopEvidence(issue.body));

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

function validateIssueAppBundlePreflightEvidence(body) {
  const section = readIssueSection(body, "app bundle preflight");
  if (section.length === 0) {
    return ["missing app bundle preflight evidence"];
  }

  const evidence = readIssueKeyValueSection(section);
  const appPath = evidence.get("appPath");
  const launch = evidence.get("launch");
  const appLaunchViaOpen = evidence.get("appLaunchViaOpen");
  const runnerHasTmux = evidence.get("runnerHasTmux");
  const productPath = evidence.get("productPath");
  const reasons = [];

  if (!appPath) {
    reasons.push("app bundle preflight evidence must include appPath");
  } else if (!path.isAbsolute(appPath)) {
    reasons.push("app bundle preflight appPath must be absolute");
  } else if (path.basename(appPath) !== "skfiy.app") {
    reasons.push("app bundle preflight appPath must point to lowercase skfiy.app");
  }

  if (!launch) {
    reasons.push("app bundle preflight evidence must include launch");
  } else if (!launch.includes("open -na")) {
    reasons.push("app bundle preflight launch must use LaunchServices open -na");
  } else if (appPath && !launch.includes(appPath)) {
    reasons.push("app bundle preflight launch must include appPath");
  }

  if (appLaunchViaOpen !== "true") {
    reasons.push("app bundle preflight appLaunchViaOpen must be true");
  }

  if (runnerHasTmux !== "false") {
    reasons.push("app bundle preflight runnerHasTmux must be false");
  }

  if (!productPath || productPath === "not available") {
    reasons.push("app bundle preflight productPath must be recorded");
  }

  return reasons;
}

function validateIssuePanicStopEvidence(body) {
  const section = readIssueSection(body, "panic stop");
  if (section.length === 0) {
    return ["missing panic stop evidence"];
  }

  const evidence = readIssueKeyValueSection(section);
  const accelerator = evidence.get("accelerator");
  const label = evidence.get("label");
  const registered = evidence.get("registered");
  const source = evidence.get("source");
  const behaviorResult = evidence.get("behaviorResult");
  const behaviorSource = evidence.get("behaviorSource");
  const behaviorBeforeStatus = evidence.get("behaviorBeforeStatus");
  const behaviorAfterStatus = evidence.get("behaviorAfterStatus");
  const behaviorAfterMessage = evidence.get("behaviorAfterMessage");
  const reasons = [];

  if (accelerator !== "Control+Alt+Shift+Esc") {
    reasons.push("panic stop evidence accelerator must match runtime hotkey");
  }
  if (label !== "Ctrl Opt Shift Esc") {
    reasons.push("panic stop evidence label must match runtime hotkey");
  }
  if (registered !== "true") {
    reasons.push("panic stop evidence registered must be true");
  }
  if (source !== "runtimeStatus.stopTurnHotkey") {
    reasons.push("panic stop evidence source must be runtimeStatus.stopTurnHotkey");
  }
  if (behaviorResult !== "passed") {
    reasons.push("panic stop behaviorResult must be passed");
  }
  if (behaviorSource !== "renderer-escape-key-product-path") {
    reasons.push("panic stop behaviorSource must be renderer-escape-key-product-path");
  }
  if (behaviorBeforeStatus !== "approval_required") {
    reasons.push("panic stop behaviorBeforeStatus must be approval_required");
  }
  if (behaviorAfterStatus !== "idle") {
    reasons.push("panic stop behaviorAfterStatus must be idle");
  }
  if (!behaviorAfterMessage || !behaviorAfterMessage.includes("Task stopped")) {
    reasons.push("panic stop behaviorAfterMessage must include Task stopped");
  }

  return reasons;
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
  const normalizedIssueValue = normalizeComparableIssuePath(issueValue);
  const normalizedExpectedPath = normalizeComparableIssuePath(expectedPath);
  const issueBasename = path.posix.basename(normalizedIssueValue);
  const expectedBasename = path.posix.basename(normalizedExpectedPath);

  return normalizedIssueValue === normalizedExpectedPath
    || normalizedIssueValue === expectedBasename
    || issueBasename === expectedBasename
    || normalizedExpectedPath.endsWith(`/${normalizedIssueValue}`);
}

function normalizeComparableIssuePath(value) {
  return String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
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
    async exists(filePath) {
      try {
        await stat(filePath);
        return true;
      } catch {
        return false;
      }
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
