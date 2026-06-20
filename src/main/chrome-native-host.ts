import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { normalizeChromeBrowserMessage } from "./chrome-browser-action-schema.js";

export const CHROME_NATIVE_HOST_NAME = "com.sskift.skfiy";
export const CHROME_NATIVE_MESSAGE_SCHEMA_VERSION = 1;
export const CHROME_NATIVE_MESSAGE_MAX_BYTES = 1024 * 1024;
export const CHROME_NATIVE_RESPONSE_TYPE = "skfiy.native.response";

const CHROME_NATIVE_BRIDGE_MESSAGE_TYPES = new Set([
  "skfiy.page.observe",
  "skfiy.page.action",
  "skfiy.host_policy.request"
]);

export interface ChromeNativeHostManifestInput {
  cliShimPath: string;
  extensionIds: string[];
}

export interface ChromeNativeHostManifest {
  name: typeof CHROME_NATIVE_HOST_NAME;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export interface ChromeNativeHostInstallPlanInput extends ChromeNativeHostManifestInput {
  homeDir: string;
}

export interface ChromeNativeHostInstallPlan {
  hostName: typeof CHROME_NATIVE_HOST_NAME;
  manifestPath: string;
  manifest: ChromeNativeHostManifest;
}

export interface ChromeNativeHostIo {
  exists: (targetPath: string) => boolean | Promise<boolean>;
  mkdir: (targetPath: string) => Promise<void>;
  readFile: (targetPath: string) => Promise<string>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  rm: (targetPath: string) => Promise<void>;
}

export interface ChromeNativeHostCommandInput extends ChromeNativeHostInstallPlanInput {
  io?: ChromeNativeHostIo;
}

export interface ChromeNativeHostMutationResult {
  result: "installed" | "uninstalled";
  hostName: typeof CHROME_NATIVE_HOST_NAME;
  manifestPath: string;
  cliShimPath?: string;
  allowedOrigins?: string[];
}

export interface ChromeNativeHostStatus {
  state: "installed" | "missing" | "mismatched" | "cli-missing" | "invalid";
  hostName: typeof CHROME_NATIVE_HOST_NAME;
  manifestPath: string;
  cliShimPath: string;
  allowedOrigins: string[];
  reason: string;
}

export interface ChromeNativeBridgeMessage {
  schemaVersion: typeof CHROME_NATIVE_MESSAGE_SCHEMA_VERSION;
  type: string;
  requestId: string;
  payload?: unknown;
}

export interface ChromeNativeBridgePolicy {
  state: "allowed" | "blocked";
  reason?: string;
  details?: Record<string, unknown>;
}

export type ChromeNativeBridgeDispatch = (
  message: ChromeNativeBridgeMessage
) => Promise<Record<string, unknown>>;

export interface ChromeNativeBridgeInput {
  payloadByteLength: number;
  policy: ChromeNativeBridgePolicy;
  dispatch: ChromeNativeBridgeDispatch;
}

export interface ChromeNativeBridgeResponse {
  schemaVersion: typeof CHROME_NATIVE_MESSAGE_SCHEMA_VERSION;
  type: typeof CHROME_NATIVE_RESPONSE_TYPE;
  requestId: string;
  result: "accepted" | "blocked" | "invalid" | "error";
  reason?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChromeNativeMessagingHostIo {
  stdin: AsyncIterable<Buffer | Uint8Array | string>;
  stdout: {
    write: (chunk: Buffer) => unknown;
  };
  stderr: {
    write: (chunk: string) => unknown;
  };
  policy: ChromeNativeBridgePolicy | (() => ChromeNativeBridgePolicy | Promise<ChromeNativeBridgePolicy>);
  dispatch: ChromeNativeBridgeDispatch;
}

export function createChromeNativeHostManifest({
  cliShimPath,
  extensionIds
}: ChromeNativeHostManifestInput): ChromeNativeHostManifest {
  if (!path.isAbsolute(cliShimPath)) {
    throw new Error("Chrome native messaging host path must be absolute.");
  }

  return {
    name: CHROME_NATIVE_HOST_NAME,
    description: "skfiy desktop Computer Use bridge",
    path: cliShimPath,
    type: "stdio",
    allowed_origins: extensionIds.map((extensionId) => `chrome-extension://${extensionId}/`)
  };
}

export function createChromeNativeHostInstallPlan({
  homeDir,
  cliShimPath,
  extensionIds
}: ChromeNativeHostInstallPlanInput): ChromeNativeHostInstallPlan {
  return {
    hostName: CHROME_NATIVE_HOST_NAME,
    manifestPath: path.join(
      homeDir,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      `${CHROME_NATIVE_HOST_NAME}.json`
    ),
    manifest: createChromeNativeHostManifest({
      cliShimPath,
      extensionIds
    })
  };
}

export async function installChromeNativeHost({
  homeDir,
  cliShimPath,
  extensionIds,
  io = createDefaultChromeNativeHostIo()
}: ChromeNativeHostCommandInput): Promise<ChromeNativeHostMutationResult> {
  const plan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });

