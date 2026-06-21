import path from "node:path";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import { spawn } from "node:child_process";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  startDashboardServer,
  type DashboardServer
} from "./dashboard-server.js";
import {
  createDashboardServerState,
  readDashboardServerState,
  writeDashboardServerState
} from "./dashboard-server-state.js";
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
  createChromeReadinessSetupGuide
} from "./chrome-readiness.js";
import {
  createRuntimeSnapshotStatePath,
  createRuntimeTurnMarkerStatePath,
  RUNTIME_TURN_MARKER_SCHEMA_VERSION
} from "./runtime-snapshot.js";
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
export type DashboardProbeSubcommand = "status" | "snapshot";
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
const RUNTIME_EVIDENCE_RECENT_SECONDS = 300;
const RUNTIME_EVIDENCE_SKEW_SECONDS = 5;

const SYSTEM_SETTINGS_PRIVACY_PANE_URL_PREFIX =
  "x-apple.systempreferences:com.apple.preference.security?";
const MONEY_RUN_SESSION_NAME = "money-run";
const TMUX_TAIL_LINES = 120;
const TMUX_PROBE_TIMEOUT_MS = 1_500;
const TMUX_WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const TMUX_PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";
const CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY = "chrome-extension-page-safety";
const CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY = "chrome-extension-page-control";
const CHROME_PAGE_OBSERVE_MESSAGE_TYPE = "skfiy.page.observe";

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
  capabilities?: string[];
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
      kind: "commands";
      path: "commands" | "help";
      json: boolean;
      options: Record<string, never>;
    }
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
      kind: "operator-status";
      path: "operator status";
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        dashboardUrl?: string;
        requireReady: boolean;
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
      kind: "dashboard-probe";
      path: `dashboard ${DashboardProbeSubcommand}`;
      subcommand: DashboardProbeSubcommand;
      json: boolean;
      options: {
        url: string;
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
    path: "commands",
    summary: "List the packaged skfiy CLI command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "command-surface"
  },
  {
    path: "help",
    summary: "Alias for commands; prints the CLI command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "command-surface"
  },
  {
    path: "status",
    summary: "Report app, helper, permissions, desktop-session, extension, and dashboard status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "status",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "doctor",
    summary: "Return actionable permission and packaging diagnostics.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "doctor",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "operator status",
    summary: "Return a compact read-only readiness summary for operator supervisors.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "operator-status",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
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
    path: "dashboard status",
    summary: "Fetch descriptor, snapshot status, and operator readiness from a running dashboard.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard-status"
  },
  {
    path: "dashboard snapshot",
    summary: "Fetch the full snapshot JSON from a running dashboard.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard-snapshot"
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
    outputShape: "chrome-status",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
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

  if (command === "commands" || command === "help" || command === "--help" || command === "-h") {
    return ok({
      kind: "commands",
      path: command === "help" || command === "--help" || command === "-h" ? "help" : "commands",
      json: argv.includes("--json"),
      options: {}
    });
  }

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

  if (command === "operator") {
    const subcommand = argv[1];

    if (subcommand !== "status") {
      return error(
        "unknown-operator-subcommand",
        `Unknown operator subcommand: ${subcommand ?? ""}`
      );
    }

    return ok({
      kind: "operator-status",
      path: "operator status",
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        dashboardUrl: readOptionValue(argv, "--dashboard-url"),
        requireReady: argv.includes("--require-ready")
      }
    });
  }

  if (command === "dashboard") {
    const subcommand = argv[1];
    if (isDashboardProbeSubcommand(subcommand)) {
      const url = readOptionValue(argv, "--url") ?? readOptionValue(argv, "--dashboard-url");

      if (!url || url.startsWith("--")) {
        return error(
          "missing-dashboard-url",
          `Dashboard ${subcommand} requires --url <url>.`
        );
      }

      return ok({
        kind: "dashboard-probe",
        path: `dashboard ${subcommand}`,
        subcommand,
        json: argv.includes("--json"),
        options: {
          url
        }
      });
    }

    if (subcommand && !subcommand.startsWith("--")) {
      return error(
        "unknown-dashboard-subcommand",
        `Unknown dashboard subcommand: ${subcommand}`
      );
    }

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

  if (invocation.kind === "commands") {
    const surface = createCliCommandSurface();

    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      result: "available",
      commandCount: surface.commands.length,
      surface
    };
  }

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
      extension: createChromeExtensionStatusWithPageCapabilities({
        state: "unknown"
      }, {
        nativeHost: {
          state: "unknown",
          cliShimPath: invocation.options.cliShimPath,
          extensionIds: invocation.options.extensionIds
        },
        context: invocation.options
      }),
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
      capabilities: {
        chromeExtensionPageSafety: false,
        chromeExtensionPageControl: false
      },
      statusProbe: {
        extensionIds: invocation.options.extensionIds,
        dashboardUrl: invocation.options.dashboardUrl,
        capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
      }
    };
  }

  if (invocation.kind === "operator-status") {
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
      extension: createChromeExtensionStatusWithPageCapabilities({
        state: "unknown"
      }, {
        nativeHost: {
          state: "unknown",
          cliShimPath: invocation.options.cliShimPath,
          extensionIds: invocation.options.extensionIds
        },
        context: invocation.options
      }),
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

    return createOperatorStatusOutput({
      invocation,
      generatedAt,
      status: withStatusReadiness(status, invocation.options),
      result: "not-run"
    });
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

  if (invocation.kind === "dashboard-probe") {
    return createDashboardProbeNotRunOutput({
      invocation,
      generatedAt
    });
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
        extension: createChromeExtensionStatusWithPageCapabilities({
          state: "unknown"
        }, {
          nativeHost: {
            state: "unknown",
            cliShimPath: invocation.options.cliShimPath,
            extensionIds: invocation.options.extensionIds
          },
          context: invocation.options
        }),
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

function createDashboardProbeNotRunOutput({
  invocation,
  generatedAt
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }>;
  generatedAt: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: invocation.path,
    generatedAt,
    executesSystemMutation: false,
    result: "not-run",
    url: sanitizeDashboardUrlForOutput(invocation.options.url),
    endpoints: createDashboardProbeEndpoints(invocation.options.url),
    fetch: {
      descriptor: { state: "unknown" },
      snapshot: { state: "unknown" },
      operatorEvidence: { state: "unknown" }
    },
    descriptor: { state: "unknown" },
    snapshot: { state: "unknown" },
    operatorEvidence: { state: "unknown" },
    operatorReadiness: { state: "unknown" }
  };
}

async function runDashboardProbeCli({
  invocation,
  generatedAt,
  stdout
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }>;
  generatedAt?: string;
  stdout: SkfiyCliIo;
}): Promise<number> {
  const output = await createDashboardProbeRunOutput({
    invocation,
    generatedAt: generatedAt ?? new Date().toISOString()
  });

  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output.result === "ok" ? 0 : 1;
}

async function createDashboardProbeRunOutput({
  invocation,
  generatedAt
}: {
  invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }>;
  generatedAt: string;
}): Promise<Record<string, unknown>> {
  const baseOutput = createDashboardProbeNotRunOutput({
    invocation,
    generatedAt
  });
  const descriptorUrl = createDashboardDescriptorUrl(invocation.options.url);
  const snapshotUrl = createDashboardSnapshotUrl(invocation.options.url);
  const operatorEvidenceUrl = createDashboardOperatorEvidenceUrl(invocation.options.url);

  if (!descriptorUrl || !snapshotUrl || !operatorEvidenceUrl) {
    return {
      ...baseOutput,
      result: "error",
      error: {
        code: "invalid-dashboard-url",
        message: `Invalid dashboard URL: ${sanitizeSensitiveString(invocation.options.url)}`
      },
      fetch: {
        descriptor: {
          state: "not-probed",
          reason: "Invalid dashboard URL."
        },
        snapshot: {
          state: "not-probed",
          reason: "Invalid dashboard URL."
        },
        operatorEvidence: {
          state: "not-probed",
          reason: "Invalid dashboard URL."
        }
      }
    };
  }

  const [descriptorProbe, snapshotProbe, operatorEvidenceProbe] = await Promise.all([
    fetchDashboardJson(descriptorUrl),
    fetchDashboardJson(snapshotUrl),
    invocation.subcommand === "status"
      ? fetchDashboardJson(operatorEvidenceUrl)
      : Promise.resolve({
          state: "not-requested",
          url: operatorEvidenceUrl,
          reason: "dashboard snapshot returns the full snapshot and does not fetch operator evidence."
        } as Record<string, unknown>)
  ]);
  const descriptorBody = readRecord(descriptorProbe.body);
  const snapshotBody = readRecord(snapshotProbe.body);
  const operatorEvidenceBody = readRecord(operatorEvidenceProbe.body);
  const result = descriptorProbe.state === "reachable"
    && snapshotProbe.state === "reachable"
    && (
      invocation.subcommand === "snapshot"
      || operatorEvidenceProbe.state === "reachable"
    )
    ? "ok"
    : "error";
  const operatorReadiness = sanitizeTokenFree(
    readRecord(snapshotBody?.operatorReadiness) ?? { state: "unknown" }
  );
  const commonOutput = {
    ...baseOutput,
    result,
    fetch: {
      descriptor: createDashboardFetchSummary(descriptorProbe),
      snapshot: createDashboardFetchSummary(snapshotProbe),
      operatorEvidence: createDashboardFetchSummary(operatorEvidenceProbe)
    },
    descriptor: descriptorBody
      ? sanitizeTokenFree(descriptorBody)
      : createDashboardFetchSummary(descriptorProbe),
    operatorEvidence: operatorEvidenceBody
      ? sanitizeTokenFree(operatorEvidenceBody)
      : createDashboardFetchSummary(operatorEvidenceProbe),
    operatorReadiness
  };

  if (invocation.subcommand === "snapshot") {
    return {
      ...commonOutput,
      snapshot: snapshotBody
        ? sanitizeTokenFree(snapshotBody)
        : createDashboardFetchSummary(snapshotProbe)
    };
  }

  return {
    ...commonOutput,
    snapshot: createDashboardStatusSnapshotSummary(snapshotProbe, snapshotBody)
  };
}

function createDashboardStatusSnapshotSummary(
  probe: Record<string, unknown>,
  snapshot: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!snapshot) {
    return createDashboardFetchSummary(probe);
  }

  const runtimeHealth = readRecord(snapshot.runtimeHealth);
  const summary: Record<string, unknown> = {
    ...createDashboardFetchSummary(probe),
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    runtimeHealth: {
      dashboard: readRecord(runtimeHealth?.dashboard) ?? { state: "unknown" },
      cli: readRecord(runtimeHealth?.cli) ?? { state: "unknown" },
      extension: readRecord(runtimeHealth?.extension) ?? { state: "unknown" },
      nativeHost: readRecord(runtimeHealth?.nativeHost) ?? { state: "unknown" }
    },
    operatorReadiness: readRecord(snapshot.operatorReadiness) ?? { state: "unknown" },
    smokeEvidence: readRecord(snapshot.smokeEvidence) ?? { artifacts: [] },
    alerts: Array.isArray(snapshot.alerts) ? snapshot.alerts : []
  };

  return sanitizeTokenFree(summary) as Record<string, unknown>;
}

