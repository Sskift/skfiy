import path from "node:path";

export const SMOKE_V2_SCHEMA_VERSION = 2;
export const SMOKE_V2_KIND = "skfiy-smoke-v2";
export const DEFAULT_PROFILE = "silent";
export const DEFAULT_ARTIFACTS_DIR = ".skfiy-smoke/v2";
export const DEFAULT_APP_PATH = "dist/skfiy.app";
export const DEFAULT_CLI_PATH = "dist/skfiy";
export const DEFAULT_EXTENSION_CHROME_APP = "Chromium";
export const DEFAULT_MONEY_RUN_SESSION = "money-run";
export const DEFAULT_AUTOMATION_MONITOR_SESSION = "money-run-goal";
export const DEFAULT_DASHBOARD_TIMEOUT_MS = 30_000;
export const DEFAULT_FIELD_TIMEOUT_MS = 120_000;
export const DEFAULT_GHOSTTY_TIMEOUT_MS = 30_000;

const PROFILE_SCENARIOS = {
  silent: ["cli-basic", "dashboard-product"],
  release: ["cli-basic", "ui-product", "dashboard-product"],
  field: [
    "desktop-session",
    "ghostty-matrix",
    "finder-selected-folder",
    "finder-current-folder",
    "chrome-browser-context",
    "money-run"
  ],
  all: [
    "cli-basic",
    "ui-product",
    "dashboard-product",
    "desktop-session",
    "ghostty-matrix",
    "finder-selected-folder",
    "finder-current-folder",
    "chrome-browser-context",
    "money-run"
  ]
};

const SCENARIOS = [
  {
    id: "cli-basic",
    layer: "contract",
    description: "Built CLI and provider prompt contracts.",
    artifactName: "cli-v2-basic.json",
    script: "smoke:cli:basic",
    args: [],
    focusMode: "none",
    acceptedResults: ["passed"]
  },
  {
    id: "ui-product",
    layer: "packaged",
    description: "Packaged app renderer, pet drag, assistant reply, and stop behavior.",
    artifactName: "ui-v2-product.json",
    script: "smoke:ui",
    args: ({ appPath }) => ["--app", appPath],
    focusMode: "frontmost-app",
    acceptedResults: ["passed", "no-onboarding"]
  },
  {
    id: "dashboard-product",
    layer: "packaged",
    description: "Dashboard operator workspace, APIs, memory, and evidence graph.",
    artifactName: "dashboard-v2-product.json",
    script: "smoke:dashboard",
    args: ({ cliPath, dashboardTimeoutMs }) => [
      "--cli",
      cliPath,
      "--timeout-ms",
      String(dashboardTimeoutMs)
    ],
    focusMode: "hidden-window",
    acceptedResults: ["passed"]
  },
  {
    id: "desktop-session",
    layer: "field",
    description: "macOS desktop session and TCC preflight.",
    artifactName: "desktop-session-v2.json",
    script: "smoke:desktop-session",
    args: ({ appPath }) => ["--app", appPath],
    focusMode: "none",
    acceptedResults: ["passed"]
  },
  {
    id: "ghostty-matrix",
    layer: "field",
    description: "Ghostty route matrix with approval and denial behavior.",
    artifactName: "ghostty-v2-matrix.json",
    script: "smoke:ghostty",
    args: ({ appPath, ghosttyTimeoutMs }) => [
      "--app",
      appPath,
      "--matrix",
      "--timeout-ms",
      String(ghosttyTimeoutMs)
    ],
    focusMode: "frontmost-app",
    acceptedResults: ["passed", "blocked"]
  },
  {
    id: "finder-selected-folder",
    layer: "field",
    description: "Finder selected-folder organization with plan confirmation.",
    artifactName: "finder-v2-selected-folder.json",
    script: "smoke:finder",
    args: ({ appPath, fieldTimeoutMs }) => [
      "--app",
      appPath,
      "--selected-folder",
      "--timeout-ms",
      String(fieldTimeoutMs)
    ],
    focusMode: "frontmost-app",
    acceptedResults: ["passed", "blocked", "needs-user-confirmation"]
  },
  {
    id: "finder-current-folder",
    layer: "field",
    description: "Finder current-folder organization with target isolation.",
    artifactName: "finder-v2-current-folder.json",
    script: "smoke:finder",
    args: ({ appPath, fieldTimeoutMs }) => [
      "--app",
      appPath,
      "--current-folder",
      "--timeout-ms",
      String(fieldTimeoutMs)
    ],
    focusMode: "frontmost-app",
    acceptedResults: ["passed", "blocked", "needs-user-confirmation"]
  },
  {
    id: "chrome-browser-context",
    layer: "field",
    description: "Chromium/Chrome Browser Context and pageControl bridge.",
    artifactName: "chrome-v2-browser-context.json",
    script: "smoke:chrome",
    args: ({ appPath, extensionId, extensionChromeApp, ghosttyTimeoutMs }) => [
      "--app",
      appPath,
      "--extension-chrome-app",
      extensionChromeApp,
      ...(extensionId ? ["--extension-id", extensionId] : []),
      "--timeout-ms",
      String(ghosttyTimeoutMs)
    ],
    focusMode: "frontmost-app",
    acceptedResults: ["passed", "blocked"]
  },
  {
    id: "money-run",
    layer: "field",
    description: "Read-only money-run tmux supervision signal.",
    artifactName: "money-run-v2.json",
    script: "smoke:money-run",
    args: ({ appPath, moneyRunSession, ghosttyTimeoutMs }) => [
      "--app",
      appPath,
      "--session",
      moneyRunSession,
      "--timeout-ms",
      String(ghosttyTimeoutMs)
    ],
    focusMode: "frontmost-app",
    acceptedResults: ["passed", "needs_attention"]
  }
];