  if (!(await io.exists(cliShimPath))) {
    throw new Error(`skfiy CLI shim is missing at ${cliShimPath}. Run npm run build first.`);
  }

  await io.mkdir(path.dirname(plan.manifestPath));
  await io.writeFile(plan.manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`);

  return {
    result: "installed",
    hostName: plan.hostName,
    manifestPath: plan.manifestPath,
    cliShimPath,
    allowedOrigins: plan.manifest.allowed_origins
  };
}

export async function uninstallChromeNativeHost({
  homeDir,
  cliShimPath,
  extensionIds,
  io = createDefaultChromeNativeHostIo()
}: ChromeNativeHostCommandInput): Promise<ChromeNativeHostMutationResult> {
  const plan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });

  await io.rm(plan.manifestPath);

  return {
    result: "uninstalled",
    hostName: plan.hostName,
    manifestPath: plan.manifestPath
  };
}

export async function readChromeNativeHostStatus({
  homeDir,
  cliShimPath,
  extensionIds,
  io = createDefaultChromeNativeHostIo()
}: ChromeNativeHostCommandInput): Promise<ChromeNativeHostStatus> {
  const plan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });

  if (!(await io.exists(cliShimPath))) {
    return createStatus(plan, "cli-missing", `skfiy CLI shim is missing at ${cliShimPath}.`);
  }

  if (!(await io.exists(plan.manifestPath))) {
    return createStatus(plan, "missing", "Chrome Native Messaging host manifest is not installed.");
  }

  let installedManifest: ChromeNativeHostManifest;
  try {
    installedManifest = JSON.parse(await io.readFile(plan.manifestPath)) as ChromeNativeHostManifest;
  } catch {
    return createStatus(plan, "invalid", "Chrome Native Messaging host manifest is not valid JSON.");
  }

  if (JSON.stringify(installedManifest) !== JSON.stringify(plan.manifest)) {
    return createStatus(
      plan,
      "mismatched",
      "Chrome Native Messaging host manifest does not match the current skfiy CLI."
    );
  }

  return createStatus(plan, "installed", "Chrome Native Messaging host is installed.");
}

export function encodeChromeNativeMessageFrame(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.byteLength > CHROME_NATIVE_MESSAGE_MAX_BYTES) {
    throw new Error("Chrome native messaging payload exceeds 1 MiB.");
  }
  const frame = Buffer.allocUnsafe(payload.byteLength + 4);
  frame.writeUInt32LE(payload.byteLength, 0);
  payload.copy(frame, 4);
  return frame;
}

export function decodeChromeNativeMessageFrame(frame: Buffer): unknown {
  if (frame.byteLength < 4) {
    throw new Error("Chrome native messaging frame is missing its length prefix.");
  }

  const payloadByteLength = frame.readUInt32LE(0);
  if (payloadByteLength > CHROME_NATIVE_MESSAGE_MAX_BYTES) {
    throw new Error("Chrome native messaging payload exceeds 1 MiB.");
  }
  if (frame.byteLength - 4 < payloadByteLength) {
    throw new Error("Chrome native messaging frame is incomplete.");
  }

  return JSON.parse(frame.subarray(4, 4 + payloadByteLength).toString("utf8"));
}

export async function runChromeNativeMessagingHost({
  stdin,
  stdout,
  stderr,
  policy,
  dispatch
}: ChromeNativeMessagingHostIo): Promise<number> {
  let buffer = Buffer.alloc(0);

  try {
    for await (const chunk of stdin) {
      buffer = Buffer.concat([buffer, toBuffer(chunk)]);

      while (buffer.byteLength >= 4) {
        const payloadByteLength = buffer.readUInt32LE(0);
        if (payloadByteLength > CHROME_NATIVE_MESSAGE_MAX_BYTES) {
          stdout.write(encodeChromeNativeMessageFrame(createNativeBridgeResponse({
            requestId: "unknown",
            result: "invalid",
            reason: "payload_too_large"
          })));
          return 1;
        }

        if (buffer.byteLength < payloadByteLength + 4) {
          break;
        }

        const frame = buffer.subarray(0, payloadByteLength + 4);
        buffer = buffer.subarray(payloadByteLength + 4);

        let message: unknown;
        try {
          message = decodeChromeNativeMessageFrame(frame);
        } catch (error) {
          stdout.write(encodeChromeNativeMessageFrame(createNativeBridgeResponse({
            requestId: "unknown",
            result: "invalid",
            reason: readErrorMessage(error)
          })));
          continue;
        }

        const resolvedPolicy = typeof policy === "function" ? await policy() : policy;
        const response = await handleChromeNativeBridgeMessage(message, {
          payloadByteLength,
          policy: resolvedPolicy,
          dispatch
        });
        stdout.write(encodeChromeNativeMessageFrame(response));
      }
    }

    if (buffer.byteLength > 0) {
      stdout.write(encodeChromeNativeMessageFrame(createNativeBridgeResponse({
        requestId: "unknown",
        result: "invalid",
        reason: "incomplete_frame"
      })));
      return 1;
    }

    return 0;
  } catch (error) {
    stderr.write(`${readErrorMessage(error)}\n`);
    return 1;
  }
}

export async function handleChromeNativeBridgeMessage(
  message: unknown,
  input: ChromeNativeBridgeInput
): Promise<ChromeNativeBridgeResponse> {
  const requestId = readNativeRequestId(message);

  if (input.payloadByteLength > CHROME_NATIVE_MESSAGE_MAX_BYTES) {
    return createNativeBridgeResponse({
      requestId,
      result: "invalid",
      reason: "payload_too_large"
    });
  }

  const normalized = normalizeChromeNativeBridgeMessage(message);
  if (!normalized.ok) {
    return createNativeBridgeResponse({
      requestId,
      result: "invalid",
      reason: normalized.reason
    });
  }

  if (input.policy.state === "blocked") {
    return createNativeBridgeResponse({
      requestId: normalized.message.requestId,
      result: "blocked",
      reason: input.policy.reason ?? "app_policy_blocked",
      details: input.policy.details
    });
  }

  const browserMessage = normalizeChromeBrowserMessage(normalized.message);
  if (!browserMessage.ok) {
    return createNativeBridgeResponse({
      requestId: normalized.message.requestId,
      result: browserMessage.result,
      reason: browserMessage.reason
    });
  }

  try {
    return createNativeBridgeResponse({
      requestId: normalized.message.requestId,
      result: "accepted",
      ...(await input.dispatch(browserMessage.message))
    });
  } catch (error) {
    return createNativeBridgeResponse({
      requestId: normalized.message.requestId,
      result: "error",
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function createStatus(
  plan: ChromeNativeHostInstallPlan,
  state: ChromeNativeHostStatus["state"],
  reason: string
): ChromeNativeHostStatus {
  return {
    state,
    hostName: plan.hostName,
    manifestPath: plan.manifestPath,
    cliShimPath: plan.manifest.path,
    allowedOrigins: plan.manifest.allowed_origins,
    reason
  };
}

function normalizeChromeNativeBridgeMessage(message: unknown):
  | { ok: true; message: ChromeNativeBridgeMessage }
  | { ok: false; reason: string } {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { ok: false, reason: "message_not_object" };
  }

  const record = message as Record<string, unknown>;
  if (record.schemaVersion !== CHROME_NATIVE_MESSAGE_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported_schema_version" };
  }

  if (typeof record.requestId !== "string" || record.requestId.trim().length === 0) {
    return { ok: false, reason: "missing_request_id" };
  }

  if (typeof record.type !== "string" || !CHROME_NATIVE_BRIDGE_MESSAGE_TYPES.has(record.type)) {
    return { ok: false, reason: "unsupported_message_type" };
  }

  return {
    ok: true,
    message: {
      schemaVersion: CHROME_NATIVE_MESSAGE_SCHEMA_VERSION,
      type: record.type,
      requestId: record.requestId,
      ...(Object.hasOwn(record, "payload") ? { payload: record.payload } : {})
    }
  };
}

function readNativeRequestId(message: unknown): string {
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const requestId = (message as Record<string, unknown>).requestId;
    if (typeof requestId === "string" && requestId.trim().length > 0) {
      return requestId;
    }
  }
  return "unknown";
}

function createNativeBridgeResponse({
  requestId,
  result,
  reason,
  details,
  ...extra
}: {
  requestId: string;
  result: ChromeNativeBridgeResponse["result"];
  reason?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}): ChromeNativeBridgeResponse {
  return {
    schemaVersion: CHROME_NATIVE_MESSAGE_SCHEMA_VERSION,
    type: CHROME_NATIVE_RESPONSE_TYPE,
    requestId,
    result,
    ...(reason ? { reason } : {}),
    ...(details ? { details } : {}),
    ...extra
  };
}

function toBuffer(chunk: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk, "binary");
  }
  return Buffer.from(chunk);
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDefaultChromeNativeHostIo(): ChromeNativeHostIo {
  return {
    exists: (targetPath) => existsSync(targetPath),
    mkdir: async (targetPath) => {
      await mkdir(targetPath, { recursive: true });
    },
    readFile: async (targetPath) => readFile(targetPath, "utf8"),
    writeFile,
    rm: async (targetPath) => {
      await rm(targetPath, { force: true });
    }
  };
}
