#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { isRealDogfoodTesterId } from "./dogfood-tester-id.mjs";
import { createDogfoodReportFromManifest } from "./update-dogfood-cohort.mjs";
import { REQUIRED_DOGFOOD_WORKFLOWS, verifyDogfoodCohort } from "./verify-dogfood-cohort.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TRACKING_ISSUE_URL = "https://github.com/Sskift/skfiy/issues/1";
const ACCEPTED_LABEL = "dogfood:accepted";

export function createDefaultDogfoodReviewOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    issueUrl: undefined,
    trackingIssueUrl: DEFAULT_TRACKING_ISSUE_URL,
    summaryPath: undefined,
    requireCurrentHead: false,
    help: false
  };
}

export function parseDogfoodReviewArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--issue-url":
        options.issueUrl = readValue(argv, index, arg);
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

export async function reviewDogfoodReport(options, io = createDefaultIo()) {
  validateOptions(options);

  const manifest = await io.readJson(options.manifestPath);
  if (options.requireCurrentHead === true) {
    const currentHead = await io.readCurrentHead();
    if (typeof manifest?.commitSha !== "string" || manifest.commitSha !== currentHead) {
      throw new Error(`Manifest commitSha must match current HEAD ${currentHead}.`);
    }
  }

  const issue = normalizeIssue(await io.readIssue(options.issueUrl));
  if (!issue.body) {
    throw new Error("GitHub issue body is required for dogfood:review.");
  }

  const testerId = readTesterIdFromIssueBody(issue.body);
  const workflows = readWorkflowsFromIssueBody(issue.body);
  if (!testerId) {
    throw new Error("Issue tester id field is empty.");
  }
  if (workflows.length === 0) {
    throw new Error("Issue cohort workflows field is empty.");
  }

  const suggestedLabels = [
    ACCEPTED_LABEL,
    ...workflows.map((workflow) => `workflow:${workflow}`)
  ];
  const currentLabels = issue.labels;
  const missingSuggestedLabels = suggestedLabels.filter((label) => !currentLabels.includes(label));
  const reportPreview = await createDogfoodReportFromManifest({
    manifestPath: options.manifestPath,
    issueUrl: options.issueUrl,
    issueLabels: suggestedLabels,
    now: options.now
  }, {
    ...io,
    async readIssue() {
      return {
        body: issue.body,
        labels: suggestedLabels
      };
    }
  });
  const reportPreviewEligibility = await verifyReportPreviewEligibility(reportPreview, options);
  const eligibleForAcceptance = reportPreviewEligibility.eligible === true;
  const acceptanceCommand = eligibleForAcceptance && missingSuggestedLabels.length > 0
    ? createAcceptanceCommand(options.issueUrl, missingSuggestedLabels)
    : undefined;
  const trackingIssueCommand = eligibleForAcceptance && isRealDogfoodTesterId(testerId)
    ? createTrackingIssueCommand({
      manifestPath: options.manifestPath,
      issueUrl: options.issueUrl,
      trackingIssueUrl: readTrackingIssueUrl(options),
      manifest
    })
    : undefined;
  const result = {
    result: "reviewed",
    eligibleForAcceptance,
    issueUrl: options.issueUrl,
    testerId,
    workflows,
    suggestedLabels,
    currentLabels,
    missingSuggestedLabels,
    acceptanceCommand,
    trackingIssueCommand,
    reportPreview,
    reportPreviewEligibility
  };

  if (typeof options.summaryPath === "string") {
    await io.mkdir(path.dirname(options.summaryPath), { recursive: true });
    await io.writeText(options.summaryPath, createDogfoodReviewSummary(result));
  }

  return result;
}

