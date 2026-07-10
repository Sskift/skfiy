import { spawn } from "node:child_process";
import path from "node:path";

export const SMOKE_TARGETS = [
  "ui",
  "desktop-session",
  "ghostty",
  "chrome",
  "dashboard",
  "codex-plugin",
  "finder",
  "money-run"
] as const;

export type SmokeTarget = typeof SMOKE_TARGETS[number];

const SMOKE_SCRIPT_FILES: Record<SmokeTarget, string> = {
  ui: "scripts/smoke-ui-product.mjs",
  "desktop-session": "scripts/smoke-desktop-session.mjs",
  ghostty: "scripts/smoke-ghostty-product.mjs",
  chrome: "scripts/smoke-chrome-product.mjs",
  dashboard: "scripts/smoke-dashboard-product.mjs",
  "codex-plugin": "scripts/smoke-codex-plugin-product.mjs",
  finder: "scripts/smoke-finder-product.mjs",
  "money-run": "scripts/smoke-money-run-supervision.mjs"
};

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

export function isSmokeTarget(value: string | undefined): value is SmokeTarget {
  return SMOKE_TARGETS.includes(value as SmokeTarget);
}

export function createSmokeScriptPath(target: SmokeTarget, rootDir: string): string {
  return path.join(rootDir, ...SMOKE_SCRIPT_FILES[target].split("/"));
}

export function createSmokeScriptArgs(target: SmokeTarget, argv: string[], rootDir: string): string[] {
  const args: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      continue;
    }

    if (arg === "--output") {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        args.push("--output");
      } else {
        args.push("--output", path.isAbsolute(value) ? value : path.resolve(rootDir, value));
        index += 1;
      }
      continue;
    }

    args.push(arg);
  }

  return args;
}

export function parseSmokeJson(stdout: string): Record<string, unknown> | undefined {
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

export function runSmokeScript(input: SmokeRunnerInput): Promise<SmokeRunnerResult> {
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
