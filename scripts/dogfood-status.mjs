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
  const acceptedReportIssueUrls = readAcceptedReportIssueUrls(
    trackingIssue.body,
    options.trackingIssueUrl
  );
  const workflowCoverage = readWorkflowCoverage(trackingIssue.body);
  const smokeArtifacts = await readSmokeArtifacts(manifest, io);
  const artifactResults = readArtifactResults(smokeArtifacts);
  const permissionBlockers = readPermissionBlockers(smokeArtifacts);
  const manifestChecks = await readManifestChecks(manifest, options, io);
  const missingRequiredReports = Math.max(0, 3 - acceptedReportIssueUrls.length);
  const canRunCollect = acceptedReportIssueUrls.length >= 3 && acceptedReportIssueUrls.length <= 5;
  const result = canRunCollect ? "ready-to-collect" : "waiting-for-dogfood";
  const nextActions = createNextActions({
    canRunCollect,
    permissionBlockers,
    missingRequiredReports,
    manifestChecks,
    workflowCoverage
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
      acceptedReportIssueUrls,
      acceptedReportCount: acceptedReportIssueUrls.length,
      missingRequiredReports,
      workflowCoverage
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

  lines.push("", "## Workflow Coverage", "");
  for (const workflow of REQUIRED_WORKFLOW_IDS) {
    const state = status.trackingIssue.workflowCoverage.covered.includes(workflow)
      ? "covered"
      : "missing";
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
  workflowCoverage
}) {
  const actions = [];

  if (missingRequiredReports > 0) {
    actions.push("Collect at least 3 accepted real tester report issue URLs in GitHub issue #1.");
  }
  if (workflowCoverage.missing.length > 0) {
    actions.push(`Collect accepted reports covering missing workflows: ${workflowCoverage.missing.join(", ")}.`);
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
