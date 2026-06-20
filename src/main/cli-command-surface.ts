import path from "node:path";
import { spawn } from "node:child_process";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  startDashboardServer,
  type DashboardServer
} from "./dashboard-server.js";
import {
  installChromeNativeHost,
  readChromeNativeHostStatus,
  uninstallChromeNativeHost,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";

export const SMOKE_TARGETS = [
  "ui",
  "desktop-session",
  "ghostty",
  "chrome",
  "dashboard",
  "finder",
  "voice",
  "money-run"
] as const;

export type SmokeTarget = typeof SMOKE_TARGETS[number];
export type ChromeSubcommand = "status" | "install-host" | "uninstall-host";

const SMOKE_SCRIPT_FILES: Record<SmokeTarget, string> = {
  ui: "scripts/smoke-ui-product.mjs",
  "desktop-session": "scripts/smoke-desktop-session.mjs",
  ghostty: "scripts/smoke-ghostty-product.mjs",
  chrome: "scripts/smoke-chrome-product.mjs",
  dashboard: "scripts/smoke-dashboard-product.mjs",
  finder: "scripts/smoke-finder-product.mjs",
  voice: "scripts/smoke-voice-product.mjs",
  "money-run": "scripts/smoke-money-run-supervision.mjs"
};

export interface CliCommandDefinition {
  path: string;
  summary: string;
  jsonOutput: boolean;
  plannedMutation: boolean;
  executesSystemMutation: boolean;
  outputShape: string;
}

export interface CliCommandSurface {
  schemaVersion: 1;
  commands: CliCommandDefinition[];
}

export interface NormalizeCliCommandOptions {
  rootDir?: string;
}

export type CliCommandInvocation =
  | {
      kind: "status";
      path: "status";
      json: boolean;
      options: Record<string, never>;
    }
  | {
      kind: "doctor";
      path: "doctor";
      json: boolean;
      options: Record<string, never>;
    }
  | {
      kind: "dashboard";
      path: "dashboard";
      json: boolean;
      options: {
        noOpen: boolean;
        port: number;
      };
    }
  | {
      kind: "chrome";
      path: `chrome ${ChromeSubcommand}`;
      subcommand: ChromeSubcommand;
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
      };
    }
  | {
      kind: "smoke";
      path: `smoke ${SmokeTarget}`;
      target: SmokeTarget;
      json: boolean;
      outputPath: string;
      options: {
        requirePassed: boolean;
        scriptPath: string;
        scriptArgs: string[];
      };
    }
  | {
      kind: "release-check";
      path: "release check";
      json: boolean;
      jsonOutputPath: string;
      options: Record<string, never>;
    }
  | {
      kind: "alpha-artifact";
      path: "alpha artifact";
      json: boolean;
      options: Record<string, never>;
    };

