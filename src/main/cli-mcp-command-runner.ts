import path from "node:path";
import {
  SKFIY_MCP_TOOL_NAMES,
  runSkfiyMcpStdioServer,
  type SkfiyMcpProviders,
  type SkfiyMcpToolCallInput
} from "./skfiy-mcp-server.js";
import { createDoctorOutput, type CliDoctorSignatureStatus } from "./cli-doctor-output.js";
import {
  createStatusReaderInput,
  type StatusReaderInput
} from "./cli-status-reader-input.js";
import {
  withStatusReadiness
} from "./cli-status-capabilities.js";
import { readErrorMessage } from "./cli-record-utils.js";
import type {
  CliCommandInvocation,
  McpTransport
} from "./cli-command-normalization.js";

export interface McpCommandIo {
  write: (chunk: string) => unknown;
}

export type McpStatusReader = (input: StatusReaderInput) => Promise<Record<string, unknown>>;

export interface McpSignatureReaderInput {
  appPath: string;
}

export type McpSignatureStatus = CliDoctorSignatureStatus;

export type McpSignatureReader = (
  input: McpSignatureReaderInput
) => Promise<McpSignatureStatus>;

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

export async function runMcpServeCli({
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
  statusReader: McpStatusReader;
  signatureReader: McpSignatureReader;
  keepMcpServerAlive: boolean;
  stdout: McpCommandIo;
  stderr: McpCommandIo;
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
      ...createMcpServeOutput(invocation, generatedAt),
      result: "error",
      error: readErrorMessage(error)
    }, null, 2)}\n`);
    return 1;
  }

  if (invocation.json) {
    stdout.write(`${JSON.stringify({
      ...createMcpServeOutput(invocation, generatedAt),
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

export function createMcpProviders({
  rootDir,
  homeDir,
  generatedAt,
  statusReader,
  signatureReader
}: {
  rootDir: string;
  homeDir: string;
  generatedAt?: string;
  statusReader: McpStatusReader;
  signatureReader: McpSignatureReader;
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

export async function startSkfiyMcpServer(
  input: SkfiyMcpServerStarterInput
): Promise<SkfiyMcpServer> {
  return {
    transport: input.transport,
    tools: [...SKFIY_MCP_TOOL_NAMES],
    close: async () => undefined
  };
}

function createMcpServeOutput(
  invocation: Extract<CliCommandInvocation, { kind: "mcp-serve" }>,
  generatedAt: string | undefined
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: "mcp serve",
    generatedAt: generatedAt ?? new Date().toISOString(),
    transport: invocation.options.transport,
    result: "not-started",
    plannedMutation: false,
    executesSystemMutation: false,
    tools: [...SKFIY_MCP_TOOL_NAMES]
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
