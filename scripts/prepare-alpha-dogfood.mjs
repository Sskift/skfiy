#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { readRealTesterDecision } from "./dogfood-tester-id.mjs";
import { REQUIRED_DOGFOOD_WORKFLOWS } from "./verify-dogfood-cohort.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO = "Sskift/skfiy";
const ALPHA_ZIP_PATTERN = "skfiy-*-macos-unsigned.zip";
const ALPHA_MANIFEST_PATTERN = "skfiy-*-macos-unsigned.json";
const WORKFLOW_PLACEHOLDER = "<comma-separated-workflow-ids>";
const ASSIGNMENT_PACKET_HEADING = "# skfiy dogfood tester assignments";
const ASSIGNMENT_PERMISSION_PREFLIGHT_HEADING = "## Permission Preflight";
const ASSIGNMENT_EVIDENCE_PREVIEW_HEADING = "## Evidence Preview Gate";
const APP_INSTALL_LOCK_RETRY_MS = 250;
const APP_INSTALL_LOCK_TIMEOUT_MS = 120_000;

export function createDefaultPrepareAlphaDogfoodOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    repo: DEFAULT_REPO,
    releaseUrl: undefined,
    tagName: undefined,
    testerId: undefined,
    workflows: undefined,
    trackingIssueUrl: undefined,
    trackingIssueFile: undefined,
    appPath: undefined,
    downloadDir: undefined,
    extractDir: undefined,
    handoffOutputPath: undefined,
    dryRun: true,
    replaceExisting: false,
    requirePassed: false,
    allowSyntheticTesterId: false,
    help: false
  };
}

export function parsePrepareAlphaDogfoodArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--release-url": {
        const releaseUrl = readValue(argv, index, arg);
        const parsed = parseGitHubReleaseUrl(releaseUrl);
        options.releaseUrl = releaseUrl;
        options.repo = parsed.repo;
        options.tagName = parsed.tagName;
        index += 1;
        break;
      }
      case "--repo":
        options.repo = readValue(argv, index, arg);
        index += 1;
        break;
      case "--tag":
        options.tagName = readValue(argv, index, arg);
        index += 1;
        break;
      case "--tester-id":
        options.testerId = readValue(argv, index, arg);
        index += 1;
        break;
      case "--workflows":
        options.workflows = readWorkflowList(readValue(argv, index, arg));
        index += 1;
        break;
      case "--tracking-issue-url":
        options.trackingIssueUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--tracking-issue-file":
        options.trackingIssueFile = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--app":
        options.appPath = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--download-dir":
        options.downloadDir = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--extract-dir":
        options.extractDir = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--handoff-output":
        options.handoffOutputPath = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--replace-existing":
        options.replaceExisting = true;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--allow-synthetic-tester-id":
        options.allowSyntheticTesterId = true;
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

  if (!options.releaseUrl && options.repo && options.tagName) {
    options.releaseUrl = `https://github.com/${options.repo}/releases/tag/${options.tagName}`;
  }

  return options;
}

