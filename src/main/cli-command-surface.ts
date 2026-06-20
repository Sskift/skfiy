import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  startDashboardServer,
  type DashboardServer
} from "./dashboard-server.js";
import {
  installChromeNativeHost,
  readChromeNativeHostStatus,
  uninstallChromeNativeHost,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import type {
  PermissionSummary
} from "./computer-use/types.js";

export const SMOKE_TARGETS = [
  "ui",
  "desktop-session",
  "ghostty",
  "chrome",
  "dashboard",
  "finder",
  "voice",
  "money-run"
] as const;

export type SmokeTarget = typeof SMOKE_TARGETS[number];
export type ChromeSubcommand = "status" | "install-host" | "uninstall-host";

const SMOKE_SCRIPT_FILES: Record<SmokeTarget, string> = {
  ui: "scripts/smoke-ui-product.mjs",
  "desktop-session": "scripts/smoke-desktop-session.mjs",
  ghostty: "scripts/smoke-ghostty-product.mjs",
  chrome: "scripts/smoke-chrome-product.mjs",
  dashboard: "scripts/smoke-dashboard-product.mjs",
  finder: "scripts/smoke-finder-product.mjs",
  voice: "scripts/smoke-voice-product.mjs",
  "money-run": "scripts/smoke-money-run-supervision.mjs"
};

export interface CliCommandDefinition {
  path: string;
  summary: string;
  jsonOutput: boolean;
  plannedMutation: boolean;
  executesSystemMutation: boolean;
  outputShape: string;
}

export interface CliCommandSurface {
  schemaVersion: 1;
  commands: CliCommandDefinition[];
}

export interface NormalizeCliCommandOptions {
  rootDir?: string;
}

export type CliCommandInvocation =
  | {
      kind: "status";
      path: "status";
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        dashboardUrl?: string;
      };
    }
  | {
      kind: "doctor";
      path: "doctor";
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        dashboardUrl?: string;
      };
    }
  | {
      kind: "dashboard";
      path: "dashboard";
      json: boolean;
      options: {
        noOpen: boolean;
        port: number;
      };
    }
  | {
      kind: "chrome";
      path: `chrome ${ChromeSubcommand}`;
      subcommand: ChromeSubcommand;
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
      };
    }
  | {
      kind: "smoke";
      path: `smoke ${SmokeTarget}`;
      target: SmokeTarget;
      json: boolean;
      outputPath: string;
      options: {
        requirePassed: boolean;
        scriptPath: string;
        scriptArgs: string[];
      };
    }
  | {
      kind: "release-check";
      path: "release check";
      json: boolean;
      jsonOutputPath: string;
      options: Record<string, never>;
    }
  | {
      kind: "alpha-artifact";
      path: "alpha artifact";
      json: boolean;
      options: Record<string, never>;
    };

