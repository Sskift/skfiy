import path from "node:path";

export const DEFAULT_PORT = 9245;
export const DEFAULT_CHROME_PORT = 9444;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_SETTLE_MS = 500;
export const EXPECTED_TEXT = "skfiy chrome smoke ready";
export const FORM_EXPECTED_TEXT = "skfiy agent@skfiy.test operator form submitted";
export const CURRENT_PAGE_COMMAND = "观察 Chrome 当前页面并提取正文";
export const SENSITIVE_EXPECTED_RESULT = "sensitive-paused";
export const PRODUCT_PATH = "renderer -> preload -> main -> CDP -> Chrome";
export const NATIVE_HOST_BRIDGE_PRODUCT_PATH =
  "dist/skfiy -> Chrome Native Messaging heartbeat";
export const INSTALLED_EXTENSION_PRODUCT_PATH =
  "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat";
export const CHROME_EXTENSION_SETUP_GUIDE_PATH = "docs/chrome-extension-setup.md";
export const CHROME_EXTENSION_SETUP_GUIDE_REQUIRED_TERMS = [
  "chrome-extension/manifest.json",
  "com.sskift.skfiy",
  "NativeMessagingHosts/com.sskift.skfiy.json",
  "chrome-extension-connection.json",
  "chrome install-host --extension-id <extension-id>",
  "chrome status --extension-id <extension-id>",
  "Refresh host policy",
  "Host permission",
  "Page session",
  "doctor --json --extension-id <extension-id>",
  "branded_chrome_load_extension_removed"
];
export const INSTALLED_EXTENSION_CHROME_APP_CANDIDATES = [
  "Google Chrome for Testing",
  "Chromium"
];
export const FALLBACK_PRODUCT_PATH =
  "renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback";
export const FALLBACK_SWITCH_PRODUCT_PATH =
  "renderer -> preload -> main -> CDP failure -> helper observe_app -> Chrome screenshot fallback";