export function createPrepareAlphaDogfoodPlan(options) {
  validatePlanOptions(options);

  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const tagName = options.tagName;
  const testerId = options.testerId.trim();
  const releaseUrl = options.releaseUrl ?? `https://github.com/${options.repo}/releases/tag/${tagName}`;
  const downloadDir = typeof options.downloadDir === "string"
    ? options.downloadDir
    : path.join(rootDir, ".skfiy-dogfood", "downloads", tagName);
  const extractDir = typeof options.extractDir === "string"
    ? options.extractDir
    : path.join(rootDir, ".skfiy-dogfood", "extracted", tagName);
  const appPath = typeof options.appPath === "string"
    ? options.appPath
    : path.join(rootDir, ".skfiy-dogfood", "apps", tagName, "skfiy.app");
  const handoffOutputPath = typeof options.handoffOutputPath === "string"
    ? options.handoffOutputPath
    : path.join(rootDir, ".skfiy-dogfood", "handoffs", `${testerId}.md`);
  const workflowArgs = Array.isArray(options.workflows) && options.workflows.length > 0
    ? ["--workflows", options.workflows.join(",")]
    : [];
  const placeholderManifestPath = path.join(downloadDir, "<downloaded-alpha.json>");
  const placeholderZipPath = path.join(downloadDir, "<downloaded-alpha.zip>");
  const nextCommands = createPrepareAlphaNextCommands({
    manifestPath: placeholderManifestPath,
    appPath,
    testerId,
    workflows: options.workflows,
    trackingIssueUrl: options.trackingIssueUrl,
    requirePassed: options.requirePassed,
    allowSyntheticTesterId: options.allowSyntheticTesterId
  });

  return {
    rootDir,
    repo: options.repo,
    tagName,
    releaseUrl,
    testerId,
    downloadDir,
    extractDir,
    appPath,
    handoffOutputPath,
    replaceExisting: options.replaceExisting === true,
    nextCommands,
    commands: [
      {
        id: "release:download",
        command: "gh",
        args: [
          "release",
          "download",
          tagName,
          "--repo",
          options.repo,
          "--dir",
          downloadDir,
          "--pattern",
          ALPHA_ZIP_PATTERN,
          "--pattern",
          ALPHA_MANIFEST_PATTERN,
          "--clobber"
        ]
      },
      {
        id: "zip:extract",
        command: "ditto",
        args: [
          "-x",
          "-k",
          placeholderZipPath,
          extractDir
        ]
      },
      {
        id: "app:install",
        command: "ditto",
        args: [
          path.join(extractDir, "skfiy.app"),
          appPath
        ]
      },
      {
        id: "handoff:create",
        command: "npm",
        args: [
          "run",
          "dogfood:handoff",
          "--",
          "--manifest",
          placeholderManifestPath,
          "--release-url",
          releaseUrl,
          "--app",
          appPath,
          "--tester-id",
          testerId,
          ...readTrackingIssueArgs(options.trackingIssueUrl),
          ...workflowArgs,
          "--output",
          handoffOutputPath,
          ...(options.requirePassed === true ? ["--require-passed"] : []),
          ...readSyntheticTesterHandoffArgs(testerId)
        ]
      }
    ]
  };
}

export async function runPrepareAlphaDogfood(options, io = createDefaultIo()) {
  const resolvedOptions = await resolvePrepareAlphaDogfoodOptions(options, io);
  const plan = createPrepareAlphaDogfoodPlan(resolvedOptions);

  if (resolvedOptions.dryRun !== false) {
    return {
      status: "planned",
      dryRun: true,
      releaseUrl: plan.releaseUrl,
      appPath: plan.appPath,
      downloadDir: plan.downloadDir,
      extractDir: plan.extractDir,
      handoffOutputPath: plan.handoffOutputPath,
      nextCommands: plan.nextCommands,
      plan
    };
  }

  await io.mkdir(plan.downloadDir, { recursive: true });
  await io.mkdir(path.dirname(plan.appPath), { recursive: true });
  await io.mkdir(path.dirname(plan.handoffOutputPath), { recursive: true });

  await io.rm(plan.extractDir, { recursive: true, force: true });
  await io.mkdir(plan.extractDir, { recursive: true });

  await io.execPlanCommand(plan.commands[0]);
  const downloaded = await findDownloadedAlphaFiles(plan.downloadDir, io);
  const manifest = await io.readJson(downloaded.manifestPath);
  validateManifest(manifest);
  const zipSha256 = await io.sha256File(downloaded.zipPath);
  if (zipSha256 !== manifest.zip.sha256) {
    throw new Error(`Downloaded alpha zip SHA256 ${zipSha256} does not match manifest ${manifest.zip.sha256}.`);
  }
  if (path.basename(downloaded.zipPath) !== path.basename(manifest.zip.path)) {
    throw new Error(`Downloaded alpha zip ${path.basename(downloaded.zipPath)} does not match manifest zip ${path.basename(manifest.zip.path)}.`);
  }

  const extractCommand = replaceCommandArgs(plan.commands[1], {
    [path.join(plan.downloadDir, "<downloaded-alpha.zip>")]: downloaded.zipPath
  });
  await io.execPlanCommand(extractCommand);
  const extractedAppPath = path.join(plan.extractDir, "skfiy.app");
  if (!(await io.exists(extractedAppPath))) {
    throw new Error(`Downloaded alpha zip did not contain skfiy.app at ${extractedAppPath}.`);
  }
  await validateAppBundleIdentity(extractedAppPath, io);

  await withAppInstallLock(plan, io, async () => {
    const reuseExistingApp = await io.exists(plan.appPath);
    if (reuseExistingApp) {
      if (!plan.replaceExisting) {
        await validateAppBundleIdentity(plan.appPath, io);
        return;
      }
      await io.rm(plan.appPath, { recursive: true, force: true });
    }
    await io.execPlanCommand(plan.commands[2]);
  });
  const handoffCommand = replaceCommandArgs(plan.commands[3], {
    [path.join(plan.downloadDir, "<downloaded-alpha.json>")]: downloaded.manifestPath
  });
  await io.execPlanCommand(handoffCommand);

  return {
    status: "prepared",
    dryRun: false,
    releaseUrl: plan.releaseUrl,
    manifestPath: downloaded.manifestPath,
    zipPath: downloaded.zipPath,
    appPath: plan.appPath,
    handoffOutputPath: plan.handoffOutputPath,
    nextCommands: createPrepareAlphaNextCommands({
      manifestPath: downloaded.manifestPath,
      appPath: plan.appPath,
      testerId: plan.testerId,
      workflows: resolvedOptions.workflows,
      trackingIssueUrl: resolvedOptions.trackingIssueUrl,
      requirePassed: resolvedOptions.requirePassed,
      allowSyntheticTesterId: resolvedOptions.allowSyntheticTesterId
    })
  };
}

