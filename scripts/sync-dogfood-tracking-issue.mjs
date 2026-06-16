#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REQUIRED_DOGFOOD_WORKFLOWS } from "./verify-dogfood-cohort.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TRACKING_ISSUE_URL = "https://github.com/Sskift/skfiy/issues/1";
const GITHUB_ISSUE_URL_PATTERN = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/g;
const PREPARED_ALPHA_MANIFEST_PLACEHOLDER = "<path-to-downloaded-alpha-manifest.json>";
const PERMISSION_LABELS = {
  screenRecording: "Screen Recording",
  accessibility: "Accessibility",
  microphone: "Microphone",
  speechRecognition: "Speech Recognition"
};

export function createDefaultDogfoodTrackingIssueOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    releaseUrl: undefined,
    trackingIssueUrl: DEFAULT_TRACKING_ISSUE_URL,
    acceptedReportIssueUrls: [],
    outputPath: undefined,
    dryRun: true,
    help: false
  };
}

export function parseDogfoodTrackingIssueArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--release-url":
        options.releaseUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--tracking-issue-url":
        options.trackingIssueUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--accepted-report-url":
        options.acceptedReportIssueUrls = [
          ...(Array.isArray(options.acceptedReportIssueUrls) ? options.acceptedReportIssueUrls : []),
          readValue(argv, index, arg)
        ];
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--execute":
        options.dryRun = false;
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

export async function syncDogfoodTrackingIssue(options, io = createDefaultIo()) {
  validateOptions(options);

  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const manifest = await io.readJson(options.manifestPath);
  validateManifest(manifest);
  const shortSha = manifest.commitSha.slice(0, 7);
  const outputPath = typeof options.outputPath === "string"
    ? options.outputPath
    : path.join(rootDir, ".skfiy-dogfood", `tracking-issue-${shortSha}.md`);
  const releaseUrl = typeof options.releaseUrl === "string" && options.releaseUrl.trim().length > 0
    ? options.releaseUrl.trim()
    : createReleaseUrlFromTrackingIssue(options.trackingIssueUrl, shortSha);
  const uiSmokeArtifact = await readOptionalJson(manifest.uiSmokeArtifactPath, io);
  const existingTrackingIssue = await readOptionalIssue(options.trackingIssueUrl, io);
  const body = createDogfoodTrackingIssueBody({
    rootDir,
    manifestPath: options.manifestPath,
    manifest,
    releaseUrl,
    trackingIssueUrl: options.trackingIssueUrl,
    acceptedReportIssueUrls: options.acceptedReportIssueUrls,
    existingBody: existingTrackingIssue?.body,
    uiSmokeArtifact
  });

  await io.mkdir(path.dirname(outputPath), { recursive: true });
  await io.writeText(outputPath, body);

  if (options.dryRun !== false) {
    return createResult({
      result: "planned",
      dryRun: true,
      manifest,
      releaseUrl,
      trackingIssueUrl: options.trackingIssueUrl,
      outputPath
    });
  }

  const issue = parseGitHubIssueUrl(options.trackingIssueUrl);
  await io.execFile("gh", [
    "issue",
    "edit",
    issue.number,
    "--repo",
    issue.repository,
    "--body-file",
    outputPath
  ]);

  return createResult({
    result: "updated",
    dryRun: false,
    manifest,
    releaseUrl,
    trackingIssueUrl: options.trackingIssueUrl,
    outputPath
  });
}

