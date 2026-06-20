import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SMOKE_TARGETS,
  createCliCommandSurface,
  createCliOutput,
  normalizeCliCommand,
  runSkfiyCli
} from "./cli-command-surface";

function expectJsonSafe(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

function expectInvocation(argv: string[], rootDir = "/repo") {
  const result = normalizeCliCommand(argv, { rootDir });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.invocation;
}

describe("CLI command surface", () => {
  it("defines operator commands and marks mutation-capable commands explicitly", () => {
    const surface = createCliCommandSurface();

    expect(surface.schemaVersion).toBe(1);
    expect(surface.commands.map((command) => command.path)).toEqual([
      "status",
      "doctor",
      "dashboard",
      "chrome status",
      "chrome install-host",
      "chrome uninstall-host",
      "mcp serve",
      "smoke ui",
      "smoke desktop-session",
      "smoke ghostty",
      "smoke chrome",
      "smoke dashboard",
      "smoke codex-plugin",
      "smoke finder",
      "smoke voice",
      "smoke money-run",
      "release check",
      "alpha artifact"
    ]);
    expect(surface.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "status",
        jsonOutput: true,
        executesSystemMutation: false
      }),
      expect.objectContaining({
        path: "chrome install-host",
        plannedMutation: true,
        executesSystemMutation: true
      }),
      expect.objectContaining({
        path: "alpha artifact",
        plannedMutation: true,
        executesSystemMutation: false
      }),
      expect.objectContaining({
        path: "smoke dashboard",
        summary: "Run the dashboard smoke target and output artifact.",
        plannedMutation: true,
        executesSystemMutation: true
      }),
      expect.objectContaining({
        path: "mcp serve",
        summary: "Serve skfiy status and Computer Use tools over MCP stdio for Codex plugins.",
        plannedMutation: false,
        executesSystemMutation: false
      })
    ]));
    expect(SMOKE_TARGETS).toEqual([
      "ui",
      "desktop-session",
      "ghostty",
      "chrome",
      "dashboard",
      "codex-plugin",
      "finder",
      "voice",
      "money-run"
    ]);
  });

  it("normalizes status and doctor into JSON-safe output skeletons", () => {
    const status = expectInvocation([
      "status",
      "--json",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop",
      "--dashboard-url",
      "http://127.0.0.1:8787/"
    ]);
    const doctor = expectInvocation([
      "doctor",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop",
      "--dashboard-url",
      "http://127.0.0.1:8787/"
    ]);

    expect(status).toMatchObject({
      kind: "status",
      path: "status",
      json: true,
      options: {
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        cliShimPath: "/repo/dist/skfiy",
        dashboardUrl: "http://127.0.0.1:8787/"
      }
    });
    expect(createCliOutput(status, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      command: "status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      app: { state: "unknown" },
      helper: { state: "unknown" },
      nativeHost: {
        state: "unknown",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
      },
      dashboard: {
        state: "unknown",
        url: "http://127.0.0.1:8787/"
      }
    });
    expect(createCliOutput(expectInvocation(["status", "--json"]), {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toEqual({
      schemaVersion: 1,
      command: "status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      app: { state: "unknown" },
      helper: { state: "unknown" },
      permissions: {
        screenRecording: "unknown",
        accessibility: "unknown",
        microphone: "unknown",
        speechRecognition: "unknown",
        finderAutomation: "unknown"
      },
      desktopSession: { state: "unknown" },
      extension: { state: "unknown" },
      nativeHost: {
        state: "unknown",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: []
      },
      dashboard: { state: "not-running" }
    });

    expect(createCliOutput(doctor, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      command: "doctor",
      generatedAt: "2026-06-20T00:00:00.000Z",
      result: "not-run",
      diagnostics: [],
      nextActions: [],
      statusProbe: {
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        dashboardUrl: "http://127.0.0.1:8787/"
      }
    });
    expectJsonSafe(createCliOutput(status));
    expectJsonSafe(createCliOutput(doctor));
  });

  it("normalizes dashboard as a loopback-only command with no token in output", () => {
    const invocation = expectInvocation([
      "dashboard",
      "--no-open",
      "--port",
      "8787",
      "--json"
    ]);

    expect(invocation).toEqual({
      kind: "dashboard",
      path: "dashboard",
      json: true,
      options: {
        noOpen: true,
        port: 8787
      }
    });
    expect(createCliOutput(invocation, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: "2026-06-20T00:00:00.000Z",
      bind: {
        host: "127.0.0.1",
        port: 8787
      },
      url: "http://127.0.0.1:8787/",
      shouldOpen: false,
      tokenPrinted: false,
      result: "not-started"
    });
    expectJsonSafe(createCliOutput(invocation));
  });

  it("normalizes Chrome host commands as explicit native-host operations", () => {
    for (const subcommand of ["status", "install-host", "uninstall-host"] as const) {
      const invocation = expectInvocation([
        "chrome",
        subcommand,
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ]);
      const output = createCliOutput(invocation, {
        generatedAt: "2026-06-20T00:00:00.000Z"
      });

      expect(invocation).toMatchObject({
        kind: "chrome",
        path: `chrome ${subcommand}`,
        subcommand,
        options: {
          extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
          cliShimPath: "/repo/dist/skfiy"
        }
      });
      expect(output).toMatchObject({
        schemaVersion: 1,
        command: `chrome ${subcommand}`,
        generatedAt: "2026-06-20T00:00:00.000Z"
      });
      expectJsonSafe(output);
    }
  });

  it("normalizes MCP stdio serving as a plugin-safe installed-binary command", () => {
    const invocation = expectInvocation([
      "mcp",
      "serve",
      "--stdio",
      "--json"
    ]);

    expect(invocation).toEqual({
      kind: "mcp-serve",
      path: "mcp serve",
      json: true,
      options: {
        transport: "stdio"
      }
    });
    expect(createCliOutput(invocation, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toEqual({
      schemaVersion: 1,
      command: "mcp serve",
      generatedAt: "2026-06-20T00:00:00.000Z",
      transport: "stdio",
      result: "not-started",
      plannedMutation: false,
      executesSystemMutation: false,
      tools: [
        "skfiy.status",
        "skfiy.doctor"
      ]
    });
  });

  it("normalizes smoke, release, and alpha artifact paths", () => {
    const smoke = expectInvocation([
      "smoke",
      "dashboard",
      "--output",
      ".skfiy-smoke/dashboard.json"
    ]);
    const release = expectInvocation([
      "release",
      "check",
      "--json-output",
      ".skfiy-release/check.json"
    ]);
    const alpha = expectInvocation(["alpha", "artifact"]);

    expect(smoke).toMatchObject({
      kind: "smoke",
      path: "smoke dashboard",
      target: "dashboard",
      outputPath: "/repo/.skfiy-smoke/dashboard.json",
      options: {
        requirePassed: false,
        scriptPath: "/repo/scripts/smoke-dashboard-product.mjs",
        scriptArgs: [
          "--output",
          "/repo/.skfiy-smoke/dashboard.json"
        ]
      }
    });
    expect(release).toMatchObject({
      kind: "release-check",
      path: "release check",
      jsonOutputPath: "/repo/.skfiy-release/check.json"
    });
    expect(alpha).toMatchObject({
      kind: "alpha-artifact",
      path: "alpha artifact"
    });
    expect(createCliOutput(smoke)).toMatchObject({
      command: "smoke dashboard",
      target: "dashboard",
      outputPath: "/repo/.skfiy-smoke/dashboard.json",
      scriptPath: "/repo/scripts/smoke-dashboard-product.mjs",
      scriptArgs: [
        "--output",
        "/repo/.skfiy-smoke/dashboard.json"
      ],
      result: "not-run",
      executesSystemMutation: true
    });
    expect(expectInvocation([
      "smoke",
      "codex-plugin",
      "--output",
      ".skfiy-smoke/codex-plugin.json",
      "--require-passed"
    ])).toMatchObject({
      kind: "smoke",
      path: "smoke codex-plugin",
      target: "codex-plugin",
      outputPath: "/repo/.skfiy-smoke/codex-plugin.json",
      options: {
        requirePassed: true,
        scriptPath: "/repo/scripts/smoke-codex-plugin-product.mjs",
        scriptArgs: [
          "--output",
          "/repo/.skfiy-smoke/codex-plugin.json",
          "--require-passed"
        ]
      }
    });
    expect(createCliOutput(release)).toMatchObject({
      command: "release check",
      jsonOutputPath: "/repo/.skfiy-release/check.json",
      result: "not-run"
    });
    expect(createCliOutput(alpha)).toMatchObject({
      command: "alpha artifact",
      result: "not-run",
      executesSystemMutation: false
    });
  });

  it("runs product smoke scripts through the shared CLI entrypoint", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const smokeRuns: Array<{
      cwd: string;
      scriptPath: string;
      args: string[];
      target: string;
    }> = [];

    await expect(runSkfiyCli({
      argv: [
        "smoke",
        "dashboard",
        "--output",
        ".skfiy-smoke/dashboard-cli.json",
        "--require-passed",
        "--json"
      ],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      smokeRunner: async (input) => {
        smokeRuns.push(input);
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            result: "passed",
            productPath: "dist/skfiy -> skfiy dashboard -> loopback dashboard server",
            runnerHasTmux: false
          }, null, 2)}\n`,
          stderr: ""
        };
      },
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(smokeRuns).toEqual([
      {
        target: "dashboard",
        cwd: "/repo",
        scriptPath: "/repo/scripts/smoke-dashboard-product.mjs",
        args: [
          "--output",
          "/repo/.skfiy-smoke/dashboard-cli.json",
          "--require-passed"
        ]
      }
    ]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "smoke dashboard",
      generatedAt: "2026-06-20T00:00:00.000Z",
      target: "dashboard",
      outputPath: "/repo/.skfiy-smoke/dashboard-cli.json",
      scriptPath: "/repo/scripts/smoke-dashboard-product.mjs",
      scriptArgs: [
        "--output",
        "/repo/.skfiy-smoke/dashboard-cli.json",
        "--require-passed"
      ],
      result: "passed",
      exitCode: 0,
      smoke: {
        result: "passed",
        runnerHasTmux: false
      }
    });
    expect(stderr).toEqual([]);
  });

  it("runs MCP stdio through the shared CLI entrypoint without requiring tmux", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const starts: unknown[] = [];

    await expect(runSkfiyCli({
      argv: ["mcp", "serve", "--stdio", "--json"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      mcpServerStarter: async (input) => {
        starts.push(input);
        return {
          transport: "stdio",
          tools: ["skfiy.status", "skfiy.doctor"],
          close: async () => undefined
        };
      },
      keepMcpServerAlive: false,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(starts).toEqual([{
      rootDir: "/repo",
      homeDir: "/Users/tester",
      transport: "stdio"
    }]);
    expect(JSON.parse(stdout.join(""))).toEqual({
      schemaVersion: 1,
      command: "mcp serve",
      generatedAt: "2026-06-20T00:00:00.000Z",
      transport: "stdio",
      result: "running",
      plannedMutation: false,
      executesSystemMutation: false,
      tools: ["skfiy.status", "skfiy.doctor"]
    });
    expect(stderr).toEqual([]);
  });

  it("lets MCP JSON diagnostics exit instead of waiting for a long-running plugin session", async () => {
    const stdout: string[] = [];
    let closed = false;

    await expect(Promise.race([
      runSkfiyCli({
        argv: ["mcp", "serve", "--stdio", "--json"],
        rootDir: "/repo",
        homeDir: "/Users/tester",
        generatedAt: "2026-06-20T00:00:00.000Z",
        mcpServerStarter: async () => ({
          transport: "stdio",
          tools: ["skfiy.status", "skfiy.doctor"],
          close: async () => {
            closed = true;
          }
        }),
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: () => undefined }
      }),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 25))
    ])).resolves.toBe(0);

    expect(closed).toBe(true);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "mcp serve",
      result: "running"
    });
  });

  it("runs real MCP stdio transport for non-json plugin sessions", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const statusInputs: unknown[] = [];

    await expect(runSkfiyCli({
      argv: ["mcp", "serve", "--stdio"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      mcpStdin: [
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "skfiy.status",
            arguments: {
              extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
              dashboardUrl: "http://127.0.0.1:8787/"
            }
          }
        })}\n`
      ],
      statusReader: async (input) => {
        statusInputs.push(input);
        return {
          app: { state: "installed", path: "/repo/dist/skfiy.app" },
          helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            microphone: "unknown",
            speechRecognition: "unknown",
            finderAutomation: "unknown"
          },
          desktopSession: { state: "controllable" },
          extension: { state: "unknown" },
          nativeHost: { state: "installed" },
          dashboard: { state: "running" }
        };
      },
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(statusInputs).toEqual([{
      rootDir: "/repo",
      homeDir: "/Users/tester",
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      dashboardUrl: "http://127.0.0.1:8787/"
    }]);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0])).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        structuredContent: {
          schemaVersion: 1,
          command: "status",
          app: { state: "installed" }
        }
      }
    });
    expect(stderr).toEqual([]);
  });

  it("reports unknown commands and smoke targets without throwing", () => {
    expect(normalizeCliCommand(["smoke", "calendar"])).toEqual({
      ok: false,
      error: {
        code: "unknown-smoke-target",
        message: "Unknown smoke target: calendar"
      }
    });
    expect(normalizeCliCommand(["chrome", "reinstall-host"])).toEqual({
      ok: false,
      error: {
        code: "unknown-chrome-subcommand",
        message: "Unknown chrome subcommand: reinstall-host"
      }
    });
  });

  it("keeps the optional source-tree CLI shim thin and build-artifact based", () => {
    const scriptPath = path.join(process.cwd(), "scripts/skfiy-cli.mjs");
    const binPath = path.join(process.cwd(), "bin/skfiy.mjs");

    expect(existsSync(scriptPath)).toBe(true);
    expect(existsSync(binPath)).toBe(true);
    const source = readFileSync(scriptPath, "utf8");
    const binSource = readFileSync(binPath, "utf8");

    expect(source).toContain("dist/main/cli-command-surface.js");
    expect(source).toContain("requires built main artifacts");
    expect(source).toContain("runSkfiyCli");
    expect(binSource).toContain("dist/main/cli-command-surface.js");
    expect(binSource).toContain("Run `npm run build` from the skfiy repository");
    expect(binSource).toContain("runSkfiyCli");
    expect(binSource).toContain("runChromeNativeMessagingHost");
    expect(binSource).toContain("process.argv.slice(2)");
    expect(binSource).toContain("process.stdin.isTTY");
  });

  it("runs the shared CLI entrypoint with JSON output and error exit codes", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyCli({
      argv: ["status", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader: async () => ({
        app: { state: "missing", path: "/repo/dist/skfiy.app" },
        helper: { state: "missing", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        permissions: {
          screenRecording: "unknown",
          accessibility: "unknown",
          microphone: "unknown",
          speechRecognition: "unknown",
          finderAutomation: "unknown"
        },
        desktopSession: { state: "unknown" },
        extension: { state: "unknown" },
        nativeHost: { state: "unknown", extensionIds: [], cliShimPath: "/repo/dist/skfiy" },
        dashboard: { state: "not-running" }
      }),
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "status",
      generatedAt: "2026-06-20T00:00:00.000Z"
    });
    expect(stderr).toEqual([]);

    await expect(runSkfiyCli({
      argv: ["chrome", "reinstall-host"],
      rootDir: "/repo",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(2);
    expect(stderr.at(-1)).toBe("Unknown chrome subcommand: reinstall-host\n");
  });

  it("runs status through concrete probes and keeps the output dashboard-safe", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const statusInputs: unknown[] = [];

    await expect(runSkfiyCli({
      argv: [
        "status",
        "--json",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--dashboard-url",
        "http://127.0.0.1:8787/"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader: async (input) => {
        statusInputs.push(input);
        return {
          app: { state: "installed", path: "/repo/dist/skfiy.app" },
          helper: {
            state: "installed",
            path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
          },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            microphone: "denied",
            speechRecognition: "not-determined",
            finderAutomation: "unknown"
          },
          desktopSession: {
            state: "controllable",
            frontmostBundleId: "com.apple.finder",
            controllable: true
          },
          extension: { state: "unknown" },
          nativeHost: {
            state: "installed",
            cliShimPath: "/repo/dist/skfiy",
            extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
          },
          dashboard: {
            state: "running",
            url: "http://127.0.0.1:8787/"
          }
        };
      },
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(statusInputs).toEqual([{
      rootDir: "/repo",
      homeDir: "/Users/tester",
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      dashboardUrl: "http://127.0.0.1:8787/"
    }]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      app: { state: "installed" },
      helper: { state: "installed" },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        microphone: "denied",
        speechRecognition: "not-determined",
        finderAutomation: "unknown"
      },
      desktopSession: {
        state: "controllable",
        frontmostBundleId: "com.apple.finder"
      },
      nativeHost: {
        state: "installed"
      },
      dashboard: {
        state: "running"
      }
    });
    expect(stdout.join("")).not.toContain("token=");
    expect(stderr).toEqual([]);
  });

  it("runs doctor diagnostics from status and signing probes", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const statusInputs: unknown[] = [];
    const signatureInputs: unknown[] = [];

    await expect(runSkfiyCli({
      argv: [
        "doctor",
        "--json",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--dashboard-url",
        "http://127.0.0.1:8787/"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader: async (input) => {
        statusInputs.push(input);
        return {
          app: { state: "installed", path: "/repo/dist/skfiy.app" },
          helper: {
            state: "missing",
            path: "/repo/dist/skfiy.app/Contents/Resources/skfiy-helper"
          },
          permissions: {
            screenRecording: "denied",
            accessibility: "not-determined",
            microphone: "granted",
            speechRecognition: "not-determined",
            finderAutomation: "unknown"
          },
          desktopSession: {
            state: "blocked",
            frontmostBundleId: "com.apple.loginwindow",
            mainDisplayAsleep: true
          },
          extension: { state: "unknown" },
          nativeHost: {
            state: "missing",
            cliShimPath: "/repo/dist/skfiy",
            extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
            reason: "Chrome Native Messaging host manifest is not installed."
          },
          dashboard: {
            state: "not-running",
            url: "http://127.0.0.1:8787/",
            reason: "fetch failed"
          }
        };
      },
      signatureReader: async (input) => {
        signatureInputs.push(input);
        return {
          state: "invalid",
          reason: "designated requirement does not include com.sskift.skfiy"
        };
      },
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(statusInputs).toEqual([{
      rootDir: "/repo",
      homeDir: "/Users/tester",
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      cliShimPath: "/repo/dist/skfiy",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      dashboardUrl: "http://127.0.0.1:8787/"
    }]);
    expect(signatureInputs).toEqual([{
      appPath: "/repo/dist/skfiy.app"
    }]);

    const output = JSON.parse(stdout.join(""));

    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "doctor",
      generatedAt: "2026-06-20T00:00:00.000Z",
      result: "needs-action"
    });
    expect(output.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "helper-location",
        severity: "error"
      }),
      expect.objectContaining({
        code: "screen-recording-permission",
        severity: "error"
      }),
      expect.objectContaining({
        code: "accessibility-permission",
        severity: "error"
      }),
      expect.objectContaining({
        code: "desktop-session-blocked",
        severity: "error"
      }),
      expect.objectContaining({
        code: "chrome-native-host",
        severity: "warning"
      }),
      expect.objectContaining({
        code: "dashboard-not-running",
        severity: "warning"
      }),
      expect.objectContaining({
        code: "code-signature",
        severity: "warning"
      }),
      expect.objectContaining({
        code: "finder-automation-unknown",
        severity: "info"
      })
    ]));
    expect(output.nextActions).toEqual(expect.arrayContaining([
      "Run `npm run build` so skfiy-helper is embedded at dist/skfiy.app/Contents/MacOS/skfiy-helper.",
      "Open System Settings > Privacy & Security > Screen Recording and grant skfiy.",
      "Open System Settings > Privacy & Security > Accessibility and grant skfiy.",
      "Wake and unlock the Mac, then rerun `skfiy status --json` before collecting Computer Use evidence.",
      "Run `skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop` to install the Chrome Native Messaging host.",
      "Start the dashboard with `skfiy dashboard --no-open --json` or pass the current dashboard URL.",
      "Run `npm run release:mac:check` to inspect signing/notarization readiness.",
      "Run a Finder smoke once and grant Finder Automation when macOS prompts."
    ]));
    expect(JSON.stringify(output)).not.toContain("token=");
    expect(stderr).toEqual([]);
  });

  it("runs chrome native host status, install, and uninstall through injected filesystem", async () => {
    const files: Record<string, string> = {
      "/repo/dist/skfiy": "#!/usr/bin/env node\n"
    };
    const io = {
      exists: async (targetPath: string) => Object.hasOwn(files, targetPath),
      mkdir: async (targetPath: string) => {
        files[targetPath] = files[targetPath] ?? "__dir__";
      },
      readFile: async (targetPath: string) => files[targetPath],
      writeFile: async (targetPath: string, content: string) => {
        files[targetPath] = content;
      },
      rm: async (targetPath: string) => {
        delete files[targetPath];
      }
    };
    const manifestPath = "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json";
    const stdout: string[] = [];
    const stderr: string[] = [];
    const base = {
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      chromeNativeHostIo: io
    };

    await expect(runSkfiyCli({
      ...base,
      argv: ["chrome", "status", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"]
    })).resolves.toBe(0);
    expect(JSON.parse(stdout.pop() ?? "{}")).toMatchObject({
      command: "chrome status",
      nativeHost: {
        state: "missing",
        manifestPath
      }
    });

    await expect(runSkfiyCli({
      ...base,
      argv: ["chrome", "install-host", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"]
    })).resolves.toBe(0);
    expect(JSON.parse(stdout.pop() ?? "{}")).toMatchObject({
      command: "chrome install-host",
      result: "installed",
      manifestPath,
      executesSystemMutation: true
    });
    expect(JSON.parse(files[manifestPath])).toMatchObject({
      name: "com.sskift.skfiy",
      path: "/repo/dist/skfiy"
    });

    await expect(runSkfiyCli({
      ...base,
      argv: ["chrome", "uninstall-host", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"]
    })).resolves.toBe(0);
    expect(JSON.parse(stdout.pop() ?? "{}")).toMatchObject({
      command: "chrome uninstall-host",
      result: "uninstalled",
      manifestPath,
      executesSystemMutation: true
    });
    expect(files[manifestPath]).toBeUndefined();
    expect(stderr).toEqual([]);
  });

  it("runs dashboard through the shared CLI entrypoint without printing tokens", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const started: Array<{ port: number; rootDir?: string }> = [];

    await expect(runSkfiyCli({
      argv: ["dashboard", "--no-open", "--port", "8787", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      keepDashboardAlive: false,
      dashboardServerStarter: async (input) => {
        started.push(input);
        return {
          bind: { host: "127.0.0.1", port: input.port ?? 0 },
          url: `http://127.0.0.1:${input.port ?? 0}/`,
          close: async () => undefined
        };
      }
    })).resolves.toBe(0);

    expect(started).toEqual([{ port: 8787, rootDir: "/repo" }]);
    const output = JSON.parse(stdout.join(""));
    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: "2026-06-20T00:00:00.000Z",
      bind: {
        host: "127.0.0.1",
        port: 8787
      },
      url: "http://127.0.0.1:8787/",
      result: "running",
      shouldOpen: false,
      tokenPrinted: false
    });
    expect(JSON.stringify(output)).not.toContain("token=");
    expect(stderr).toEqual([]);
  });

  it("opens dashboard URL by default and skips opening when --no-open is set", async () => {
    const openedUrls: string[] = [];
    const createBase = (stdout: string[]) => ({
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: () => undefined },
      keepDashboardAlive: false,
      dashboardOpener: async (url: string) => {
        openedUrls.push(url);
      },
      dashboardServerStarter: async (input: { port: number; rootDir?: string }) => ({
        bind: { host: "127.0.0.1" as const, port: input.port },
        url: `http://127.0.0.1:${input.port}/`,
        close: async () => undefined
      })
    });
    const firstStdout: string[] = [];
    const secondStdout: string[] = [];

    await expect(runSkfiyCli({
      ...createBase(firstStdout),
      argv: ["dashboard", "--port", "8788", "--json"]
    })).resolves.toBe(0);
    await expect(runSkfiyCli({
      ...createBase(secondStdout),
      argv: ["dashboard", "--no-open", "--port", "8789", "--json"]
    })).resolves.toBe(0);

    expect(openedUrls).toEqual(["http://127.0.0.1:8788/"]);
    expect(JSON.parse(firstStdout.join(""))).toMatchObject({
      url: "http://127.0.0.1:8788/",
      shouldOpen: true
    });
    expect(JSON.parse(secondStdout.join(""))).toMatchObject({
      url: "http://127.0.0.1:8789/",
      shouldOpen: false
    });
  });
});