function createDashboardFetchSummary(probe: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    state: readString(probe.state) ?? "unknown"
  };
  const url = readString(probe.url);
  const reason = readString(probe.reason);

  if (url) {
    summary.url = sanitizeDashboardUrlForOutput(url);
  }
  if (typeof probe.status === "number") {
    summary.status = probe.status;
  }
  if (reason) {
    summary.reason = sanitizeSensitiveString(reason);
  }

  return summary;
}

function createDashboardProbeEndpoints(dashboardUrl: string): Record<string, string> {
  const endpoints: Record<string, string> = {};
  const descriptorUrl = createDashboardDescriptorUrl(dashboardUrl);
  const snapshotUrl = createDashboardSnapshotUrl(dashboardUrl);

  if (descriptorUrl) {
    endpoints.descriptor = sanitizeDashboardUrlForOutput(descriptorUrl);
  }
  if (snapshotUrl) {
    endpoints.snapshot = sanitizeDashboardUrlForOutput(snapshotUrl);
  }
  const operatorEvidenceUrl = createDashboardOperatorEvidenceUrl(dashboardUrl);
  if (operatorEvidenceUrl) {
    endpoints.operatorEvidence = sanitizeDashboardUrlForOutput(operatorEvidenceUrl);
  }

  return endpoints;
}

function sanitizeTokenFree(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTokenFree(item));
  }

  const record = readRecord(value);
  if (record) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(record)) {
      if (item === undefined) {
        continue;
      }
      sanitized[key] = isSensitiveFieldName(key)
        ? "[redacted]"
        : sanitizeTokenFree(item);
    }

    return sanitized;
  }

  return typeof value === "string" ? sanitizeSensitiveString(value) : value;
}

function sanitizeDashboardUrlForOutput(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveFieldName(key)) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return sanitizeSensitiveString(value);
  }
}

function sanitizeSensitiveString(value: string): string {
  return value
    .replace(
      /\b(?:token|access_token|refresh_token|id_token|api_key|authorization|cookie)=([^&\s"']+)/gi,
      "redacted=[redacted]"
    )
    .replace(
      /\b(?:authorization|bearer|basic)\s+[-._~+/=A-Za-z0-9]+/gi,
      "redacted [redacted]"
    );
}

function isSensitiveFieldName(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");

  return new Set([
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "apikey",
    "authorization",
    "cookie",
    "setcookie",
    "secret",
    "clientsecret",
    "password"
  ]).has(normalized);
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
  const effectiveHomeDir = homeDir ?? process.env.HOME ?? "";
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
      homeDir: effectiveHomeDir,
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
      homeDir: effectiveHomeDir,
      statusReader,
      signatureReader,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "operator-status") {
    return runOperatorStatusCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      homeDir: effectiveHomeDir,
      statusReader,
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
      rootDir: normalizedRootDir,
      homeDir: effectiveHomeDir,
      io: chromeNativeHostIo,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "chrome-policy") {
    return runChromeHostPolicyCli({
      invocation: result.invocation,
      generatedAt,
      homeDir: effectiveHomeDir,
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
      homeDir: effectiveHomeDir,
      mcpServerStarter,
      mcpStdin,
      statusReader,
      signatureReader,
      keepMcpServerAlive,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "dashboard-probe") {
    return runDashboardProbeCli({
      invocation: result.invocation,
      generatedAt,
      stdout
    });
  }

  if (result.invocation.kind === "dashboard") {
    const dashboardGeneratedAt = generatedAt ?? new Date().toISOString();
    const dashboard = await dashboardServerStarter({
      port: result.invocation.options.port,
      rootDir: normalizedRootDir
    });
    const descriptor = createDashboardDescriptor({
      port: dashboard.bind.port
    });
    let dashboardStatePath: string | undefined;
    let dashboardStateError: string | undefined;

    if (effectiveHomeDir) {
      try {
        dashboardStatePath = await writeDashboardServerState({
          homeDir: effectiveHomeDir,
          state: createDashboardServerState({
            pid: process.pid,
            url: dashboard.url,
            bind: dashboard.bind,
            startedAt: dashboardGeneratedAt,
            rootDir: normalizedRootDir
          })
        });
      } catch (error) {
        dashboardStateError = readErrorMessage(error);
      }
    } else {
      dashboardStateError = "Home directory is required to record dashboard server state.";
    }

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: dashboardGeneratedAt,
      serverPid: process.pid,
      bind: descriptor.bind,
      url: descriptor.url,
      ...(dashboardStatePath ? { statePath: dashboardStatePath } : {}),
      ...(dashboardStateError ? { stateWriteError: dashboardStateError } : {}),
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
    const effectiveGeneratedAt = generatedAt ?? new Date().toISOString();
    const status = withCliStatusEvidence(
      withStatusReadiness(await statusReader(input), input),
      {
        ...input,
        generatedAt: effectiveGeneratedAt
      }
    );
    const output = {
      schemaVersion: 1,
      command: "status",
      generatedAt: effectiveGeneratedAt,
      ...status
    };

    stdout.write(invocation.json
      ? `${JSON.stringify(output, null, 2)}\n`
      : formatStatusTextOutput(output));
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

async function runOperatorStatusCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  statusReader,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "operator-status" }>;
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
    const output = createOperatorStatusOutput({
      invocation,
      generatedAt: generatedAt ?? new Date().toISOString(),
      status,
      result: "probed"
    });

    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return invocation.options.requireReady && output.result !== "ready" ? 1 : 0;
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
  invocation: Extract<CliCommandInvocation, { kind: "status" | "doctor" | "operator-status" }>;
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
  const statusWithCapabilities = withFinderSmokeStatus(
    withChromePageCapabilityStatus(status, statusInput),
    statusInput
  );
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
  const app = readRecord(statusWithCapabilities.app);
  const cli = readRecord(statusWithCapabilities.cli);
  const helper = readRecord(statusWithCapabilities.helper);
  const permissions = readRecord(statusWithCapabilities.permissions);
  const desktopSession = readRecord(statusWithCapabilities.desktopSession);
  const extension = readRecord(statusWithCapabilities.extension);
  const nativeHost = readRecord(statusWithCapabilities.nativeHost);
  const dashboard = readRecord(statusWithCapabilities.dashboard);
  const finder = readRecord(statusWithCapabilities.finder);
  const latestFinderSmoke = readRecord(finder?.latestSmoke) ?? readLatestFinderSmokeEvidence(statusInput.rootDir);
  const finderAutomation = readRecord(finder?.automation);
  const finderAutomationState =
    readString(finderAutomation?.state)
    ?? createFinderAutomationState(readString(permissions?.finderAutomation), latestFinderSmoke);
  const pageSafety = readRecord(extension?.pageSafety);
  const pageControl = readRecord(extension?.pageControl);
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

  if (permissions?.finderAutomation !== "granted" && finderAutomationState !== "proven-by-smoke") {
    if (isFinderSmokeDesktopPreflightBlocked(latestFinderSmoke)) {
      addDiagnostic({
        code: "finder-automation-unproven",
        severity: "info",
        message: createFinderDesktopPreflightDiagnosticMessage(latestFinderSmoke),
        nextAction: readString(latestFinderSmoke.nextAction) ?? createFinderSmokeRerunAction(),
        details: {
          latestFinderSmoke
        }
      });
    } else if (readString(latestFinderSmoke.automationEvidence) === "blocked") {
      addDiagnostic({
        code: "finder-automation-permission",
        severity: "warning",
        message: createFinderAutomationPermissionDiagnosticMessage(latestFinderSmoke),
        nextAction: "Open System Settings > Privacy & Security > Automation and grant skfiy permission to control Finder, then rerun the Finder smoke.",
        details: {
          latestFinderSmoke
        }
      });
    } else {
      addDiagnostic({
        code: "finder-automation-unknown",
        severity: "info",
        message: "Finder Automation has not been proven from CLI status yet.",
        nextAction: "Run a Finder smoke once and grant Finder Automation when macOS prompts."
      });
    }
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

  if (pageControl?.state !== "ready") {
    addDiagnostic({
      code: "chrome-page-control-readiness",
      severity: pageControl?.state === "not-probed" ? "info" : "warning",
      message: readString(pageControl?.reason)
        ?? "Chrome extension page control readiness has not been proven.",
      nextAction: readString(pageControl?.nextAction)
        ?? createChromePageControlNextAction({
          state: readString(pageControl?.state) ?? "not-probed",
          extensionIds: statusInput.extensionIds
        }),
      details: {
        state: readString(pageControl?.state) ?? "not-probed",
        source: readString(pageControl?.source) ?? "not-probed"
      }
    });
  }

  const readiness = createStatusReadinessSummary(statusWithCapabilities, statusInput);

  return {
    result: diagnostics.length === 0 ? "ok" : "needs-action",
    capabilities: {
      chromeExtensionPageSafety: pageSafety?.capable === true,
      chromeExtensionPageControl: pageControl?.state === "ready"
    },
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
        hostPolicy,
        pageSafety: pageSafety ?? createChromePageSafetyCapability({
          extensionState: "unknown",
          nativeHostState: readString(nativeHost?.state) ?? "unknown",
          liveConnection: "unknown",
          extensionIds: statusInput.extensionIds,
          cliShimPath: statusInput.cliShimPath,
          hostPolicy
        }),
        pageControl: pageControl ?? createChromePageControlCapability({
          extensionState: "unknown",
          nativeHostState: readString(nativeHost?.state) ?? "unknown",
          liveConnection: "unknown",
          extensionIds: statusInput.extensionIds
        })
      },
      finder: {
        automation: finderAutomation ?? {
          state: finderAutomationState,
          permissionState: readString(permissions?.finderAutomation) ?? "unknown",
          evidence: readString(latestFinderSmoke.automationEvidence) ?? "unknown"
        },
        latestSmoke: latestFinderSmoke
      }
    },
    diagnostics,
    nextActions,
    status: withStatusReadiness(statusWithCapabilities, statusInput),
    signature
  };
}

function createOperatorStatusOutput({
  invocation,
  generatedAt,
  status,
  result
}: {
  invocation: Extract<CliCommandInvocation, { kind: "operator-status" }>;
  generatedAt: string;
  status: Record<string, unknown>;
  result: "not-run" | "probed";
}): Record<string, unknown> {
  const readiness = readRecord(status.readiness)
    ?? createStatusReadinessSummary(status, invocation.options);
  const checks = readRecord(readiness.checks);
  const readinessState = readString(readiness.state) ?? "unknown";
  const effectiveResult = result === "not-run"
    ? "not-run"
    : readinessState === "ready"
      ? "ready"
      : readinessState === "unknown"
        ? "unknown"
        : "needs-action";
  const output = {
    schemaVersion: 1,
    command: "operator status",
    generatedAt,
    result: effectiveResult,
    ready: effectiveResult === "ready",
    requireReady: invocation.options.requireReady,
    executesSystemMutation: false,
    outputPolicy: {
      tokenFree: true,
      stableForAutomation: true,
      source: "status-reader-summary"
    },
    targets: {
      runtime: readRecord(checks?.runtime) ?? { state: "unknown", ready: false },
      dashboard: readRecord(checks?.dashboard) ?? { state: "unknown", ready: false },
      plugin: createOperatorPluginStatus(status, invocation.options.cliShimPath),
      extension: readRecord(checks?.extension) ?? { state: "unknown", ready: false },
      moneyRun: readRecord(checks?.moneyRun) ?? { state: "unknown", ready: false }
    },
    readiness,
    blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
    supervision: {
      mode: "read-only-status",
      tmuxBackendRequired: false,
      exitOnNotReady: invocation.options.requireReady,
      recommendedReadOnlyCommands: createOperatorReadOnlyCommands(invocation)
    }
  };

  return sanitizeTokenFree(output) as Record<string, unknown>;
}

function createOperatorPluginStatus(
  status: Record<string, unknown>,
  cliShimPath: string
): Record<string, unknown> {
  const cli = readRecord(status.cli);
  const cliState = readString(cli?.state) ?? "unknown";
  const state = cliState === "installed"
    ? "available"
    : cliState === "unknown"
      ? "unknown"
      : "needs-action";
  const blockers = state === "needs-action"
    ? [{
        code: "plugin-cli-not-installed",
        message: "Codex plugin MCP adapter requires the packaged skfiy CLI.",
        state: cliState,
        expected: "installed"
      }]
    : [];

  return {
    state,
    ready: state === "available",
    adapter: "codex-plugin-mcp",
    transport: "stdio",
    command: "skfiy mcp serve --stdio",
    cliShimPath,
    tools: [...SKFIY_MCP_TOOL_NAMES],
    blockers
  };
}

function createOperatorReadOnlyCommands(
  invocation: Extract<CliCommandInvocation, { kind: "operator-status" }>
): Array<Record<string, unknown>> {
  const statusArgs = createStatusLikeArgs("status", invocation.options);
  const doctorArgs = createStatusLikeArgs("doctor", invocation.options);
  const commands: Array<Record<string, unknown>> = [
    {
      id: "status",
      command: "skfiy",
      args: statusArgs
    },
    {
      id: "doctor",
      command: "skfiy",
      args: doctorArgs
    },
    {
      id: "plugin-mcp",
      command: "skfiy",
      args: ["mcp", "serve", "--stdio", "--json"]
    }
  ];

  if (invocation.options.dashboardUrl) {
    commands.push({
      id: "dashboard-status",
      command: "skfiy",
      args: [
        "dashboard",
        "status",
        "--json",
        "--url",
        sanitizeDashboardUrlForOutput(invocation.options.dashboardUrl)
      ]
    });
  }

  if (invocation.options.extensionIds.length > 0) {
    commands.push({
      id: "chrome-status",
      command: "skfiy",
      args: [
        "chrome",
        "status",
        "--json",
        ...invocation.options.extensionIds.flatMap((extensionId) => ["--extension-id", extensionId])
      ]
    });
  }

  return commands;
}

function createStatusLikeArgs(
  command: "status" | "doctor",
  options: {
    extensionIds: string[];
    dashboardUrl?: string;
  }
): string[] {
  return [
    command,
    "--json",
    ...options.extensionIds.flatMap((extensionId) => ["--extension-id", extensionId]),
    ...(options.dashboardUrl
      ? ["--dashboard-url", sanitizeDashboardUrlForOutput(options.dashboardUrl)]
      : [])
  ];
}

function withStatusReadiness<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: {
    rootDir?: string;
    extensionIds: string[];
    dashboardUrl?: string;
    cliShimPath?: string;
  }
): TStatus & { readiness: Record<string, unknown> } {
  const statusWithCapabilities = withChromePageCapabilityStatus(status, context);
  const statusWithEvidence = context.rootDir
    ? withFinderSmokeStatus(statusWithCapabilities, { rootDir: context.rootDir })
    : statusWithCapabilities;

  return {
    ...statusWithEvidence,
    readiness: createStatusReadinessSummary(statusWithEvidence, context)
  };
}

function withCliStatusEvidence<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: {
    rootDir: string;
    homeDir: string;
    appPath: string;
    helperPath: string;
    cliShimPath: string;
    extensionIds: string[];
    generatedAt: string;
  }
): TStatus & { evidence: Record<string, unknown>; runtimeSnapshot: Record<string, unknown> } {
  const evidence = createCliStatusEvidence(status, context);
  const runtimeSnapshot = readRecord(evidence.runtimeSnapshot) ?? {
    state: "unknown",
    reason: "CLI status evidence did not include runtime snapshot details."
  };

  return {
    ...status,
    evidence,
    runtimeSnapshot
  };
}

