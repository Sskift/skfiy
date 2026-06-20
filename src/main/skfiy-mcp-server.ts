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