export function createPrepareAlphaDogfoodHelpText() {
  return [
    "Usage: npm run dogfood:prepare-alpha -- --release-url <github-release-url> --tester-id <id> [--execute]",
    "",
    "Prepares a GitHub alpha release for one real skfiy dogfood tester.",
    "By default this is a dry-run: it prints the download, checksum, extraction,",
    "app install, and handoff plan without mutating local files.",
    "Pass --execute to download the release assets, verify the zip SHA256 against",
    "the manifest, extract skfiy.app, and create the dogfood handoff.",
    "Existing app bundle destinations are reused after identity validation; pass",
    "--replace-existing only when you intentionally want to overwrite that app.",
    "The result includes nextCommands.tester with the prepared manifest path",
    "and app bundle path filled in for copy/paste. Real tester preparations",
    "also include nextCommands.review; maintainer synthetic preflights stay local-only.",
    "",
    "Options:",
    "  --release-url <url>       GitHub release URL, for example https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-xxxxxxx.",
    "  --repo <owner/name>       Repository for --tag mode. Default: Sskift/skfiy.",
    "  --tag <tag>               Release tag when --release-url is not used.",
    "  --tester-id <id>          Stable tester id for the generated handoff.",
    "  --workflows <ids>         Optional comma-separated workflow ids to pass into the handoff.",
    "  --tracking-issue-url <url> Infer --workflows from Recommended Tester Assignments or assignment packet comments when omitted.",
    "  --tracking-issue-file <path> Infer --workflows from a local tracking issue body when omitted.",
    "  --app <path>              App bundle destination. Default: .skfiy-dogfood/apps/<tag>/skfiy.app.",
    "  --download-dir <path>     Release asset download directory.",
    "  --extract-dir <path>      Temporary extraction directory.",
    "  --handoff-output <path>   Generated handoff Markdown path.",
    "  --replace-existing        Overwrite instead of reusing an existing app bundle destination.",
    "  --require-passed          Pass strict passed evidence mode into the handoff and tester command.",
    "  --allow-synthetic-tester-id",
    "                            Maintainer-only escape hatch for local/preflight release preparation that will not count as a real tester.",
    "  --execute                 Actually download, verify, extract, install, and create handoff.",
    "  --dry-run                 Force dry-run planning mode.",
    "  -h, --help                Show this help."
  ].join("\n");
}

