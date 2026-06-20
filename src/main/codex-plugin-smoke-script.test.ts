import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Codex plugin product smoke script", () => {
  it("is exposed as an npm script and exercises the plugin MCP product path", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const sourcePath = path.join(process.cwd(), "scripts/smoke-codex-plugin-product.mjs");

    expect(existsSync(sourcePath)).toBe(true);
    expect(packageJson.scripts).toMatchObject({
      "smoke:codex-plugin": "node scripts/smoke-codex-plugin-product.mjs"
    });

    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("readCodexPluginMcpServer");
    expect(source).toContain("runCodexPluginMcpSession");
    expect(source).toContain("EXPECTED_MCP_ARGS");
    expect(source).toContain("skfiy.status");
    expect(source).toContain("tools/list");
    expect(source).toContain("mcpConfigPath");
    expect(source).toContain("cliPath");
    expect(source).toContain("skfiy");
  });

  it("parses Codex plugin smoke options for a repeatable packaged-binary run", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-codex-plugin-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      PRODUCT_PATH,
      EXPECTED_MCP_ARGS,
      createCodexPluginHelpText,
      createDefaultCodexPluginSmokeOptions,
      parseCodexPluginSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      PRODUCT_PATH: string;
      EXPECTED_MCP_ARGS: string[];
      createCodexPluginHelpText: (defaults: Record<string, unknown>) => string;
      createDefaultCodexPluginSmokeOptions: (rootDir: string) => Record<string, unknown>;
      parseCodexPluginSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultCodexPluginSmokeOptions("/repo");

    expect(PRODUCT_PATH)
      .toBe("plugin scaffold -> .mcp.json -> packaged skfiy CLI -> MCP stdio");
    expect(EXPECTED_MCP_ARGS).toEqual(["mcp", "serve", "--stdio"]);
    expect(defaults).toMatchObject({
      pluginRoot: path.join("/repo", "plugins", "skfiy"),
      mcpConfigPath: path.join("/repo", "plugins", "skfiy", ".mcp.json"),
      cliPath: path.join("/repo", "dist", "skfiy"),
      timeoutMs: 8_000,
      requirePassed: false,
      help: false
    });
    expect(parseCodexPluginSmokeArgs([
      "--plugin-root",
      "plugins/skfiy",
      "--mcp-config",
      "plugins/skfiy/.mcp.json",
      "--cli",
      "dist/skfiy",
      "--output",
      ".skfiy-smoke/codex-plugin.json",
      "--timeout-ms",
      "1200",
      "--require-passed"
    ], defaults)).toMatchObject({
      pluginRoot: path.resolve("plugins/skfiy"),
      mcpConfigPath: path.resolve("plugins/skfiy/.mcp.json"),
      cliPath: path.resolve("dist/skfiy"),
      outputPath: path.resolve(".skfiy-smoke/codex-plugin.json"),
      timeoutMs: 1200,
      requirePassed: true
    });
    expect(createCodexPluginHelpText(defaults)).toContain("smoke:codex-plugin");
    expect(createCodexPluginHelpText(defaults)).toContain("--require-passed");
  });

  it("classifies plugin smoke evidence as passed only for installed-command MCP status", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-codex-plugin-plan.mjs");
    const {
      PRODUCT_PATH,
      classifyCodexPluginSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      PRODUCT_PATH: string;
      classifyCodexPluginSmokeEvidence: (input: Record<string, unknown>) => string;
    };
    const passedEvidence = {
      productPath: PRODUCT_PATH,
      runnerHasTmux: false,
      pluginRoot: "/repo/plugins/skfiy",
      mcpConfigPath: "/repo/plugins/skfiy/.mcp.json",
      mcpServerName: "skfiy",
      configuredCommand: "skfiy",
      configuredArgs: ["mcp", "serve", "--stdio"],
      packagedCliPath: "/repo/dist/skfiy",
      command: ["/repo/dist/skfiy", "mcp", "serve", "--stdio"],
      stdoutJsonRpcOnly: true,
      mcpExit: { code: 0, signal: null },
      requests: [
        { id: 1, method: "initialize" },
        { id: 2, method: "tools/list" },
        { id: 3, method: "tools/call", tool: "skfiy.status" }
      ],
      tools: ["skfiy.status", "skfiy.doctor"],
      initialize: {
        protocolVersion: "2024-11-05",
        instructions: [
          "Use skfiy MCP tools for read-only status and diagnostics.",
          "Do not run desktop control without explicit user approval.",
          "This plugin is an adapter to the standalone skfiy app.",
          "Keep app policy and replay evidence inside skfiy."
        ].join(" ")
      },
      status: {
        schemaVersion: 1,
        command: "status",
        app: { state: "unknown" },
        helper: { state: "unknown" },
        permissions: {
          screenRecording: "unknown",
          accessibility: "unknown"
        },
        nativeHost: {
          cliShimPath: "/repo/dist/skfiy"
        }
      }
    };

    expect(classifyCodexPluginSmokeEvidence(passedEvidence)).toBe("passed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      runnerHasTmux: true
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      configuredCommand: "node"
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      packagedCliPath: "/repo/bin/skfiy.mjs"
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      command: ["/repo/dist/skfiy", "status", "--json"]
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      stdoutJsonRpcOnly: false
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      initialize: {
        protocolVersion: "2024-11-05"
      }
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      tools: ["skfiy.status"]
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      status: {
        ...passedEvidence.status,
        command: "doctor"
      }
    })).toBe("failed");
  });
});
