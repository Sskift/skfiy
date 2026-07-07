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
  readLatestDashboardSmokeEvidence,
  readRuntimeSnapshotEvidence
} from "./cli-status-evidence.js";
import { formatStatusTextOutput } from "./cli-status-output.js";
import {
  MONEY_RUN_SESSION_NAME,
  createBinaryReadinessEvidence
} from "./cli-status-readiness.js";
import {
  createChromeSetupGuideFields
} from "./cli-chrome-readiness.js";
import {
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
import {
  createChromeExtensionAdapterStatus,
  createChromePageControlCapability,
  readConnectionState
} from "./cli-chrome-capabilities.js";
import { createOperatorStatusOutput } from "./cli-operator-status-output.js";
import { createChromeExtensionInfoOutput } from "./cli-chrome-extension-info-output.js";
import { createCliOutputSkeleton } from "./cli-output-skeleton.js";
import {
  createCliStatusReadinessSummary,
  withStatusReadiness
} from "./cli-status-capabilities.js";
import { createDoctorOutput } from "./cli-doctor-output.js";
import {
  createChromeExtensionReloadErrorOutput,
  createChromeExtensionReloadOutput,
  createChromeHostPolicyResetOutput,
  createChromeHostPolicySetOutput,
  createChromeHostPolicyShowOutput,
  createChromeNativeHostMutationOutput,
  createChromePageControlErrorOutput,
  createChromePageControlOutput,
  createChromeStatusOutput,
  createChromeTabsErrorOutput,
  createChromeTabsOutput,
  type ChromeExtensionRegistrationStatus
} from "./cli-chrome-command-output.js";

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

  return createCliOutputSkeleton(invocation, {
    generatedAt,
    createChromeExtensionInfoOutput: ({ invocation, generatedAt }) => createChromeExtensionInfoOutputForRoot({
      invocation,
      generatedAt,
      rootDir: inferRootDirFromCliShimPath(invocation.options.cliShimPath)
    })
  });
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
      result: "probed",
      createReadinessSummary: createCliStatusReadinessSummary
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

function createChromeExtensionInfoOutputForRoot({
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

  return createChromeExtensionInfoOutput({
    invocation,
    generatedAt: generatedAt ?? new Date().toISOString(),
    extensionPath,
    manifestPath,
    manifest: readChromeExtensionManifest(manifestPath)
  });
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
    stdout.write(`${JSON.stringify(createChromeExtensionInfoOutputForRoot({
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

    stdout.write(`${JSON.stringify(createChromeStatusOutput({
      invocation,
      generatedAt,
      extension,
      nativeHost,
      setupGuideFields
    }), null, 2)}\n`);
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
      stdout.write(`${JSON.stringify(createChromeTabsOutput({
        invocation,
        generatedAt,
        tabDiscoveryResult,
        extensionRegistration
      }), null, 2)}\n`);
      return tabDiscoveryResult.result === "blocked" ? 1 : 0;
    } catch (error) {
      stdout.write(`${JSON.stringify(createChromeTabsErrorOutput({
        invocation,
        generatedAt,
        error
      }), null, 2)}\n`);
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
      stdout.write(`${JSON.stringify(createChromeExtensionReloadOutput({
        invocation,
        generatedAt,
        reloadResult,
        extensionRegistration
      }), null, 2)}\n`);
      return reloadResult.result === "blocked" ? 1 : 0;
    } catch (error) {
      stdout.write(`${JSON.stringify(createChromeExtensionReloadErrorOutput({
        invocation,
        generatedAt,
        error,
        productPath: CHROME_EXTENSION_RELOAD_PRODUCT_PATH
      }), null, 2)}\n`);
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
      stdout.write(`${JSON.stringify(createChromePageControlOutput({
        invocation,
        generatedAt,
        pageControlResult
      }), null, 2)}\n`);
      return pageControlResult.result === "blocked" ? 1 : 0;
    } catch (error) {
      stdout.write(`${JSON.stringify(createChromePageControlErrorOutput({
        invocation,
        generatedAt,
        error
      }), null, 2)}\n`);
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
    stdout.write(`${JSON.stringify(createChromeNativeHostMutationOutput({
      invocation,
      generatedAt,
      result: installResult
    }), null, 2)}\n`);
    return 0;
  }

  const uninstallResult = await uninstallChromeNativeHost({
    homeDir,
    cliShimPath: invocation.options.cliShimPath,
    extensionIds: invocation.options.extensionIds,
    io
  });
  stdout.write(`${JSON.stringify(createChromeNativeHostMutationOutput({
    invocation,
    generatedAt,
    result: uninstallResult
  }), null, 2)}\n`);
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

    stdout.write(`${JSON.stringify(createChromeHostPolicyShowOutput({
      invocation,
      generatedAt,
      hostPolicy
    }), null, 2)}\n`);
    return 0;
  }

  if (invocation.subcommand === "reset") {
    const hostPolicy = await resetChromeHostPolicyState({
      homeDir,
      io
    });

    stdout.write(`${JSON.stringify(createChromeHostPolicyResetOutput({
      invocation,
      generatedAt,
      hostPolicy
    }), null, 2)}\n`);
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

  stdout.write(`${JSON.stringify(createChromeHostPolicySetOutput({
    invocation,
    generatedAt,
    host,
    hostPolicy
  }), null, 2)}\n`);
  return 0;
}