export function createDogfoodTrackingIssueBody({
  rootDir = DEFAULT_ROOT_DIR,
  manifestPath,
  manifest,
  releaseUrl,
  trackingIssueUrl,
  acceptedReportIssueUrls,
  existingBody,
  uiSmokeArtifact
}) {
  validateManifest(manifest);
  const shortSha = manifest.commitSha.slice(0, 7);
  const relativeManifestPath = relativeRepoPath(rootDir, manifestPath);
  const relativeUiSmokePath = relativeRepoPath(rootDir, manifest.uiSmokeArtifactPath);
  const preflightSummaryPath = relativeRepoPath(
    rootDir,
    derivePreflightSummaryPath(rootDir, manifest.uiSmokeArtifactPath, shortSha)
  );
  const permissionLine = createPermissionLine(readPermissionStates(uiSmokeArtifact));
  const preservedReportIssueUrls = mergeAcceptedReportIssueUrls(
    readAcceptedReportIssueUrls(existingBody, trackingIssueUrl),
    acceptedReportIssueUrls,
    trackingIssueUrl
  );
  const testerSlotLines = createTesterSlotLines(preservedReportIssueUrls);
  const testerAssignmentLines = createRecommendedTesterAssignmentLines({
    acceptedReportCount: preservedReportIssueUrls.length,
    relativeManifestPath,
    releaseUrl,
    trackingIssueUrl
  });
  const missingRealTesterCount = Math.max(0, 3 - preservedReportIssueUrls.length);

  return [
    "## Goal",
    "Collect 3-5 real packaged-app dogfood reports for the current lowercase `skfiy` internal alpha, then pass the cohort verifier without weakening the gate.",
    "",
    "This issue tracks coordination only. Each real tester report should still be filed as its own `skfiy dogfood report` issue, reviewed with `dogfood:review`, accepted with `dogfood:accepted` plus matching `workflow:*` labels, then converted into local cohort JSON with `dogfood:report` or `dogfood:collect`.",
    "",
    "## Current Alpha",
    `- Release: ${releaseUrl}`,
    `- Manifest: \`${relativeManifestPath}\``,
    `- Zip: \`${path.basename(manifest.zip.path)}\``,
    `- Zip SHA256: \`${manifest.zip.sha256}\``,
    `- Commit: \`${manifest.commitSha}\``,
    `- Bundle id: \`${manifest.bundleIdentifier}\``,
    `- App name: \`${manifest.appName}\``,
    "- Source metadata gate requires: `dogfood:accepted` plus matching `workflow:*` issue labels",
    "- Real tester gate excludes tester ids beginning with `local-`, `prepare-`, `preflight-`, or `synthetic-`",
    "- Passed workflow coverage is separate from source-eligible workflow coverage; blocked permission evidence must not be described as passed product-path evidence",
    "",
    "## Required Workflow Coverage",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `- Required: \`${workflow}\``),
    "",
    "Workflow coverage is computed from verified accepted report issue labels by `dogfood:status`, not from this checklist.",
    "",
    "## Required Real Tester Count",
    ...testerSlotLines,
    "",
    "## Recommended Tester Assignments",
    ...testerAssignmentLines,
    "",
    "## Local Synthetic Evidence",
    `- Strict permission preflight summary: \`${preflightSummaryPath}\``,
    `- UI artifact: \`${relativeUiSmokePath}\``,
    `- Observed current permission blockers: ${permissionLine}`,
    "- The preflight launched `dist/skfiy.app` via LaunchServices and stopped after `smoke:ui`, before Ghostty/Chrome/Finder/voice strict smokes.",
    "- This preflight proves the tester runner fail-fast behavior; it is not a filed accepted dogfood report and does not count toward the 3 real tester minimum.",
    "- Local and preflight evidence is not linked as current-alpha real tester evidence.",
    "",
    "## Status Command",
    "```bash",
    formatMultilineCommand("npm run dogfood:status --", [
      ["--manifest", relativeManifestPath],
      ["--tracking-issue-url", trackingIssueUrl],
      ["--summary", `.skfiy-dogfood/status-${shortSha}.md`]
    ]),
    "```",
    "",
    "## Prepare Alpha Command",
    "```bash",
    formatMultilineCommand("npm run dogfood:prepare-alpha --", [
      ["--release-url", releaseUrl],
      ["--tester-id", "<stable-real-tester-id>"],
      ["--tracking-issue-url", trackingIssueUrl],
      ["--execute"]
    ]),
    "```",
    "",
    "## Tester Runner",
    "For one real tester machine, collect all five packaged-app smoke artifacts and generate a checked issue body from the exact artifacts written by the run:",
    "",
    `Replace \`${PREPARED_ALPHA_MANIFEST_PLACEHOLDER}\` with the manifest path printed by \`dogfood:prepare-alpha\` on the tester machine.`,
    "After `dogfood:prepare-alpha --execute` finishes, copy `nextCommands.tester` from its JSON output for the tester run.",
    "After the dogfood issue is filed, copy `nextCommands.review` from the same prepare output and replace `<filed-dogfood-issue-url>`.",
    "",
    "```bash",
    formatMultilineCommand("npm run dogfood:tester --", [
      ["--manifest", PREPARED_ALPHA_MANIFEST_PLACEHOLDER],
      ["--app", "<path-to-unzipped-skfiy.app>"],
      ["--tester-id", "<stable-real-tester-id>"],
      ["--workflows", "<comma-separated-workflow-ids>"],
      ["--artifacts-dir", ".skfiy-smoke/dogfood/<stable-real-tester-id>"],
      ["--issue-output", ".skfiy-dogfood/issues/<stable-real-tester-id>.md"],
      ["--summary", ".skfiy-dogfood/<stable-real-tester-id>-summary.md"],
      ["--file-issue"]
    ]),
    "```",
    "",
    "Use `--require-passed` only after the tester grants Screen Recording, Accessibility, Microphone, and Speech Recognition to `skfiy.app`. In strict mode, `dogfood:tester` treats the UI smoke as a permission preflight and stops before the longer Computer Use smokes when those permissions are missing.",
    "",
    "## Review Command",
    "```bash",
    formatMultilineCommand("npm run dogfood:review --", [
      ["--manifest", PREPARED_ALPHA_MANIFEST_PLACEHOLDER],
      ["--issue-url", "<filed-dogfood-issue-url>"],
      ["--tracking-issue-url", trackingIssueUrl],
      ["--summary", ".skfiy-dogfood/reviews/<stable-real-tester-id>.md"]
    ]),
    "```",
    "",
    "## Cohort Gate",
    "```bash",
    formatMultilineCommand("npm run dogfood:cohort --", [
      ["--cohort", `.skfiy-dogfood/internal-alpha-cohort-${shortSha}.json`],
      ["--summary", `.skfiy-dogfood/internal-alpha-summary-${shortSha}.md`]
    ]),
    "```",
    "",
    "For final product-path evidence:",
    "",
    "```bash",
    formatMultilineCommand("npm run dogfood:cohort --", [
      ["--cohort", `.skfiy-dogfood/internal-alpha-cohort-${shortSha}.json`],
      ["--summary", `.skfiy-dogfood/internal-alpha-summary-${shortSha}-strict.md`],
      ["--require-passed"]
    ]),
    "```",
    "",
    "## Current Known Gaps",
    missingRealTesterCount >= 3
      ? "- No accepted real tester report is linked yet for this alpha. The cohort still needs at least 3 distinct real tester reports."
      : `- The cohort still needs at least ${missingRealTesterCount} more distinct real tester report${missingRealTesterCount === 1 ? "" : "s"}.`,
    "- Passed native voice, Finder, Ghostty, screenshot, and browser product-path evidence still depends on testers granting macOS Screen Recording, Accessibility, Microphone, and Speech Recognition permissions to the alpha `skfiy.app` bundle.",
    "- Signing and notarization still require configured Apple Developer ID/notary credentials before broader distribution.",
    ""
  ].join("\n");
}