export function createDogfoodReviewHelpText() {
  return [
    "Usage: npm run dogfood:review -- --manifest <alpha-manifest> --issue-url <filed-report-issue-url> [--summary <path>]",
    "",
    "Runs a non-mutating maintainer review for one filed skfiy dogfood report issue.",
    "It reads the real issue body, validates alpha identity and smoke artifact paths through dogfood:report,",
    "then prints suggested labels, a copy-safe acceptance command, and a real-tester tracking issue command.",
    "It does not add labels, edit the tracking issue, or count the report toward dogfood:cohort.",
    "",
    "Options:",
    "  --manifest <path>          Alpha manifest to compare against the report issue.",
    "  --issue-url <url>          Filed GitHub dogfood report issue URL.",
    "  --tracking-issue-url <url> Internal dogfood tracking issue URL. Default: https://github.com/Sskift/skfiy/issues/1.",
    "  --summary <path>           Optional Markdown review summary.",
    "  --require-current-head     Fail when manifest commitSha does not match local HEAD.",
    "  -h, --help                 Show this help.",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

async function verifyReportPreviewEligibility(reportPreview, options) {
  const cohortPath = path.join(
    options.rootDir ?? DEFAULT_ROOT_DIR,
    ".skfiy-dogfood",
    "review-report-preview-cohort.json"
  );
  const cohort = {
    schemaVersion: 1,
    cohortName: "review-report-preview",
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: reportPreview.manifestPath,
    reports: [reportPreview]
  };
  const result = await verifyDogfoodCohort({
    cohortPath
  }, {
    async readJson(filePath) {
      if (filePath !== cohortPath) {
        throw new Error(`Unexpected synthetic cohort path: ${filePath}`);
      }

      return cohort;
    }
  });
  const blockingChecks = result.checks.filter((check) =>
    check.ok !== true
      && (
        check.id === "cohort.manifestPath"
        || check.id.startsWith("report.")
      )
  );

  return {
    eligible: blockingChecks.length === 0,
    blockingChecks
  };
}

function createDogfoodReviewSummary(review) {
  return [
    "# skfiy dogfood report review",
    "",
    `Result: ${review.result}`,
    `Eligible for acceptance: ${review.eligibleForAcceptance ? "yes" : "no"}`,
    `Issue: ${review.issueUrl}`,
    `Tester: ${review.testerId}`,
    `Workflows: ${review.workflows.join(", ")}`,
    "",
    "## Suggested Labels",
    "",
    ...review.suggestedLabels.map((label) => `- ${label}`),
    "",
    "## Missing Suggested Labels",
    "",
    ...(review.missingSuggestedLabels.length > 0
      ? review.missingSuggestedLabels.map((label) => `- ${label}`)
      : ["- none"]),
    "",
    "## Blocking Checks",
    "",
    ...(review.reportPreviewEligibility.blockingChecks.length > 0
      ? review.reportPreviewEligibility.blockingChecks.map((check) =>
        `- ${check.id}: ${check.message}`
      )
      : ["- none"]),
    "",
    "## Acceptance Command",
    "",
    ...(review.eligibleForAcceptance
      ? [review.acceptanceCommand
        ? `\`${review.acceptanceCommand}\``
        : "- all suggested labels are already present"]
      : ["- unavailable until blocking checks are resolved"]),
    "",
    "## Tracking Issue Command",
    "",
    ...(review.trackingIssueCommand
      ? [`\`${review.trackingIssueCommand}\``]
      : ["- unavailable for synthetic tester ids or unresolved blocking checks"]),
    "",
    "This review did not add labels, edit GitHub, or count the report toward the cohort.",
    ""
  ].join("\n");
}

function createAcceptanceCommand(issueUrl, labels) {
  const parsed = parseGitHubIssueUrl(issueUrl);

  return [
    "gh",
    "issue",
    "edit",
    String(parsed.issueNumber),
    "--repo",
    parsed.repository,
    ...labels.flatMap((label) => ["--add-label", label])
  ].join(" ");
}

function createTrackingIssueCommand({ manifestPath, issueUrl, trackingIssueUrl, manifest }) {
  const shortSha = typeof manifest?.commitSha === "string"
    ? manifest.commitSha.slice(0, 7)
    : "alpha";

  return [
    "npm",
    "run",
    "dogfood:tracking-issue",
    "--",
    "--manifest",
    manifestPath,
    "--tracking-issue-url",
    trackingIssueUrl,
    "--accepted-report-url",
    issueUrl,
    "--output",
    `.skfiy-dogfood/tracking-issue-${shortSha}.md`
  ].join(" ");
}

function validateOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.issueUrl !== "string" || options.issueUrl.trim().length === 0) {
    throw new Error("Missing --issue-url <url>.");
  }
  if (typeof options.trackingIssueUrl === "string" && options.trackingIssueUrl.trim().length === 0) {
    throw new Error("Missing --tracking-issue-url <url>.");
  }
}