function createCliStatusEvidence(
  status: Record<string, unknown>,
  context: {
    rootDir: string;
    homeDir: string;
    appPath: string;
    helperPath: string;
    cliShimPath: string;
    extensionIds: string[];
    generatedAt: string;
  }
): Record<string, unknown> {
  const extension = readRecord(status.extension);
  const runtimeSnapshot = readRuntimeSnapshotEvidence(context.homeDir, context.generatedAt);
  const dashboardSmoke = readLatestDashboardSmokeEvidence(context.rootDir, context.generatedAt);

  return {
    schemaVersion: 1,
    source: "skfiy-status-local-evidence",
    binaryReadiness: createBinaryReadinessEvidence(status, context),
    extensionPageControl: readRecord(extension?.pageControl)
      ?? createChromePageControlCapability({
        extensionState: "unknown",
        nativeHostState: "unknown",
        liveConnection: "unknown",
        extensionIds: context.extensionIds
      }),
    runtimeSnapshot,
    currentTurn: runtimeSnapshot.currentTurn,
    dashboardSmoke
  };
}

function createBinaryReadinessEvidence(
  status: Record<string, unknown>,
  context: {
    appPath: string;
    helperPath: string;
    cliShimPath: string;
  }
): Record<string, unknown> {
  const app = readRecord(status.app);
  const cli = readRecord(status.cli);
  const helper = readRecord(status.helper);
  const appState = readString(app?.state) ?? "unknown";
  const cliState = readString(cli?.state) ?? "unknown";
  const helperState = readString(helper?.state) ?? "unknown";
  const ready = appState === "installed"
    && cliState === "installed"
    && helperState === "installed";

  return {
    state: ready
      ? "ready"
      : [appState, cliState, helperState].every((state) => state === "unknown")
        ? "unknown"
        : "needs-action",
    ready,
    app: {
      state: appState,
      path: readString(app?.path) ?? context.appPath
    },
    cli: {
      state: cliState,
      path: readString(cli?.path) ?? context.cliShimPath
    },
    helper: {
      state: helperState,
      path: readString(helper?.path) ?? context.helperPath
    }
  };
}

function readRuntimeSnapshotEvidence(homeDir: string, generatedAt: string): Record<string, unknown> {
  if (!homeDir) {
    return {
      state: "not-probed",
      currentTurn: {
        state: "unknown",
        source: "runtime-snapshot"
      },
      reason: "Home directory is required to locate the runtime snapshot."
    };
  }

  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  const turnMarker = readRuntimeTurnMarkerEvidence(homeDir, generatedAt);
  if (!existsSync(snapshotPath)) {
    const markerState = readString(turnMarker?.state);
    if (markerState === "recent" || markerState === "stale") {
      const state = markerState === "recent" ? "missing-after-turn" : "stale-after-turn";
      const emptyReasonCode = state === "missing-after-turn"
        ? "runtime-snapshot-missing-after-turn"
        : "runtime-snapshot-stale-after-turn";
      const reason = markerState === "recent"
        ? "Runtime snapshot is missing even though a recent runtime turn marker exists."
        : "Runtime snapshot is missing and the last runtime turn marker is stale.";
      const currentTurn = readRecord(turnMarker?.currentTurn);

      return compactRecord({
        state,
        path: snapshotPath,
        marker: turnMarker,
        markerPath: readString(turnMarker?.path),
        markerObservedAt: readString(turnMarker?.observedAt),
        markerAgeSeconds: readNumber(turnMarker?.ageSeconds),
        emptyReasonCode,
        reason,
        currentTurn: {
          ...(currentTurn ?? {
            state: "unknown",
            source: "runtime-turn-marker"
          }),
          emptyReasonCode,
          reason
        },
        replay: {
          state: "empty",
          source: "runtime-snapshot",
          emptyReasonCode,
          reason
        }
      });
    }

    return {
      state: "missing",
      path: snapshotPath,
      freshInstall: true,
      emptyReasonCode: "runtime-snapshot-missing",
      reason: "Runtime snapshot has not been recorded yet.",
      currentTurn: {
        state: "idle",
        source: "runtime-snapshot",
        freshInstall: true,
        emptyReasonCode: "runtime-snapshot-missing"
      },
      replay: {
        state: "empty",
        source: "runtime-snapshot",
        freshInstall: true,
        emptyReasonCode: "runtime-snapshot-missing"
      }
    };
  }

  try {
    const parsed = readRecord(JSON.parse(readFileSync(snapshotPath, "utf8")));
    const currentTurn = readRecord(parsed?.currentTurn);
    const replay = readRecord(parsed?.replay);

    if (parsed?.schemaVersion !== 1 || !currentTurn || !replay) {
      return {
        state: "invalid",
        path: snapshotPath,
        currentTurn: {
          state: "unknown",
          source: "runtime-snapshot"
        },
        reason: "Runtime snapshot is not a valid skfiy snapshot."
      };
    }

    const observedAt = readString(parsed.observedAt);
    const ageSeconds = readObservedAgeSeconds(observedAt, generatedAt);
    const staleByAge = ageSeconds !== undefined && ageSeconds > RUNTIME_EVIDENCE_RECENT_SECONDS;
    const staleByMarker = isRuntimeMarkerNewerThanSnapshot(turnMarker, observedAt);
    const state = staleByAge || staleByMarker ? "stale-after-turn" : "available";

    return compactRecord({
      state,
      path: snapshotPath,
      observedAt,
      ageSeconds,
      marker: turnMarker,
      markerPath: readString(turnMarker?.path),
      markerObservedAt: readString(turnMarker?.observedAt),
      markerAgeSeconds: readNumber(turnMarker?.ageSeconds),
      reason: state === "stale-after-turn"
        ? "Runtime snapshot is older than the latest runtime turn evidence."
        : undefined,
      currentTurn: summarizeRuntimeCurrentTurn(currentTurn),
      replay: summarizeRuntimeReplay(replay)
    });
  } catch (error) {
    return {
      state: "invalid",
      path: snapshotPath,
      currentTurn: {
        state: "unknown",
        source: "runtime-snapshot"
      },
      reason: readErrorMessage(error)
    };
  }
}