export type NormalizeCliCommandResult =
  | {
      ok: true;
      invocation: CliCommandInvocation;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface CreateCliOutputOptions {
  generatedAt?: string;
}

export interface SkfiyCliIo {
  write: (chunk: string) => unknown;
}

export interface SmokeRunnerInput {
  target: SmokeTarget;
  cwd: string;
  scriptPath: string;
  args: string[];
}

export interface SmokeRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunSkfiyCliInput {
  argv: string[];
  rootDir?: string;
  homeDir?: string;
  generatedAt?: string;
  chromeNativeHostIo?: ChromeNativeHostIo;
  smokeRunner?: (input: SmokeRunnerInput) => Promise<SmokeRunnerResult>;
  dashboardServerStarter?: (input: { port: number }) => Promise<DashboardServer>;
  dashboardOpener?: (url: string) => Promise<void>;
  keepDashboardAlive?: boolean;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}

const SMOKE_COMMANDS: CliCommandDefinition[] = SMOKE_TARGETS.map((target) => ({
  path: `smoke ${target}`,
  summary: `Run the ${target} smoke target and output artifact.`,
  jsonOutput: true,
  plannedMutation: true,
  executesSystemMutation: true,
  outputShape: "smoke"
}));

const COMMANDS: CliCommandDefinition[] = [
  {
    path: "status",
    summary: "Report app, helper, permissions, desktop-session, extension, and dashboard status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "status"
  },
  {
    path: "doctor",
    summary: "Return actionable permission and packaging diagnostics.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "doctor"
  },
  {
    path: "dashboard",
    summary: "Describe the local loopback dashboard command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard"
  },
  {
    path: "chrome status",
    summary: "Report Chrome extension and native host status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "chrome-status"
  },
  {
    path: "chrome install-host",
    summary: "Install the Chrome Native Messaging host for the current skfiy CLI.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-plan"
  },
  {
    path: "chrome uninstall-host",
    summary: "Uninstall the Chrome Native Messaging host manifest.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-plan"
  },
  ...SMOKE_COMMANDS,
  {
    path: "release check",
    summary: "Plan release gate checks and a JSON output artifact.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "release-check"
  },
  {
    path: "alpha artifact",
    summary: "Plan alpha artifact creation without mutating the system.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: false,
    outputShape: "alpha-artifact"
  }
];

export function createCliCommandSurface(): CliCommandSurface {
  return {
    schemaVersion: 1,
    commands: COMMANDS.map((command) => ({ ...command }))
  };
}

export function normalizeCliCommand(
  argv: string[],
  options: NormalizeCliCommandOptions = {}
): NormalizeCliCommandResult {
  const rootDir = options.rootDir ?? process.cwd();
  const command = argv[0];

  if (command === "status") {
    return ok({
      kind: "status",
      path: "status",
      json: argv.includes("--json"),
      options: {}
    });
  }

  if (command === "doctor") {
    return ok({
      kind: "doctor",
      path: "doctor",
      json: argv.includes("--json"),
      options: {}
    });
  }

  if (command === "dashboard") {
    const port = readNumberOption(argv, "--port", 0);

    return ok({
      kind: "dashboard",
      path: "dashboard",
      json: argv.includes("--json"),
      options: {
        noOpen: argv.includes("--no-open"),
        port
      }
    });
  }

  if (command === "chrome") {
    const subcommand = argv[1];

    if (!isChromeSubcommand(subcommand)) {
      return error(
        "unknown-chrome-subcommand",
        `Unknown chrome subcommand: ${subcommand ?? ""}`
      );
    }

    return ok({
      kind: "chrome",
      path: `chrome ${subcommand}`,
      subcommand,
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy"))
      }
    });
  }

  if (command === "smoke") {
    const target = argv[1];

    if (!isSmokeTarget(target)) {
      return error("unknown-smoke-target", `Unknown smoke target: ${target ?? ""}`);
    }
    const smokeArgv = argv.slice(2);

    return ok({
      kind: "smoke",
      path: `smoke ${target}`,
      target,
      json: argv.includes("--json"),
      outputPath: resolveOptionPath(smokeArgv, "--output", rootDir, ""),
      options: {
        requirePassed: smokeArgv.includes("--require-passed"),
        scriptPath: createSmokeScriptPath(target, rootDir),
        scriptArgs: createSmokeScriptArgs(smokeArgv, rootDir)
      }
    });
  }

  if (command === "release" && argv[1] === "check") {
    return ok({
      kind: "release-check",
      path: "release check",
      json: argv.includes("--json"),
      jsonOutputPath: resolveOptionPath(argv, "--json-output", rootDir, ""),
      options: {}
    });
  }

  if (command === "alpha" && argv[1] === "artifact") {
    return ok({
      kind: "alpha-artifact",
      path: "alpha artifact",
      json: argv.includes("--json"),
      options: {}
    });
  }

  return error("unknown-command", `Unknown command: ${command ?? ""}`);
}

