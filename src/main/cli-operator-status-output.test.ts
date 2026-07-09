import { describe, expect, it } from "vitest";
import { createOperatorStatusOutput } from "./cli-operator-status-output";
import type { CliCommandInvocation } from "./cli-command-normalization";

function createInvocation(
  options: Partial<Extract<CliCommandInvocation, { kind: "operator-status" }>["options"]> = {}
): Extract<CliCommandInvocation, { kind: "operator-status" }> {
  return {
    kind: "operator-status",
    path: "operator status",
    json: true,
    options: {
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      cliShimPath: "/repo/dist/skfiy",
      dashboardUrl: "http://127.0.0.1:8787/?token=secret",
      requireReady: true,
      ...options
    }
  };
}

describe("CLI operator status output", () => {
  it("creates a token-free read-only supervisor summary", () => {
    const output = createOperatorStatusOutput({
      invocation: createInvocation(),
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "probed",
      status: {
        cli: { state: "missing" },
        readiness: {
          state: "needs-action",
          ready: false,
          checks: {
            runtime: { state: "ready", ready: true },
            dashboard: { state: "ready", ready: true },
            extension: { state: "needs-action", ready: false },
            moneyRun: { state: "unknown", ready: false }
          },
          blockers: [{
            area: "extension",
            code: "page-control-not-ready"
          }]
        }
      }
    });

    expect(JSON.stringify(output)).not.toContain("secret");
    expect(output).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "operator status",
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "needs-action",
      ready: false,
      requireReady: true,
      executesSystemMutation: false,
      outputPolicy: {
        tokenFree: true,
        stableForAutomation: true,
        source: "status-reader-summary"
      },
      blockers: [{
        area: "extension",
        code: "page-control-not-ready"
      }]
    }));
    expect(output.targets).toEqual(expect.objectContaining({
      plugin: {
        state: "needs-action",
        ready: false,
        adapter: "codex-plugin-mcp",
        transport: "stdio",
        command: "skfiy mcp serve --stdio",
        cliShimPath: "/repo/dist/skfiy",
        tools: expect.arrayContaining(["skfiy.status", "skfiy.doctor"]),
        blockers: [{
          code: "plugin-cli-not-installed",
          message: "Codex plugin MCP adapter requires the packaged skfiy CLI.",
          state: "missing",
          expected: "installed"
        }]
      }
    }));
    expect(output.supervision).toEqual(expect.objectContaining({
      mode: "read-only-status",
      tmuxBackendRequired: false,
      exitOnNotReady: true,
      recommendedReadOnlyCommands: expect.arrayContaining([
        {
          id: "status",
          command: "skfiy",
          args: [
            "status",
            "--json",
            "--extension-id",
            "abcdefghijklmnopabcdefghijklmnop",
            "--dashboard-url",
            "http://127.0.0.1:8787/"
          ]
        },
        {
          id: "dashboard-status",
          command: "skfiy",
          args: [
            "dashboard",
            "status",
            "--json",
            "--url",
            "http://127.0.0.1:8787/"
          ]
        },
        {
          id: "chrome-status",
          command: "skfiy",
          args: [
            "chrome",
            "status",
            "--json",
            "--extension-id",
            "abcdefghijklmnopabcdefghijklmnop"
          ]
        }
      ])
    }));
  });

  it("uses the readiness factory when the status has no readiness field", () => {
    let factoryCalled = false;
    const output = createOperatorStatusOutput({
      invocation: createInvocation({ dashboardUrl: undefined, requireReady: false }),
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "probed",
      status: {
        cli: { state: "installed" }
      },
      createReadinessSummary: () => {
        factoryCalled = true;
        return {
          state: "ready",
          ready: true,
          checks: {},
          blockers: []
        };
      }
    });

    expect(factoryCalled).toBe(true);
    expect(output.result).toBe("ready");
    expect(output.ready).toBe(true);
    expect(output.targets).toEqual(expect.objectContaining({
      plugin: expect.objectContaining({
        state: "available",
        ready: true
      })
    }));
  });

  it("surfaces token-free latest route action evidence", () => {
    const output = createOperatorStatusOutput({
      invocation: createInvocation(),
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "probed",
      status: {
        cli: { state: "installed" },
        readiness: {
          state: "needs-action",
          ready: false,
          checks: {},
          blockers: []
        },
        runtimeSnapshot: {
          currentTurn: {
            state: "blocked",
            latestAction: {
              type: "tool_result",
              route: "finder",
              status: "blocked",
              command: "organize /Users/tester/Downloads?token=secret-token",
              summary: "Finder blocked /Users/tester/Downloads with token=secret-token",
              artifactCount: 1
            }
          },
          replay: {
            latestAction: {
              type: "preview_finder_plan",
              rootPath: "/Users/tester/Downloads",
              operationCount: 6,
              destructiveOperationCount: 0,
              createFolderCount: 3,
              moveFileCount: 3
            }
          }
        }
      }
    });

    expect(output.latestRouteAction).toEqual({
      state: "blocked",
      source: "runtime-snapshot",
      type: "tool_result",
      route: "finder",
      status: "blocked",
      detail: "Finder blocked [path] with redacted=[redacted] 1 artifacts"
    });
    expect(JSON.stringify(output)).not.toContain("secret-token");
    expect(JSON.stringify(output)).not.toContain("/Users/tester");
    expect(JSON.stringify(output)).not.toContain("organize ");
    expect(JSON.stringify(output)).not.toContain("rootPath");
  });
});
