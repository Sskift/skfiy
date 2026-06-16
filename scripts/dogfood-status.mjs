#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GITHUB_ISSUE_URL_PATTERN = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/g;
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
const BLOCKING_PERMISSION_STATES = new Set([
  "denied",
  "not-determined",
  "blocked",
  "unavailable"
]);
const SYNTHETIC_TESTER_ID_PREFIXES = [
  "local-",
  "prepare-",
  "preflight-",
  "synthetic-"
];

export function createDefaultDogfoodStatusOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    trackingIssueUrl: undefined,
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
  const trackingIssue = normalizeIssueEvidence(await io.readIssue(options.trackingIssueUrl));
  const currentAlpha = validateTrackingIssueCurrentAlpha({
    body: trackingIssue.body,
    manifest,
    manifestPath: options.manifestPath
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
  const canRunCollect = verifiedRealAcceptedReportIssueUrls.length >= 3
    && verifiedRealAcceptedReportIssueUrls.length <= 5
    && invalidReportIssueCount === 0
    && currentAlpha.ok
    && workflowCoverage.missing.length === 0;
  const result = canRunCollect ? "ready-to-collect" : "waiting-for-dogfood";
  const nextActions = createNextActions({
    canRunCollect,
    permissionBlockers,
    missingRequiredReports,
    manifestChecks,
    currentAlpha,
    workflowCoverage,
    passedWorkflowCoverage,
    invalidReportIssueCount
  });

  const status = {
    result,
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: options.manifestPath,
    trackingIssueUrl: options.trackingIssueUrl,
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
      cohortReady: false
    },
    nextActions
  };

  if (typeof options.summaryPath === "string") {
    await io.writeText(options.summaryPath, createDogfoodStatusMarkdown(status));
  }

  return status;
}

export function createDogfoodStatusHelpText() {
  return [
    "Usage: npm run dogfood:status -- --manifest <alpha-manifest> --tracking-issue-url <issue-url> [--summary <markdown-path>] [--require-current-head]",
    "",
    "Creates a non-mutating dogfood readiness status report.",
    "It summarizes the alpha manifest, local smoke artifact results, permission blockers,",
    "and accepted report URLs recorded in the tracking issue.",
    "It separates real tester readiness from local synthetic reports such as local-* and preflight-* runs.",
    "It separates verified accepted workflow coverage from passed product-path workflow coverage.",
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
    `Accepted report URLs: ${status.trackingIssue.acceptedReportCount}/3 minimum`,
    `Verified accepted report URLs: ${status.trackingIssue.verifiedAcceptedReportCount}/3 minimum`,
    `Verified real accepted report URLs: ${status.trackingIssue.verifiedRealAcceptedReportCount}/3 minimum`,
    "",
    "## Current Alpha Identity",
    "",
    ...(status.trackingIssue.currentAlpha.ok
      ? ["- ok"]
      : status.trackingIssue.currentAlpha.reasons.map((reason) => `- invalid: ${reason}`)),
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

  return `${lines.join("\n")}\n`;
}

function validateStatusOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.trackingIssueUrl !== "string" || options.trackingIssueUrl.trim().length === 0) {
    throw new Error("Missing --tracking-issue-url <url>.");
  }
  if (!isGitHubIssueUrl(options.trackingIssueUrl)) {
    throw new Error("--tracking-issue-url must be a GitHub issue URL.");
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

  if (options.requireCurrentHead) {
    const currentHeadSha = typeof options.currentHeadSha === "string"
      ? options.currentHeadSha
      : await io.readCurrentHead(options.rootDir ?? DEFAULT_ROOT_DIR);
    checks.currentHead = {
      expected: currentHeadSha,
      ok: manifest?.commitSha === currentHeadSha
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

function createNextActions({
  canRunCollect,
  permissionBlockers,
  missingRequiredReports,
  manifestChecks,
  currentAlpha,
  workflowCoverage,
  passedWorkflowCoverage,
  invalidReportIssueCount
}) {
  const actions = [];

  if (currentAlpha.ok !== true) {
    actions.push("Update GitHub issue #1 Current Alpha section to match the selected manifest before collecting reports.");
  }
  if (missingRequiredReports > 0) {
    actions.push("Collect at least 3 accepted real tester report issue URLs in GitHub issue #1.");
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
  if (manifestChecks.currentHead && manifestChecks.currentHead.ok !== true) {
    actions.push("Regenerate the alpha artifact so manifest commitSha matches the current HEAD.");
  }
  if (canRunCollect) {
    actions.push("Run npm run dogfood:collect with the current manifest and tracking issue.");
  }
  if (actions.length === 0) {
    actions.push("Run npm run dogfood:collect, then npm run dogfood:cohort on the collected cohort JSON.");
  }

  return actions;
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

  return {
    reasons,
    testerId,
    realTester: realTesterDecision.ok,
    realTesterReasons: realTesterDecision.ok ? [] : [realTesterDecision.message],
    workflows,
    result
  };
}

function readRealTesterDecision(testerId) {
  if (typeof testerId !== "string" || testerId.trim().length === 0) {
    return {
      ok: false,
      message: "missing tester id"
    };
  }

  const normalized = testerId.trim();
  const lower = normalized.toLowerCase();
  const syntheticPrefix = SYNTHETIC_TESTER_ID_PREFIXES.find((prefix) =>
    lower.startsWith(prefix)
  );
  if (syntheticPrefix) {
    return {
      ok: false,
      message: `tester id ${normalized} is reserved for local synthetic runs`
    };
  }

  return {
    ok: true,
    message: "tester id counts as a real tester"
  };
}

function readVerifiedReportWorkflowCoverage(reportIssueValidation) {
  const covered = [];

  for (const issue of reportIssueValidation) {
    if (!issue.ok) {
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
    if (!issue.ok || issue.result !== "passed") {
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
  const testerSection = readMarkdownSection(body, "Required Tester Count");
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
  return {
    body: typeof issue?.body === "string" ? issue.body : "",
    labels: Array.isArray(issue?.labels)
      ? issue.labels
        .map((label) => typeof label === "string" ? label.trim() : "")
        .filter(Boolean)
      : []
  };
}

function createDefaultIo() {
  return {
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
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
    "body,labels"
  ]);
  const payload = JSON.parse(stdout);

  return {
    body: typeof payload.body === "string" ? payload.body : "",
    labels: Array.isArray(payload?.labels)
      ? payload.labels
        .map((label) => typeof label?.name === "string" ? label.name.trim() : "")
        .filter(Boolean)
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