function readTrackingIssueUrl(options) {
  return typeof options.trackingIssueUrl === "string" && options.trackingIssueUrl.trim().length > 0
    ? options.trackingIssueUrl.trim()
    : DEFAULT_TRACKING_ISSUE_URL;
}

function normalizeIssue(issue) {
  return {
    body: typeof issue?.body === "string" ? issue.body : "",
    labels: Array.isArray(issue?.labels)
      ? issue.labels.map((label) => typeof label === "string" ? label.trim() : "").filter(Boolean)
      : []
  };
}

function readTesterIdFromIssueBody(body) {
  return readIssueSection(body, "tester id")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "_No response_") ?? "";
}

function readWorkflowsFromIssueBody(body) {
  const section = readIssueSection(body, "cohort workflows");
  const workflows = [];

  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[[xX]\]\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const workflow = normalizeWorkflowLabel(match[1]);
    if (REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow) && !workflows.includes(workflow)) {
      workflows.push(workflow);
    }
  }

  return workflows;
}

function normalizeWorkflowLabel(value) {
  return value.replaceAll("`", "").trim();
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function createDefaultIo() {
  return {
    mkdir,
    async writeText(filePath, text) {
      await writeFile(filePath, text);
    },
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async readIssue(issueUrl) {
      return await readIssueFromGitHub(issueUrl);
    },
    async readCurrentHead() {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: DEFAULT_ROOT_DIR
      });
      return stdout.trim();
    }
  };
}

async function readIssueFromGitHub(issueUrl) {
  const parsed = parseGitHubIssueUrl(issueUrl);
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "view",
    String(parsed.issueNumber),
    "--repo",
    parsed.repository,
    "--json",
    "body,labels"
  ], {
    maxBuffer: 16 * 1024 * 1024
  });
  const issue = JSON.parse(stdout);

  return {
    body: typeof issue.body === "string" ? issue.body : "",
    labels: Array.isArray(issue.labels)
      ? issue.labels
        .map((label) => typeof label?.name === "string" ? label.name.trim() : "")
        .filter(Boolean)
      : []
  };
}

function parseGitHubIssueUrl(issueUrl) {
  const url = new URL(issueUrl);
  if (url.hostname !== "github.com") {
    throw new Error("--issue-url must point to github.com.");
  }
  const [, owner, repo, type, issueNumberText] = url.pathname.split("/");
  const issueNumber = Number.parseInt(issueNumberText, 10);
  if (!owner || !repo || type !== "issues" || !Number.isInteger(issueNumber)) {
    throw new Error("--issue-url must be a GitHub issue URL.");
  }

  return {
    repository: `${owner}/${repo}`,
    issueNumber
  };
}

async function main() {
  const defaults = createDefaultDogfoodReviewOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodReviewArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(`${createDogfoodReviewHelpText()}\n`);
    return;
  }

  const result = await reviewDogfoodReport(options);
  process.stdout.write(`${JSON.stringify({
    result: result.result,
    eligibleForAcceptance: result.eligibleForAcceptance,
    issueUrl: result.issueUrl,
    testerId: result.testerId,
    workflows: result.workflows,
    suggestedLabels: result.suggestedLabels,
    missingSuggestedLabels: result.missingSuggestedLabels,
    acceptanceCommand: result.acceptanceCommand,
    trackingIssueCommand: result.trackingIssueCommand,
    reportPreviewEligibility: result.reportPreviewEligibility
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
