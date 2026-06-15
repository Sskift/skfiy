import { execFile } from "node:child_process";
import type {
  DesktopActionResult,
  DesktopAppInfo,
  DesktopAppState,
  DesktopExecutableAction,
  DesktopHelperActionResult,
  DesktopHelperClientOptions,
  DesktopHelperProcessResult,
  DesktopWindowInfo,
  PermissionSettingsTarget,
  PermissionState,
  PermissionSummary,
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

  async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
    if (!isRecord(action)) {
      throw new Error("Desktop action must be a JSON object.");
    }

    if (typeof action.type !== "string" || action.type.length === 0) {
      throw new Error("Desktop action type must be a non-empty string.");
    }

    switch (action.type) {
      case "activate_app":
        return this.activateApp(action.bundleId);
      case "screenshot":
        return this.screenshot(action.outputPath);
      case "click":
        return this.click(action.x, action.y);
      case "type_text":
        return this.typeText(action.text);
      case "press_key":
        return this.pressKey(action.key);
      case "observe_app":
        return this.getAppState(action.bundleId, action.screenshotOutputPath);
      default: {
        const unsupportedAction = action as { type: string };
        throw new Error(`Unsupported desktop action type: ${unsupportedAction.type}`);
      }
    }
  }

  async listApps(): Promise<DesktopAppInfo[]> {
    const response = await this.runJson("list-apps", ["list-apps"], readListAppsResponse);
    return response.apps;
  }

  async activateApp(bundleId: string): Promise<DesktopHelperActionResult> {
    const checkedBundleId = requireNonEmptyString(bundleId, "bundleId");

    return this.runJson(
      "activate-app",
      ["activate-app", "--bundle-id", checkedBundleId],
      readActionResult
    );
  }

  async screenshot(outputPath: string): Promise<ScreenshotResult> {
    const checkedOutputPath = requireNonEmptyString(outputPath, "outputPath");
    return this.runJson(
      "screenshot",
      ["screenshot", "--output", checkedOutputPath],
      readScreenshotResult
    );
  }

  async click(x: number, y: number): Promise<DesktopHelperActionResult> {
    const checkedX = requireFiniteNumber(x, "x");
    const checkedY = requireFiniteNumber(y, "y");
    return this.runJson(
      "click",
      ["click", "--x", String(checkedX), "--y", String(checkedY)],
      readActionResult
    );
  }

  async typeText(text: string): Promise<DesktopHelperActionResult> {
    const checkedText = requireNonEmptyString(text, "text");
    return this.runJson("type-text", ["type-text", "--text", checkedText], readActionResult);
  }

  async pressKey(key: string): Promise<DesktopHelperActionResult> {
    const checkedKey = requireNonEmptyString(key, "key");
    return this.runJson("press-key", ["press-key", "--key", checkedKey], readActionResult);
  }

  async pressShortcut(
    key: string,
    modifiers: readonly string[]
  ): Promise<DesktopHelperActionResult> {
    const checkedKey = requireNonEmptyString(key, "key");
    const checkedModifiers = requireNonEmptyStringArray(modifiers, "modifiers", "modifier");

    return this.runJson(
      "press-shortcut",
      ["press-shortcut", "--key", checkedKey, "--modifiers", checkedModifiers.join(",")],
      readActionResult
    );
  }

  async selectInputSource(sourceId: string): Promise<DesktopHelperActionResult> {
    const checkedSourceId = requireNonEmptyString(sourceId, "sourceId");
    return this.runJson(
      "select-input-source",
      ["select-input-source", "--source-id", checkedSourceId],
      readActionResult
    );
  }

  async doubleTapFunctionKey(): Promise<DesktopHelperActionResult> {
    return this.runJson("double-tap-fn", ["double-tap-fn"], readActionResult);
  }

  async getAppState(bundleId: string, screenshotOutputPath: string): Promise<DesktopAppState> {
    const checkedBundleId = requireNonEmptyString(bundleId, "bundleId");
    const checkedScreenshotOutputPath = requireNonEmptyString(
      screenshotOutputPath,
      "screenshotOutputPath"
    );

    return this.runJson(
      "get-app-state",
      [
        "get-app-state",
        "--bundle-id",
        checkedBundleId,
        "--screenshot-output",
        checkedScreenshotOutputPath
      ],
      readAppState
    );
  }

  async getPermissions(): Promise<PermissionSummary> {
    return this.runJson("permissions-status", ["permissions-status"], readPermissionSummary);
  }

  async openPermissionSettings(
    permission: PermissionSettingsTarget
  ): Promise<DesktopHelperActionResult> {
    const checkedPermission = requirePermissionSettingsTarget(permission);
    return this.runJson(
      "open-permission-settings",
      ["open-permission-settings", "--permission", checkedPermission],
      readActionResult
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
    if (commandName === "screenshot" || commandName === "get-app-state") {
      return "Screen Recording permission is required for skfiy. Grant it in System Settings > Privacy & Security > Screen Recording, then try again.";
    }

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
        ?? readString(screenshot, "output", commandName),
      frontmostBundleId: readOptionalString(record, "frontmostBundleId", commandName),
      accessibilityTrusted: readOptionalBoolean(record, "accessibilityTrusted", commandName),
      windows: readOptionalWindows(record, commandName)
    };
  }

  return {
    bundleId: readString(record, "bundleId", commandName),
    isRunning: readBoolean(record, "isRunning", commandName),
    isActive: readBoolean(record, "isActive", commandName),
    screenshotPath: readString(record, "screenshotPath", commandName),
    frontmostBundleId: readOptionalString(record, "frontmostBundleId", commandName),
    accessibilityTrusted: readOptionalBoolean(record, "accessibilityTrusted", commandName),
    windows: readOptionalWindows(record, commandName)
  };
}

