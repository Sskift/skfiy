import path from "node:path";

export const DEFAULT_PORT = 9245;
export const DEFAULT_CHROME_PORT = 9444;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_SETTLE_MS = 500;
export const EXPECTED_TEXT = "skfiy chrome smoke ready";
export const FORM_EXPECTED_TEXT = "skfiy agent@skfiy.test operator form submitted";
export const SENSITIVE_EXPECTED_RESULT = "sensitive-paused";
export const PRODUCT_PATH = "renderer -> preload -> main -> CDP -> Chrome";

export function createDefaultChromeSmokeOptions(rootDir) {
  return {
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    chromeAppName: "Google Chrome",
    port: DEFAULT_PORT,
    chromePort: DEFAULT_CHROME_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    keepExisting: false,
    keepOpen: false,
    requirePassed: false,
    outputPath: undefined,
    help: false
  };
}

export function parseChromeSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--chrome-app":
        options.chromeAppName = readValue(argv, index, arg);
        index += 1;
        break;
      case "--port":
        options.port = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--chrome-port":
        options.chromePort = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--settle-ms":
        options.settleMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--keep-existing":
        options.keepExisting = true;
        break;
      case "--keep-open":
        options.keepOpen = true;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
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

export function createHelpText(defaults) {
  return `Usage: npm run smoke:chrome -- [options]

Runs the packaged skfiy app through a Chrome test-page product path.

Options:
  --app <path>          App bundle path. Default: ${defaults.appPath}
  --chrome-app <name>   macOS Chrome app name. Default: ${defaults.chromeAppName}
  --port <number>       Electron remote debugging port. Default: ${defaults.port}
  --chrome-port <num>   Chrome DevTools Protocol port. Default: ${defaults.chromePort}
  --timeout-ms <number> Renderer and Chrome wait timeout. Default: ${defaults.timeoutMs}
  --settle-ms <number>  Delay after renderer actions. Default: ${defaults.settleMs}
  --output <path>       Persist smoke evidence JSON.
  --require-passed      Exit non-zero unless the smoke result is passed.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  -h, --help            Show this help.
`;
}

export function classifyChromeSmokeEvidence({
  events = [],
  extractedText = "",
  expectedText = EXPECTED_TEXT,
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  chromeLaunchViaOpen = false,
  productPath
}) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (last.status === "approval_required") {
    return "needs-user-confirmation";
  }

  if (last.status === "needs_confirmation" && isChromeSensitivePauseMessage(last.message)) {
    return SENSITIVE_EXPECTED_RESULT;
  }

  if (last.status === "failed" && isChromeBlockedMessage(last.message)) {
    return "blocked";
  }

  if (last.status !== "completed") {
    return last.status ?? "failed";
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || chromeLaunchViaOpen !== true
    || productPath !== PRODUCT_PATH
    || !String(extractedText).includes(expectedText)
  ) {
    return "failed";
  }

  return "passed";
}

function isChromeSensitivePauseMessage(message) {
  return typeof message === "string"
    && message.includes("Verification failed (sensitive): Sensitive UI text is visible.");
}

function isChromeBlockedMessage(message) {
  return typeof message === "string"
    && message.toLowerCase().includes("chrome")
    && (
      message.toLowerCase().includes("not configured")
      || message.toLowerCase().includes("endpoint")
      || message.toLowerCase().includes("unavailable")
    );
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}