function readRuntimeTurnMarkerEvidence(
  homeDir: string,
  generatedAt: string
): Record<string, unknown> | undefined {
  const markerPath = createRuntimeTurnMarkerStatePath(homeDir);
  if (!existsSync(markerPath)) {
    return undefined;
  }

  try {
    const parsed = readRecord(JSON.parse(readFileSync(markerPath, "utf8")));
    if (!parsed) {
      return {
        state: "invalid",
        path: markerPath,
        reason: "Runtime turn marker is not a JSON object."
      };
    }
    if (parsed.schemaVersion !== RUNTIME_TURN_MARKER_SCHEMA_VERSION) {
      return {
        state: "invalid",
        path: markerPath,
        reason: "Runtime turn marker is not a valid skfiy marker."
      };
    }

    const stat = statSync(markerPath);
    const observedAt =
      readString(parsed.observedAt)
      ?? readString(parsed.updatedAt)
      ?? readString(parsed.lastTurnAt);
    const ageSeconds =
      readObservedAgeSeconds(observedAt, generatedAt)
      ?? readArtifactAgeSeconds(stat.mtimeMs, generatedAt);
    const currentTurn = summarizeRuntimeTurnMarkerCurrentTurn(parsed);
    const recent = ageSeconds !== undefined && ageSeconds <= RUNTIME_EVIDENCE_RECENT_SECONDS;

    return compactRecord({
      state: recent ? "recent" : "stale",
      path: markerPath,
      observedAt,
      mtimeMs: stat.mtimeMs,
      ageSeconds,
      recent,
      currentTurn
    });
  } catch (error) {
    return {
      state: "invalid",
      path: markerPath,
      reason: readErrorMessage(error)
    };
  }
}

function summarizeRuntimeTurnMarkerCurrentTurn(marker: Record<string, unknown>): Record<string, unknown> {
  const nestedTurn =
    readRecord(marker.currentTurn)
    ?? readRecord(marker.turn)
    ?? readRecord(marker.event)
    ?? marker;
  const state = readString(nestedTurn.state) ?? readString(nestedTurn.status) ?? "unknown";
  const latestMessage = readString(nestedTurn.latestMessage) ?? readString(nestedTurn.message);

  return summarizeRuntimeCurrentTurn({
    ...nestedTurn,
    state,
    source: "runtime-turn-marker",
    ...(latestMessage ? { latestMessage } : {})
  });
}

function isRuntimeMarkerNewerThanSnapshot(
  marker: Record<string, unknown> | undefined,
  snapshotObservedAt: string | undefined
): boolean {
  const markerObservedAt = readString(marker?.observedAt);
  if (readString(marker?.state) !== "recent" || !markerObservedAt || !snapshotObservedAt) {
    return false;
  }

  const markerMs = Date.parse(markerObservedAt);
  const snapshotMs = Date.parse(snapshotObservedAt);
  if (!Number.isFinite(markerMs) || !Number.isFinite(snapshotMs)) {
    return false;
  }

  return markerMs - snapshotMs > RUNTIME_EVIDENCE_SKEW_SECONDS * 1000;
}

function summarizeRuntimeCurrentTurn(currentTurn: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    state: readString(currentTurn.state) ?? "unknown",
    source: readString(currentTurn.source) ?? "runtime-snapshot",
    command: sanitizeStatusEvidenceString(readString(currentTurn.command)),
    targetApp: sanitizeStatusEvidenceString(readString(currentTurn.targetApp)),
    targetBundleId: readString(currentTurn.targetBundleId),
    risk: readString(currentTurn.risk),
    approvalRequired: readBoolean(currentTurn.approvalRequired),
    approvalState: readString(currentTurn.approvalState),
    stopState: readString(currentTurn.stopState),
    updateSource: readString(currentTurn.updateSource),
    latestMessage: sanitizeStatusEvidenceString(readString(currentTurn.latestMessage)),
    latestAction: summarizeNamedStatusRecord(readRecord(currentTurn.latestAction), ["type", "action", "stage", "status"]),
    latestVerification: summarizeNamedStatusRecord(readRecord(currentTurn.latestVerification), ["actionType", "status", "message", "reason"]),
    latestScreenshot: summarizeNamedStatusRecord(readRecord(currentTurn.latestScreenshot), ["stage", "bundleId", "recommendation", "sourceCount"])
  });
}

function summarizeRuntimeReplay(replay: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({
    state: readString(replay.state) ?? "unknown",
    source: readString(replay.source) ?? "runtime-snapshot",
    outcome: readString(replay.outcome),
    screenshotCount: readNumber(replay.screenshotCount),
    actionCount: readNumber(replay.actionCount),
    verificationCount: readNumber(replay.verificationCount),
    timelineCount: readNumber(replay.timelineCount),
    latestMessage: sanitizeStatusEvidenceString(readString(replay.latestMessage))
  });
}

function summarizeNamedStatusRecord(
  record: Record<string, unknown> | undefined,
  keys: string[]
): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  const summary: Record<string, unknown> = {};
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      summary[key] = sanitizeStatusEvidenceString(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readLatestDashboardSmokeEvidence(
  rootDir: string,
  generatedAt: string
): Record<string, unknown> {
  const smokeDir = path.join(rootDir, ".skfiy-smoke");

  if (!existsSync(smokeDir)) {
    return {
      state: "missing",
      directory: smokeDir,
      reason: "No dashboard smoke artifact has been collected yet."
    };
  }

  const candidates: Array<{
    artifact: Record<string, unknown>;
    filePath: string;
    mtimeMs: number;
  }> = [];

  try {
    for (const entry of readdirSync(smokeDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(smokeDir, entry.name);
      const artifact = readSmokeArtifactFile(filePath);

      if (!artifact || !isDashboardSmokeArtifact(entry.name, artifact)) {
        continue;
      }

      candidates.push({
        artifact,
        filePath,
        mtimeMs: statSync(filePath).mtimeMs
      });
    }
  } catch (error) {
    return {
      state: "unavailable",
      directory: smokeDir,
      reason: readErrorMessage(error)
    };
  }

  const latest = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!latest) {
    return {
      state: "missing",
      directory: smokeDir,
      reason: "No dashboard smoke artifact has been collected yet."
    };
  }

  return createDashboardSmokeEvidenceSummary(latest, generatedAt);
}

function isDashboardSmokeArtifact(fileName: string, artifact: Record<string, unknown>): boolean {
  return fileName.startsWith("dashboard") || readString(artifact.target) === "dashboard";
}

function createDashboardSmokeEvidenceSummary(
  latest: {
    artifact: Record<string, unknown>;
    filePath: string;
    mtimeMs: number;
  },
  generatedAt: string
): Record<string, unknown> {
  const snapshot = readRecord(readRecord(latest.artifact.snapshotResponse)?.body);
  const runtimeSnapshot = readRecord(readRecord(snapshot?.runtimeHealth)?.runtimeSnapshot);
  const smokeEvidence = readRecord(snapshot?.smokeEvidence);
  const artifacts = Array.isArray(smokeEvidence?.artifacts)
    ? smokeEvidence.artifacts.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
  const ageSeconds = readArtifactAgeSeconds(latest.mtimeMs, generatedAt);
  const result = readString(latest.artifact.result) ?? "unknown";

  return compactRecord({
    state: result,
    result,
    path: latest.filePath,
    timestamp: readString(latest.artifact.timestamp),
    productPath: readString(latest.artifact.productPath),
    mtimeMs: latest.mtimeMs,
    ageSeconds,
    runtimeSnapshotCoverage: summarizeNamedStatusRecord(
      readRecord(latest.artifact.runtimeSnapshotCoverage),
      ["result", "reason"]
    ),
    dashboardSnapshot: compactRecord({
      state: readString(readRecord(snapshot?.runtimeHealth)?.dashboard ? "available" : undefined),
      runtimeSnapshotState: readString(runtimeSnapshot?.state),
      currentTurn: summarizeRuntimeCurrentTurn(readRecord(snapshot?.currentTurn) ?? {}),
      replay: summarizeRuntimeReplay(readRecord(snapshot?.replay) ?? {}),
      smokeTargets: artifacts.map((artifact) => readString(artifact.target)).filter(Boolean),
      alertCount: Array.isArray(snapshot?.alerts) ? snapshot.alerts.length : undefined
    })
  });
}

function readArtifactAgeSeconds(mtimeMs: number, generatedAt: string): number | undefined {
  const generatedAtMs = Date.parse(generatedAt);

  return Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((generatedAtMs - mtimeMs) / 1000))
    : undefined;
}

function readObservedAgeSeconds(observedAt: string | undefined, generatedAt: string): number | undefined {
  if (!observedAt) {
    return undefined;
  }

  const observedAtMs = Date.parse(observedAt);
  const generatedAtMs = Date.parse(generatedAt);

  return Number.isFinite(observedAtMs) && Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.round((generatedAtMs - observedAtMs) / 1000))
    : undefined;
}

function sanitizeStatusEvidenceString(value: string | undefined): string | undefined {
  return value ? sanitizeSensitiveString(value) : undefined;
}

function formatStatusTextOutput(output: Record<string, unknown>): string {
  const evidence = readRecord(output.evidence);
  const readiness = readRecord(output.readiness);
  const binary = readRecord(evidence?.binaryReadiness);
  const pageControl = readRecord(evidence?.extensionPageControl);
  const runtimeSnapshot = readRecord(evidence?.runtimeSnapshot);
  const currentTurn = readRecord(evidence?.currentTurn);
  const dashboardSmoke = readRecord(evidence?.dashboardSmoke);
  const lines = [
    "skfiy status",
    `readiness: ${readString(readiness?.state) ?? "unknown"}`,
    `binary: ${formatBinaryReadinessText(binary)}`,
    `extension page control: ${formatPageControlText(pageControl)}`,
    `runtime-snapshot: ${formatRuntimeSnapshotText(runtimeSnapshot)}`,
    `current-turn: ${formatCurrentTurnText(currentTurn)}`,
    `dashboard smoke: ${formatDashboardSmokeText(dashboardSmoke)}`
  ];

  return `${lines.join("\n")}\n`;
}

function formatBinaryReadinessText(binary: Record<string, unknown> | undefined): string {
  const app = readRecord(binary?.app);
  const cli = readRecord(binary?.cli);
  const helper = readRecord(binary?.helper);

  return `state=${readString(binary?.state) ?? "unknown"} app=${readString(app?.state) ?? "unknown"} cli=${readString(cli?.state) ?? "unknown"} helper=${readString(helper?.state) ?? "unknown"}`;
}

function formatPageControlText(pageControl: Record<string, unknown> | undefined): string {
  return `state=${readString(pageControl?.state) ?? "unknown"} source=${readString(pageControl?.source) ?? "unknown"}`;
}