export function createDefaultChromeSmokeOptions(rootDir) {
  return {
    appPath: path.join(rootDir, "dist", "skfiy.app"),
    cliPath: path.join(rootDir, "dist", "skfiy"),
    chromeAppName: "Google Chrome",
    extensionChromeAppName: undefined,
    port: DEFAULT_PORT,
    chromePort: DEFAULT_CHROME_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    keepExisting: false,
    keepOpen: false,
    requirePassed: false,
    currentPageEndpoint: undefined,
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
      case "--cli":
        options.cliPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--chrome-app":
        options.chromeAppName = readValue(argv, index, arg);
        index += 1;
        break;
      case "--extension-chrome-app":
        options.extensionChromeAppName = readValue(argv, index, arg);
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
      case "--current-page-endpoint":
        options.currentPageEndpoint = normalizeEndpoint(readValue(argv, index, arg), arg);
        index += 1;
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
Chrome extension setup guide: ${CHROME_EXTENSION_SETUP_GUIDE_PATH}

Options:
  --app <path>          App bundle path. Default: ${defaults.appPath}
  --cli <path>          Packaged CLI path for Native Messaging heartbeat. Default: ${defaults.cliPath}
  --chrome-app <name>   macOS Chrome app name. Default: ${defaults.chromeAppName}
  --extension-chrome-app <name>
                        Browser app for installed-extension smoke. Auto-prefers Chrome for Testing/Chromium when available.
  --port <number>       Electron remote debugging port. Default: ${defaults.port}
  --chrome-port <num>   Chrome DevTools Protocol port. Default: ${defaults.chromePort}
  --timeout-ms <number> Renderer and Chrome wait timeout. Default: ${defaults.timeoutMs}
  --settle-ms <number>  Delay after renderer actions. Default: ${defaults.settleMs}
  --output <path>       Persist smoke evidence JSON.
  --require-passed      Exit non-zero unless the smoke result is passed.
  --current-page-endpoint <url>
                        Attach to an existing Chrome CDP endpoint and observe the current page only.
  --keep-existing       Do not quit an existing skfiy app before launch.
  --keep-open           Leave skfiy open after the smoke run.
  -h, --help            Show this help.
`;
}

export function validateChromeExtensionSetupGuide(source) {
  const text = String(source ?? "");
  const missingTerms = CHROME_EXTENSION_SETUP_GUIDE_REQUIRED_TERMS
    .filter((term) => !text.includes(term));

  return {
    ok: missingTerms.length === 0,
    missingTerms
  };
}

export function selectInstalledExtensionChromeApp({
  chromeAppName,
  extensionChromeAppName,
  availableAppNames = []
}) {
  const normalizedAvailable = availableAppNames.filter((name) => typeof name === "string");
  const candidates = INSTALLED_EXTENSION_CHROME_APP_CANDIDATES;

  if (extensionChromeAppName) {
    return {
      chromeAppName: extensionChromeAppName,
      source: "explicit-extension-chrome-app",
      loadExtensionFriendly: isLoadExtensionFriendlyChromeAppName(extensionChromeAppName),
      candidateAppNames: candidates,
      availableAppNames: normalizedAvailable
    };
  }

  if (isLoadExtensionFriendlyChromeAppName(chromeAppName)) {
    return {
      chromeAppName,
      source: "primary-browser",
      loadExtensionFriendly: true,
      candidateAppNames: candidates,
      availableAppNames: normalizedAvailable
    };
  }

  const discovered = candidates.find((candidate) => normalizedAvailable.includes(candidate));
  if (discovered) {
    return {
      chromeAppName: discovered,
      source: "auto-discovered-loadable-browser",
      loadExtensionFriendly: true,
      candidateAppNames: candidates,
      availableAppNames: normalizedAvailable
    };
  }

  return {
    chromeAppName,
    source: "fallback-primary-browser",
    loadExtensionFriendly: isLoadExtensionFriendlyChromeAppName(chromeAppName),
    candidateAppNames: candidates,
    availableAppNames: normalizedAvailable,
    recommendedBrowser: "Chrome for Testing or Chromium"
  };
}

export function isLoadExtensionFriendlyChromeAppName(chromeAppName) {
  return /Chrome for Testing|Chromium/i.test(String(chromeAppName ?? ""));
}

export function classifyChromeSmokeEvidence({
  events = [],
  extractedText = "",
  expectedText = EXPECTED_TEXT,
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  chromeLaunchViaOpen = false,
  productPath,
  nativeHostBridgeRun,
  installedExtensionRun,
  readinessDiagnostics
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
    || !hasChromeReadinessDiagnostics(readinessDiagnostics)
    || !hasNativeHostBridgeEvidence(nativeHostBridgeRun)
    || !hasInstalledExtensionSmokeEvidence(installedExtensionRun)
    || !String(extractedText).includes(expectedText)
  ) {
    return "failed";
  }

  return "passed";
}

function hasInstalledExtensionSmokeEvidence(run) {
  if (isKnownInstalledExtensionSmokeBlocker(run)) {
    return true;
  }

  return run
    && typeof run === "object"
    && run.result === "passed"
    && run.productPath === INSTALLED_EXTENSION_PRODUCT_PATH
    && typeof run.extensionId === "string"
    && run.extensionId.length === 32
    && run.launchOrigin === `chrome-extension://${run.extensionId}/`
    && run.response?.type === "skfiy.native.response"
    && run.response?.requestId === "chrome-smoke-installed-extension"
    && run.response?.result === "accepted"
    && typeof run.heartbeatPath === "string"
    && run.heartbeatPath.includes("Application Support/skfiy/chrome-extension-connection.json")
    && run.heartbeat?.hostName === "com.sskift.skfiy"
    && run.heartbeat?.launchOrigin === `chrome-extension://${run.extensionId}/`
    && run.heartbeat?.messageType === "skfiy.page.observe"
    && run.heartbeat?.requestId === "chrome-smoke-installed-extension"
    && hasInstalledExtensionStatusDiagnostics(run.extensionStatus, run.extensionId);
}

function isKnownInstalledExtensionSmokeBlocker(run) {
  return run
    && typeof run === "object"
    && run.result === "blocked"
    && run.productPath === INSTALLED_EXTENSION_PRODUCT_PATH
    && run.blockedReason === "branded_chrome_load_extension_removed"
    && typeof run.chromeVersion === "string"
    && typeof run.extensionPath === "string"
    && run.recommendedBrowser === "Chrome for Testing or Chromium";
}

function hasNativeHostBridgeEvidence(run) {
  return run
    && typeof run === "object"
    && run.result === "passed"
    && run.productPath === NATIVE_HOST_BRIDGE_PRODUCT_PATH
    && Array.isArray(run.command)
    && typeof run.command[0] === "string"
    && path.basename(run.command[0]) === "skfiy"
    && run.response?.type === "skfiy.native.response"
    && run.response?.requestId === "chrome-smoke-native-host"
    && run.response?.result === "accepted"
    && run.hostPolicyResponse?.type === "skfiy.native.response"
    && run.hostPolicyResponse?.requestId === "chrome-smoke-host-policy"
    && run.hostPolicyResponse?.result === "accepted"
    && run.hostPolicyResponse?.hostPolicy?.schemaVersion === 1
    && (run.hostPolicyResponse.hostPolicy.state === "default"
      || run.hostPolicyResponse.hostPolicy.state === "configured"
      || run.hostPolicyResponse.hostPolicy.state === "invalid")
    && run.hostPolicyResponse.hostPolicy.policy?.defaultMode === "ask"
    && Array.isArray(run.hostPolicyResponse.hostPolicy.policy?.allowedHosts)
    && Array.isArray(run.hostPolicyResponse.hostPolicy.policy?.currentTurnAllowedHosts)
    && Array.isArray(run.hostPolicyResponse.hostPolicy.policy?.blockedHosts)
    && typeof run.heartbeatPath === "string"
    && run.heartbeatPath.includes("Application Support/skfiy/chrome-extension-connection.json")
    && run.heartbeat?.hostName === "com.sskift.skfiy"
    && run.heartbeat?.launchOrigin === "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
    && run.heartbeat?.messageType === "skfiy.page.observe"
    && run.heartbeat?.requestId === "chrome-smoke-native-host"
    && hasNativeHostBridgeDiagnostics(run.diagnostics);
}

function hasInstalledExtensionStatusDiagnostics(status, extensionId) {
  return status
    && typeof status === "object"
    && status.type === "skfiy.host_policy.response"
    && status.requestId === "chrome-smoke-extension-status"
    && status.syncStatus?.state === "synced"
    && status.syncStatus?.source === "native_host"
    && status.syncStatus?.lastError === null
    && status.syncStatus?.nativeBridgeState === "connected"
    && status.syncStatus?.nativeLaunchOrigin === `chrome-extension://${extensionId}/`
    && status.syncStatus?.nativeMessageType === "skfiy.host_policy.request"
    && (
      status.syncStatus?.hostPolicyState === "default"
      || status.syncStatus?.hostPolicyState === "configured"
      || status.syncStatus?.hostPolicyState === "invalid"
    )
    && status.diagnostics?.extension?.id === extensionId
    && status.diagnostics?.extension?.version === "0.0.1"
    && status.diagnostics?.capabilities?.nativeMessaging === true
    && status.diagnostics?.capabilities?.scripting === true
    && status.diagnostics?.nativeHost?.name === "com.sskift.skfiy"
    && status.diagnostics?.nativeHost?.bridgeState === "connected"
    && status.diagnostics?.nativeHost?.launchOrigin === `chrome-extension://${extensionId}/`
    && status.diagnostics?.nativeHost?.messageType === "skfiy.host_policy.request"
    && status.diagnostics?.nativeHost?.lastError === null
    && (
      status.diagnostics?.nativeHost?.policyState === "default"
      || status.diagnostics?.nativeHost?.policyState === "configured"
      || status.diagnostics?.nativeHost?.policyState === "invalid"
    )
    && status.diagnostics?.hostPolicy?.defaultMode === "ask"
    && Number.isInteger(status.diagnostics?.hostPolicy?.entryCount);
}

function hasNativeHostBridgeDiagnostics(diagnostics) {
  return diagnostics
    && typeof diagnostics === "object"
    && diagnostics.nativeHost?.name === "com.sskift.skfiy"
    && diagnostics.nativeHost?.heartbeatState === "recorded"
    && typeof diagnostics.nativeHost?.launchOrigin === "string"
    && diagnostics.nativeHost.launchOrigin.startsWith("chrome-extension://")
    && diagnostics.nativeHost?.messageType === "skfiy.page.observe"
    && diagnostics.nativeHost?.lastError === null
    && (
      diagnostics.nativeHost?.policyState === "default"
      || diagnostics.nativeHost?.policyState === "configured"
      || diagnostics.nativeHost?.policyState === "invalid"
    )
    && diagnostics.capabilities?.nativeMessaging === true
    && diagnostics.capabilities?.hostPolicySync === true
    && diagnostics.capabilities?.connectionHeartbeat === true
    && diagnostics.hostPolicy?.defaultMode === "ask"
    && Number.isInteger(diagnostics.hostPolicy?.entryCount);
}

function hasChromeReadinessDiagnostics(diagnostics) {
  const allowedStates = new Set(["ready", "needs_setup", "blocked"]);
  const allowedNativeHostStates = new Set([
    "installed",
    "missing",
    "mismatched",
    "cli-missing",
    "invalid"
  ]);
  const allowedHostPolicyStates = new Set(["default", "configured", "invalid"]);
  const allowedLiveConnectionStates = new Set(["connected", "stale", "unknown", "invalid"]);

  return diagnostics
    && typeof diagnostics === "object"
    && diagnostics.schemaVersion === 1
    && allowedStates.has(diagnostics.state)
    && typeof diagnostics.generatedAt === "string"
    && diagnostics.nativeHost?.hostName === "com.sskift.skfiy"
    && allowedNativeHostStates.has(diagnostics.nativeHost?.state)
    && typeof diagnostics.nativeHost?.manifestPath === "string"
    && diagnostics.nativeHost.manifestPath.includes("NativeMessagingHosts/com.sskift.skfiy.json")
    && typeof diagnostics.nativeHost?.cliShimPath === "string"
    && Array.isArray(diagnostics.nativeHost?.allowedOrigins)
    && diagnostics.nativeHost.allowedOrigins.every((origin) =>
      typeof origin === "string" && origin.startsWith("chrome-extension://")
    )
    && typeof diagnostics.nativeHost?.reason === "string"
    && diagnostics.extensionManifest?.state === "planned"
    && diagnostics.extensionManifest?.manifestVersion === 3
    && diagnostics.extensionManifest?.hostName === "com.sskift.skfiy"
    && diagnostics.extensionManifest?.nativeMessaging === true
    && Array.isArray(diagnostics.extensionManifest?.optionalHostPermissions)
    && diagnostics.extensionManifest.optionalHostPermissions.includes("http://*/*")
    && diagnostics.extensionManifest.optionalHostPermissions.includes("https://*/*")
    && diagnostics.hostPolicy?.schemaVersion === 1
    && allowedHostPolicyStates.has(diagnostics.hostPolicy?.state)
    && typeof diagnostics.hostPolicy?.path === "string"
    && diagnostics.hostPolicy.path.includes("Application Support/skfiy/chrome-host-policy.json")
    && diagnostics.hostPolicy?.defaultMode === "ask"
    && Number.isInteger(diagnostics.hostPolicy?.entryCount)
    && (
      diagnostics.approvalPolicy?.state === "ready"
      || diagnostics.approvalPolicy?.state === "no_probe"
    )
    && diagnostics.approvalPolicy?.defaultAction === "allow_current_turn_after_user_approval"
    && diagnostics.approvalPolicy?.failClosed === true
    && allowedLiveConnectionStates.has(diagnostics.liveConnection?.state)
    && ["connected", "stale", "unknown"].includes(diagnostics.liveConnection?.liveConnection)
    && typeof diagnostics.liveConnection?.path === "string"
    && diagnostics.liveConnection.path.includes("Application Support/skfiy/chrome-extension-connection.json")
    && hasChromeReadinessSetupGuide(diagnostics.setupGuide);
}

function hasChromeReadinessSetupGuide(guide) {
  const allowedStates = new Set(["ready", "needs_setup", "blocked"]);

  return guide
    && typeof guide === "object"
    && guide.schemaVersion === 1
    && guide.productPath === "dist/skfiy -> Chrome MV3 extension -> Native Messaging"
    && allowedStates.has(guide.state)
    && Array.isArray(guide.extensionIds)
    && guide.extensionIds.every((extensionId) =>
      typeof extensionId === "string" && extensionId.length === 32
    )
    && Array.isArray(guide.expectedAllowedOrigins)
    && guide.expectedAllowedOrigins.every((origin) =>
      typeof origin === "string" && origin.startsWith("chrome-extension://")
    )
    && typeof guide.nativeHostManifestPath === "string"
    && guide.nativeHostManifestPath.includes("NativeMessagingHosts/com.sskift.skfiy.json")
    && typeof guide.cliShimPath === "string"
    && typeof guide.connectionHeartbeatPath === "string"
    && guide.connectionHeartbeatPath.includes("Application Support/skfiy/chrome-extension-connection.json")
    && typeof guide.hostPolicyPath === "string"
    && guide.hostPolicyPath.includes("Application Support/skfiy/chrome-host-policy.json")
    && Array.isArray(guide.recommendedBrowsers)
    && guide.recommendedBrowsers.includes("Google Chrome for Testing")
    && guide.recommendedBrowsers.includes("Chromium")
    && isCommand(guide.installHostCommand, "install-host")
    && isCommand(guide.verifyStatusCommand, "status")
    && isCommand(guide.smokeCommand, "chrome")
    && Array.isArray(guide.nextActions)
    && guide.nextActions.some((action) =>
      action
      && typeof action === "object"
      && (action.id === "install-native-host" || action.id === "verify-live-connection")
      && typeof action.state === "string"
      && typeof action.title === "string"
    );
}

function isCommand(command, expectedTail) {
  return Array.isArray(command)
    && command[0] === "skfiy"
    && command.includes(expectedTail);
}

export function classifyChromeFallbackSmokeEvidence({
  events = [],
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  productPath
}) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (last.status === "approval_required") {
    return "needs-user-confirmation";
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || productPath !== FALLBACK_PRODUCT_PATH
  ) {
    return "failed";
  }

  if (
    last.status === "needs_confirmation"
    && typeof last.message === "string"
    && last.message.includes("screenshot fallback observation captured")
    && hasChromeFallbackScreenshotEvidence(events)
  ) {
    return "fallback-observed";
  }

  if (
    (last.status === "needs_confirmation" || last.status === "failed")
    && typeof last.message === "string"
    && (
      last.message.includes("screenshot fallback failed")
      || last.message.includes("screenshot fallback activation failed")
      || last.message.includes("screenshot fallback did not return app state")
      || last.message.includes("screenshot fallback is unavailable")
      || last.message.includes("Screen Recording permission is required")
      || last.message.includes("Accessibility permission is required")
    )
  ) {
    return "fallback-blocked";
  }

  return last.status ?? "failed";
}

