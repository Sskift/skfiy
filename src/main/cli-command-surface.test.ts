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
  it("defines the planned operator commands without wiring system mutations", () => {
    const surface = createCliCommandSurface();

    expect(surface.schemaVersion).toBe(1);
    expect(surface.commands.map((command) => command.path)).toEqual([
      "status",
      "doctor",
      "dashboard",
      "chrome status",
      "chrome install-host",
      "chrome uninstall-host",
      "smoke ui",
      "smoke desktop-session",
      "smoke ghostty",
      "smoke chrome",
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
      })
    ]));
    expect(SMOKE_TARGETS).toEqual([
      "ui",
      "desktop-session",
      "ghostty",
      "chrome",
      "finder",
      "voice",
      "money-run"
    ]);
  });

  it("normalizes status and doctor into JSON-safe output skeletons", () => {
    const status = expectInvocation(["status", "--json"]);
    const doctor = expectInvocation(["doctor"]);

    expect(status).toEqual({
      kind: "status",
      path: "status",
      json: true,
      options: {}
    });
    expect(createCliOutput(status, {
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
      dashboard: { state: "not-running" }
    });

    expect(createCliOutput(doctor, {
      generatedAt: "2026-06-20T00:00:00.000Z"
    })).toEqual({
      schemaVersion: 1,
      command: "doctor",
      generatedAt: "2026-06-20T00:00:00.000Z",
      result: "not-run",
      diagnostics: [],
      nextActions: []
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

  it("normalizes smoke, release, and alpha artifact paths", () => {
    const smoke = expectInvocation([
      "smoke",
      "chrome",
      "--output",
      ".skfiy-smoke/chrome.json"
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
      path: "smoke chrome",
      target: "chrome",
      outputPath: "/repo/.skfiy-smoke/chrome.json"
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
      command: "smoke chrome",
      target: "chrome",
      outputPath: "/repo/.skfiy-smoke/chrome.json",
      result: "not-run"
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
  });

  it("runs the shared CLI entrypoint with JSON output and error exit codes", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    await expect(runSkfiyCli({
      argv: ["status", "--json"],
      rootDir: "/repo",
      generatedAt: "2026-06-20T00:00:00.000Z",
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
});