function createPrepareAlphaNextCommands({
  manifestPath,
  appPath,
  testerId,
  workflows,
  trackingIssueUrl,
  requirePassed = false,
  allowSyntheticTesterId = false
}) {
  const workflowList = Array.isArray(workflows) && workflows.length > 0
    ? workflows.join(",")
    : WORKFLOW_PLACEHOLDER;
  const trackingIssueArgs = typeof trackingIssueUrl === "string" && trackingIssueUrl.trim().length > 0
    ? ["--tracking-issue-url", trackingIssueUrl.trim()]
    : [];
  const testerDecision = readRealTesterDecision(testerId);
  const syntheticTester = testerDecision.ok !== true && allowSyntheticTesterId === true;

  const nextCommands = {
    tester: [
      "npm run dogfood:tester --",
      "--manifest",
      manifestPath,
      "--app",
      appPath,
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
      ...trackingIssueArgs,
      ...(syntheticTester ? ["--allow-synthetic-tester-id"] : ["--file-issue"]),
      ...(requirePassed ? ["--require-passed"] : [])
    ].join(" ")
  };

  if (!syntheticTester) {
    nextCommands.review = [
      "npm run dogfood:review --",
      "--manifest",
      manifestPath,
      "--issue-url",
      "<filed-dogfood-issue-url>",
      ...trackingIssueArgs,
      "--summary",
      `.skfiy-dogfood/reviews/${testerId}.md`
    ].join(" ");
  }

  return nextCommands;
}

async function resolvePrepareAlphaDogfoodOptions(options, io) {
  if (Array.isArray(options.workflows) && options.workflows.length > 0) {
    return options;
  }
  if (
    typeof options.trackingIssueFile !== "string"
    && typeof options.trackingIssueUrl !== "string"
  ) {
    return options;
  }

  const assignmentText = await readTrackingIssueAssignmentText(options, io);
  const workflows = readRecommendedAssignmentWorkflows(assignmentText, options.testerId);
  if (workflows.length === 0) {
    const testerDecision = readRealTesterDecision(options.testerId);
    if (options.allowSyntheticTesterId === true && testerDecision.ok !== true) {
      return {
        ...options,
        workflows: [...REQUIRED_DOGFOOD_WORKFLOWS]
      };
    }
    throw new Error(`Tracking issue has no tester assignment entry for ${options.testerId}.`);
  }

  return {
    ...options,
    workflows
  };
}

async function readTrackingIssueAssignmentText(options, io) {
  if (typeof options.trackingIssueFile === "string") {
    return await io.readText(options.trackingIssueFile);
  }
  if (typeof options.trackingIssueUrl === "string") {
    const issue = await io.readIssue(options.trackingIssueUrl);
    const body = typeof issue?.body === "string" ? issue.body : "";
    const assignmentComments = Array.isArray(issue?.comments)
      ? issue.comments
        .map((comment) => typeof comment?.body === "string" ? comment.body : "")
        .filter((commentBody) => isCurrentAlphaAssignmentPacket(commentBody, options.tagName))
      : [];
    const latestAssignmentComment = assignmentComments.at(-1);
    return [body, latestAssignmentComment].filter(Boolean).join("\n\n");
  }
  return "";
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function validatePlanOptions(options) {
  if (typeof options.repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    throw new Error("--repo must be in owner/name form.");
  }
  if (typeof options.tagName !== "string" || options.tagName.trim().length === 0) {
    throw new Error("Missing --release-url <url> or --tag <tag>.");
  }
  if (typeof options.testerId !== "string" || options.testerId.trim().length === 0) {
    throw new Error("Missing --tester-id <id>.");
  }
  if (Array.isArray(options.workflows)) {
    if (options.workflows.length === 0) {
      throw new Error("--workflows must include at least one workflow id.");
    }
    const unknownWorkflow = options.workflows.find((workflow) =>
      !REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow)
    );
    if (unknownWorkflow) {
      throw new Error(`Unknown dogfood workflow: ${unknownWorkflow}.`);
    }
  }
}

function readWorkflowList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRecommendedAssignmentWorkflows(body, testerId) {
  if (typeof body !== "string" || body.length === 0 || typeof testerId !== "string") {
    return [];
  }
  const workflowsFromAssignmentPacket = readAssignmentPacketWorkflows(body, testerId);
  if (workflowsFromAssignmentPacket.length > 0) {
    return workflowsFromAssignmentPacket;
  }

  const section = readMarkdownSection(body, "Recommended Tester Assignments");
  const escapedTesterId = escapeRegExp(testerId.trim());
  const linePattern = new RegExp(
    `^-\\s*(?:\`${escapedTesterId}\`|${escapedTesterId})\\s*:\\s*\`?([^\\n\`]+)\`?\\s*$`,
    "im"
  );
  const match = linePattern.exec(section);
  if (!match) {
    return [];
  }

  return readWorkflowList(match[1]).filter((workflow) =>
    REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow)
  );
}

