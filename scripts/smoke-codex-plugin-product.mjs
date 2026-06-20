#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_MCP_ARGS,
  PRODUCT_PATH,
  classifyCodexPluginSmokeEvidence,
  createCodexPluginHelpText,
  createDefaultCodexPluginSmokeOptions,
  parseCodexPluginSmokeArgs,
  writeCodexPluginSmokeEvidence
} from "./smoke-codex-plugin-plan.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const defaults = createDefaultCodexPluginSmokeOptions(ROOT_DIR);
  const options = parseCodexPluginSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createCodexPluginHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    sourcePluginRoot: options.pluginRoot,
    installStagingDir: options.installStagingDir,
    marketplaceRoot: undefined,
    marketplaceManifestPath: undefined,
    marketplaceManifest: undefined,
    installedPluginRoot: undefined,
    pluginRoot: undefined,
    sourceMcpConfigPath: options.mcpConfigPath,
    mcpConfigPath: undefined,
    repoCheckoutUsedForMcp: undefined,
    mcpServerName: "skfiy",
    configuredCommand: undefined,
    configuredArgs: undefined,
    configuredEnv: undefined,
    packagedCliPath: options.cliPath,
    extensionIds: options.extensionIds,
    resolvedCommandPath: undefined,
    configuredCommandUsed: undefined,
    commandLookupPathPrepend: undefined,
    command: undefined,
    productPath: PRODUCT_PATH,
    runnerHasTmux: Boolean(process.env.TMUX),
    artifactPath: options.outputPath,
    requests: [],
    stdout: "",
    stderr: "",
    stdoutJsonRpcOnly: false,
    mcpExit: undefined,
    initialize: undefined,
    tools: [],
    status: undefined,
    responses: [],
    result: "not-run"
  };

  try {
    assertCodexPluginSmokeReady(options);

    const stagedInstall = await stageCodexPluginInstall(options);

    evidence.marketplaceRoot = stagedInstall.marketplaceRoot;
    evidence.marketplaceManifestPath = stagedInstall.marketplaceManifestPath;
    evidence.marketplaceManifest = stagedInstall.marketplaceManifest;
    evidence.installedPluginRoot = stagedInstall.installedPluginRoot;
    evidence.pluginRoot = stagedInstall.installedPluginRoot;
    evidence.mcpConfigPath = stagedInstall.mcpConfigPath;
    evidence.repoCheckoutUsedForMcp = false;

    const mcpServer = await readCodexPluginMcpServer(stagedInstall.mcpConfigPath);
    evidence.configuredCommand = mcpServer.command;
    evidence.configuredArgs = mcpServer.args;
    evidence.configuredEnv = mcpServer.env;
    evidence.command = [mcpServer.command, ...mcpServer.args];

    const session = await runCodexPluginMcpSession({
      configuredCommand: mcpServer.command,
      configuredArgs: mcpServer.args,
      configuredEnv: mcpServer.env,
      cliPath: options.cliPath,
      extensionIds: options.extensionIds,
      timeoutMs: options.timeoutMs
    });

    Object.assign(evidence, session);
    evidence.result = classifyCodexPluginSmokeEvidence(evidence);

    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    if (options.outputPath) {
      try {
        await writeCodexPluginSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertCodexPluginSmokeReady(options) {
  if (!existsSync(options.pluginRoot)) {
    throw new Error(`Codex plugin root is missing at ${options.pluginRoot}.`);
  }

  if (!existsSync(options.mcpConfigPath)) {
    throw new Error(`Codex plugin MCP config is missing at ${options.mcpConfigPath}.`);
  }

  if (!existsSync(options.cliPath)) {
    throw new Error(`Built CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }
}

export async function stageCodexPluginInstall(options) {
  const marketplaceRoot = path.join(options.installStagingDir, "marketplace");
  const installedPluginRoot = path.join(marketplaceRoot, "plugins", "skfiy");
  const marketplaceManifestPath = path.join(marketplaceRoot, "marketplace.json");
  const marketplaceManifest = createCodexPluginMarketplaceManifest();

  await rm(options.installStagingDir, { recursive: true, force: true });
  await mkdir(path.dirname(installedPluginRoot), { recursive: true });
  await cp(options.pluginRoot, installedPluginRoot, { recursive: true });
  await writeFile(marketplaceManifestPath, `${JSON.stringify(marketplaceManifest, null, 2)}\n`);

  return {
    marketplaceRoot,
    marketplaceManifestPath,
    marketplaceManifest,
    installedPluginRoot,
    mcpConfigPath: path.join(installedPluginRoot, ".mcp.json")
  };
}

function createCodexPluginMarketplaceManifest() {
  return {
    name: "skfiy-local",
    interface: {
      displayName: "skfiy Local"
    },
    plugins: [
      {
        name: "skfiy",
        source: {
          source: "local",
          path: "./plugins/skfiy"
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Productivity"
      }
    ]
  };
}

export async function readCodexPluginMcpServer(mcpConfigPath) {
  const config = JSON.parse(await readFile(mcpConfigPath, "utf8"));
  const server = config?.mcpServers?.skfiy;

  if (!server || typeof server !== "object") {
    throw new Error(`Missing mcpServers.skfiy in ${mcpConfigPath}.`);
  }

  if (server.command !== "skfiy") {
    throw new Error("Codex plugin MCP command must be the installed `skfiy` binary.");
  }

  if (!Array.isArray(server.args) || !sameStringArray(server.args, EXPECTED_MCP_ARGS)) {
    throw new Error("Codex plugin MCP args must be `mcp serve --stdio`.");
  }

  return {
    command: server.command,
    args: server.args,
    env: server.env && typeof server.env === "object" ? server.env : {}
  };
}

export function runCodexPluginMcpSession({
  configuredCommand,
  configuredArgs,
  configuredEnv,
  cliPath,
  extensionIds = [],
  timeoutMs
}) {
  const requests = createMcpRequests({ extensionIds });
  const commandLookupPathPrepend = path.dirname(cliPath);
  const commandLookupPath = [
    commandLookupPathPrepend,
    process.env.PATH ?? ""
  ].filter(Boolean).join(path.delimiter);
  const resolvedCommandPath = resolveConfiguredCommandPath(configuredCommand, commandLookupPath);

  return new Promise((resolve, reject) => {
    const child = spawn(configuredCommand, configuredArgs, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...configuredEnv,
        PATH: commandLookupPath
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Timed out waiting for Codex plugin MCP responses after ${timeoutMs}ms.`));
      }
    }, timeoutMs);
    const settle = (callback) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        callback();
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle(() => reject(error));
    });
    child.once("exit", (code, signal) => {
      settle(() => {
        const parsed = parseJsonRpcLines(stdout);
        const responses = parsed.responses;
        const initializeResponse = findResponse(responses, 1);
        const toolsResponse = findResponse(responses, 2);
        const statusResponse = findResponse(responses, 3);
        const tools = Array.isArray(toolsResponse?.result?.tools)
          ? toolsResponse.result.tools
            .map((tool) => tool?.name)
            .filter((name) => typeof name === "string")
          : [];

        resolve({
          commandLookupPathPrepend,
          resolvedCommandPath,
          configuredCommandUsed: true,
          requests: requests.map(summarizeRequest),
          stdout,
          stderr,
          stdoutJsonRpcOnly: parsed.ok,
          stdoutLineCount: parsed.lineCount,
          mcpExit: { code, signal },
          initialize: initializeResponse?.result,
          tools,
          status: statusResponse?.result?.structuredContent,
          responses: responses.map(summarizeResponse),
          parseErrors: parsed.errors
        });
      });
    });

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    child.stdin.end();
  });
}