export function createDogfoodTrackingIssueHelpText() {
  return [
    "Usage: npm run dogfood:tracking-issue -- --manifest <alpha-manifest> [--release-url <url>] [--tracking-issue-url <url>] [--output <path>] [--execute]",
    "",
    "Generates the internal dogfood tracking issue body from the selected alpha manifest.",
    "When the tracking issue is readable, it preserves existing accepted report issue URLs while refreshing the Current Alpha fields.",
    "By default this is a dry-run: it writes the body to a local Markdown file and does not edit GitHub.",
    "Pass --execute to run gh issue edit with the generated body.",
    "",
    "Options:",
    "  --release-url <url>          GitHub alpha release URL. Defaults from the tracking issue repo and manifest commit.",
    "  --tracking-issue-url <url>   GitHub tracking issue URL. Defaults to https://github.com/Sskift/skfiy/issues/1.",
    "  --accepted-report-url <url>  Accepted report issue URL to place in the next available tester slot. Repeatable.",
    "  --output <path>              Markdown body output path. Defaults to .skfiy-dogfood/tracking-issue-<commit>.md.",
    "  --execute                    Edit the GitHub issue after writing the local body.",
    "  --dry-run                    Write the local body without editing GitHub."
  ].join("\n");
}

function createResult({ result, dryRun, manifest, releaseUrl, trackingIssueUrl, outputPath }) {
  return {
    result,
    dryRun,
    trackingIssueUrl,
    releaseUrl,
    outputPath,
    manifest: {
      appName: manifest.appName,
      commitSha: manifest.commitSha,
      artifactBaseName: manifest.artifactBaseName,
      zipPath: manifest.zip.path
    }
  };
}

async function readOptionalJson(filePath, io) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return undefined;
  }
  try {
    return await io.readJson(filePath);
  } catch {
    return undefined;
  }
}

async function readOptionalIssue(issueUrl, io) {
  if (typeof io.readIssue !== "function") {
    return undefined;
  }
  try {
    return await io.readIssue(issueUrl);
  } catch {
    return undefined;
  }
}

