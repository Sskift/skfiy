import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const PRODUCT_PATH = "plugin scaffold -> staged marketplace install -> .mcp.json -> packaged skfiy CLI -> MCP stdio";
export const DEFAULT_TIMEOUT_MS = 8_000;
export const EXPECTED_MCP_ARGS = ["mcp", "serve", "--stdio"];
export const EXPECTED_MCP_TOOLS = ["skfiy.status", "skfiy.doctor"];

export function createDefaultCodexPluginSmokeOptions(rootDir) {
  const pluginRoot = path.join(rootDir, "plugins", "skfiy");

  return {
    pluginRoot,
    installStagingDir: path.join(rootDir, ".skfiy-plugin-install", "codex-plugin"),
    mcpConfigPath: path.join(pluginRoot, ".mcp.json"),
    cliPath: path.join(rootDir, "dist", "skfiy"),
    extensionIds: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseCodexPluginSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--plugin-root":
        options.pluginRoot = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--install-staging-dir":
        options.installStagingDir = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--mcp-config":
        options.mcpConfigPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--cli":
        options.cliPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--extension-id":
        options.extensionIds = [
          ...(Array.isArray(options.extensionIds) ? options.extensionIds : []),
          readRequiredValue(argv, index, arg)
        ];
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readRequiredValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown Codex plugin smoke option: ${arg}`);
    }
  }

  return options;
}

export function classifyCodexPluginSmokeEvidence(evidence) {
  if (
    !evidence
    || evidence.runnerHasTmux
    || evidence.productPath !== PRODUCT_PATH
    || evidence.mcpServerName !== "skfiy"
    || evidence.repoCheckoutUsedForMcp !== false
    || !hasValidMarketplaceInstall(evidence)
    || evidence.configuredCommand !== "skfiy"
    || evidence.configuredCommandUsed !== true
    || !isBuiltCliPath(evidence.resolvedCommandPath)
    || path.normalize(evidence.resolvedCommandPath) !== path.normalize(evidence.packagedCliPath)
    || !isPackagedCliDirectory(evidence.commandLookupPathPrepend, evidence.packagedCliPath)
    || !sameStringArray(evidence.configuredArgs, EXPECTED_MCP_ARGS)
    || !isBuiltCliPath(evidence.packagedCliPath)
    || !sameStringArray(evidence.command, [evidence.configuredCommand, ...EXPECTED_MCP_ARGS])
    || evidence.stdoutJsonRpcOnly !== true
    || evidence.mcpExit?.code !== 0
    || evidence.mcpExit?.signal !== null
    || !hasSkfiySafetyInstructions(evidence.initialize?.instructions)
    || !hasRequest(evidence.requests, "initialize")
    || !hasRequest(evidence.requests, "tools/list")
    || !hasToolCallRequest(evidence.requests, "skfiy.status")
    || !containsAllStrings(evidence.tools, EXPECTED_MCP_TOOLS)
  ) {
    return "failed";
  }

  const status = evidence.status;
  const nativeHost = status?.nativeHost;
  const extensionIds = Array.isArray(evidence.extensionIds)
    ? evidence.extensionIds
    : [];

  if (
    status?.schemaVersion !== 1
    || status?.command !== "status"
    || !status?.app
    || !status?.helper
    || !status?.permissions
    || !nativeHost
    || typeof nativeHost.cliShimPath !== "string"
    || !isBuiltCliPath(nativeHost.cliShimPath)
  ) {
    return "failed";
  }

  if (extensionIds.length > 0 && !hasPluginChromeBridgeStatus(status, extensionIds)) {
    return "failed";
  }

  return "passed";
}

export function createCodexPluginHelpText(defaults) {
  return `Usage: npm run smoke:codex-plugin -- [options]

Runs the repo-local Codex plugin scaffold through the packaged skfiy MCP path:
plugin scaffold -> .mcp.json -> dist/skfiy mcp serve --stdio -> skfiy.status.

Options:
  --plugin-root <path>  Codex plugin root. Default: ${defaults.pluginRoot}
  --install-staging-dir <path>
                         Temporary installed-plugin staging root. Default: ${defaults.installStagingDir}
  --mcp-config <path>   Plugin MCP config path. Default: ${defaults.mcpConfigPath}
  --cli <path>          Built CLI path. Default: ${defaults.cliPath}
  --extension-id <id>   Optional Chrome extension id to pass through skfiy.status.
  --timeout-ms <ms>     Wait time for MCP responses. Default: ${defaults.timeoutMs}
  --output <path>       Persist JSON evidence to a file.
  --require-passed      Exit 2 unless the Codex plugin smoke result is passed.
  -h, --help            Show this help.
`;
}

export async function writeCodexPluginSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);

  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function readRequiredValue(argv, index, name) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function sameStringArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((item, index) => item === right[index]);
}

function containsAllStrings(values, expected) {
  return Array.isArray(values)
    && expected.every((item) => values.includes(item));
}

function hasRequest(requests, method) {
  return Array.isArray(requests)
    && requests.some((request) => request?.method === method);
}

function hasToolCallRequest(requests, tool) {
  return Array.isArray(requests)
    && requests.some((request) => request?.method === "tools/call" && request?.tool === tool);
}

function isBuiltCliPath(cliPath) {
  if (typeof cliPath !== "string") {
    return false;
  }

  const normalized = path.normalize(cliPath);

  return path.basename(normalized) === "skfiy"
    && path.basename(path.dirname(normalized)) === "dist";
}

function isPackagedCliDirectory(directory, cliPath) {
  return typeof directory === "string"
    && typeof cliPath === "string"
    && path.normalize(directory) === path.dirname(path.normalize(cliPath));
}

function hasSkfiySafetyInstructions(instructions) {
  if (typeof instructions !== "string") {
    return false;
  }

  const normalized = instructions.toLowerCase();

  return normalized.includes("read-only")
    && normalized.includes("explicit user approval")
    && normalized.includes("standalone skfiy app")
    && normalized.includes("app policy")
    && normalized.includes("replay evidence");
}

function hasValidMarketplaceInstall(evidence) {
  if (
    typeof evidence.sourcePluginRoot !== "string"
    || typeof evidence.installStagingDir !== "string"
    || typeof evidence.marketplaceRoot !== "string"
    || typeof evidence.marketplaceManifestPath !== "string"
    || typeof evidence.installedPluginRoot !== "string"
    || evidence.pluginRoot !== evidence.installedPluginRoot
    || evidence.sourcePluginRoot === evidence.installedPluginRoot
    || evidence.mcpConfigPath !== path.join(evidence.installedPluginRoot, ".mcp.json")
  ) {
    return false;
  }

  const manifest = evidence.marketplaceManifest;
  const entry = Array.isArray(manifest?.plugins)
    ? manifest.plugins.find((plugin) => plugin?.name === "skfiy")
    : undefined;

  if (
    manifest?.name !== "skfiy-local"
    || manifest?.interface?.displayName !== "skfiy Local"
    || entry?.source?.source !== "local"
    || entry?.source?.path !== "./plugins/skfiy"
    || entry?.policy?.installation !== "AVAILABLE"
    || entry?.policy?.authentication !== "ON_INSTALL"
    || entry?.category !== "Productivity"
  ) {
    return false;
  }

  return path.normalize(path.join(evidence.marketplaceRoot, entry.source.path))
    === path.normalize(evidence.installedPluginRoot);
}

function hasPluginChromeBridgeStatus(status, extensionIds) {
  const nativeHost = status?.nativeHost;
  const extension = status?.extension;
  const allowedLiveConnectionStates = new Set(["unknown", "connected", "stale"]);
  const allowedNativeHostStates = new Set([
    "installed",
    "missing",
    "mismatched",
    "cli-missing",
    "invalid"
  ]);

  return extensionIds.length > 0
    && allowedNativeHostStates.has(nativeHost?.state)
    && nativeHost?.hostName === "com.sskift.skfiy"
    && typeof nativeHost?.manifestPath === "string"
    && nativeHost.manifestPath.includes("NativeMessagingHosts/com.sskift.skfiy.json")
    && typeof nativeHost?.cliShimPath === "string"
    && isBuiltCliPath(nativeHost.cliShimPath)
    && extensionIds.every((extensionId) => nativeHost.allowedOrigins?.includes(`chrome-extension://${extensionId}/`)
      || nativeHost.extensionIds?.includes(extensionId)
      || nativeHost.reason)
    && typeof extension?.state === "string"
    && extension.state !== "unknown"
    && extension?.bridge === "native-messaging"
    && allowedLiveConnectionStates.has(extension?.liveConnection)
    && typeof extension?.nativeHostState === "string";
}
