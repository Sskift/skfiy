#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REQUIRED_DOGFOOD_WORKFLOWS } from "./verify-dogfood-cohort.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_LISTEN_MS = 9_000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

export function createDefaultDogfoodTesterOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    testerId: undefined,
    workflows: [],
    artifactsDir: undefined,
    issueOutputPath: undefined,
    summaryPath: undefined,
    listenMs: DEFAULT_LISTEN_MS,
    finderTargetDir: undefined,
    chromeCurrentPageEndpoint: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseDogfoodTesterArgs(argv, defaults) {
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
      case "--artifacts-dir":
        options.artifactsDir = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--issue-output":
        options.issueOutputPath = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--summary":
        options.summaryPath = resolvePath(readValue(argv, index, arg));
        index += 1;
        break;
      case "--listen-ms":
        options.listenMs = readPositiveInteger(readValue(argv, index, arg), arg);
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

export function createDogfoodTesterPlan(options) {
  validateDogfoodTesterOptions(options);

  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const testerId = options.testerId.trim();
  const artifactsDir = typeof options.artifactsDir === "string"
    ? options.artifactsDir
    : path.join(rootDir, ".skfiy-smoke", "dogfood", testerId);
  const issueOutputPath = typeof options.issueOutputPath === "string"
    ? options.issueOutputPath
    : path.join(rootDir, ".skfiy-dogfood", "issues", `${testerId}.md`);
  const summaryPath = typeof options.summaryPath === "string"
    ? options.summaryPath
    : path.join(rootDir, ".skfiy-dogfood", `${testerId}-summary.md`);
  const artifacts = {
    ui: path.join(artifactsDir, `${testerId}-ui.json`),
    ghostty: path.join(artifactsDir, `${testerId}-ghostty.json`),
    chrome: path.join(artifactsDir, `${testerId}-chrome.json`),
    finder: path.join(artifactsDir, `${testerId}-finder.json`),
    voice: path.join(artifactsDir, `${testerId}-voice.json`)
  };
  const commands = [
    createNpmCommand("smoke:ui", [
      "--output",
      artifacts.ui
    ]),
    createNpmCommand("smoke:ghostty", [
      "--matrix",
      "--output",
      artifacts.ghostty,
      ...readRequirePassedArgs("smoke:ghostty", options)
    ]),
    createNpmCommand("smoke:chrome", [
      "--output",
      artifacts.chrome,
      ...readOptionalPair("--current-page-endpoint", options.chromeCurrentPageEndpoint),
      ...readRequirePassedArgs("smoke:chrome", options)
    ]),
    createNpmCommand("smoke:finder", [
      "--item-drag-drop",
      "--output",
      artifacts.finder,
      ...readOptionalPair("--target-dir", options.finderTargetDir),
      ...readRequirePassedArgs("smoke:finder", options)
    ]),
    createNpmCommand("smoke:voice", [
      "--output",
      artifacts.voice,
      "--listen-ms",
      String(options.listenMs ?? DEFAULT_LISTEN_MS),
      ...readRequirePassedArgs("smoke:voice", options)
    ]),
    createNpmCommand("dogfood:issue", [
      "--manifest",
      options.manifestPath,
      "--tester-id",
      testerId,
      "--workflows",
      options.workflows.join(","),
      "--check-report",
      "--ui-smoke-artifact",
      artifacts.ui,
      "--smoke-artifact",
      artifacts.ghostty,
      "--chrome-smoke-artifact",
      artifacts.chrome,
      "--finder-smoke-artifact",
      artifacts.finder,
      "--voice-smoke-artifact",
      artifacts.voice,
      "--output",
      issueOutputPath
    ])
  ];

  return {
    rootDir,
    testerId,
    workflows: [...options.workflows],
    artifactsDir,
    artifacts,
    issueOutputPath,
    summaryPath,
    commands
  };
}

export async function runDogfoodTester(options, io = createDefaultIo()) {
  const env = options.env ?? process.env;
  if (typeof env.TMUX === "string" && env.TMUX.trim().length > 0) {
    throw new Error(
      "dogfood:tester must not run from tmux because macOS permissions can be attributed to the wrong app."
    );
  }

  const plan = createDogfoodTesterPlan(options);
  await io.mkdir(plan.artifactsDir, { recursive: true });
  await io.mkdir(path.dirname(plan.issueOutputPath), { recursive: true });
  await io.mkdir(path.dirname(plan.summaryPath), { recursive: true });

  const commandResults = [];
  let result = "completed";

  for (const command of plan.commands) {
    const commandResult = await io.runCommand(command.command, command.args, {
      cwd: plan.rootDir,
      env
    });
    const normalizedResult = {
      id: command.id,
      command: command.command,
      args: command.args,
      exitCode: normalizeExitCode(commandResult.exitCode),
      stdout: String(commandResult.stdout ?? ""),
      stderr: String(commandResult.stderr ?? "")
    };
    commandResults.push(normalizedResult);

    if (normalizedResult.exitCode !== 0) {
      result = "failed";
      const summary = createDogfoodTesterSummary({
        plan,
        result,
        commandResults,
        generatedAt: readNow(options)
      });
      await io.writeText(plan.summaryPath, summary);
      const error = new Error(
        `${command.id} failed with exit code ${normalizedResult.exitCode}. See ${plan.summaryPath}.`
      );
      error.result = {
        result,
        plan,
        commandResults,
        issueOutputPath: plan.issueOutputPath,
        summaryPath: plan.summaryPath
      };
      throw error;
    }
  }

  await io.writeText(plan.summaryPath, createDogfoodTesterSummary({
    plan,
    result,
    commandResults,
    generatedAt: readNow(options)
  }));

  return {
    result,
    plan,
    commandResults,
    issueOutputPath: plan.issueOutputPath,
    summaryPath: plan.summaryPath,
    artifacts: plan.artifacts
  };
}

export function createDogfoodTesterHelpText() {
  return [
    "Usage: npm run dogfood:tester -- --manifest <alpha-manifest> --tester-id <id> --workflows <ids> [options]",
    "",
    "Runs packaged-app smokes sequentially for one real tester, then generates a checked dogfood issue body.",
    "It does not fabricate tester reports, file GitHub issues, add dogfood:accepted labels, or weaken cohort gates.",
    "",
    "Required:",
    "  --manifest <path>              Alpha manifest generated by npm run alpha:artifact.",
    "  --tester-id <id>               Stable anonymized tester id.",
    "  --workflows <ids>              Comma-separated workflow ids for this tester report.",
    "",
    "Options:",
    "  --artifacts-dir <path>         Directory for the five smoke JSON files.",
    "  --issue-output <path>          Markdown issue body path.",
    "  --summary <path>               Local run summary path.",
    `  --listen-ms <number>           Native voice listen window. Default: ${DEFAULT_LISTEN_MS}.`,
    "  --finder-target-dir <path>     Parent directory for the isolated Finder fixture.",
    "  --chrome-current-page-endpoint <url>",
    "                                Attach Chrome BYO current-page mode to a consenting tester page.",
    "  --require-passed               Require Ghostty, Chrome, Finder, and voice smokes to pass.",
    "  -h, --help                     Show this help.",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

function validateDogfoodTesterOptions(options) {
  if (typeof options.manifestPath !== "string" || options.manifestPath.trim().length === 0) {
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

function createNpmCommand(id, scriptArgs) {
  return {
    id,
    command: "npm",
    args: ["run", id, "--", ...scriptArgs]
  };
}

function readRequirePassedArgs(id, options) {
  if (options.requirePassed !== true) {
    return [];
  }
  if (id === "smoke:ui") {
    return [];
  }
  return ["--require-passed"];
}

function readOptionalPair(flag, value) {
  return typeof value === "string" && value.trim().length > 0
    ? [flag, value]
    : [];
}

function createDogfoodTesterSummary({
  plan,
  result,
  commandResults,
  generatedAt
}) {
  const lines = [
    "# skfiy dogfood tester run",
    "",
    `Generated at: ${generatedAt}`,
    `Result: ${result}`,
    `Tester: ${plan.testerId}`,
    `Workflows: ${plan.workflows.join(", ")}`,
    `Issue draft: ${plan.issueOutputPath}`,
    "",
    "## Artifacts",
    "",
    `- UI: ${plan.artifacts.ui}`,
    `- Ghostty: ${plan.artifacts.ghostty}`,
    `- Chrome: ${plan.artifacts.chrome}`,
    `- Finder: ${plan.artifacts.finder}`,
    `- Voice: ${plan.artifacts.voice}`,
    "",
    "## Commands",
    "",
    "| step | exit | command |",
    "| --- | ---: | --- |",
    ...commandResults.map((commandResult) =>
      `| ${escapeMarkdownTableCell(commandResult.id)} | ${commandResult.exitCode} | ${escapeMarkdownTableCell(formatCommand(commandResult.command, commandResult.args))} |`
    ),
    "",
    "This runner did not file or accept a GitHub report. File the generated issue body manually, then maintainers must review it and add dogfood:accepted plus workflow labels before dogfood:collect can count it.",
    ""
  ];

  return lines.join("\n");
}

function formatCommand(command, args) {
  return [command, ...args.map((arg) => shellQuote(arg))].join(" ");
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_/:=.,+-]+$/.test(text)
    ? text
    : JSON.stringify(text);
}

function escapeMarkdownTableCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function readWorkflowList(value) {
  return value.split(",")
    .map((workflow) => workflow.trim())
    .filter(Boolean);
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function readPositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
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

function readNow(options) {
  return typeof options.now === "function" ? options.now() : new Date().toISOString();
}

function normalizeExitCode(exitCode) {
  const numeric = Number(exitCode);
  return Number.isInteger(numeric) ? numeric : 1;
}

function createDefaultIo() {
  return {
    mkdir,
    async writeText(filePath, text) {
      await writeFile(filePath, text);
    },
    async runCommand(command, args, options) {
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: options?.cwd,
          env: options?.env,
          maxBuffer: DEFAULT_MAX_BUFFER
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (error) {
        return {
          stdout: String(error?.stdout ?? ""),
          stderr: String(error?.stderr ?? error?.message ?? ""),
          exitCode: normalizeExitCode(error?.exitCode ?? error?.code)
        };
      }
    }
  };
}

async function main() {
  const defaults = createDefaultDogfoodTesterOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodTesterArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(`${createDogfoodTesterHelpText()}\n`);
    return;
  }

  const result = await runDogfoodTester(options);
  process.stdout.write(`${JSON.stringify({
    result: result.result,
    issueOutputPath: result.issueOutputPath,
    summaryPath: result.summaryPath,
    artifacts: result.artifacts,
    commandResults: result.commandResults.map((commandResult) => ({
      id: commandResult.id,
      exitCode: commandResult.exitCode
    }))
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