function readAssignmentPacketWorkflows(body, testerId) {
  const testerSection = readMarkdownSection(body, testerId.trim());
  const match = /^Workflows:\s*([^\n]+)$/im.exec(testerSection);
  if (!match) {
    return [];
  }

  return readWorkflowList(match[1]).filter((workflow) =>
    REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow)
  );
}

function isCurrentAlphaAssignmentPacket(body, tagName) {
  if (typeof body !== "string" || body.length === 0 || typeof tagName !== "string") {
    return false;
  }
  const alphaLinePattern = new RegExp(
    `^Alpha:\\s*${escapeRegExp(tagName.trim())}\\s*$`,
    "im"
  );

  return body.includes(ASSIGNMENT_PACKET_HEADING)
    && body.includes(ASSIGNMENT_PERMISSION_PREFLIGHT_HEADING)
    && body.includes(ASSIGNMENT_EVIDENCE_PREVIEW_HEADING)
    && alphaLinePattern.test(body);
}

function readMarkdownSection(body, title) {
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

function parseGitHubReleaseUrl(releaseUrl) {
  const parsed = new URL(releaseUrl);
  if (parsed.hostname !== "github.com") {
    throw new Error("--release-url must be a github.com release URL.");
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 5 || parts[2] !== "releases" || parts[3] !== "tag") {
    throw new Error("--release-url must look like https://github.com/owner/repo/releases/tag/<tag>.");
  }
  return {
    repo: `${parts[0]}/${parts[1]}`,
    tagName: parts[4]
  };
}

async function findDownloadedAlphaFiles(downloadDir, io) {
  const files = await io.listFiles(downloadDir);
  const zipName = files.find((file) => /^skfiy-.+-macos-unsigned\.zip$/.test(file));
  const manifestName = files.find((file) => /^skfiy-.+-macos-unsigned\.json$/.test(file));
  if (!zipName) {
    throw new Error(`No ${ALPHA_ZIP_PATTERN} asset was downloaded to ${downloadDir}.`);
  }
  if (!manifestName) {
    throw new Error(`No ${ALPHA_MANIFEST_PATTERN} asset was downloaded to ${downloadDir}.`);
  }
  return {
    zipPath: path.join(downloadDir, zipName),
    manifestPath: path.join(downloadDir, manifestName)
  };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("alpha manifest must be an object.");
  }
  if (manifest.appName !== "skfiy") {
    throw new Error("alpha manifest appName must be skfiy.");
  }
  if (manifest.bundleIdentifier !== "com.sskift.skfiy") {
    throw new Error("alpha manifest bundleIdentifier must be com.sskift.skfiy.");
  }
  if (typeof manifest.zip?.path !== "string" || typeof manifest.zip?.sha256 !== "string") {
    throw new Error("alpha manifest must include zip.path and zip.sha256.");
  }
  const evidence = Array.isArray(manifest.requiredDogfoodEvidence)
    ? manifest.requiredDogfoodEvidence
    : [];
  if (
    typeof manifest.moneyRunSmokeArtifactPath !== "string"
    || manifest.moneyRunSmokeArtifactPath.trim().length === 0
    || !evidence.includes("npm run smoke:money-run -- --json-output <path>")
    || !evidence.includes("Long-horizon money-run supervision evidence")
  ) {
    throw new Error("alpha manifest must include moneyRunSmokeArtifactPath and long-horizon money-run evidence.");
  }
  if (!evidence.includes("Panic stop product-path behavior evidence")) {
    throw new Error("alpha manifest must include panic stop product-path behavior evidence.");
  }
}

async function validateAppBundleIdentity(appPath, io) {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  const infoPlist = await io.readText(infoPlistPath);
  const expected = {
    CFBundleIdentifier: "com.sskift.skfiy",
    CFBundleName: "skfiy",
    CFBundleDisplayName: "skfiy",
    CFBundleExecutable: "skfiy"
  };

  for (const [key, value] of Object.entries(expected)) {
    const actual = readInfoPlistString(infoPlist, key);
    if (actual !== value) {
      throw new Error(`Downloaded alpha app ${key} must be ${value}.`);
    }
  }
}

