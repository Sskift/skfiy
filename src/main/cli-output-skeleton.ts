import { createDashboardDescriptor } from "./dashboard-status.js";
import { CHROME_EXTENSION_RELOAD_PRODUCT_PATH } from "./chrome-extension-reloader.js";
import {
  createChromeExtensionStatusWithPageCapabilities
} from "./cli-chrome-capabilities.js";
import {
  CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY,
  CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY,
  createCliCommandSurface
} from "./cli-command-definitions.js";
import {
  isChromePageControlSubcommand,
  type CliCommandInvocation
} from "./cli-command-normalization.js";
import {
  createDashboardProbeNotRunOutput
} from "./cli-dashboard-probe-output.js";
import {
  createPermissionSettingsOpenOutput
} from "./cli-permission-settings-output.js";
import { createOperatorStatusOutput } from "./cli-operator-status-output.js";
import { createUnknownMoneyRunStatus } from "./cli-status-readiness.js";
import {
  createCliStatusReadinessSummary,
  withStatusReadiness
} from "./cli-status-capabilities.js";
import { SKFIY_MCP_TOOL_NAMES } from "./skfiy-mcp-server.js";

export type CliChromeExtensionInfoOutputFactory = (input: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt: string;
}) => Record<string, unknown>;

export function createCliOutputSkeleton(
  invocation: CliCommandInvocation,
  {
    generatedAt,
    createChromeExtensionInfoOutput
  }: {
    generatedAt: string;
    createChromeExtensionInfoOutput: CliChromeExtensionInfoOutputFactory;
  }
): Record<string, unknown> {
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
    const status = createUnknownStatusSkeleton(invocation.options);

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
    const status = createUnknownStatusSkeleton(invocation.options);

    return createOperatorStatusOutput({
      invocation,
      generatedAt,
      status: withStatusReadiness(status, invocation.options),
      result: "not-run",
      createReadinessSummary: createCliStatusReadinessSummary
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
    return createChromeOutputSkeleton(invocation, {
      generatedAt,
      createChromeExtensionInfoOutput
    });
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

function createUnknownStatusSkeleton(options: {
  cliShimPath: string;
  extensionIds: string[];
  dashboardUrl?: string;
}): Record<string, unknown> {
  return {
    app: { state: "unknown" },
    cli: { state: "unknown", path: options.cliShimPath },
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
        cliShimPath: options.cliShimPath,
        extensionIds: options.extensionIds
      },
      context: options
    }),
    nativeHost: {
      state: "unknown",
      cliShimPath: options.cliShimPath,
      extensionIds: options.extensionIds
    },
    dashboard: options.dashboardUrl
      ? { state: "unknown", url: options.dashboardUrl }
      : { state: "not-running" },
    moneyRun: createUnknownMoneyRunStatus()
  };
}

function createChromeOutputSkeleton(
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>,
  {
    generatedAt,
    createChromeExtensionInfoOutput
  }: {
    generatedAt: string;
    createChromeExtensionInfoOutput: CliChromeExtensionInfoOutputFactory;
  }
): Record<string, unknown> {
  if (invocation.subcommand === "extension-info") {
    return createChromeExtensionInfoOutput({
      invocation,
      generatedAt
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