export function createDefaultSmokeV2Options(rootDir = process.cwd()) {
  return {
    profile: DEFAULT_PROFILE,
    appPath: path.join(rootDir, DEFAULT_APP_PATH),
    cliPath: path.join(rootDir, DEFAULT_CLI_PATH),
    artifactsDir: path.join(rootDir, DEFAULT_ARTIFACTS_DIR),
    outputPath: undefined,
    extensionId: undefined,
    extensionChromeApp: DEFAULT_EXTENSION_CHROME_APP,
    moneyRunSession: DEFAULT_MONEY_RUN_SESSION,
    automationMonitorSession: DEFAULT_AUTOMATION_MONITOR_SESSION,
    dashboardTimeoutMs: DEFAULT_DASHBOARD_TIMEOUT_MS,
    fieldTimeoutMs: DEFAULT_FIELD_TIMEOUT_MS,
    ghosttyTimeoutMs: DEFAULT_GHOSTTY_TIMEOUT_MS,
    requirePassed: false,
    dryRun: false,
    help: false
  };
}

export function parseSmokeV2Args(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--profile":
        options.profile = readProfile(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--cli":
        options.cliPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--artifacts-dir":
        options.artifactsDir = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--extension-id":
        options.extensionId = readValue(argv, index, arg);
        index += 1;
        break;
      case "--extension-chrome-app":
        options.extensionChromeApp = readValue(argv, index, arg);
        index += 1;
        break;
      case "--session":
        options.moneyRunSession = readValue(argv, index, arg);
        index += 1;
        break;
      case "--timeout-ms":
        options.dashboardTimeoutMs = readPositiveInteger(readValue(argv, index, arg), arg);
        options.fieldTimeoutMs = readPositiveInteger(readValue(argv, index, arg), arg);
        options.ghosttyTimeoutMs = options.fieldTimeoutMs;
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--dry-run":
        options.dryRun = true;
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

export function createSmokeV2Plan(options = {}) {
  const normalized = {
    ...createDefaultSmokeV2Options(process.cwd()),
    ...options,
    profile: options.profile ?? DEFAULT_PROFILE,
    artifactsDir: path.resolve(String(options.artifactsDir ?? DEFAULT_ARTIFACTS_DIR)),
    appPath: String(options.appPath ?? DEFAULT_APP_PATH),
    cliPath: String(options.cliPath ?? DEFAULT_CLI_PATH),
    extensionChromeApp: String(options.extensionChromeApp ?? DEFAULT_EXTENSION_CHROME_APP),
    moneyRunSession: String(options.moneyRunSession ?? DEFAULT_MONEY_RUN_SESSION),
    dashboardTimeoutMs: Number(options.dashboardTimeoutMs ?? DEFAULT_DASHBOARD_TIMEOUT_MS),
    fieldTimeoutMs: Number(options.fieldTimeoutMs ?? DEFAULT_FIELD_TIMEOUT_MS),
    ghosttyTimeoutMs: Number(options.ghosttyTimeoutMs ?? DEFAULT_GHOSTTY_TIMEOUT_MS)
  };
  const scenarioIds = PROFILE_SCENARIOS[normalized.profile];
  if (!scenarioIds) {
    throw new Error(`Unknown smoke v2 profile: ${normalized.profile}`);
  }

  return scenarioIds.map((id) => {
    const definition = SCENARIOS.find((scenario) => scenario.id === id);
    if (!definition) {
      throw new Error(`Unknown smoke v2 scenario: ${id}`);
    }

    const artifactPath = path.join(normalized.artifactsDir, definition.artifactName);
    const extraArgs = typeof definition.args === "function"
      ? definition.args(normalized)
      : definition.args;
    const command = [
      "npm",
      "run",
      definition.script,
      "--",
      ...extraArgs,
      "--output",
      artifactPath
    ];

    return {
      id: definition.id,
      layer: definition.layer,
      description: definition.description,
      command,
      artifactPath,
      focusMode: definition.focusMode,
      stealsFocus: definition.focusMode === "frontmost-app",
      acceptedResults: [...definition.acceptedResults]
    };
  });
}

export function classifySmokeV2Scenario({
  id,
  layer,
  description,
  command,
  artifactPath,
  focusMode,
  stealsFocus,
  acceptedResults = ["passed"],
  rawArtifact,
  exitCode = 0,
  durationMs,
  error
}) {
  const rawResult = readRawResult(rawArtifact, exitCode, error);
  const result = rawResult;
  const blockerCode = readBlockerCode(rawArtifact, result);
  const accepted = acceptedResults.includes(result);

  return {
    id,
    layer,
    description,
    command,
    artifactPath,
    ...(focusMode ? { focusMode } : {}),
    ...(typeof stealsFocus === "boolean" ? { stealsFocus } : {}),
    result,
    accepted,
    exitCode,
    ...(Number.isFinite(durationMs) ? { durationMs } : {}),
    ...(blockerCode ? { blockerCode } : {}),
    ...(readProductPath(rawArtifact) ? { productPath: readProductPath(rawArtifact) } : {}),
    ...(readMutatesSession(rawArtifact) !== undefined ? { mutatesSession: readMutatesSession(rawArtifact) } : {}),
    ...(error ? { error: String(error) } : {})
  };
}

export function classifySmokeV2Evidence(scenarios, { requirePassed = false } = {}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return "no-scenarios";
  }

  if (scenarios.some((scenario) => scenario.result === "failed" || scenario.result === "error")) {
    return "failed";
  }

  if (requirePassed && scenarios.some((scenario) => scenario.result !== "passed" && scenario.result !== "no-onboarding")) {
    return "failed";
  }

  if (scenarios.some((scenario) => scenario.result === "blocked")) {
    return "blocked";
  }

  if (scenarios.some((scenario) => scenario.result === "needs_attention")) {
    return "needs_attention";
  }

  if (scenarios.some((scenario) => scenario.result === "needs-user-confirmation")) {
    return "needs-user-confirmation";
  }

  if (scenarios.every((scenario) => scenario.result === "passed" || scenario.result === "no-onboarding")) {
    return "passed";
  }

  return "failed";
}

export function createSmokeV2Evidence({
  profile,
  startedAt,
  finishedAt,
  scenarios,
  requirePassed = false,
  dryRun = false
}) {
  const result = dryRun
    ? "planned"
    : classifySmokeV2Evidence(scenarios, { requirePassed });
  const blockers = scenarios
    .filter((scenario) => scenario.blockerCode)
    .map((scenario) => ({
      scenarioId: scenario.id,
      code: scenario.blockerCode,
      result: scenario.result,
      ...(scenario.mutatesSession !== undefined ? { mutatesSession: scenario.mutatesSession } : {})
    }));

  return {
    schemaVersion: SMOKE_V2_SCHEMA_VERSION,
    kind: SMOKE_V2_KIND,
    profile,
    startedAt,
    finishedAt,
    result,
    requirePassed,
    dryRun,
    scenarioCount: Array.isArray(scenarios) ? scenarios.length : 0,
    scenarios,
    blockers
  };
}

export function createSmokeV2HelpText(defaults) {
  return `Usage: npm run smoke:v2 -- [options]

Runs a layered skfiy smoke suite and writes a schema-versioned aggregate artifact.

Profiles:
  silent    No frontmost app control: CLI contracts and hidden Dashboard checks.
  release   Fast release gate: CLI contracts, UI smoke, Dashboard smoke.
  field     Live macOS/Chrome/Finder/Ghostty/money-run evidence.
  all       Release plus field.

Options:
  --profile <name>              silent, release, field, or all. Default: ${defaults.profile}
  --app <path>                  Packaged app path. Default: ${defaults.appPath}
  --cli <path>                  Packaged CLI path. Default: ${defaults.cliPath}
  --artifacts-dir <path>        Per-scenario artifact directory. Default: ${defaults.artifactsDir}
  --output <path>               Aggregate smoke v2 artifact path.
  --extension-id <id>           Installed Chrome extension id for field Chrome smoke.
  --extension-chrome-app <app>  Chrome app name for field Chrome smoke. Default: ${defaults.extensionChromeApp}
  --session <name>              money-run tmux session. Default: ${defaults.moneyRunSession}
  --timeout-ms <ms>             Dashboard and field smoke timeout.
  --require-passed              Exit non-zero unless aggregate result is passed.
  --dry-run                     Print/write the planned scenarios without executing them.
  -h, --help                    Show this help.
`;
}

function readRawResult(rawArtifact, exitCode, error) {
  if (error) {
    return "error";
  }

  if (rawArtifact && typeof rawArtifact.result === "string") {
    if (rawArtifact.result === "needs_confirmation") {
      return "needs-user-confirmation";
    }

    return rawArtifact.result;
  }

  return exitCode === 0 ? "passed" : "failed";
}

function readBlockerCode(rawArtifact, result) {
  const blocker = readStatusBlocker(rawArtifact);
  if (blocker) {
    return blocker;
  }

  if (rawArtifact?.desktopPreflight?.result === "blocked") {
    return "desktop-session-blocked";
  }

  if (result === "needs-user-confirmation") {
    return "needs-user-confirmation";
  }

  if (result === "needs_attention" || rawArtifact?.tmuxSupervisionReport?.status === "needs_attention") {
    return "money-run-needs-attention";
  }

  if (result === "denied") {
    return "ghostty-denied";
  }

  if (typeof rawArtifact?.error === "string" && rawArtifact.error.includes("Finder approved plan no longer matches")) {
    return "finder-target-mismatch";
  }

  if (rawArtifact?.finderSemanticObservation?.result === "failed") {
    return "finder-target-mismatch";
  }

  if (result === "blocked") {
    return "blocked";
  }

  return undefined;
}

function readStatusBlocker(rawArtifact) {
  const readinessBlocker = rawArtifact?.runtimeStatus?.readiness?.blockers?.[0]?.code
    ?? rawArtifact?.readiness?.blockers?.[0]?.code;
  if (typeof readinessBlocker === "string") {
    return readinessBlocker;
  }

  const pageControlState = rawArtifact?.pageControl?.state
    ?? rawArtifact?.extensionStatus?.pageControl?.state
    ?? rawArtifact?.installedExtensionRun?.pageControlHealth?.pageControl?.state
    ?? rawArtifact?.installedExtensionRun?.extensionStatus?.pageControl?.state;
  if (pageControlState === "blocked_by_host_policy") {
    return "browser-context-host-policy-blocked";
  }
  if (pageControlState === "blocked_by_chrome_host_permission") {
    return "chrome-host-permission-missing";
  }

  return undefined;
}

function readProductPath(rawArtifact) {
  return typeof rawArtifact?.productPath === "string" ? rawArtifact.productPath : undefined;
}

function readMutatesSession(rawArtifact) {
  const direct = rawArtifact?.mutatesSession;
  if (typeof direct === "boolean") {
    return direct;
  }

  const reportValue = rawArtifact?.tmuxSupervisionReport?.recommendation?.mutatesSession;
  return typeof reportValue === "boolean" ? reportValue : undefined;
}

function readProfile(value, name) {
  if (!Object.hasOwn(PROFILE_SCENARIOS, value)) {
    throw new Error(`${name} must be one of ${Object.keys(PROFILE_SCENARIOS).join(", ")}.`);
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

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}