export type NormalizeCliCommandResult =
  | {
      ok: true;
      invocation: CliCommandInvocation;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface CreateCliOutputOptions {
  generatedAt?: string;
}

export interface SkfiyCliIo {
  write: (chunk: string) => unknown;
}

export interface SmokeRunnerInput {
  target: SmokeTarget;
  cwd: string;
  scriptPath: string;
  args: string[];
}

export interface SmokeRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface StatusReaderInput {
  rootDir: string;
  homeDir: string;
  appPath: string;
  helperPath: string;
  cliShimPath: string;
  extensionIds: string[];
  dashboardUrl?: string;
}

export type StatusReader = (input: StatusReaderInput) => Promise<Record<string, unknown>>;

export interface SignatureReaderInput {
  appPath: string;
}

export interface SignatureStatus {
  state: "valid" | "invalid" | "unknown";
  reason?: string;
}

export type SignatureReader = (input: SignatureReaderInput) => Promise<SignatureStatus>;

export interface RunSkfiyCliInput {
  argv: string[];
  rootDir?: string;
  homeDir?: string;
  generatedAt?: string;
  chromeNativeHostIo?: ChromeNativeHostIo;
  statusReader?: StatusReader;
  signatureReader?: SignatureReader;
  smokeRunner?: (input: SmokeRunnerInput) => Promise<SmokeRunnerResult>;
  dashboardServerStarter?: (input: { port: number }) => Promise<DashboardServer>;
  dashboardOpener?: (url: string) => Promise<void>;
  keepDashboardAlive?: boolean;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}

const SMOKE_COMMANDS: CliCommandDefinition[] = SMOKE_TARGETS.map((target) => ({
  path: `smoke ${target}`,
  summary: `Run the ${target} smoke target and output artifact.`,
  jsonOutput: true,
  plannedMutation: true,
  executesSystemMutation: true,
  outputShape: "smoke"
}));

const COMMANDS: CliCommandDefinition[] = [
  {
    path: "status",
    summary: "Report app, helper, permissions, desktop-session, extension, and dashboard status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "status"
  },
  {
    path: "doctor",
    summary: "Return actionable permission and packaging diagnostics.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "doctor"
  },
  {
    path: "dashboard",
    summary: "Describe the local loopback dashboard command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard"
  },
  {
    path: "chrome status",
    summary: "Report Chrome extension and native host status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "chrome-status"
  },
  {
    path: "chrome install-host",
    summary: "Install the Chrome Native Messaging host for the current skfiy CLI.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-plan"
  },
  {
    path: "chrome uninstall-host",
    summary: "Uninstall the Chrome Native Messaging host manifest.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-plan"
  },
  ...SMOKE_COMMANDS,
  {
    path: "release check",
    summary: "Plan release gate checks and a JSON output artifact.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "release-check"
  },
  {
    path: "alpha artifact",
    summary: "Plan alpha artifact creation without mutating the system.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: false,
    outputShape: "alpha-artifact"
  }
];

export function createCliCommandSurface(): CliCommandSurface {
  return {
    schemaVersion: 1,
    commands: COMMANDS.map((command) => ({ ...command }))
  };
}

export function normalizeCliCommand(
  argv: string[],
  options: NormalizeCliCommandOptions = {}
): NormalizeCliCommandResult {
  const rootDir = options.rootDir ?? process.cwd();
  const command = argv[0];

  if (command === "status") {
    return ok({
      kind: "status",
      path: "status",
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        dashboardUrl: readOptionValue(argv, "--dashboard-url")
      }
    });
  }

  if (command === "doctor") {
    return ok({
      kind: "doctor",
      path: "doctor",
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        dashboardUrl: readOptionValue(argv, "--dashboard-url")
      }
    });
  }

  if (command === "dashboard") {
    const port = readNumberOption(argv, "--port", 0);

    return ok({
      kind: "dashboard",
      path: "dashboard",
      json: argv.includes("--json"),
      options: {
        noOpen: argv.includes("--no-open"),
        port
      }
    });
  }

  if (command === "chrome") {
    const subcommand = argv[1];

    if (!isChromeSubcommand(subcommand)) {
      return error(
        "unknown-chrome-subcommand",
        `Unknown chrome subcommand: ${subcommand ?? ""}`
      );
    }

    return ok({
      kind: "chrome",
      path: `chrome ${subcommand}`,
      subcommand,
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy"))
      }
    });
  }

  if (command === "smoke") {
    const target = argv[1];

    if (!isSmokeTarget(target)) {
      return error("unknown-smoke-target", `Unknown smoke target: ${target ?? ""}`);
    }
    const smokeArgv = argv.slice(2);

    return ok({
      kind: "smoke",
      path: `smoke ${target}`,
      target,
      json: argv.includes("--json"),
      outputPath: resolveOptionPath(smokeArgv, "--output", rootDir, ""),
      options: {
        requirePassed: smokeArgv.includes("--require-passed"),
        scriptPath: createSmokeScriptPath(target, rootDir),
        scriptArgs: createSmokeScriptArgs(smokeArgv, rootDir)
      }
    });
  }

  if (command === "release" && argv[1] === "check") {
    return ok({
      kind: "release-check",
      path: "release check",
      json: argv.includes("--json"),
      jsonOutputPath: resolveOptionPath(argv, "--json-output", rootDir, ""),
      options: {}
    });
  }

  if (command === "alpha" && argv[1] === "artifact") {
    return ok({
      kind: "alpha-artifact",
      path: "alpha artifact",
      json: argv.includes("--json"),
      options: {}
    });
  }

  return error("unknown-command", `Unknown command: ${command ?? ""}`);
}