function createTesterSlotLines(issueUrls) {
  const urls = Array.isArray(issueUrls) ? issueUrls.slice(0, 5) : [];
  const lines = [];

  for (let index = 0; index < 3; index += 1) {
    lines.push(`- [ ] Tester ${index + 1} accepted report issue URL:${formatOptionalUrl(urls[index])}`);
  }
  for (let index = 3; index < 5; index += 1) {
    lines.push(`- [ ] Optional tester ${index + 1} accepted report issue URL:${formatOptionalUrl(urls[index])}`);
  }

  return lines;
}

function formatOptionalUrl(url) {
  return typeof url === "string" && url.trim().length > 0 ? ` ${url.trim()}` : "";
}

function createRecommendedTesterAssignmentLines({
  acceptedReportCount,
  relativeManifestPath,
  releaseUrl,
  trackingIssueUrl
}) {
  const remainingRequiredSlots = Math.max(0, 3 - acceptedReportCount);
  if (remainingRequiredSlots === 0) {
    return [
      "- No default tester split is generated because the required tester slots are already filled.",
      "- Run `dogfood:status` to validate accepted issue labels, workflow coverage, and passed workflow coverage."
    ];
  }

  return distributeInitialWorkflows(remainingRequiredSlots).flatMap((workflows, index) => {
    const testerId = `tester-${acceptedReportCount + index + 1}`;
    const workflowList = workflows.join(",");

    return [
      `- \`${testerId}\`: \`${workflowList}\``,
      `  - Prepare: \`${formatSingleLineCommand("npm run dogfood:prepare-alpha --", [
        ["--release-url", releaseUrl],
        ["--tester-id", testerId],
        ["--tracking-issue-url", trackingIssueUrl],
        ["--execute"]
      ])}\``,
      "  - After Prepare: copy `nextCommands.tester` from the prepare-alpha JSON output.",
      `  - Run: \`${formatSingleLineCommand("npm run dogfood:tester --", [
        ["--manifest", PREPARED_ALPHA_MANIFEST_PLACEHOLDER],
        ["--app", "<path-to-unzipped-skfiy.app>"],
        ["--tester-id", testerId],
        ["--workflows", workflowList],
        ["--artifacts-dir", `.skfiy-smoke/dogfood/${testerId}`],
        ["--issue-output", `.skfiy-dogfood/issues/${testerId}.md`],
        ["--summary", `.skfiy-dogfood/${testerId}-summary.md`],
        ["--file-issue"]
      ])}\``,
      `  - Review: \`${formatSingleLineCommand("npm run dogfood:review --", [
        ["--manifest", PREPARED_ALPHA_MANIFEST_PLACEHOLDER],
        ["--issue-url", "<filed-dogfood-issue-url>"],
        ["--tracking-issue-url", trackingIssueUrl],
        ["--summary", `.skfiy-dogfood/reviews/${testerId}.md`]
      ])}\``,
      "  - After filing: copy `nextCommands.review` from the same prepare-alpha JSON output and replace `<filed-dogfood-issue-url>`."
    ];
  });
}

function distributeInitialWorkflows(assignmentCount) {
  const workflows = [...REQUIRED_DOGFOOD_WORKFLOWS];
  const groups = [];

  for (let index = 0; index < assignmentCount; index += 1) {
    const slotsLeft = assignmentCount - index;
    const take = Math.max(1, Math.ceil(workflows.length / slotsLeft));
    const group = workflows.splice(0, take);
    groups.push(group.length > 0 ? group : [REQUIRED_DOGFOOD_WORKFLOWS[index % REQUIRED_DOGFOOD_WORKFLOWS.length]]);
  }

  return groups;
}

function readAcceptedReportIssueUrls(body, trackingIssueUrl) {
  const section = readMarkdownSection(body, "Required Real Tester Count")
    || readMarkdownSection(body, "Required Tester Count");
  const urls = [];

  for (const match of section.matchAll(GITHUB_ISSUE_URL_PATTERN)) {
    const url = match[0];
    if (
      normalizeUrl(url) !== normalizeUrl(trackingIssueUrl)
      && !urls.some((existing) => normalizeUrl(existing) === normalizeUrl(url))
    ) {
      urls.push(url);
    }
  }

  return urls.slice(0, 5);
}

