#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { REQUIRED_DOGFOOD_WORKFLOWS } from "./verify-dogfood-cohort.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

export function createDefaultDogfoodHandoffOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    testerId: undefined,
    workflows: [...REQUIRED_DOGFOOD_WORKFLOWS],
    trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
    releaseUrl: undefined,
    appPath: undefined,
    outputPath: undefined,
    finderTargetDir: undefined,
    chromeCurrentPageEndpoint: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseDogfoodHandoffArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = resolvePath(readValue(argv, index, arg));
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
      case "--release-url":
        options.releaseUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--app":
        options.appPath = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--output":
        options.outputPath = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--finder-target-dir":
        options.finderTargetDir = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--chrome-current-page-endpoint":
        options.chromeCurrentPageEndpoint = readValue(argv, index, arg);
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
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

export async function createDogfoodHandoff(options, io = createDefaultIo()) {
  validateOptions(options);

  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const testerId = options.testerId.trim();
  const manifest = await io.readJson(options.manifestPath);
  const outputPath = typeof options.outputPath === "string"
    ? options.outputPath
    : path.join(rootDir, ".skfiy-dogfood", "handoffs", `${testerId}.md`);
  const markdown = createDogfoodHandoffMarkdown({
    rootDir,
    manifestPath: options.manifestPath,
    manifest,
    testerId,
    workflows: options.workflows,
    trackingIssueUrl: options.trackingIssueUrl,
    releaseUrl: options.releaseUrl,
    appPath: options.appPath,
    finderTargetDir: options.finderTargetDir,
    chromeCurrentPageEndpoint: options.chromeCurrentPageEndpoint,
    requirePassed: options.requirePassed,
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString()
  });

  await io.mkdir(path.dirname(outputPath), { recursive: true });
  await io.writeText(outputPath, markdown);

  return {
    result: "created",
    testerId,
    outputPath,
    manifest: {
      appName: manifest?.appName,
      commitSha: manifest?.commitSha,
      artifactBaseName: manifest?.artifactBaseName,
      zipPath: manifest?.zip?.path
    }
  };
}