export function createCliOutput(
  invocation: CliCommandInvocation,
  options: CreateCliOutputOptions = {}
): Record<string, unknown> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  if (invocation.kind === "status") {
    return {
      schemaVersion: 1,
      command: "status",
      generatedAt,
      app: { state: "unknown" },
      helper: { state: "unknown" },
      permissions: {
        screenRecording: "unknown",
        accessibility: "unknown",
        microphone: "unknown",
        speechRecognition: "unknown",
        finderAutomation: "unknown"
      },
      desktopSession: { state: "unknown" },
      extension: { state: "unknown" },
      nativeHost: {
        state: "unknown",
        cliShimPath: invocation.options.cliShimPath,
        extensionIds: invocation.options.extensionIds
      },
      dashboard: invocation.options.dashboardUrl
        ? { state: "unknown", url: invocation.options.dashboardUrl }
        : { state: "not-running" }
    };
  }

  if (invocation.kind === "doctor") {
    return {
      schemaVersion: 1,
      command: "doctor",
      generatedAt,
      result: "not-run",
      diagnostics: [],
      nextActions: [],
      statusProbe: {
        extensionIds: invocation.options.extensionIds,
        dashboardUrl: invocation.options.dashboardUrl
      }
    };
  }

  if (invocation.kind === "dashboard") {
    const descriptor = createDashboardDescriptor({ port: invocation.options.port });

    return {
      schemaVersion: 1,
      command: "dashboard",
      generatedAt,
      bind: descriptor.bind,
      url: descriptor.url,
      shouldOpen: !invocation.options.noOpen,
      tokenPrinted: false,
      result: "not-started",
      descriptor
    };
  }

  if (invocation.kind === "chrome") {
    if (invocation.subcommand === "status") {
      return {
        schemaVersion: 1,
        command: "chrome status",
        generatedAt,
        executesSystemMutation: false,
        extension: { state: "unknown" },
        nativeHost: {
          state: "unknown",
          cliShimPath: invocation.options.cliShimPath,
          extensionIds: invocation.options.extensionIds
        }
      };
    }

    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      plannedMutation: true,
      executesSystemMutation: true,
      result: "not-run",
      nativeHostManifest: {
        state: "not-mutated",
        cliShimPath: invocation.options.cliShimPath,
        extensionIds: invocation.options.extensionIds
      }
    };
  }

  if (invocation.kind === "smoke") {
    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      target: invocation.target,
      outputPath: invocation.outputPath,
      scriptPath: invocation.options.scriptPath,
      scriptArgs: invocation.options.scriptArgs,
      result: "not-run",
      executesSystemMutation: true
    };
  }

  if (invocation.kind === "release-check") {
    return {
      schemaVersion: 1,
      command: "release check",
      generatedAt,
      jsonOutputPath: invocation.jsonOutputPath,
      result: "not-run",
      executesSystemMutation: false
    };
  }

  return {
    schemaVersion: 1,
    command: "alpha artifact",
    generatedAt,
    plannedMutation: true,
    executesSystemMutation: false,
    result: "not-run"
  };
}

export async function runSkfiyCli({
  argv,
  rootDir,
  homeDir,
  generatedAt,
  chromeNativeHostIo,
  statusReader = readCliStatus,
  signatureReader = readCodeSignatureStatus,
  smokeRunner = runSmokeScript,
  dashboardServerStarter = startDashboardServer,
  dashboardOpener = openDashboardUrl,
  keepDashboardAlive = true,
  stdout,
  stderr
}: RunSkfiyCliInput): Promise<number> {
  const normalizedRootDir = rootDir ?? process.cwd();
  const result = normalizeCliCommand(argv, { rootDir: normalizedRootDir });

  if (!result.ok) {
    stderr.write(`${result.error.message}\n`);
    return 2;
  }

  if (result.invocation.kind === "status") {
    return runStatusCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      homeDir: homeDir ?? process.env.HOME ?? "",
      statusReader,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "doctor") {
    return runDoctorCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      homeDir: homeDir ?? process.env.HOME ?? "",
      statusReader,
      signatureReader,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "chrome") {
    return runChromeNativeHostCli({
      invocation: result.invocation,
      generatedAt,
      homeDir: homeDir ?? process.env.HOME ?? "",
      io: chromeNativeHostIo,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "smoke") {
    return runSmokeCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      smokeRunner,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "dashboard") {
    const dashboard = await dashboardServerStarter({
      port: result.invocation.options.port
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: generatedAt ?? new Date().toISOString(),
      bind: dashboard.bind,
      url: dashboard.url,
      shouldOpen: !result.invocation.options.noOpen,
      tokenPrinted: false,
      result: "running"
    }, null, 2)}\n`);

    if (!result.invocation.options.noOpen) {
      await dashboardOpener(dashboard.url);
    }

    if (!keepDashboardAlive) {
      await dashboard.close();
      return 0;
    }

    await waitForDashboardShutdown(dashboard);
    return 0;
  }

  stdout.write(`${JSON.stringify(createCliOutput(result.invocation, { generatedAt }), null, 2)}\n`);
  return 0;
}

async function runStatusCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  statusReader,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "status" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  statusReader: StatusReader;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  const input = createStatusReaderInput({
    rootDir,
    homeDir,
    invocation
  });

  try {
    const status = await statusReader(input);

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "status",
      generatedAt: generatedAt ?? new Date().toISOString(),
      ...status
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify({
      ...createCliOutput(invocation, { generatedAt }),
      result: "error",
      error: message
    }, null, 2)}\n`);
    return 1;
  }
}

