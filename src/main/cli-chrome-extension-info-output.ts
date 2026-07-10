import {
  createCopyableCommandsFromSetupGuide,
  formatCommandLine
} from "./cli-chrome-readiness.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";

export function createChromeExtensionInfoOutput({
  invocation,
  generatedAt,
  extensionPath,
  manifestPath,
  manifest
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt: string;
  extensionPath: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
}): Record<string, unknown> {
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
    generatedAt,
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
