import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const PRODUCT_PATH = "dist/skfiy -> skfiy CLI command matrix";
export const DEFAULT_TIMEOUT_MS = 8_000;
export const FIXTURE_EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

export const CLI_COMMAND_MATRIX = [
  {
    id: "status-json",
    args: ["status", "--json"]
  },
  {
    id: "doctor-json",
    args: ["doctor", "--json"]
  },
  {
    id: "chrome-status",
    args: ["chrome", "status", "--extension-id", FIXTURE_EXTENSION_ID]
  },
  {
    id: "mcp-serve-json",
    args: ["mcp", "serve", "--stdio", "--json"]
  },
  {
    id: "dashboard-json",
    args: ["dashboard", "--no-open", "--port", "0", "--json"],
    longRunning: true
  },
  {
    id: "release-check-json",
    args: ["release", "check", "--json-output", "__CLI_SMOKE_RELEASE_JSON__"]
  },
  {
    id: "alpha-artifact-json",
    args: ["alpha", "artifact"]
  },
  {
    id: "smoke-dashboard-json",
    args: [
      "smoke",
      "dashboard",
      "--output",
      "__CLI_SMOKE_DASHBOARD_JSON__",
      "--require-passed",
      "--json"
    ],
    nestedProductSmoke: true
  }
];

export function createDefaultCliSmokeOptions(rootDir) {
  return {
    cliPath: path.join(rootDir, "dist", "skfiy"),
    isolatedHomeDir: path.join(rootDir, ".skfiy-cli-smoke", "home"),
    scratchDir: path.join(rootDir, ".skfiy-cli-smoke"),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseCliSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--cli":
        options.cliPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--isolated-home":
        options.isolatedHomeDir = path.resolve(readRequiredValue(argv, index, arg));
        options.scratchDir = path.dirname(options.isolatedHomeDir);
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readRequiredValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readRequiredValue(argv, index, arg));
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
        throw new Error(`Unknown CLI smoke option: ${arg}`);
    }
  }

  return options;
}

export function createCliSmokeCommandRuns(options) {
  return CLI_COMMAND_MATRIX.map((entry) => ({
    ...entry,
    command: [
      options.cliPath,
      ...entry.args.map((arg) => replaceCommandPlaceholder(arg, options))
    ]
  }));
}

export function classifyCliSmokeEvidence(evidence) {
  if (
    !evidence
    || evidence.runnerHasTmux
    || evidence.productPath !== PRODUCT_PATH
    || !isBuiltCliPath(evidence.cliPath)
    || !isIsolatedHomeDir(evidence.isolatedHomeDir)
    || !Array.isArray(evidence.commands)
    || evidence.commands.length !== CLI_COMMAND_MATRIX.length
  ) {
    return "failed";
  }

  for (const expected of CLI_COMMAND_MATRIX) {
    const command = evidence.commands.find((item) => item?.id === expected.id);

    if (!isPassingCommandEvidence(command, expected, evidence.cliPath)) {
      return "failed";
    }
  }

  return "passed";
}

export function createCliSmokeHelpText(defaults) {
  return `Usage: npm run smoke:cli -- [options]

Runs the built skfiy CLI through a binary command matrix:
dist/skfiy -> status/doctor/chrome status/mcp/dashboard/release/alpha/smoke dashboard.

Options:
  --cli <path>            Built CLI path. Default: ${defaults.cliPath}
  --isolated-home <path>  Temporary HOME for Chrome host status. Default: ${defaults.isolatedHomeDir}
  --timeout-ms <ms>       Wait time for each CLI command. Default: ${defaults.timeoutMs}
  --output <path>         Persist JSON evidence to a file.
  --require-passed        Exit 2 unless the CLI smoke result is passed.
  -h, --help              Show this help.
`;
}

export async function writeCliSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);

  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function replaceCommandPlaceholder(arg, options) {
  if (arg === "__CLI_SMOKE_RELEASE_JSON__") {
    return path.join(options.scratchDir, "release-check.json");
  }
  if (arg === "__CLI_SMOKE_DASHBOARD_JSON__") {
    return path.join(options.scratchDir, "dashboard-smoke.json");
  }

  return arg;
}

function readRequiredValue(argv, index, name) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function isPassingCommandEvidence(command, expected, cliPath) {
  if (
    !command
    || command.exitCode !== 0
    || command.tokenLeakDetected
    || typeof command.stderr !== "string"
    || hasTokenLeak([command.stderr])
    || !matchesExpectedCommand(command.command, expected, cliPath)
    || command.stdoutJson?.schemaVersion !== 1
  ) {
    return false;
  }

  if (expected.id === "dashboard-json") {
    return command.stdoutJson?.command === "dashboard"
      && command.stdoutJson?.result === "running"
      && command.stdoutJson?.tokenPrinted === false
      && command.stdoutJson?.bind?.host === "127.0.0.1"
      && Number.isInteger(command.stdoutJson?.bind?.port)
      && command.cleanup?.exited === true;
  }

  if (expected.id === "smoke-dashboard-json") {
    return command.stdoutJson?.command === "smoke dashboard"
      && command.stdoutJson?.result === "passed"
      && command.stdoutJson?.exitCode === 0
      && command.stdoutJson?.smoke?.result === "passed"
      && command.stdoutJson?.smoke?.runnerHasTmux === false;
  }

  return true;
}

function matchesExpectedCommand(command, expected, cliPath) {
  if (!Array.isArray(command) || command[0] !== cliPath) {
    return false;
  }

  const actualArgs = command.slice(1);

  if (actualArgs.length !== expected.args.length) {
    return false;
  }

  return expected.args.every((arg, index) => (
    arg.startsWith("__CLI_SMOKE_")
      ? typeof actualArgs[index] === "string" && actualArgs[index].length > 0
      : actualArgs[index] === arg
  ));
}

function isBuiltCliPath(cliPath) {
  if (typeof cliPath !== "string") {
    return false;
  }

  const normalized = path.normalize(cliPath);

  return path.basename(normalized) === "skfiy"
    && path.basename(path.dirname(normalized)) === "dist";
}

function isIsolatedHomeDir(homeDir) {
  if (typeof homeDir !== "string") {
    return false;
  }

  const normalized = path.normalize(homeDir);

  return path.basename(normalized) === "home"
    && path.basename(path.dirname(normalized)) === ".skfiy-cli-smoke";
}

function hasTokenLeak(parts) {
  return parts
    .filter((part) => typeof part === "string")
    .some((part) =>
      /token=/i.test(part)
      || /"tokenPrinted"\s*:\s*true/i.test(part)
      || /"token"\s*:\s*"[^"]+"/i.test(part)
    );
}
