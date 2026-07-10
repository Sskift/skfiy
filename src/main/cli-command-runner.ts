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
  type ChromeExtensionPageControlInvoker,
  type ChromeExtensionTabDiscoveryInvoker
} from "./chrome-extension-page-control.js";
import {
  runSmokeScript,
  type SmokeRunnerInput,
  type SmokeRunnerResult
} from "./cli-smoke-command.js";
import {
  createCliStatusReader
} from "./cli-status-reader.js";
import {
  normalizeCliCommand
} from "./cli-command-normalization.js";
import {
  createCliOutput
} from "./cli-command-output.js";
import { readCodeSignatureStatus } from "./cli-code-signature-reader.js";
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
  type StatusReader
} from "./cli-status-command-runner.js";
import { runCommand } from "./cli-process-command-runner.js";
import { runSmokeCli } from "./cli-smoke-command-runner.js";
import { runSkinImportCli } from "./cli-skin-command-runner.js";
import {
  runChromeHostPolicyCli,
  runChromeNativeHostCli,
  type ChromeExtensionReloader
} from "./cli-chrome-command-runner.js";
import {
  runMcpServeCli,
  startSkfiyMcpServer,
  type SkfiyMcpServerStarter
} from "./cli-mcp-command-runner.js";

export interface SkfiyCliIo {
  write: (chunk: string) => unknown;
}

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
