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
  createChromeHostPolicyStatePath,
  readChromeHostPolicyState,
  resetChromeHostPolicyState,
  writeChromeHostPolicyState,
  type ChromeHostPolicyState
} from "./chrome-host-policy.js";
import {
  CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
  readChromeExtensionOpenerAppName,
  reloadChromeExtensionWithDesktopControl,
  type ChromeExtensionReloadInput,
  type ChromeExtensionReloadResult
} from "./chrome-extension-reloader.js";
import {
  invokeChromeExtensionTabDiscovery,
  invokeChromeExtensionPageControl,
  type ChromeExtensionPageControlInput,
  type ChromeExtensionPageControlInvoker,
  type ChromeExtensionPageControlResult,
  type ChromeExtensionTabDiscoveryInput,
  type ChromeExtensionTabDiscoveryInvoker,
  type ChromeExtensionTabDiscoveryResult
} from "./chrome-extension-page-control.js";
import {
  importPetSkin
} from "./pet-skin.js";
import {
  SKFIY_MCP_TOOL_NAMES,
  runSkfiyMcpStdioServer,
  type SkfiyMcpProviders,
  type SkfiyMcpToolCallInput
} from "./skfiy-mcp-server.js";
import {
  createTmuxSupervisionReport,
  parseTmuxPaneList
} from "./computer-use/tmux-supervisor.js";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import type {
  PermissionSummary
} from "./computer-use/types.js";
import {
  SMOKE_TARGETS,
  parseSmokeJson,
  runSmokeScript,
  type SmokeRunnerInput,
  type SmokeRunnerResult,
  type SmokeTarget
} from "./cli-smoke-command.js";
import {
  compactRecord,
  readBoolean,
  readErrorMessage,
  readNumber,
  readRecord,
  readString,
  readStringArray
} from "./cli-record-utils.js";
import {
  sanitizeDashboardUrlForOutput,
  sanitizeSensitiveString,
  sanitizeTokenFree
} from "./cli-output-sanitize.js";
import {
  createFinderAutomationPermissionDiagnosticMessage,
  createFinderAutomationState,
  createFinderDesktopPreflightDiagnosticMessage,
  createFinderSmokeRerunAction,
  isFinderSmokeDesktopPreflightBlocked,
  readLatestFinderSmokeEvidence,
  withFinderSmokeStatus
} from "./cli-finder-smoke-status.js";
import {
  readLatestDashboardSmokeEvidence,
  readRuntimeSnapshotEvidence
} from "./cli-status-evidence.js";
import { formatStatusTextOutput } from "./cli-status-output.js";
import {
  MONEY_RUN_SESSION_NAME,
  createBinaryReadinessEvidence,
  createStatusReadinessSummary,
  createUnknownMoneyRunStatus,
  type StatusReadinessContext
} from "./cli-status-readiness.js";
import {
  createChromeSetupGuideFields,
  createCopyableCommandsFromSetupGuide,
  formatCommandLine,
  readExtensionIdsFromAdapterInput
} from "./cli-chrome-readiness.js";
import {
  CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY,
  CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY,
  createCliCommandSurface,
  type CliCommandDefinition,
  type CliCommandSurface
} from "./cli-command-definitions.js";
import {
  PERMISSION_SETTINGS_TARGETS,
  isChromePageControlSubcommand,
  normalizeChromePolicyHostForCli,
  normalizeCliCommand,
  type ChromePolicySubcommand,
  type ChromeSubcommand,
  type CliCommandInvocation,
  type DashboardProbeSubcommand,
  type McpTransport,
  type NormalizeCliCommandOptions,
  type NormalizeCliCommandResult,
  type PermissionSettingsTarget,
  type SkinSubcommand
} from "./cli-command-normalization.js";
import {
  createDashboardApiUrl,
  createDashboardDescriptorUrl,
  createDashboardFetchSummary,
  createDashboardOperatorEvidenceUrl,
  createDashboardProbeNotRunOutput,
  createDashboardSnapshotUrl,
  createDashboardStatusSnapshotSummary
} from "./cli-dashboard-probe-output.js";
import {
  createMoneyRunProbeFailure,
  createMoneyRunSnapshot,
  formatTmuxCommand,
  readCommandResultMessage
} from "./cli-money-run-status.js";
import {
  createPermissionSettingsOpenOutput,
  createPermissionSettingsOpenUrl
} from "./cli-permission-settings-output.js";