function formatRuntimeSnapshotText(runtimeSnapshot: Record<string, unknown> | undefined): string {
  const ageSeconds = readNumber(runtimeSnapshot?.ageSeconds);
  const markerAgeSeconds = readNumber(runtimeSnapshot?.markerAgeSeconds);
  const parts = [
    readString(runtimeSnapshot?.state) ?? "unknown",
    ageSeconds !== undefined ? `age=${ageSeconds}s` : undefined,
    markerAgeSeconds !== undefined ? `marker-age=${markerAgeSeconds}s` : undefined,
    readString(runtimeSnapshot?.path) ? `path=${readString(runtimeSnapshot?.path)}` : undefined,
    readString(runtimeSnapshot?.markerPath) ? `marker=${readString(runtimeSnapshot?.markerPath)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}

function formatCurrentTurnText(currentTurn: Record<string, unknown> | undefined): string {
  const command = readString(currentTurn?.command);
  const targetApp = readString(currentTurn?.targetApp);
  const latestMessage = readString(currentTurn?.latestMessage);
  const parts = [
    readString(currentTurn?.state) ?? "unknown",
    targetApp ? `target=${targetApp}` : undefined,
    readString(currentTurn?.approvalState) ? `approval=${readString(currentTurn?.approvalState)}` : undefined,
    readString(currentTurn?.stopState) ? `stop=${readString(currentTurn?.stopState)}` : undefined,
    readString(currentTurn?.updateSource) ? `source=${readString(currentTurn?.updateSource)}` : undefined,
    command ? `command=${JSON.stringify(command)}` : undefined,
    latestMessage ? `message=${JSON.stringify(latestMessage)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}

function formatDashboardSmokeText(dashboardSmoke: Record<string, unknown> | undefined): string {
  const parts = [
    `state=${readString(dashboardSmoke?.state) ?? "missing"}`,
    readString(dashboardSmoke?.path) ? `path=${readString(dashboardSmoke?.path)}` : undefined
  ].filter(Boolean);

  return parts.join(" ");
}

function withFinderSmokeStatus<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: { rootDir: string }
): TStatus & { finder: Record<string, unknown> } {
  const permissions = readRecord(status.permissions);
  const finder = readRecord(status.finder);
  const existingLatestSmoke = readRecord(finder?.latestSmoke);
  const latestSmoke = existingLatestSmoke ?? readLatestFinderSmokeEvidence(context.rootDir);
  const existingAutomation = readRecord(finder?.automation);
  const permissionState =
    readString(existingAutomation?.permissionState)
    ?? readString(permissions?.finderAutomation)
    ?? "unknown";
  const evidence = readString(latestSmoke.automationEvidence) ?? "unknown";

  return {
    ...status,
    finder: {
      ...finder,
      automation: {
        ...existingAutomation,
        state: readString(existingAutomation?.state)
          ?? createFinderAutomationState(permissionState, latestSmoke),
        permissionState,
        evidence
      },
      latestSmoke
    }
  };
}

function withChromePageCapabilityStatus<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: {
    extensionIds: string[];
    cliShimPath?: string;
  }
): TStatus {
  const extension = readRecord(status.extension);
  const nativeHost = readRecord(status.nativeHost);

  return {
    ...status,
    extension: createChromeExtensionStatusWithPageCapabilities(
      extension ?? { state: "unknown" },
      {
        nativeHost,
        context
      }
    )
  };
}

function readLatestFinderSmokeEvidence(rootDir: string): Record<string, unknown> {
  const smokeDir = path.join(rootDir, ".skfiy-smoke");

  if (!existsSync(smokeDir)) {
    return {
      state: "missing",
      automationEvidence: "unknown",
      directory: smokeDir,
      reason: "No Finder smoke artifact has been collected yet."
    };
  }

  const candidates: Array<{
    artifact: Record<string, unknown>;
    filePath: string;
    mtimeMs: number;
  }> = [];

  try {
    for (const entry of readdirSync(smokeDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(smokeDir, entry.name);
      const artifact = readSmokeArtifactFile(filePath);

      if (!artifact || !isFinderSmokeArtifact(entry.name, artifact)) {
        continue;
      }

      candidates.push({
        artifact,
        filePath,
        mtimeMs: statSync(filePath).mtimeMs
      });
    }
  } catch (error) {
    return {
      state: "unavailable",
      automationEvidence: "unknown",
      directory: smokeDir,
      reason: readErrorMessage(error)
    };
  }

  const latest = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!latest) {
    return {
      state: "missing",
      automationEvidence: "unknown",
      directory: smokeDir,
      reason: "No Finder smoke artifact has been collected yet."
    };
  }

  return createFinderSmokeEvidenceSummary(latest);
}

function readSmokeArtifactFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return readRecord(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

function isFinderSmokeArtifact(fileName: string, artifact: Record<string, unknown>): boolean {
  return fileName.startsWith("finder") || readString(artifact.target) === "finder";
}

function createFinderSmokeEvidenceSummary({
  artifact,
  filePath,
  mtimeMs
}: {
  artifact: Record<string, unknown>;
  filePath: string;
  mtimeMs: number;
}): Record<string, unknown> {
  const desktopPreflight = readFinderDesktopPreflightSummary(readRecord(artifact.desktopPreflight));
  const finderObservation = readFinderStepSummary(readRecord(artifact.finderObservation));
  const finderSemanticObservation = readFinderStepSummary(readRecord(artifact.finderSemanticObservation));
  const finderItemDragDrop = readFinderStepSummary(readRecord(artifact.finderItemDragDrop));
  const result = readString(artifact.result) ?? "unknown";
  const automationEvidence = readFinderAutomationEvidence({
    result,
    desktopPreflight,
    finderObservation,
    finderSemanticObservation,
    finderItemDragDrop
  });
  const state = createFinderSmokeState({ result, automationEvidence, desktopPreflight });

  return compactRecord({
    state,
    result,
    automationEvidence,
    path: filePath,
    mtimeMs,
    timestamp: readString(artifact.timestamp),
    productPath: readString(artifact.productPath),
    desktopPreflight,
    finderObservation,
    finderSemanticObservation,
    finderItemDragDrop,
    nextAction: createFinderSmokeNextAction(state, automationEvidence)
  });
}

function readFinderDesktopPreflightSummary(
  desktopPreflight: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!desktopPreflight) {
    return undefined;
  }

  const frontmost = readRecord(desktopPreflight.frontmost);
  const display = readRecord(desktopPreflight.display);

  return compactRecord({
    result: readString(desktopPreflight.result),
    reason: readString(desktopPreflight.reason),
    controllable: readBoolean(desktopPreflight.controllable),
    frontmostBundleId: readString(frontmost?.bundleId),
    frontmostLocalizedName: readString(frontmost?.localizedName),
    frontmostProcessIdentifier: readNumber(frontmost?.processIdentifier),
    mainDisplayAsleep: readBoolean(display?.mainDisplayAsleep)
  });
}

function readFinderStepSummary(step: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!step) {
    return undefined;
  }

  return compactRecord({
    result: readString(step.result),
    reason: readString(step.reason),
    accessibilityTrusted: readBoolean(step.accessibilityTrusted)
  });
}

function readFinderAutomationEvidence({
  result,
  desktopPreflight,
  finderObservation,
  finderSemanticObservation,
  finderItemDragDrop
}: {
  result: string;
  desktopPreflight?: Record<string, unknown>;
  finderObservation?: Record<string, unknown>;
  finderSemanticObservation?: Record<string, unknown>;
  finderItemDragDrop?: Record<string, unknown>;
}): "proven" | "blocked" | "unproven" | "unknown" {
  if (
    result === "passed"
    || readString(finderObservation?.result) === "passed"
    || readString(finderSemanticObservation?.result) === "passed"
    || readString(finderItemDragDrop?.result) === "passed"
  ) {
    return "proven";
  }

  if (hasFinderAutomationPermissionReason([
    readString(finderObservation?.reason),
    readString(finderSemanticObservation?.reason),
    readString(finderItemDragDrop?.reason)
  ])) {
    return "blocked";
  }

  if (isFinderSmokeDesktopPreflightBlocked({ desktopPreflight })) {
    return "unproven";
  }

  return result === "unknown" ? "unknown" : "unproven";
}

function createFinderSmokeState({
  result,
  automationEvidence,
  desktopPreflight
}: {
  result: string;
  automationEvidence: string;
  desktopPreflight?: Record<string, unknown>;
}): string {
  if (automationEvidence === "proven") {
    return "proven";
  }

  if (automationEvidence === "blocked") {
    return "blocked-by-permission";
  }

  if (isFinderSmokeDesktopPreflightBlocked({ desktopPreflight })) {
    return "blocked-by-desktop-preflight";
  }

  return result;
}

function createFinderAutomationState(
  permissionState: string | undefined,
  latestSmoke: Record<string, unknown> | undefined
): string {
  if (permissionState === "granted") {
    return "granted";
  }

  if (readString(latestSmoke?.automationEvidence) === "proven") {
    return "proven-by-smoke";
  }

  if (readString(latestSmoke?.automationEvidence) === "blocked") {
    return "blocked-by-permission";
  }

  return "unknown";
}

function isFinderSmokeDesktopPreflightBlocked(latestSmoke: Record<string, unknown> | undefined): boolean {
  const desktopPreflight = readRecord(latestSmoke?.desktopPreflight);

  return readString(desktopPreflight?.result) === "blocked"
    && (
      readBoolean(desktopPreflight?.controllable) === false
      || readString(desktopPreflight?.frontmostBundleId) === "com.apple.loginwindow"
      || readBoolean(desktopPreflight?.mainDisplayAsleep) === true
      || /desktop session|loginwindow|display.*asleep|unlock/i.test(readString(desktopPreflight?.reason) ?? "")
    );
}

function hasFinderAutomationPermissionReason(reasons: Array<string | undefined>): boolean {
  return reasons.some((reason) => Boolean(
    reason
    && /(finder automation|automation permission|apple events?|not authorized to send apple events|not permitted to control finder|tcc)/i.test(reason)
  ));
}

function createFinderDesktopPreflightDiagnosticMessage(latestSmoke: Record<string, unknown>): string {
  const desktopPreflight = readRecord(latestSmoke.desktopPreflight);
  const details = [
    readString(desktopPreflight?.frontmostBundleId)
      ? `frontmostBundleId=${readString(desktopPreflight?.frontmostBundleId)}`
      : undefined,
    readBoolean(desktopPreflight?.mainDisplayAsleep) === true
      ? "mainDisplayAsleep=true"
      : undefined,
    readBoolean(desktopPreflight?.controllable) === false
      ? "controllable=false"
      : undefined
  ].filter(Boolean).join(", ");
  const suffix = details ? ` (${details})` : "";

  return `Finder Automation has not been proven because the latest Finder smoke was blocked by desktop preflight${suffix}.`;
}

function createFinderAutomationPermissionDiagnosticMessage(latestSmoke: Record<string, unknown>): string {
  const reason = [
    readString(readRecord(latestSmoke.finderObservation)?.reason),
    readString(readRecord(latestSmoke.finderSemanticObservation)?.reason),
    readString(readRecord(latestSmoke.finderItemDragDrop)?.reason)
  ].find(Boolean);

  return reason
    ? `Finder Automation appears blocked by macOS Automation permission: ${reason}`
    : "Finder Automation appears blocked by macOS Automation permission.";
}

function createFinderSmokeNextAction(state: string, automationEvidence: string): string {
  if (automationEvidence === "blocked") {
    return "Open System Settings > Privacy & Security > Automation and grant skfiy permission to control Finder, then rerun the Finder smoke.";
  }

  if (state === "blocked-by-desktop-preflight") {
    return createFinderSmokeRerunAction();
  }

  return "Run a Finder smoke once and grant Finder Automation when macOS prompts.";
}