function mergeAcceptedReportIssueUrls(existingUrls, extraUrls, trackingIssueUrl) {
  const urls = [];

  for (const url of [
    ...(Array.isArray(existingUrls) ? existingUrls : []),
    ...(Array.isArray(extraUrls) ? extraUrls : [])
  ]) {
    if (
      typeof url === "string"
      && url.trim().length > 0
      && normalizeUrl(url) !== normalizeUrl(trackingIssueUrl)
      && !urls.some((existing) => normalizeUrl(existing) === normalizeUrl(url))
    ) {
      urls.push(url.trim());
    }
  }

  return urls.slice(0, 5);
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

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readPermissionStates(artifact) {
  return Object.fromEntries(
    Object.keys(PERMISSION_LABELS).map((key) => [
      key,
      artifact?.permissionStates?.[key]?.state
        ?? artifact?.permissions?.[key]?.state
        ?? artifact?.speechStatus?.[key]?.state
        ?? "unknown"
    ])
  );
}

function createPermissionLine(states) {
  return Object.entries(PERMISSION_LABELS)
    .map(([key, label]) => `${label} \`${states[key] ?? "unknown"}\``)
    .join(", ");
}

function derivePreflightSummaryPath(rootDir, uiSmokeArtifactPath, shortSha) {
  const fallbackTesterId = `preflight-${shortSha}`;
  if (typeof uiSmokeArtifactPath !== "string" || uiSmokeArtifactPath.trim().length === 0) {
    return path.join(rootDir, ".skfiy-dogfood", `${fallbackTesterId}-summary.md`);
  }

  const basename = path.basename(uiSmokeArtifactPath.trim(), ".json");
  const testerId = basename.endsWith("-ui")
    ? basename.slice(0, -"-ui".length)
    : fallbackTesterId;

  return path.join(rootDir, ".skfiy-dogfood", `${testerId}-summary.md`);
}

function formatMultilineCommand(command, args) {
  const lines = [command];

  for (const arg of args) {
    if (arg.length === 1) {
      lines.push(`  ${arg[0]}`);
    } else {
      lines.push(`  ${arg[0]} ${arg[1]}`);
    }
  }

  return lines.map((line, index) => index < lines.length - 1 ? `${line} \\` : line).join("\n");
}

function formatSingleLineCommand(command, args) {
  const parts = [command];

  for (const arg of args) {
    parts.push(arg.length === 1 ? arg[0] : `${arg[0]} ${arg[1]}`);
  }

  return parts.join(" ");
}

function validateOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.trackingIssueUrl !== "string" || options.trackingIssueUrl.trim().length === 0) {
    throw new Error("Missing --tracking-issue-url <url>.");
  }
  parseGitHubIssueUrl(options.trackingIssueUrl);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("alpha manifest must be an object.");
  }
  if (manifest.appName !== "skfiy") {
    throw new Error("alpha manifest appName must be skfiy.");
  }
  if (typeof manifest.commitSha !== "string" || manifest.commitSha.length < 7) {
    throw new Error("alpha manifest commitSha is required.");
  }
  if (manifest.bundleIdentifier !== "com.sskift.skfiy") {
    throw new Error("alpha manifest bundleIdentifier must be com.sskift.skfiy.");
  }
  if (typeof manifest.zip?.path !== "string" || manifest.zip.path.trim().length === 0) {
    throw new Error("alpha manifest zip.path is required.");
  }
  if (typeof manifest.zip?.sha256 !== "string" || manifest.zip.sha256.trim().length === 0) {
    throw new Error("alpha manifest zip.sha256 is required.");
  }
}

function createReleaseUrlFromTrackingIssue(trackingIssueUrl, shortSha) {
  const issue = parseGitHubIssueUrl(trackingIssueUrl);
  return `https://github.com/${issue.repository}/releases/tag/skfiy-alpha-${shortSha}`;
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

function relativeRepoPath(rootDir, filePath) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return "missing";
  }
  const value = filePath.trim();
  const relative = path.isAbsolute(value) ? path.relative(rootDir, value) : value;
  return relative.split(path.sep).join("/");
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
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async mkdir(dirPath, options) {
      await mkdir(dirPath, options);
    },
    async writeText(filePath, value) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, value);
    },
    async execFile(command, args) {
      return await execFileAsync(command, args);
    },
    async readIssue(issueUrl) {
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
  };
}

async function runCli() {
  const defaults = createDefaultDogfoodTrackingIssueOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodTrackingIssueArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodTrackingIssueHelpText());
    return;
  }

  const result = await syncDogfoodTrackingIssue(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
