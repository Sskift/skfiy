import { describe, expect, it } from "vitest";
import {
  SKFIY_MCP_SAFETY_INSTRUCTIONS,
  SKFIY_MCP_TOOL_NAMES,
  createSkfiyMcpToolDefinitions,
  handleSkfiyMcpRequest,
  runSkfiyMcpStdioServer
} from "./skfiy-mcp-server";

describe("skfiy MCP server contract", () => {
  it("advertises status and doctor as read-only MCP tools", () => {
    expect(SKFIY_MCP_TOOL_NAMES).toEqual([
      "skfiy.status",
      "skfiy.doctor"
    ]);
    expect(createSkfiyMcpToolDefinitions()).toEqual([
      expect.objectContaining({
        name: "skfiy.status",
        description: expect.stringContaining("status"),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false
        }
      }),
      expect.objectContaining({
        name: "skfiy.doctor",
        description: expect.stringContaining("diagnostics"),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false
        }
      })
    ]);
  });

  it("handles initialize, tools/list, and status tool calls through JSON-RPC", async () => {
    const calls: unknown[] = [];
    expect(SKFIY_MCP_SAFETY_INSTRUCTIONS).toContain("read-only");
    expect(SKFIY_MCP_SAFETY_INSTRUCTIONS).toContain("explicit user approval");
    expect(SKFIY_MCP_SAFETY_INSTRUCTIONS).toContain("standalone skfiy app");

    await expect(handleSkfiyMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize"
    }, {
      readStatus: async () => ({}),
      readDoctor: async () => ({})
    })).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "skfiy"
        },
        instructions: SKFIY_MCP_SAFETY_INSTRUCTIONS,
        capabilities: {
          tools: {
            listChanged: false
          }
        }
      }
    });

    await expect(handleSkfiyMcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }, {
      readStatus: async () => ({}),
      readDoctor: async () => ({})
    })).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          expect.objectContaining({ name: "skfiy.status" }),
          expect.objectContaining({ name: "skfiy.doctor" })
        ]
      }
    });

    await expect(handleSkfiyMcpRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "skfiy.status",
        arguments: {
          extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
          dashboardUrl: "http://127.0.0.1:8787/"
        }
      }
    }, {
      readStatus: async (input) => {
        calls.push(input);
        return {
          schemaVersion: 1,
          command: "status",
          app: { state: "installed" }
        };
      },
      readDoctor: async () => ({})
    })).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        isError: false,
        content: [
          {
            type: "text",
            text: expect.stringContaining("\"command\":\"status\"")
          }
        ],
        structuredContent: {
          schemaVersion: 1,
          command: "status",
          app: { state: "installed" }
        }
      }
    });
    expect(calls).toEqual([{
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      dashboardUrl: "http://127.0.0.1:8787/"
    }]);
  });

  it("handles doctor calls and rejects unknown tools without throwing", async () => {
    await expect(handleSkfiyMcpRequest({
      jsonrpc: "2.0",
      id: "doctor-1",
      method: "tools/call",
      params: {
        name: "skfiy.doctor",
        arguments: {}
      }
    }, {
      readStatus: async () => ({}),
      readDoctor: async () => ({
        schemaVersion: 1,
        command: "doctor",
        result: "needs-action"
      })
    })).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "doctor-1",
      result: {
        isError: false,
        structuredContent: {
          command: "doctor",
          result: "needs-action"
        }
      }
    });

    await expect(handleSkfiyMcpRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "skfiy.write-file",
        arguments: {}
      }
    }, {
      readStatus: async () => ({}),
      readDoctor: async () => ({})
    })).resolves.toEqual({
      jsonrpc: "2.0",
      id: 4,
      error: {
        code: -32602,
        message: "Unknown skfiy MCP tool: skfiy.write-file"
      }
    });
  });

  it("runs newline-delimited JSON-RPC over stdio without writing logs to stdout", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const stdin = [
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })}\n`,
      `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`
    ];

    await expect(runSkfiyMcpStdioServer({
      stdin,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      providers: {
        readStatus: async () => ({}),
        readDoctor: async () => ({})
      }
    })).resolves.toBe(0);

    const messages = stdout.join("").trim().split("\n").map((line) => JSON.parse(line));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: { name: "skfiy" }
      }
    });
    expect(messages[0].result.instructions).toBe(SKFIY_MCP_SAFETY_INSTRUCTIONS);
    expect(messages[1]).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          expect.objectContaining({ name: "skfiy.status" }),
          expect.objectContaining({ name: "skfiy.doctor" })
        ]
      }
    });
    expect(stderr).toEqual([]);
  });

  it("reports malformed MCP stdio input to stderr without contaminating stdout", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyMcpStdioServer({
      stdin: ["not-json\n"],
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      providers: {
        readStatus: async () => ({}),
        readDoctor: async () => ({})
      }
    })).resolves.toBe(1);

    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("Invalid MCP JSON-RPC message");
  });
});