function createFinderSmokeRerunAction(): string {
  return "Wake and unlock the Mac, keep the display awake, then rerun `npm run smoke:finder -- --output .skfiy-smoke/finder-current.json --require-passed`.";
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
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
      ...(context.dashboardUrl ? { url: sanitizeDashboardUrlForOutput(context.dashboardUrl) } : {}),
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
      ? { url: sanitizeDashboardUrlForOutput(readString(dashboard?.url) ?? context.dashboardUrl ?? "") }
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
  const pageSafety = readRecord(extension?.pageSafety);
  const pageControl = readRecord(extension?.pageControl);
  const extensionIds = context.extensionIds.length > 0
    ? context.extensionIds
    : readStringArray(nativeHost?.extensionIds);
  const connection = readRecord(extension?.connection);
  const setupGuideFields = createChromeSetupGuideFields({
    extensionState,
    nativeHostState,
    liveConnection,
    extensionIds,
    cliShimPath: context.cliShimPath,
    manifestPath: readString(nativeHost?.manifestPath),
    allowedOrigins: readStringArray(extension?.allowedOrigins).length > 0
      ? readStringArray(extension?.allowedOrigins)
      : readStringArray(nativeHost?.allowedOrigins),
    expectedAllowedOrigins: readStringArray(nativeHost?.expectedAllowedOrigins),
    nativeHostReason: readString(nativeHost?.reason) ?? readString(extension?.reason),
    hostPolicy: readRecord(extension?.hostPolicy) as ChromeHostPolicyState | undefined,
    connectionPath: readString(connection?.path),
    connectionState: readString(connection?.state),
    connectionReason: readString(connection?.reason)
  });
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
      ...(pageSafety ? { pageSafety } : {}),
      ...(pageControl ? { pageControl } : {}),
      blockers: [],
      ...setupGuideFields
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
  if (pageControl && readString(pageControl.state) !== "ready") {
    blockers.push({
      code: "page-control-not-ready",
      message: readString(pageControl.reason)
        ?? "Chrome extension pageControl readiness has not been proven.",
      state: readString(pageControl.state) ?? "unknown",
      source: readString(pageControl.source) ?? "unknown"
    });
  }

  return {
    state: blockers.length === 0 ? "ready" : "needs-action",
    ready: blockers.length === 0,
    extensionState,
    nativeHostState,
    liveConnection,
    extensionIds,
    ...(pageSafety ? { pageSafety } : {}),
    ...(pageControl ? { pageControl } : {}),
    ...(readString(nativeHost?.manifestPath) ? { manifestPath: readString(nativeHost?.manifestPath) } : {}),
    ...(context.cliShimPath ? { cliShimPath: context.cliShimPath } : {}),
    blockers,
    ...setupGuideFields
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

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
      readDashboardStatus(input.dashboardUrl, input.homeDir),
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
    readDashboardStatus(input.dashboardUrl, input.homeDir),
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

function createUnknownExtensionStatus(reason = "Runtime Chrome extension connection is not probed by the CLI status command yet."): Record<string, unknown> {
  return {
    state: "unknown",
    reason
  };
}

function createChromeExtensionStatusWithPageCapabilities(
  extension: Record<string, unknown>,
  input: {
    nativeHost?: Record<string, unknown>;
    connection?: ChromeExtensionConnectionStatus;
    hostPolicy?: ChromeHostPolicyState | Record<string, unknown>;
    context: {
      extensionIds: string[];
      cliShimPath?: string;
    };
  }
): Record<string, unknown> {
  const capabilities = readRecord(extension.capabilities) ?? {};
  const pageSafety = readRecord(extension.pageSafety)
    ?? createChromePageSafetyCapability({
      extensionState: readString(extension.state) ?? "unknown",
      nativeHostState: readString(extension.nativeHostState)
        ?? readString(input.nativeHost?.state)
        ?? "unknown",
      liveConnection: readString(extension.liveConnection)
        ?? readString(readRecord(extension.connection)?.liveConnection)
        ?? readString(readRecord(extension.connection)?.state)
        ?? readConnectionState(input.connection),
      extensionIds: input.context.extensionIds.length > 0
        ? input.context.extensionIds
        : readStringArray(input.nativeHost?.extensionIds),
      cliShimPath: input.context.cliShimPath ?? readString(input.nativeHost?.cliShimPath),
      connection: readRecord(extension.connection) ?? input.connection,
      hostPolicy: readRecord(extension.hostPolicy) ?? input.hostPolicy,
      nativeHostReason: readString(input.nativeHost?.reason),
      extensionReason: readString(extension.reason)
    });
  const pageControl = normalizeChromePageControlCapability({
    extension,
    nativeHost: input.nativeHost,
    connection: readRecord(extension.connection) ?? input.connection,
    context: input.context
  });

  return {
    ...extension,
    capabilities: {
      ...capabilities,
      pageSafety: pageSafety.capable === true,
      pageControl: pageControl.state === "ready"
    },
    pageSafety,
    pageControl
  };
}

function normalizeChromePageControlCapability({
  extension,
  nativeHost,
  connection,
  context
}: {
  extension: Record<string, unknown>;
  nativeHost?: Record<string, unknown>;
  connection?: ChromeExtensionConnectionStatus | Record<string, unknown>;
  context: {
    extensionIds: string[];
    cliShimPath?: string;
  };
}): Record<string, unknown> {
  const existing = readChromePageControlEvidence(extension);
  if (existing) {
    return createChromePageControlCapability({
      reported: existing.record,
      source: existing.source,
      extensionState: readString(extension.state) ?? "unknown",
      nativeHostState: readString(extension.nativeHostState)
        ?? readString(nativeHost?.state)
        ?? "unknown",
      liveConnection: readString(extension.liveConnection)
        ?? readString(readRecord(extension.connection)?.liveConnection)
        ?? readString(readRecord(extension.connection)?.state)
        ?? readConnectionState(connection as ChromeExtensionConnectionStatus | undefined),
      extensionIds: context.extensionIds.length > 0
        ? context.extensionIds
        : readStringArray(nativeHost?.extensionIds)
    });
  }

  return createChromePageControlCapability({
    extensionState: readString(extension.state) ?? "unknown",
    nativeHostState: readString(extension.nativeHostState)
      ?? readString(nativeHost?.state)
      ?? "unknown",
    liveConnection: readString(extension.liveConnection)
      ?? readString(readRecord(extension.connection)?.liveConnection)
      ?? readString(readRecord(extension.connection)?.state)
      ?? readConnectionState(connection as ChromeExtensionConnectionStatus | undefined),
    extensionIds: context.extensionIds.length > 0
      ? context.extensionIds
      : readStringArray(nativeHost?.extensionIds)
  });
}

function readChromePageControlEvidence(
  extension: Record<string, unknown>
): { record: Record<string, unknown>; source: string } | undefined {
  const direct = readRecord(extension.pageControl);
  if (direct) {
    return { record: direct, source: readString(direct.source) ?? "extension.pageControl" };
  }

  const diagnostics = readRecord(extension.diagnostics);
  const currentTab = readRecord(diagnostics?.currentTab);
  const currentTabPageControl = readRecord(currentTab?.pageControl);
  if (currentTabPageControl) {
    return {
      record: currentTabPageControl,
      source: readString(currentTabPageControl.source) ?? "extension.diagnostics.currentTab.pageControl"
    };
  }

  const diagnosticsSession = readRecord(diagnostics?.session);
  const diagnosticsSessionPageControl = readRecord(diagnosticsSession?.pageControl);
  if (diagnosticsSessionPageControl) {
    return {
      record: diagnosticsSessionPageControl,
      source: readString(diagnosticsSessionPageControl.source) ?? "extension.diagnostics.session.pageControl"
    };
  }

  const session = readRecord(extension.session);
  const sessionPageControl = readRecord(session?.pageControl);
  if (sessionPageControl) {
    return {
      record: sessionPageControl,
      source: readString(sessionPageControl.source) ?? "extension.session.pageControl"
    };
  }

  const smoke = readRecord(extension.smoke) ?? readRecord(extension.smokeArtifact);
  const smokeDiagnostics = readRecord(smoke?.diagnostics);
  const smokeDiagnosticsCurrentTab = readRecord(smokeDiagnostics?.currentTab);
  const smokeDiagnosticsSession = readRecord(smokeDiagnostics?.session);
  const smokePageControl = readRecord(smoke?.pageControl)
    ?? readRecord(smokeDiagnosticsCurrentTab?.pageControl)
    ?? readRecord(smokeDiagnosticsSession?.pageControl);
  const smokePageControlRecord = readRecord(smokePageControl);
  if (smokePageControlRecord) {
    return {
      record: smokePageControlRecord,
      source: readString(smokePageControlRecord.source) ?? "extension.smoke.pageControl"
    };
  }

  return undefined;
}

function createChromePageControlCapability({
  reported,
  source,
  extensionState,
  nativeHostState,
  liveConnection,
  extensionIds
}: {
  reported?: Record<string, unknown>;
  source?: string;
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
}): Record<string, unknown> {
  const reportedCapabilities = readRecord(reported?.capabilities);
  const state = readString(reported?.state)
    ?? (hasChromePageControlProbeEvidence({ extensionState, nativeHostState, liveConnection, extensionIds })
      ? "needs-action"
      : "not-probed");
  const normalizedState = normalizeChromePageControlState(state);
  const reason = readString(reported?.reason)
    ?? createChromePageControlReason({
      state: normalizedState,
      extensionState,
      nativeHostState,
      liveConnection
    });
  const pageControl: Record<string, unknown> = {
    ...reported,
    schemaVersion: 1,
    capability: CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY,
    state: normalizedState,
    reason,
    capabilities: reportedCapabilities ?? {},
    source: source ?? readString(reported?.source) ?? (
      reported ? "extension.pageControl" : normalizedState === "not-probed" ? "not-probed" : "cli-status-derived"
    ),
    nextAction: readString(reported?.nextAction)
      ?? createChromePageControlNextAction({
        state: normalizedState,
        extensionIds
      })
  };

  return pageControl;
}

function normalizeChromePageControlState(state: string): string {
  return state;
}

function hasChromePageControlProbeEvidence({
  extensionState,
  nativeHostState,
  liveConnection,
  extensionIds
}: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
}): boolean {
  return extensionState !== "unknown"
    || nativeHostState !== "unknown"
    || liveConnection !== "unknown"
    || extensionIds.length > 0;
}

function createChromePageControlReason({
  state,
  extensionState,
  nativeHostState,
  liveConnection
}: {
  state: string;
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
}): string {
  if (state === "ready") {
    return "Chrome extension page control readiness was reported by the extension.";
  }
  if (state === "not-probed") {
    return "Chrome extension page control readiness has not been reported yet.";
  }
  if (nativeHostState !== "installed") {
    return "Chrome page control needs an installed Native Messaging host before extension readiness can be trusted.";
  }
  if (extensionState !== "connected" || liveConnection !== "connected") {
    return "Chrome page control needs a live extension heartbeat plus page diagnostics.";
  }
  return "Chrome extension did not report pageControl readiness for the current page.";
}

function createChromePageControlNextAction({
  state,
  extensionIds
}: {
  state: string;
  extensionIds: string[];
}): string {
  const extensionId = extensionIds[0] ?? "<extension-id>";

  if (state === "ready") {
    return "Chrome extension page control is ready for the current page.";
  }
  if (state === "not-probed") {
    return `Run \`skfiy chrome status --json --extension-id ${extensionId}\` after opening a controllable Chrome page.`;
  }
  return `Open a controllable Chrome tab, grant any requested site access, refresh the skfiy extension, then rerun \`skfiy chrome status --json --extension-id ${extensionId}\`.`;
}

function createChromePageSafetyCapability({
  extensionState,
  nativeHostState,
  liveConnection,
  extensionIds,
  cliShimPath,
  connection,
  hostPolicy,
  nativeHostReason,
  extensionReason
}: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
  cliShimPath?: string;
  connection?: ChromeExtensionConnectionStatus | Record<string, unknown>;
  hostPolicy?: ChromeHostPolicyState | Record<string, unknown>;
  nativeHostReason?: string;
  extensionReason?: string;
}): Record<string, unknown> {
  const hostPolicyRecord = readRecord(hostPolicy);
  const hostPolicyPolicy = readRecord(hostPolicyRecord?.policy);
  const hostPolicyState = readString(hostPolicyRecord?.state) ?? "unknown";
  const hostPolicyDefaultMode = readString(hostPolicyPolicy?.defaultMode) ?? "unknown";
  const connectionRecord = readRecord(connection);
  const connectionState = readString(connectionRecord?.state) ?? liveConnection;
  const connectionMessageType = readString(connectionRecord?.messageType);
  const nativeMessagingReady = nativeHostState === "installed";
  const hostPolicyFailClosed = (
    hostPolicyState === "default"
    || hostPolicyState === "configured"
  ) && hostPolicyDefaultMode === "ask";
  const pageObservationHeartbeat =
    connectionState === "connected"
    && connectionMessageType === CHROME_PAGE_OBSERVE_MESSAGE_TYPE;
  const capable = nativeMessagingReady && hostPolicyFailClosed && pageObservationHeartbeat;
  const connectionPath = readString(connectionRecord?.path);
  const connectionObservedAt = readString(connectionRecord?.observedAt);
  const connectionLaunchOrigin = readString(connectionRecord?.launchOrigin);
  const connectionRequestId = readString(connectionRecord?.requestId);
  const connectionReason = readString(connectionRecord?.reason);
  const state = capable
    ? "ready"
    : hostPolicyState === "invalid" || nativeHostState === "invalid"
      ? "blocked"
      : hasChromePageSafetyEvidence({
          extensionState,
          nativeHostState,
          liveConnection,
          hostPolicyState,
          connectionState,
          connectionMessageType,
          extensionIds
        })
        ? "needs-action"
        : "unknown";

  return {
    schemaVersion: 1,
    capability: CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY,
    capable,
    state,
    nextAction: createChromePageSafetyNextAction({
      capable,
      nativeHostState,
      hostPolicyState,
      connectionState,
      connectionMessageType,
      extensionIds
    }),
    evidence: {
      nativeMessaging: nativeMessagingReady,
      nativeHostState,
      ...(nativeHostReason ? { nativeHostReason } : {}),
      hostPolicy: {
        state: hostPolicyState,
        defaultMode: hostPolicyDefaultMode,
        failClosed: hostPolicyFailClosed,
        ...(readString(hostPolicyRecord?.path) ? { path: readString(hostPolicyRecord?.path) } : {}),
        entryCount: countChromeHostPolicyEntries(hostPolicyPolicy)
      },
      liveConnection: {
        state: connectionState,
        liveConnection,
        messageType: connectionMessageType ?? "unknown",
        pageObservationHeartbeat,
        ...(connectionPath ? { path: connectionPath } : {}),
        ...(typeof connectionRecord?.ageSeconds === "number" ? { ageSeconds: connectionRecord.ageSeconds } : {}),
        ...(connectionObservedAt ? { observedAt: connectionObservedAt } : {}),
        ...(connectionLaunchOrigin ? { launchOrigin: connectionLaunchOrigin } : {}),
        ...(connectionRequestId ? { requestId: connectionRequestId } : {}),
        ...(connectionReason ? { reason: connectionReason } : {})
      },
      extensionState,
      extensionIds,
      ...(cliShimPath ? { cliShimPath } : {}),
      ...(extensionReason ? { extensionReason } : {})
    }
  };
}

