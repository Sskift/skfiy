import path from "node:path";
import {
  existsSync
} from "node:fs";
import { spawn } from "node:child_process";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  startDashboardServer,
  type DashboardServer
} from "./dashboard-server.js";
import {
  createDashboardServerState,
  writeDashboardServerState
} from "./dashboard-server-state.js";
import type { ChromeNativeHostIo } from "./chrome-native-host.js";
import {
  reloadChromeExtensionWithDesktopControl
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
  SMOKE_TARGETS,
  parseSmokeJson,
  runSmokeScript,
  type SmokeRunnerInput,
  type SmokeRunnerResult,
  type SmokeTarget
} from "./cli-smoke-command.js";
import {
  readErrorMessage,
  readRecord
} from "./cli-record-utils.js";
import {
  sanitizeSensitiveString,
  sanitizeTokenFree
} from "./cli-output-sanitize.js";
import { withCliStatusEvidence } from "./cli-status-evidence.js";
import {
  createStatusReaderInput,
  type StatusReaderInput
} from "./cli-status-reader-input.js";
import {
  createCliStatusReader,
} from "./cli-status-reader.js";
import { formatStatusTextOutput } from "./cli-status-output.js";
import {
  createCliCommandSurface,
  type CliCommandDefinition,
  type CliCommandSurface
} from "./cli-command-definitions.js";
import {
  PERMISSION_SETTINGS_TARGETS,
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
  createDashboardDescriptorUrl,
  createDashboardFetchSummary,
  createDashboardOperatorEvidenceUrl,
  createDashboardProbeNotRunOutput,
  createDashboardSnapshotUrl,
  createDashboardStatusSnapshotSummary
} from "./cli-dashboard-probe-output.js";
import {
  fetchDashboardJson
} from "./cli-dashboard-status-reader.js";
import {
  createPermissionSettingsOpenOutput,
  createPermissionSettingsOpenUrl
} from "./cli-permission-settings-output.js";
import { createOperatorStatusOutput } from "./cli-operator-status-output.js";
import { createCliOutputSkeleton } from "./cli-output-skeleton.js";
import {
  createCliStatusReadinessSummary,
  withStatusReadiness
} from "./cli-status-capabilities.js";
import { createDoctorOutput } from "./cli-doctor-output.js";
import {
  createChromeExtensionInfoOutputForRoot,
  runChromeHostPolicyCli,
  runChromeNativeHostCli,
  type ChromeExtensionReloader
} from "./cli-chrome-command-runner.js";

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
  SmokeTarget,
  ChromeExtensionReloader,
  ChromeExtensionPageControlInput,
  ChromeExtensionPageControlInvoker,
  ChromeExtensionPageControlResult,
  ChromeExtensionTabDiscoveryInput,
  ChromeExtensionTabDiscoveryInvoker,
  ChromeExtensionTabDiscoveryResult
};
export type { StatusReaderInput };

export interface CreateCliOutputOptions {
  generatedAt?: string;
}

export interface SkfiyCliIo {
  write: (chunk: string) => unknown;
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
  statusReader,
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
  const effectiveStatusReader = statusReader ?? createCliStatusReader({
    commandRunner: runCommand
  });
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
      statusReader: effectiveStatusReader,
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
      statusReader: effectiveStatusReader,
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
      statusReader: effectiveStatusReader,
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
      statusReader: effectiveStatusReader,
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
