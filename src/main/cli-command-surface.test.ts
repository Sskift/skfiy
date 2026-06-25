import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SMOKE_TARGETS,
  createCliCommandSurface,
  createCliOutput,
  normalizeCliCommand,
  runSkfiyCli
} from "./cli-command-surface";
import {
  createRuntimeSnapshotStatePath,
  createRuntimeTurnMarkerStatePath
} from "./runtime-snapshot";
import {
  createDashboardServerState,
  createDashboardServerStatePath
} from "./dashboard-server-state";
import type { ChromeExtensionReloadInput } from "./chrome-extension-reloader";
import type {
  ChromeExtensionPageControlInput,
  ChromeExtensionTabDiscoveryInput
} from "./chrome-extension-page-control";

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

function createTempRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "skfiy-cli-"));
}

function createMemoryChromeIo(files: Record<string, string>) {
  return {
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
}

describe("CLI command surface", () => {
  it("defines operator commands and marks mutation-capable commands explicitly", () => {
    const surface = createCliCommandSurface();

    expect(surface.schemaVersion).toBe(1);
    expect(surface.commands.map((command) => command.path)).toEqual([
      "commands",
      "help",
      "status",
      "doctor",
      "operator status",
      "dashboard",
      "dashboard status",
      "dashboard snapshot",
      "permissions open <screen-recording|accessibility|automation-finder>",
      "chrome status",
      "chrome extension-info",
      "chrome tabs",
      "chrome observe",
      "chrome screenshot",
      "chrome click",
      "chrome fill",
      "chrome submit",
      "chrome scroll",
      "chrome reload-extension",
      "chrome policy show",
      "chrome policy set",
      "chrome policy reset",
      "chrome install-host",
      "chrome uninstall-host",
      "skin import",
      "mcp serve",
      "smoke ui",
      "smoke desktop-session",
      "smoke ghostty",
      "smoke chrome",
      "smoke dashboard",
      "smoke codex-plugin",
      "smoke finder",
      "smoke money-run",
      "release check",
      "alpha artifact"
    ]);
    expect(surface.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "commands",
        jsonOutput: true,
        executesSystemMutation: false,
        outputShape: "command-surface"
      }),
      expect.objectContaining({
        path: "help",
        jsonOutput: true,
        executesSystemMutation: false,
        outputShape: "command-surface"
      }),
      expect.objectContaining({
        path: "status",
        jsonOutput: true,
        executesSystemMutation: false,
        capabilities: ["chrome-extension-page-safety", "chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "doctor",
        jsonOutput: true,
        executesSystemMutation: false,
        capabilities: ["chrome-extension-page-safety", "chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "operator status",
        jsonOutput: true,
        executesSystemMutation: false,
        outputShape: "operator-status",
        capabilities: ["chrome-extension-page-safety", "chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome install-host",
        plannedMutation: true,
        executesSystemMutation: true
      }),
      expect.objectContaining({
        path: "chrome policy show",
        plannedMutation: false,
        executesSystemMutation: false,
        outputShape: "chrome-host-policy"
      }),
      expect.objectContaining({
        path: "chrome status",
        plannedMutation: false,
        executesSystemMutation: false,
        outputShape: "chrome-status",
        capabilities: ["chrome-extension-page-safety", "chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome extension-info",
        plannedMutation: false,
        executesSystemMutation: false,
        outputShape: "chrome-extension-info",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome tabs",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-tabs",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome observe",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-page-observe",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome screenshot",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-page-screenshot",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome click",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-page-action",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome fill",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-page-action",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome submit",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-page-action",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome scroll",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-page-action",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "chrome reload-extension",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-extension-reload",
        capabilities: ["chrome-extension-page-control"]
      }),
      expect.objectContaining({
        path: "skin import",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "pet-skin-import"
      }),
      expect.objectContaining({
        path: "chrome policy set",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "chrome-host-policy"
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
      }),
      expect.objectContaining({
        path: "dashboard status",
        summary: "Fetch descriptor, snapshot status, and operator readiness from a running dashboard.",
        plannedMutation: false,
        executesSystemMutation: false,
        outputShape: "dashboard-status"
      }),
      expect.objectContaining({
        path: "dashboard snapshot",
        summary: "Fetch the full snapshot JSON from a running dashboard.",
        plannedMutation: false,
        executesSystemMutation: false,
        outputShape: "dashboard-snapshot"
      }),
      expect.objectContaining({
        path: "permissions open <screen-recording|accessibility|automation-finder>",
        summary: "Open the matching macOS Privacy & Security permission settings panel.",
        plannedMutation: true,
        executesSystemMutation: true,
        outputShape: "permission-settings-open"
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
      "money-run"
    ]);
  });

  it("normalizes commands and help as a discoverable read-only command surface", async () => {
    const commands = expectInvocation(["commands", "--json"]);
    const help = expectInvocation(["help", "--json"]);

    expect(commands).toEqual({
      kind: "commands",
      path: "commands",
      json: true,
      options: {}
    });
    expect(help).toEqual({
      kind: "commands",
      path: "help",
      json: true,
      options: {}
    });
    expect(createCliOutput(commands, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      command: "commands",
      generatedAt: "2026-06-20T00:00:00.000Z",
      result: "available",
      commandCount: createCliCommandSurface().commands.length,
      surface: {
        schemaVersion: 1,
        commands: expect.arrayContaining([
          expect.objectContaining({ path: "status" }),
          expect.objectContaining({ path: "operator status" }),
          expect.objectContaining({ path: "dashboard" }),
          expect.objectContaining({ path: "dashboard status" }),
          expect.objectContaining({ path: "dashboard snapshot" }),
          expect.objectContaining({ path: "mcp serve" }),
          expect.objectContaining({ path: "smoke codex-plugin" })
        ])
      }
    });
    expectJsonSafe(createCliOutput(commands));

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runSkfiyCli({
      argv: ["commands", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      keepDashboardAlive: false,
      keepMcpServerAlive: false,
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: (chunk) => stderr.push(chunk) }
    });
    const output = JSON.parse(stdout.join(""));

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(output.command).toBe("commands");
    expect(output.surface.commands).toEqual(createCliCommandSurface().commands);
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
    })).toMatchObject({
      schemaVersion: 1,
      command: "status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      app: { state: "unknown" },
      cli: {
        state: "unknown",
        path: "/repo/dist/skfiy"
      },
      helper: { state: "unknown" },
      permissions: {
        screenRecording: "unknown",
        accessibility: "unknown",
        finderAutomation: "unknown"
      },
      desktopSession: { state: "unknown" },
      extension: {
        state: "unknown",
        capabilities: {
          pageSafety: false,
          pageControl: false
        },
        pageSafety: {
          schemaVersion: 1,
          capability: "chrome-extension-page-safety",
          capable: false,
          state: "unknown"
        },
        pageControl: {
          schemaVersion: 1,
          capability: "chrome-extension-page-control",
          state: "not-probed",
          reason: "Chrome extension page control readiness has not been reported yet.",
          capabilities: {},
          source: "not-probed"
        }
      },
      nativeHost: {
        state: "unknown",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: []
      },
      dashboard: { state: "not-running" },
      moneyRun: {
        state: "unknown",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      },
      readiness: {
        state: "needs-action",
        ready: false,
        checks: {
          runtime: { state: "unknown", ready: false },
          dashboard: { state: "needs-action", ready: false },
          extension: { state: "unknown", ready: false },
          moneyRun: {
            state: "unknown",
            ready: false,
            session: "money-run",
            mutatesSession: false
          }
        }
      }
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
      capabilities: {
        chromeExtensionPageSafety: false,
        chromeExtensionPageControl: false
      },
      statusProbe: {
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        dashboardUrl: "http://127.0.0.1:8787/",
        capabilities: ["chrome-extension-page-safety", "chrome-extension-page-control"]
      }
    });
    expectJsonSafe(createCliOutput(status));
    expectJsonSafe(createCliOutput(doctor));
  });

  it("normalizes operator status into a compact automation-safe readiness summary", () => {
    const operator = expectInvocation([
      "operator",
      "status",
      "--json",
      "--require-ready",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop",
      "--dashboard-url",
      "http://127.0.0.1:8787/?token=secret-token"
    ]);

    expect(operator).toMatchObject({
      kind: "operator-status",
      path: "operator status",
      json: true,
      options: {
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        cliShimPath: "/repo/dist/skfiy",
        dashboardUrl: "http://127.0.0.1:8787/?token=secret-token",
        requireReady: true
      }
    });
    const output = createCliOutput(operator, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    });

    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "operator status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      result: "not-run",
      ready: false,
      requireReady: true,
      executesSystemMutation: false,
      outputPolicy: {
        tokenFree: true,
        stableForAutomation: true
      },
      targets: {
        runtime: {
          state: "unknown",
          ready: false
        },
        dashboard: {
          state: "unknown",
          ready: false,
          url: "http://127.0.0.1:8787/"
        },
        plugin: {
          state: "unknown",
          ready: false,
          adapter: "codex-plugin-mcp",
          command: "skfiy mcp serve --stdio",
          cliShimPath: "/repo/dist/skfiy",
          tools: ["skfiy.status", "skfiy.doctor"]
        },
        extension: {
          state: "needs-action",
          ready: false,
          extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
        },
        moneyRun: {
          state: "unknown",
          ready: false,
          session: "money-run",
          mutatesSession: false
        }
      },
      supervision: {
        mode: "read-only-status",
        tmuxBackendRequired: false,
        exitOnNotReady: true,
        recommendedReadOnlyCommands: expect.arrayContaining([
          {
            id: "doctor",
            command: "skfiy",
            args: [
              "doctor",
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
          }
        ])
      }
    });
    expect(JSON.stringify(output)).not.toContain("secret-token");
    expectJsonSafe(output);
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

  it("normalizes dashboard status and snapshot probes as read-only JSON commands", () => {
    const status = expectInvocation([
      "dashboard",
      "status",
      "--json",
      "--url",
      "http://127.0.0.1:8787/?token=secret-token"
    ]);
    const snapshot = expectInvocation([
      "dashboard",
      "snapshot",
      "--json",
      "--dashboard-url",
      "http://127.0.0.1:8787/"
    ]);

    expect(status).toEqual({
      kind: "dashboard-probe",
      path: "dashboard status",
      subcommand: "status",
      json: true,
      options: {
        url: "http://127.0.0.1:8787/?token=secret-token"
      }
    });
    expect(snapshot).toEqual({
      kind: "dashboard-probe",
      path: "dashboard snapshot",
      subcommand: "snapshot",
      json: true,
      options: {
        url: "http://127.0.0.1:8787/"
      }
    });
    expect(createCliOutput(status, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toEqual({
      schemaVersion: 1,
      command: "dashboard status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      executesSystemMutation: false,
      result: "not-run",
      url: "http://127.0.0.1:8787/",
      endpoints: {
        descriptor: "http://127.0.0.1:8787/descriptor.json",
        snapshot: "http://127.0.0.1:8787/snapshot.json",
        operatorEvidence: "http://127.0.0.1:8787/api/operator-evidence"
      },
      fetch: {
        descriptor: { state: "unknown" },
        snapshot: { state: "unknown" },
        operatorEvidence: { state: "unknown" }
      },
      descriptor: { state: "unknown" },
      snapshot: { state: "unknown" },
      operatorEvidence: { state: "unknown" },
      operatorReadiness: { state: "unknown" }
    });
    expectJsonSafe(createCliOutput(status));
    expectJsonSafe(createCliOutput(snapshot));
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

  it("normalizes the Chrome extension reload command as a desktop Computer Use operation", () => {
    const invocation = expectInvocation([
      "chrome",
      "reload-extension",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop"
    ]);
    const output = createCliOutput(invocation, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    });

    expect(invocation).toMatchObject({
      kind: "chrome",
      path: "chrome reload-extension",
      subcommand: "reload-extension",
      options: {
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        cliShimPath: "/repo/dist/skfiy"
      }
    });
    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "chrome reload-extension",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "not-run",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      productPath: "cli -> helper activate_app -> helper observe_app -> helper ocr_image -> helper click -> extension wake page -> native-host heartbeat",
      actionPlan: [
        "open chrome://extensions/",
        "activate Google Chrome",
        "observe the extension list or detail page and OCR labels",
        "click the extension reload control",
        "open the extension wake page",
        "poll the Native Messaging heartbeat"
      ]
    });
    expectJsonSafe(output);
  });

  it("normalizes Chrome host policy commands as explicit user-level state operations", () => {
    const show = expectInvocation(["chrome", "policy", "show", "--json"]);
    const set = expectInvocation([
      "chrome",
      "policy",
      "set",
      "--host",
      "https://Example.com/docs",
      "--action",
      "always-allow",
      "--json"
    ]);
    const reset = expectInvocation(["chrome", "policy", "reset", "--json"]);

    expect(show).toEqual({
      kind: "chrome-policy",
      path: "chrome policy show",
      subcommand: "show",
      json: true,
      options: {}
    });
    expect(set).toEqual({
      kind: "chrome-policy",
      path: "chrome policy set",
      subcommand: "set",
      json: true,
      options: {
        host: "https://Example.com/docs",
        action: "always_allow"
      }
    });
    expect(reset).toEqual({
      kind: "chrome-policy",
      path: "chrome policy reset",
      subcommand: "reset",
      json: true,
      options: {}
    });
    expect(createCliOutput(show, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toEqual({
      schemaVersion: 1,
      command: "chrome policy show",
      generatedAt: "2026-06-20T00:00:00.000Z",
      executesSystemMutation: false,
      hostPolicy: { state: "unknown" }
    });
    expect(createCliOutput(set, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      command: "chrome policy set",
      generatedAt: "2026-06-20T00:00:00.000Z",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "not-run",
      host: "https://Example.com/docs",
      action: "always_allow",
      hostPolicy: { state: "not-mutated" }
    });
    expectJsonSafe(createCliOutput(show));
    expectJsonSafe(createCliOutput(set));
    expectJsonSafe(createCliOutput(reset));
  });

  it("normalizes permission settings open commands with concrete macOS action plans", () => {
    const cases = [
      {
        target: "screen-recording",
        label: "Screen Recording",
        anchor: "Privacy_ScreenCapture",
        guidance: "Grant skfiy Screen Recording access."
      },
      {
        target: "accessibility",
        label: "Accessibility",
        anchor: "Privacy_Accessibility",
        guidance: "Grant skfiy Accessibility access."
      },
      {
        target: "automation-finder",
        label: "Automation",
        anchor: "Privacy_Automation",
        guidance: "Grant skfiy permission to control Finder in Automation."
      }
    ] as const;

    for (const { target, label, anchor, guidance } of cases) {
      const invocation = expectInvocation(["permissions", "open", target, "--json"]);
      const url = `x-apple.systempreferences:com.apple.preference.security?${anchor}`;

      expect(invocation).toEqual({
        kind: "permissions-open",
        path: `permissions open ${target}`,
        target,
        json: true
      });
      expect(createCliOutput(invocation, {
        generatedAt: "2026-06-20T00:00:00.000Z"
      })).toEqual({
        schemaVersion: 1,
        command: "permissions open",
        generatedAt: "2026-06-20T00:00:00.000Z",
        target,
        executesSystemMutation: true,
        result: "not-run",
        systemSettings: {
          app: "System Settings",
          pane: "Privacy & Security",
          label,
          anchor,
          url
        },
        actionPlan: [
          {
            step: "open-system-settings",
            executor: "skfiy-cli",
            command: "open",
            args: [url]
          },
          {
            step: "grant-permission",
            executor: "user",
            target,
            guidance
          }
        ]
      });
      expectJsonSafe(createCliOutput(invocation));
    }
  });

  it("normalizes local pet skin imports for origin art without bundling the asset", () => {
    const invocation = expectInvocation([
      "skin",
      "import",
      "--source",
      "origin/luoxiaohei.png",
      "--slug",
      "luoxiaohei-local",
      "--display-name",
      "Luo Xiaohei local",
      "--license-source",
      "canva-local",
      "--json"
    ]);

    expect(invocation).toMatchObject({
      kind: "skin-import",
      path: "skin import",
      json: true,
      options: {
        sourcePath: "/repo/origin/luoxiaohei.png",
        slug: "luoxiaohei-local",
        displayName: "Luo Xiaohei local",
        licenseSource: "canva-local"
      }
    });
    expect(createCliOutput(invocation, {
      generatedAt: "2026-06-22T05:30:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      command: "skin import",
      generatedAt: "2026-06-22T05:30:00.000Z",
      result: "not-run",
      plannedMutation: true,
      executesSystemMutation: true,
      skin: {
        slug: "luoxiaohei-local",
        displayName: "Luo Xiaohei local",
        licenseSource: "canva-local",
        redistribution: "local-only"
      }
    });
  });

  it("imports local origin art into the user skin directory", async () => {
    const homeDir = createTempRoot();
    const rootDir = createTempRoot();
    const sourcePath = path.join(rootDir, "luoxiaohei official.png");
    writeFileSync(sourcePath, "fake image");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = await runSkfiyCli({
      argv: [
        "skin",
        "import",
        "--source",
        sourcePath,
        "--slug",
        "luoxiaohei-local",
        "--display-name",
        "Luo Xiaohei local",
        "--license-source",
        "canva-local",
        "--json"
      ],
      rootDir,
      homeDir,
      stdout,
      stderr
    });

    expect(exitCode).toBe(0);
    expect(stderr.write).not.toHaveBeenCalled();
    const output = JSON.parse(String(stdout.write.mock.calls[0][0]));
    expect(output).toMatchObject({
      command: "skin import",
      result: "imported",
      skin: {
        slug: "luoxiaohei-local",
        displayName: "Luo Xiaohei local",
        licenseSource: "canva-local",
        redistribution: "local-only"
      }
    });
    expect(output.manifestPath).toBe(
      path.join(homeDir, "Library/Application Support/skfiy/skins/luoxiaohei-local/skin.pet.json")
    );
    expect(existsSync(output.assetPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(output.manifestPath, "utf8"));
    expect(manifest).toMatchObject({
      displayName: "Luo Xiaohei local",
      slug: "luoxiaohei-local",
      asset: expect.stringMatching(/^file:\/\//),
      frameWidth: 192,
      frameHeight: 208,
      columns: 1,
      rows: 1,
      source: "custom-user",
      origin: {
        sourcePath,
        licenseSource: "canva-local",
        redistribution: "local-only"
      },
      states: {
        idle: { row: 0, frames: 1, frameMs: 170 },
        review: { row: 0, frames: 1, frameMs: 135 }
      }
    });
  });

  it("marks imported animated raster skins so Chromium keeps the source animation", async () => {
    const homeDir = createTempRoot();
    const rootDir = createTempRoot();
    const sourcePath = path.join(rootDir, "luoxiaohei-local.webp");
    writeFileSync(sourcePath, "fake animated webp");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    const exitCode = await runSkfiyCli({
      argv: [
        "skin",
        "import",
        "--source",
        sourcePath,
        "--slug",
        "luoxiaohei-local",
        "--json"
      ],
      rootDir,
      homeDir,
      stdout,
      stderr
    });

    expect(exitCode).toBe(0);
    expect(stderr.write).not.toHaveBeenCalled();
    const output = JSON.parse(String(stdout.write.mock.calls[0][0]));
    const manifest = JSON.parse(readFileSync(output.manifestPath, "utf8"));
    expect(manifest).toMatchObject({
      asset: expect.stringMatching(/origin\.webp$/),
      rendering: {
        mode: "animated-raster",
        ambientMotion: false,
        failureShake: false
      },
      columns: 1,
      rows: 1,
      states: {
        idle: { frames: 1 },
        review: { frames: 1 }
      }
    });
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
    const moneyRun = expectInvocation([
      "smoke",
      "money-run",
      "--output",
      ".skfiy-smoke/money-run.json"
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
    expect(moneyRun).toMatchObject({
      kind: "smoke",
      path: "smoke money-run",
      target: "money-run",
      outputPath: "/repo/.skfiy-smoke/money-run.json",
      options: {
        requirePassed: false,
        scriptPath: "/repo/scripts/smoke-money-run-supervision.mjs",
        scriptArgs: [
          "--output",
          "/repo/.skfiy-smoke/money-run.json"
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
    expect(createCliOutput(moneyRun)).toMatchObject({
      command: "smoke money-run",
      target: "money-run",
      outputPath: "/repo/.skfiy-smoke/money-run.json",
      scriptPath: "/repo/scripts/smoke-money-run-supervision.mjs",
      scriptArgs: [
        "--output",
        "/repo/.skfiy-smoke/money-run.json"
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
    expect(normalizeCliCommand(["dashboard", "status", "--json"])).toEqual({
      ok: false,
      error: {
        code: "missing-dashboard-url",
        message: "Dashboard status requires --url <url>."
      }
    });
    expect(normalizeCliCommand(["dashboard", "events"])).toEqual({
      ok: false,
      error: {
        code: "unknown-dashboard-subcommand",
        message: "Unknown dashboard subcommand: events"
      }
    });
    expect(normalizeCliCommand(["operator", "events"])).toEqual({
      ok: false,
      error: {
        code: "unknown-operator-subcommand",
        message: "Unknown operator subcommand: events"
      }
    });
    expect(normalizeCliCommand(["chrome", "policy", "inspect"])).toEqual({
      ok: false,
      error: {
        code: "unknown-chrome-policy-subcommand",
        message: "Unknown chrome policy subcommand: inspect"
      }
    });
    expect(normalizeCliCommand(["chrome", "policy", "set", "--host", "example.com"])).toEqual({
      ok: false,
      error: {
        code: "unknown-chrome-policy-action",
        message: "Unknown chrome policy action: "
      }
    });
    expect(normalizeCliCommand(["permissions", "open", "calendar"])).toEqual({
      ok: false,
      error: {
        code: "unknown-permission-settings-target",
        message: "Unknown permission settings target: calendar"
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

  it("includes runtime snapshot evidence in status JSON and text output", async () => {
    const homeDir = createTempRoot();
    const snapshotPath = path.join(
      homeDir,
      "Library",
      "Application Support",
      "skfiy",
      "runtime-snapshot.json"
    );
    const statusReader = async () => ({
      app: { state: "installed", path: "/repo/dist/skfiy.app" },
      cli: { state: "installed", path: "/repo/dist/skfiy" },
      helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: { state: "controllable", controllable: true },
      extension: { state: "unknown" },
      nativeHost: { state: "unknown", extensionIds: [], cliShimPath: "/repo/dist/skfiy" },
      dashboard: { state: "not-running" },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

    try {
      mkdirSync(path.dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, `${JSON.stringify({
        schemaVersion: 1,
        observedAt: "2026-06-20T00:00:10.000Z",
        currentTurn: {
          state: "observing",
          command: "take screenshot",
          latestMessage: "Capturing the desktop.",
          stopState: "available",
          updateSource: "live-task-event"
        },
        replay: {
          state: "empty",
          screenshotCount: 0,
          actionCount: 0
        }
      }, null, 2)}\n`);

      const jsonStdout: string[] = [];
      const textStdout: string[] = [];
      const stderr: string[] = [];

      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:00:40.000Z",
        statusReader,
        stdout: { write: (chunk: string) => jsonStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      expect(JSON.parse(jsonStdout.join(""))).toMatchObject({
        runtimeSnapshot: {
          state: "available",
          path: snapshotPath,
          observedAt: "2026-06-20T00:00:10.000Z",
          ageSeconds: 30,
          currentTurn: {
            state: "observing",
            command: "take screenshot",
            latestMessage: "Capturing the desktop.",
            stopState: "available",
            updateSource: "live-task-event"
          },
          replay: {
            state: "empty",
            screenshotCount: 0,
            actionCount: 0
          }
        }
      });

      await expect(runSkfiyCli({
        argv: ["status"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:00:40.000Z",
        statusReader,
        stdout: { write: (chunk: string) => textStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const textOutput = textStdout.join("");

      expect(textOutput).toContain("runtime-snapshot: available age=30s");
      expect(textOutput).toContain(
        'current-turn: observing stop=available source=live-task-event command="take screenshot" message="Capturing the desktop."'
      );
      expect(stderr).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("distinguishes a missing runtime snapshot after a recent app turn from a clean first run", async () => {
    const homeDir = createTempRoot();
    const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
    const markerPath = createRuntimeTurnMarkerStatePath(homeDir);
    const stderr: string[] = [];
    const statusReader = async () => ({
      app: { state: "installed", path: "/repo/dist/skfiy.app" },
      cli: { state: "installed", path: "/repo/dist/skfiy" },
      helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: { state: "controllable", controllable: true },
      extension: { state: "unknown" },
      nativeHost: { state: "unknown", extensionIds: [], cliShimPath: "/repo/dist/skfiy" },
      dashboard: { state: "not-running" },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

    try {
      const cleanStdout: string[] = [];
      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:00:40.000Z",
        statusReader,
        stdout: { write: (chunk: string) => cleanStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);
      expect(JSON.parse(cleanStdout.join("")).runtimeSnapshot).toMatchObject({
        state: "missing",
        path: snapshotPath,
        freshInstall: true,
        emptyReasonCode: "runtime-snapshot-missing"
      });

      mkdirSync(path.dirname(markerPath), { recursive: true });
      writeFileSync(markerPath, `${JSON.stringify({
        schemaVersion: 1,
        observedAt: "2026-06-20T00:00:35.000Z",
        currentTurn: {
          state: "observing",
          command: "capture screen token=marker-secret",
          targetApp: "Finder",
          latestMessage: "Watching the desktop.",
          updateSource: "live-task-event"
        }
      }, null, 2)}\n`);

      const jsonStdout: string[] = [];
      const textStdout: string[] = [];

      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:00:40.000Z",
        statusReader,
        stdout: { write: (chunk: string) => jsonStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);
      await expect(runSkfiyCli({
        argv: ["status"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:00:40.000Z",
        statusReader,
        stdout: { write: (chunk: string) => textStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const output = JSON.parse(jsonStdout.join(""));

      expect(existsSync(snapshotPath)).toBe(false);
      expect(output.runtimeSnapshot).toMatchObject({
        state: "missing-after-turn",
        path: snapshotPath,
        markerPath,
        markerObservedAt: "2026-06-20T00:00:35.000Z",
        markerAgeSeconds: 5,
        emptyReasonCode: "runtime-snapshot-missing-after-turn",
        marker: {
          state: "recent",
          path: markerPath,
          ageSeconds: 5,
          currentTurn: {
            state: "observing",
            source: "runtime-turn-marker",
            command: "capture screen redacted=[redacted]",
            targetApp: "Finder",
            latestMessage: "Watching the desktop.",
            updateSource: "live-task-event"
          }
        },
        currentTurn: {
          state: "observing",
          source: "runtime-turn-marker",
          command: "capture screen redacted=[redacted]",
          targetApp: "Finder",
          latestMessage: "Watching the desktop.",
          updateSource: "live-task-event",
          emptyReasonCode: "runtime-snapshot-missing-after-turn"
        },
        replay: {
          state: "empty",
          source: "runtime-snapshot",
          emptyReasonCode: "runtime-snapshot-missing-after-turn"
        }
      });
      expect(output.runtimeSnapshot.freshInstall).toBeUndefined();
      expect(output.evidence.currentTurn).toMatchObject({
        state: "observing",
        source: "runtime-turn-marker",
        command: "capture screen redacted=[redacted]"
      });
      expect(textStdout.join("")).toContain(`runtime-snapshot: missing-after-turn marker-age=5s path=${snapshotPath} marker=${markerPath}`);
      expect(textStdout.join("")).toContain("current-turn: observing target=Finder source=live-task-event command=\"capture screen redacted=[redacted]\"");
      expect(`${jsonStdout.join("")}\n${textStdout.join("")}`).not.toContain("marker-secret");
      expect(stderr).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("reports stale-after-turn when the runtime turn marker is no longer recent", async () => {
    const homeDir = createTempRoot();
    const markerPath = createRuntimeTurnMarkerStatePath(homeDir);
    const statusReader = async () => ({
      app: { state: "installed", path: "/repo/dist/skfiy.app" },
      cli: { state: "installed", path: "/repo/dist/skfiy" },
      helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: { state: "controllable", controllable: true },
      extension: { state: "unknown" },
      nativeHost: { state: "unknown", extensionIds: [], cliShimPath: "/repo/dist/skfiy" },
      dashboard: { state: "not-running" },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

    try {
      mkdirSync(path.dirname(markerPath), { recursive: true });
      writeFileSync(markerPath, `${JSON.stringify({
        schemaVersion: 1,
        observedAt: "2026-06-20T00:00:00.000Z",
        currentTurn: {
          state: "completed",
          command: "open Chrome",
          latestMessage: "Done."
        }
      }, null, 2)}\n`);

      const jsonStdout: string[] = [];
      const textStdout: string[] = [];
      const stderr: string[] = [];

      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:10:00.000Z",
        statusReader,
        stdout: { write: (chunk: string) => jsonStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);
      await expect(runSkfiyCli({
        argv: ["status"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:10:00.000Z",
        statusReader,
        stdout: { write: (chunk: string) => textStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const output = JSON.parse(jsonStdout.join(""));

      expect(output.runtimeSnapshot).toMatchObject({
        state: "stale-after-turn",
        markerPath,
        markerAgeSeconds: 600,
        emptyReasonCode: "runtime-snapshot-stale-after-turn",
        marker: {
          state: "stale",
          ageSeconds: 600,
          currentTurn: {
            state: "completed",
            source: "runtime-turn-marker",
            command: "open Chrome",
            latestMessage: "Done."
          }
        },
        currentTurn: {
          state: "completed",
          source: "runtime-turn-marker",
          command: "open Chrome",
          emptyReasonCode: "runtime-snapshot-stale-after-turn"
        }
      });
      expect(output.runtimeSnapshot.freshInstall).toBeUndefined();
      expect(textStdout.join("")).toContain("runtime-snapshot: stale-after-turn marker-age=600s");
      expect(stderr).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
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
          cli: { state: "installed", path: "/repo/dist/skfiy" },
          helper: {
            state: "installed",
            path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
          },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            finderAutomation: "unknown"
          },
          desktopSession: {
            state: "controllable",
            frontmostBundleId: "com.apple.finder",
            controllable: true
          },
          extension: {
            state: "connected",
            bridge: "native-messaging",
            liveConnection: "connected",
            nativeHostState: "installed",
            pageControl: {
              state: "ready",
              reason: "Current page is ready for Computer Use controls.",
              capabilities: {
                diagnostics: true,
                observe: true,
                domActions: true,
                click: true,
                fill: true,
                scroll: true,
                screenshot: true
              },
              source: "extension.pageControl"
            }
          },
          nativeHost: {
            state: "installed",
            cliShimPath: "/repo/dist/skfiy",
            extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
          },
          dashboard: {
            state: "running",
            url: "http://127.0.0.1:8787/"
          },
          moneyRun: {
            state: "observing",
            session: "money-run",
            source: "tmux-read-only-probe",
            mutatesSession: false,
            summary: {
              windowCount: 1,
              paneCount: 1,
              activePaneIds: ["%1"],
              deadPaneIds: []
            },
            recommendation: {
              action: "continue_observing",
              reason: "money-run has 1 window, 1 pane, and no obvious block markers.",
              mutatesSession: false
            }
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
      cli: { state: "installed" },
      helper: { state: "installed" },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
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
      },
      moneyRun: {
        state: "observing",
        session: "money-run",
        mutatesSession: false
      },
      readiness: {
        state: "ready",
        ready: true,
        checks: {
          runtime: {
            state: "ready",
            ready: true,
            appState: "installed",
            cliState: "installed",
            helperState: "installed",
            desktopSessionState: "controllable"
          },
          dashboard: {
            state: "ready",
            ready: true,
            dashboardState: "running"
          },
          extension: {
            state: "ready",
            ready: true,
            extensionState: "connected",
            nativeHostState: "installed",
            liveConnection: "connected"
          },
          moneyRun: {
            state: "ready",
            ready: true,
            session: "money-run",
            moneyRunState: "observing",
            mutatesSession: false
          }
        },
        blockers: []
      }
    });
    expect(stdout.join("")).not.toContain("token=");
    expect(stderr).toEqual([]);
  });

  it("infers the Chrome extension id from the latest heartbeat when status is run without an explicit id", async () => {
    const rootDir = createTempRoot();
    const homeDir = createTempRoot();
    const extensionId = "abcdefghijklmnopabcdefghijklmnop";
    const cliShimPath = path.join(rootDir, "dist", "skfiy");
    const manifestPath = path.join(
      homeDir,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      "com.sskift.skfiy.json"
    );
    const heartbeatPath = path.join(
      homeDir,
      "Library",
      "Application Support",
      "skfiy",
      "chrome-extension-connection.json"
    );
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      mkdirSync(path.dirname(cliShimPath), { recursive: true });
      writeFileSync(cliShimPath, "#!/usr/bin/env node\n");
      mkdirSync(path.dirname(manifestPath), { recursive: true });
      writeFileSync(manifestPath, `${JSON.stringify({
        name: "com.sskift.skfiy",
        description: "skfiy desktop Computer Use bridge",
        path: cliShimPath,
        type: "stdio",
        allowed_origins: [`chrome-extension://${extensionId}/`]
      }, null, 2)}\n`);
      mkdirSync(path.dirname(heartbeatPath), { recursive: true });
      writeFileSync(heartbeatPath, `${JSON.stringify({
        schemaVersion: 1,
        hostName: "com.sskift.skfiy",
        observedAt: "2026-06-20T00:00:00.000Z",
        launchOrigin: `chrome-extension://${extensionId}/`,
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-tab_updated-1"
      }, null, 2)}\n`);

      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir,
        homeDir,
        generatedAt: "2026-06-20T00:00:10.000Z",
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const output = JSON.parse(stdout.join(""));

      expect(output.nativeHost).toMatchObject({
        state: "installed",
        manifestPath,
        cliShimPath,
        extensionIds: [extensionId],
        allowedOrigins: [`chrome-extension://${extensionId}/`]
      });
      expect(output.extension).toMatchObject({
        nativeHostState: "installed",
        connection: {
          launchOrigin: `chrome-extension://${extensionId}/`
        },
        pageControl: {
          nextAction: expect.stringContaining(`--extension-id ${extensionId}`)
        }
      });
      expect(output.readiness.checks.extension).toMatchObject({
        nativeHostState: "installed",
        extensionIds: [extensionId]
      });
      expect(JSON.stringify(output)).not.toContain("--extension-id <extension-id>");
      expect(stderr).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("summarizes runtime snapshot and dashboard smoke evidence in JSON and text status", async () => {
    const rootDir = createTempRoot();
    const homeDir = path.join(rootDir, "home");
    const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
    const smokeDir = path.join(rootDir, ".skfiy-smoke");
    const dashboardSmokePath = path.join(smokeDir, "dashboard-current.json");
    const jsonStdout: string[] = [];
    const textStdout: string[] = [];
    const stderr: string[] = [];
    const statusReader = async () => ({
      app: { state: "installed", path: path.join(rootDir, "dist", "skfiy.app") },
      cli: { state: "installed", path: path.join(rootDir, "dist", "skfiy") },
      helper: {
        state: "installed",
        path: path.join(rootDir, "dist", "skfiy.app", "Contents", "MacOS", "skfiy-helper")
      },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: {
        state: "controllable",
        controllable: true
      },
      extension: {
        state: "connected",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed",
        pageControl: {
          state: "ready",
          reason: "Current page is ready for Computer Use controls.",
          capabilities: {
            diagnostics: true,
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            scroll: true,
            screenshot: true
          },
          source: "extension.pageControl"
        }
      },
      nativeHost: {
        state: "installed",
        cliShimPath: path.join(rootDir, "dist", "skfiy"),
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
      },
      dashboard: {
        state: "running",
        url: "http://127.0.0.1:8787/"
      },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

    mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
    writeFileSync(runtimeSnapshotPath, `${JSON.stringify({
      schemaVersion: 1,
      observedAt: "2026-06-20T00:00:00.000Z",
      currentTurn: {
        state: "approval_required",
        source: "runtime-snapshot",
        command: "open https://example.test/?token=secret-token",
        targetApp: "Chrome",
        targetBundleId: "com.google.Chrome",
        risk: "medium",
        approvalRequired: true,
        approvalState: "required",
        stopState: "available",
        latestMessage: "Approval is waiting.",
        latestAction: {
          type: "plan",
          status: "pending"
        },
        latestVerification: {
          actionType: "navigate",
          status: "pending"
        }
      },
      replay: {
        state: "available",
        source: "runtime-snapshot",
        outcome: "approval_required",
        screenshotCount: 2,
        actionCount: 3,
        verificationCount: 1,
        timelineCount: 4,
        latestMessage: "Approval is waiting."
      }
    }, null, 2)}\n`);
    mkdirSync(smokeDir, { recursive: true });
    writeFileSync(dashboardSmokePath, `${JSON.stringify({
      timestamp: "2026-06-20T00:00:01.000Z",
      result: "passed",
      target: "dashboard",
      productPath: "dist/skfiy -> skfiy dashboard -> loopback dashboard server",
      runtimeSnapshotCoverage: {
        result: "passed",
        reason: "Seeded runtime snapshot currentTurn and replay are visible at /snapshot.json."
      },
      snapshotResponse: {
        status: 200,
        body: {
          schemaVersion: 1,
          runtimeHealth: {
            dashboard: { state: "running" },
            runtimeSnapshot: {
              state: "available",
              path: runtimeSnapshotPath,
              observedAt: "2026-06-20T00:00:00.000Z"
            }
          },
          currentTurn: {
            state: "approval_required",
            source: "runtime-snapshot",
            command: "open https://example.test/?token=smoke-token",
            targetApp: "Chrome",
            approvalState: "required",
            stopState: "available"
          },
          replay: {
            state: "available",
            source: "runtime-snapshot",
            screenshotCount: 2,
            actionCount: 3,
            verificationCount: 1
          },
          smokeEvidence: {
            artifacts: [
              { target: "chrome", result: "passed" },
              { target: "cli", result: "passed" }
            ]
          },
          alerts: []
        }
      }
    }, null, 2)}\n`);
    utimesSync(dashboardSmokePath, new Date("2026-06-20T00:00:01.000Z"), new Date("2026-06-20T00:00:01.000Z"));

    await expect(runSkfiyCli({
      argv: [
        "status",
        "--json",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      rootDir,
      homeDir,
      generatedAt: "2026-06-20T00:00:10.000Z",
      statusReader,
      stdout: { write: (chunk: string) => jsonStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);
    await expect(runSkfiyCli({
      argv: [
        "status",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      rootDir,
      homeDir,
      generatedAt: "2026-06-20T00:00:10.000Z",
      statusReader,
      stdout: { write: (chunk: string) => textStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    const output = JSON.parse(jsonStdout.join(""));

    expect(output.evidence).toMatchObject({
      schemaVersion: 1,
      source: "skfiy-status-local-evidence",
      binaryReadiness: {
        state: "ready",
        ready: true,
        app: { state: "installed" },
        cli: { state: "installed" },
        helper: { state: "installed" }
      },
      extensionPageControl: {
        state: "ready",
        source: "extension.pageControl"
      },
      runtimeSnapshot: {
        state: "available",
        path: runtimeSnapshotPath,
        observedAt: "2026-06-20T00:00:00.000Z",
        currentTurn: {
          state: "approval_required",
          command: "open https://example.test/?redacted=[redacted]",
          targetApp: "Chrome",
          approvalState: "required",
          stopState: "available"
        },
        replay: {
          state: "available",
          screenshotCount: 2,
          actionCount: 3,
          verificationCount: 1
        }
      },
      currentTurn: {
        state: "approval_required",
        command: "open https://example.test/?redacted=[redacted]",
        targetApp: "Chrome"
      },
      dashboardSmoke: {
        state: "passed",
        result: "passed",
        path: dashboardSmokePath,
        ageSeconds: 9,
        runtimeSnapshotCoverage: {
          result: "passed"
        },
        dashboardSnapshot: {
          runtimeSnapshotState: "available",
          currentTurn: {
            state: "approval_required",
            command: "open https://example.test/?redacted=[redacted]"
          },
          smokeTargets: ["chrome", "cli"],
          alertCount: 0
        }
      }
    });
    expect(textStdout.join("")).toContain("skfiy status\n");
    expect(textStdout.join("")).toContain("binary: state=ready app=installed cli=installed helper=installed");
    expect(textStdout.join("")).toContain("extension page control: state=ready source=extension.pageControl");
    expect(textStdout.join("")).toContain("current-turn: approval_required target=Chrome approval=required stop=available command=\"open https://example.test/?redacted=[redacted]\"");
    expect(textStdout.join("")).toContain(`dashboard smoke: state=passed path=${dashboardSmokePath}`);
    expect(`${jsonStdout.join("")}\n${textStdout.join("")}`).not.toContain("secret-token");
    expect(`${jsonStdout.join("")}\n${textStdout.join("")}`).not.toContain("smoke-token");
    expect(stderr).toEqual([]);

    rmSync(rootDir, { recursive: true, force: true });
  });

  it("distinguishes Chrome page-safety from missing page-control readiness", async () => {
    const statusStdout: string[] = [];
    const doctorStdout: string[] = [];
    const stderr: string[] = [];
    const hostPolicyPath = "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json";
    const heartbeatPath = "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json";
    const statusReader = async () => ({
      app: { state: "installed", path: "/repo/dist/skfiy.app" },
      cli: { state: "installed", path: "/repo/dist/skfiy" },
      helper: {
        state: "installed",
        path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
      },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: {
        state: "controllable",
        controllable: true
      },
      extension: {
        state: "connected",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed",
        connection: {
          state: "connected",
          liveConnection: "connected",
          path: heartbeatPath,
          ageSeconds: 12,
          observedAt: "2026-06-19T23:59:48.000Z",
          launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          messageType: "skfiy.page.observe",
          requestId: "request-page-safety"
        },
        hostPolicy: {
          schemaVersion: 1,
          state: "default",
          path: hostPolicyPath,
          policy: {
            defaultMode: "ask",
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      },
      nativeHost: {
        state: "installed",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
      },
      dashboard: {
        state: "running",
        url: "http://127.0.0.1:8787/",
        api: {
          chromeHostPolicy: {
            state: "reachable"
          }
        }
      },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

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
      statusReader,
      stdout: { write: (chunk: string) => statusStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);
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
      statusReader,
      signatureReader: async () => ({ state: "valid" }),
      stdout: { write: (chunk: string) => doctorStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    const statusOutput = JSON.parse(statusStdout.join(""));
    const doctorOutput = JSON.parse(doctorStdout.join(""));

    expect(statusOutput.extension).toMatchObject({
      capabilities: {
        pageSafety: true,
        pageControl: false
      },
      pageSafety: {
        schemaVersion: 1,
        capability: "chrome-extension-page-safety",
        capable: true,
        state: "ready",
        evidence: {
          nativeMessaging: true,
          nativeHostState: "installed",
          hostPolicy: {
            state: "default",
            defaultMode: "ask",
            failClosed: true,
            path: hostPolicyPath,
            entryCount: 0
          },
          liveConnection: {
            state: "connected",
            liveConnection: "connected",
            messageType: "skfiy.page.observe",
            pageObservationHeartbeat: true,
            path: heartbeatPath,
            requestId: "request-page-safety"
          },
          extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
          cliShimPath: "/repo/dist/skfiy"
        }
      },
      pageControl: {
        schemaVersion: 1,
        capability: "chrome-extension-page-control",
        state: "needs-action",
        reason: "Chrome extension did not report pageControl readiness for the current page.",
        capabilities: {},
        source: "cli-status-derived"
      }
    });
    expect(statusOutput.readiness.checks.extension.pageSafety).toMatchObject({
      capable: true,
      state: "ready"
    });
    expect(statusOutput.readiness.checks.extension.pageControl).toMatchObject({
      state: "needs-action",
      source: "cli-status-derived"
    });
    expect(doctorOutput).toMatchObject({
      schemaVersion: 1,
      command: "doctor",
      result: "needs-action",
      capabilities: {
        chromeExtensionPageSafety: true,
        chromeExtensionPageControl: false
      },
      preflight: {
        chrome: {
          pageSafety: {
            capability: "chrome-extension-page-safety",
            capable: true,
            state: "ready"
          },
          pageControl: {
            capability: "chrome-extension-page-control",
            state: "needs-action",
            source: "cli-status-derived"
          }
        }
      },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "chrome-page-control-readiness",
          severity: "warning",
          nextAction: expect.stringContaining("skfiy chrome status --json")
        })
      ])
    });
    expect(stderr).toEqual([]);
  });

  it("reports Chrome page-control readiness as not-probed when no extension evidence exists", () => {
    const status = createCliOutput(expectInvocation(["status", "--json"]), {
      generatedAt: "2026-06-20T00:00:00.000Z"
    });

    expect(status).toMatchObject({
      extension: {
        pageControl: {
          schemaVersion: 1,
          capability: "chrome-extension-page-control",
          state: "not-probed",
          reason: "Chrome extension page control readiness has not been reported yet.",
          capabilities: {},
          source: "not-probed",
          nextAction: "Run `skfiy chrome status --json --extension-id <extension-id>` after opening a controllable Chrome page."
        }
      }
    });
  });

  it("expands Chrome page-control machine next actions into concrete operator guidance", async () => {
    const statusStdout: string[] = [];
    const doctorStdout: string[] = [];
    const stderr: string[] = [];
    const statusReader = async () => ({
      app: { state: "installed", path: "/repo/dist/skfiy.app" },
      cli: { state: "installed", path: "/repo/dist/skfiy" },
      helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: { state: "controllable", controllable: true },
      extension: {
        state: "connected",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed",
        pageControl: {
          schemaVersion: 1,
          capable: false,
          state: "blocked_by_host_policy",
          reason: "Host policy has not allowed this page.",
          nextAction: "allow_host",
          activeTab: {
            state: "available",
            host: "mew.bytedance.net"
          },
          chromeHostPermission: {
            state: "missing",
            origins: ["https://mew.bytedance.net/*"]
          },
          chromeCapturePermission: {
            state: "missing",
            origins: ["<all_urls>"]
          },
          blockers: [{
            code: "blocked_by_host_policy",
            reason: "default_policy",
            message: "Host policy has not allowed this page."
          }]
        }
      },
      nativeHost: {
        state: "installed",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
      },
      dashboard: { state: "not-running" },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

    await expect(runSkfiyCli({
      argv: ["status", "--json", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader,
      stdout: { write: (chunk: string) => statusStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    await expect(runSkfiyCli({
      argv: ["doctor", "--json", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader,
      signatureReader: async () => ({ state: "valid" }),
      stdout: { write: (chunk: string) => doctorStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    const statusOutput = JSON.parse(statusStdout.join(""));
    const doctorOutput = JSON.parse(doctorStdout.join(""));

    expect(statusOutput.extension.pageControl.nextAction).toContain(
      "skfiy chrome policy set --host mew.bytedance.net --action allow-current-turn"
    );
    expect(statusOutput.extension.pageControl.nextAction).toContain(
      "Open the skfiy extension popup and click Grant https://mew.bytedance.net/* + <all_urls> and observe."
    );
    expect(statusOutput.extension.pageControl.nextAction).toContain(
      "Open Dashboard > Browser and click Open access page"
    );
    expect(statusOutput.extension.pageControl.nextAction).not.toContain("Grant Chrome visible-tab capture access");
    expect(statusOutput.extension.pageControl.nextAction).not.toContain("Refresh the skfiy Chrome extension");
    expect(statusOutput.extension.pageControl.nextAction).not.toBe("allow_host");
    expect(doctorOutput.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "chrome-page-control-readiness",
        nextAction: statusOutput.extension.pageControl.nextAction
      })
    ]));
    expect(stderr).toEqual([]);
  });

  it("passes through Chrome page-control readiness from extension diagnostics into status and doctor", async () => {
    const statusStdout: string[] = [];
    const doctorStdout: string[] = [];
    const stderr: string[] = [];
    const statusReader = async () => ({
      app: { state: "installed", path: "/repo/dist/skfiy.app" },
      cli: { state: "installed", path: "/repo/dist/skfiy" },
      helper: {
        state: "installed",
        path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
      },
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      },
      desktopSession: {
        state: "controllable",
        controllable: true
      },
      extension: {
        state: "connected",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed",
        diagnostics: {
          currentTab: {
            state: "available",
            pageControl: {
              state: "ready",
              reason: "Current page is ready for Computer Use controls.",
              capabilities: {
                diagnostics: true,
                observe: true,
                domActions: true,
                click: true,
                fill: true,
                submit: true,
                scroll: true,
                screenshot: true
              },
              counts: {
                interactiveElements: 4,
                forms: 1,
                fillableForms: 1,
                sensitiveForms: 0
              },
              pageSafety: {
                state: "clear"
              },
              sensitivePause: {
                active: false
              },
              observedAt: "2026-06-20T00:00:00.000Z"
            }
          }
        }
      },
      nativeHost: {
        state: "installed",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
      },
      dashboard: {
        state: "running",
        url: "http://127.0.0.1:8787/",
        api: {
          chromeHostPolicy: {
            state: "reachable"
          }
        }
      },
      moneyRun: {
        state: "observing",
        session: "money-run",
        source: "tmux-read-only-probe",
        mutatesSession: false
      }
    });

    await expect(runSkfiyCli({
      argv: [
        "status",
        "--json",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader,
      stdout: { write: (chunk: string) => statusStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);
    await expect(runSkfiyCli({
      argv: [
        "doctor",
        "--json",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader,
      signatureReader: async () => ({ state: "valid" }),
      stdout: { write: (chunk: string) => doctorStdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    const statusOutput = JSON.parse(statusStdout.join(""));
    const doctorOutput = JSON.parse(doctorStdout.join(""));

    expect(statusOutput.extension).toMatchObject({
      capabilities: {
        pageControl: true
      },
      pageControl: {
        schemaVersion: 1,
        capability: "chrome-extension-page-control",
        state: "ready",
        reason: "Current page is ready for Computer Use controls.",
        source: "extension.diagnostics.currentTab.pageControl",
        capabilities: {
          domActions: true,
          click: true,
          fill: true,
          submit: true,
          scroll: true,
          screenshot: true
        },
        counts: {
          interactiveElements: 4,
          forms: 1
        },
        pageSafety: {
          state: "clear"
        },
        sensitivePause: {
          active: false
        }
      }
    });
    expect(statusOutput.readiness.checks.extension.pageControl).toMatchObject({
      state: "ready",
      source: "extension.diagnostics.currentTab.pageControl"
    });
    expect(doctorOutput).toMatchObject({
      result: "ok",
      capabilities: {
        chromeExtensionPageControl: true
      },
      preflight: {
        chrome: {
          pageControl: {
            state: "ready",
            source: "extension.diagnostics.currentTab.pageControl"
          }
        }
      },
      diagnostics: []
    });
    expect(stderr).toEqual([]);
  });

  it("runs operator status as a compact read-only supervisor summary", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const statusInputs: unknown[] = [];

    await expect(runSkfiyCli({
      argv: [
        "operator",
        "status",
        "--json",
        "--require-ready",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--dashboard-url",
        "http://127.0.0.1:8787/?token=secret-token"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader: async (input) => {
        statusInputs.push(input);
        return {
          app: { state: "installed", path: "/repo/dist/skfiy.app" },
          cli: { state: "installed", path: "/repo/dist/skfiy" },
          helper: {
            state: "installed",
            path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
          },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            finderAutomation: "granted"
          },
          desktopSession: {
            state: "controllable",
            controllable: true
          },
          extension: {
            state: "connected",
            bridge: "native-messaging",
            liveConnection: "connected",
            nativeHostState: "installed",
            pageControl: {
              state: "ready",
              reason: "Current page is ready for Computer Use controls.",
              capabilities: {
                diagnostics: true,
                observe: true,
                domActions: true,
                click: true,
                fill: true,
                scroll: true,
                screenshot: true
              },
              source: "extension.pageControl"
            }
          },
          nativeHost: {
            state: "installed",
            cliShimPath: "/repo/dist/skfiy",
            extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
          },
          dashboard: {
            state: "running",
            url: "http://127.0.0.1:8787/?token=secret-token",
            api: {
              chromeHostPolicy: {
                state: "reachable"
              }
            }
          },
          moneyRun: {
            state: "observing",
            session: "money-run",
            source: "tmux-read-only-probe",
            mutatesSession: false
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
      dashboardUrl: "http://127.0.0.1:8787/?token=secret-token"
    }]);
    const output = JSON.parse(stdout.join(""));

    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "operator status",
      generatedAt: "2026-06-20T00:00:00.000Z",
      result: "ready",
      ready: true,
      requireReady: true,
      executesSystemMutation: false,
      targets: {
        runtime: {
          state: "ready",
          ready: true
        },
        dashboard: {
          state: "ready",
          ready: true,
          dashboardState: "running",
          url: "http://127.0.0.1:8787/"
        },
        plugin: {
          state: "available",
          ready: true,
          adapter: "codex-plugin-mcp",
          transport: "stdio",
          command: "skfiy mcp serve --stdio",
          cliShimPath: "/repo/dist/skfiy",
          tools: ["skfiy.status", "skfiy.doctor"],
          blockers: []
        },
        extension: {
          state: "ready",
          ready: true,
          extensionState: "connected",
          nativeHostState: "installed",
          liveConnection: "connected",
          extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
          nextAction: expect.stringContaining("Chrome extension has recently connected"),
          setupGuide: {
            state: "ready",
            nextActions: expect.arrayContaining([
              expect.objectContaining({
                id: "verify-live-connection",
                state: "done"
              })
            ]),
            copyableCommands: expect.arrayContaining([
              expect.objectContaining({
                copyText: "skfiy chrome status --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
              })
            ])
          }
        },
        moneyRun: {
          state: "ready",
          ready: true,
          session: "money-run",
          moneyRunState: "observing",
          source: "tmux-read-only-probe",
          mutatesSession: false
        }
      },
      readiness: {
        state: "ready",
        ready: true,
        blockers: []
      },
      supervision: {
        mode: "read-only-status",
        tmuxBackendRequired: false,
        exitOnNotReady: true,
        recommendedReadOnlyCommands: expect.arrayContaining([
          {
            id: "plugin-mcp",
            command: "skfiy",
            args: ["mcp", "serve", "--stdio", "--json"]
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
      }
    });
    expect(JSON.stringify(output)).not.toContain("secret-token");
    expect(stderr).toEqual([]);
  });

  it("uses --require-ready to turn operator blockers into a non-zero exit", async () => {
    const stdout: string[] = [];

    await expect(runSkfiyCli({
      argv: ["operator", "status", "--json", "--require-ready"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader: async () => ({
        app: { state: "missing", path: "/repo/dist/skfiy.app" },
        cli: { state: "missing", path: "/repo/dist/skfiy" },
        helper: { state: "missing", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        permissions: {
          screenRecording: "unknown",
          accessibility: "unknown",
          finderAutomation: "unknown"
        },
        desktopSession: { state: "unknown" },
        extension: { state: "unknown" },
        nativeHost: { state: "unknown", extensionIds: [], cliShimPath: "/repo/dist/skfiy" },
        dashboard: { state: "not-running" },
        moneyRun: {
          state: "blocked",
          session: "money-run",
          source: "tmux-read-only-probe",
          mutatesSession: false
        }
      }),
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: () => undefined }
    })).resolves.toBe(1);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "operator status",
      result: "needs-action",
      ready: false,
      targets: {
        plugin: {
          state: "needs-action",
          ready: false,
          blockers: [
            {
              code: "plugin-cli-not-installed",
              expected: "installed"
            }
          ]
        }
      }
    });
  });

  it("treats mutating money-run probes as a readiness blocker", async () => {
    const stdout: string[] = [];

    await expect(runSkfiyCli({
      argv: ["status", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      statusReader: async () => ({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: {
          state: "installed",
          path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
        },
        permissions: {
          screenRecording: "granted",
          accessibility: "granted",
          finderAutomation: "unknown"
        },
        desktopSession: { state: "controllable", controllable: true },
        extension: { state: "unknown" },
        nativeHost: { state: "unknown", extensionIds: [], cliShimPath: "/repo/dist/skfiy" },
        dashboard: { state: "not-running" },
        moneyRun: {
          state: "observing",
          session: "money-run",
          source: "tmux-read-only-probe",
          mutatesSession: true,
          recommendation: {
            action: "continue_observing",
            reason: "unexpected mutating probe",
            mutatesSession: false
          }
        }
      }),
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: () => undefined }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join("")).readiness.checks.moneyRun).toMatchObject({
      state: "needs-action",
      ready: false,
      mutatesSession: true,
      blockers: [
        {
          code: "money-run-mutating-probe",
          mutatesSession: true
        }
      ]
    });
  });

  it("runs doctor diagnostics from status and signing probes", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const statusInputs: unknown[] = [];
    const signatureInputs: unknown[] = [];
    const hostPolicyPath = "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json";

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
          cli: { state: "installed", path: "/repo/dist/skfiy" },
          helper: {
            state: "missing",
            path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper"
          },
          permissions: {
            screenRecording: "denied",
            accessibility: "not-determined",
            finderAutomation: "unknown"
          },
          desktopSession: {
            state: "blocked",
            frontmostBundleId: "com.apple.loginwindow",
            mainDisplayAsleep: true
          },
          extension: {
            state: "native-host-missing",
            bridge: "native-messaging",
            liveConnection: "unknown",
            nativeHostState: "missing",
            hostPolicy: {
              schemaVersion: 1,
              state: "default",
              path: hostPolicyPath,
              policy: {
                defaultMode: "ask",
                allowedHosts: [],
                currentTurnAllowedHosts: [],
                blockedHosts: []
              }
            }
          },
          nativeHost: {
            state: "missing",
            cliShimPath: "/repo/dist/skfiy",
            extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
            reason: "Chrome Native Messaging host manifest is not installed."
          },
          dashboard: {
            state: "not-running",
            url: "http://127.0.0.1:8787/",
            reason: "fetch failed",
            api: {
              chromeHostPolicy: {
                state: "not-probed",
                url: "http://127.0.0.1:8787/api/chrome-host-policy",
                reason: "Dashboard descriptor is not reachable."
              }
            }
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
    expect(output.preflight).toMatchObject({
      runtime: {
        appPath: "/repo/dist/skfiy.app",
        appState: "installed",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        helperState: "missing",
        cliPath: "/repo/dist/skfiy",
        cliState: "installed",
        signature: {
          state: "invalid"
        }
      },
      dashboard: {
        state: "not-running",
        url: "http://127.0.0.1:8787/",
        api: {
          chromeHostPolicy: {
            state: "not-probed",
            url: "http://127.0.0.1:8787/api/chrome-host-policy"
          }
        }
      },
      chrome: {
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        extension: {
          state: "native-host-missing",
          bridge: "native-messaging",
          liveConnection: "unknown"
        },
        nativeHost: {
          state: "missing",
          cliShimPath: "/repo/dist/skfiy"
        },
        hostPolicy: {
          schemaVersion: 1,
          state: "default",
          path: hostPolicyPath
        },
        pageSafety: {
          schemaVersion: 1,
          capability: "chrome-extension-page-safety",
          capable: false,
          state: "needs-action",
          nextAction: "Run `skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop` before relying on Chrome page-safety evidence.",
          evidence: {
            nativeMessaging: false,
            nativeHostState: "missing",
            hostPolicy: {
              state: "default",
              defaultMode: "ask",
              failClosed: true,
              path: hostPolicyPath,
              entryCount: 0
            }
          }
        }
      }
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

  it("surfaces latest Finder smoke desktop preflight blockers in status and doctor JSON", async () => {
    const rootDir = createTempRoot();

    try {
      const smokeDir = path.join(rootDir, ".skfiy-smoke");
      const oldArtifactPath = path.join(smokeDir, "finder-old.json");
      const latestArtifactPath = path.join(smokeDir, "finder-current.json");
      const desktopReason =
        "Desktop session is not controllable before target app launch: frontmostBundleId=com.apple.loginwindow. Unlock the Mac and keep the display awake, then retry.";
      const statusStdout: string[] = [];
      const doctorStdout: string[] = [];
      const stderr: string[] = [];
      const createHealthyStatus = () => ({
        app: { state: "installed", path: path.join(rootDir, "dist", "skfiy.app") },
        cli: { state: "installed", path: path.join(rootDir, "dist", "skfiy") },
        helper: {
          state: "installed",
          path: path.join(rootDir, "dist", "skfiy.app", "Contents", "MacOS", "skfiy-helper")
        },
        permissions: {
          screenRecording: "granted",
          accessibility: "granted",
          finderAutomation: "unknown"
        },
        desktopSession: {
          state: "controllable",
          controllable: true
        },
        extension: { state: "unknown" },
        nativeHost: { state: "unknown" },
        dashboard: { state: "not-running" }
      });

      mkdirSync(smokeDir, { recursive: true });
      writeFileSync(oldArtifactPath, JSON.stringify({
        target: "finder",
        timestamp: "2026-06-19T00:00:00.000Z",
        productPath: "old finder smoke",
        result: "passed",
        desktopPreflight: {
          result: "passed",
          controllable: true
        },
        finderObservation: {
          result: "passed"
        }
      }), "utf8");
      writeFileSync(latestArtifactPath, JSON.stringify({
        target: "finder",
        timestamp: "2026-06-20T00:00:00.000Z",
        productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
        result: "blocked",
        desktopPreflight: {
          result: "blocked",
          reason: desktopReason,
          controllable: false,
          frontmost: {
            bundleId: "com.apple.loginwindow",
            localizedName: "loginwindow",
            processIdentifier: 591
          },
          display: {
            mainDisplayAsleep: true
          }
        },
        finderObservation: {
          result: "blocked",
          reason: desktopReason
        },
        finderSemanticObservation: {
          result: "not-run"
        },
        finderItemDragDrop: {
          result: "not-run"
        }
      }), "utf8");
      utimesSync(oldArtifactPath, new Date("2026-06-19T00:00:00.000Z"), new Date("2026-06-19T00:00:00.000Z"));
      utimesSync(latestArtifactPath, new Date("2026-06-20T00:00:00.000Z"), new Date("2026-06-20T00:00:00.000Z"));

      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir,
        homeDir: "/Users/tester",
        generatedAt: "2026-06-20T00:00:00.000Z",
        statusReader: async () => createHealthyStatus(),
        stdout: { write: (chunk: string) => statusStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      await expect(runSkfiyCli({
        argv: ["doctor", "--json"],
        rootDir,
        homeDir: "/Users/tester",
        generatedAt: "2026-06-20T00:00:00.000Z",
        statusReader: async () => createHealthyStatus(),
        signatureReader: async () => ({ state: "valid" }),
        stdout: { write: (chunk: string) => doctorStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const statusOutput = JSON.parse(statusStdout.join(""));
      const doctorOutput = JSON.parse(doctorStdout.join(""));

      expect(statusOutput.finder).toMatchObject({
        automation: {
          state: "unknown",
          permissionState: "unknown",
          evidence: "unproven"
        },
        latestSmoke: {
          state: "blocked-by-desktop-preflight",
          result: "blocked",
          automationEvidence: "unproven",
          path: latestArtifactPath,
          desktopPreflight: {
            result: "blocked",
            reason: desktopReason,
            controllable: false,
            frontmostBundleId: "com.apple.loginwindow",
            frontmostLocalizedName: "loginwindow",
            frontmostProcessIdentifier: 591,
            mainDisplayAsleep: true
          },
          finderObservation: {
            result: "blocked",
            reason: desktopReason
          },
          finderSemanticObservation: {
            result: "not-run"
          },
          finderItemDragDrop: {
            result: "not-run"
          }
        }
      });
      expect(statusOutput.finder.latestSmoke.path).not.toBe(oldArtifactPath);
      expect(doctorOutput.preflight.finder).toMatchObject(statusOutput.finder);

      const diagnostics = doctorOutput.diagnostics as Array<Record<string, unknown>>;
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("finder-automation-unproven");
      expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("finder-automation-unknown");
      expect(diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "finder-automation-unproven",
          severity: "info",
          message: expect.stringContaining("frontmostBundleId=com.apple.loginwindow"),
          nextAction: expect.stringContaining("Wake and unlock the Mac")
        })
      ]));
      expect(stderr).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("warns when latest Finder smoke indicates macOS Automation permission is blocking Finder", async () => {
    const rootDir = createTempRoot();

    try {
      const smokeDir = path.join(rootDir, ".skfiy-smoke");
      const artifactPath = path.join(smokeDir, "finder-permission.json");
      const stdout: string[] = [];
      const stderr: string[] = [];
      const permissionReason = "Not authorized to send Apple events to Finder.";

      mkdirSync(smokeDir, { recursive: true });
      writeFileSync(artifactPath, JSON.stringify({
        target: "finder",
        timestamp: "2026-06-20T00:00:00.000Z",
        productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
        result: "blocked",
        desktopPreflight: {
          result: "passed",
          controllable: true,
          frontmost: {
            bundleId: "com.apple.finder",
            localizedName: "Finder"
          },
          display: {
            mainDisplayAsleep: false
          }
        },
        finderObservation: {
          result: "blocked",
          reason: permissionReason
        }
      }), "utf8");

      await expect(runSkfiyCli({
        argv: ["doctor", "--json"],
        rootDir,
        homeDir: "/Users/tester",
        generatedAt: "2026-06-20T00:00:00.000Z",
        statusReader: async () => ({
          app: { state: "installed", path: path.join(rootDir, "dist", "skfiy.app") },
          cli: { state: "installed", path: path.join(rootDir, "dist", "skfiy") },
          helper: {
            state: "installed",
            path: path.join(rootDir, "dist", "skfiy.app", "Contents", "MacOS", "skfiy-helper")
          },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            finderAutomation: "unknown"
          },
          desktopSession: {
            state: "controllable",
            controllable: true
          },
          extension: { state: "unknown" },
          nativeHost: { state: "unknown" },
          dashboard: { state: "not-running" }
        }),
        signatureReader: async () => ({ state: "valid" }),
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const output = JSON.parse(stdout.join(""));
      const diagnostics = output.diagnostics as Array<Record<string, unknown>>;

      expect(output.preflight.finder).toMatchObject({
        automation: {
          state: "blocked-by-permission",
          permissionState: "unknown",
          evidence: "blocked"
        },
        latestSmoke: {
          state: "blocked-by-permission",
          result: "blocked",
          automationEvidence: "blocked",
          path: artifactPath,
          finderObservation: {
            result: "blocked",
            reason: permissionReason
          }
        }
      });
      expect(diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "finder-automation-permission",
          severity: "warning",
          message: expect.stringContaining(permissionReason),
          nextAction: expect.stringContaining("Privacy & Security > Automation")
        })
      ]));
      expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("finder-automation-unproven");
      expect(stderr).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("probes dashboard Chrome host policy API through concrete status collection", async () => {
    const server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");

      if (request.url === "/descriptor.json") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          name: "skfiy-dashboard",
          bind: { host: "127.0.0.1", port: 0 }
        }));
        return;
      }

      if (request.url === "/api/chrome-host-policy") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          source: "dashboard",
          hostPolicy: {
            state: "default"
          }
        }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const dashboardUrl = `http://127.0.0.1:${address.port}/`;
      const stdout: string[] = [];
      const stderr: string[] = [];

      await expect(runSkfiyCli({
        argv: ["status", "--json", "--dashboard-url", dashboardUrl],
        rootDir: "/repo",
        homeDir: "",
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      expect(JSON.parse(stdout.join(""))).toMatchObject({
        schemaVersion: 1,
        command: "status",
        dashboard: {
          state: "running",
          url: dashboardUrl,
          api: {
            chromeHostPolicy: {
              state: "reachable",
              url: `${dashboardUrl}api/chrome-host-policy`,
              status: 200
            }
          }
        }
      });
      expect(stderr).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("auto-discovers a running dashboard from the local server state file", async () => {
    const homeDir = createTempRoot();
    const server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");

      if (request.url === "/descriptor.json") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          name: "skfiy-dashboard",
          bind: { host: "127.0.0.1", port: 0 }
        }));
        return;
      }

      if (request.url === "/api/chrome-host-policy") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          source: "dashboard",
          hostPolicy: {
            state: "default"
          }
        }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const dashboardUrl = `http://127.0.0.1:${address.port}/`;
      const startedAt = "2026-06-20T00:00:00.000Z";
      const statePath = createDashboardServerStatePath(homeDir);
      const stdout: string[] = [];
      const stderr: string[] = [];

      mkdirSync(path.dirname(statePath), { recursive: true });
      writeFileSync(statePath, `${JSON.stringify(createDashboardServerState({
        pid: process.pid,
        url: dashboardUrl,
        bind: {
          host: "127.0.0.1",
          port: address.port
        },
        startedAt,
        rootDir: "/repo"
      }), null, 2)}\n`);

      await expect(runSkfiyCli({
        argv: ["status", "--json"],
        rootDir: "/repo",
        homeDir,
        generatedAt: startedAt,
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      expect(JSON.parse(stdout.join(""))).toMatchObject({
        schemaVersion: 1,
        command: "status",
        dashboard: {
          state: "running",
          source: "dashboard-server-state",
          statePath,
          url: dashboardUrl,
          pid: process.pid,
          startedAt,
          api: {
            chromeHostPolicy: {
              state: "reachable",
              url: `${dashboardUrl}api/chrome-host-policy`,
              status: 200
            }
          }
        },
        readiness: {
          checks: {
            dashboard: {
              ready: true,
              state: "ready",
              dashboardState: "running",
              url: dashboardUrl
            }
          }
        }
      });
      expect(stderr).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("keeps invalid dashboard URLs as status data instead of CLI failures", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyCli({
      argv: ["status", "--json", "--dashboard-url", "not a url"],
      rootDir: "/repo",
      homeDir: "",
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "status",
      dashboard: {
        state: "not-running",
        url: "not a url",
        reason: "Invalid dashboard URL: not a url",
        api: {
          chromeHostPolicy: {
            state: "not-probed",
            reason: "Invalid dashboard URL."
          }
        }
      }
    });
    expect(stderr).toEqual([]);
  });

  it("prints Chrome unpacked extension setup info without requiring an extension id", async () => {
    const rootDir = createTempRoot();
    const extensionDir = path.join(rootDir, "chrome-extension");
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      mkdirSync(extensionDir, { recursive: true });
      writeFileSync(path.join(extensionDir, "manifest.json"), `${JSON.stringify({
        manifest_version: 3,
        name: "skfiy Chrome Adapter",
        version: "0.0.1",
        description: "Static Manifest V3 skeleton for the skfiy browser adapter.",
        minimum_chrome_version: "116",
        action: {
          default_popup: "popup.html"
        },
        background: {
          service_worker: "background.js",
          type: "module"
        },
        permissions: ["activeTab", "nativeMessaging"],
        host_permissions: [],
        optional_host_permissions: ["http://*/*", "https://*/*"]
      })}\n`);

      await expect(runSkfiyCli({
        argv: ["chrome", "extension-info", "--json"],
        rootDir,
        homeDir: "/Users/tester",
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const output = JSON.parse(stdout.join(""));
      expect(output).toMatchObject({
        schemaVersion: 1,
        command: "chrome extension-info",
        generatedAt: "2026-06-20T00:00:00.000Z",
        plannedMutation: false,
        executesSystemMutation: false,
        result: "available",
        extension: {
          state: "available",
          path: extensionDir,
          manifestPath: path.join(extensionDir, "manifest.json"),
          idState: "unknown-until-loaded",
          manifest: {
            manifestVersion: 3,
            name: "skfiy Chrome Adapter",
            version: "0.0.1",
            permissions: ["activeTab", "nativeMessaging"],
            optionalHostPermissions: ["http://*/*", "https://*/*"],
            backgroundServiceWorker: "background.js",
            actionDefaultPopup: "popup.html"
          }
        },
        browserSetup: {
          state: "manual-required",
          chromeUrl: "chrome://extensions/",
          loadUnpackedPath: extensionDir
        },
        installHostCommand: [
          "skfiy",
          "chrome",
          "install-host",
          "--cli",
          path.join(rootDir, "dist", "skfiy"),
          "--extension-id",
          "<extension-id>"
        ],
        verifyStatusCommand: [
          "skfiy",
          "chrome",
          "status",
          "--cli",
          path.join(rootDir, "dist", "skfiy"),
          "--extension-id",
          "<extension-id>"
        ],
        copyableCommands: expect.arrayContaining([
          expect.objectContaining({
            copyText: `skfiy chrome install-host --cli ${path.join(rootDir, "dist", "skfiy")} --extension-id "<extension-id>"`
          }),
          expect.objectContaining({
            copyText: `skfiy chrome status --cli ${path.join(rootDir, "dist", "skfiy")} --extension-id "<extension-id>"`
          })
        ])
      });
      expect(JSON.stringify(output)).not.toContain("token=");
      expect(stderr).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
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
        manifestPath,
        nextAction: expect.stringContaining("skfiy chrome install-host"),
        setupGuide: {
          state: "needs_setup",
          copyableCommands: expect.arrayContaining([
            expect.objectContaining({
              copyText: "skfiy chrome install-host --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
            })
          ])
        }
      },
      extension: {
        state: "native-host-missing",
        nextAction: expect.stringContaining("skfiy chrome install-host"),
        setupGuide: {
          state: "needs_setup",
          copyableCommands: expect.arrayContaining([
            expect.objectContaining({
              copyText: "skfiy chrome install-host --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
            })
          ])
        }
      },
      setupGuide: {
        state: "needs_setup",
        extensionPath: "/repo/chrome-extension",
        installHostCommand: [
          "skfiy",
          "chrome",
          "install-host",
          "--cli",
          "/repo/dist/skfiy",
          "--extension-id",
          "abcdefghijklmnopabcdefghijklmnop"
        ],
        nextActions: expect.arrayContaining([
          expect.objectContaining({
            id: "install-native-host",
            state: "needed"
          }),
          expect.objectContaining({
            id: "load-extension",
            state: "waiting"
          })
        ])
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

  it("runs chrome extension reload through the injected desktop reloader", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const chromeExtensionReloader = vi.fn(async (input: ChromeExtensionReloadInput) => {
      expect(input).toMatchObject({
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        homeDir: "/Users/tester",
        generatedAt: "2026-06-20T00:00:00.000Z"
      });

      return {
        schemaVersion: 1 as const,
        result: "verified" as const,
        productPath: "cli -> helper activate_app -> helper observe_app -> helper ocr_image -> helper click -> extension wake page -> native-host heartbeat" as const,
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        managerUrl: "chrome://extensions/",
        wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1",
        screenshotPath: "/tmp/skfiy-chrome-extension-reload.png",
        ocrLabelCount: 8,
        observedWindowTitle: "扩展程序",
        target: {
          strategy: "extension-card-layout" as const,
          label: "skfiy Chrome Adapter",
          x: 1012,
          y: 794,
          confidence: 0.82
        },
        click: { ok: true },
        extensionConnection: {
          state: "connected" as const,
          liveConnection: "connected" as const,
          path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
          ageSeconds: 0,
          observedAt: "2026-06-20T00:00:00.000Z",
          messageType: "skfiy.host_policy.request",
          requestId: "host-policy-sync-service_worker_loaded-1"
        },
        candidates: []
      };
    });

    await expect(runSkfiyCli({
      argv: ["chrome", "reload-extension", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      chromeExtensionReloader,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "chrome reload-extension",
      result: "verified",
      executesSystemMutation: true,
      target: {
        strategy: "extension-card-layout",
        x: 1012,
        y: 794
      },
      extensionConnection: {
        state: "connected",
        liveConnection: "connected"
      }
    });
    expect(chromeExtensionReloader).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it("passes a target Chrome tab id into the extension reload wake URL", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const chromeExtensionReloader = vi.fn(async (input: ChromeExtensionReloadInput) => {
      expect(input).toMatchObject({
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        homeDir: "/Users/tester",
        targetTabId: 42
      });

      return {
        schemaVersion: 1 as const,
        result: "verified" as const,
        productPath: "cli -> helper activate_app -> helper observe_app -> helper ocr_image -> helper click -> extension wake page -> native-host heartbeat" as const,
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        managerUrl: "chrome://extensions/",
        wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42",
        screenshotPath: "/tmp/skfiy-chrome-extension-reload.png",
        ocrLabelCount: 8,
        observedWindowTitle: "扩展程序",
        target: {
          strategy: "extension-card-layout" as const,
          label: "skfiy Chrome Adapter",
          x: 1012,
          y: 794,
          confidence: 0.82
        },
        click: { ok: true },
        extensionConnection: {
          state: "connected" as const,
          liveConnection: "connected" as const,
          path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
          ageSeconds: 0,
          observedAt: "2026-06-20T00:00:00.000Z",
          messageType: "skfiy.page.observe",
          requestId: "page-control-health-popup_heartbeat-1"
        },
        candidates: []
      };
    });

    await expect(runSkfiyCli({
      argv: [
        "chrome",
        "reload-extension",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--target-tab-id",
        "42"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      chromeExtensionReloader,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "chrome reload-extension",
      wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42"
    });
    expect(chromeExtensionReloader).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it("reports an extension card reload requirement when reload is blocked by stale service worker registration", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const files: Record<string, string> = {
      "/repo/chrome-extension/manifest.json": JSON.stringify({
        manifest_version: 3,
        name: "skfiy Chrome Adapter",
        version: "0.0.6"
      }),
      "/Users/tester/Library/Application Support/Google/Chrome/Default/Secure Preferences": JSON.stringify({
        extensions: {
          settings: {
            abcdefghijklmnopabcdefghijklmnop: {
              path: "/repo/chrome-extension",
              service_worker_registration_info: {
                version: "0.0.5"
              }
            }
          }
        }
      })
    };
    const chromeExtensionReloader = vi.fn(async () => ({
      schemaVersion: 1 as const,
      result: "blocked" as const,
      productPath: "cli -> helper activate_app -> helper observe_app -> helper ocr_image -> helper click -> extension wake page -> native-host heartbeat" as const,
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      managerUrl: "chrome://extensions/",
      wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42",
      contextReloadUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyWakeAction=dev-reload&skfiyTargetTabId=42",
      screenshotPath: "/tmp/skfiy-chrome-extension-reload.png",
      ocrLabelCount: 0,
      observedWindowTitle: "扩展程序",
      extensionConnection: {
        state: "connected" as const,
        liveConnection: "connected" as const,
        path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
        ageSeconds: 0,
        observedAt: "2026-06-21T12:00:00.000Z",
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-popup-wake",
        pageControl: {
          state: "blocked_by_host_policy",
          activeTab: {
            tabId: 42
          }
        }
      },
      reason: "desktop-session-locked",
      candidates: [],
      nextAction: "Unlock the desktop, keep the display awake, then retry `skfiy chrome reload-extension`."
    }));

    await expect(runSkfiyCli({
      argv: [
        "chrome",
        "reload-extension",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--target-tab-id",
        "42"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-21T12:00:00.000Z",
      chromeNativeHostIo: createMemoryChromeIo(files),
      chromeExtensionReloader,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(1);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "chrome reload-extension",
      result: "blocked",
      reason: "extension-card-reload-required",
      extensionRegistration: {
        state: "stale",
        localManifestVersion: "0.0.6",
        registeredVersion: "0.0.5",
        extensionPath: "/repo/chrome-extension"
      },
      desktopFallback: {
        reason: "desktop-session-locked"
      },
      nextAction: "Open chrome://extensions on an unlocked desktop, click the skfiy extension reload button, then retry `skfiy chrome reload-extension`."
    });
    expect(chromeExtensionReloader).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it("runs chrome observe through the extension page-control invoker", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const chromeExtensionPageControlInvoker = vi.fn(async (input) => {
      expect(input).toMatchObject({
        action: "observe",
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        homeDir: "/Users/tester",
        targetTabId: 42
      });

      return {
        schemaVersion: 1 as const,
        result: "verified" as const,
        action: "observe" as const,
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=observe",
        extensionConnection: {
          state: "connected" as const,
          liveConnection: "connected" as const,
          path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
          ageSeconds: 0,
          observedAt: "2026-06-20T00:00:00.000Z",
          messageType: "skfiy.page.observe",
          requestId: "popup-observe-native-1",
          pageObservation: {
            title: "skfiy page control live test",
            url: "http://127.0.0.1:63852/",
            visibleText: "skfiy chrome smoke ready"
          }
        }
      };
    });

    await expect(runSkfiyCli({
      argv: [
        "chrome",
        "observe",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop",
        "--target-tab-id",
        "42"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      chromeExtensionPageControlInvoker,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "chrome observe",
      result: "verified",
      executesSystemMutation: true,
      action: "observe",
      extensionConnection: {
        messageType: "skfiy.page.observe",
        pageObservation: {
          title: "skfiy page control live test",
          visibleText: "skfiy chrome smoke ready"
        }
      }
    });
    expect(chromeExtensionPageControlInvoker).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it("runs chrome tabs through the extension tab-discovery invoker", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const chromeExtensionTabDiscoveryInvoker = vi.fn(async (input: ChromeExtensionTabDiscoveryInput) => {
      expect(input).toMatchObject({
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        homeDir: "/Users/tester"
      });

      return {
        schemaVersion: 1 as const,
        result: "verified" as const,
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyWakeAction=tabs",
        tabs: [
          {
            id: 42,
            windowId: 7,
            title: "Allowed app",
            url: "https://allowed.example/dashboard",
            host: "allowed.example",
            state: "eligible" as const,
            eligible: true
          },
          {
            id: 43,
            windowId: 7,
            title: "Extensions",
            url: "chrome://extensions/",
            host: "",
            state: "blocked" as const,
            eligible: false,
            blocker: "internal_chrome_page" as const,
            nextAction: "Open a normal HTTP(S) page before asking skfiy to control Chrome."
          }
        ],
        extensionConnection: {
          state: "connected" as const,
          liveConnection: "connected" as const,
          path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
          ageSeconds: 0,
          observedAt: "2026-06-21T12:00:00.000Z",
          messageType: "skfiy.tabs.discover",
          requestId: "tabs-discover-native-1",
          pageTabs: {
            tabs: [
              { id: 42, state: "eligible" },
              { id: 43, state: "blocked", blocker: "internal_chrome_page" }
            ]
          }
        }
      };
    });

    await expect(runSkfiyCli({
      argv: [
        "chrome",
        "tabs",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-21T12:00:00.000Z",
      chromeExtensionTabDiscoveryInvoker,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "chrome tabs",
      result: "verified",
      executesSystemMutation: true,
      tabs: [
        {
          id: 42,
          windowId: 7,
          title: "Allowed app",
          url: "https://allowed.example/dashboard",
          host: "allowed.example",
          state: "eligible",
          eligible: true
        },
        {
          id: 43,
          state: "blocked",
          eligible: false,
          blocker: "internal_chrome_page"
        }
      ],
      extensionConnection: {
        messageType: "skfiy.tabs.discover"
      }
    });
    expect(JSON.parse(stdout.join(""))).not.toHaveProperty("cookies");
    expect(JSON.stringify(JSON.parse(stdout.join("")))).not.toContain("visibleText");
    expect(chromeExtensionTabDiscoveryInvoker).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it("reports stale Chrome extension registration when chrome tabs cannot verify fresh discovery", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const files: Record<string, string> = {
      "/repo/chrome-extension/manifest.json": JSON.stringify({
        manifest_version: 3,
        name: "skfiy Chrome Adapter",
        version: "0.0.2"
      }),
      "/Users/tester/Library/Application Support/Google/Chrome/Default/Secure Preferences": JSON.stringify({
        extensions: {
          settings: {
            abcdefghijklmnopabcdefghijklmnop: {
              path: "/repo/chrome-extension",
              service_worker_registration_info: {
                version: "0.0.1"
              }
            }
          }
        }
      })
    };
    const chromeExtensionTabDiscoveryInvoker = vi.fn(async () => ({
      schemaVersion: 1 as const,
      result: "blocked" as const,
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      wakeUrl: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyWakeAction=tabs",
      tabs: [],
      extensionConnection: {
        state: "connected" as const,
        liveConnection: "connected" as const,
        path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
        ageSeconds: 0,
        observedAt: "2026-06-21T12:00:00.000Z",
        messageType: "skfiy.page.observe",
        requestId: "page-control-health-popup_wake-1"
      },
      reason: "chrome-tabs-not-verified",
      nextAction: "Reload the skfiy Chrome extension, ensure Native Messaging is connected, then retry `skfiy chrome tabs`."
    }));

    await expect(runSkfiyCli({
      argv: [
        "chrome",
        "tabs",
        "--extension-id",
        "abcdefghijklmnopabcdefghijklmnop"
      ],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-21T12:00:00.000Z",
      chromeNativeHostIo: createMemoryChromeIo(files),
      chromeExtensionTabDiscoveryInvoker,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(1);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "chrome tabs",
      result: "blocked",
      reason: "extension-registration-stale",
      extensionRegistration: {
        state: "stale",
        localManifestVersion: "0.0.2",
        registeredVersion: "0.0.1",
        extensionPath: "/repo/chrome-extension"
      },
      nextAction: "Reload the skfiy extension card in Chrome Extension Manager so Chrome re-registers the MV3 service worker, then retry `skfiy chrome tabs`."
    });
    expect(chromeExtensionTabDiscoveryInvoker).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it.each([
    {
      subcommand: "screenshot",
      argv: ["chrome", "screenshot", "--extension-id", "abcdefghijklmnopabcdefghijklmnop", "--target-tab-id", "42"],
      expectedInput: { action: "screenshot", targetTabId: 42 },
      expectedOutputShape: { action: "screenshot" }
    },
    {
      subcommand: "click",
      argv: ["chrome", "click", "--extension-id", "abcdefghijklmnopabcdefghijklmnop", "--target-tab-id", "42", "--selector", "#submit"],
      expectedInput: { action: "click", targetTabId: 42, selector: "#submit" },
      expectedOutputShape: { action: "click" }
    },
    {
      subcommand: "fill",
      argv: ["chrome", "fill", "--extension-id", "abcdefghijklmnopabcdefghijklmnop", "--target-tab-id", "42", "--selector", "#name", "--text", "skfiy"],
      expectedInput: { action: "fill", targetTabId: 42, selector: "#name", text: "skfiy" },
      expectedOutputShape: { action: "fill" }
    },
    {
      subcommand: "submit",
      argv: ["chrome", "submit", "--extension-id", "abcdefghijklmnopabcdefghijklmnop", "--target-tab-id", "42", "--selector", "form"],
      expectedInput: { action: "submit", targetTabId: 42, selector: "form" },
      expectedOutputShape: { action: "submit" }
    },
    {
      subcommand: "scroll",
      argv: ["chrome", "scroll", "--extension-id", "abcdefghijklmnopabcdefghijklmnop", "--target-tab-id", "42", "--dy", "600"],
      expectedInput: { action: "scroll", targetTabId: 42, dy: 600 },
      expectedOutputShape: { action: "scroll" }
    }
  ] satisfies Array<{
    subcommand: string;
    argv: string[];
    expectedInput: Partial<ChromeExtensionPageControlInput> & { action: ChromeExtensionPageControlInput["action"] };
    expectedOutputShape: { action: ChromeExtensionPageControlInput["action"] };
  }>)("runs chrome $subcommand through the extension page-control invoker", async ({
    argv,
    expectedInput,
    expectedOutputShape
  }) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const chromeExtensionPageControlInvoker = vi.fn(async (input) => {
      expect(input).toMatchObject({
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        homeDir: "/Users/tester",
        ...expectedInput
      });

      return {
        schemaVersion: 1 as const,
        result: "verified" as const,
        action: expectedInput.action,
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        wakeUrl: `chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=1&skfiyWakeAction=${expectedInput.action}`,
        extensionConnection: {
          state: "connected" as const,
          liveConnection: "connected" as const,
          path: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
          ageSeconds: 0,
          observedAt: "2026-06-20T00:00:00.000Z",
          messageType: "skfiy.page.observe",
          requestId: `page-control-${expectedInput.action}-1`
        }
      };
    });

    await expect(runSkfiyCli({
      argv,
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      chromeExtensionPageControlInvoker,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: `chrome ${expectedInput.action}`,
      result: "verified",
      executesSystemMutation: true,
      ...expectedOutputShape
    });
    expect(chromeExtensionPageControlInvoker).toHaveBeenCalledTimes(1);
    expect(stderr).toEqual([]);
  });

  it("runs chrome host policy show, set, and reset through injected filesystem", async () => {
    const files: Record<string, string> = {};
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
    const policyPath = "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json";
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
      argv: ["chrome", "policy", "show", "--json"]
    })).resolves.toBe(0);
    expect(JSON.parse(stdout.pop() ?? "{}")).toEqual({
      schemaVersion: 1,
      command: "chrome policy show",
      generatedAt: "2026-06-20T00:00:00.000Z",
      executesSystemMutation: false,
      hostPolicy: {
        schemaVersion: 1,
        state: "default",
        path: policyPath,
        policy: {
          defaultMode: "ask",
          allowedHosts: [],
          currentTurnAllowedHosts: [],
          blockedHosts: []
        },
        reason: "Chrome host policy has not been configured yet."
      }
    });

    await expect(runSkfiyCli({
      ...base,
      argv: [
        "chrome",
        "policy",
        "set",
        "--host",
        "https://Example.com/docs",
        "--action",
        "always-allow",
        "--json"
      ]
    })).resolves.toBe(0);
    expect(JSON.parse(stdout.pop() ?? "{}")).toMatchObject({
      schemaVersion: 1,
      command: "chrome policy set",
      generatedAt: "2026-06-20T00:00:00.000Z",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "configured",
      action: "always_allow",
      host: "example.com",
      hostPolicy: {
        schemaVersion: 1,
        state: "configured",
        path: policyPath,
        policy: {
          defaultMode: "ask",
          allowedHosts: ["example.com"],
          currentTurnAllowedHosts: [],
          blockedHosts: []
        }
      }
    });
    expect(JSON.parse(files[policyPath])).toEqual({
      schemaVersion: 1,
      policy: {
        defaultMode: "ask",
        allowedHosts: ["example.com"],
        currentTurnAllowedHosts: [],
        blockedHosts: []
      }
    });

    await expect(runSkfiyCli({
      ...base,
      argv: ["chrome", "policy", "reset", "--json"]
    })).resolves.toBe(0);
    expect(JSON.parse(stdout.pop() ?? "{}")).toMatchObject({
      schemaVersion: 1,
      command: "chrome policy reset",
      generatedAt: "2026-06-20T00:00:00.000Z",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "reset",
      hostPolicy: {
        schemaVersion: 1,
        state: "default",
        path: policyPath,
        policy: {
          defaultMode: "ask",
          allowedHosts: [],
          currentTurnAllowedHosts: [],
          blockedHosts: []
        },
        reason: "Chrome host policy has been reset to the default ask mode."
      }
    });
    expect(files[policyPath]).toBeUndefined();
    expect(stderr).toEqual([]);
  });

  it("runs permission settings open through an injected opener without requiring tmux", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const openedUrls: string[] = [];

    await expect(runSkfiyCli({
      argv: ["permissions", "open", "screen-recording", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      permissionSettingsOpener: async (url: string) => {
        openedUrls.push(url);
      },
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(0);

    const url = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
    const output = JSON.parse(stdout.join(""));

    expect(openedUrls).toEqual([url]);
    expect(output).toEqual({
      schemaVersion: 1,
      command: "permissions open",
      generatedAt: "2026-06-20T00:00:00.000Z",
      target: "screen-recording",
      executesSystemMutation: true,
      result: "opened",
      systemSettings: {
        app: "System Settings",
        pane: "Privacy & Security",
        label: "Screen Recording",
        anchor: "Privacy_ScreenCapture",
        url
      },
      actionPlan: [
        {
          step: "open-system-settings",
          executor: "skfiy-cli",
          command: "open",
          args: [url]
        },
        {
          step: "grant-permission",
          executor: "user",
          target: "screen-recording",
          guidance: "Grant skfiy Screen Recording access."
        }
      ]
    });
    expect(JSON.stringify(output)).not.toContain("token=");
    expect(JSON.stringify(output)).not.toContain("tmux");
    expect(stderr).toEqual([]);
  });

  it("returns the permission settings action plan when opening System Settings fails", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyCli({
      argv: ["permissions", "open", "automation-finder", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
      permissionSettingsOpener: async () => {
        throw new Error("open exited with code 1.");
      },
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) }
    })).resolves.toBe(1);

    const output = JSON.parse(stdout.join(""));

    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "permissions open",
      target: "automation-finder",
      executesSystemMutation: true,
      result: "error",
      error: "open exited with code 1.",
      systemSettings: {
        label: "Automation",
        anchor: "Privacy_Automation",
        url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
      }
    });
    expect(output.actionPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: "grant-permission",
        executor: "user",
        target: "automation-finder",
        guidance: "Grant skfiy permission to control Finder in Automation."
      })
    ]));
    expect(stderr).toEqual(["open exited with code 1.\n"]);
  });

  it("reports Chrome extension adapter state from native host status", async () => {
    const manifestPath = "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json";
    const hostPolicyPath = "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json";
    const files: Record<string, string> = {
      "/repo/dist/skfiy": "#!/usr/bin/env node\n",
      [manifestPath]: JSON.stringify({
        name: "com.sskift.skfiy",
        description: "skfiy desktop Computer Use bridge",
        path: "/repo/dist/skfiy",
        type: "stdio",
        allowed_origins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ]
      }),
      [hostPolicyPath]: JSON.stringify({
        schemaVersion: 1,
        policy: {
          defaultMode: "ask",
          allowedHosts: ["Example.com"],
          currentTurnAllowedHosts: ["turn.example"],
          blockedHosts: ["blocked.example"]
        }
      })
    };
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyCli({
      argv: ["chrome", "status", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      chromeNativeHostIo: {
        exists: async (targetPath: string) => Object.hasOwn(files, targetPath),
        mkdir: async () => {},
        readFile: async (targetPath: string) => files[targetPath],
        writeFile: async (targetPath: string, content: string) => {
          files[targetPath] = content;
        },
        rm: async (targetPath: string) => {
          delete files[targetPath];
        }
      }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "chrome status",
      executesSystemMutation: false,
      nativeHost: {
        state: "installed",
        manifestPath,
        allowedOrigins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ]
      },
      extension: {
        state: "native-host-installed",
        bridge: "native-messaging",
        liveConnection: "unknown",
        nativeHostState: "installed",
        manifestPath,
        allowedOrigins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ],
        hostPolicy: {
          schemaVersion: 1,
          state: "configured",
          path: hostPolicyPath,
          policy: {
            defaultMode: "ask",
            allowedHosts: ["example.com"],
            currentTurnAllowedHosts: ["turn.example"],
            blockedHosts: ["blocked.example"]
          }
        },
        capabilities: {
          pageSafety: false
        },
        pageSafety: {
          schemaVersion: 1,
          capability: "chrome-extension-page-safety",
          capable: false,
          state: "needs-action",
          nextAction: expect.stringContaining("observe one page"),
          evidence: {
            nativeMessaging: true,
            nativeHostState: "installed",
            hostPolicy: {
              state: "configured",
              defaultMode: "ask",
              failClosed: true,
              path: hostPolicyPath,
              entryCount: 3
            },
            liveConnection: {
              state: "unknown",
              liveConnection: "unknown",
              messageType: "unknown",
              pageObservationHeartbeat: false
            }
          }
        },
        reason: "Chrome Native Messaging host is installed; no live Chrome extension connection has been observed yet."
      },
      setupGuide: {
        state: "ready",
        nativeHostManifestPath: manifestPath,
        connectionHeartbeatPath: "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json",
        hostPolicyPath,
        extensionPath: "/repo/chrome-extension",
        nextActions: expect.arrayContaining([
          expect.objectContaining({
            id: "install-native-host",
            state: "done"
          }),
          expect.objectContaining({
            id: "load-extension",
            state: "waiting"
          })
        ])
      }
    });
    expect(stderr).toEqual([]);
  });

  it("reports a connected Chrome extension adapter from a fresh native-message heartbeat", async () => {
    const manifestPath = "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json";
    const heartbeatPath = "/Users/tester/Library/Application Support/skfiy/chrome-extension-connection.json";
    const files: Record<string, string> = {
      "/repo/dist/skfiy": "#!/usr/bin/env node\n",
      [manifestPath]: JSON.stringify({
        name: "com.sskift.skfiy",
        description: "skfiy desktop Computer Use bridge",
        path: "/repo/dist/skfiy",
        type: "stdio",
        allowed_origins: [
          "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
        ]
      }),
      [heartbeatPath]: JSON.stringify({
        schemaVersion: 1,
        hostName: "com.sskift.skfiy",
        observedAt: "2026-06-19T23:59:00.000Z",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: "skfiy.page.observe",
        requestId: "request-heartbeat",
        pageControl: {
          state: "ready",
          reason: "Current page is ready for Computer Use controls.",
          capabilities: {
            diagnostics: true,
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            submit: true,
            scroll: true,
            screenshot: true
          },
          source: "extension.diagnostics.currentTab.pageControl",
          counts: {
            interactiveElements: 3,
            forms: 1
          }
        }
      })
    };
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyCli({
      argv: ["chrome", "status", "--extension-id", "abcdefghijklmnopabcdefghijklmnop"],
      rootDir: "/repo",
      homeDir: "/Users/tester",
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      chromeNativeHostIo: {
        exists: async (targetPath: string) => Object.hasOwn(files, targetPath),
        mkdir: async () => {},
        readFile: async (targetPath: string) => files[targetPath],
        writeFile: async (targetPath: string, content: string) => {
          files[targetPath] = content;
        },
        rm: async (targetPath: string) => {
          delete files[targetPath];
        }
      }
    })).resolves.toBe(0);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      command: "chrome status",
      nativeHost: {
        state: "installed",
        nextAction: expect.stringContaining("Chrome extension has recently connected"),
        setupGuide: {
          state: "ready",
          copyableCommands: expect.arrayContaining([
            expect.objectContaining({
              copyText: "skfiy chrome status --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
            })
          ])
        }
      },
      extension: {
        state: "connected",
        bridge: "native-messaging",
        liveConnection: "connected",
        nativeHostState: "installed",
        connection: {
          state: "connected",
          liveConnection: "connected",
          ageSeconds: 60,
          observedAt: "2026-06-19T23:59:00.000Z",
          launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          messageType: "skfiy.page.observe",
          requestId: "request-heartbeat"
        },
        capabilities: {
          pageSafety: true,
          pageControl: true
        },
        pageControl: {
          schemaVersion: 1,
          capability: "chrome-extension-page-control",
          state: "ready",
          source: "extension.diagnostics.currentTab.pageControl",
          capabilities: {
            domActions: true,
            click: true,
            fill: true,
            screenshot: true
          },
          counts: {
            interactiveElements: 3,
            forms: 1
          }
        },
        pageSafety: {
          schemaVersion: 1,
          capability: "chrome-extension-page-safety",
          capable: true,
          state: "ready",
          evidence: {
            nativeMessaging: true,
            nativeHostState: "installed",
            hostPolicy: {
              state: "default",
              defaultMode: "ask",
              failClosed: true,
              entryCount: 0
            },
            liveConnection: {
              state: "connected",
              liveConnection: "connected",
              messageType: "skfiy.page.observe",
              pageObservationHeartbeat: true,
              path: heartbeatPath,
              requestId: "request-heartbeat"
            }
          }
        },
        nextAction: expect.stringContaining("Chrome extension has recently connected"),
        setupGuide: {
          state: "ready",
          copyableCommands: expect.arrayContaining([
            expect.objectContaining({
              copyText: "skfiy chrome status --cli /repo/dist/skfiy --extension-id abcdefghijklmnopabcdefghijklmnop"
            })
          ])
        }
      },
      setupGuide: {
        state: "ready",
        nextActions: expect.arrayContaining([
          expect.objectContaining({
            id: "verify-live-connection",
            state: "done"
          })
        ])
      }
    });
    expect(stderr).toEqual([]);
  });

  it("runs dashboard status and snapshot probes against loopback JSON without leaking tokens", async () => {
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
      requests.push(request.url ?? "");
      response.setHeader("content-type", "application/json");

      if (request.url === "/descriptor.json") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          bind: { host: "127.0.0.1", port: 0 },
          url: "http://127.0.0.1:0/",
          auth: {
            mode: "optional-token",
            tokenPrinted: false
          },
          token: "descriptor-secret"
        }));
        return;
      }

      if (request.url === "/snapshot.json") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          runtimeHealth: {
            dashboard: { state: "running", url: "http://127.0.0.1:0/" },
            cli: { state: "installed" },
            extension: {
              state: "connected",
              authorization: "Bearer snapshot-secret"
            },
            nativeHost: { state: "installed" }
          },
          operatorReadiness: {
            state: "ready",
            extensionReadiness: {
              state: "ready",
              token: "operator-secret"
            }
          },
          smokeEvidence: {
            artifacts: [
              {
                target: "dashboard",
                result: "passed"
              }
            ]
          },
          alerts: []
        }));
        return;
      }

      if (request.url === "/api/operator-evidence") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor: {
            url: "http://127.0.0.1:0/",
            token: "evidence-descriptor-secret"
          },
          snapshot: {
            readiness: {
              state: "ready",
              bearer: "Bearer evidence-secret"
            }
          },
          status: {
            state: "ready",
            dashboardUrl: "http://127.0.0.1:0/"
          },
          outputPolicy: {
            tokenFree: true,
            source: "allowlisted-dashboard-summary"
          }
        }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const dashboardUrl = `http://127.0.0.1:${address.port}/?token=super-secret`;
      const sanitizedUrl = `http://127.0.0.1:${address.port}/`;
      const statusStdout: string[] = [];
      const snapshotStdout: string[] = [];
      const stderr: string[] = [];

      await expect(runSkfiyCli({
        argv: ["dashboard", "status", "--json", "--url", dashboardUrl],
        rootDir: "/repo",
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => statusStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);
      await expect(runSkfiyCli({
        argv: ["dashboard", "snapshot", "--json", "--url", dashboardUrl],
        rootDir: "/repo",
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => snapshotStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const statusOutput = JSON.parse(statusStdout.join(""));
      const snapshotOutput = JSON.parse(snapshotStdout.join(""));

      expect(statusOutput).toMatchObject({
        schemaVersion: 1,
        command: "dashboard status",
        generatedAt: "2026-06-20T00:00:00.000Z",
        executesSystemMutation: false,
        result: "ok",
        url: sanitizedUrl,
        endpoints: {
          descriptor: `${sanitizedUrl}descriptor.json`,
          snapshot: `${sanitizedUrl}snapshot.json`,
          operatorEvidence: `${sanitizedUrl}api/operator-evidence`
        },
        fetch: {
          descriptor: {
            state: "reachable",
            status: 200
          },
          snapshot: {
            state: "reachable",
            status: 200
          },
          operatorEvidence: {
            state: "reachable",
            status: 200
          }
        },
        descriptor: {
          schemaVersion: 1,
          token: "[redacted]"
        },
        snapshot: {
          schemaVersion: 1,
          runtimeHealth: {
            dashboard: { state: "running" },
            extension: {
              state: "connected",
              authorization: "[redacted]"
            }
          },
          operatorReadiness: {
            state: "ready",
            extensionReadiness: {
              token: "[redacted]"
            }
          }
        },
        operatorReadiness: {
          state: "ready",
          extensionReadiness: {
            token: "[redacted]"
          }
        },
        operatorEvidence: {
          schemaVersion: 1,
          snapshot: {
            readiness: {
              state: "ready",
              bearer: "redacted [redacted]"
            }
          },
          outputPolicy: {
            tokenFree: true
          }
        }
      });
      expect(snapshotOutput).toMatchObject({
        schemaVersion: 1,
        command: "dashboard snapshot",
        result: "ok",
        snapshot: {
          schemaVersion: 1,
          operatorReadiness: {
            state: "ready",
            extensionReadiness: {
              token: "[redacted]"
            }
          },
          runtimeHealth: {
            extension: {
              authorization: "[redacted]"
            }
          }
        }
      });
      expect(requests).toEqual([
        "/descriptor.json",
        "/snapshot.json",
        "/api/operator-evidence",
        "/descriptor.json",
        "/snapshot.json"
      ]);
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("super-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("descriptor-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("snapshot-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("operator-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("evidence-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("evidence-descriptor-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("token=super-secret");
      expect(stderr).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("runs dashboard through the shared CLI entrypoint without printing tokens", async () => {
    const homeDir = createTempRoot();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const started: Array<{ port: number; rootDir?: string }> = [];

    await expect(runSkfiyCli({
      argv: ["dashboard", "--no-open", "--port", "0", "--json"],
      rootDir: "/repo",
      homeDir,
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      keepDashboardAlive: false,
      dashboardServerStarter: async (input) => {
        started.push(input);
        return {
          bind: { host: "127.0.0.1", port: 51234 },
          url: "http://127.0.0.1:51234/",
          close: async () => undefined
        };
      }
    })).resolves.toBe(0);

    expect(started).toEqual([{ port: 0, rootDir: "/repo" }]);
    const statePath = createDashboardServerStatePath(homeDir);
    const output = JSON.parse(stdout.join(""));
    expect(output).toMatchObject({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: "2026-06-20T00:00:00.000Z",
      serverPid: process.pid,
      bind: {
        host: "127.0.0.1",
        port: 51234
      },
      url: "http://127.0.0.1:51234/",
      statePath,
      result: "running",
      shouldOpen: false,
      tokenPrinted: false,
      auth: {
        mode: "optional-token",
        tokenPrinted: false
      },
      updates: {
        transport: "sse",
        scope: "local-http"
      },
      eventStore: {
        mode: "append-only",
        requiredForExecution: false
      },
      descriptor: {
        bind: {
          host: "127.0.0.1",
          port: 51234
        },
        url: "http://127.0.0.1:51234/",
        auth: {
          mode: "optional-token",
          tokenPrinted: false
        },
        updates: {
          transport: "sse",
          scope: "local-http"
        },
        eventStore: {
          mode: "append-only",
          requiredForExecution: false
        }
      }
    });
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      pid: process.pid,
      url: "http://127.0.0.1:51234/",
      bind: {
        host: "127.0.0.1",
        port: 51234
      },
      startedAt: "2026-06-20T00:00:00.000Z",
      rootDir: "/repo"
    });
    expect(JSON.stringify(output)).not.toContain("token=");
    expect(stderr).toEqual([]);
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("opens dashboard URL by default and skips opening when --no-open is set", async () => {
    const homeDir = createTempRoot();
    const openedUrls: string[] = [];
    const createBase = (stdout: string[]) => ({
      rootDir: "/repo",
      homeDir,
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
      statePath: createDashboardServerStatePath(homeDir),
      shouldOpen: true
    });
    expect(JSON.parse(secondStdout.join(""))).toMatchObject({
      url: "http://127.0.0.1:8789/",
      statePath: createDashboardServerStatePath(homeDir),
      shouldOpen: false
    });
    rmSync(homeDir, { recursive: true, force: true });
  });
});