function readInfoPlistString(infoPlist, key) {
  const pattern = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<string>([^<]*)</string>`);
  return pattern.exec(infoPlist)?.[1];
}

function replaceCommandArgs(command, replacements) {
  return {
    ...command,
    args: command.args.map((arg) => replacements[arg] ?? arg)
  };
}

async function withAppInstallLock(plan, io, operation) {
  const lockDir = path.join(path.dirname(plan.appPath), ".install.lock");
  const releaseLock = await acquireDirectoryLock(lockDir, io);
  try {
    return await operation();
  } finally {
    await releaseLock();
  }
}

async function acquireDirectoryLock(lockDir, io) {
  const startedAt = Date.now();
  while (true) {
    try {
      await io.mkdir(lockDir);
      return async () => {
        await io.rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() - startedAt >= APP_INSTALL_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for alpha app install lock at ${lockDir}.`);
      }
      await io.sleep(APP_INSTALL_LOCK_RETRY_MS);
    }
  }
}

function readSyntheticTesterHandoffArgs(testerId) {
  return readRealTesterDecision(testerId).ok
    ? []
    : ["--allow-synthetic-tester-id"];
}

function readTrackingIssueArgs(trackingIssueUrl) {
  return typeof trackingIssueUrl === "string" && trackingIssueUrl.trim().length > 0
    ? ["--tracking-issue-url", trackingIssueUrl.trim()]
    : [];
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function resolvePath(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

function createDefaultIo() {
  return {
    mkdir,
    rm,
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async readText(filePath) {
      return await readFile(filePath, "utf8");
    },
    async listFiles(dirPath) {
      return await readdir(dirPath);
    },
    exists: pathExists,
    sha256File,
    async execPlanCommand(command) {
      const { stdout, stderr } = await execFileAsync(command.command, command.args, {
        cwd: DEFAULT_ROOT_DIR,
        maxBuffer: 64 * 1024 * 1024
      });
      return { stdout, stderr, exitCode: 0 };
    },
    async sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    async readIssue(issueUrl) {
      const command = createGitHubIssueViewCommand(issueUrl);
      const { stdout } = await execFileAsync(command.command, command.args, {
        cwd: DEFAULT_ROOT_DIR,
        maxBuffer: 64 * 1024 * 1024
      });
      return normalizeGitHubIssueViewPayload(JSON.parse(stdout));
    }
  };
}

export function createGitHubIssueViewCommand(issueUrl) {
  const issue = parseGitHubIssueUrl(issueUrl);
  return {
    command: "gh",
    args: [
      "issue",
      "view",
      issue.number,
      "--repo",
      issue.repository,
      "--json",
      "body,comments"
    ]
  };
}

export function normalizeGitHubIssueViewPayload(payload) {
  return {
    body: typeof payload?.body === "string" ? payload.body : "",
    comments: readCommentPayloads(payload?.comments)
  };
}

function readCommentPayloads(comments) {
  const entries = Array.isArray(comments)
    ? comments
    : Array.isArray(comments?.nodes)
      ? comments.nodes
      : [];

  return entries
    .map((comment) => ({ body: typeof comment?.body === "string" ? comment.body : "" }))
    .filter((comment) => comment.body.trim().length > 0);
}

function parseGitHubIssueUrl(issueUrl) {
  const parsed = new URL(issueUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (
    parsed.hostname !== "github.com"
    || parts.length !== 4
    || parts[2] !== "issues"
    || !/^\d+$/.test(parts[3])
  ) {
    throw new Error("--tracking-issue-url must look like https://github.com/owner/repo/issues/<number>.");
  }

  return {
    repository: `${parts[0]}/${parts[1]}`,
    number: parts[3]
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function main() {
  const defaults = createDefaultPrepareAlphaDogfoodOptions(DEFAULT_ROOT_DIR);
  const options = parsePrepareAlphaDogfoodArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(`${createPrepareAlphaDogfoodHelpText()}\n`);
    return;
  }

  const result = await runPrepareAlphaDogfood(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
