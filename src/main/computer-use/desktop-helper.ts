import { execFile } from "node:child_process";
import type {
  DesktopAppInfo,
  DesktopAppState,
  DesktopHelperActionResult,
  DesktopHelperClientOptions,
  DesktopHelperProcessResult,
  ProcessRunner,
  ScreenshotResult
} from "./types.js";

const DEFAULT_HELPER_PATH = "dist/skfiy-helper";

interface ListAppsResponse {
  apps: DesktopAppInfo[];
}

export class DesktopHelperClient {
  private readonly helperPath: string;
  private readonly runner: ProcessRunner;

  constructor(options: DesktopHelperClientOptions = {}) {
    this.helperPath = options.helperPath ?? DEFAULT_HELPER_PATH;
    this.runner = options.runner ?? runProcess;
  }

  async listApps(): Promise<DesktopAppInfo[]> {
    const response = await this.runJson("list-apps", ["list-apps"], readListAppsResponse);
    return response.apps;
  }

  async activateApp(bundleId: string): Promise<DesktopHelperActionResult> {
    return this.runJson(
      "activate-app",
      ["activate-app", "--bundle-id", bundleId],
      readActionResult
    );
  }

  async screenshot(outputPath: string): Promise<ScreenshotResult> {
    return this.runJson("screenshot", ["screenshot", "--output", outputPath], readScreenshotResult);
  }

  async click(x: number, y: number): Promise<DesktopHelperActionResult> {
    return this.runJson("click", ["click", "--x", String(x), "--y", String(y)], readActionResult);
  }

  async typeText(text: string): Promise<DesktopHelperActionResult> {
    return this.runJson("type-text", ["type-text", "--text", text], readActionResult);
  }

  async pressKey(key: string): Promise<DesktopHelperActionResult> {
    return this.runJson("press-key", ["press-key", "--key", key], readActionResult);
  }

  async getAppState(bundleId: string, screenshotOutputPath: string): Promise<DesktopAppState> {
    return this.runJson(
      "get-app-state",
      ["get-app-state", "--bundle-id", bundleId, "--screenshot-output", screenshotOutputPath],
      readAppState
    );
  }

  private async runJson<T>(
    commandName: string,
    args: readonly string[],
    readResponse: (payload: unknown, commandName: string) => T
  ): Promise<T> {
    const result = await this.runner(this.helperPath, args);

    if (result.exitCode !== 0) {
      const detail = readFailureDetail(commandName, result);
      throw new Error(
        `Desktop helper command failed (${commandName}) with exit code ${result.exitCode}: ${detail}`
      );
    }

    const payload = unwrapHelperPayload(parseJson(commandName, result.stdout), commandName);
    return readResponse(payload, commandName);
  }
}

export const runProcess: ProcessRunner = (
  command,
  args
): Promise<DesktopHelperProcessResult> =>
  new Promise((resolve) => {
    execFile(command, [...args], { encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
        exitCode: readExitCode(error)
      });
    });
  });

function readExitCode(error: unknown): number {
  if (!error) {
    return 0;
  }

  if (isRecord(error) && typeof error.code === "number") {
    return error.code;
  }

  return 1;
}

function parseJson(commandName: string, stdout: string): unknown {
  const text = stdout.trim();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Desktop helper returned invalid JSON for ${commandName}: ${text || "(empty stdout)"}`);
  }
}

function readFailureDetail(commandName: string, result: DesktopHelperProcessResult): string {
  const stderr = result.stderr.trim();
  if (stderr) {
    return stderr;
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    return "No error output.";
  }

  const payload = tryParseJson(stdout);
  const helperMessage = payload === undefined ? undefined : readHelperErrorMessage(payload, commandName);
  return helperMessage ?? stdout;
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function unwrapHelperPayload(payload: unknown, commandName: string): unknown {
  if (!isRecord(payload) || typeof payload.ok !== "boolean") {
    return payload;
  }

  const isEnvelope =
    "data" in payload || "error" in payload || typeof payload.command === "string";
  if (!isEnvelope) {
    return payload;
  }

  if (!payload.ok) {
    throw new Error(readHelperErrorMessage(payload, commandName) ?? `Helper reported ${commandName} failed.`);
  }

  if (!("data" in payload)) {
    throw invalidShape(commandName, "expected data in a successful helper envelope");
  }

  return payload.data;
}

function readHelperErrorMessage(payload: unknown, commandName: string): string | undefined {
  const record = readRecord(payload, commandName);
  const error = record.error;

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  if (typeof record.message === "string") {
    return record.message;
  }

  return undefined;
}

function readListAppsResponse(payload: unknown, commandName: string): ListAppsResponse {
  const record = readRecord(payload, commandName);
  const apps = record.apps;

  if (!Array.isArray(apps)) {
    throw invalidShape(commandName, "expected an apps array");
  }

  return { apps: apps.map((app) => readAppInfo(app, commandName)) };
}

function readAppInfo(payload: unknown, commandName: string): DesktopAppInfo {
  const record = readRecord(payload, commandName);
  const bundleId = readString(record, "bundleId", commandName);
  const name = readOptionalString(record, "name", commandName)
    ?? readOptionalString(record, "localizedName", commandName)
    ?? bundleId;
  const pid = record.pid ?? record.processIdentifier;

  if (pid !== undefined && typeof pid !== "number") {
    throw invalidShape(commandName, "expected pid/processIdentifier to be a number when provided");
  }

  return pid === undefined ? { bundleId, name } : { bundleId, name, pid };
}

function readScreenshotResult(payload: unknown, commandName: string): ScreenshotResult {
  const record = readRecord(payload, commandName);
  return {
    outputPath:
      readOptionalString(record, "outputPath", commandName)
      ?? readString(record, "output", commandName)
  };
}

function readActionResult(payload: unknown, commandName: string): DesktopHelperActionResult {
  const record = readRecord(payload, commandName);
  const message = readOptionalString(record, "message", commandName);

  if (typeof record.ok === "boolean") {
    return message === undefined ? { ok: record.ok } : { ok: record.ok, message };
  }

  if (typeof record.activated === "boolean") {
    return message === undefined ? { ok: record.activated } : { ok: record.activated, message };
  }

  return message === undefined ? { ok: true } : { ok: true, message };
}

function readAppState(payload: unknown, commandName: string): DesktopAppState {
  const record = readRecord(payload, commandName);

  if (isRecord(record.app)) {
    const screenshot = readRecord(record.screenshot, commandName);

    return {
      bundleId: readString(record.app, "bundleId", commandName),
      isRunning: true,
      isActive: readBoolean(record.app, "isActive", commandName),
      screenshotPath:
        readOptionalString(screenshot, "screenshotPath", commandName)
        ?? readString(screenshot, "output", commandName)
    };
  }

  return {
    bundleId: readString(record, "bundleId", commandName),
    isRunning: readBoolean(record, "isRunning", commandName),
    isActive: readBoolean(record, "isActive", commandName),
    screenshotPath: readString(record, "screenshotPath", commandName)
  };
}

function readRecord(payload: unknown, commandName: string): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw invalidShape(commandName, "expected a JSON object");
  }

  return payload;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  commandName: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw invalidShape(commandName, `expected ${key} to be a string`);
  }

  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  commandName: string
): string | undefined {
  const value = record[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw invalidShape(commandName, `expected ${key} to be a string when provided`);
  }

  return value;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  commandName: string
): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw invalidShape(commandName, `expected ${key} to be a boolean`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidShape(commandName: string, reason: string): Error {
  return new Error(`Desktop helper returned invalid JSON shape for ${commandName}: ${reason}.`);
}