function resolveConfiguredCommandPath(command, lookupPath) {
  for (const directory of String(lookupPath ?? "").split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    const candidate = path.join(directory, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function createMcpRequests({ extensionIds = [] } = {}) {
  const statusArguments = extensionIds.length > 0
    ? { extensionIds }
    : {};

  return [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "skfiy-codex-plugin-smoke",
          version: "0.1.0"
        }
      }
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "skfiy.status",
        arguments: statusArguments
      }
    }
  ];
}

function parseJsonRpcLines(stdout) {
  const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
  const responses = [];
  const errors = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      if (parsed?.jsonrpc === "2.0") {
        responses.push(parsed);
      } else {
        errors.push(`Not a JSON-RPC response: ${line}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: lines.length > 0 && errors.length === 0,
    lineCount: lines.length,
    responses,
    errors
  };
}

function findResponse(responses, id) {
  return responses.find((response) => response?.id === id);
}

function summarizeRequest(request) {
  const args = request.params?.arguments;
  const extensionIds = Array.isArray(args?.extensionIds)
    ? args.extensionIds.filter((item) => typeof item === "string")
    : undefined;

  return {
    id: request.id,
    method: request.method,
    ...(request.method === "tools/call" ? { tool: request.params?.name } : {}),
    ...(extensionIds?.length ? { extensionIds } : {})
  };
}

function summarizeResponse(response) {
  return {
    id: response.id,
    ok: !response.error,
    ...(response.error ? { error: response.error } : {})
  };
}

function sameStringArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((item, index) => item === right[index]);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