export { SMOKE_TARGETS };
export {
  PERMISSION_SETTINGS_TARGETS,
  createCliCommandSurface,
  normalizeCliCommand
};
export type {
  ChromePolicySubcommand,
  ChromeSubcommand,
  CliCommandDefinition,
  CliCommandInvocation,
  CliCommandSurface,
  DashboardProbeSubcommand,
  McpTransport,
  NormalizeCliCommandOptions,
  NormalizeCliCommandResult,
  PermissionSettingsTarget,
  SkinSubcommand,
  SmokeRunnerInput,
  SmokeRunnerResult,
  SmokeTarget
};

export type ChromeExtensionReloader = (
  input: ChromeExtensionReloadInput
) => Promise<ChromeExtensionReloadResult>;
export type {
  ChromeExtensionPageControlInput,
  ChromeExtensionPageControlInvoker,
  ChromeExtensionPageControlResult,
  ChromeExtensionTabDiscoveryInput,
  ChromeExtensionTabDiscoveryInvoker,
  ChromeExtensionTabDiscoveryResult
};

const TMUX_TAIL_LINES = 120;
const TMUX_PROBE_TIMEOUT_MS = 1_500;
const TMUX_WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const TMUX_PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";
const CHROME_PAGE_OBSERVE_MESSAGE_TYPE = "skfiy.page.observe";
const CHROME_EXTENSION_REGISTRATION_STALE_NEXT_ACTION =
  "Reload the skfiy extension card in Chrome Extension Manager so Chrome re-registers the MV3 service worker, then retry `skfiy chrome tabs`.";
const CHROME_EXTENSION_CARD_RELOAD_REQUIRED_NEXT_ACTION =
  "Open chrome://extensions on an unlocked desktop, click the skfiy extension reload button, then retry `skfiy chrome reload-extension`.";

type ChromeExtensionRegistrationStatus = {
  state: "fresh" | "stale" | "missing" | "unknown" | "invalid";
  localManifestVersion?: string;
  registeredVersion?: string;
  extensionPath?: string;
  manifestPath?: string;
  preferencesPath?: string;
  reason?: string;
};

export interface CreateCliOutputOptions {
  generatedAt?: string;
}

export interface SkfiyCliIo {
  write: (chunk: string) => unknown;
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
  chromeExtensionReloader?: ChromeExtensionReloader;
  chromeExtensionPageControlInvoker?: ChromeExtensionPageControlInvoker;
  chromeExtensionTabDiscoveryInvoker?: ChromeExtensionTabDiscoveryInvoker;
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
    if (invocation.subcommand === "extension-info") {
      return createChromeExtensionInfoOutput({
        invocation,
        generatedAt,
        rootDir: inferRootDirFromCliShimPath(invocation.options.cliShimPath)
      });
    }

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

    if (invocation.subcommand === "tabs") {
      return {
        schemaVersion: 1,
        command: "chrome tabs",
        generatedAt,
        plannedMutation: true,
        executesSystemMutation: true,
        result: "not-run",
        extensionId: invocation.options.extensionIds[0],
        actionPlan: [
          "open the skfiy extension wake page with skfiyWakeAction=tabs",
          "ask the extension background worker for bounded tab metadata",
          "record the bounded tab discovery result through Chrome Native Messaging",
          "poll the Native Messaging heartbeat for fresh tab discovery evidence"
        ]
      };
    }

