import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  startDashboardServer,
  type DashboardServer
} from "./dashboard-server.js";
import {
  createChromeExtensionConnectionStatePath,
  installChromeNativeHost,
  readChromeExtensionConnectionStatus,
  readChromeNativeHostStatus,
  uninstallChromeNativeHost,
  type ChromeExtensionConnectionStatus,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";
import {
  applyChromeHostPolicyAction,
  createDefaultChromeHostPolicy,
  createChromeHostPolicyStatePath,
  decideChromeHostPolicy,
  readChromeHostPolicyState,
  resetChromeHostPolicyState,
  writeChromeHostPolicyState,
  type ChromeHostPolicyAction,
  type ChromeHostPolicyState
} from "./chrome-host-policy.js";
import {
  SKFIY_MCP_TOOL_NAMES,
  runSkfiyMcpStdioServer,
  type SkfiyMcpProviders,
  type SkfiyMcpToolCallInput
} from "./skfiy-mcp-server.js";
import {
  createTmuxSupervisionReport,
  parseTmuxPaneList,
  type TmuxPaneSummary,
  type TmuxSupervisionReport
} from "./computer-use/tmux-supervisor.js";
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
  "codex-plugin",
  "finder",
  "voice",
  "money-run"
] as const;

export const PERMISSION_SETTINGS_TARGETS = [
  "screen-recording",
  "accessibility",
  "microphone",
  "speech-recognition",
  "automation-finder"
] as const;

export type SmokeTarget = typeof SMOKE_TARGETS[number];
export type PermissionSettingsTarget = typeof PERMISSION_SETTINGS_TARGETS[number];
export type ChromeSubcommand = "status" | "install-host" | "uninstall-host";
export type ChromePolicySubcommand = "show" | "set" | "reset";
export type McpTransport = "stdio";

const SMOKE_SCRIPT_FILES: Record<SmokeTarget, string> = {
  ui: "scripts/smoke-ui-product.mjs",
  "desktop-session": "scripts/smoke-desktop-session.mjs",
  ghostty: "scripts/smoke-ghostty-product.mjs",
  chrome: "scripts/smoke-chrome-product.mjs",
  dashboard: "scripts/smoke-dashboard-product.mjs",
  "codex-plugin": "scripts/smoke-codex-plugin-product.mjs",
  finder: "scripts/smoke-finder-product.mjs",
  voice: "scripts/smoke-voice-product.mjs",
  "money-run": "scripts/smoke-money-run-supervision.mjs"
};

const SYSTEM_SETTINGS_PRIVACY_PANE_URL_PREFIX =
  "x-apple.systempreferences:com.apple.preference.security?";
const MONEY_RUN_SESSION_NAME = "money-run";
const TMUX_TAIL_LINES = 120;
const TMUX_PROBE_TIMEOUT_MS = 1_500;
const TMUX_WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const TMUX_PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";

