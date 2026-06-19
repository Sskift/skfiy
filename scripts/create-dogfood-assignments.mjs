#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createDogfoodStatus } from "./dogfood-status.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GITHUB_ISSUE_URL_PATTERN = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/issues\/(\d+)$/;
const ASSIGNMENT_PACKET_SCHEMA = "dogfood-assignments-v2";
const PERMISSION_LABELS = {
  screenRecording: "Screen Recording",
  accessibility: "Accessibility",
  microphone: "Microphone",
  speechRecognition: "Speech Recognition"
};

export function createDefaultDogfoodAssignmentsOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    trackingIssueUrl: undefined,
    trackingIssueFile: undefined,
    outputPath: undefined,
    jsonOutputPath: undefined,
    dryRun: true,
    requireCurrentHead: false,
    help: false
  };
}

export function parseDogfoodAssignmentsArgs(argv, defaults) {
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
      case "--output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--json-output":
        options.jsonOutputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--execute":
        options.dryRun = false;
        break;
      case "--dry-run":
        options.dryRun = true;
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

export async function runDogfoodAssignments(options, io = createDefaultIo()) {
  validateAssignmentsOptions(options);
  const statusOptions = {
    rootDir: options.rootDir ?? DEFAULT_ROOT_DIR,
    manifestPath: options.manifestPath,
    trackingIssueUrl: options.trackingIssueUrl,
    trackingIssueFile: options.trackingIssueFile,
    requireCurrentHead: options.requireCurrentHead === true,
    now: options.now
  };
  const status = typeof io.createDogfoodStatus === "function"
    ? await io.createDogfoodStatus(statusOptions)
    : await createDogfoodStatus(statusOptions);
  const generatedAt = typeof options.now === "function"
    ? options.now()
    : status.generatedAt ?? new Date().toISOString();
  const outputPath = typeof options.outputPath === "string"
    ? options.outputPath
    : createDefaultOutputPath(options.rootDir ?? DEFAULT_ROOT_DIR, status);
  const markdown = createDogfoodAssignmentsMarkdown(status, { generatedAt });
  const commentCommand = typeof options.trackingIssueUrl === "string"
    ? createTrackingIssueCommentCommand({
      trackingIssueUrl: options.trackingIssueUrl,
      bodyFile: outputPath
    })
    : undefined;

  await io.mkdir(path.dirname(outputPath), { recursive: true });
  await io.writeText(outputPath, markdown);
  let postedToTrackingIssue = false;
  if (options.dryRun === false && commentCommand) {
    await io.execFile(commentCommand.command, commentCommand.args);
    postedToTrackingIssue = true;
  } else if (options.dryRun === false && !commentCommand) {
    throw new Error("--execute requires --tracking-issue-url so the assignment packet can be posted as a GitHub issue comment.");
  }
  if (typeof options.jsonOutputPath === "string") {
    const json = createDogfoodAssignmentsJson(status, {
      generatedAt,
      markdownOutputPath: outputPath,
      jsonOutputPath: options.jsonOutputPath,
      dryRun: options.dryRun !== false,
      commentCommand,
      postedToTrackingIssue
    });
    await io.mkdir(path.dirname(options.jsonOutputPath), { recursive: true });
    await io.writeText(options.jsonOutputPath, `${JSON.stringify(json, null, 2)}\n`);
  }

  return {
    result: status.result,
    dryRun: options.dryRun !== false,
    assignmentCount: Array.isArray(status.testerAssignments)
      ? status.testerAssignments.length
      : 0,
    outputPath,
    jsonOutputPath: options.jsonOutputPath,
    commentCommand,
    postedToTrackingIssue
  };
}

export function createDogfoodAssignmentsJson(status, {
  generatedAt,
  markdownOutputPath,
  jsonOutputPath,
  dryRun = true,
  commentCommand,
  postedToTrackingIssue = false
} = {}) {
  const assignments = Array.isArray(status.testerAssignments)
    ? status.testerAssignments
    : [];
  const shortSha = readShortSha(status);
  const blockers = Array.isArray(status.localSmoke?.permissionBlockers)
    ? status.localSmoke.permissionBlockers
    : [];
  const permissionStates = readAssignmentPermissionStates(status.localSmoke?.permissionStates, blockers);

  return {
    generatedAt: generatedAt ?? status.generatedAt ?? "unknown",
    result: status.result ?? "unknown",
    alphaTag: `skfiy-alpha-${shortSha}`,
    packetSchema: ASSIGNMENT_PACKET_SCHEMA,
    releaseUrl: readReleaseUrl(status, shortSha),
    manifestPath: status.manifestPath,
    trackingIssueUrl: status.trackingIssueUrl ?? "local-tracking-issue",
    markdownOutputPath,
    jsonOutputPath,
    dryRun,
    postedToTrackingIssue,
    assignmentCount: assignments.length,
    currentGaps: {
      acceptedRealTesterReports: status.trackingIssue?.verifiedRealAcceptedReportCount ?? 0,
      minimumAcceptedRealTesterReports: 3,
      missingWorkflowCoverage: Array.isArray(status.trackingIssue?.workflowCoverage?.missing)
        ? status.trackingIssue.workflowCoverage.missing
        : [],
      missingPassedWorkflowCoverage: Array.isArray(status.trackingIssue?.passedWorkflowCoverage?.missing)
        ? status.trackingIssue.passedWorkflowCoverage.missing
        : []
    },
    permissionPreflight: {
      states: permissionStates,
      blockers,
      requirePassedAllowed: blockers.length === 0
    },
    evidencePreviewGate: {
      requiredEligible: true,
      requiredChecks: [
        "reportPreviewEligibility.eligible=true",
        "ui-pet-drag",
        "panic-stop-hotkey"
      ]
    },
    assignments: assignments.map((assignment) => ({
      testerId: assignment.testerId,
      purpose: assignment.purpose,
      workflows: Array.isArray(assignment.workflows) ? assignment.workflows : [],
      commands: assignment.commands ?? {}
    })),
    nextActions: Array.isArray(status.nextActions) ? status.nextActions : [],
    commentCommand
  };
}

export function createDogfoodAssignmentsMarkdown(status, { generatedAt } = {}) {
  const assignments = Array.isArray(status.testerAssignments)
    ? status.testerAssignments
    : [];
  const shortSha = readShortSha(status);
  const releaseUrl = readReleaseUrl(status, shortSha);
  const trackingIssueUrl = status.trackingIssueUrl ?? "local-tracking-issue";
  const blockers = Array.isArray(status.localSmoke?.permissionBlockers)
    ? status.localSmoke.permissionBlockers
    : [];
  const permissionStates = readAssignmentPermissionStates(status.localSmoke?.permissionStates, blockers);
  const nextActions = Array.isArray(status.nextActions) ? status.nextActions : [];
  const lines = [
    "# skfiy dogfood tester assignments",
    "",
    `Generated: ${generatedAt ?? status.generatedAt ?? "unknown"}`,
    `Status: ${status.result ?? "unknown"}`,
    `Alpha: skfiy-alpha-${shortSha}`,
    `Packet schema: ${ASSIGNMENT_PACKET_SCHEMA}`,
    `Release: ${releaseUrl}`,
    `Manifest: ${status.manifestPath ?? "unknown"}`,
    `Tracking issue: ${trackingIssueUrl}`,
    "",
    "This packet is non-mutating: it does not create reports, add labels, update cohort JSON, or mark dogfood evidence accepted.",
    "Each tester must run the packaged app bundle downloaded by `dogfood:prepare-alpha`; maintainers must review filed issues before adding `dogfood:accepted`.",
    "",
    "## Current Gaps",
    "",
    `- Accepted real tester reports: ${status.trackingIssue?.verifiedRealAcceptedReportCount ?? 0}/3 minimum`,
    `- Missing workflow coverage: ${formatList(status.trackingIssue?.workflowCoverage?.missing)}`,
    `- Missing passed workflow coverage: ${formatList(status.trackingIssue?.passedWorkflowCoverage?.missing)}`,
    "",
    "## Permission Blockers",
    ""
  ];

  if (blockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of blockers) {
      lines.push(`- ${blocker.permission}: ${blocker.state}`);
    }
  }

  lines.push("", "## Permission Preflight", "");
  lines.push("Grant Screen Recording and Accessibility to the extracted `skfiy.app` before using `--require-passed` for default external Doubao + Computer Use evidence.");
  lines.push("Grant Microphone and Speech Recognition only when intentionally testing the optional `native-macos` voice provider.");
  lines.push("If permissions are still blocked, run the normal tester command and file the blocked evidence instead of adding `--require-passed`.");
  lines.push("For passed workflow evidence, rerun prepare/tester with `--require-passed` only after the provider-relevant permissions are granted.");
  lines.push("");
  for (const [permission, label] of Object.entries(PERMISSION_LABELS)) {
    lines.push(`- ${label}: ${permissionStates[permission] ?? "unknown"}`);
  }

  lines.push("", "## Evidence Preview Gate", "");
  lines.push("Before filing, confirm the generated `dogfood:issue -- --check-report` output shows `reportPreviewEligibility.eligible=true`.");
  lines.push("The report preview must include UI pet drag evidence from the packaged app: renderer pointer events, before/after bounds, upward movement, and suppressed click-after-drag.");
  lines.push("The report preview must include panic stop evidence from `runtimeStatus.stopTurnHotkey` plus product-path behavior evidence: accelerator, label, registered state, source, behaviorResult, behaviorSource, before/after status, and stop message.");
  lines.push("If `reportPreviewEligibility.eligible=false`, file the blocked evidence only after preserving the blocking checks for maintainer review.");

  lines.push("", "## Tester Packets", "");
  if (assignments.length === 0) {
    lines.push("- none");
  } else {
    for (const assignment of assignments) {
      lines.push(`## ${assignment.testerId}`);
      lines.push("");
      lines.push(`Purpose: ${assignment.purpose}`);
      lines.push(`Workflows: ${assignment.workflows.join(", ")}`);
      lines.push("");
      lines.push("1. Prepare the alpha bundle:");
      lines.push("");
      lines.push("```bash");
      lines.push(assignment.commands.prepareAlpha);
      lines.push("```");
      lines.push("");
      lines.push("2. After prepare finishes, copy `nextCommands.tester` from the JSON output and run it on the tester machine.");
      lines.push("");
      lines.push("```bash");
      lines.push(assignment.commands.tester);
      lines.push("```");
      lines.push("");
      lines.push("3. After the tester files the report issue, maintainers review it before accepting evidence:");
      lines.push("");
      lines.push("```bash");
      lines.push(assignment.commands.review);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## Maintainer Next Actions", "");
  for (const action of nextActions) {
    lines.push(`- ${action}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createDogfoodAssignmentsHelpText() {
  return [
    "Usage: npm run dogfood:assignments -- --manifest <alpha-manifest> (--tracking-issue-url <issue-url> | --tracking-issue-file <markdown-path>) [--output <markdown-path>] [--json-output <json-path>] [--execute] [--require-current-head]",
    "",
    "Creates a non-mutating tester assignment packet from dogfood:status.",
    "It packages recommended prepare/tester/review commands into copy-safe Markdown.",
    "Use --json-output to persist the assignment packet, permission preflight, next actions, and comment command as machine-readable JSON.",
    "It does not create or accept reports, add labels, update cohort JSON, or weaken dogfood gates.",
    "By default it writes the local packet and reports a GitHub issue comment command without running it.",
    "Pass --execute with --tracking-issue-url to post the packet as a GitHub issue comment.",
    "Use it to hand real testers the current alpha assignment while preserving maintainer review."
  ].join("\n");
}

function validateAssignmentsOptions(options) {
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
}

function createDefaultOutputPath(rootDir, status) {
  return path.join(
    rootDir,
    ".skfiy-dogfood",
    "assignments",
    `skfiy-alpha-${readShortSha(status)}.md`
  );
}

function readShortSha(status) {
  const commitSha = status.manifest?.commitSha;
  if (typeof commitSha === "string" && commitSha.length >= 7) {
    return commitSha.slice(0, 7);
  }
  const artifactBaseName = status.manifest?.artifactBaseName;
  const match = typeof artifactBaseName === "string"
    ? artifactBaseName.match(/-([a-f0-9]{7})-/)
    : undefined;
  return match?.[1] ?? "unknown";
}

function readReleaseUrl(status, shortSha) {
  const currentAlpha = status.trackingIssue?.currentAlpha;
  const release = currentAlpha?.ok === true ? currentAlpha.fields?.release : undefined;
  return typeof release === "string" && release.trim().length > 0
    ? release
    : `https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-${shortSha}`;
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "none";
}

function readAssignmentPermissionStates(states, blockers) {
  return Object.fromEntries(
    Object.keys(PERMISSION_LABELS).map((permission) => {
      const state = states?.[permission]?.state;
      if (typeof state === "string" && state.trim().length > 0) {
        return [permission, state];
      }
      const blocker = blockers.find((item) => item?.permission === permission);
      return [permission, blocker?.state ?? "unknown"];
    })
  );
}

function createTrackingIssueCommentCommand({ trackingIssueUrl, bodyFile }) {
  const match = trackingIssueUrl.match(GITHUB_ISSUE_URL_PATTERN);
  if (!match) {
    throw new Error("--tracking-issue-url must be a GitHub issue URL when creating an assignment comment command.");
  }

  return {
    command: "gh",
    args: [
      "issue",
      "comment",
      match[2],
      "--repo",
      match[1],
      "--body-file",
      bodyFile
    ]
  };
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
    async mkdir(dirPath, options) {
      await mkdir(dirPath, options);
    },
    async writeText(filePath, value) {
      await writeFile(filePath, value);
    },
    async execFile(command, args) {
      return await execFileAsync(command, args);
    }
  };
}

async function runCli() {
  const defaults = createDefaultDogfoodAssignmentsOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodAssignmentsArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodAssignmentsHelpText());
    return;
  }

  const result = await runDogfoodAssignments(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