async function runDoctorCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  statusReader,
  signatureReader,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "doctor" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  statusReader: StatusReader;
  signatureReader: SignatureReader;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  const input = createStatusReaderInput({
    rootDir,
    homeDir,
    invocation
  });

  try {
    const [status, signature] = await Promise.all([
      statusReader(input),
      signatureReader({ appPath: input.appPath })
    ]);
    const doctor = createDoctorOutput({
      status,
      signature,
      statusInput: input
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "doctor",
      generatedAt: generatedAt ?? new Date().toISOString(),
      ...doctor
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = readErrorMessage(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify({
      ...createCliOutput(invocation, { generatedAt }),
      result: "error",
      error: message
    }, null, 2)}\n`);
    return 1;
  }
}

function createStatusReaderInput({
  rootDir,
  homeDir,
  invocation
}: {
  rootDir: string;
  homeDir: string;
  invocation: Extract<CliCommandInvocation, { kind: "status" | "doctor" }>;
}): StatusReaderInput {
  const appPath = path.join(rootDir, "dist", "skfiy.app");

  return {
    rootDir,
    homeDir,
    appPath,
    helperPath: path.join(appPath, "Contents", "MacOS", "skfiy-helper"),
    cliShimPath: invocation.options.cliShimPath,
    extensionIds: invocation.options.extensionIds,
    dashboardUrl: invocation.options.dashboardUrl
  };
}

function createDoctorOutput({
  status,
  signature,
  statusInput
}: {
  status: Record<string, unknown>;
  signature: SignatureStatus;
  statusInput: StatusReaderInput;
}): Record<string, unknown> {
  const diagnostics: Array<Record<string, unknown>> = [];
  const nextActions: string[] = [];
  const addDiagnostic = ({
    code,
    severity,
    message,
    nextAction,
    details
  }: {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    nextAction?: string;
    details?: Record<string, unknown>;
  }) => {
    diagnostics.push({
      code,
      severity,
      message,
      ...(details ? { details } : {}),
      ...(nextAction ? { nextAction } : {})
    });

    if (nextAction && !nextActions.includes(nextAction)) {
      nextActions.push(nextAction);
    }
  };
  const app = readRecord(status.app);
  const helper = readRecord(status.helper);
  const permissions = readRecord(status.permissions);
  const desktopSession = readRecord(status.desktopSession);
  const nativeHost = readRecord(status.nativeHost);
  const dashboard = readRecord(status.dashboard);

  if (app?.state !== "installed") {
    addDiagnostic({
      code: "app-missing",
      severity: "error",
      message: `skfiy.app is missing at ${statusInput.appPath}.`,
      nextAction: "Run `npm run build` to create dist/skfiy.app and the CLI shim."
    });
  }

  if (helper?.state !== "installed" || helper?.path !== statusInput.helperPath) {
    addDiagnostic({
      code: "helper-location",
      severity: "error",
      message: "skfiy-helper must be embedded beside the app executable for product-path TCC attribution.",
      nextAction: "Run `npm run build` so skfiy-helper is embedded at dist/skfiy.app/Contents/MacOS/skfiy-helper.",
      details: {
        expectedHelperPath: statusInput.helperPath,
        actualHelperPath: helper?.path
      }
    });
  }

  if (signature.state !== "valid") {
    addDiagnostic({
      code: "code-signature",
      severity: "warning",
      message: signature.reason ?? "skfiy.app code signature could not be verified.",
      nextAction: "Run `npm run release:mac:check` to inspect signing/notarization readiness."
    });
  }

  if (permissions?.screenRecording !== "granted") {
    addDiagnostic({
      code: "screen-recording-permission",
      severity: "error",
      message: "Screen Recording is required for Computer Use observation.",
      nextAction: "Open System Settings > Privacy & Security > Screen Recording and grant skfiy."
    });
  }

  if (permissions?.accessibility !== "granted") {
    addDiagnostic({
      code: "accessibility-permission",
      severity: "error",
      message: "Accessibility is required for Computer Use clicks, typing, scrolling, and drag actions.",
      nextAction: "Open System Settings > Privacy & Security > Accessibility and grant skfiy."
    });
  }

  if (permissions?.microphone === "denied") {
    addDiagnostic({
      code: "microphone-permission",
      severity: "warning",
      message: "Microphone is denied, so native/browser speech providers cannot capture audio.",
      nextAction: "Open System Settings > Privacy & Security > Microphone and grant skfiy."
    });
  }

  if (permissions?.speechRecognition === "denied") {
    addDiagnostic({
      code: "speech-recognition-permission",
      severity: "warning",
      message: "Speech Recognition is denied, so the native macOS speech provider cannot transcribe.",
      nextAction: "Open System Settings > Privacy & Security > Speech Recognition and grant skfiy."
    });
  }

  if (permissions?.finderAutomation !== "granted") {
    addDiagnostic({
      code: "finder-automation-unknown",
      severity: "info",
      message: "Finder Automation has not been proven from CLI status yet.",
      nextAction: "Run a Finder smoke once and grant Finder Automation when macOS prompts."
    });
  }

  if (desktopSession?.state === "blocked" || desktopSession?.controllable === false) {
    addDiagnostic({
      code: "desktop-session-blocked",
      severity: "error",
      message: "The active desktop session is not controllable.",
      nextAction: "Wake and unlock the Mac, then rerun `skfiy status --json` before collecting Computer Use evidence.",
      details: {
        frontmostBundleId: desktopSession.frontmostBundleId,
        mainDisplayAsleep: desktopSession.mainDisplayAsleep
      }
    });
  }

  if (statusInput.extensionIds.length > 0 && nativeHost?.state !== "installed") {
    addDiagnostic({
      code: "chrome-native-host",
      severity: "warning",
      message: typeof nativeHost?.reason === "string"
        ? nativeHost.reason
        : "Chrome Native Messaging host is not installed for the requested extension.",
      nextAction:
        `Run \`skfiy chrome install-host --extension-id ${statusInput.extensionIds[0]}\` to install the Chrome Native Messaging host.`
    });
  }

  if (statusInput.dashboardUrl && dashboard?.state !== "running") {
    addDiagnostic({
      code: "dashboard-not-running",
      severity: "warning",
      message: "The provided dashboard URL is not serving a descriptor.",
      nextAction: "Start the dashboard with `skfiy dashboard --no-open --json` or pass the current dashboard URL."
    });
  }

  return {
    result: diagnostics.length === 0 ? "ok" : "needs-action",
    diagnostics,
    nextActions,
    status,
    signature
  };
}