export function createCliOutput(
  invocation: CliCommandInvocation,
  options: CreateCliOutputOptions = {}
): Record<string, unknown> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  if (invocation.kind === "status") {
    return {
      schemaVersion: 1,
      command: "status",
      generatedAt,
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
    };
  }

  if (invocation.kind === "doctor") {
    return {
      schemaVersion: 1,
      command: "doctor",
      generatedAt,
      result: "not-run",
      diagnostics: [],
      nextActions: []
    };
  }

  if (invocation.kind === "dashboard") {
    const descriptor = createDashboardDescriptor({ port: invocation.options.port });

    return {
      schemaVersion: 1,
      command: "dashboard",
      generatedAt,
      bind: descriptor.bind,
      url: descriptor.url,
      shouldOpen: !invocation.options.noOpen,
      tokenPrinted: false,
      result: "not-started",
      descriptor
    };
  }

  if (invocation.kind === "chrome") {
    if (invocation.subcommand === "status") {
      return {
        schemaVersion: 1,
        command: "chrome status",
        generatedAt,
        executesSystemMutation: false,
        extension: { state: "unknown" },
        nativeHost: {
          state: "unknown",
          cliShimPath: invocation.options.cliShimPath,
          extensionIds: invocation.options.extensionIds
        }
      };
    }

    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      plannedMutation: true,
      executesSystemMutation: true,
      result: "not-run",
      nativeHostManifest: {
        state: "not-mutated",
        cliShimPath: invocation.options.cliShimPath,
        extensionIds: invocation.options.extensionIds
      }
    };
  }

  if (invocation.kind === "smoke") {
    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      target: invocation.target,
      outputPath: invocation.outputPath,
      scriptPath: invocation.options.scriptPath,
      scriptArgs: invocation.options.scriptArgs,
      result: "not-run",
      executesSystemMutation: true
    };
  }

  if (invocation.kind === "release-check") {
    return {
      schemaVersion: 1,
      command: "release check",
      generatedAt,
      jsonOutputPath: invocation.jsonOutputPath,
      result: "not-run",
      executesSystemMutation: false
    };
  }

  return {
    schemaVersion: 1,
    command: "alpha artifact",
    generatedAt,
    plannedMutation: true,
    executesSystemMutation: false,
    result: "not-run"
  };
}

