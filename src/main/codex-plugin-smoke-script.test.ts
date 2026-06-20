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
    expect(source).toContain("configuredCommandUsed");
    expect(source).toContain("resolveConfiguredCommandPath");
    expect(source).toContain("commandLookupPathPrepend");
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
      .toBe("plugin scaffold -> staged marketplace install -> .mcp.json -> packaged skfiy CLI -> MCP stdio");
    expect(EXPECTED_MCP_ARGS).toEqual(["mcp", "serve", "--stdio"]);
    expect(defaults).toMatchObject({
      pluginRoot: path.join("/repo", "plugins", "skfiy"),
      installStagingDir: path.join("/repo", ".skfiy-plugin-install", "codex-plugin"),
      mcpConfigPath: path.join("/repo", "plugins", "skfiy", ".mcp.json"),
      cliPath: path.join("/repo", "dist", "skfiy"),
      extensionIds: [],
      timeoutMs: 8_000,
      requirePassed: false,
      help: false
    });
    expect(parseCodexPluginSmokeArgs([
      "--plugin-root",
      "plugins/skfiy",
      "--install-staging-dir",
      ".skfiy-plugin-install/codex-plugin",
      "--mcp-config",
      "plugins/skfiy/.mcp.json",
      "--cli",
      "dist/skfiy",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop",
      "--output",
      ".skfiy-smoke/codex-plugin.json",
      "--timeout-ms",
      "1200",
      "--require-passed"
    ], defaults)).toMatchObject({
      pluginRoot: path.resolve("plugins/skfiy"),
      installStagingDir: path.resolve(".skfiy-plugin-install/codex-plugin"),
      mcpConfigPath: path.resolve("plugins/skfiy/.mcp.json"),
      cliPath: path.resolve("dist/skfiy"),
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      outputPath: path.resolve(".skfiy-smoke/codex-plugin.json"),
      timeoutMs: 1200,
      requirePassed: true
    });
    expect(createCodexPluginHelpText(defaults)).toContain("smoke:codex-plugin");
    expect(createCodexPluginHelpText(defaults)).toContain("--extension-id");
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
      sourcePluginRoot: "/repo/plugins/skfiy",
      installStagingDir: "/repo/.skfiy-plugin-install/codex-plugin",
      marketplaceRoot: "/repo/.skfiy-plugin-install/codex-plugin/marketplace",
      marketplaceManifestPath: "/repo/.skfiy-plugin-install/codex-plugin/marketplace/marketplace.json",
      marketplaceManifest: {
        name: "skfiy-local",
        interface: { displayName: "skfiy Local" },
        plugins: [{
          name: "skfiy",
          source: { source: "local", path: "./plugins/skfiy" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Productivity"
        }]
      },
      installedPluginRoot: "/repo/.skfiy-plugin-install/codex-plugin/marketplace/plugins/skfiy",
      pluginRoot: "/repo/.skfiy-plugin-install/codex-plugin/marketplace/plugins/skfiy",
      mcpConfigPath: "/repo/.skfiy-plugin-install/codex-plugin/marketplace/plugins/skfiy/.mcp.json",
      repoCheckoutUsedForMcp: false,
      mcpServerName: "skfiy",
      configuredCommand: "skfiy",
      configuredArgs: ["mcp", "serve", "--stdio"],
      extensionIds: [],
      packagedCliPath: "/repo/dist/skfiy",
      resolvedCommandPath: "/repo/dist/skfiy",
      configuredCommandUsed: true,
      commandLookupPathPrepend: "/repo/dist",
      command: ["skfiy", "mcp", "serve", "--stdio"],
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
    const bridgeEvidence = {
      ...passedEvidence,
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      requests: [
        { id: 1, method: "initialize" },
        { id: 2, method: "tools/list" },
        {
          id: 3,
          method: "tools/call",
          tool: "skfiy.status",
          extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
        }
      ],
      status: {
        ...passedEvidence.status,
        nativeHost: {
          state: "missing",
          hostName: "com.sskift.skfiy",
          manifestPath: "/repo/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
          cliShimPath: "/repo/dist/skfiy",
          allowedOrigins: [],
          reason: "Chrome Native Messaging host manifest is not installed."
        },
        extension: {
          state: "native-host-missing",
          bridge: "native-messaging",
          liveConnection: "unknown",
          nativeHostState: "missing",
          manifestPath: "/repo/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json",
          reason: "Chrome Native Messaging host manifest is not installed."
        }
      }
    };

    expect(classifyCodexPluginSmokeEvidence(passedEvidence)).toBe("passed");
    expect(classifyCodexPluginSmokeEvidence(bridgeEvidence)).toBe("passed");
    expect(classifyCodexPluginSmokeEvidence({
      ...bridgeEvidence,
      status: {
        ...bridgeEvidence.status,
        extension: { state: "unknown" }
      }
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      repoCheckoutUsedForMcp: true
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      marketplaceManifest: {
        ...passedEvidence.marketplaceManifest,
        plugins: []
      }
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      pluginRoot: "/repo/plugins/skfiy",
      mcpConfigPath: "/repo/plugins/skfiy/.mcp.json"
    })).toBe("failed");
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
      configuredCommandUsed: false
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      resolvedCommandPath: "/repo/bin/skfiy"
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      commandLookupPathPrepend: "/repo/bin"
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      packagedCliPath: "/repo/bin/skfiy.mjs"
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      command: ["/repo/dist/skfiy", "mcp", "serve", "--stdio"]
    })).toBe("failed");
    expect(classifyCodexPluginSmokeEvidence({
      ...passedEvidence,
      command: ["skfiy", "status", "--json"]
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