async function readCliStatus(input: StatusReaderInput): Promise<Record<string, unknown>> {
  const appExists = existsSync(input.appPath);
  const helperExists = existsSync(input.helperPath);
  const app = {
    state: appExists ? "installed" : "missing",
    path: input.appPath
  };
  const helper = {
    state: helperExists ? "installed" : "missing",
    path: input.helperPath
  };

  if (!helperExists) {
    return {
      app,
      helper,
      permissions: createUnknownPermissionStates(),
      desktopSession: {
        state: "unknown",
        reason: `skfiy helper is missing at ${input.helperPath}.`
      },
      extension: createUnknownExtensionStatus(),
      nativeHost: await readNativeHostStatusForStatus(input),
      dashboard: await readDashboardStatus(input.dashboardUrl)
    };
  }

  const desktopHelper = new DesktopHelperClient({
    helperPath: input.helperPath
  });

  return {
    app,
    helper,
    permissions: await readPermissionStatesForStatus(desktopHelper),
    desktopSession: await readDesktopSessionForStatus(desktopHelper),
    extension: createUnknownExtensionStatus(),
    nativeHost: await readNativeHostStatusForStatus(input),
    dashboard: await readDashboardStatus(input.dashboardUrl)
  };
}

async function readPermissionStatesForStatus(
  helper: Pick<DesktopHelperClient, "getPermissions">
): Promise<Record<string, unknown>> {
  try {
    const permissions = await helper.getPermissions();

    return createPermissionStates(permissions);
  } catch (error) {
    return {
      ...createUnknownPermissionStates(),
      reason: readErrorMessage(error)
    };
  }
}