export function classifyChromeCurrentPageSmokeEvidence({
  events = [],
  pageSnapshot,
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
    || !hasChromeCurrentPageSnapshotEvidence(events, pageSnapshot, expectedText)
    || hasTaskEventMessage(events, "Verified navigate:")
  ) {
    return "failed";
  }

  return "passed";
}

export function classifyChromeBringYourOwnCurrentPageEvidence({
  events = [],
  pageSnapshot,
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  chromeLaunchViaOpen = false,
  productPath,
  chromeEndpoint
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

  if (
    (last.status === "failed" || last.status === "needs_confirmation")
    && isChromeBlockedMessage(last.message)
  ) {
    return "blocked";
  }

  if (last.status !== "completed") {
    return last.status ?? "failed";
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || chromeLaunchViaOpen !== false
    || productPath !== PRODUCT_PATH
    || typeof chromeEndpoint !== "string"
    || chromeEndpoint.length === 0
    || !hasBringYourOwnChromeCurrentPageSnapshotEvidence(events, pageSnapshot)
    || hasTaskEventMessage(events, "Verified navigate:")
  ) {
    return "failed";
  }

  return "passed";
}

export function classifyChromeFallbackSwitchEvidence({
  events = [],
  runnerHasTmux = false,
  appLaunchViaOpen = false,
  productPath,
  configuredEndpoint
}) {
  const last = events.at(-1);

  if (!last) {
    return "no-events";
  }

  if (
    runnerHasTmux
    || appLaunchViaOpen !== true
    || productPath !== FALLBACK_SWITCH_PRODUCT_PATH
    || typeof configuredEndpoint !== "string"
    || configuredEndpoint.length === 0
    || !hasChromeFallbackSwitchEvent(events)
  ) {
    return "failed";
  }

  if (
    last.status === "needs_confirmation"
    && typeof last.message === "string"
    && last.message.includes("screenshot fallback observation captured")
    && hasChromeFallbackScreenshotEvidence(events)
  ) {
    return "fallback-switched-observed";
  }

  if (
    (last.status === "needs_confirmation" || last.status === "failed")
    && typeof last.message === "string"
    && (
      last.message.includes("screenshot fallback failed")
      || last.message.includes("screenshot fallback activation failed")
      || last.message.includes("screenshot fallback did not return app state")
      || last.message.includes("screenshot fallback is unavailable")
      || last.message.includes("Screen Recording permission is required")
      || last.message.includes("Accessibility permission is required")
    )
  ) {
    return "fallback-switched-blocked";
  }

  return last.status ?? "failed";
}

function hasChromeFallbackScreenshotEvidence(events) {
  return Array.isArray(events)
    && events.some((event) =>
      event?.status === "observing"
        && event?.replayRecord?.stage === "before"
        && event.replayRecord.bundleId === "com.google.Chrome"
        && typeof event.replayRecord.screenshotPath === "string"
        && event.replayRecord.screenshotPath.length > 0
    );
}

function hasChromeFallbackSwitchEvent(events) {
  return Array.isArray(events)
    && events.some((event) =>
      event?.status === "executing"
        && typeof event.message === "string"
        && /Switching Chrome control from cdp to screenshot_fallback/i.test(event.message)
    );
}

function hasChromeCurrentPageSnapshotEvidence(events, pageSnapshot, expectedText) {
  return pageSnapshot
    && typeof pageSnapshot === "object"
    && typeof pageSnapshot.url === "string"
    && pageSnapshot.url.length > 0
    && typeof pageSnapshot.title === "string"
    && pageSnapshot.title.length > 0
    && typeof pageSnapshot.text === "string"
    && pageSnapshot.text.includes(expectedText)
    && hasTaskEventMessage(events, "Verified current_page_snapshot:")
    && hasTaskEventMessage(events, "Chrome current page extracted:");
}

function hasBringYourOwnChromeCurrentPageSnapshotEvidence(events, pageSnapshot) {
  return pageSnapshot
    && typeof pageSnapshot === "object"
    && typeof pageSnapshot.url === "string"
    && pageSnapshot.url.length > 0
    && typeof pageSnapshot.title === "string"
    && pageSnapshot.title.length > 0
    && typeof pageSnapshot.text === "string"
    && pageSnapshot.text.trim().length > 0
    && hasTaskEventMessage(events, "Verified current_page_snapshot:")
    && hasTaskEventMessage(events, "Chrome current page extracted:");
}

function hasTaskEventMessage(events, prefix) {
  return Array.isArray(events)
    && events.some((event) =>
      typeof event?.message === "string"
        && event.message.startsWith(prefix)
    );
}

function isChromeSensitivePauseMessage(message) {
  return typeof message === "string"
    && (
      message.includes("Verification failed (sensitive): Sensitive UI text is visible.")
      || message.includes("Verification failed (sensitive): Sensitive form input is not allowed for Chrome Computer Use.")
    );
}

function isChromeBlockedMessage(message) {
  if (typeof message !== "string") {
    return false;
  }

  const normalized = message.toLowerCase();

  return normalized.includes("chrome")
    && (
      normalized.includes("not configured")
      || normalized.includes("endpoint")
      || normalized.includes("unavailable")
      || (
        normalized.includes("screenshot fallback")
        && (
          normalized.includes("screen recording permission")
          || normalized.includes("accessibility permission")
        )
      )
    );
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function normalizeEndpoint(value, name) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return parsed.href.replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an http(s) URL.`);
  }
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}
