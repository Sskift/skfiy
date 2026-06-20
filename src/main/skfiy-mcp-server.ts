export const SKFIY_MCP_TOOL_NAMES = [
  "skfiy.status",
  "skfiy.doctor"
] as const;

export type SkfiyMcpToolName = typeof SKFIY_MCP_TOOL_NAMES[number];

export interface SkfiyMcpToolCallInput {
  extensionIds?: string[];
  dashboardUrl?: string;
}

export interface SkfiyMcpProviders {
  readStatus: (input: SkfiyMcpToolCallInput) => Promise<Record<string, unknown>>;
  readDoctor: (input: SkfiyMcpToolCallInput) => Promise<Record<string, unknown>>;
}

export interface SkfiyMcpStdioServerInput {
  stdin: AsyncIterable<Buffer | Uint8Array | string> | Iterable<Buffer | Uint8Array | string>;
  stdout: {
    write: (chunk: string) => unknown;
  };
  stderr: {
    write: (chunk: string) => unknown;
  };
  providers: SkfiyMcpProviders;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      result: Record<string, unknown>;
    }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: {
        code: number;
        message: string;
      };
    };

export function createSkfiyMcpToolDefinitions(): Array<Record<string, unknown>> {
  return [
    {
      name: "skfiy.status",
      description: "Read skfiy app, helper, permission, extension, native host, and dashboard status.",
      inputSchema: createToolInputSchema(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    },
    {
      name: "skfiy.doctor",
      description: "Read skfiy diagnostics and concrete remediation actions.",
      inputSchema: createToolInputSchema(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    }
  ];
}

export async function handleSkfiyMcpRequest(
  request: JsonRpcRequest,
  providers: SkfiyMcpProviders
): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "skfiy",
          version: "0.1.0"
        },
        capabilities: {
          tools: {
            listChanged: false
          }
        }
      }
    };
  }

  if (request.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: createSkfiyMcpToolDefinitions()
      }
    };
  }

  if (request.method === "tools/call") {
    return handleToolCall(id, request.params, providers);
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Unsupported skfiy MCP method: ${request.method}`
    }
  };
}

export async function runSkfiyMcpStdioServer({
  stdin,
  stdout,
  stderr,
  providers
}: SkfiyMcpStdioServerInput): Promise<number> {
  let pending = "";
  let exitCode = 0;

  for await (const chunk of stdin) {
    pending += decodeStdioChunk(chunk);
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      const result = await handleStdioLine(line, providers, stdout, stderr);
      if (result !== 0) {
        exitCode = result;
      }
    }
  }

  if (pending.trim().length > 0) {
    const result = await handleStdioLine(pending, providers, stdout, stderr);
    if (result !== 0) {
      exitCode = result;
    }
  }

  return exitCode;
}

async function handleToolCall(
  id: string | number | null,
  params: unknown,
  providers: SkfiyMcpProviders
): Promise<JsonRpcResponse> {
  const record = readRecord(params);
  const toolName = typeof record?.name === "string" ? record.name : "";
  const input = normalizeToolInput(record?.arguments);

  if (toolName === "skfiy.status") {
    return createToolResult(id, await providers.readStatus(input));
  }

  if (toolName === "skfiy.doctor") {
    return createToolResult(id, await providers.readDoctor(input));
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32602,
      message: `Unknown skfiy MCP tool: ${toolName}`
    }
  };
}

async function handleStdioLine(
  line: string,
  providers: SkfiyMcpProviders,
  stdout: { write: (chunk: string) => unknown },
  stderr: { write: (chunk: string) => unknown }
): Promise<number> {
  const trimmed = line.trim();

  if (!trimmed) {
    return 0;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    stderr.write(`Invalid MCP JSON-RPC message: ${readErrorMessage(error)}\n`);
    return 1;
  }

  const request = readJsonRpcRequest(parsed);
  if (!request) {
    stderr.write("Invalid MCP JSON-RPC message: expected a JSON-RPC 2.0 request object.\n");
    return 1;
  }

  if (request.id === undefined || request.id === null) {
    return 0;
  }

  const response = await handleSkfiyMcpRequest(request, providers);
  stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}

function readJsonRpcRequest(value: unknown): JsonRpcRequest | undefined {
  const record = readRecord(value);

  if (record?.jsonrpc !== "2.0" || typeof record.method !== "string") {
    return undefined;
  }

  return {
    jsonrpc: "2.0",
    id: typeof record.id === "string" || typeof record.id === "number" || record.id === null
      ? record.id
      : undefined,
    method: record.method,
    ...(Object.hasOwn(record, "params") ? { params: record.params } : {})
  };
}

function decodeStdioChunk(chunk: Buffer | Uint8Array | string): string {
  return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
}

function createToolResult(
  id: string | number | null,
  structuredContent: Record<string, unknown>
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify(structuredContent)
        }
      ],
      structuredContent
    }
  };
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createToolInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      extensionIds: {
        type: "array",
        items: { type: "string" },
        description: "Chrome extension ids to include when reading Native Messaging host status."
      },
      dashboardUrl: {
        type: "string",
        description: "Optional loopback dashboard URL to probe."
      }
    }
  };
}

function normalizeToolInput(value: unknown): SkfiyMcpToolCallInput {
  const record = readRecord(value) ?? {};
  const extensionIds = Array.isArray(record.extensionIds)
    ? record.extensionIds.filter((item): item is string => typeof item === "string")
    : undefined;

  return {
    ...(extensionIds ? { extensionIds } : {}),
    ...(typeof record.dashboardUrl === "string" ? { dashboardUrl: record.dashboardUrl } : {})
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
