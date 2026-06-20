import path from "node:path";
import { createDashboardDescriptor } from "./dashboard-status.js";

export const SMOKE_TARGETS = [
  "ui",
  "desktop-session",
  "ghostty",
  "chrome",
  "finder",
  "voice",
  "money-run"
] as const;

export type SmokeTarget = typeof SMOKE_TARGETS[number];
export type ChromeSubcommand = "status" | "install-host" | "uninstall-host";

export interface CliCommandDefinition {
  path: string;
  summary: string;
  jsonOutput: boolean;
  plannedMutation: boolean;
  executesSystemMutation: false;
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
      options: Record<string, never>;
    }
  | {
      kind: "smoke";
      path: `smoke ${SmokeTarget}`;
      target: SmokeTarget;
      json: boolean;
      outputPath: string;
      options: Record<string, never>;
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

export interface RunSkfiyCliInput {
  argv: string[];
  rootDir?: string;
  generatedAt?: string;
  stdout: SkfiyCliIo;
  stderr: SkfiyCliIo;
}

const SMOKE_COMMANDS: CliCommandDefinition[] = SMOKE_TARGETS.map((target) => ({
  path: `smoke ${target}`,
  summary: `Plan the ${target} smoke target and output artifact.`,
  jsonOutput: true,
  plannedMutation: false,
  executesSystemMutation: false,
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
    summary: "Plan Chrome Native Messaging host installation without mutating the system.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: false,
    outputShape: "chrome-host-plan"
  },
  {
    path: "chrome uninstall-host",
    summary: "Plan Chrome Native Messaging host removal without mutating the system.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: false,
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
      options: {}
    });
  }

  if (command === "smoke") {
    const target = argv[1];

    if (!isSmokeTarget(target)) {
      return error("unknown-smoke-target", `Unknown smoke target: ${target ?? ""}`);
    }

    return ok({
      kind: "smoke",
      path: `smoke ${target}`,
      target,
      json: argv.includes("--json"),
      outputPath: resolveOptionPath(argv, "--output", rootDir, ""),
      options: {}
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
        nativeHost: { state: "unknown" }
      };
    }

    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      plannedMutation: true,
      executesSystemMutation: false,
      result: "not-run",
      nativeHostManifest: { state: "not-mutated" }
    };
  }

  if (invocation.kind === "smoke") {
    return {
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      target: invocation.target,
      outputPath: invocation.outputPath,
      result: "not-run",
      executesSystemMutation: false
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
  generatedAt,
  stdout,
  stderr
}: RunSkfiyCliInput): Promise<number> {
  const result = normalizeCliCommand(argv, { rootDir });

  if (!result.ok) {
    stderr.write(`${result.error.message}\n`);
    return 2;
  }

  stdout.write(`${JSON.stringify(createCliOutput(result.invocation, { generatedAt }), null, 2)}\n`);
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