export function createDogfoodHandoffHelpText() {
  return [
    "Usage: npm run dogfood:handoff -- --manifest <alpha-manifest> --tester-id <id> [--output <handoff.md>]",
    "",
    "Creates copyable instructions for a real skfiy dogfood tester.",
    "The handoff includes the alpha zip identity, no-tmux warning, permission checklist,",
    "the exact dogfood:tester command, GitHub issue filing instructions, and maintainer review steps.",
    "It does not create or accept GitHub reports and does not update the cohort.",
    "",
    "Options:",
    "  --workflows <ids>                      Comma-separated workflow ids. Defaults to all required workflows.",
    "  --tracking-issue-url <url>             Dogfood tracking issue URL.",
    "  --release-url <url>                    Optional GitHub release URL for remote testers.",
    "  --app <path>                           App bundle path that dogfood:tester should launch.",
    "  --finder-target-dir <path>             Optional real Finder parent directory for the tester run.",
    "  --chrome-current-page-endpoint <url>   Optional consenting Chrome CDP endpoint for real-page evidence.",
    "  --require-passed                       Include strict passed smoke flags for permission-ready testers.",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

function createDogfoodHandoffMarkdown({
  rootDir,
  manifestPath,
  manifest,
  testerId,
  workflows,
  trackingIssueUrl,
  releaseUrl,
  appPath,
  finderTargetDir,
  chromeCurrentPageEndpoint,
  requirePassed,
  generatedAt
}) {
  const relativeManifestPath = relativePath(rootDir, manifestPath);
  const artifactsDir = `.skfiy-smoke/dogfood/${testerId}`;
  const issueOutput = `.skfiy-dogfood/issues/${testerId}.md`;
  const summaryPath = `.skfiy-dogfood/${testerId}-summary.md`;
  const testerArgs = [
    ["--manifest", relativeManifestPath],
    ...optionalPair("--app", appPath),
    ["--tester-id", testerId],
    ["--workflows", workflows.join(",")],
    ["--artifacts-dir", artifactsDir],
    ["--issue-output", issueOutput],
    ["--summary", summaryPath],
    ...optionalPair("--finder-target-dir", finderTargetDir),
    ...optionalPair("--chrome-current-page-endpoint", chromeCurrentPageEndpoint),
    ...(requirePassed ? [["--require-passed"]] : [])
  ];
  const reviewSummaryPath = `.skfiy-dogfood/reviews/${testerId}.md`;

  return [
    `# skfiy dogfood handoff: ${testerId}`,
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Alpha",
    "",
    `- App name: \`${manifest?.appName ?? "skfiy"}\``,
    `- Bundle id: \`${manifest?.bundleIdentifier ?? "com.sskift.skfiy"}\``,
    `- Manifest: \`${path.basename(manifestPath)}\``,
    `- Alpha zip: \`${path.basename(String(manifest?.zip?.path ?? ""))}\``,
    ...(releaseUrl ? [`- Release: ${releaseUrl}`] : []),
    ...(appPath ? [`- App bundle to test: \`${appPath}\``] : []),
    `- Zip path to share: \`${manifest?.zip?.path ?? "missing"}\``,
    `- Zip SHA256: \`${manifest?.zip?.sha256 ?? "missing"}\``,
    `- Commit: \`${manifest?.commitSha ?? "missing"}\``,
    "",
    "## Tester Rules",
    "",
    "- Do not run this from tmux, detached shell launchers, `npm start`, Vite, or direct Electron.",
    "- Use the packaged app identity from the alpha zip or the explicit `--app` path.",
    "- Grant Screen Recording, Accessibility, Microphone, and Speech Recognition to `skfiy.app` before expecting passed evidence.",
    "- Blocked evidence is acceptable when it records the real permission state, packaged-app launch path, artifacts, and cleanup.",
    "- Do not edit generated artifact paths or alpha identity fields by hand.",
    "",
    "## Tester Command",
    "",
    "```bash",
    formatMultilineCommand("npm run dogfood:tester --", testerArgs),
    "```",
    "",
    "## Filing",
    "",
    `File a \`skfiy dogfood report\` issue using the generated body at \`${issueOutput}\`.`,
    `Then add the filed issue URL to ${trackingIssueUrl} only after maintainer review accepts it.`,
    "",
    "## Maintainer Review",
    "",
    "```bash",
    formatMultilineCommand("npm run dogfood:review --", [
      ["--manifest", relativeManifestPath],
      ["--issue-url", "<filed-dogfood-issue-url>"],
      ["--summary", reviewSummaryPath],
      ["--require-current-head"]
    ]),
    "```",
    "",
    "If review returns `eligibleForAcceptance=true`, apply `dogfood:accepted` plus:",
    "",
    ...workflows.map((workflow) => `- \`workflow:${workflow}\``),
    "",
    "Then collect the accepted report:",
    "",
    "```bash",
    formatMultilineCommand("npm run dogfood:report --", [
      ["--manifest", relativeManifestPath],
      ["--issue-url", "<accepted-dogfood-issue-url>"],
      ["--report", `.skfiy-dogfood/reports/${testerId}.json`],
      ["--cohort", ".skfiy-dogfood/internal-alpha-cohort.json"]
    ]),
    "```",
    ""
  ].join("\n");
}

function validateOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.testerId !== "string" || options.testerId.trim().length === 0) {
    throw new Error("Missing --tester-id <id>.");
  }
  if (!Array.isArray(options.workflows) || options.workflows.length === 0) {
    throw new Error("Missing --workflows <workflow[,workflow]>.");
  }
  const unknownWorkflow = options.workflows.find((workflow) =>
    !REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow)
  );
  if (unknownWorkflow) {
    throw new Error(`Unknown dogfood workflow: ${unknownWorkflow}.`);
  }
}

function readWorkflowList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMultilineCommand(command, args) {
  const lines = args.length > 0 ? [`${command} \\`] : [command];
  for (const arg of args) {
    if (arg.length === 1) {
      lines.push(`  ${arg[0]} \\`);
    } else {
      lines.push(`  ${arg[0]} ${arg[1]} \\`);
    }
  }
  const last = lines.at(-1);
  if (last?.endsWith(" \\")) {
    lines[lines.length - 1] = last.slice(0, -2);
  }

  return lines.join("\n");
}

function optionalPair(flag, value) {
  return typeof value === "string" && value.trim().length > 0
    ? [[flag, value]]
    : [];
}

function relativePath(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath);
  return relative.startsWith("..") ? filePath : relative;
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
      await writeFile(filePath, value);
    }
  };
}

async function runCli() {
  const defaults = createDefaultDogfoodHandoffOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodHandoffArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodHandoffHelpText());
    return;
  }

  const result = await createDogfoodHandoff(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
