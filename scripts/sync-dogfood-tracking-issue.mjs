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
  const body = createDogfoodTrackingIssueBody({
    rootDir,
    manifestPath: options.manifestPath,
    manifest,
    releaseUrl,
    trackingIssueUrl: options.trackingIssueUrl,
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
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `- [x] \`${workflow}\``),
    "",
    "## Required Real Tester Count",
    "- [ ] Tester 1 accepted report issue URL:",
    "- [ ] Tester 2 accepted report issue URL:",
    "- [ ] Tester 3 accepted report issue URL:",
    "- [ ] Optional tester 4 accepted report issue URL:",
    "- [ ] Optional tester 5 accepted report issue URL:",
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
      ["--summary", `.skfiy-dogfood/status-${shortSha}.md`],
      ["--require-current-head"]
    ]),
    "```",
    "",
    "## Prepare Alpha Command",
    "```bash",
    formatMultilineCommand("npm run dogfood:prepare-alpha --", [
      ["--release-url", releaseUrl],
      ["--tester-id", "<stable-real-tester-id>"],
      ["--execute"]
    ]),
    "```",
    "",
    "## Tester Runner",
    "For one real tester machine, collect all five packaged-app smoke artifacts and generate a checked issue body from the exact artifacts written by the run:",
    "",
    "```bash",
    formatMultilineCommand("npm run dogfood:tester --", [
      ["--manifest", relativeManifestPath],
      ["--app", "/Applications/skfiy.app"],
      ["--tester-id", "<stable-real-tester-id>"],
      ["--workflows", "<comma-separated-workflow-ids>"],
      ["--artifacts-dir", ".skfiy-smoke/dogfood/<stable-real-tester-id>"],
      ["--issue-output", ".skfiy-dogfood/issues/<stable-real-tester-id>.md"],
      ["--summary", ".skfiy-dogfood/<stable-real-tester-id>-summary.md"]
    ]),
    "```",
    "",
    "Use `--require-passed` only after the tester grants Screen Recording, Accessibility, Microphone, and Speech Recognition to `skfiy.app`. In strict mode, `dogfood:tester` treats the UI smoke as a permission preflight and stops before the longer Computer Use smokes when those permissions are missing.",
    "",
    "## Review Command",
    "```bash",
    formatMultilineCommand("npm run dogfood:review --", [
      ["--manifest", relativeManifestPath],
      ["--issue-url", "<filed-dogfood-issue-url>"],
      ["--summary", ".skfiy-dogfood/reviews/<stable-real-tester-id>.md"],
      ["--require-current-head"]
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
    "- No accepted real tester report is linked yet for this alpha. The cohort still needs at least 3 distinct real tester reports.",
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
    "By default this is a dry-run: it writes the body to a local Markdown file and does not edit GitHub.",
    "Pass --execute to run gh issue edit with the generated body.",
    "",
    "Options:",
    "  --release-url <url>          GitHub alpha release URL. Defaults from the tracking issue repo and manifest commit.",
    "  --tracking-issue-url <url>   GitHub tracking issue URL. Defaults to https://github.com/Sskift/skfiy/issues/1.",
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