function readOptionalWindows(
  record: Record<string, unknown>,
  commandName: string
): DesktopWindowInfo[] | undefined {
  const windows = record.windows;

  if (windows === undefined || windows === null) {
    return undefined;
  }

  if (!Array.isArray(windows)) {
    throw invalidShape(commandName, "expected windows to be an array when provided");
  }

  return windows.map((window) => readWindowInfo(window, commandName));
}

function readWindowInfo(payload: unknown, commandName: string): DesktopWindowInfo {
  const record = readRecord(payload, commandName);
  const bounds = readRecord(record.bounds, commandName);

  return {
    title: readOptionalString(record, "title", commandName),
    layer: readNumber(record, "layer", commandName),
    bounds: {
      x: readNumber(bounds, "x", commandName),
      y: readNumber(bounds, "y", commandName),
      width: readNumber(bounds, "width", commandName),
      height: readNumber(bounds, "height", commandName)
    }
  };
}

function readPermissionSummary(payload: unknown, commandName: string): PermissionSummary {
  const record = readRecord(payload, commandName);

  return {
    screenRecording: readPermissionStatus(record.screenRecording, commandName),
    accessibility: readPermissionStatus(record.accessibility, commandName),
    microphone: readPermissionStatus(record.microphone, commandName)
  };
}

function readPermissionStatus(payload: unknown, commandName: string) {
  const record = readRecord(payload, commandName);
  const state = readOptionalString(record, "state", commandName)
    ?? normalizeNativePermissionStatus(record, commandName);

  if (!isPermissionState(state)) {
    throw invalidShape(commandName, `expected permission state to be known, got ${state}`);
  }

  return { state };
}

function normalizeNativePermissionStatus(
  record: Record<string, unknown>,
  commandName: string
): PermissionState {
  const status = readOptionalString(record, "status", commandName);

  if (!status) {
    throw invalidShape(commandName, "expected state or status to be a string");
  }

  switch (status) {
    case "authorized":
      return "granted";
    case "notDetermined":
      return "not-determined";
    case "denied":
    case "restricted":
    case "notAuthorized":
      return "denied";
    case "unknown":
      return "unknown";
    default:
      throw invalidShape(commandName, `expected known native permission status, got ${status}`);
  }
}

function readRecord(payload: unknown, commandName: string): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw invalidShape(commandName, "expected a JSON object");
  }

  return payload;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function requireNonEmptyStringArray(
  value: unknown,
  label: string,
  itemLabel: string
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must include at least one ${itemLabel}.`);
  }

  return value.map((item) => requireNonEmptyString(item, itemLabel));
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function requirePermissionSettingsTarget(value: unknown): PermissionSettingsTarget {
  if (
    value === "screen-recording"
    || value === "accessibility"
    || value === "microphone"
  ) {
    return value;
  }

  throw new Error("permission must be screen-recording, accessibility, or microphone.");
}

function isPermissionState(value: string): value is PermissionState {
  return (
    value === "granted"
    || value === "denied"
    || value === "not-determined"
    || value === "unknown"
  );
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

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  commandName: string
): boolean | undefined {
  const value = record[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw invalidShape(commandName, `expected ${key} to be a boolean when provided`);
  }

  return value;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  commandName: string
): number {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidShape(commandName, `expected ${key} to be a finite number`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidShape(commandName: string, reason: string): Error {
  return new Error(`Desktop helper returned invalid JSON shape for ${commandName}: ${reason}.`);
}
