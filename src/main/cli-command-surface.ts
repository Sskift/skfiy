import path from "node:path";
import {
  existsSync
} from "node:fs";
import { spawn } from "node:child_process";
import {
  openDashboardUrl,
  runDashboardCli,
  runDashboardProbeCli,
  startSkfiyDashboardServer,
  type DashboardOpener,
  type DashboardServerStarter
} from "./cli-dashboard-command-runner.js";
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
  SMOKE_TARGETS,
  runSmokeScript,
  type SmokeRunnerInput,
  type SmokeRunnerResult,
  type SmokeTarget
} from "./cli-smoke-command.js";
import type { StatusReaderInput } from "./cli-status-reader-input.js";
import {
  createCliStatusReader
} from "./cli-status-reader.js";
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
import { createCliOutputSkeleton } from "./cli-output-skeleton.js";
import {
  openPermissionSettingsUrl,
  runPermissionSettingsOpenCli,
  type PermissionSettingsOpener
} from "./cli-permission-command-runner.js";
import {
  runDoctorCli,
  runOperatorStatusCli,
  runStatusCli,
  type SignatureReader,
  type SignatureReaderInput,
  type SignatureStatus,
  type StatusReader
} from "./cli-status-command-runner.js";
import { runSmokeCli } from "./cli-smoke-command-runner.js";
import { runSkinImportCli } from "./cli-skin-command-runner.js";
import {
  createChromeExtensionInfoOutputForRoot,
  runChromeHostPolicyCli,
  runChromeNativeHostCli,
  type ChromeExtensionReloader
} from "./cli-chrome-command-runner.js";
import {
  runMcpServeCli,
  startSkfiyMcpServer,
  type SkfiyMcpServer,
  type SkfiyMcpServerStarter,
  type SkfiyMcpServerStarterInput
} from "./cli-mcp-command-runner.js";

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

export type {
  SignatureReader,
  SignatureReaderInput,
  SignatureStatus,
  SkfiyMcpServer,
  SkfiyMcpServerStarter,
  SkfiyMcpServerStarterInput,
  StatusReader
};

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
  dashboardServerStarter?: DashboardServerStarter;
  dashboardOpener?: DashboardOpener;
  permissionSettingsOpener?: PermissionSettingsOpener;
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
  dashboardServerStarter = startSkfiyDashboardServer,
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
    return runSkinImportCli({
      invocation: result.invocation,
      generatedAt,
      homeDir: effectiveHomeDir,
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
    return runDashboardCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      homeDir: effectiveHomeDir,
      dashboardServerStarter,
      dashboardOpener,
      keepDashboardAlive,
      stdout
    });
  }

  stdout.write(`${JSON.stringify(createCliOutput(result.invocation, { generatedAt }), null, 2)}\n`);
  return 0;
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