function hasChromePageSafetyEvidence({
  extensionState,
  nativeHostState,
  liveConnection,
  hostPolicyState,
  connectionState,
  connectionMessageType,
  extensionIds
}: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  hostPolicyState: string;
  connectionState: string;
  connectionMessageType?: string;
  extensionIds: string[];
}): boolean {
  return extensionState !== "unknown"
    || nativeHostState !== "unknown"
    || liveConnection !== "unknown"
    || hostPolicyState !== "unknown"
    || connectionState !== "unknown"
    || Boolean(connectionMessageType)
    || extensionIds.length > 0;
}

function createChromePageSafetyNextAction({
  capable,
  nativeHostState,
  hostPolicyState,
  connectionState,
  connectionMessageType,
  extensionIds
}: {
  capable: boolean;
  nativeHostState: string;
  hostPolicyState: string;
  connectionState: string;
  connectionMessageType?: string;
  extensionIds: string[];
}): string {
  const extensionId = extensionIds[0] ?? "<extension-id>";

  if (capable) {
    return "Chrome extension page safety is evidenced by a fresh page observation heartbeat and ask-by-default host policy.";
  }
  if (nativeHostState !== "installed") {
    return `Run \`skfiy chrome install-host --extension-id ${extensionId}\` before relying on Chrome page-safety evidence.`;
  }
  if (hostPolicyState === "invalid") {
    return "Run `skfiy chrome policy reset` so Chrome page safety can fail closed with default ask mode.";
  }
  if (hostPolicyState !== "default" && hostPolicyState !== "configured") {
    return "Run `skfiy chrome policy show --json` to verify the Chrome page-safety host policy file.";
  }
  if (connectionState !== "connected" || connectionMessageType !== CHROME_PAGE_OBSERVE_MESSAGE_TYPE) {
    return `Refresh the skfiy Chrome extension, observe one page, then run \`skfiy chrome status --json --extension-id ${extensionId}\`.`;
  }

  return `Run \`skfiy chrome status --json --extension-id ${extensionId}\` to collect Chrome page-safety evidence.`;
}

function countChromeHostPolicyEntries(policy: Record<string, unknown> | undefined): number {
  if (!policy) {
    return 0;
  }

  return readStringArray(policy.allowedHosts).length
    + readStringArray(policy.currentTurnAllowedHosts).length
    + readStringArray(policy.blockedHosts).length;
}

function createChromeExtensionAdapterStatus(
  nativeHost: {
    state?: unknown;
    reason?: unknown;
    manifestPath?: unknown;
    cliShimPath?: unknown;
    extensionIds?: unknown;
    allowedOrigins?: unknown;
    expectedAllowedOrigins?: unknown;
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
  const createSetupFields = (extensionState: string, nativeHostState: string) => createChromeSetupGuideFields({
    extensionState,
    nativeHostState,
    liveConnection: readConnectionState(connection),
    extensionIds: readExtensionIdsFromAdapterInput(nativeHost),
    cliShimPath: readString(nativeHost.cliShimPath),
    manifestPath: readString(nativeHost.manifestPath),
    allowedOrigins,
    expectedAllowedOrigins: readStringArray(nativeHost.expectedAllowedOrigins),
    nativeHostReason: readString(nativeHost.reason),
    hostPolicy,
    connectionPath: connection?.path,
    connectionState: connection?.state,
    connectionReason: connection?.reason
  });
  const withPageCapabilities = (extension: Record<string, unknown>) =>
    createChromeExtensionStatusWithPageCapabilities(extension, {
      nativeHost,
      connection,
      hostPolicy,
      context: {
        extensionIds: readExtensionIdsFromAdapterInput(nativeHost),
        cliShimPath: readString(nativeHost.cliShimPath)
      }
    });

  if (connection?.state === "connected") {
    return withPageCapabilities({
      state: "connected",
      ...common,
      ...createSetupFields("connected", readString(nativeHost.state) ?? "unknown")
    });
  }

  if (connection?.state === "stale" && nativeHost.state === "installed") {
    return withPageCapabilities({
      state: "native-host-installed",
      ...common,
      ...createSetupFields("native-host-installed", "installed"),
      reason: "Chrome extension native-message heartbeat is stale."
    });
  }

  if (nativeHost.state === "installed") {
    return withPageCapabilities({
      state: "native-host-installed",
      ...common,
      ...createSetupFields("native-host-installed", "installed"),
      reason: "Chrome Native Messaging host is installed; no live Chrome extension connection has been observed yet."
    });
  }

  if (nativeHost.state === "missing") {
    return withPageCapabilities({
      state: "native-host-missing",
      ...common,
      ...createSetupFields("native-host-missing", "missing"),
      reason: "Chrome Native Messaging host manifest is not installed."
    });
  }

  if (nativeHost.state === "cli-missing") {
    return withPageCapabilities({
      state: "native-host-cli-missing",
      ...common,
      ...createSetupFields("native-host-cli-missing", "cli-missing"),
      reason: "The Chrome Native Messaging host cannot run because the packaged skfiy CLI is missing."
    });
  }

  if (nativeHost.state === "mismatched") {
    return withPageCapabilities({
      state: "native-host-mismatched",
      ...common,
      ...createSetupFields("native-host-mismatched", "mismatched"),
      reason: "Chrome Native Messaging host manifest points at a different skfiy CLI."
    });
  }

  if (nativeHost.state === "invalid") {
    return withPageCapabilities({
      state: "native-host-invalid",
      ...common,
      ...createSetupFields("native-host-invalid", "invalid"),
      reason: "Chrome Native Messaging host manifest is invalid."
    });
  }

  return withPageCapabilities(createUnknownExtensionStatus(
    typeof nativeHost.reason === "string"
      ? nativeHost.reason
      : "Runtime Chrome extension connection is not probed by the CLI status command yet."
  ));
}

function createChromeSetupGuideFields(input: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
  cliShimPath?: string;
  manifestPath?: string;
  allowedOrigins?: string[];
  expectedAllowedOrigins?: string[];
  nativeHostReason?: string;
  hostPolicy?: ChromeHostPolicyState;
  connectionPath?: string;
  connectionState?: string;
  connectionReason?: string;
  extensionPath?: string;
}): Record<string, unknown> {
  const setupGuide = createChromeSetupGuideOutput(input);

  return {
    nextAction: setupGuide.nextAction,
    setupGuide,
    copyableCommands: setupGuide.copyableCommands
  };
}