export async function runSkfiyCli({
  argv,
  rootDir,
  homeDir,
  generatedAt,
  chromeNativeHostIo,
  smokeRunner = runSmokeScript,
  dashboardServerStarter = startDashboardServer,
  dashboardOpener = openDashboardUrl,
  keepDashboardAlive = true,
  stdout,
  stderr
}: RunSkfiyCliInput): Promise<number> {
  const normalizedRootDir = rootDir ?? process.cwd();
  const result = normalizeCliCommand(argv, { rootDir: normalizedRootDir });

  if (!result.ok) {
    stderr.write(`${result.error.message}\n`);
    return 2;
  }

  if (result.invocation.kind === "chrome") {
    return runChromeNativeHostCli({
      invocation: result.invocation,
      generatedAt,
      homeDir: homeDir ?? process.env.HOME ?? "",
      io: chromeNativeHostIo,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "smoke") {
    return runSmokeCli({
      invocation: result.invocation,
      generatedAt,
      rootDir: normalizedRootDir,
      smokeRunner,
      stdout,
      stderr
    });
  }

  if (result.invocation.kind === "dashboard") {
    const dashboard = await dashboardServerStarter({
      port: result.invocation.options.port
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "dashboard",
      generatedAt: generatedAt ?? new Date().toISOString(),
      bind: dashboard.bind,
      url: dashboard.url,
      shouldOpen: !result.invocation.options.noOpen,
      tokenPrinted: false,
      result: "running"
    }, null, 2)}\n`);

    if (!result.invocation.options.noOpen) {
      await dashboardOpener(dashboard.url);
    }

    if (!keepDashboardAlive) {
      await dashboard.close();
      return 0;
    }

    await waitForDashboardShutdown(dashboard);
    return 0;
  }

  stdout.write(`${JSON.stringify(createCliOutput(result.invocation, { generatedAt }), null, 2)}\n`);
  return 0;
}

async function runSmokeCli({
  invocation,
  generatedAt,
  rootDir,
  smokeRunner,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "smoke" }>;
  generatedAt?: string;
  rootDir: string;
  smokeRunner: (input: SmokeRunnerInput) => Promise<SmokeRunnerResult>;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  let smokeResult: SmokeRunnerResult;

  try {
    smokeResult = await smokeRunner({
      target: invocation.target,
      cwd: rootDir,
      scriptPath: invocation.options.scriptPath,
      args: invocation.options.scriptArgs
    });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stdout.write(`${JSON.stringify({
      ...createCliOutput(invocation, { generatedAt }),
      result: "error",
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2)}\n`);
    return 1;
  }

  const smoke = parseSmokeJson(smokeResult.stdout);
  const result = typeof smoke?.result === "string"
    ? smoke.result
    : smokeResult.exitCode === 0 ? "completed" : "failed";

  stdout.write(`${JSON.stringify({
    ...createCliOutput(invocation, { generatedAt }),
    result,
    exitCode: smokeResult.exitCode,
    smoke,
    smokeStderr: smokeResult.stderr
  }, null, 2)}\n`);

  return smokeResult.exitCode;
}

function runSmokeScript(input: SmokeRunnerInput): Promise<SmokeRunnerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      input.scriptPath,
      ...input.args
    ], {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function openDashboardUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [url], {
      stdio: "ignore"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`open exited with code ${code ?? "null"}.`));
      }
    });
  });
}

async function waitForDashboardShutdown(dashboard: DashboardServer): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void dashboard.close().finally(resolve);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function runChromeNativeHostCli({
  invocation,
  generatedAt,
  homeDir,
  io,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "chrome" }>;
  generatedAt?: string;
  homeDir: string;
  io?: ChromeNativeHostIo;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}): Promise<number> {
  if (invocation.options.extensionIds.length === 0) {
    stderr.write("Chrome extension id is required. Pass --extension-id <id>.\n");
    return 2;
  }
  if (!homeDir) {
    stderr.write("Home directory is required to locate the Chrome Native Messaging host manifest.\n");
    return 2;
  }

  if (invocation.subcommand === "status") {
    const nativeHost = await readChromeNativeHostStatus({
      homeDir,
      cliShimPath: invocation.options.cliShimPath,
      extensionIds: invocation.options.extensionIds,
      io
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: false,
      nativeHost
    }, null, 2)}\n`);
    return 0;
  }

  if (invocation.subcommand === "install-host") {
    const installResult = await installChromeNativeHost({
      homeDir,
      cliShimPath: invocation.options.cliShimPath,
      extensionIds: invocation.options.extensionIds,
      io
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      executesSystemMutation: true,
      ...installResult
    }, null, 2)}\n`);
    return 0;
  }

  const uninstallResult = await uninstallChromeNativeHost({
    homeDir,
    cliShimPath: invocation.options.cliShimPath,
    extensionIds: invocation.options.extensionIds,
    io
  });
  stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    command: invocation.path,
    generatedAt: generatedAt ?? new Date().toISOString(),
    executesSystemMutation: true,
    ...uninstallResult
  }, null, 2)}\n`);
  return 0;
}

function ok(invocation: CliCommandInvocation): NormalizeCliCommandResult {
  return {
    ok: true,
    invocation
  };
}

function error(code: string, message: string): NormalizeCliCommandResult {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function isChromeSubcommand(value: string | undefined): value is ChromeSubcommand {
  return value === "status" || value === "install-host" || value === "uninstall-host";
}

function isSmokeTarget(value: string | undefined): value is SmokeTarget {
  return SMOKE_TARGETS.includes(value as SmokeTarget);
}

function createSmokeScriptPath(target: SmokeTarget, rootDir: string): string {
  return path.join(rootDir, ...SMOKE_SCRIPT_FILES[target].split("/"));
}

function createSmokeScriptArgs(argv: string[], rootDir: string): string[] {
  const args: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      continue;
    }

    if (arg === "--output") {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        args.push(arg);
      } else {
        args.push(arg, path.isAbsolute(value) ? value : path.resolve(rootDir, value));
        index += 1;
      }
      continue;
    }

    args.push(arg);
  }

  return args;
}

function parseSmokeJson(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function readNumberOption(argv: string[], name: string, fallback: number): number {
  const value = readOptionValue(argv, name);

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid numeric option ${name}: ${value}`);
  }

  return parsed;
}

function resolveOptionPath(
  argv: string[],
  name: string,
  rootDir: string,
  fallback: string
): string {
  const value = readOptionValue(argv, name);

  if (value === undefined || value === "") {
    return fallback;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(rootDir, value);
}

function readOptionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function readRepeatedOptionValues(argv: string[], name: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }

  return values;
}