    if (invocation.subcommand === "reload-extension") {
      return {
        schemaVersion: 1,
        command: invocation.path,
        generatedAt,
        plannedMutation: true,
        executesSystemMutation: true,
        result: "not-run",
        extensionId: invocation.options.extensionIds[0],
        targetTabId: invocation.options.targetTabId,
        productPath: CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
        actionPlan: [
          "open chrome://extensions/",
          "activate Google Chrome",
          "observe the extension list or detail page and OCR labels",
          "click the extension reload control",
          invocation.options.targetTabId
            ? "open the extension wake page with skfiyTargetTabId"
            : "open the extension wake page",
          "poll the Native Messaging heartbeat"
        ]
      };
    }

    if (isChromePageControlSubcommand(invocation.subcommand)) {
      return {
        schemaVersion: 1,
        command: invocation.path,
        generatedAt,
        plannedMutation: true,
        executesSystemMutation: true,
        result: "not-run",
        action: invocation.subcommand,
        extensionId: invocation.options.extensionIds[0],
        targetTabId: invocation.options.targetTabId,
        ...(invocation.options.selector ? { selector: invocation.options.selector } : {}),
        ...(invocation.options.text !== undefined ? { text: invocation.options.text } : {}),
        ...(invocation.options.dy !== undefined ? { dy: invocation.options.dy } : {}),
        actionPlan: [
          `open the skfiy extension wake page with skfiyWakeAction=${invocation.subcommand}`,
          "route the page-control request to the requested target tab",
          "record the bounded page-control result through Chrome Native Messaging",
          "poll the Native Messaging heartbeat for matching page-control evidence"
        ]
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

  if (invocation.kind === "skin-import") {
    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      result: "not-run",
      plannedMutation: true,
      executesSystemMutation: true,
      sourcePath: invocation.options.sourcePath,
      skin: {
        slug: invocation.options.slug,
        displayName: invocation.options.displayName,
        licenseSource: invocation.options.licenseSource,
        redistribution: "local-only"
      },
      actionPlan: [
        "copy the local origin asset into the user's skfiy skin directory",
        "write skin.pet.json with local-only redistribution metadata",
        "let the packaged app load the local manifest before bundled fallback skins"
      ]
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

export async function runSkfiyCli({
  argv,
  rootDir,
  homeDir,
  generatedAt,
  chromeNativeHostIo,
  statusReader = readCliStatus,
  signatureReader = readCodeSignatureStatus,
  chromeExtensionReloader = reloadChromeExtensionWithDesktopControl,
  chromeExtensionPageControlInvoker = invokeChromeExtensionPageControl,
  chromeExtensionTabDiscoveryInvoker = invokeChromeExtensionTabDiscovery,
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
      chromeExtensionReloader,
      chromeExtensionPageControlInvoker,
      chromeExtensionTabDiscoveryInvoker,
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

  if (result.invocation.kind === "skin-import") {
    if (!effectiveHomeDir) {
      stderr.write("Home directory is required to import a pet skin.\n");
      return 2;
    }

    try {
      const importResult = await importPetSkin({
        homeDir: effectiveHomeDir,
        sourcePath: result.invocation.options.sourcePath,
        slug: result.invocation.options.slug,
        displayName: result.invocation.options.displayName,
        licenseSource: result.invocation.options.licenseSource,
        importedAt: generatedAt
      });

      stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        command: result.invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        plannedMutation: true,
        executesSystemMutation: true,
        ...importResult
      }, null, 2)}\n`);
      return 0;
    } catch (error) {
      stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        command: result.invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        plannedMutation: true,
        executesSystemMutation: true,
        result: "blocked",
        sourcePath: result.invocation.options.sourcePath,
        reason: "pet-skin-import-failed",
        error: readErrorMessage(error),
        nextAction: "Export a local PNG, GIF, WebP, SVG, or JPEG from an authorized Luo Xiaohei source, then retry `skfiy skin import --source <path>`."
      }, null, 2)}\n`);
      return 1;
    }
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
  const url = createPermissionSettingsOpenUrl(invocation.target);

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

  const readiness = createCliStatusReadinessSummary(statusWithCapabilities, statusInput);

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
    ?? createCliStatusReadinessSummary(status, invocation.options);
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
    readiness: createCliStatusReadinessSummary(statusWithEvidence, context)
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

function createCliStatusReadinessSummary(
  status: Record<string, unknown>,
  context: StatusReadinessContext
): Record<string, unknown> {
  return createStatusReadinessSummary(
    status,
    context,
    createExtensionReadiness(status, context)
  );
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
    const extensionConnection = await readChromeExtensionConnectionForStatus(input);
    const effectiveInput = createStatusReaderInputWithInferredChromeExtensionIds(input, extensionConnection);
    const nativeHost = await readNativeHostStatusForStatus(effectiveInput);
    const hostPolicy = await readChromeHostPolicyForStatus(effectiveInput);
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

  const extensionConnection = await readChromeExtensionConnectionForStatus(input);
  const effectiveInput = createStatusReaderInputWithInferredChromeExtensionIds(input, extensionConnection);
  const nativeHost = await readNativeHostStatusForStatus(effectiveInput);
  const hostPolicy = await readChromeHostPolicyForStatus(effectiveInput);
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
    finderAutomation: "unknown"
  };
}

function createUnknownPermissionStates(): Record<string, "unknown"> {
  return {
    screenRecording: "unknown",
    accessibility: "unknown",
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

function createStatusReaderInputWithInferredChromeExtensionIds(
  input: StatusReaderInput,
  extensionConnection: ChromeExtensionConnectionStatus | undefined
): StatusReaderInput {
  if (input.extensionIds.length > 0) {
    return input;
  }

  const extensionIds = readChromeExtensionIdsFromConnection(extensionConnection);

  return extensionIds.length > 0
    ? { ...input, extensionIds }
    : input;
}

function readChromeExtensionIdsFromConnection(
  extensionConnection: ChromeExtensionConnectionStatus | undefined
): string[] {
  const candidates = [
    extensionConnection?.launchOrigin,
    extensionConnection?.latestCommand?.launchOrigin
  ];

  return [...new Set(candidates.map(readChromeExtensionIdFromLaunchOrigin).filter(Boolean))];
}

function readChromeExtensionIdFromLaunchOrigin(launchOrigin: string | undefined): string {
  const match = launchOrigin?.match(/^chrome-extension:\/\/([a-p]{32})\/$/);

  return match?.[1] ?? "";
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
  const existing = readChromePageControlEvidence(extension, readRecord(connection));
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
  extension: Record<string, unknown>,
  connection?: Record<string, unknown>
): { record: Record<string, unknown>; source: string } | undefined {
  const direct = readRecord(extension.pageControl);
  if (direct) {
    return { record: direct, source: readString(direct.source) ?? "extension.pageControl" };
  }

  const connectionPageControl = readRecord(connection?.pageControl);
  if (connectionPageControl) {
    return {
      record: connectionPageControl,
      source: readString(connectionPageControl.source) ?? "extension.connection.pageControl"
    };
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
    nextAction: createChromePageControlOperatorNextAction({
      reported,
      state: normalizedState,
      extensionIds
    }) ?? createChromePageControlNextAction({
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

function createChromePageControlOperatorNextAction({
  reported,
  state,
  extensionIds
}: {
  reported?: Record<string, unknown>;
  state: string;
  extensionIds: string[];
}): string | undefined {
  const reportedNextAction = readString(reported?.nextAction);

  if (!reportedNextAction) {
    return undefined;
  }
  if (!isChromePageControlMachineNextAction(reportedNextAction)) {
    return reportedNextAction;
  }

  const extensionId = extensionIds[0] ?? "<extension-id>";
  const activeTab = readRecord(reported?.activeTab);
  const chromeHostPermission = readRecord(reported?.chromeHostPermission);
  const chromeCapturePermission = readRecord(reported?.chromeCapturePermission);
  const blockers = Array.isArray(reported?.blockers)
    ? reported.blockers.map((blocker) => readRecord(blocker)).filter(Boolean)
    : [];
  const blockerCodes = blockers
    .map((blocker) => readString(blocker?.code))
    .filter(Boolean);
  const host = readString(activeTab?.host)
    ?? readString(chromeHostPermission?.host)
    ?? readChromeHostFromPermissionOrigin(readString(chromeHostPermission?.origin));
  const chromeHostOrigins = readStringArray(chromeHostPermission?.origins);
  const chromeCaptureOrigins = readStringArray(chromeCapturePermission?.origins);
  const chromePopupGrantOrigins = [
    ...(reportedNextAction === "grant_chrome_host_permission"
      || readString(chromeHostPermission?.state) === "missing"
      || blockerCodes.includes("chrome_host_permission_missing")
      ? [chromeHostOrigins[0] ?? readString(chromeHostPermission?.origin) ?? "the active page"]
      : []),
    ...(reportedNextAction === "grant_chrome_capture_permission"
      || readString(chromeCapturePermission?.state) === "missing"
      || blockerCodes.includes("chrome_capture_permission_missing")
      ? [chromeCaptureOrigins[0] ?? "<all_urls>"]
      : [])
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  const actions: string[] = [];

  if (state === "ready") {
    return "Chrome extension page control is ready for the current page.";
  }

  if (
    reportedNextAction === "allow_host"
    || state === "blocked_by_host_policy"
    || blockerCodes.includes("blocked_by_host_policy")
  ) {
    actions.push(host
      ? `Run \`${formatCommandLine(["skfiy", "chrome", "policy", "set", "--host", host, "--action", "allow-current-turn"])}\` or approve the host in Dashboard Chrome policy.`
      : "Allow the current host in Dashboard Chrome policy.");
  }

  if (chromePopupGrantOrigins.length > 0) {
    actions.push(
      `Open Dashboard > Browser and click Open access page, then click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`
    );
    actions.push(
      `Open the skfiy extension popup and click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`
    );
  }

  if (actions.length === 0) {
    actions.push(
      `Refresh the skfiy Chrome extension, then rerun \`${formatCommandLine(["skfiy", "chrome", "status", "--json", "--extension-id", extensionId])}\`.`
    );
  }

  return actions.join(" ");
}

function isChromePageControlMachineNextAction(value: string): boolean {
  return value === "allow_host"
    || value === "grant_chrome_host_permission"
    || value === "grant_chrome_capture_permission"
    || value === "send_page_action";
}

function readChromeHostFromPermissionOrigin(origin: string | undefined): string | undefined {
  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin).host || undefined;
  } catch {
    return undefined;
  }
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

function inferRootDirFromCliShimPath(cliShimPath: string): string {
  const cliDir = path.dirname(cliShimPath);

  return path.basename(cliDir) === "dist"
    ? path.dirname(cliDir)
    : process.cwd();
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

function createChromeExtensionInfoOutput({
  invocation,
  generatedAt,
  rootDir
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt?: string;
  rootDir: string;
}): Record<string, unknown> {
  const extensionPath = path.join(rootDir, "chrome-extension");
  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = readChromeExtensionManifest(manifestPath);
  const extensionIdArgs = invocation.options.extensionIds.length > 0
    ? invocation.options.extensionIds.flatMap((extensionId) => ["--extension-id", extensionId])
    : ["--extension-id", "<extension-id>"];
  const installHostCommand = [
    "skfiy",
    "chrome",
    "install-host",
    "--cli",
    invocation.options.cliShimPath,
    ...extensionIdArgs
  ];
  const verifyStatusCommand = [
    "skfiy",
    "chrome",
    "status",
    "--cli",
    invocation.options.cliShimPath,
    ...extensionIdArgs
  ];
  const smokeCommand = [
    "skfiy",
    "smoke",
    "chrome",
    "--output",
    ".skfiy-smoke/chrome.json"
  ];
  const copyableCommands = createCopyableCommandsFromSetupGuide({
    installHostCommand,
    verifyStatusCommand,
    smokeCommand
  });

  return {
    schemaVersion: 1,
    command: "chrome extension-info",
    generatedAt: generatedAt ?? new Date().toISOString(),
    plannedMutation: false,
    executesSystemMutation: false,
    result: manifest.state === "available" ? "available" : "needs-action",
    productPath: "chrome-extension -> Chrome unpacked extension -> Native Messaging -> dist/skfiy",
    extension: {
      state: manifest.state,
      path: extensionPath,
      manifestPath,
      idState: invocation.options.extensionIds.length > 0 ? "provided" : "unknown-until-loaded",
      extensionIds: invocation.options.extensionIds,
      ...(manifest.reason ? { reason: manifest.reason } : {}),
      ...(manifest.manifest ? { manifest: manifest.manifest } : {})
    },
    browserSetup: {
      state: "manual-required",
      chromeUrl: "chrome://extensions/",
      reason: "Chrome requires the user to load unpacked extensions from Chrome Extension Manager.",
      loadUnpackedPath: extensionPath,
      automationBoundary: "skfiy CLI does not mutate Chrome extension manager settings."
    },
    actionPlan: [
      {
        step: "open-extension-manager",
        owner: "user",
        target: "chrome://extensions/"
      },
      {
        step: "enable-developer-mode",
        owner: "user"
      },
      {
        step: "load-unpacked-extension",
        owner: "user",
        path: extensionPath
      },
      {
        step: "copy-extension-id",
        owner: "user",
        result: "<extension-id>"
      },
      {
        step: "install-native-host",
        owner: "skfiy",
        command: installHostCommand
      },
      {
        step: "verify-extension-bridge",
        owner: "skfiy",
        command: verifyStatusCommand
      }
    ],
    installHostCommand,
    verifyStatusCommand,
    smokeCommand,
    nextAction: `Open chrome://extensions/, load unpacked extension from ${extensionPath}, copy the extension id, then run \`${formatCommandLine(installHostCommand)}\`.`,
    copyableCommands
  };
}

function readChromeExtensionManifest(manifestPath: string): Record<string, unknown> {
  if (!existsSync(manifestPath)) {
    return {
      state: "missing",
      reason: `Chrome extension manifest is missing at ${manifestPath}.`
    };
  }

  try {
    const parsed = readRecord(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (!parsed) {
      return {
        state: "invalid",
        reason: "Chrome extension manifest is not a JSON object."
      };
    }

    return {
      state: "available",
      manifest: compactRecord({
        manifestVersion: parsed.manifest_version,
        name: readString(parsed.name),
        version: readString(parsed.version),
        description: readString(parsed.description),
        minimumChromeVersion: readString(parsed.minimum_chrome_version),
        permissions: readStringArray(parsed.permissions),
        hostPermissions: readStringArray(parsed.host_permissions),
        optionalHostPermissions: readStringArray(parsed.optional_host_permissions),
        backgroundServiceWorker: readString(readRecord(parsed.background)?.service_worker),
        actionDefaultPopup: readString(readRecord(parsed.action)?.default_popup)
      })
    };
  } catch (error) {
    return {
      state: "invalid",
      reason: readErrorMessage(error)
    };
  }
}

async function readChromeExtensionRegistrationStatus({
  rootDir,
  homeDir,
  extensionId,
  io
}: {
  rootDir: string;
  homeDir: string;
  extensionId: string;
  io?: ChromeNativeHostIo;
}): Promise<ChromeExtensionRegistrationStatus> {
  const extensionPath = path.join(rootDir, "chrome-extension");
  const manifestPath = path.join(extensionPath, "manifest.json");
  const localManifest = await readJsonFileForChromeRegistration(manifestPath, io);
  if (localManifest.state === "invalid") {
    return {
      state: "invalid",
      manifestPath,
      reason: localManifest.reason
    };
  }

  const localManifestVersion = readString(readRecord(localManifest.value)?.version);
  const preferencesPaths = [
    path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Secure Preferences"),
    path.join(homeDir, "Library/Application Support/Google/Chrome/Default/Preferences")
  ];

  let lastMissingPath = preferencesPaths[0];
  for (const preferencesPath of preferencesPaths) {
    const preferences = await readJsonFileForChromeRegistration(preferencesPath, io);
    if (preferences.state === "missing") {
      lastMissingPath = preferencesPath;
      continue;
    }
    if (preferences.state === "invalid") {
      return {
        state: "invalid",
        localManifestVersion,
        manifestPath,
        preferencesPath,
        reason: preferences.reason
      };
    }

    const settings = readRecord(readRecord(readRecord(preferences.value)?.extensions)?.settings);
    const extensionEntry = readRecord(settings?.[extensionId]);
    if (!extensionEntry) {
      return {
        state: "missing",
        localManifestVersion,
        manifestPath,
        preferencesPath,
        reason: `Chrome profile does not contain extension ${extensionId}.`
      };
    }

    const registeredVersion = readString(readRecord(extensionEntry.service_worker_registration_info)?.version)
      ?? readString(readRecord(extensionEntry.manifest)?.version);
    const registeredExtensionPath = readString(extensionEntry.path);
    if (localManifestVersion && registeredVersion && localManifestVersion !== registeredVersion) {
      return compactRecord({
        state: "stale",
        localManifestVersion,
        registeredVersion,
        extensionPath: registeredExtensionPath,
        manifestPath,
        preferencesPath
      }) as ChromeExtensionRegistrationStatus;
    }
    if (localManifestVersion && registeredVersion && localManifestVersion === registeredVersion) {
      return compactRecord({
        state: "fresh",
        localManifestVersion,
        registeredVersion,
        extensionPath: registeredExtensionPath,
        manifestPath,
        preferencesPath
      }) as ChromeExtensionRegistrationStatus;
    }

    return compactRecord({
      state: "unknown",
      localManifestVersion,
      registeredVersion,
      extensionPath: registeredExtensionPath,
      manifestPath,
      preferencesPath,
      reason: "Chrome extension registration did not expose both local and registered versions."
    }) as ChromeExtensionRegistrationStatus;
  }

  return {
    state: "missing",
    localManifestVersion,
    manifestPath,
    preferencesPath: lastMissingPath,
    reason: "Chrome profile preferences are missing."
  };
}

async function readJsonFileForChromeRegistration(
  targetPath: string,
  io?: ChromeNativeHostIo
): Promise<{
  state: "available" | "missing" | "invalid";
  value?: unknown;
  reason?: string;
}> {
  try {
    let content: string;
    if (io) {
      if (!(await io.exists(targetPath))) {
        return { state: "missing" };
      }
      content = await io.readFile(targetPath);
    } else {
      if (!existsSync(targetPath)) {
        return { state: "missing" };
      }
      content = readFileSync(targetPath, "utf8");
    }

    return {
      state: "available",
      value: JSON.parse(content) as unknown
    };
  } catch (error) {
    return {
      state: "invalid",
      reason: readErrorMessage(error)
    };
  }
}

async function runChromeNativeHostCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  io,
  chromeExtensionReloader,
  chromeExtensionPageControlInvoker,
  chromeExtensionTabDiscoveryInvoker,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  io?: ChromeNativeHostIo;
  chromeExtensionReloader: ChromeExtensionReloader;
  chromeExtensionPageControlInvoker: ChromeExtensionPageControlInvoker;
  chromeExtensionTabDiscoveryInvoker: ChromeExtensionTabDiscoveryInvoker;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  if (invocation.subcommand === "extension-info") {
    stdout.write(`${JSON.stringify(createChromeExtensionInfoOutput({
      invocation,
      generatedAt,
      rootDir
    }), null, 2)}\n`);
    return 0;
  }

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

  if (invocation.subcommand === "tabs") {
    try {
      const tabDiscoveryResult = await chromeExtensionTabDiscoveryInvoker({
        extensionId: invocation.options.extensionIds[0],
        homeDir,
        chromeAppName: readChromeExtensionOpenerAppName(),
        generatedAt,
        io
      });
      const extensionRegistration = tabDiscoveryResult.result === "blocked"
        ? await readChromeExtensionRegistrationStatus({
          rootDir,
          homeDir,
          extensionId: invocation.options.extensionIds[0],
          io
        })
        : undefined;
      const tabDiscoveryOutput = extensionRegistration?.state === "stale"
        ? {
          ...tabDiscoveryResult,
          reason: "extension-registration-stale",
          extensionRegistration,
          nextAction: CHROME_EXTENSION_REGISTRATION_STALE_NEXT_ACTION
        }
        : tabDiscoveryResult;
      stdout.write(`${JSON.stringify({
        command: invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        executesSystemMutation: true,
        ...tabDiscoveryOutput
      }, null, 2)}\n`);
      return tabDiscoveryResult.result === "blocked" ? 1 : 0;
    } catch (error) {
      stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        command: invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        executesSystemMutation: true,
        result: "blocked",
        extensionId: invocation.options.extensionIds[0],
        reason: "chrome-tabs-command-error",
        error: readErrorMessage(error),
        nextAction: "Check that the skfiy Chrome extension is installed, connected to the native host, then retry `skfiy chrome tabs`."
      }, null, 2)}\n`);
      return 1;
    }
  }

  if (invocation.subcommand === "reload-extension") {
    try {
      const reloadResult = await chromeExtensionReloader({
        extensionId: invocation.options.extensionIds[0],
        targetTabId: invocation.options.targetTabId,
        homeDir,
        generatedAt,
        io
      });
      const extensionRegistration = reloadResult.result === "blocked"
        ? await readChromeExtensionRegistrationStatus({
          rootDir,
          homeDir,
          extensionId: invocation.options.extensionIds[0],
          io
        })
        : undefined;
      const reloadOutput = extensionRegistration?.state === "stale"
        ? {
          ...reloadResult,
          reason: "extension-card-reload-required",
          extensionRegistration,
          desktopFallback: compactRecord({
            reason: reloadResult.reason,
            nextAction: reloadResult.nextAction,
            observedWindowTitle: reloadResult.observedWindowTitle,
            screenshotPath: reloadResult.screenshotPath
          }),
          nextAction: CHROME_EXTENSION_CARD_RELOAD_REQUIRED_NEXT_ACTION
        }
        : reloadResult;
      stdout.write(`${JSON.stringify({
        command: invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        executesSystemMutation: true,
        ...reloadOutput
      }, null, 2)}\n`);
      return reloadResult.result === "blocked" ? 1 : 0;
    } catch (error) {
      stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        command: invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        executesSystemMutation: true,
        result: "blocked",
        extensionId: invocation.options.extensionIds[0],
        productPath: CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
        reason: "reload-command-error",
        error: readErrorMessage(error),
        nextAction: "Check that Chrome is installed, Screen Recording and Accessibility are granted for skfiy, then retry."
      }, null, 2)}\n`);
      return 1;
    }
  }

  if (isChromePageControlSubcommand(invocation.subcommand)) {
    try {
      const requestId = createChromePageControlRequestId(invocation.subcommand, generatedAt);
      const pageControlResult = await chromeExtensionPageControlInvoker({
        action: invocation.subcommand,
        extensionId: invocation.options.extensionIds[0],
        targetTabId: invocation.options.targetTabId,
        selector: invocation.options.selector,
        text: invocation.options.text,
        dy: invocation.options.dy,
        requestId,
        homeDir,
        generatedAt,
        io
      });
      stdout.write(`${JSON.stringify({
        command: invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        executesSystemMutation: true,
        ...pageControlResult
      }, null, 2)}\n`);
      return pageControlResult.result === "blocked" ? 1 : 0;
    } catch (error) {
      stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        command: invocation.path,
        generatedAt: generatedAt ?? new Date().toISOString(),
        executesSystemMutation: true,
        result: "blocked",
        action: invocation.subcommand,
        extensionId: invocation.options.extensionIds[0],
        reason: "page-control-command-error",
        error: readErrorMessage(error),
        nextAction: "Check that the skfiy Chrome extension is installed, connected to the native host, and allowed on the target page, then retry."
      }, null, 2)}\n`);
      return 1;
    }
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

function createChromePageControlRequestId(
  action: string,
  generatedAt: string | undefined
): string {
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : NaN;
  const suffix = Number.isFinite(generatedAtMs)
    ? Math.trunc(generatedAtMs)
    : Date.now();
  return `page-control-${action}-cli-${suffix}`;
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
