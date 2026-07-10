import path from "node:path";
import {
  installChromeNativeHost,
  readChromeExtensionConnectionStatus,
  readChromeNativeHostStatus,
  uninstallChromeNativeHost,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";
import {
  applyChromeHostPolicyAction,
  readChromeHostPolicyState,
  resetChromeHostPolicyState,
  writeChromeHostPolicyState
} from "./chrome-host-policy.js";
import {
  CHROME_EXTENSION_RELOAD_PRODUCT_PATH,
  readChromeExtensionOpenerAppName,
  type ChromeExtensionReloadInput,
  type ChromeExtensionReloadResult
} from "./chrome-extension-reloader.js";
import type {
  ChromeExtensionPageControlInvoker,
  ChromeExtensionTabDiscoveryInvoker
} from "./chrome-extension-page-control.js";
import { createChromeExtensionAdapterStatus, readConnectionState } from "./cli-chrome-capabilities.js";
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
  createChromeTabsOutput
} from "./cli-chrome-command-output.js";
import { createChromeExtensionInfoOutput } from "./cli-chrome-extension-info-output.js";
import {
  readChromeExtensionManifest,
  readChromeExtensionRegistrationStatus
} from "./cli-chrome-extension-files.js";
import { createChromeSetupGuideFields } from "./cli-chrome-readiness.js";
import {
  isChromePageControlSubcommand,
  normalizeChromePolicyHostForCli,
  type CliCommandInvocation
} from "./cli-command-normalization.js";
import { readString } from "./cli-record-utils.js";
import { readChromeHostPolicyForStatus } from "./cli-status-reader.js";

export type ChromeExtensionReloader = (
  input: ChromeExtensionReloadInput
) => Promise<ChromeExtensionReloadResult>;

export interface ChromeCommandIo {
  write: (chunk: string) => unknown;
}

export function createChromeExtensionInfoOutputForRoot({
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

export async function runChromeNativeHostCli({
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
  stdout: ChromeCommandIo;
  stderr: ChromeCommandIo;
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
    const hostPolicy = await readChromeHostPolicyForStatus({ homeDir }, io);
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

export async function runChromeHostPolicyCli({
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
  stdout: ChromeCommandIo;
  stderr: ChromeCommandIo;
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
