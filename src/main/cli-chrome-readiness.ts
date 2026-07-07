import {
  createChromeReadinessSetupGuide
} from "./chrome-readiness.js";
import type { ChromeHostPolicyState } from "./chrome-host-policy.js";
import {
  readRecord,
  readString,
  readStringArray
} from "./cli-record-utils.js";

export interface CliChromeSetupGuideInput {
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
}

export function createChromeSetupGuideFields(input: CliChromeSetupGuideInput): Record<string, unknown> {
  const setupGuide = createChromeSetupGuideOutput(input);

  return {
    nextAction: setupGuide.nextAction,
    setupGuide,
    copyableCommands: setupGuide.copyableCommands
  };
}

export function createChromeSetupGuideOutput(input: CliChromeSetupGuideInput): Record<string, unknown> {
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

export function createCopyableCommandsFromSetupGuide(setupGuide: {
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

export function formatCommandLine(commandLine: string[]): string {
  return commandLine.map(formatCommandArg).join(" ");
}

export function readExtensionIdsFromAdapterInput(nativeHost: {
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

function formatCommandArg(arg: string): string {
  return /^[A-Za-z0-9_./:@%#{}=-]+$/.test(arg)
    ? arg
    : JSON.stringify(arg);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