function createPermissionStates(permissions: PermissionSummary): Record<string, unknown> {
  return {
    screenRecording: permissions.screenRecording.state,
    accessibility: permissions.accessibility.state,
    microphone: permissions.microphone.state,
    speechRecognition: permissions.speechRecognition.state,
    finderAutomation: "unknown"
  };
}

function createUnknownPermissionStates(): Record<string, "unknown"> {
  return {
    screenRecording: "unknown",
    accessibility: "unknown",
    microphone: "unknown",
    speechRecognition: "unknown",
    finderAutomation: "unknown"
  };
}

async function readDesktopSessionForStatus(
  helper: Pick<DesktopHelperClient, "getDesktopSessionStatus">
): Promise<Record<string, unknown>> {
  try {
    const status = await helper.getDesktopSessionStatus();

    return {
      state: status.controllable ? "controllable" : "blocked",
      ...status
    };
  } catch (error) {
    return {
      state: "unknown",
      reason: readErrorMessage(error)
    };
  }
}

async function readNativeHostStatusForStatus(
  input: StatusReaderInput
): Promise<Record<string, unknown>> {
  if (input.extensionIds.length === 0) {
    return {
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: [],
      reason: "Pass --extension-id <id> to include Chrome Native Messaging host status."
    };
  }

  if (!input.homeDir) {
    return {
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: input.extensionIds,
      reason: "Home directory is required to locate the Chrome Native Messaging host manifest."
    };
  }

  try {
    const nativeHost = await readChromeNativeHostStatus({
      homeDir: input.homeDir,
      cliShimPath: input.cliShimPath,
      extensionIds: input.extensionIds
    });

    return {
      ...nativeHost
    };
  } catch (error) {
    return {
      state: "unknown",
      cliShimPath: input.cliShimPath,
      extensionIds: input.extensionIds,
      reason: readErrorMessage(error)
    };
  }
}

function createUnknownExtensionStatus(): Record<string, string> {
  return {
    state: "unknown",
    reason: "Runtime Chrome extension connection is not probed by the CLI status command yet."
  };
}

async function readDashboardStatus(dashboardUrl: string | undefined): Promise<Record<string, unknown>> {
  if (!dashboardUrl) {
    return { state: "not-running" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);

  try {
    const response = await fetch(new URL("/descriptor.json", dashboardUrl), {
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        state: "blocked",
        url: dashboardUrl,
        status: response.status
      };
    }

    const descriptor = await response.json() as unknown;

    return {
      state: "running",
      url: dashboardUrl,
      descriptor
    };
  } catch (error) {
    return {
      state: "not-running",
      url: dashboardUrl,
      reason: readErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readCodeSignatureStatus({
  appPath
}: SignatureReaderInput): Promise<SignatureStatus> {
  if (!existsSync(appPath)) {
    return {
      state: "unknown",
      reason: `skfiy.app is missing at ${appPath}.`
    };
  }

  const verify = await runCommand("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath
  ]);

  if (verify.exitCode !== 0) {
    return {
      state: "invalid",
      reason: (verify.stderr || verify.stdout || "codesign verification failed.").trim()
    };
  }

  const details = await runCommand("codesign", [
    "-dv",
    "--verbose=4",
    appPath
  ]);
  const detailText = `${details.stdout}\n${details.stderr}`;

  if (!detailText.includes("Identifier=com.sskift.skfiy")) {
    return {
      state: "invalid",
      reason: "designated requirement does not include com.sskift.skfiy"
    };
  }

  return {
    state: "valid"
  };
}

function runCommand(command: string, args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runSmokeCli({
  invocation,
  generatedAt,
  rootDir,
  smokeRunner,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "smoke" }>;
  generatedAt?: string;
  rootDir: string;
  smokeRunner: (input: SmokeRunnerInput) => Promise<SmokeRunnerResult>;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  let smokeResult: SmokeRunnerResult;

  try {
    smokeResult = await smokeRunner({
      target: invocation.target,
      cwd: rootDir,
      scriptPath: invocation.options.scriptPath,
      args: invocation.options.scriptArgs
    });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stdout.write(`${JSON.stringify({
      ...createCliOutput(invocation, { generatedAt }),
      result: "error",
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2)}\n`);
    return 1;
  }

  const smoke = parseSmokeJson(smokeResult.stdout);
  const result = typeof smoke?.result === "string"
    ? smoke.result
    : smokeResult.exitCode === 0 ? "completed" : "failed";

  stdout.write(`${JSON.stringify({
    ...createCliOutput(invocation, { generatedAt }),
    result,
    exitCode: smokeResult.exitCode,
    smoke,
    smokeStderr: smokeResult.stderr
  }, null, 2)}\n`);

  return smokeResult.exitCode;
}

function runSmokeScript(input: SmokeRunnerInput): Promise<SmokeRunnerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      input.scriptPath,
      ...input.args
    ], {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function openDashboardUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [url], {
      stdio: "ignore"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`open exited with code ${code ?? "null"}.`));
      }
    });
  });
}

