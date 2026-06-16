#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createDogfoodReportFromManifest } from "./update-dogfood-cohort.mjs";
import { verifyDogfoodCohort } from "./verify-dogfood-cohort.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_COHORT_NAME = "internal-alpha";
const GITHUB_ISSUE_URL_PATTERN = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/g;

export function createDefaultDogfoodCollectOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    trackingIssueUrl: undefined,
    reportsDir: path.join(rootDir, ".skfiy-dogfood", "reports"),
    cohortPath: path.join(rootDir, ".skfiy-dogfood", "internal-alpha-cohort.json"),
    summaryPath: undefined,
    cohortName: DEFAULT_COHORT_NAME,
    help: false
  };
}

export function parseDogfoodCollectArgs(argv, defaults) {
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
      case "--reports-dir":
        options.reportsDir = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--cohort":
        options.cohortPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--summary":
        options.summaryPath = path.resolve(readValue(argv, index, arg));
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

export async function collectDogfoodCohort(options, io = createDefaultIo()) {
  validateCollectOptions(options);

  const trackingIssue = normalizeIssueEvidence(await io.readIssue(options.trackingIssueUrl));
  const reportIssueUrls = readAcceptedReportIssueUrls(trackingIssue.body, options.trackingIssueUrl);
  if (reportIssueUrls.length === 0) {
    throw new Error("Tracking issue does not list any accepted dogfood report issue URLs.");
  }

  const reportEntries = [];

  await io.mkdir(options.reportsDir, { recursive: true });

  for (const issueUrl of reportIssueUrls) {
    const report = await createDogfoodReportFromManifest({
      manifestPath: options.manifestPath,
      issueUrl,
      now: options.now
    }, io);
    const reportPath = path.join(options.reportsDir, `${sanitizeReportFileName(report.testerId)}.json`);

    await io.writeJson(reportPath, report);
    upsertReportEntry(reportEntries, {
      report,
      testerId: report.testerId,
      issueUrl,
      reportPath
    });
  }

  const cohort = {
    schemaVersion: 1,
    cohortName: readCohortName(options),
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: options.manifestPath,
    reports: reportEntries.map((entry) => entry.report)
  };

  await io.mkdir(path.dirname(options.cohortPath), { recursive: true });
  await io.writeJson(options.cohortPath, cohort);

  const verification = await verifyDogfoodCohort({
    cohortPath: options.cohortPath,
    summaryPath: options.summaryPath
  }, io);

  return {
    result: "collected",
    trackingIssueUrl: options.trackingIssueUrl,
    reportIssueUrls,
    reports: reportEntries.map(({ testerId, issueUrl, reportPath }) => ({
      testerId,
      issueUrl,
      reportPath
    })),
    cohortPath: options.cohortPath,
    ...(typeof options.summaryPath === "string" ? { summaryPath: options.summaryPath } : {}),
    verification
  };
}

function upsertReportEntry(entries, nextEntry) {
  const existingIndex = entries.findIndex((entry) => entry.testerId === nextEntry.testerId);
  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
    return;
  }

  entries.push(nextEntry);
}

export function createDogfoodCollectHelpText() {
  return [
    "Usage: npm run dogfood:collect -- --manifest <alpha-manifest> --tracking-issue-url <issue-url> [--reports-dir <dir>] [--cohort <path>] [--summary <markdown-path>]",
    "",
    "Collects accepted report issue URLs from the internal dogfood tracking issue.",
    "Each accepted report issue is still parsed through dogfood:report's manifest-backed checks:",
    "accepted labels, workflow labels, alpha identity, smoke artifact paths, and artifactPath identity.",
    "The generated cohort is then checked with dogfood:cohort; failed verification keeps the command from claiming readiness.",
    "",
    "This command reduces maintainer copy/paste work. It does not fabricate tester reports or weaken cohort gates."
  ].join("\n");
}

function validateCollectOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.trackingIssueUrl !== "string" || options.trackingIssueUrl.trim().length === 0) {
    throw new Error("Missing --tracking-issue-url <url>.");
  }
  if (!isGitHubIssueUrl(options.trackingIssueUrl)) {
    throw new Error("--tracking-issue-url must be a GitHub issue URL.");
  }
  if (typeof options.reportsDir !== "string") {
    throw new Error("Missing --reports-dir <dir>.");
  }
  if (typeof options.cohortPath !== "string") {
    throw new Error("Missing --cohort <path>.");
  }
}

function readAcceptedReportIssueUrls(body, trackingIssueUrl) {
  const testerSection = readMarkdownSection(body, "Required Real Tester Count")
    || readMarkdownSection(body, "Required Tester Count");
  if (testerSection.length === 0) {
    throw new Error("Tracking issue must include a Required Real Tester Count or Required Tester Count section.");
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

function sanitizeReportFileName(testerId) {
  const value = typeof testerId === "string" ? testerId.trim() : "";
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  if (sanitized.length === 0) {
    throw new Error("Report testerId is required before writing a report file.");
  }

  return sanitized;
}

function readCohortName(options) {
  return typeof options.cohortName === "string" && options.cohortName.trim().length > 0
    ? options.cohortName
    : DEFAULT_COHORT_NAME;
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
    async writeText(filePath, value) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, value);
    },
    async readIssue(issueUrl) {
      return await readIssueFromGitHub(issueUrl);
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
  const defaults = createDefaultDogfoodCollectOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodCollectArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodCollectHelpText());
    return;
  }

  const result = await collectDogfoodCohort(options);
  console.log(JSON.stringify(result, null, 2));

  if (result.verification?.result !== "passed") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
