import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const PRODUCT_PATH = "dist/skfiy -> skfiy dashboard -> loopback dashboard server";
export const DEFAULT_TIMEOUT_MS = 8_000;

export function createDefaultDashboardSmokeOptions(rootDir) {
  return {
    cliPath: path.join(rootDir, "dist", "skfiy"),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseDashboardSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--cli":
        options.cliPath = path.resolve(readRequiredValue(argv, index, arg));
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
        throw new Error(`Unknown dashboard smoke option: ${arg}`);
    }
  }

  return options;
}

export function classifyDashboardSmokeEvidence(evidence) {
  const cliOutput = evidence?.cliOutput;
  const descriptor = evidence?.descriptorResponse?.body;
  const snapshot = evidence?.snapshotResponse?.body;
  const shellBody = String(evidence?.shellResponse?.body ?? "");
  const outputBind = cliOutput?.bind;
  const descriptorBind = descriptor?.bind;

  if (
    !evidence
    || evidence.runnerHasTmux
    || evidence.productPath !== PRODUCT_PATH
    || !isBuiltCliPath(evidence.cliPath)
    || !isDashboardCommand(evidence.command)
    || evidence.tokenLeakDetected
  ) {
    return "failed";
  }

  if (
    cliOutput?.command !== "dashboard"
    || cliOutput?.result !== "running"
    || cliOutput?.shouldOpen !== false
    || cliOutput?.tokenPrinted !== false
    || !isLoopbackBind(outputBind)
    || !isMatchingDashboardUrl(cliOutput?.url, outputBind)
  ) {
    return "failed";
  }

  if (
    evidence.descriptorResponse?.status !== 200
    || descriptor?.auth?.tokenPrinted !== false
    || !isLoopbackBind(descriptorBind)
    || !sameBind(outputBind, descriptorBind)
    || descriptor?.url !== cliOutput.url
  ) {
    return "failed";
  }

  if (
    evidence.snapshotResponse?.status !== 200
    || snapshot?.schemaVersion !== 1
    || snapshot?.runtimeHealth?.package?.name !== "skfiy"
    || typeof snapshot?.runtimeHealth?.package?.version !== "string"
    || snapshot?.runtimeHealth?.app?.state !== "installed"
    || snapshot?.runtimeHealth?.app?.signing?.state !== "valid"
    || snapshot?.runtimeHealth?.cli?.state !== "installed"
    || snapshot?.runtimeHealth?.dashboard?.state !== "running"
    || snapshot?.runtimeHealth?.dashboard?.url !== cliOutput.url
    || !Number.isInteger(snapshot?.runtimeHealth?.dashboard?.pid)
    || snapshot.runtimeHealth.dashboard.pid <= 0
    || !Number.isFinite(snapshot?.runtimeHealth?.dashboard?.uptimeSeconds)
    || snapshot.runtimeHealth.dashboard.uptimeSeconds < 0
    || !hasPermissionEvidence(snapshot?.permissions)
    || !hasDesktopSessionEvidence(snapshot?.runtimeHealth?.desktopSession)
    || !snapshot?.currentTurn
    || !snapshot?.replay
    || !Array.isArray(snapshot?.smokeEvidence?.artifacts)
    || snapshot?.longHorizon?.session !== "money-run"
    || !Array.isArray(snapshot?.alerts)
  ) {
    return "failed";
  }

  if (
    evidence.shellResponse?.status !== 200
    || !shellBody.includes("skfiy Dashboard")
    || !shellBody.includes("/descriptor.json")
    || !shellBody.includes("/snapshot.json")
  ) {
    return "failed";
  }

  return "passed";
}

export function createDashboardHelpText(defaults) {
  return `Usage: npm run smoke:dashboard -- [options]

Runs the built skfiy CLI through the dashboard product path:
dist/skfiy -> skfiy dashboard --no-open --port 0 --json -> loopback dashboard server.

Options:
  --cli <path>          Built CLI path. Default: ${defaults.cliPath}
  --timeout-ms <ms>     Wait time for CLI output and dashboard fetches. Default: ${defaults.timeoutMs}
  --output <path>       Persist JSON evidence to a file.
  --require-passed      Exit 2 unless the dashboard smoke result is passed.
  -h, --help            Show this help.
`;
}

export async function writeDashboardSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);

  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
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

function isBuiltCliPath(cliPath) {
  if (typeof cliPath !== "string") {
    return false;
  }

  const normalized = path.normalize(cliPath);

  return path.basename(normalized) === "skfiy"
    && path.basename(path.dirname(normalized)) === "dist";
}

function isDashboardCommand(command) {
  if (!Array.isArray(command) || command.length < 6) {
    return false;
  }

  const [, subcommand, noOpenFlag, portFlag, portValue, jsonFlag] = command;

  return subcommand === "dashboard"
    && noOpenFlag === "--no-open"
    && portFlag === "--port"
    && portValue === "0"
    && jsonFlag === "--json";
}

function isLoopbackBind(bind) {
  return bind?.host === "127.0.0.1"
    && Number.isInteger(bind.port)
    && bind.port > 0
    && bind.port <= 65535;
}

function isMatchingDashboardUrl(url, bind) {
  return typeof url === "string"
    && isLoopbackBind(bind)
    && url === `http://127.0.0.1:${bind.port}/`;
}

function sameBind(left, right) {
  return left?.host === right?.host && left?.port === right?.port;
}

function hasPermissionEvidence(permissions) {
  const required = [
    "screenRecording",
    "accessibility",
    "microphone",
    "speechRecognition"
  ];

  return required.every((permission) =>
    typeof permissions?.[permission] === "string"
    && permissions[permission] !== "unknown"
  );
}

function hasDesktopSessionEvidence(desktopSession) {
  return desktopSession?.state === "controllable" || desktopSession?.state === "blocked";
}