async function waitForDashboardShutdown(dashboard: DashboardServer): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void dashboard.close().finally(resolve);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function runChromeNativeHostCli({
  invocation,
  generatedAt,
  homeDir,
  io,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt?: string;
  homeDir: string;
  io?: ChromeNativeHostIo;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  if (invocation.options.extensionIds.length === 0) {
    stderr.write("Chrome extension id is required. Pass --extension-id <id>.\n");
    return 2;
  }
  if (!homeDir) {
    stderr.write("Home directory is required to locate the Chrome Native Messaging host manifest.\n");
    return 2;
  }

  if (invocation.subcommand === "status") {
    const nativeHost = await readChromeNativeHostStatus({
      homeDir,
      cliShimPath: invocation.options.cliShimPath,
      extensionIds: invocation.options.extensionIds,
      io
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: false,
      nativeHost
    }, null, 2)}\n`);
    return 0;
  }

  if (invocation.subcommand === "install-host") {
    const installResult = await installChromeNativeHost({
      homeDir,
      cliShimPath: invocation.options.cliShimPath,
      extensionIds: invocation.options.extensionIds,
      io
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: true,
      ...installResult
    }, null, 2)}\n`);
    return 0;
  }

  const uninstallResult = await uninstallChromeNativeHost({
    homeDir,
    cliShimPath: invocation.options.cliShimPath,
    extensionIds: invocation.options.extensionIds,
    io
  });
  stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    ...uninstallResult
  }, null, 2)}\n`);
  return 0;
}

function ok(invocation: CliCommandInvocation): NormalizeCliCommandResult {
  return {
    ok: true,
    invocation
  };
}

function error(code: string, message: string): NormalizeCliCommandResult {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function isChromeSubcommand(value: string | undefined): value is ChromeSubcommand {
  return value === "status" || value === "install-host" || value === "uninstall-host";
}

function isSmokeTarget(value: string | undefined): value is SmokeTarget {
  return SMOKE_TARGETS.includes(value as SmokeTarget);
}

function createSmokeScriptPath(target: SmokeTarget, rootDir: string): string {
  return path.join(rootDir, ...SMOKE_SCRIPT_FILES[target].split("/"));
}

function createSmokeScriptArgs(argv: string[], rootDir: string): string[] {
  const args: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      continue;
    }

    if (arg === "--output") {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        args.push(arg);
      } else {
        args.push(arg, path.isAbsolute(value) ? value : path.resolve(rootDir, value));
        index += 1;
      }
      continue;
    }

    args.push(arg);
  }

  return args;
}

function parseSmokeJson(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function readNumberOption(argv: string[], name: string, fallback: number): number {
  const value = readOptionValue(argv, name);

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid numeric option ${name}: ${value}`);
  }

  return parsed;
}

function resolveOptionPath(
  argv: string[],
  name: string,
  rootDir: string,
  fallback: string
): string {
  const value = readOptionValue(argv, name);

  if (value === undefined || value === "") {
    return fallback;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(rootDir, value);
}

function readOptionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function readRepeatedOptionValues(argv: string[], name: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }

  return values;
}
