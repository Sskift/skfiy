import fs from "node:fs/promises";
import path from "node:path";

export const UI_PRODUCT_PATH = "LaunchServices -> renderer DOM -> React permission onboarding";
export const REQUIRED_PERMISSION_LABELS = ["屏幕录制", "辅助功能", "麦克风", "语音识别"];

export function createDefaultUiSmokeOptions(rootDir) {
  return {
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    outputPath: undefined,
    port: 9310,
    timeoutMs: 10_000,
    settleMs: 1_200,
    productPath: UI_PRODUCT_PATH,
    requiredPermissionLabels: [...REQUIRED_PERMISSION_LABELS],
    requirePassed: false,
    keepExisting: false,
    keepOpen: false,
    help: false
  };
}

export function parseUiSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = readRequiredValue(argv, ++index, arg);
        break;
      case "--output":
        options.outputPath = path.resolve(readRequiredValue(argv, ++index, arg));
        break;
      case "--port":
        options.port = readPositiveInteger(readRequiredValue(argv, ++index, arg), arg);
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readRequiredValue(argv, ++index, arg), arg);
        break;
      case "--settle-ms":
        options.settleMs = readPositiveInteger(readRequiredValue(argv, ++index, arg), arg);
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--keep-existing":
        options.keepExisting = true;
        break;
      case "--keep-open":
        options.keepOpen = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown UI smoke option: ${arg}`);
    }
  }

  return options;
}

export function classifyUiSmokeEvidence(evidence) {
  if (!evidence?.appLaunchViaOpen || evidence.runnerHasTmux) {
    return "failed";
  }

  if (evidence.productPath !== UI_PRODUCT_PATH) {
    return "failed";
  }

  if (!evidence.petClicked) {
    return "failed";
  }

  if (!evidence.onboardingVisible) {
    return hasBlockingPermission(evidence.permissions) ? "missing-onboarding" : "no-onboarding";
  }

  const rowLabels = new Set(
    Array.isArray(evidence.permissionRows)
      ? evidence.permissionRows.map((row) => row?.label).filter(Boolean)
      : []
  );
  const requiredLabels = Array.isArray(evidence.requiredPermissionLabels)
    ? evidence.requiredPermissionLabels
    : REQUIRED_PERMISSION_LABELS;
  const missingLabels = requiredLabels.filter((label) => !rowLabels.has(label));

  return missingLabels.length === 0 ? "passed" : "missing-permission-rows";
}

export async function writeUiSmokeEvidence(outputPath, evidence, io = fs) {
  await io.mkdir(path.dirname(outputPath), { recursive: true });
  await io.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

export function formatUiLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

export function createUiHelpText(defaults) {
  return `Usage: npm run smoke:ui -- [options]

Runs the packaged skfiy app through the real desktop UI path:
  LaunchServices -> renderer DOM -> React permission onboarding

Options:
  --app <path>          App bundle path. Default: ${defaults.appPath}
  --output <path>       Persist JSON evidence to a file.
  --port <number>       Electron remote debugging port. Default: ${defaults.port}
  --timeout-ms <ms>     Wait time for the renderer CDP page. Default: ${defaults.timeoutMs}
  --settle-ms <ms>      Wait after clicking the pet. Default: ${defaults.settleMs}
  --require-passed      Exit 2 unless the UI smoke result is passed.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  -h, --help            Show this help.
`;
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index];

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

function hasBlockingPermission(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return true;
  }

  return Object.values(permissions).some((status) =>
    status?.state === "denied" || status?.state === "not-determined"
  );
}