const PERMISSION_SETTINGS_TARGET_DETAILS: Record<PermissionSettingsTarget, {
  label: string;
  anchor: string;
  guidance: string;
}> = {
  "screen-recording": {
    label: "Screen Recording",
    anchor: "Privacy_ScreenCapture",
    guidance: "Grant skfiy Screen Recording access."
  },
  accessibility: {
    label: "Accessibility",
    anchor: "Privacy_Accessibility",
    guidance: "Grant skfiy Accessibility access."
  },
  microphone: {
    label: "Microphone",
    anchor: "Privacy_Microphone",
    guidance: "Grant skfiy Microphone access."
  },
  "speech-recognition": {
    label: "Speech Recognition",
    anchor: "Privacy_SpeechRecognition",
    guidance: "Grant skfiy Speech Recognition access."
  },
  "automation-finder": {
    label: "Automation",
    anchor: "Privacy_Automation",
    guidance: "Grant skfiy permission to control Finder in Automation."
  }
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
      kind: "permissions-open";
      path: `permissions open ${PermissionSettingsTarget}`;
      target: PermissionSettingsTarget;
      json: boolean;
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
      kind: "chrome-policy";
      path: `chrome policy ${ChromePolicySubcommand}`;
      subcommand: ChromePolicySubcommand;
      json: boolean;
      options: {
        host?: string;
        action?: ChromeHostPolicyAction;
      };
    }
  | {
      kind: "mcp-serve";
      path: "mcp serve";
      json: boolean;
      options: {
        transport: McpTransport;
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

export interface SkfiyMcpServer {
  transport: McpTransport;
  tools: string[];
  close: () => Promise<void>;
}

export interface SkfiyMcpServerStarterInput {
  rootDir: string;
  homeDir: string;
  transport: McpTransport;
}

export type SkfiyMcpServerStarter = (
  input: SkfiyMcpServerStarterInput
) => Promise<SkfiyMcpServer>;

export interface RunSkfiyCliInput {
  argv: string[];
  rootDir?: string;
  homeDir?: string;
  generatedAt?: string;
  chromeNativeHostIo?: ChromeNativeHostIo;
  statusReader?: StatusReader;
  signatureReader?: SignatureReader;
  smokeRunner?: (input: SmokeRunnerInput) => Promise<SmokeRunnerResult>;
  mcpStdin?: AsyncIterable<Buffer | Uint8Array | string> | Iterable<Buffer | Uint8Array | string>;
  mcpServerStarter?: SkfiyMcpServerStarter;
  dashboardServerStarter?: (input: { port: number; rootDir?: string }) => Promise<DashboardServer>;
  dashboardOpener?: (url: string) => Promise<void>;
  permissionSettingsOpener?: (url: string) => Promise<void>;
  keepDashboardAlive?: boolean;
  keepMcpServerAlive?: boolean;
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
    path: "permissions open <screen-recording|accessibility|microphone|speech-recognition|automation-finder>",
    summary: "Open the matching macOS Privacy & Security permission settings panel.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "permission-settings-open"
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
    path: "chrome policy show",
    summary: "Show the user-level Chrome host policy state.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "chrome-host-policy"
  },
  {
    path: "chrome policy set",
    summary: "Set a Chrome host policy entry for one host.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-policy"
  },
  {
    path: "chrome policy reset",
    summary: "Reset the user-level Chrome host policy state to ask by default.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-policy"
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
  {
    path: "mcp serve",
    summary: "Serve skfiy status and Computer Use tools over MCP stdio for Codex plugins.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "mcp-server"
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

  if (command === "permissions") {
    const subcommand = argv[1];
    const target = argv[2];

    if (subcommand !== "open") {
      return error(
        "unknown-permissions-subcommand",
        `Unknown permissions subcommand: ${subcommand ?? ""}`
      );
    }
    if (!isPermissionSettingsTarget(target)) {
      return error(
        "unknown-permission-settings-target",
        `Unknown permission settings target: ${target ?? ""}`
      );
    }

    return ok({
      kind: "permissions-open",
      path: `permissions open ${target}`,
      target,
      json: argv.includes("--json")
    });
  }

  if (command === "chrome") {
    const subcommand = argv[1];

    if (subcommand === "policy") {
      const policySubcommand = argv[2];

      if (!isChromePolicySubcommand(policySubcommand)) {
        return error(
          "unknown-chrome-policy-subcommand",
          `Unknown chrome policy subcommand: ${policySubcommand ?? ""}`
        );
      }

      if (policySubcommand === "set") {
        const host = readOptionValue(argv, "--host");
        const actionValue = readOptionValue(argv, "--action");
        const action = normalizeChromePolicySetAction(actionValue);

        if (!host || host.startsWith("--")) {
          return error(
            "missing-chrome-policy-host",
            "Chrome policy set requires --host <host>."
          );
        }
        if (!action) {
          return error(
            "unknown-chrome-policy-action",
            `Unknown chrome policy action: ${actionValue ?? ""}`
          );
        }

        return ok({
          kind: "chrome-policy",
          path: "chrome policy set",
          subcommand: policySubcommand,
          json: argv.includes("--json"),
          options: {
            host,
            action
          }
        });
      }

      return ok({
        kind: "chrome-policy",
        path: `chrome policy ${policySubcommand}`,
        subcommand: policySubcommand,
        json: argv.includes("--json"),
        options: {}
      });
    }

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

  if (command === "mcp") {
    const subcommand = argv[1];

    if (subcommand !== "serve") {
      return error("unknown-mcp-subcommand", `Unknown mcp subcommand: ${subcommand ?? ""}`);
    }
    if (!argv.includes("--stdio")) {
      return error("missing-mcp-transport", "MCP serve requires --stdio.");
    }

    return ok({
      kind: "mcp-serve",
      path: "mcp serve",
      json: argv.includes("--json"),
      options: {
        transport: "stdio"
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
        scriptArgs: createSmokeScriptArgs(target, smokeArgv, rootDir)
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
    const status = {
      app: { state: "unknown" },
      cli: { state: "unknown", path: invocation.options.cliShimPath },
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
        : { state: "not-running" },
      moneyRun: createUnknownMoneyRunStatus()
    };

    return {
      schemaVersion: 1,
      command: "status",
      generatedAt,
      ...withStatusReadiness(status, invocation.options)
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

  if (invocation.kind === "permissions-open") {
    return createPermissionSettingsOpenOutput({
      invocation,
      generatedAt,
      result: "not-run"
    });
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

  if (invocation.kind === "chrome-policy") {
    if (invocation.subcommand === "show") {
      return {
        schemaVersion: 1,
        command: "chrome policy show",
        generatedAt,
        executesSystemMutation: false,
        hostPolicy: { state: "unknown" }
      };
    }

    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      plannedMutation: true,
      executesSystemMutation: true,
      result: "not-run",
      ...(invocation.options.host ? { host: invocation.options.host } : {}),
      ...(invocation.options.action ? { action: invocation.options.action } : {}),
      hostPolicy: { state: "not-mutated" }
    };
  }

  if (invocation.kind === "mcp-serve") {
    return {
      schemaVersion: 1,
      command: "mcp serve",
      generatedAt,
      transport: invocation.options.transport,
      result: "not-started",
      plannedMutation: false,
      executesSystemMutation: false,
      tools: [...SKFIY_MCP_TOOL_NAMES]
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

function createPermissionSettingsOpenOutput({
  invocation,
  generatedAt,
  result,
  error
}: {
  invocation: Extract<CliCommandInvocation, { kind: "permissions-open" }>;
  generatedAt: string;
  result: "not-run" | "opened" | "error";
  error?: string;
}): Record<string, unknown> {
  const targetDetails = PERMISSION_SETTINGS_TARGET_DETAILS[invocation.target];
  const url = `${SYSTEM_SETTINGS_PRIVACY_PANE_URL_PREFIX}${targetDetails.anchor}`;

  return {
    schemaVersion: 1,
    command: "permissions open",
    generatedAt,
    target: invocation.target,
    executesSystemMutation: true,
    result,
    ...(error ? { error } : {}),
    systemSettings: {
      app: "System Settings",
      pane: "Privacy & Security",
      label: targetDetails.label,
      anchor: targetDetails.anchor,
      url
    },
    actionPlan: [
      {
        step: "open-system-settings",
        executor: "skfiy-cli",
        command: "open",
        args: [url]
      },
      {
        step: "grant-permission",
        executor: "user",
        target: invocation.target,
        guidance: targetDetails.guidance
      }
    ]
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
  mcpStdin = process.stdin,
  mcpServerStarter = startSkfiyMcpServer,
  dashboardServerStarter = startDashboardServer,
  dashboardOpener = openDashboardUrl,
  permissionSettingsOpener = openPermissionSettingsUrl,
  keepDashboardAlive = true,
  keepMcpServerAlive = true,
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

  if (result.invocation.kind === "permissions-open") {
    return runPermissionSettingsOpenCli({
      invocation: result.invocation,
      generatedAt,
      permissionSettingsOpener,
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

  if (result.invocation.kind === "chrome-policy") {
    return runChromeHostPolicyCli({
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

  if (result.invocation.kind === "mcp-serve") {
    return runMcpServeCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      homeDir: homeDir ?? process.env.HOME ?? "",
      mcpServerStarter,
      mcpStdin,
      statusReader,
      signatureReader,
      keepMcpServerAlive,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "dashboard") {
    const dashboard = await dashboardServerStarter({
      port: result.invocation.options.port,
      rootDir: normalizedRootDir
    });
    const descriptor = createDashboardDescriptor({
      port: dashboard.bind.port
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: generatedAt ?? new Date().toISOString(),
      serverPid: process.pid,
      bind: descriptor.bind,
      url: descriptor.url,
      shouldOpen: !result.invocation.options.noOpen,
      tokenPrinted: false,
      auth: descriptor.auth,
      updates: descriptor.updates,
      eventStore: descriptor.eventStore,
      descriptor,
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

async function runPermissionSettingsOpenCli({
  invocation,
  generatedAt,
  permissionSettingsOpener,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "permissions-open" }>;
  generatedAt?: string;
  permissionSettingsOpener: (url: string) => Promise<void>;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  const effectiveGeneratedAt = generatedAt ?? new Date().toISOString();
  const targetDetails = PERMISSION_SETTINGS_TARGET_DETAILS[invocation.target];
  const url = `${SYSTEM_SETTINGS_PRIVACY_PANE_URL_PREFIX}${targetDetails.anchor}`;

  try {
    await permissionSettingsOpener(url);
    stdout.write(`${JSON.stringify(createPermissionSettingsOpenOutput({
      invocation,
      generatedAt: effectiveGeneratedAt,
      result: "opened"
    }), null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = readErrorMessage(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify(createPermissionSettingsOpenOutput({
      invocation,
      generatedAt: effectiveGeneratedAt,
      result: "error",
      error: message
    }), null, 2)}\n`);
    return 1;
  }
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
    const status = withStatusReadiness(await statusReader(input), input);

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
  const cli = readRecord(status.cli);
  const helper = readRecord(status.helper);
  const permissions = readRecord(status.permissions);
  const desktopSession = readRecord(status.desktopSession);
  const extension = readRecord(status.extension);
  const nativeHost = readRecord(status.nativeHost);
  const dashboard = readRecord(status.dashboard);
  const hostPolicy = readRecord(extension?.hostPolicy) ?? {
    state: statusInput.homeDir ? "unknown" : "not-probed",
    path: statusInput.homeDir ? createChromeHostPolicyStatePath(statusInput.homeDir) : undefined,
    reason: statusInput.homeDir
      ? "Chrome host policy was not included in status output."
      : "Home directory is required to locate the Chrome host policy file."
  };
  const dashboardApi = readRecord(readRecord(dashboard?.api)?.chromeHostPolicy) ?? {
    state: statusInput.dashboardUrl ? "unknown" : "not-probed",
    url: createDashboardApiUrl(statusInput.dashboardUrl),
    reason: statusInput.dashboardUrl
      ? "Dashboard Chrome host policy API was not included in status output."
      : "Pass --dashboard-url <url> to probe dashboard API reachability."
  };

  if (app?.state !== "installed") {
    addDiagnostic({
      code: "app-missing",
      severity: "error",
      message: `skfiy.app is missing at ${statusInput.appPath}.`,
      nextAction: "Run `npm run build` to create dist/skfiy.app and the CLI shim."
    });
  }

  if (cli?.state === "missing") {
    addDiagnostic({
      code: "cli-binary-missing",
      severity: "error",
      message: `Packaged skfiy CLI is missing at ${statusInput.cliShimPath}.`,
      nextAction: "Run `npm run build` so dist/skfiy exists before product smoke or dogfood runs."
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

  if (
    statusInput.dashboardUrl
    && dashboard?.state === "running"
    && dashboardApi.state !== "reachable"
  ) {
    addDiagnostic({
      code: "dashboard-api-unreachable",
      severity: "warning",
      message: "The dashboard is running, but its Chrome host policy API is not reachable.",
      nextAction: "Restart `skfiy dashboard --no-open --json` and rerun `skfiy doctor --json --dashboard-url <url>`.",
      details: {
        url: dashboardApi.url,
        state: dashboardApi.state,
        status: dashboardApi.status,
        reason: dashboardApi.reason
      }
    });
  }

  if (hostPolicy.state === "invalid") {
    addDiagnostic({
      code: "chrome-host-policy-invalid",
      severity: "warning",
      message: typeof hostPolicy.reason === "string"
        ? hostPolicy.reason
        : "Chrome host policy state is invalid.",
      nextAction: "Run `skfiy chrome policy reset` to return Chrome host policy to default ask mode.",
      details: {
        path: hostPolicy.path
      }
    });
  }

  const readiness = createStatusReadinessSummary(status, statusInput);

  return {
    result: diagnostics.length === 0 ? "ok" : "needs-action",
    readiness,
    preflight: {
      runtime: {
        appPath: statusInput.appPath,
        appState: app?.state ?? "unknown",
        helperPath: statusInput.helperPath,
        helperState: helper?.state ?? "unknown",
        cliPath: statusInput.cliShimPath,
        cliState: cli?.state ?? "unknown",
        signature
      },
      dashboard: {
        state: dashboard?.state ?? "unknown",
        url: statusInput.dashboardUrl,
        api: {
          chromeHostPolicy: dashboardApi
        }
      },
      chrome: {
        extensionIds: statusInput.extensionIds,
        extension: extension ?? { state: "unknown" },
        nativeHost: nativeHost ?? { state: "unknown" },
        hostPolicy
      }
    },
    diagnostics,
    nextActions,
    status: withStatusReadiness(status, statusInput),
    signature
  };
}

function withStatusReadiness<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: {
    extensionIds: string[];
    dashboardUrl?: string;
    cliShimPath?: string;
  }
): TStatus & { readiness: Record<string, unknown> } {
  return {
    ...status,
    readiness: createStatusReadinessSummary(status, context)
  };
}

function createStatusReadinessSummary(
  status: Record<string, unknown>,
  context: {
    extensionIds: string[];
    dashboardUrl?: string;
    cliShimPath?: string;
  }
): Record<string, unknown> {
  const checks = {
    runtime: createRuntimeReadiness(status),
    dashboard: createDashboardReadiness(status, context),
    extension: createExtensionReadiness(status, context),
    moneyRun: createMoneyRunReadiness(status)
  };
  const entries = Object.entries(checks);
  const states = entries.map(([, check]) => readString(readRecord(check)?.state) ?? "unknown");
  const blockers = entries.flatMap(([area, check]) =>
    readBlockers(check).map((blocker) => ({
      area,
      ...blocker
    }))
  );
  const state = states.every((item) => item === "ready")
    ? "ready"
    : states.every((item) => item === "unknown")
      ? "unknown"
      : "needs-action";

  return {
    state,
    ready: state === "ready",
    checks,
    blockers
  };
}

function createRuntimeReadiness(status: Record<string, unknown>): Record<string, unknown> {
  const app = readRecord(status.app);
  const cli = readRecord(status.cli);
  const helper = readRecord(status.helper);
  const permissions = readRecord(status.permissions);
  const desktopSession = readRecord(status.desktopSession);
  const appState = readString(app?.state) ?? "unknown";
  const cliState = readString(cli?.state) ?? "unknown";
  const helperState = readString(helper?.state) ?? "unknown";
  const screenRecording = readString(permissions?.screenRecording) ?? "unknown";
  const accessibility = readString(permissions?.accessibility) ?? "unknown";
  const desktopSessionState = readString(desktopSession?.state) ?? "unknown";
  const observed = [
    appState,
    cliState,
    helperState,
    screenRecording,
    accessibility,
    desktopSessionState
  ].some((state) => state !== "unknown");

  if (!observed) {
    return {
      state: "unknown",
      ready: false,
      appState,
      cliState,
      helperState,
      desktopSessionState,
      requiredPermissions: {
        screenRecording,
        accessibility
      },
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = [];

  addStateBlocker(blockers, "app-not-installed", "App bundle is not installed.", appState, "installed");
  addStateBlocker(blockers, "cli-not-installed", "Packaged CLI is not installed.", cliState, "installed");
  addStateBlocker(blockers, "helper-not-installed", "Desktop helper is not installed.", helperState, "installed");
  addStateBlocker(
    blockers,
    "screen-recording-not-granted",
    "Screen Recording is required for observation.",
    screenRecording,
    "granted"
  );
  addStateBlocker(
    blockers,
    "accessibility-not-granted",
    "Accessibility is required for desktop control.",
    accessibility,
    "granted"
  );
  addStateBlocker(
    blockers,
    "desktop-session-not-controllable",
    "The active desktop session must be controllable.",
    desktopSessionState,
    "controllable"
  );

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    appState,
    cliState,
    helperState,
    desktopSessionState,
    requiredPermissions: {
      screenRecording,
      accessibility
    },
    blockers
  };
}

function createDashboardReadiness(
  status: Record<string, unknown>,
  context: { dashboardUrl?: string }
): Record<string, unknown> {
  const dashboard = readRecord(status.dashboard);
  const api = readRecord(readRecord(dashboard?.api)?.chromeHostPolicy);
  const dashboardState = readString(dashboard?.state) ?? "unknown";
  const apiState = readString(api?.state);

  if (dashboardState === "unknown") {
    return {
      state: "unknown",
      ready: false,
      dashboardState,
      ...(context.dashboardUrl ? { url: context.dashboardUrl } : {}),
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = [];
  if (dashboardState !== "running") {
    blockers.push({
      code: "dashboard-not-running",
      message: "Loopback dashboard is not running.",
      state: dashboardState
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    dashboardState,
    ...(readString(dashboard?.url) || context.dashboardUrl
      ? { url: readString(dashboard?.url) ?? context.dashboardUrl }
      : {}),
    ...(apiState ? { chromeHostPolicyApiState: apiState } : {}),
    blockers
  };
}

function createExtensionReadiness(
  status: Record<string, unknown>,
  context: {
    extensionIds: string[];
    cliShimPath?: string;
  }
): Record<string, unknown> {
  const extension = readRecord(status.extension);
  const nativeHost = readRecord(status.nativeHost);
  const extensionState = readString(extension?.state) ?? "unknown";
  const nativeHostState = readString(nativeHost?.state) ?? "unknown";
  const liveConnection = readString(extension?.liveConnection) ?? "unknown";
  const extensionIds = context.extensionIds.length > 0
    ? context.extensionIds
    : readStringArray(nativeHost?.extensionIds);
  const observed = extensionIds.length > 0
    || extensionState !== "unknown"
    || nativeHostState !== "unknown";

  if (!observed) {
    return {
      state: "unknown",
      ready: false,
      extensionState,
      nativeHostState,
      liveConnection,
      extensionIds,
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = [];

  if (extensionIds.length === 0) {
    blockers.push({
      code: "extension-id-not-provided",
      message: "Pass --extension-id <id> to verify Chrome Native Messaging installation."
    });
  }
  if (nativeHostState !== "installed") {
    blockers.push({
      code: "native-host-not-installed",
      message: "Chrome Native Messaging host is not installed for the requested extension.",
      state: nativeHostState
    });
  } else if (extensionState !== "connected") {
    blockers.push({
      code: "extension-not-connected",
      message: "Chrome Native Messaging host is installed, but no live extension heartbeat is connected.",
      state: extensionState,
      liveConnection
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    extensionState,
    nativeHostState,
    liveConnection,
    extensionIds,
    ...(readString(nativeHost?.manifestPath) ? { manifestPath: readString(nativeHost?.manifestPath) } : {}),
    ...(context.cliShimPath ? { cliShimPath: context.cliShimPath } : {}),
    blockers
  };
}

function createMoneyRunReadiness(status: Record<string, unknown>): Record<string, unknown> {
  const moneyRun = readRecord(status.moneyRun);
  const moneyRunState = readString(moneyRun?.state) ?? "unknown";
  const mutatesSession = moneyRun?.mutatesSession === true;

  if (moneyRunState === "unknown") {
    return {
      state: "unknown",
      ready: false,
      session: MONEY_RUN_SESSION_NAME,
      moneyRunState,
      mutatesSession: false,
      blockers: []
    };
  }

  const blockers: Array<Record<string, unknown>> = moneyRunState === "observing"
    ? []
    : [{
        code: "money-run-not-observing",
        message: "money-run tmux supervision is not in an observing state.",
        state: moneyRunState
      }];
  if (mutatesSession) {
    blockers.push({
      code: "money-run-mutating-probe",
      message: "money-run status must be gathered with read-only tmux probes.",
      mutatesSession
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    session: readString(moneyRun?.session) ?? MONEY_RUN_SESSION_NAME,
    moneyRunState,
    source: readString(moneyRun?.source) ?? "tmux-read-only-probe",
    mutatesSession,
    ...(readRecord(moneyRun?.summary) ? { summary: readRecord(moneyRun?.summary) } : {}),
    ...(readRecord(moneyRun?.recommendation) ? { recommendation: readRecord(moneyRun?.recommendation) } : {}),
    blockers
  };
}

function addStateBlocker(
  blockers: Array<Record<string, unknown>>,
  code: string,
  message: string,
  actual: string,
  expected: string
): void {
  if (actual === expected) {
    return;
  }

  blockers.push({
    code,
    message,
    state: actual,
    expected
  });
}

function readBlockers(check: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(check.blockers)
    ? check.blockers.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function createUnknownMoneyRunStatus(): Record<string, unknown> {
  return {
    state: "unknown",
    session: MONEY_RUN_SESSION_NAME,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    reason: "money-run tmux supervision has not been probed yet."
  };
}

async function readMoneyRunStatusForStatus(): Promise<Record<string, unknown>> {
  const probeCommands: string[] = [];
  const runTmux = async (args: string[]) => {
    probeCommands.push(formatTmuxCommand(args));
    try {
      return await runCommand("tmux", args, { timeoutMs: TMUX_PROBE_TIMEOUT_MS });
    } catch (error) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: readErrorMessage(error)
      };
    }
  };

  try {
    const hasSession = await runTmux(["has-session", "-t", MONEY_RUN_SESSION_NAME]);
    if (hasSession.exitCode !== 0) {
      return createMoneyRunSnapshot(
        createTmuxSupervisionReport({
          sessionName: MONEY_RUN_SESSION_NAME,
          hasSession: false,
          commandError: readCommandResultMessage(hasSession, "tmux session was not found.")
        }),
        probeCommands,
        {
          probeError: readCommandResultMessage(hasSession, "tmux session was not found.")
        }
      );
    }

    const [windows, panes] = await Promise.all([
      runTmux([
        "list-windows",
        "-t",
        MONEY_RUN_SESSION_NAME,
        "-F",
        TMUX_WINDOW_FORMAT
      ]),
      runTmux([
        "list-panes",
        "-t",
        MONEY_RUN_SESSION_NAME,
        "-s",
        "-F",
        TMUX_PANE_FORMAT
      ])
    ]);

    if (windows.exitCode !== 0 || panes.exitCode !== 0) {
      const failed = windows.exitCode !== 0 ? windows : panes;

      return createMoneyRunProbeFailure(
        probeCommands,
        readCommandResultMessage(failed, "tmux session state could not be listed.")
      );
    }

    const paneTails: Record<string, string> = {};
    for (const pane of parseTmuxPaneList(panes.stdout)) {
      const tail = await runTmux([
        "capture-pane",
        "-p",
        "-t",
        pane.id,
        "-S",
        `-${TMUX_TAIL_LINES}`
      ]);
      paneTails[pane.id] = tail.stdout || tail.stderr;
    }

    return createMoneyRunSnapshot(
      createTmuxSupervisionReport({
        sessionName: MONEY_RUN_SESSION_NAME,
        hasSession: true,
        windowsOutput: windows.stdout,
        panesOutput: panes.stdout,
        paneTails
      }),
      probeCommands
    );
  } catch (error) {
    return createMoneyRunProbeFailure(probeCommands, readErrorMessage(error));
  }
}

function createMoneyRunProbeFailure(
  probeCommands: string[],
  reason: string
): Record<string, unknown> {
  return {
    state: "blocked",
    session: MONEY_RUN_SESSION_NAME,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    summary: {
      windowCount: 0,
      paneCount: 0,
      activePaneIds: [],
      deadPaneIds: []
    },
    signals: [
      {
        type: "probe-error",
        severity: "blocked",
        message: reason
      }
    ],
    recommendation: {
      action: "inspect_state",
      reason,
      mutatesSession: false
    },
    probeCommands,
    probeError: reason
  };
}

function createMoneyRunSnapshot(
  report: TmuxSupervisionReport,
  probeCommands: string[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const activePane = report.panes.find((pane) => pane.active);

  return {
    state: report.status,
    session: report.sessionName,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    summary: report.summary,
    ...(activePane ? { activePane: createMoneyRunActivePaneSummary(activePane) } : {}),
    signals: report.signals,
    recommendation: report.recommendation,
    probeCommands,
    ...extra
  };
}

function createMoneyRunActivePaneSummary(pane: TmuxPaneSummary): Record<string, unknown> {
  return {
    id: pane.id,
    windowName: pane.windowName,
    currentCommand: pane.currentCommand,
    title: pane.title,
    recentTailPreview: createTailPreview(pane.recentTail)
  };
}

function createTailPreview(value: string): string {
  const trimmed = value.trim();

  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

function readCommandResultMessage(
  result: {
    stdout: string;
    stderr: string;
  },
  fallback: string
): string {
  const message = (result.stderr || result.stdout || "").trim();

  return message || fallback;
}

function formatTmuxCommand(args: string[]): string {
  return ["tmux", ...args.map(formatCommandArg)].join(" ");
}

function formatCommandArg(arg: string): string {
  return /^[A-Za-z0-9_./:@%#{}=-]+$/.test(arg)
    ? arg
    : JSON.stringify(arg);
}

async function readCliStatus(input: StatusReaderInput): Promise<Record<string, unknown>> {
  const appExists = existsSync(input.appPath);
  const helperExists = existsSync(input.helperPath);
  const app = {
    state: appExists ? "installed" : "missing",
    path: input.appPath
  };
  const cli = {
    state: existsSync(input.cliShimPath) ? "installed" : "missing",
    path: input.cliShimPath
  };
  const helper = {
    state: helperExists ? "installed" : "missing",
    path: input.helperPath
  };

  if (!helperExists) {
    const nativeHost = await readNativeHostStatusForStatus(input);
    const extensionConnection = await readChromeExtensionConnectionForStatus(input);
    const hostPolicy = await readChromeHostPolicyForStatus(input);
    const [dashboard, moneyRun] = await Promise.all([
      readDashboardStatus(input.dashboardUrl),
      readMoneyRunStatusForStatus()
    ]);

    return {
      app,
      cli,
      helper,
      permissions: createUnknownPermissionStates(),
      desktopSession: {
        state: "unknown",
        reason: `skfiy helper is missing at ${input.helperPath}.`
      },
      extension: createChromeExtensionAdapterStatus(nativeHost, extensionConnection, hostPolicy),
      nativeHost,
      dashboard,
      moneyRun
    };
  }

  const desktopHelper = new DesktopHelperClient({
    helperPath: input.helperPath
  });

  const nativeHost = await readNativeHostStatusForStatus(input);
  const extensionConnection = await readChromeExtensionConnectionForStatus(input);
  const hostPolicy = await readChromeHostPolicyForStatus(input);
  const [permissions, desktopSession, dashboard, moneyRun] = await Promise.all([
    readPermissionStatesForStatus(desktopHelper),
    readDesktopSessionForStatus(desktopHelper),
    readDashboardStatus(input.dashboardUrl),
    readMoneyRunStatusForStatus()
  ]);

  return {
    app,
    cli,
    helper,
    permissions,
    desktopSession,
    extension: createChromeExtensionAdapterStatus(nativeHost, extensionConnection, hostPolicy),
    nativeHost,
    dashboard,
    moneyRun
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

function createUnknownExtensionStatus(reason = "Runtime Chrome extension connection is not probed by the CLI status command yet."): Record<string, string> {
  return {
    state: "unknown",
    reason
  };
}

function createChromeExtensionAdapterStatus(
  nativeHost: {
    state?: unknown;
    reason?: unknown;
    manifestPath?: unknown;
    allowedOrigins?: unknown;
  },
  connection?: ChromeExtensionConnectionStatus,
  hostPolicy?: ChromeHostPolicyState
): Record<string, unknown> {
  const allowedOrigins = Array.isArray(nativeHost.allowedOrigins)
    ? nativeHost.allowedOrigins.filter((origin): origin is string => typeof origin === "string")
    : [];
  const common = {
    bridge: "native-messaging",
    liveConnection: readConnectionState(connection),
    nativeHostState: nativeHost.state,
    ...(typeof nativeHost.manifestPath === "string" ? { manifestPath: nativeHost.manifestPath } : {}),
    ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    ...(connection && connection.state !== "unknown" ? { connection } : {}),
    ...(hostPolicy ? { hostPolicy } : {})
  };

  if (connection?.state === "connected") {
    return {
      state: "connected",
      ...common
    };
  }

  if (connection?.state === "stale" && nativeHost.state === "installed") {
    return {
      state: "native-host-installed",
      ...common,
      reason: "Chrome extension native-message heartbeat is stale."
    };
  }

  if (nativeHost.state === "installed") {
    return {
      state: "native-host-installed",
      ...common,
      reason: "Chrome Native Messaging host is installed; no live Chrome extension connection has been observed yet."
    };
  }

  if (nativeHost.state === "missing") {
    return {
      state: "native-host-missing",
      ...common,
      reason: "Chrome Native Messaging host manifest is not installed."
    };
  }

  if (nativeHost.state === "cli-missing") {
    return {
      state: "native-host-cli-missing",
      ...common,
      reason: "The Chrome Native Messaging host cannot run because the packaged skfiy CLI is missing."
    };
  }

  if (nativeHost.state === "mismatched") {
    return {
      state: "native-host-mismatched",
      ...common,
      reason: "Chrome Native Messaging host manifest points at a different skfiy CLI."
    };
  }

  if (nativeHost.state === "invalid") {
    return {
      state: "native-host-invalid",
      ...common,
      reason: "Chrome Native Messaging host manifest is invalid."
    };
  }

  return createUnknownExtensionStatus(
    typeof nativeHost.reason === "string"
      ? nativeHost.reason
      : "Runtime Chrome extension connection is not probed by the CLI status command yet."
  );
}

async function readChromeExtensionConnectionForStatus(
  input: StatusReaderInput
): Promise<ChromeExtensionConnectionStatus | undefined> {
  if (!input.homeDir) {
    return undefined;
  }

  try {
    return await readChromeExtensionConnectionStatus({
      homeDir: input.homeDir
    });
  } catch (error) {
    return {
      state: "unknown",
      liveConnection: "unknown",
      path: createChromeExtensionConnectionStatePath(input.homeDir),
      reason: readErrorMessage(error)
    };
  }
}

async function readChromeHostPolicyForStatus(
  input: StatusReaderInput,
  io?: ChromeNativeHostIo
): Promise<ChromeHostPolicyState | undefined> {
  if (!input.homeDir) {
    return undefined;
  }

  try {
    return await readChromeHostPolicyState({
      homeDir: input.homeDir,
      io
    });
  } catch (error) {
    return {
      schemaVersion: 1,
      state: "invalid",
      path: createChromeHostPolicyStatePath(input.homeDir),
      policy: {
        defaultMode: "ask",
        allowedHosts: [],
        currentTurnAllowedHosts: [],
        blockedHosts: []
      },
      reason: readErrorMessage(error)
    };
  }
}

function readConnectionState(connection: ChromeExtensionConnectionStatus | undefined): string {
  return connection?.liveConnection === "connected" || connection?.liveConnection === "stale"
    ? connection.liveConnection
    : "unknown";
}

async function readDashboardStatus(dashboardUrl: string | undefined): Promise<Record<string, unknown>> {
  if (!dashboardUrl) {
    return { state: "not-running" };
  }

  const descriptorUrl = createDashboardDescriptorUrl(dashboardUrl);
  const chromeHostPolicyApiUrl = createDashboardApiUrl(dashboardUrl);

  if (!descriptorUrl || !chromeHostPolicyApiUrl) {
    return {
      state: "not-running",
      url: dashboardUrl,
      reason: `Invalid dashboard URL: ${dashboardUrl}`,
      api: {
        chromeHostPolicy: {
          state: "not-probed",
          url: chromeHostPolicyApiUrl,
          reason: "Invalid dashboard URL."
        }
      }
    };
  }

  const descriptorProbe = await fetchDashboardJson(descriptorUrl);

  if (descriptorProbe.state !== "reachable") {
    return {
      state: descriptorProbe.state === "blocked" ? "blocked" : "not-running",
      url: dashboardUrl,
      status: descriptorProbe.status,
      reason: descriptorProbe.reason,
      api: {
        chromeHostPolicy: {
          state: "not-probed",
          url: chromeHostPolicyApiUrl,
          reason: "Dashboard descriptor is not reachable."
        }
      }
    };
  }

  return {
    state: "running",
    url: dashboardUrl,
    descriptor: descriptorProbe.body,
    api: {
      chromeHostPolicy: await fetchDashboardJson(chromeHostPolicyApiUrl)
    }
  };
}

function createDashboardDescriptorUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/descriptor.json", dashboardUrl);
}

function createDashboardApiUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/api/chrome-host-policy", dashboardUrl);
}

function createDashboardRelativeUrl(
  pathname: string,
  dashboardUrl: string | undefined
): string | undefined {
  if (!dashboardUrl) {
    return undefined;
  }

  try {
    return new URL(pathname, dashboardUrl).toString();
  } catch {
    return undefined;
  }
}

async function fetchDashboardJson(targetUrl: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        state: "blocked",
        url: targetUrl,
        status: response.status
      };
    }

    const body = await response.json() as unknown;

    return {
      state: "reachable",
      url: targetUrl,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      state: "not-running",
      url: targetUrl,
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

function runCommand(command: string, args: string[], options: {
  timeoutMs?: number;
} = {}): Promise<{
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
    let timedOut = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : undefined;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.once("exit", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr: timedOut
          ? `${stderr}${stderr ? "\n" : ""}${command} timed out after ${options.timeoutMs}ms.`
          : stderr
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

async function runMcpServeCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  mcpServerStarter,
  mcpStdin,
  statusReader,
  signatureReader,
  keepMcpServerAlive,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "mcp-serve" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  mcpServerStarter: SkfiyMcpServerStarter;
  mcpStdin: AsyncIterable<Buffer | Uint8Array | string> | Iterable<Buffer | Uint8Array | string>;
  statusReader: StatusReader;
  signatureReader: SignatureReader;
  keepMcpServerAlive: boolean;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  if (!invocation.json) {
    return runSkfiyMcpStdioServer({
      stdin: mcpStdin,
      stdout,
      stderr,
      providers: createMcpProviders({
        rootDir,
        homeDir,
        generatedAt,
        statusReader,
        signatureReader
      })
    });
  }

  let server: SkfiyMcpServer;

  try {
    server = await mcpServerStarter({
      rootDir,
      homeDir,
      transport: invocation.options.transport
    });
  } catch (error) {
    stderr.write(`${readErrorMessage(error)}\n`);
    stdout.write(`${JSON.stringify({
      ...createCliOutput(invocation, { generatedAt }),
      result: "error",
      error: readErrorMessage(error)
    }, null, 2)}\n`);
    return 1;
  }

  if (invocation.json) {
    stdout.write(`${JSON.stringify({
      ...createCliOutput(invocation, { generatedAt }),
      result: "running",
      transport: server.transport,
      tools: server.tools
    }, null, 2)}\n`);
  }

  if (!keepMcpServerAlive || invocation.json) {
    await server.close();
    return 0;
  }

  await waitForMcpShutdown(server);
  return 0;
}

function createMcpProviders({
  rootDir,
  homeDir,
  generatedAt,
  statusReader,
  signatureReader
}: {
  rootDir: string;
  homeDir: string;
  generatedAt?: string;
  statusReader: StatusReader;
  signatureReader: SignatureReader;
}): SkfiyMcpProviders {
  return {
    readStatus: async (input) => {
      const invocation = createMcpStatusInvocation(rootDir, input);
      const statusInput = createStatusReaderInput({
        rootDir,
        homeDir,
        invocation
      });
      const status = withStatusReadiness(await statusReader(statusInput), statusInput);

      return {
        schemaVersion: 1,
        command: "status",
        generatedAt: generatedAt ?? new Date().toISOString(),
        ...status
      };
    },
    readDoctor: async (input) => {
      const invocation = createMcpDoctorInvocation(rootDir, input);
      const statusInput = createStatusReaderInput({
        rootDir,
        homeDir,
        invocation
      });
      const [status, signature] = await Promise.all([
        statusReader(statusInput),
        signatureReader({ appPath: statusInput.appPath })
      ]);

      return {
        schemaVersion: 1,
        command: "doctor",
        generatedAt: generatedAt ?? new Date().toISOString(),
        ...createDoctorOutput({
          status,
          signature,
          statusInput
        })
      };
    }
  };
}

function createMcpStatusInvocation(
  rootDir: string,
  input: SkfiyMcpToolCallInput
): Extract<CliCommandInvocation, { kind: "status" }> {
  return {
    kind: "status",
    path: "status",
    json: true,
    options: {
      extensionIds: input.extensionIds ?? [],
      cliShimPath: path.join(rootDir, "dist", "skfiy"),
      ...(input.dashboardUrl ? { dashboardUrl: input.dashboardUrl } : {})
    }
  };
}

function createMcpDoctorInvocation(
  rootDir: string,
  input: SkfiyMcpToolCallInput
): Extract<CliCommandInvocation, { kind: "doctor" }> {
  return {
    kind: "doctor",
    path: "doctor",
    json: true,
    options: {
      extensionIds: input.extensionIds ?? [],
      cliShimPath: path.join(rootDir, "dist", "skfiy"),
      ...(input.dashboardUrl ? { dashboardUrl: input.dashboardUrl } : {})
    }
  };
}

async function startSkfiyMcpServer(
  input: SkfiyMcpServerStarterInput
): Promise<SkfiyMcpServer> {
  return {
    transport: input.transport,
    tools: [...SKFIY_MCP_TOOL_NAMES],
    close: async () => undefined
  };
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
  return openMacosUrl(url);
}

function openPermissionSettingsUrl(url: string): Promise<void> {
  return openMacosUrl(url);
}

function openMacosUrl(url: string): Promise<void> {
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

async function waitForMcpShutdown(server: SkfiyMcpServer): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void server.close().finally(resolve);
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
    const extensionConnection = await readChromeExtensionConnectionStatus({
      homeDir,
      generatedAt,
      io
    });
    const hostPolicy = await readChromeHostPolicyForStatus({
      rootDir: "",
      homeDir,
      appPath: "",
      helperPath: "",
      cliShimPath: invocation.options.cliShimPath,
      extensionIds: invocation.options.extensionIds
    }, io);
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: false,
      extension: createChromeExtensionAdapterStatus(nativeHost, extensionConnection, hostPolicy),
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

async function runChromeHostPolicyCli({
  invocation,
  generatedAt,
  homeDir,
  io,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome-policy" }>;
  generatedAt?: string;
  homeDir: string;
  io?: ChromeNativeHostIo;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  if (!homeDir) {
    stderr.write("Home directory is required to locate the Chrome host policy state.\n");
    return 2;
  }

  if (invocation.subcommand === "show") {
    const hostPolicy = await readChromeHostPolicyState({
      homeDir,
      io
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: false,
      hostPolicy
    }, null, 2)}\n`);
    return 0;
  }

  if (invocation.subcommand === "reset") {
    const hostPolicy = await resetChromeHostPolicyState({
      homeDir,
      io
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      plannedMutation: true,
      executesSystemMutation: true,
      result: "reset",
      hostPolicy
    }, null, 2)}\n`);
    return 0;
  }

  const host = normalizeChromePolicyHostForCli(invocation.options.host);
  if (!host || !invocation.options.action) {
    stderr.write("Chrome policy set requires --host <host> and --action <always-allow|allow-current-turn|block|ask>.\n");
    return 2;
  }

  const current = await readChromeHostPolicyState({
    homeDir,
    io
  });
  const policy = applyChromeHostPolicyAction(current.policy, {
    action: invocation.options.action,
    host
  });
  const hostPolicy = await writeChromeHostPolicyState({
    homeDir,
    policy,
    io
  });

  stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    plannedMutation: true,
    executesSystemMutation: true,
    result: "configured",
    action: invocation.options.action,
    host,
    hostPolicy
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

function isChromePolicySubcommand(value: string | undefined): value is ChromePolicySubcommand {
  return value === "show" || value === "set" || value === "reset";
}

function normalizeChromePolicySetAction(value: string | undefined): ChromeHostPolicyAction | undefined {
  if (value === "always-allow" || value === "always_allow") {
    return "always_allow";
  }
  if (
    value === "allow-current-turn"
    || value === "allow_current_turn"
    || value === "current-turn"
  ) {
    return "allow_current_turn";
  }
  if (value === "block" || value === "block-host" || value === "block_host") {
    return "block_host";
  }
  if (value === "ask" || value === "ask-host" || value === "ask_host") {
    return "ask_host";
  }

  return undefined;
}

function normalizeChromePolicyHostForCli(value: string | undefined): string | undefined {
  const decision = decideChromeHostPolicy(createDefaultChromeHostPolicy(), value);

  return decision.host || undefined;
}

function isPermissionSettingsTarget(value: string | undefined): value is PermissionSettingsTarget {
  return PERMISSION_SETTINGS_TARGETS.includes(value as PermissionSettingsTarget);
}

function isSmokeTarget(value: string | undefined): value is SmokeTarget {
  return SMOKE_TARGETS.includes(value as SmokeTarget);
}

function createSmokeScriptPath(target: SmokeTarget, rootDir: string): string {
  return path.join(rootDir, ...SMOKE_SCRIPT_FILES[target].split("/"));
}

function createSmokeScriptArgs(target: SmokeTarget, argv: string[], rootDir: string): string[] {
  const args: string[] = [];
  const outputArg = target === "money-run" ? "--json-output" : "--output";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      continue;
    }

    if (arg === "--output") {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        args.push(outputArg);
      } else {
        args.push(outputArg, path.isAbsolute(value) ? value : path.resolve(rootDir, value));
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