function createChromeSetupGuideOutput(input: {
  extensionState: string;
  nativeHostState: string;
  liveConnection: string;
  extensionIds: string[];
  cliShimPath?: string;
  manifestPath?: string;
  allowedOrigins?: string[];
  expectedAllowedOrigins?: string[];
  nativeHostReason?: string;
  hostPolicy?: ChromeHostPolicyState;
  connectionPath?: string;
  connectionState?: string;
  connectionReason?: string;
  extensionPath?: string;
}): Record<string, unknown> {
  const extensionIds = dedupeStrings(input.extensionIds);
  const nativeHostState = readChromeNativeHostSetupState(input.nativeHostState);
  const hostPolicy = input.hostPolicy ?? createDefaultChromeHostPolicyForSetupGuide();
  const allowedOrigins = input.allowedOrigins ?? extensionIds.map((extensionId) => `chrome-extension://${extensionId}/`);
  const liveConnection = input.connectionPath || input.connectionReason || input.connectionState || input.liveConnection !== "unknown"
    ? {
        state: readChromeConnectionSetupState(input.connectionState ?? input.liveConnection),
        path: input.connectionPath ?? "",
        reason: input.connectionReason
      }
    : undefined;
  const setupGuide = nativeHostState
    ? createChromeReadinessSetupGuide({
        nativeHost: {
          state: nativeHostState,
          manifestPath: input.manifestPath ?? "",
          allowedOrigins,
          expectedAllowedOrigins: input.expectedAllowedOrigins ?? allowedOrigins,
          reason: input.nativeHostReason ?? "Chrome Native Messaging host status was read from CLI output."
        },
        hostPolicy,
        liveConnection,
        extensionIds,
        cliShimPath: input.cliShimPath ?? "",
        extensionPath: input.extensionPath
      })
    : createUnknownChromeSetupGuide({
        input,
        extensionIds
      });
  const copyableCommands = createCopyableCommandsFromSetupGuide(setupGuide);
  const nextAction = createChromeNextAction(setupGuide);

  return {
    ...setupGuide,
    nextAction,
    copyableCommands
  };
}

function createUnknownChromeSetupGuide({
  input,
  extensionIds
}: {
  input: {
    extensionState: string;
    nativeHostState: string;
    liveConnection: string;
    cliShimPath?: string;
    manifestPath?: string;
  };
  extensionIds: string[];
}): Record<string, unknown> {
  const extensionIdArgs = extensionIds.length > 0
    ? extensionIds.flatMap((extensionId) => ["--extension-id", extensionId])
    : ["--extension-id", "<extension-id>"];
  const verifyStatusCommand = [
    "skfiy",
    "chrome",
    "status",
    "--cli",
    input.cliShimPath ?? "<path-to-skfiy-cli>",
    ...extensionIdArgs
  ];

  return {
    schemaVersion: 1,
    productPath: "dist/skfiy -> Chrome MV3 extension -> Native Messaging",
    state: "needs_setup",
    extensionState: input.extensionState,
    nativeHostState: input.nativeHostState,
    liveConnection: input.liveConnection,
    extensionIds,
    nativeHostManifestPath: input.manifestPath ?? "",
    cliShimPath: input.cliShimPath ?? "",
    installHostCommand: [
      "skfiy",
      "chrome",
      "install-host",
      "--cli",
      input.cliShimPath ?? "<path-to-skfiy-cli>",
      ...extensionIdArgs
    ],
    verifyStatusCommand,
    nextActions: [{
      id: "verify-live-connection",
      state: "needed",
      owner: "skfiy",
      title: "Collect Chrome extension/native-host status with an extension id.",
      command: verifyStatusCommand
    }]
  };
}

function createDefaultChromeHostPolicyForSetupGuide(): Pick<ChromeHostPolicyState, "state" | "path" | "reason"> {
  return {
    state: "default",
    path: "",
    reason: "Chrome host policy was not included in CLI status output."
  };
}

function readChromeNativeHostSetupState(value: string): "installed" | "missing" | "mismatched" | "cli-missing" | "invalid" | undefined {
  return value === "installed"
    || value === "missing"
    || value === "mismatched"
    || value === "cli-missing"
    || value === "invalid"
    ? value
    : undefined;
}

function readChromeConnectionSetupState(value: string): "connected" | "stale" | "unknown" | "invalid" {
  return value === "connected" || value === "stale" || value === "invalid"
    ? value
    : "unknown";
}

function createCopyableCommandsFromSetupGuide(setupGuide: {
  installHostCommand?: unknown;
  verifyStatusCommand?: unknown;
  smokeCommand?: unknown;
  nextActions?: unknown;
}): Array<Record<string, unknown>> {
  const commandLines = [
    readStringArray(setupGuide.installHostCommand),
    readStringArray(setupGuide.verifyStatusCommand),
    readStringArray(setupGuide.smokeCommand),
    ...readChromeSetupActions(setupGuide).map((action) => readStringArray(action.command))
  ].filter((commandLine) => commandLine.length > 0);
  const seen = new Set<string>();
  const copyableCommands: Array<Record<string, unknown>> = [];

  for (const commandLine of commandLines) {
    const copyText = formatCommandLine(commandLine);

    if (seen.has(copyText)) {
      continue;
    }
    seen.add(copyText);
    copyableCommands.push({
      id: readCopyableCommandId(commandLine),
      command: commandLine[0],
      args: commandLine.slice(1),
      copyText
    });
  }

  return copyableCommands;
}

function createChromeNextAction(setupGuide: {
  nextActions?: unknown;
}): string {
  const actions = readChromeSetupActions(setupGuide);
  const action = actions.find((item) => item.state !== "done")
    ?? actions.find((item) => item.id === "verify-live-connection")
    ?? actions[0];

  if (!action) {
    return "Run `skfiy chrome status --json --extension-id <extension-id>` to collect Chrome extension/native-host status.";
  }

  const title = readString(action.title) ?? "Collect Chrome extension/native-host status.";
  const command = readStringArray(action.command);

  return command.length > 0
    ? `${title} Run \`${formatCommandLine(command)}\`.`
    : title;
}

function readChromeSetupActions(setupGuide: {
  nextActions?: unknown;
}): Array<Record<string, unknown>> {
  return Array.isArray(setupGuide.nextActions)
    ? setupGuide.nextActions.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
}

function readCopyableCommandId(commandLine: string[]): string {
  const [, ...args] = commandLine;
  const pathParts = args.filter((arg) => !arg.startsWith("-"));

  return pathParts.length > 0 ? pathParts.join("-") : commandLine[0] ?? "command";
}

function formatCommandLine(commandLine: string[]): string {
  return commandLine.map(formatCommandArg).join(" ");
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function readExtensionIdsFromAdapterInput(nativeHost: {
  extensionIds?: unknown;
  allowedOrigins?: unknown;
}): string[] {
  const extensionIds = readStringArray(nativeHost.extensionIds);

  if (extensionIds.length > 0) {
    return extensionIds;
  }

  return readStringArray(nativeHost.allowedOrigins)
    .map((origin) => {
      const match = origin.match(/^chrome-extension:\/\/([^/]+)\/$/);

      return match?.[1] ?? "";
    })
    .filter(Boolean);
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

async function readDashboardStatus(
  dashboardUrl: string | undefined,
  homeDir?: string
): Promise<Record<string, unknown>> {
  const discovered = dashboardUrl
    ? undefined
    : readDashboardStatusFromState(homeDir);
  const effectiveDashboardUrl = dashboardUrl ?? readString(discovered?.url);

  if (!effectiveDashboardUrl) {
    return discovered ?? { state: "not-running" };
  }

  const descriptorUrl = createDashboardDescriptorUrl(effectiveDashboardUrl);
  const chromeHostPolicyApiUrl = createDashboardApiUrl(effectiveDashboardUrl);

  if (!descriptorUrl || !chromeHostPolicyApiUrl) {
    return {
      state: "not-running",
      url: effectiveDashboardUrl,
      ...(discovered ? { source: "dashboard-server-state" } : {}),
      ...(readString(discovered?.statePath) ? { statePath: readString(discovered?.statePath) } : {}),
      reason: `Invalid dashboard URL: ${effectiveDashboardUrl}`,
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
      url: effectiveDashboardUrl,
      ...(discovered ? { source: "dashboard-server-state" } : {}),
      ...(readString(discovered?.statePath) ? { statePath: readString(discovered?.statePath) } : {}),
      ...(readNumber(discovered?.pid) !== undefined ? { pid: readNumber(discovered?.pid) } : {}),
      ...(readString(discovered?.startedAt) ? { startedAt: readString(discovered?.startedAt) } : {}),
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
    url: effectiveDashboardUrl,
    ...(discovered ? { source: "dashboard-server-state" } : {}),
    ...(readString(discovered?.statePath) ? { statePath: readString(discovered?.statePath) } : {}),
    ...(readNumber(discovered?.pid) !== undefined ? { pid: readNumber(discovered?.pid) } : {}),
    ...(readString(discovered?.startedAt) ? { startedAt: readString(discovered?.startedAt) } : {}),
    descriptor: descriptorProbe.body,
    api: {
      chromeHostPolicy: await fetchDashboardJson(chromeHostPolicyApiUrl)
    }
  };
}

function readDashboardStatusFromState(homeDir: string | undefined): Record<string, unknown> | undefined {
  const result = readDashboardServerState(homeDir);
  if (!result.state) {
    return {
      state: "not-running",
      ...(result.statePath ? { statePath: result.statePath } : {}),
      ...(result.reason ? { reason: result.reason } : {})
    };
  }

  if (!isPidRunning(result.state.pid)) {
    return {
      state: "not-running",
      source: "dashboard-server-state",
      statePath: result.statePath,
      url: result.state.url,
      pid: result.state.pid,
      startedAt: result.state.startedAt,
      reason: "Recorded dashboard process is no longer running."
    };
  }

  return {
    state: "unknown",
    source: "dashboard-server-state",
    statePath: result.statePath,
    url: result.state.url,
    pid: result.state.pid,
    startedAt: result.state.startedAt,
    bind: result.state.bind
  };
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createDashboardDescriptorUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/descriptor.json", dashboardUrl);
}

function createDashboardSnapshotUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/snapshot.json", dashboardUrl);
}

function createDashboardOperatorEvidenceUrl(dashboardUrl: string | undefined): string | undefined {
  return createDashboardRelativeUrl("/api/operator-evidence", dashboardUrl);
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

async function fetchDashboardJson(
  targetUrl: string,
  options: { timeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1_000);

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
  rootDir,
  homeDir,
  io,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt?: string;
  rootDir: string;
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
      rootDir,
      homeDir,
      appPath: "",
      helperPath: "",
      cliShimPath: invocation.options.cliShimPath,
      extensionIds: invocation.options.extensionIds
    }, io);
    const extension = createChromeExtensionAdapterStatus(nativeHost, extensionConnection, hostPolicy);
    const setupGuideFields = createChromeSetupGuideFields({
      extensionState: readString(extension.state) ?? "unknown",
      nativeHostState: nativeHost.state,
      liveConnection: readString(extension.liveConnection) ?? readConnectionState(extensionConnection),
      extensionIds: invocation.options.extensionIds,
      cliShimPath: invocation.options.cliShimPath,
      manifestPath: nativeHost.manifestPath,
      allowedOrigins: nativeHost.allowedOrigins,
      expectedAllowedOrigins: nativeHost.expectedAllowedOrigins,
      nativeHostReason: nativeHost.reason,
      hostPolicy,
      connectionPath: extensionConnection.path,
      connectionState: extensionConnection.state,
      connectionReason: extensionConnection.reason,
      extensionPath: path.join(rootDir, "chrome-extension")
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: false,
      extension: {
        ...extension,
        ...setupGuideFields
      },
      nativeHost: {
        ...nativeHost,
        ...setupGuideFields
      },
      setupGuide: setupGuideFields.setupGuide
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

function isDashboardProbeSubcommand(value: string | undefined): value is DashboardProbeSubcommand {
  return value === "status" || value === "snapshot";
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
