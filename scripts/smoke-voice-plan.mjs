import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const DEFAULT_VOICE_PROVIDER = "native-macos";
export const DEFAULT_LOCALE = "zh-CN";
export const DEFAULT_PORT = 9234;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_LISTEN_MS = 9_000;
export const VOICE_PRODUCT_PATH = "renderer -> preload -> main -> helper -> native macOS Speech";

export function createDefaultVoiceSmokeOptions(rootDir) {
  return {
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    provider: DEFAULT_VOICE_PROVIDER,
    locale: DEFAULT_LOCALE,
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    listenMs: DEFAULT_LISTEN_MS,
    keepExisting: false,
    keepOpen: false,
    requirePassed: false,
    outputPath: undefined,
    help: false,
    productPath: VOICE_PRODUCT_PATH
  };
}

export function parseVoiceSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--locale":
        options.locale = readValue(argv, index, arg);
        index += 1;
        break;
      case "--port":
        options.port = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--listen-ms":
        options.listenMs = readPositiveInteger(readValue(argv, index, arg), arg);
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

export function classifyVoiceSmokeEvidence({
  providerEvents = [],
  taskEvents = [],
  transcriptEvents = [],
  turnReplay,
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  productPath
}) {
  if (hasPermissionBlockedEvent(providerEvents) || hasPermissionBlockedTask(taskEvents)) {
    return "blocked";
  }

  if (
    hasProviderState(providerEvents, "failed")
    || hasTaskStatus(taskEvents, "failed")
  ) {
    return "failed";
  }

  const hasListened = hasProviderState(providerEvents, "listening");
  const hasStopped = hasProviderState(providerEvents, "stopped");
  const hasFinalTranscript = transcriptEvents.some((event) =>
    event?.isFinal === true
    && typeof event.text === "string"
    && event.text.trim().length > 0
  );
  const hasDownstreamTask = hasVoiceDownstreamTaskEvent(taskEvents);

  if (!hasListened && providerEvents.length === 0 && transcriptEvents.length === 0) {
    return "no-events";
  }

  if (!hasFinalTranscript) {
    return "no-transcript";
  }

  if (!hasListened || !hasStopped || !hasDownstreamTask) {
    return "failed";
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || productPath !== VOICE_PRODUCT_PATH
  ) {
    return "failed";
  }

  return hasPassedGhosttyTurnReplay(turnReplay) ? "passed" : "failed";
}

function hasProviderState(events, state) {
  return events.some((event) => event?.state === state);
}

function hasTaskStatus(events, status) {
  return events.some((event) => event?.status === status);
}

function hasVoiceDownstreamTaskEvent(events) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) =>
    typeof event?.status === "string"
    && [
      "approval_required",
      "observing",
      "executing",
      "needs_confirmation",
      "completed",
      "failed"
    ].includes(event.status)
  );
}

function hasPassedGhosttyTurnReplay(turnReplay) {
  if (!turnReplay || typeof turnReplay !== "object") {
    return false;
  }

  const transcript = turnReplay.transcript;
  const timeline = Array.isArray(turnReplay.timeline) ? turnReplay.timeline : [];

  return Boolean(transcript)
    && typeof transcript === "object"
    && transcript.outcome === "completed"
    && timeline.some((event) => event?.status === "completed")
    && hasGhosttyApp(transcript.apps)
    && hasRequiredGhosttyScreenshots(transcript.screenshots)
    && hasRequiredGhosttyActions(transcript.actions);
}

function hasGhosttyApp(apps) {
  return Array.isArray(apps)
    && apps.some((app) => app?.bundleId === "com.mitchellh.ghostty");
}

function hasRequiredGhosttyScreenshots(screenshots) {
  if (!Array.isArray(screenshots)) {
    return false;
  }

  const before = screenshots.find((screenshot) =>
    screenshot?.stage === "before"
    && screenshot.bundleId === "com.mitchellh.ghostty"
    && typeof screenshot.path === "string"
    && screenshot.path.trim().length > 0
    && readOptionalPositiveNumber(screenshot.bytes) > 0
  );
  const after = screenshots.find((screenshot) =>
    screenshot?.stage === "after"
    && screenshot.bundleId === "com.mitchellh.ghostty"
    && typeof screenshot.path === "string"
    && screenshot.path.trim().length > 0
    && readOptionalPositiveNumber(screenshot.bytes) > 0
  );

  return Boolean(before && after);
}

function hasRequiredGhosttyActions(actions) {
  if (!Array.isArray(actions)) {
    return false;
  }

  return actions.some((action) => action?.type === "type_text")
    && actions.some((action) => action?.type === "press_key")
    && actions.some((action) =>
      action?.type === "verify"
      && action.actionType === "type_text"
      && action.status === "passed"
    )
    && actions.some((action) =>
      action?.type === "verify"
      && action.actionType === "press_key"
      && action.status === "passed"
    );
}

function readOptionalPositiveNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function hasPermissionBlockedEvent(events) {
  return events.some((event) =>
    (event?.state === "unavailable" || event?.state === "failed")
    && typeof event.message === "string"
    && isVoicePermissionMessage(event.message)
  );
}

function hasPermissionBlockedTask(events) {
  return events.some((event) =>
    event?.status === "failed"
    && typeof event.message === "string"
    && isVoicePermissionMessage(event.message)
  );
}

function isVoicePermissionMessage(message) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission")
    && (
      normalized.includes("speech recognition")
      || normalized.includes("microphone")
      || normalized.includes("speech")
    )
  );
}

export function formatVoiceLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

export function createVoiceHelpText(defaults) {
  return `Usage: npm run smoke:voice -- [options]

Runs the packaged skfiy app through the real native voice product path:
renderer -> preload -> main -> helper -> native macOS Speech.

Options:
  --app <path>          App bundle path. Default: dist/skfiy.app
  --locale <id>         Speech locale. Default: ${defaults.locale}
  --port <number>       Electron remote debugging port. Default: ${defaults.port}
  --timeout-ms <ms>     Wait time for the renderer CDP page. Default: ${defaults.timeoutMs}
  --listen-ms <ms>      Wait after prepareDictation for native transcript events. Default: ${defaults.listenMs}
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  --require-passed      Exit non-zero unless native voice reaches passed.
  --output <path>       Write the complete voice smoke JSON evidence to this file.
  -h, --help            Show this help.
`;
}

export async function writeVoiceSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);
  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function readValue(argv, index, name) {
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
