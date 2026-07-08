import http from "node:http";
import { execFile } from "node:child_process";
import {
  mkdir as fsMkdir,
  readFile as fsReadFile,
  rename as fsRename,
  writeFile as fsWriteFile
} from "node:fs/promises";
import path from "node:path";
import type {
  DashboardDescriptor,
  DashboardDescriptorInput
} from "./dashboard-status.js";
import { createDashboardDescriptor } from "./dashboard-status.js";
import {
  createDashboardSnapshot,
  createDashboardWorkspaceSnapshot,
  type DashboardSnapshot,
  type DashboardWorkspaceIo,
  type DashboardSnapshotInput
} from "./dashboard-data.js";
import {
  DASHBOARD_EVIDENCE_SUMMARY_ENDPOINT,
  createDashboardEvidenceSummary
} from "./dashboard-evidence-summary.js";
import { createDashboardOperatorEvidence } from "./dashboard-operator-evidence.js";
import {
  applyChromeHostPolicyAction,
  createDefaultChromeHostPolicy,
  decideChromeHostPolicy,
  readChromeHostPolicyState,
  resetChromeHostPolicyState,
  writeChromeHostPolicyState,
  type ChromeHostPolicyAction,
  type ChromeHostPolicyResetIo
} from "./chrome-host-policy.js";
import { DASHBOARD_RUNTIME_SNAPSHOT_STALE_SECONDS } from "../shared/dashboard-runtime.js";
import {
  createRuntimeSnapshotStatePath,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION
} from "./runtime-snapshot.js";
import { readRecord } from "./record-utils.js";
import {
  readInitialAssistantAgentSettings,
  readAssistantAgentProviderStates,
  type AssistantAgentExecutableResolver,
  type AssistantAgentProviderState,
  type AssistantAgentSettings
} from "./assistant-agent.js";
import {
  createPersonalMemoryStore,
  createSkfiyApplicationSupportPath,
  type PersonalMemoryIo,
  type PersonalMemoryTarget
} from "./personal-memory.js";
import {
  createPendingPersonalMemoryStore
} from "./personal-memory-pending.js";
import {
  createPersonalSkillSettingsStore,
  isPersonalSkillId,
  type PersonalSkillSettingsIo
} from "./personal-skills.js";
import {
  createPlannerProviderSettingsStore,
  readInitialPlannerProviderSettings,
  summarizePlannerProviderSettings,
  type PlannerProviderSettings,
  type PlannerProviderSettingsUpdate
} from "./planner-provider-settings.js";
import { createChromeExtensionWakeUrl } from "./chrome-extension-reloader.js";

export interface DashboardHttpRequest {
  method?: string;
  url: string | URL;
  body?: string;
}

export interface DashboardHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface DashboardHttpResponseOptions extends DashboardDescriptorInput {
  rootDir?: string;
  homeDir?: string;
  chromeHostPolicyIo?: ChromeHostPolicyResetIo;
  chromeControlRunner?: DashboardChromeControlRunner;
  chromeControlPopupOpener?: DashboardChromeControlPopupOpener;
  chromeControlActivityStore?: DashboardChromeControlActivityStore;
  chromeControlActivityIo?: DashboardChromeControlActivityIo;
  assistantAgentSettings?: AssistantAgentSettings;
  assistantExecutableResolver?: AssistantAgentExecutableResolver;
  plannerProviderSettingsStore?: DashboardPlannerProviderSettingsStore;
  workspaceIo?: DashboardWorkspaceIo;
  createDescriptor?: (input: DashboardDescriptorInput) => DashboardDescriptor;
  createSnapshot?: (input: DashboardSnapshotInput) => DashboardSnapshot;
}

export interface DashboardChromeControlRunnerInput {
  binaryPath: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DashboardChromeControlRunnerResult {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export type DashboardChromeControlRunner = (
  input: DashboardChromeControlRunnerInput
) => Promise<DashboardChromeControlRunnerResult>;

export interface DashboardChromeControlPopupOpenInput {
  url: string;
  chromeAppName: string;
}

export type DashboardChromeControlPopupOpener = (
  input: DashboardChromeControlPopupOpenInput
) => Promise<void>;

export interface DashboardChromeControlActivityEntry {
  kind: "chrome-control-action";
  title: string;
  target: {
    app: string;
    host?: string;
    tabId?: number;
  };
  result: "verified" | "blocked" | "failed";
  blockerReason?: string | null;
  command: string;
  timestamp: string;
}

export interface DashboardChromeControlActivityStore {
  entries: DashboardChromeControlActivityEntry[];
}

export interface DashboardChromeControlActivityIo {
  exists?: (targetPath: string) => boolean | Promise<boolean>;
  mkdir: (targetPath: string) => Promise<void>;
  readFile: (targetPath: string) => Promise<string>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  rename?: (oldPath: string, newPath: string) => Promise<void>;
}

export interface DashboardPlannerProviderSettingsStore {
  get: () => PlannerProviderSettings;
  set: (update: PlannerProviderSettingsUpdate) => PlannerProviderSettings;
}

export interface DashboardServer {
  bind: {
    host: "127.0.0.1";
    port: number;
  };
  url: string;
  close: () => Promise<void>;
}

const DASHBOARD_EVENT_REFRESH_MS = 2_000;

export function createDashboardHttpResponse(
  request: DashboardHttpRequest,
  options: DashboardHttpResponseOptions = {}
): DashboardHttpResponse {
  const method = (request.method ?? "GET").toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    return textResponse(405, "Method Not Allowed\n", {
      allow: "GET, HEAD"
    });
  }

  const url = parseDashboardRequestUrl(request.url);
  const body = method === "HEAD" ? "" : undefined;

  if (url.pathname === "/descriptor.json") {
    const descriptor = createDescriptorFromOptions(options);

    return jsonResponse(descriptor, body);
  }

  if (url.pathname === "/snapshot.json") {
    const descriptor = createDescriptorFromOptions(options);
    const snapshot = createSnapshotFromOptions(options, descriptor);

    return jsonResponse(snapshot, body);
  }

  if (url.pathname === "/api/operator-evidence") {
    const descriptor = createDescriptorFromOptions(options);
    const snapshot = createSnapshotFromOptions(options, descriptor);
    const evidence = createDashboardOperatorEvidence({
      descriptor,
      snapshot
    });

    return jsonResponse(evidence, body);
  }

  if (url.pathname === DASHBOARD_EVIDENCE_SUMMARY_ENDPOINT) {
    const descriptor = createDescriptorFromOptions(options);
    const snapshot = createSnapshotFromOptions(options, descriptor);
    const evidence = createDashboardEvidenceSummary({
      descriptor,
      snapshot
    });

    return jsonResponse(evidence, body);
  }

  if (url.pathname === "/events") {
    const descriptor = createDescriptorFromOptions(options);
    const snapshot = createSnapshotFromOptions(options, descriptor);

    return eventStreamResponse(formatServerSentEvent("snapshot", snapshot), body);
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const descriptor = createDescriptorFromOptions(options);

    return htmlResponse(renderDashboardHtml(descriptor), body);
  }

  return textResponse(404, "Not Found\n", {}, body);
}

export async function startDashboardServer(
  options: DashboardHttpResponseOptions = {}
): Promise<DashboardServer> {
  const requestedPort = options.port ?? 0;
  const eventStreams = new Set<http.ServerResponse>();
  const serverOptions: DashboardHttpResponseOptions = {
    ...options,
    chromeControlActivityStore: options.chromeControlActivityStore ?? { entries: [] },
    assistantAgentSettings: options.assistantAgentSettings
      ?? readInitialAssistantAgentSettings(process.env, { cwd: options.rootDir }),
    plannerProviderSettingsStore: options.plannerProviderSettingsStore
      ?? createPlannerProviderSettingsStore(readInitialPlannerProviderSettings(process.env))
  };
  const server = http.createServer((request, response) => {
    void handleDashboardServerRequest({
      request,
      response,
      server,
      options: serverOptions,
      eventStreams
    }).catch((error) => {
      const dashboardResponse = jsonResponse({
        schemaVersion: 1,
        result: "error",
        error: error instanceof Error ? error.message : String(error)
      }, undefined, 500);

      response.writeHead(dashboardResponse.status, dashboardResponse.headers);
      response.end(dashboardResponse.body);
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, "127.0.0.1");
  });

  const port = readServerPort(server);

  return {
    bind: {
      host: "127.0.0.1",
      port
    },
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve, reject) => {
      for (const eventStream of eventStreams) {
        eventStream.end();
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    })
  };
}

async function handleDashboardServerRequest({
  request,
  response,
  server,
  options,
  eventStreams
}: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  server: http.Server;
  options: DashboardHttpResponseOptions;
  eventStreams: Set<http.ServerResponse>;
}): Promise<void> {
  const requestUrl = request.url ?? "/";
  const requestMethod = (request.method ?? "GET").toUpperCase();
  const url = parseDashboardRequestUrl(requestUrl);

  if (requestMethod === "GET" && url.pathname === "/events") {
    streamDashboardEvents(response, {
      ...options,
      port: readServerPort(server)
    }, eventStreams);
    return;
  }

  if (url.pathname === "/api/chrome-host-policy") {
    const body = requestMethod === "POST" ? await readRequestBody(request) : "";
    const dashboardResponse = await createDashboardChromeHostPolicyResponse({
      method: request.method,
      url: requestUrl,
      body
    }, {
      ...options,
      port: readServerPort(server)
    });

    response.writeHead(dashboardResponse.status, dashboardResponse.headers);
    response.end(dashboardResponse.body);
    return;
  }

  if (url.pathname === "/api/chrome-control-action") {
    const body = requestMethod === "POST" ? await readRequestBody(request) : "";
    const dashboardResponse = await createDashboardChromeControlActionResponse({
      method: request.method,
      url: requestUrl,
      body
    }, {
      ...options,
      port: readServerPort(server)
    });

    response.writeHead(dashboardResponse.status, dashboardResponse.headers);
    response.end(dashboardResponse.body);
    return;
  }

  if (url.pathname === "/api/provider-settings") {
    const body = requestMethod === "POST" ? await readRequestBody(request) : "";
    const dashboardResponse = await createDashboardProviderSettingsResponse({
      method: request.method,
      url: requestUrl,
      body
    }, {
      ...options,
      port: readServerPort(server)
    });

    response.writeHead(dashboardResponse.status, dashboardResponse.headers);
    response.end(dashboardResponse.body);
    return;
  }

  if (url.pathname === "/api/personal-memory") {
    const body = requestMethod === "POST" ? await readRequestBody(request) : "";
    const dashboardResponse = await createDashboardPersonalMemoryResponse({
      method: request.method,
      url: requestUrl,
      body
    }, {
      ...options,
      port: readServerPort(server)
    });

    response.writeHead(dashboardResponse.status, dashboardResponse.headers);
    response.end(dashboardResponse.body);
    return;
  }

  if (url.pathname === "/api/personal-skills") {
    const body = requestMethod === "POST" ? await readRequestBody(request) : "";
    const dashboardResponse = await createDashboardPersonalSkillsResponse({
      method: request.method,
      url: requestUrl,
      body
    }, {
      ...options,
      port: readServerPort(server)
    });

    response.writeHead(dashboardResponse.status, dashboardResponse.headers);
    response.end(dashboardResponse.body);
    return;
  }

  const builtDashboardResponse = await createBuiltDashboardHttpResponse({
    method: requestMethod,
    url,
    rootDir: options.rootDir
  });
  if (builtDashboardResponse) {
    response.writeHead(builtDashboardResponse.status, builtDashboardResponse.headers);
    response.end(builtDashboardResponse.body);
    return;
  }

  const dashboardResponse = createDashboardHttpResponse({
    method: request.method,
    url: requestUrl
  }, {
    ...options,
    port: readServerPort(server)
  });

  response.writeHead(dashboardResponse.status, dashboardResponse.headers);
  response.end(dashboardResponse.body);
}

async function createBuiltDashboardHttpResponse({
  method,
  url,
  rootDir
}: {
  method: string;
  url: URL;
  rootDir?: string;
}): Promise<DashboardHttpResponse | undefined> {
  if (!rootDir || (method !== "GET" && method !== "HEAD")) {
    return undefined;
  }

  const rendererDir = path.resolve(rootDir, "dist", "renderer");
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return readStaticDashboardFile({
      targetPath: path.join(rendererDir, "dashboard.html"),
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-store",
      method
    });
  }

  if (!url.pathname.startsWith("/assets/")) {
    return undefined;
  }

  const relativePath = decodeStaticDashboardPath(url.pathname);
  if (!relativePath) {
    return textResponse(400, "Bad Request\n", {}, method === "HEAD" ? "" : undefined);
  }

  const targetPath = path.resolve(rendererDir, relativePath);
  const rendererPrefix = `${rendererDir}${path.sep}`;
  if (!targetPath.startsWith(rendererPrefix)) {
    return textResponse(403, "Forbidden\n", {}, method === "HEAD" ? "" : undefined);
  }

  return readStaticDashboardFile({
    targetPath,
    contentType: readDashboardAssetContentType(targetPath),
    cacheControl: "public, max-age=31536000, immutable",
    method
  });
}

function decodeStaticDashboardPath(pathname: string): string | undefined {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.replace(/^\/+/, "");
  } catch {
    return undefined;
  }
}

async function readStaticDashboardFile({
  targetPath,
  contentType,
  cacheControl,
  method
}: {
  targetPath: string;
  contentType: string;
  cacheControl: string;
  method: string;
}): Promise<DashboardHttpResponse | undefined> {
  try {
    const body = await fsReadFile(targetPath, "utf8");
    return {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": cacheControl,
        "x-content-type-options": "nosniff"
      },
      body: method === "HEAD" ? "" : body
    };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return undefined;
    }
    throw error;
  }
}

function readDashboardAssetContentType(targetPath: string): string {
  const extension = path.extname(targetPath).toLowerCase();
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  return "application/octet-stream";
}

function createDescriptorFromOptions(
  options: DashboardHttpResponseOptions
): DashboardDescriptor {
  const {
    createDescriptor = createDashboardDescriptor,
    createSnapshot: _createSnapshot,
    rootDir: _rootDir,
    homeDir: _homeDir,
    chromeHostPolicyIo: _chromeHostPolicyIo,
    chromeControlRunner: _chromeControlRunner,
    chromeControlPopupOpener: _chromeControlPopupOpener,
    chromeControlActivityStore: _chromeControlActivityStore,
    chromeControlActivityIo: _chromeControlActivityIo,
    assistantAgentSettings: _assistantAgentSettings,
    assistantExecutableResolver: _assistantExecutableResolver,
    plannerProviderSettingsStore: _plannerProviderSettingsStore,
    workspaceIo: _workspaceIo,
    ...descriptorInput
  } = options;

  return createDescriptor(descriptorInput);
}

export async function createDashboardProviderSettingsResponse(
  request: DashboardHttpRequest,
  options: DashboardHttpResponseOptions = {}
): Promise<DashboardHttpResponse> {
  const method = (request.method ?? "GET").toUpperCase();
  const generatedAt = new Date().toISOString();

  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    return textResponse(405, "Method Not Allowed\n", {
      allow: "GET, HEAD, POST"
    });
  }

  const assistantSettings = options.assistantAgentSettings
    ?? readInitialAssistantAgentSettings(process.env, { cwd: options.rootDir });
  const assistantProviderStates = await readAssistantAgentProviderStates(assistantSettings, {
    resolveExecutable: options.assistantExecutableResolver
  });
  const plannerStore = options.plannerProviderSettingsStore
    ?? createPlannerProviderSettingsStore(readInitialPlannerProviderSettings(process.env));

  if (method === "POST") {
    const body = parseJsonObject(request.body ?? "");
    if (!body.ok) {
      return createDashboardProviderSettingsErrorResponse({
        generatedAt,
        code: "invalid-json",
        message: body.error
      });
    }

    const plannerUpdate = readDashboardPlannerProviderUpdate(body.value.planner);
    if (plannerUpdate) {
      plannerStore.set(plannerUpdate);
    }
  }

  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard provider settings",
    generatedAt,
    source: "dashboard",
    plannedMutation: method === "POST",
    executesSystemMutation: false,
    result: method === "POST" ? "configured" : "ok",
    providers: {
      assistant: summarizeAssistantAgentSettings({
        generatedAt,
        settings: assistantSettings,
        states: assistantProviderStates
      }),
      planner: summarizeDashboardPlannerProviderSettings(plannerStore.get())
    }
  }, method === "HEAD" ? "" : undefined);
}

function readDashboardPlannerProviderUpdate(
  value: unknown
): PlannerProviderSettingsUpdate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const update = value as Record<string, unknown>;
  return {
    mode: update.mode,
    externalProviderLabel: update.externalProviderLabel,
    externalEndpoint: update.externalEndpoint,
    externalApiKey: update.externalApiKey
  };
}

function summarizeAssistantAgentSettings({
  generatedAt,
  settings,
  states
}: {
  generatedAt: string;
  settings: AssistantAgentSettings;
  states: AssistantAgentProviderState[];
}): Record<string, unknown> {
  const selectedProvider = states.find((state) => state.selected);
  const configured = selectedProvider?.configured === true;
  const readiness = selectedProvider?.readiness ?? "unknown";
  return {
    provider: "assistant",
    mode: settings.mode,
    label: settings.mode === "codex"
      ? "Codex"
      : settings.mode === "claude-code"
        ? "Claude Code"
        : "Hermes",
    health: readiness === "ready" ? "available" : "unavailable",
    configured,
    readiness,
    selectedProvider: settings.mode,
    timeoutMs: settings.timeoutMs,
    lastHealthAt: generatedAt,
    providers: states.map(summarizeAssistantProviderState),
    ...(selectedProvider?.lastError ? { lastError: selectedProvider.lastError } : {})
  };
}

function summarizeAssistantProviderState(
  state: AssistantAgentProviderState
): Record<string, unknown> {
  return {
    provider: state.provider,
    id: state.id,
    label: state.label,
    selected: state.selected,
    configured: state.configured,
    readiness: state.readiness,
    binarySource: state.executableSource,
    ...(state.executablePath
      ? { binaryPath: summarizeAssistantExecutablePath(state.executablePath, state.executableSource, state.id) }
      : {}),
    ...(state.resolvedExecutablePath ? { resolvedBinaryPath: state.resolvedExecutablePath } : {}),
    ...(state.lastError ? { lastError: state.lastError } : {})
  };
}

function summarizeAssistantExecutablePath(
  executablePath: string,
  executableSource: string,
  providerId: AssistantAgentProviderState["id"]
): string {
  const trimmed = executablePath.trim();
  if (executableSource === "env" && shouldRedactAssistantExecutablePath(trimmed)) {
    if (providerId === "claude-code") {
      return "configured via SKFIY_CLAUDE_CODE_BIN";
    }
    if (providerId === "hermes") {
      return "configured via SKFIY_HERMES_BIN";
    }
    return "configured via SKFIY_CODEX_BIN";
  }

  return trimmed;
}

function shouldRedactAssistantExecutablePath(value: string): boolean {
  return /secret|token=|apikey|api_key|password/i.test(value);
}

function summarizeDashboardPlannerProviderSettings(
  settings: PlannerProviderSettings
): Record<string, unknown> {
  const summary = summarizePlannerProviderSettings(settings);

  return {
    provider: summary.provider,
    mode: summary.mode,
    label: summary.externalProviderLabel,
    health: summary.mode === "disabled" ? "unavailable" : "available",
    endpoint: summary.externalEndpoint,
    externalProviderLabel: summary.externalProviderLabel,
    externalEndpoint: summary.externalEndpoint,
    externalApiKeyConfigured: summary.externalApiKeyConfigured
  };
}

function createDashboardProviderSettingsErrorResponse({
  generatedAt,
  code,
  message
}: {
  generatedAt: string;
  code: string;
  message: string;
}): DashboardHttpResponse {
  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard provider settings",
    generatedAt,
    source: "dashboard",
    plannedMutation: false,
    executesSystemMutation: false,
    result: "error",
    error: {
      code,
      message
    }
  }, undefined, 400);
}

export async function createDashboardPersonalMemoryResponse(
  request: DashboardHttpRequest,
  options: DashboardHttpResponseOptions = {}
): Promise<DashboardHttpResponse> {
  const method = (request.method ?? "GET").toUpperCase();
  const generatedAt = new Date().toISOString();

  if (method !== "POST") {
    return textResponse(405, "Method Not Allowed\n", {
      allow: "POST"
    });
  }

  const homeDir = options.homeDir ?? options.workspaceIo?.homeDir?.() ?? process.env.HOME ?? "";
  if (!homeDir) {
    return createDashboardPersonalMemoryErrorResponse({
      generatedAt,
      code: "home-dir-required",
      message: "Home directory is required to locate personal memory."
    }, 503);
  }

  const body = parseJsonObject(request.body ?? "");
  if (!body.ok) {
    return createDashboardPersonalMemoryErrorResponse({
      generatedAt,
      code: "invalid-json",
      message: body.error
    });
  }

  const action = normalizeDashboardPersonalMemoryAction(body.value.action);
  if (!action) {
    return createDashboardPersonalMemoryErrorResponse({
      generatedAt,
      code: "unknown-action",
      message: "Personal memory action must be forget, approve-pending, or reject-pending."
    });
  }

  const memoryIo = createDashboardPersonalMemoryIo(options.workspaceIo);
  if (memoryIo === "readonly") {
    return createDashboardPersonalMemoryErrorResponse({
      generatedAt,
      code: "memory-store-readonly",
      message: "Personal memory store is not writable from this dashboard server."
    }, 503);
  }

  const baseDir = createSkfiyApplicationSupportPath(homeDir);
  const store = createPersonalMemoryStore({
    baseDir,
    ...(memoryIo ? { io: memoryIo } : {})
  });
  const pendingStore = createPendingPersonalMemoryStore({
    baseDir,
    ...(memoryIo ? { io: memoryIo } : {})
  });

  if (action === "approve-pending" || action === "reject-pending") {
    const pendingId = normalizeOptionalNonEmptyString(body.value.pendingId);
    if (!pendingId) {
      return createDashboardPersonalMemoryErrorResponse({
        generatedAt,
        code: "pending-id-required",
        message: "Personal memory pending action requires a pendingId."
      });
    }

    const actionResult = action === "approve-pending"
      ? pendingStore.approve(pendingId, store)
      : pendingStore.reject(pendingId);
    const snapshot = store.read();
    const pendingWriteCount = pendingStore.read().length;

    return jsonResponse({
      schemaVersion: 1,
      command: "dashboard personal memory",
      generatedAt,
      source: "dashboard",
      plannedMutation: true,
      executesSystemMutation: true,
      result: actionResult.result,
      ...(actionResult.result === "approved"
        ? {
          applied: actionResult.applied,
          ignored: actionResult.ignored,
          blocked: actionResult.blocked
        }
        : {}),
      pendingWriteCount,
      personalMemory: {
        userEntryCount: snapshot.userEntries.length,
        agentEntryCount: snapshot.agentEntries.length,
        ...(snapshot.usage ? { usage: snapshot.usage } : {}),
        ...(snapshot.latestUpdatedAt ? { latestUpdatedAt: snapshot.latestUpdatedAt } : {})
      }
    });
  }

  const target = normalizeDashboardPersonalMemoryTarget(body.value.target);
  if (!target) {
    return createDashboardPersonalMemoryErrorResponse({
      generatedAt,
      code: "target-required",
      message: "Personal memory forget requires target user or agent."
    });
  }

  const content = normalizeOptionalNonEmptyString(body.value.content);
  if (!content) {
    return createDashboardPersonalMemoryErrorResponse({
      generatedAt,
      code: "content-required",
      message: "Personal memory forget requires exact memory content."
    });
  }

  const result = store.applyOperations([
    {
      action: "remove",
      target,
      content
    }
  ]);
  const snapshot = store.read();

  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard personal memory",
    generatedAt,
    source: "dashboard",
    plannedMutation: true,
    executesSystemMutation: true,
    result: result.applied > 0 ? "forgotten" : "not-found",
    applied: result.applied,
    ignored: result.ignored,
    blocked: result.blocked.length,
    pendingWriteCount: pendingStore.read().length,
    personalMemory: {
      userEntryCount: snapshot.userEntries.length,
      agentEntryCount: snapshot.agentEntries.length,
      ...(snapshot.usage ? { usage: snapshot.usage } : {}),
      ...(snapshot.latestUpdatedAt ? { latestUpdatedAt: snapshot.latestUpdatedAt } : {})
    }
  });
}

export async function createDashboardPersonalSkillsResponse(
  request: DashboardHttpRequest,
  options: DashboardHttpResponseOptions = {}
): Promise<DashboardHttpResponse> {
  const method = (request.method ?? "GET").toUpperCase();
  const generatedAt = new Date().toISOString();

  if (method !== "POST") {
    return textResponse(405, "Method Not Allowed\n", {
      allow: "POST"
    });
  }

  const homeDir = options.homeDir ?? options.workspaceIo?.homeDir?.() ?? process.env.HOME ?? "";
  if (!homeDir) {
    return createDashboardPersonalSkillsErrorResponse({
      generatedAt,
      code: "home-dir-required",
      message: "Home directory is required to locate personal skill settings."
    }, 503);
  }

  const body = parseJsonObject(request.body ?? "");
  if (!body.ok) {
    return createDashboardPersonalSkillsErrorResponse({
      generatedAt,
      code: "invalid-json",
      message: body.error
    });
  }

  const action = normalizeDashboardPersonalSkillAction(body.value.action);
  if (!action) {
    return createDashboardPersonalSkillsErrorResponse({
      generatedAt,
      code: "unknown-action",
      message: "Personal skill action must be mute or unmute."
    });
  }

  const skillId = normalizeDashboardPersonalSkillId(body.value.skillId);
  if (!skillId) {
    return createDashboardPersonalSkillsErrorResponse({
      generatedAt,
      code: "unknown-skill",
      message: "Personal skill action requires a known skill id."
    });
  }

  const settingsIo = createDashboardPersonalSkillSettingsIo(options.workspaceIo);
  if (settingsIo === "readonly") {
    return createDashboardPersonalSkillsErrorResponse({
      generatedAt,
      code: "personal-skill-store-readonly",
      message: "Personal skill settings are not writable from this dashboard server."
    }, 503);
  }

  const store = createPersonalSkillSettingsStore({
    baseDir: createSkfiyApplicationSupportPath(homeDir),
    ...(settingsIo ? { io: settingsIo } : {})
  });
  const mutation = store.setMuted(skillId, action === "mute");

  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard personal skills",
    generatedAt,
    source: "dashboard",
    plannedMutation: true,
    executesSystemMutation: true,
    result: mutation.result,
    personalSkills: {
      disabledSkillIds: mutation.settings.disabledSkillIds,
      mutedSkillCount: mutation.settings.disabledSkillIds.length,
      ...(mutation.settings.updatedAt ? { updatedAt: mutation.settings.updatedAt } : {})
    }
  });
}

function normalizeDashboardPersonalSkillAction(value: unknown): "mute" | "unmute" | undefined {
  return value === "mute" || value === "unmute" ? value : undefined;
}

function normalizeDashboardPersonalSkillId(value: unknown): string | undefined {
  return isPersonalSkillId(value) ? value : undefined;
}

function createDashboardPersonalSkillSettingsIo(
  workspaceIo: DashboardWorkspaceIo | undefined
): PersonalSkillSettingsIo | "readonly" | undefined {
  if (!workspaceIo) {
    return undefined;
  }
  if (!workspaceIo.writeFile) {
    return "readonly";
  }

  return {
    exists: workspaceIo.exists,
    mkdir: () => undefined,
    readFile: workspaceIo.readFile,
    writeFile: workspaceIo.writeFile
  };
}

function createDashboardPersonalSkillsErrorResponse({
  generatedAt,
  code,
  message
}: {
  generatedAt: string;
  code: string;
  message: string;
}, status = 400): DashboardHttpResponse {
  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard personal skills",
    generatedAt,
    source: "dashboard",
    plannedMutation: false,
    executesSystemMutation: false,
    result: "error",
    error: {
      code,
      message
    }
  }, undefined, status);
}

function normalizeDashboardPersonalMemoryAction(
  value: unknown
): "forget" | "approve-pending" | "reject-pending" | undefined {
  return value === "forget" || value === "approve-pending" || value === "reject-pending"
    ? value
    : undefined;
}

function normalizeDashboardPersonalMemoryTarget(value: unknown): PersonalMemoryTarget | undefined {
  return value === "user" || value === "agent" ? value : undefined;
}

function createDashboardPersonalMemoryIo(
  workspaceIo: DashboardWorkspaceIo | undefined
): PersonalMemoryIo | "readonly" | undefined {
  if (!workspaceIo) {
    return undefined;
  }
  if (!workspaceIo.writeFile) {
    return "readonly";
  }

  return {
    exists: workspaceIo.exists,
    mkdir: () => undefined,
    readFile: workspaceIo.readFile,
    stat: workspaceIo.stat,
    writeFile: workspaceIo.writeFile
  };
}

function createDashboardPersonalMemoryErrorResponse({
  generatedAt,
  code,
  message
}: {
  generatedAt: string;
  code: string;
  message: string;
}, status = 400): DashboardHttpResponse {
  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard personal memory",
    generatedAt,
    source: "dashboard",
    plannedMutation: false,
    executesSystemMutation: false,
    result: "error",
    error: {
      code,
      message
    }
  }, undefined, status);
}

export async function createDashboardChromeHostPolicyResponse(
  request: DashboardHttpRequest,
  options: DashboardHttpResponseOptions = {}
): Promise<DashboardHttpResponse> {
  const method = (request.method ?? "GET").toUpperCase();
  const generatedAt = new Date().toISOString();

  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    return textResponse(405, "Method Not Allowed\n", {
      allow: "GET, HEAD, POST"
    });
  }

  const homeDir = options.homeDir ?? process.env.HOME ?? "";
  if (!homeDir) {
    return jsonResponse({
      schemaVersion: 1,
      command: "dashboard chrome policy",
      generatedAt,
      executesSystemMutation: false,
      result: "error",
      error: {
        code: "home-dir-required",
        message: "Home directory is required to locate the Chrome host policy state."
      }
    }, method === "HEAD" ? "" : undefined, 503);
  }

  if (method === "GET" || method === "HEAD") {
    const hostPolicy = await readChromeHostPolicyState({
      homeDir,
      io: options.chromeHostPolicyIo
    });

    return jsonResponse({
      schemaVersion: 1,
      command: "dashboard chrome policy show",
      generatedAt,
      executesSystemMutation: false,
      hostPolicy
    }, method === "HEAD" ? "" : undefined);
  }

  const body = parseJsonObject(request.body ?? "");
  if (!body.ok) {
    return createDashboardChromePolicyErrorResponse({
      generatedAt,
      code: "invalid-json",
      message: body.error
    });
  }

  const action = normalizeDashboardChromePolicyAction(body.value.action);
  if (!action) {
    return createDashboardChromePolicyErrorResponse({
      generatedAt,
      code: "unknown-action",
      message: "Chrome host policy action must be always-allow, allow-current-turn, block, ask, or reset."
    });
  }

  if (action === "reset") {
    const hostPolicy = await resetChromeHostPolicyState({
      homeDir,
      io: options.chromeHostPolicyIo
    });

    return jsonResponse({
      schemaVersion: 1,
      command: "dashboard chrome policy reset",
      generatedAt,
      source: "dashboard",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "reset",
      hostPolicy
    });
  }

  const host = normalizeDashboardChromePolicyHost(body.value.host);
  if (!host) {
    return createDashboardChromePolicyErrorResponse({
      generatedAt,
      code: "host-required",
      message: "Chrome host policy set requires a valid host."
    });
  }

  const current = await readChromeHostPolicyState({
    homeDir,
    io: options.chromeHostPolicyIo
  });
  const policy = applyChromeHostPolicyAction(current.policy, {
    action,
    host
  });
  const hostPolicy = await writeChromeHostPolicyState({
    homeDir,
    policy,
    io: options.chromeHostPolicyIo
  });

  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard chrome policy set",
    generatedAt,
    source: "dashboard",
    plannedMutation: true,
    executesSystemMutation: true,
    result: "configured",
    action,
    host,
    hostPolicy
  });
}

export async function createDashboardChromeControlActionResponse(
  request: DashboardHttpRequest,
  options: DashboardHttpResponseOptions = {}
): Promise<DashboardHttpResponse> {
  const method = (request.method ?? "GET").toUpperCase();
  const generatedAt = new Date().toISOString();

  if (method !== "POST") {
    return textResponse(405, "Method Not Allowed\n", {
      allow: "POST"
    });
  }

  const body = parseJsonObject(request.body ?? "");
  if (!body.ok) {
    return createDashboardChromeControlErrorResponse({
      generatedAt,
      code: "invalid-json",
      message: body.error
    });
  }

  const action = normalizeDashboardChromeControlAction(body.value.action);
  if (!action) {
    return createDashboardChromeControlErrorResponse({
      generatedAt,
      code: "unknown-action",
      message: "Chrome control action must be open-popup, observe, screenshot, click, fill, submit, or scroll."
    });
  }

  const extensionId = normalizeDashboardChromeExtensionId(body.value.extensionId);
  if (!extensionId) {
    return createDashboardChromeControlErrorResponse({
      generatedAt,
      code: "extension-id-required",
      message: "Chrome control action requires a valid extension id."
    });
  }

  const targetTabId = normalizeDashboardChromeTargetTabId(body.value.targetTabId);
  if (targetTabId === undefined) {
    return createDashboardChromeControlErrorResponse({
      generatedAt,
      code: "target-tab-id-required",
      message: "Chrome control action requires a numeric target tab id."
    });
  }

  const selector = normalizeOptionalNonEmptyString(body.value.selector);
  const text = normalizeOptionalNonEmptyString(body.value.text);
  const dy = normalizeDashboardChromeScrollDelta(body.value.dy);
  const chromeAppName = normalizeDashboardChromeAppName(body.value.chromeAppName)
    ?? readDashboardChromeAppNameFromEnv(process.env);
  const argumentError = validateDashboardChromeControlArguments({
    action,
    selector,
    text,
    dy
  });
  if (argumentError) {
    return createDashboardChromeControlErrorResponse({
      generatedAt,
      code: argumentError.code,
      message: argumentError.message
    });
  }

  const descriptor = createDescriptorFromOptions(options);
  const snapshot = createSnapshotFromOptions(options, descriptor);
  const pageControl = readDashboardChromePageControl(snapshot);
  const eligibility = validateDashboardChromeControlEligibility({
    action,
    pageControl,
    targetTabId
  });
  if (!eligibility.ok) {
    return createDashboardChromeControlErrorResponse({
      generatedAt,
      code: eligibility.code,
      message: eligibility.message
    });
  }

  const activeTab = readRecord(pageControl.activeTab) ?? {};
  if (action === "open-popup") {
    const wakeUrl = createChromeExtensionWakeUrl(extensionId, { targetTabId });
    const opener = options.chromeControlPopupOpener ?? openDashboardChromeControlPopup;
    let result: DashboardChromeControlActivityEntry["result"] = "verified";
    let blockerReason: string | null = null;
    try {
      await opener({ url: wakeUrl, chromeAppName });
    } catch (error) {
      result = "failed";
      blockerReason = readErrorMessage(error);
    }
    const command = formatDashboardChromeControlCommand("open", ["-a", chromeAppName, wakeUrl]);
    const activityEntry = createDashboardChromeControlActivityEntry({
      action,
      chromeAppName,
      host: readDashboardChromeHost(activeTab),
      targetTabId,
      result,
      blockerReason,
      command,
      generatedAt
    });

    await persistDashboardChromeControlActivity({
      homeDir: options.homeDir ?? process.env.HOME,
      entry: activityEntry,
      io: options.chromeControlActivityIo
    });
    appendDashboardChromeControlActivity(options.chromeControlActivityStore, activityEntry);

    return jsonResponse({
      schemaVersion: 1,
      command: "dashboard chrome control action",
      generatedAt,
      source: "dashboard",
      plannedMutation: true,
      executesSystemMutation: true,
      result,
      action,
      chromeAppName,
      targetTabId,
      wakeUrl,
      launchedCommand: command,
      blockerReason,
      activityEntry
    }, undefined, result === "failed" ? 502 : 200);
  }

  const rootDir = options.rootDir ?? process.cwd();
  const binaryPath = path.join(rootDir, "dist", "skfiy");
  const args = createDashboardChromeControlArgs({
    action,
    extensionId,
    targetTabId,
    selector,
    text,
    dy
  });
  const runner = options.chromeControlRunner ?? runDashboardChromeControlCommand;
  const runResult = await runner({
    binaryPath,
    args,
    env: createDashboardChromeControlEnv(process.env, chromeAppName)
  });
  const parsed = parseDashboardChromeControlStdout(runResult.stdout);
  const result = readDashboardChromeControlResult(runResult, parsed);
  const blockerReason = readDashboardChromeControlBlockerReason(runResult, parsed);
  const activityEntry = createDashboardChromeControlActivityEntry({
    action,
    chromeAppName,
    host: readDashboardChromeHost(activeTab),
    targetTabId,
    result,
    blockerReason,
    command: formatDashboardChromeControlCommand(binaryPath, args),
    generatedAt
  });

  await persistDashboardChromeControlActivity({
    homeDir: options.homeDir ?? process.env.HOME,
    entry: activityEntry,
    io: options.chromeControlActivityIo
  });
  appendDashboardChromeControlActivity(options.chromeControlActivityStore, activityEntry);

  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard chrome control action",
    generatedAt,
    source: "dashboard",
    plannedMutation: true,
    executesSystemMutation: true,
    result,
    action,
    chromeAppName,
    targetTabId,
    launchedCommand: activityEntry.command,
    stdoutSummary: createDashboardChromeControlStdoutSummary(parsed),
    blockerReason,
    activityEntry
  }, undefined, result === "failed" ? 502 : 200);
}

function createSnapshotFromOptions(
  options: DashboardHttpResponseOptions,
  descriptor: DashboardDescriptor
): DashboardSnapshot {
  const { createSnapshot, rootDir, workspaceIo } = options;
  const providerSettings = createDashboardSnapshotProviderSettings(options);
  let snapshot: DashboardSnapshot;

  if (createSnapshot) {
    snapshot = createSnapshot({ descriptor, providerSettings });
  } else if (rootDir) {
    snapshot = createDashboardWorkspaceSnapshot({
      rootDir,
      descriptor,
      io: workspaceIo,
      providerSettings
    });
  } else {
    snapshot = createDashboardSnapshot({ descriptor, providerSettings });
  }

  return attachDashboardChromeControlActivity(snapshot, options.chromeControlActivityStore);
}

function createDashboardSnapshotProviderSettings(
  options: DashboardHttpResponseOptions
): DashboardSnapshotInput["providerSettings"] {
  return {
    assistant: options.assistantAgentSettings
      ?? readInitialAssistantAgentSettings(process.env, { cwd: options.rootDir }),
    planner: options.plannerProviderSettingsStore?.get()
      ?? readInitialPlannerProviderSettings(process.env)
  };
}

function parseDashboardRequestUrl(url: string | URL): URL {
  if (url instanceof URL) {
    return url;
  }

  return new URL(url, "http://127.0.0.1");
}

function readServerPort(server: http.Server): number {
  const address = server.address();

  if (!address || typeof address === "string") {
    return 0;
  }

  return address.port;
}

function jsonResponse(
  value: unknown,
  bodyOverride?: string,
  status = 200
): DashboardHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: bodyOverride ?? `${JSON.stringify(value)}\n`
  };
}

function eventStreamResponse(body: string, bodyOverride?: string): DashboardHttpResponse {
  return {
    status: 200,
    headers: createEventStreamHeaders(),
    body: bodyOverride ?? body
  };
}

function createEventStreamHeaders(): Record<string, string> {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "connection": "keep-alive"
  };
}

function htmlResponse(html: string, bodyOverride?: string): DashboardHttpResponse {
  return {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    },
    body: bodyOverride ?? html
  };
}

function textResponse(
  status: number,
  text: string,
  headers: Record<string, string> = {},
  bodyOverride?: string
): DashboardHttpResponse {
  return {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...headers
    },
    body: bodyOverride ?? text
  };
}

function streamDashboardEvents(
  response: http.ServerResponse,
  options: DashboardHttpResponseOptions,
  eventStreams: Set<http.ServerResponse>
): void {
  eventStreams.add(response);
  response.writeHead(200, createEventStreamHeaders());

  const writeSnapshot = () => {
    const descriptor = createDescriptorFromOptions(options);
    const snapshot = createSnapshotFromOptions(options, descriptor);

    response.write(formatServerSentEvent("snapshot", snapshot));
  };
  const refresh = setInterval(writeSnapshot, DASHBOARD_EVENT_REFRESH_MS);

  refresh.unref();
  response.on("close", () => {
    clearInterval(refresh);
    eventStreams.delete(response);
  });
  writeSnapshot();
}

function formatServerSentEvent(eventName: string, value: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(value)}\n\n`;
}

function renderDashboardHtml(descriptor: DashboardDescriptor): string {
  const panels = descriptor.panels
    .map((panel) => {
      const signals = panel.signals
        .map((signal) => `<span>${escapeHtml(signal)}</span>`)
        .join("");

      return [
        `<section class="panel" data-panel-id="${escapeHtml(panel.id)}">`,
        '<div class="panel-heading">',
        `<h2>${escapeHtml(panel.title)}</h2>`,
        `<span class="panel-status" data-panel-status="${escapeHtml(panel.id)}">Waiting</span>`,
        "</div>",
        `<div class="signals">${signals}</div>`,
        `<div class="panel-body" data-panel-body="${escapeHtml(panel.id)}">`,
        '<p class="muted">Loading snapshot...</p>',
        "</div>",
        "</section>"
      ].join("");
    })
    .join("");
  const operatorEvidencePanel = [
    '<section class="panel operator-evidence" data-operator-evidence-panel>',
    '<div class="panel-heading">',
    "<h2>Operator evidence</h2>",
    '<span class="panel-status" data-operator-evidence-status>Waiting</span>',
    "</div>",
    '<div class="panel-body" data-operator-evidence-body>',
    '<p class="muted">Loading operator evidence...</p>',
    "</div>",
    "</section>"
  ].join("");
  const evidenceSummaryPanel = [
    '<section class="panel evidence-summary" data-evidence-summary-panel>',
    '<div class="panel-heading">',
    "<h2>Evidence summary</h2>",
    '<span class="panel-status" data-evidence-summary-status>Waiting</span>',
    "</div>",
    '<div class="panel-body" data-evidence-summary-body>',
    '<p class="muted">Loading evidence summary...</p>',
    "</div>",
    "</section>"
  ].join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>skfiy Dashboard</title>",
    "<style>",
    ":root{color-scheme:light;background:#f6f7f9;color:#172026;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}",
    "body{margin:0;line-height:1.45;background:#f6f7f9}",
    "main{max-width:1180px;margin:0 auto;padding:24px}",
    ".topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}",
    "h1,h2{margin:0;font-weight:650;letter-spacing:0}",
    "h1{font-size:28px}",
    "h2{font-size:16px}",
    ".links{display:flex;gap:12px;flex-wrap:wrap}",
    "a{color:#0f766e;text-decoration:none}",
    ".snapshot-meta,.muted{color:#5b6673;font-size:13px}",
    ".operator-evidence,.evidence-summary{margin-bottom:12px}",
    ".operator-evidence .panel-body,.evidence-summary .panel-body{margin-top:8px}",
    ".user-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px}",
    ".user-panel{border:1px solid #d6dbe1;background:#fff;border-radius:8px;padding:14px;min-width:0}",
    ".user-panel[data-user-tone=\"ok\"]{border-color:#a6d9c4;background:#fbfffd}",
    ".user-panel[data-user-tone=\"warning\"]{border-color:#f5d27a;background:#fffdf5}",
    ".user-panel[data-user-tone=\"error\"]{border-color:#ffc6bd;background:#fffafa}",
    ".user-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}",
    ".user-panel-heading h2{font-size:15px}",
    ".user-status{font-size:12px;color:#425466;background:#eef2f5;border:1px solid #d6dbe1;border-radius:999px;padding:2px 8px;white-space:nowrap}",
    ".user-panel[data-user-tone=\"ok\"] .user-status{background:#ebf8f2;border-color:#a6d9c4}",
    ".user-panel[data-user-tone=\"warning\"] .user-status{background:#fff8e5;border-color:#f5d27a}",
    ".user-panel[data-user-tone=\"error\"] .user-status{background:#fff2f0;border-color:#ffc6bd}",
    ".advanced-diagnostics{margin-top:14px}",
    ".advanced-diagnostics summary{cursor:pointer;color:#425466;font-weight:650;margin:0 0 12px}",
    ".dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}",
    ".panel{border:1px solid #d6dbe1;background:#fff;border-radius:8px;padding:14px;min-width:0}",
    ".panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}",
    ".panel-heading h2{min-width:0;overflow-wrap:anywhere}",
    ".panel-status{font-size:12px;color:#425466;background:#eef2f5;border:1px solid #d6dbe1;border-radius:999px;padding:2px 8px;white-space:nowrap}",
    ".signals{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}",
    ".signals span{font-size:12px;color:#425466;background:#f2f4f7;border-radius:999px;padding:2px 7px}",
    ".metric-list{display:grid;grid-template-columns:minmax(96px,140px) minmax(0,1fr);gap:7px 10px;margin:0}",
    ".metric-list dt{color:#66727f;font-size:12px}",
    ".metric-list dd{margin:0;color:#172026;font-size:13px;min-width:0;overflow-wrap:anywhere}",
    ".event-list{margin:0;padding-left:18px;color:#172026;font-size:13px}",
    ".event-list li{margin:5px 0;min-width:0;overflow-wrap:anywhere}",
    ".alert-groups{display:grid;gap:8px}",
    ".alert-band{border:1px solid #d6dbe1;border-radius:8px;padding:10px;background:#f8fafb}",
    ".alert-band h3{margin:0 0 6px;font-size:13px;font-weight:650;color:#172026;letter-spacing:0}",
    ".alert-band[data-alert-severity=\"error\"]{background:#fff2f0;border-color:#ffc6bd}",
    ".alert-band[data-alert-severity=\"warning\"]{background:#fff8e5;border-color:#f5d27a}",
    ".alert-band[data-alert-severity=\"info\"]{background:#f2f4f7;border-color:#d6dbe1}",
    ".alert-band .event-list{padding-left:16px}",
    ".evidence-lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}",
    ".evidence-lane{border:1px solid #d6dbe1;border-radius:8px;background:#f8fafb;padding:10px}",
    ".evidence-lane h3{margin:0 0 6px;font-size:13px;font-weight:650;color:#172026;letter-spacing:0}",
    ".evidence-lane p{margin:0;color:#5b6673;font-size:12px}",
    ".evidence-lane .metric-list{margin-top:8px;grid-template-columns:minmax(90px,120px) minmax(0,1fr)}",
    ".evidence-lane .event-list{margin-top:8px;padding-left:16px;font-size:12px}",
    ".evidence-commands{display:grid;gap:6px;margin-top:8px}",
    ".evidence-command{display:grid;gap:3px;border-top:1px solid rgba(66,84,102,.16);padding-top:6px}",
    ".evidence-command strong{font-size:11px;color:#425466;text-transform:uppercase;letter-spacing:0}",
    ".evidence-command code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",monospace;font-size:11px;color:#172026;background:rgba(255,255,255,.58);border:1px solid rgba(66,84,102,.18);border-radius:6px;padding:5px 6px;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".evidence-lane[data-evidence-state=\"ready\"]{background:#ebf8f2;border-color:#a6d9c4}",
    ".evidence-lane[data-evidence-state=\"needs-evidence\"]{background:#fff8e5;border-color:#f5d27a}",
    ".evidence-lane[data-evidence-state=\"blocked\"]{background:#fff2f0;border-color:#ffc6bd}",
    ".policy-controls{display:grid;gap:8px;margin-top:12px;border-top:1px solid #edf0f2;padding-top:12px}",
    ".policy-host-control{display:grid;gap:4px;color:#66727f;font-size:12px}",
    ".policy-host-control input{box-sizing:border-box;width:100%;border:1px solid #c8d0d8;border-radius:6px;padding:7px 8px;color:#172026;background:#fff;font:inherit;font-size:13px}",
    ".policy-actions{display:flex;flex-wrap:wrap;gap:6px}",
    ".policy-actions button{border:1px solid #c8d0d8;border-radius:6px;background:#fff;color:#172026;font:inherit;font-size:12px;padding:6px 8px;cursor:pointer}",
    ".policy-actions button:hover{background:#f2f4f7}",
    ".policy-actions button:disabled{cursor:progress;opacity:.58}",
    ".policy-feedback{margin:0;color:#5b6673;font-size:12px;min-height:18px}",
    ".chrome-control-launchers{display:grid;gap:8px;margin-top:12px;border-top:1px solid #edf0f2;padding-top:12px}",
    ".chrome-control-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}",
    ".chrome-control-fields input{box-sizing:border-box;width:100%;border:1px solid #c8d0d8;border-radius:6px;padding:7px 8px;color:#172026;background:#fff;font:inherit;font-size:12px}",
    ".chrome-control-actions{display:flex;flex-wrap:wrap;gap:6px}",
    ".chrome-control-actions button{border:1px solid #c8d0d8;border-radius:6px;background:#fff;color:#172026;font:inherit;font-size:12px;padding:6px 8px;cursor:pointer}",
    ".chrome-control-actions button:hover{background:#f2f4f7}",
    ".chrome-control-actions button:disabled{cursor:progress;opacity:.58}",
    ".chrome-control-feedback{margin:0;color:#5b6673;font-size:12px;min-height:18px}",
    ".state-error{background:#fff2f0;border-color:#ffc6bd}",
    ".state-warning{background:#fff8e5;border-color:#f5d27a}",
    ".state-ok{background:#ebf8f2;border-color:#a6d9c4}",
    "</style>",
    "</head>",
    "<body>",
    "<main data-dashboard-root>",
    '<div class="topbar">',
    "<div>",
    "<h1>skfiy Dashboard</h1>",
    '<p class="snapshot-meta" data-snapshot-state>Loading snapshot...</p>',
    "</div>",
    '<nav class="links" aria-label="Dashboard JSON endpoints">',
    '<a href="/descriptor.json">Descriptor JSON</a>',
    '<a href="/snapshot.json">Snapshot JSON</a>',
    `<a href="${DASHBOARD_EVIDENCE_SUMMARY_ENDPOINT}">Evidence Summary</a>`,
    '<a href="/api/operator-evidence">Operator Evidence</a>',
    "</nav>",
    "</div>",
    '<div class="user-grid" aria-label="skfiy user dashboard">',
    '<section class="user-panel" data-user-panel="home"><div class="user-panel-heading"><h2>Home</h2><span class="user-status" data-user-panel-status="home">Waiting</span></div><div class="panel-body" data-user-panel-body="home"><p class="muted">Loading assistant state...</p></div></section>',
    '<section class="user-panel" data-user-panel="approvals"><div class="user-panel-heading"><h2>Approvals</h2><span class="user-status" data-user-panel-status="approvals">Waiting</span></div><div class="panel-body" data-user-panel-body="approvals"><p class="muted">Loading approvals...</p></div></section>',
    '<section class="user-panel" data-user-panel="activity"><div class="user-panel-heading"><h2>Activity</h2><span class="user-status" data-user-panel-status="activity">Waiting</span></div><div class="panel-body" data-user-panel-body="activity"><p class="muted">Loading recent activity...</p></div></section>',
    '<section class="user-panel" data-user-panel="apps-sites"><div class="user-panel-heading"><h2>Apps and Sites</h2><span class="user-status" data-user-panel-status="apps-sites">Waiting</span></div><div class="panel-body" data-user-panel-body="apps-sites"><p class="muted">Loading access state...</p></div></section>',
    '<section class="user-panel" data-user-panel="permissions"><div class="user-panel-heading"><h2>Permissions</h2><span class="user-status" data-user-panel-status="permissions">Waiting</span></div><div class="panel-body" data-user-panel-body="permissions"><p class="muted">Loading permissions...</p></div></section>',
    '<section class="user-panel" data-user-panel="agents"><div class="user-panel-heading"><h2>Agents</h2><span class="user-status" data-user-panel-status="agents">Waiting</span></div><div class="panel-body" data-user-panel-body="agents"><p class="muted">Loading supervision...</p></div></section>',
    "</div>",
    '<details class="advanced-diagnostics">',
    "<summary>Advanced Diagnostics</summary>",
    evidenceSummaryPanel,
    operatorEvidencePanel,
    '<div class="dashboard-grid">',
    panels,
    "</div>",
    "</details>",
    "</main>",
    renderDashboardScript(),
    "</body>",
    "</html>"
  ].join("");
}

function renderDashboardScript(): string {
  return [
    "<script>",
    "(() => {",
    '  const snapshotState = document.querySelector("[data-snapshot-state]");',
    "  let chromeHostPolicyDraftHost = \"\";",
    "  let chromeHostPolicyFeedback = \"\";",
    `  const RUNTIME_SNAPSHOT_STALE_SECONDS = ${DASHBOARD_RUNTIME_SNAPSHOT_STALE_SECONDS};`,
    "",
    "  function panelBody(id) {",
    '    return document.querySelector(`[data-panel-body="${id}"]`);',
    "  }",
    "",
    "  function panelStatus(id) {",
    '    return document.querySelector(`[data-panel-status="${id}"]`);',
    "  }",
    "",
    "  function setStatus(id, label, kind = \"\") {",
    "    const status = panelStatus(id);",
    "    if (!status) return;",
    "    status.textContent = label;",
    "    status.classList.toggle(\"state-ok\", kind === \"ok\");",
    "    status.classList.toggle(\"state-warning\", kind === \"warning\");",
    "    status.classList.toggle(\"state-error\", kind === \"error\");",
    "  }",
    "",
    "  function userPanelBody(id) {",
    '    return document.querySelector(`[data-user-panel-body="${id}"]`);',
    "  }",
    "",
    "  function userPanelStatus(id) {",
    '    return document.querySelector(`[data-user-panel-status="${id}"]`);',
    "  }",
    "",
    "  function setUserStatus(id, label, kind = \"\") {",
    "    const status = userPanelStatus(id);",
    '    const panel = document.querySelector(`[data-user-panel="${id}"]`);',
    "    if (status) status.textContent = label;",
    "    if (panel) panel.setAttribute(\"data-user-tone\", kind || \"neutral\");",
    "  }",
    "",
    "  function setUserRows(id, rows, statusLabel = \"Loaded\", statusKind = \"ok\") {",
    "    const target = userPanelBody(id);",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    target.append(createMetricList(rows));",
    "    setUserStatus(id, statusLabel, statusKind);",
    "  }",
    "",
    "  function setUserList(id, items, emptyText, statusLabel = \"Loaded\", statusKind = \"ok\") {",
    "    const target = userPanelBody(id);",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    if (items.length === 0) {",
    "      const empty = document.createElement(\"p\");",
    "      empty.className = \"muted\";",
    "      empty.textContent = emptyText;",
    "      target.append(empty);",
    "    } else {",
    "      const list = document.createElement(\"ul\");",
    "      list.className = \"event-list\";",
    "      for (const item of items) {",
    "        const entry = document.createElement(\"li\");",
    "        entry.textContent = item;",
    "        list.append(entry);",
    "      }",
    "      target.append(list);",
    "    }",
    "    setUserStatus(id, statusLabel, statusKind);",
    "  }",
    "",
    "  function setOperatorEvidenceStatus(label, kind = \"\") {",
    "    const status = document.querySelector(\"[data-operator-evidence-status]\");",
    "    if (!status) return;",
    "    status.textContent = label;",
    "    status.classList.toggle(\"state-ok\", kind === \"ok\");",
    "    status.classList.toggle(\"state-warning\", kind === \"warning\");",
    "    status.classList.toggle(\"state-error\", kind === \"error\");",
    "  }",
    "",
    "  function setEvidenceSummaryStatus(label, kind = \"\") {",
    "    const status = document.querySelector(\"[data-evidence-summary-status]\");",
    "    if (!status) return;",
    "    status.textContent = label;",
    "    status.classList.toggle(\"state-ok\", kind === \"ok\");",
    "    status.classList.toggle(\"state-warning\", kind === \"warning\");",
    "    status.classList.toggle(\"state-error\", kind === \"error\");",
    "  }",
    "",
    "  function formatValue(value) {",
    "    if (value === undefined || value === null || value === \"\") return \"-\";",
    "    if (Array.isArray(value)) return value.length === 0 ? \"none\" : value.join(\", \");",
    "    if (typeof value === \"boolean\") return value ? \"yes\" : \"no\";",
    "    if (typeof value === \"object\") return JSON.stringify(value);",
    "    return String(value);",
    "  }",
    "",
    "  function row(label, value) {",
    "    return [label, formatValue(value)];",
    "  }",
    "",
    "  function readArray(value) {",
    "    return Array.isArray(value) ? value : [];",
    "  }",
    "",
    "  function createMetricList(rows) {",
    "    const list = document.createElement(\"dl\");",
    "    list.className = \"metric-list\";",
    "    for (const [label, value] of rows) {",
    "      const term = document.createElement(\"dt\");",
    "      term.textContent = label;",
    "      const description = document.createElement(\"dd\");",
    "      description.textContent = value;",
    "      list.append(term, description);",
    "    }",
    "    return list;",
    "  }",
    "",
    "  function setRows(id, rows, statusLabel = \"Loaded\", statusKind = \"ok\") {",
    "    const target = panelBody(id);",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    target.append(createMetricList(rows));",
    "    setStatus(id, statusLabel, statusKind);",
    "  }",
    "",
    "  function setList(id, items, emptyText, statusLabel = \"Loaded\", statusKind = \"ok\") {",
    "    const target = panelBody(id);",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    if (items.length === 0) {",
    "      const empty = document.createElement(\"p\");",
    "      empty.className = \"muted\";",
    "      empty.textContent = emptyText;",
    "      target.append(empty);",
    "    } else {",
    "      const list = document.createElement(\"ul\");",
    "      list.className = \"event-list\";",
    "      for (const item of items) {",
    "        const entry = document.createElement(\"li\");",
    "        entry.textContent = item;",
    "        list.append(entry);",
    "      }",
    "      target.append(list);",
    "    }",
    "    setStatus(id, statusLabel, statusKind);",
    "  }",
    "",
    "  function renderUserDashboard(snapshot) {",
    "    renderUserHomePanel(snapshot);",
    "    renderUserApprovalsPanel(snapshot);",
    "    renderUserActivityPanel(snapshot);",
    "    renderUserAppsSitesPanel(snapshot);",
    "    renderUserPermissionsPanel(snapshot);",
    "    renderUserAgentsPanel(snapshot);",
    "  }",
    "",
    "  function renderUserHomePanel(snapshot) {",
    "    const turn = snapshot.currentTurn || {};",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const freshness = readRuntimeSnapshotFreshness(snapshot, turn);",
    "    const assistant = readAssistantState(snapshot, turn, freshness);",
    "    setUserRows(\"home\", [",
    "      row(\"assistant\", assistant.detail),",
    "      row(\"current task\", turn.command || turn.latestMessage || \"No active task\"),",
    "      row(\"target\", turn.targetApp || runtime.desktopSession && runtime.desktopSession.frontmostLocalizedName || \"None\"),",
    "      row(\"risk\", turn.risk || \"not evaluated\"),",
    "      row(\"next\", readUserNextAction(snapshot)),",
    "      row(\"stop\", turn.stopState || \"inactive\")",
    "    ], assistant.label, assistant.kind);",
    "  }",
    "",
    "  function renderUserApprovalsPanel(snapshot) {",
    "    const turn = snapshot.currentTurn || {};",
    "    const items = [];",
    "    if (turn.approvalState === \"required\" || turn.state === \"approval_required\" || turn.state === \"needs_confirmation\") {",
    "      items.push(`${turn.risk || \"approval\"}: ${turn.command || turn.latestMessage || \"Review the pending Computer Use action.\"}`);",
    "    }",
    "    const extension = snapshot.runtimeHealth && snapshot.runtimeHealth.extension || {};",
    "    const hostPolicy = extension.hostPolicy || {};",
    "    if (readChromeLiveConnectionState(extension) !== \"connected\") {",
    "      items.push(\"Chrome extension heartbeat is not connected; refresh the extension before trusting page control.\");",
    "    }",
    "    if (hostPolicy.state === \"default\") {",
    "      items.push(\"Chrome host policy is ask-by-default; new sites will request approval.\");",
    "    }",
    "    setUserList(\"approvals\", items, \"No pending approvals.\", items.length > 0 ? \"Review\" : \"Clear\", items.length > 0 ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderUserActivityPanel(snapshot) {",
    "    const turn = snapshot.currentTurn || {};",
    "    const replay = snapshot.replay || {};",
    "    const chromeControlItems = readChromeControlActivityItems(turn, replay);",
    "    const items = [",
    "      ...chromeControlItems,",
    "      turn.latestAction ? `Last action: ${formatRuntimeAction(turn.latestAction)}` : \"Last action: none\",",
    "      turn.latestVerification ? `Verification: ${formatRuntimeVerification(turn.latestVerification)}` : \"Verification: none\",",
    "      turn.latestScreenshot ? `Screenshot: ${formatRuntimeScreenshot(turn.latestScreenshot)}` : `Screenshots: ${formatValue(replay.screenshotCount)}`,",
    "      `Replay: ${replay.state || \"empty\"}`",
    "    ];",
    "    const active = turn.state && turn.state !== \"idle\";",
    "    setUserList(\"activity\", items, \"No recent activity.\", active ? \"Live\" : replay.state === \"available\" ? \"Recent\" : \"Idle\", active ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function readChromeControlActivityItems(turn, replay) {",
    "    const entries = [",
    "      turn.chromeControlActivity,",
    "      turn.latestChromeControlAction,",
    "      ...readArray(replay.chromeControlActions)",
    "    ].filter((entry) => entry && typeof entry === \"object\" && !Array.isArray(entry));",
    "    return entries.slice(-4).map(formatChromeControlActivity);",
    "  }",
    "",
    "  function formatChromeControlActivity(entry) {",
    "    const target = entry.target && typeof entry.target === \"object\" && !Array.isArray(entry.target) ? entry.target : {};",
    "    const title = entry.title || \"Chrome action\";",
    "    const host = target.host || \"current page\";",
    "    const tab = Number.isInteger(target.tabId) ? ` tab ${target.tabId}` : \"\";",
    "    const result = formatChromeControlActivityResult(entry);",
    "    return `${title}: ${result} - ${host}${tab}`;",
    "  }",
    "",
    "  function formatChromeControlActivityResult(entry) {",
    "    if (entry.result === \"verified\") return \"Verified\";",
    "    if (entry.result === \"blocked\") return entry.blockerReason || \"Blocked\";",
    "    if (entry.result === \"failed\") return entry.blockerReason || \"Failed\";",
    "    return entry.blockerReason || \"Unknown\";",
    "  }",
    "",
    "  function renderUserAppsSitesPanel(snapshot) {",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const extension = runtime.extension || {};",
    "    const nativeHost = runtime.nativeHost || {};",
    "    const desktopSession = runtime.desktopSession || {};",
    "    const chromeArtifact = findSmokeArtifact(snapshot, \"chrome\");",
    "    const pageControl = readChromePageControlSummary(runtime, chromeArtifact);",
    "    const tabDiscovery = readChromeTabDiscoverySummary(runtime, chromeArtifact);",
    "    const liveConnection = readChromeLiveConnectionState(extension);",
    "    const chromeControl = readChromeControlCardState({ extension, nativeHost, desktopSession, pageControl, tabDiscovery, liveConnection });",
    "    const target = userPanelBody(\"apps-sites\");",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    const card = document.createElement(\"section\");",
    "    card.setAttribute(\"data-chrome-control-card\", \"\");",
    "    const title = document.createElement(\"strong\");",
    "    title.textContent = chromeControl.label;",
    "    const detail = document.createElement(\"p\");",
    "    detail.className = \"muted\";",
    "    detail.textContent = chromeControl.detail;",
    "    card.append(title, detail, createMetricList([",
    "      row(\"Chrome\", liveConnection === \"connected\" ? \"Connected\" : \"Extension needs refresh\"),",
    "      row(\"Native host\", nativeHost.state || \"unknown\"),",
    "      row(\"Current page\", formatChromeControlTarget(pageControl.activeTab)),",
    "      row(\"Host policy\", extension.hostPolicy && extension.hostPolicy.state),",
    "      row(\"Screenshot\", chromeControl.screenshotLane),",
    "      row(\"Tab discovery\", chromeControl.tabDiscoveryLabel)",
    "    ]));",
    "    const launchers = createChromeControlLauncherControls(chromeControl, pageControl, extension, nativeHost);",
    "    if (launchers) card.append(launchers);",
    "    const commands = createChromeControlCommands(chromeControl, pageControl, extension, nativeHost);",
    "    if (commands.length > 0) {",
    "      const commandList = document.createElement(\"ul\");",
    "      commandList.className = \"event-list\";",
    "      commandList.setAttribute(\"data-chrome-control-actions\", \"\");",
    "      for (const command of commands) {",
    "        const item = document.createElement(\"li\");",
    "        item.textContent = command;",
    "        commandList.append(item);",
    "      }",
    "      card.append(commandList);",
    "    }",
    "    target.append(card);",
    "    setUserStatus(\"apps-sites\", chromeControl.statusLabel, chromeControl.kind);",
    "  }",
    "",
    "  function readChromeControlCardState({ extension, nativeHost, desktopSession, pageControl, tabDiscovery, liveConnection }) {",
    "    const capabilities = pageControl.capabilities || {};",
    "    const blockers = readArray(pageControl.blockers);",
    "    const blockerCodes = blockers.map((blocker) => blocker && blocker.code).filter(Boolean);",
    "    const screenshotNeedsPermission = capabilities.domActions === true && capabilities.screenshot !== true;",
    "    const tabDiscoveryLabel = tabDiscovery.discoveryMode === \"chrome-apple-events\" ? \"Using Chrome tab fallback\" : tabDiscovery.state;",
    "    const base = {",
    "      kind: \"warning\",",
    "      statusLabel: \"Review\",",
    "      actionable: false,",
    "      screenshotLane: screenshotNeedsPermission ? \"screenshot needs permission\" : capabilities.screenshot === true ? \"ready\" : \"fallback available\",",
    "      tabDiscoveryLabel: tabDiscoveryLabel || \"not-probed\"",
    "    };",
    "    if ((nativeHost.state !== \"installed\" || liveConnection !== \"connected\" || extension.state === \"stale\") && isDesktopLockedForChromeRefresh(desktopSession)) {",
    "      return { ...base, label: \"Desktop locked for extension refresh\", detail: \"Unlock the desktop and keep the display awake before refreshing the installed skfiy Chrome extension.\", statusLabel: \"Locked\", kind: \"error\", screenshotLane: \"unknown\" };",
    "    }",
    "    if (nativeHost.state !== \"installed\" || liveConnection !== \"connected\" || extension.state === \"stale\") {",
    "      return { ...base, label: \"Extension needs refresh\", detail: \"Refresh the installed skfiy Chrome extension before trusting page actions.\", statusLabel: \"Refresh\", kind: \"warning\", screenshotLane: \"unknown\" };",
    "    }",
    "    if (isChromeInternalPage(pageControl)) {",
    "      return { ...base, label: \"Internal Chrome page cannot be controlled\", detail: \"Open an ordinary HTTP or HTTPS page before using browser actions.\", statusLabel: \"Blocked\", kind: \"error\", screenshotLane: \"blocked\" };",
    "    }",
    "    if (pageControl.state === \"blocked_by_host_policy\" || blockerCodes.includes(\"blocked_by_host_policy\")) {",
    "      return { ...base, label: \"Needs skfiy host approval\", detail: pageControl.nextAction || \"Allow this host in skfiy before using page actions.\", statusLabel: \"Approve\", kind: \"warning\", screenshotLane: \"blocked\" };",
    "    }",
    "    if (pageControl.state === \"blocked_by_chrome_host_permission\" || blockerCodes.includes(\"blocked_by_chrome_host_permission\")) {",
    "      return { ...base, label: \"Needs Chrome site access\", detail: pageControl.nextAction || \"Grant Chrome site access for the current host.\", statusLabel: \"Grant\", kind: \"warning\", screenshotLane: \"blocked\" };",
    "    }",
    "    if (screenshotNeedsPermission || (pageControl.state === \"partial\" && capabilities.domActions === true)) {",
    "      return { ...base, label: \"DOM actions ready, screenshot needs permission\", detail: \"Observe, click, fill, submit, and scroll can use DOM actions; screenshots need Chrome capture permission or desktop fallback.\", statusLabel: \"Partial\", kind: \"warning\", actionable: true, screenshotLane: \"screenshot needs permission\" };",
    "    }",
    "    if (pageControl.capable === true && capabilities.domActions === true && capabilities.screenshot === true) {",
    "      return { ...base, label: \"Ready to control this page\", detail: \"Chrome DOM actions and screenshot capture are ready for this HTTP(S) page.\", statusLabel: \"Ready\", kind: \"ok\", actionable: true, screenshotLane: \"ready\" };",
    "    }",
    "    return { ...base, label: \"Falling back to screenshot\", detail: \"Structured Chrome control is not ready for this page, so skfiy should use desktop screenshot Computer Use.\", statusLabel: \"Fallback\", kind: \"warning\", screenshotLane: \"Falling back to screenshot\" };",
    "  }",
    "",
    "  function readChromeTabDiscoverySummary(runtime, chromeArtifact) {",
    "    const extension = runtime && runtime.extension || {};",
    "    const candidates = [extension.tabDiscovery, extension.pageTabs, chromeArtifact && chromeArtifact.tabDiscovery, chromeArtifact && chromeArtifact.pageTabs];",
    "    for (const candidate of candidates) {",
    "      if (candidate && typeof candidate === \"object\" && !Array.isArray(candidate)) {",
    "        return {",
    "          state: candidate.result || candidate.state || \"reported\",",
    "          discoveryMode: candidate.discoveryMode || candidate.mode,",
    "          tabCount: Array.isArray(candidate.tabs) ? candidate.tabs.length : undefined",
    "        };",
    "      }",
    "    }",
    "    return { state: \"not-probed\" };",
    "  }",
    "",
    "  function isChromeInternalPage(pageControl) {",
    "    const activeTab = pageControl.activeTab || {};",
    "    const blockers = readArray(pageControl.blockers);",
    "    const blockerCodes = blockers.map((blocker) => blocker && blocker.code).filter(Boolean);",
    "    const scheme = activeTab.scheme || \"\";",
    "    const host = activeTab.host || \"\";",
    "    return scheme === \"chrome\" || scheme === \"chrome-extension\" || String(host).startsWith(\"chrome://\") || String(host).startsWith(\"chrome-extension://\") || blockerCodes.includes(\"internal_chrome_page\") || blockerCodes.includes(\"chrome_extension_page\");",
    "  }",
    "",
    "  function isDesktopLockedForChromeRefresh(desktopSession) {",
    "    if (!desktopSession || typeof desktopSession !== \"object\" || Array.isArray(desktopSession)) return false;",
    "    return desktopSession.state === \"blocked\" || desktopSession.mainDisplayAsleep === true || desktopSession.cgSessionScreenIsLocked === true || desktopSession.ioConsoleLocked === true || desktopSession.frontmostBundleId === \"com.apple.loginwindow\";",
    "  }",
    "",
    "  function formatChromeControlTarget(activeTab) {",
    "    if (!activeTab || typeof activeTab !== \"object\" || Array.isArray(activeTab)) return \"No active page\";",
    "    const host = activeTab.host || \"unknown host\";",
    "    const tab = Number.isInteger(activeTab.tabId) ? ` tab ${activeTab.tabId}` : \"\";",
    "    return `${host}${tab}`;",
    "  }",
    "",
    "  function createChromeControlCommands(chromeControl, pageControl, extension, nativeHost) {",
    "    if (!chromeControl.actionable) return [];",
    "    const tabId = pageControl.activeTab && Number.isInteger(pageControl.activeTab.tabId) ? pageControl.activeTab.tabId : undefined;",
    "    if (!Number.isInteger(tabId)) return [];",
    "    const extensionId = readChromeExtensionId(extension, nativeHost) || \"<extension-id>\";",
    "    const command = (action) => `./dist/skfiy chrome ${action} --extension-id ${extensionId} --target-tab-id ${tabId}`;",
    "    return [",
    "      `Observe current page: ${command(\"observe\")} --json`,",
    "      `Screenshot current page: ${command(\"screenshot\")} --json`,",
    "      `Click confirmed selector: ${command(\"click\")} --selector <selector> --json`,",
    "      `Fill approved field: ${command(\"fill\")} --selector <selector> --text <text> --json`,",
    "      `Submit approved test form: ${command(\"submit\")} --selector form --json`,",
    "      `Scroll current page: ${command(\"scroll\")} --dy 600 --json`",
    "    ];",
    "  }",
    "",
    "  function createChromeControlLauncherControls(chromeControl, pageControl, extension, nativeHost) {",
    "    if (!chromeControl.actionable) return null;",
    "    const tabId = pageControl.activeTab && Number.isInteger(pageControl.activeTab.tabId) ? pageControl.activeTab.tabId : undefined;",
    "    if (!Number.isInteger(tabId)) return null;",
    "    const extensionId = readChromeExtensionId(extension, nativeHost);",
    "    if (!extensionId || extensionId === \"<extension-id>\") return null;",
    "    const form = document.createElement(\"form\");",
    "    form.className = \"chrome-control-launchers\";",
    "    form.setAttribute(\"data-chrome-control-launchers\", \"\");",
    "    form.addEventListener(\"submit\", (event) => event.preventDefault());",
    "",
    "    const fields = document.createElement(\"div\");",
    "    fields.className = \"chrome-control-fields\";",
    "    const selectorInput = document.createElement(\"input\");",
    "    selectorInput.type = \"text\";",
    "    selectorInput.placeholder = \"selector\";",
    "    selectorInput.setAttribute(\"aria-label\", \"Chrome action selector\");",
    "    selectorInput.setAttribute(\"data-chrome-control-selector-input\", \"\");",
    "    const textInput = document.createElement(\"input\");",
    "    textInput.type = \"text\";",
    "    textInput.placeholder = \"fill text\";",
    "    textInput.setAttribute(\"aria-label\", \"Chrome fill text\");",
    "    textInput.setAttribute(\"data-chrome-control-text-input\", \"\");",
    "    fields.append(selectorInput, textInput);",
    "",
    "    const actions = document.createElement(\"div\");",
    "    actions.className = \"chrome-control-actions\";",
    "    actions.append(",
    "      createChromeControlLauncherButton(\"observe\", \"Observe\"),",
    "      createChromeControlLauncherButton(\"screenshot\", \"Screenshot\"),",
    "      createChromeControlLauncherButton(\"click\", \"Click\"),",
    "      createChromeControlLauncherButton(\"fill\", \"Fill\"),",
    "      createChromeControlLauncherButton(\"submit\", \"Submit\"),",
    "      createChromeControlLauncherButton(\"scroll\", \"Scroll\")",
    "    );",
    "",
    "    const feedback = document.createElement(\"p\");",
    "    feedback.className = \"chrome-control-feedback\";",
    "    feedback.setAttribute(\"data-chrome-control-feedback\", \"\");",
    "",
    "    form.addEventListener(\"click\", (event) => {",
    "      if (!(event.target instanceof Element)) return;",
    "      const button = event.target.closest(\"button[data-chrome-control-launcher]\");",
    "      if (!button) return;",
    "      event.preventDefault();",
    "      void launchChromeControlAction(button.getAttribute(\"data-chrome-control-launcher\") || \"\", { extensionId, tabId, selectorInput, textInput, feedback, button });",
    "    });",
    "    form.append(fields, actions, feedback);",
    "    return form;",
    "  }",
    "",
    "  function createChromeControlLauncherButton(action, label) {",
    "    const button = document.createElement(\"button\");",
    "    button.type = \"button\";",
    "    button.textContent = label;",
    "    button.setAttribute(\"data-chrome-control-launcher\", action);",
    "    return button;",
    "  }",
    "",
    "  async function launchChromeControlAction(action, { extensionId, tabId, selectorInput, textInput, feedback, button }) {",
    "    const selector = selectorInput.value.trim();",
    "    const text = textInput.value.trim();",
    "    if ((action === \"click\" || action === \"fill\") && !selector) {",
    "      feedback.textContent = \"Enter a selector before launching this action.\";",
    "      return;",
    "    }",
    "    if (action === \"fill\" && !text) {",
    "      feedback.textContent = \"Enter fill text before launching this action.\";",
    "      return;",
    "    }",
    "    button.disabled = true;",
    "    feedback.textContent = `Running Chrome ${action}...`;",
    "    const body = { action, extensionId, targetTabId: tabId };",
    "    if (action === \"click\" || action === \"fill\") body.selector = selector;",
    "    if (action === \"submit\") body.selector = selector || \"form\";",
    "    if (action === \"fill\") body.text = text;",
    "    if (action === \"scroll\") body.dy = 600;",
    "    try {",
    "      const response = await fetch(\"/api/chrome-control-action\", {",
    "        method: \"POST\",",
    "        headers: { \"content-type\": \"application/json\" },",
    "        body: JSON.stringify(body)",
    "      });",
    "      const payload = await response.json().catch(() => ({}));",
    "      if (!response.ok) {",
    "        const message = payload && payload.error && payload.error.message;",
    "        throw new Error(message || `Chrome action failed: ${response.status}`);",
    "      }",
    "      const entry = payload.activityEntry || {};",
    "      feedback.textContent = `${entry.title || `Chrome ${action}`}: ${entry.result || payload.result || \"reported\"}${entry.blockerReason ? ` - ${entry.blockerReason}` : \"\"}`;",
    "      await loadSnapshot();",
    "    } catch (error) {",
    "      feedback.textContent = error instanceof Error ? error.message : String(error);",
    "    } finally {",
    "      button.disabled = false;",
    "    }",
    "  }",
    "",
    "  function renderUserPermissionsPanel(snapshot) {",
    "    const permissions = snapshot.permissions || {};",
    "    const missing = Object.entries(permissions).filter(([, value]) => value === \"denied\" || value === \"unknown\" || value === \"not-determined\");",
    "    setUserRows(\"permissions\", [",
    "      row(\"Screen Recording\", permissions.screenRecording),",
    "      row(\"Accessibility\", permissions.accessibility),",
    "      row(\"Finder\", permissions.finderAutomation)",
    "    ], missing.length > 0 ? `${missing.length} needed` : \"Ready\", missing.length > 0 ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderUserAgentsPanel(snapshot) {",
    "    const longHorizon = snapshot.longHorizon || {};",
    "    const readiness = snapshot.operatorReadiness || {};",
    "    const recommendation = longHorizon.recommendation || {};",
    "    const kind = longHorizon.state === \"observing\" || readiness.state === \"ready\" ? \"ok\" : readiness.state === \"blocked\" ? \"error\" : \"warning\";",
    "    setUserRows(\"agents\", [",
    "      row(\"money-run\", longHorizon.state || \"not observed\"),",
    "      row(\"active pane\", longHorizon.activePane && longHorizon.activePane.id),",
    "      row(\"recommendation\", recommendation.action || readUserNextAction(snapshot)),",
    "      row(\"reason\", recommendation.reason),",
    "      row(\"mutates session\", longHorizon.mutatesSession)",
    "    ], kind === \"ok\" ? \"Ready\" : \"Needs evidence\", kind);",
    "  }",
    "",
    "  function readAssistantState(snapshot, turn, freshness) {",
    "    const alerts = readArray(snapshot.alerts);",
    "    if (alerts.some((alert) => alert && alert.severity === \"error\")) return { label: \"Blocked\", detail: \"Needs your attention\", kind: \"error\" };",
    "    if (freshness.state === \"stale\") return { label: \"Stale\", detail: \"Runtime stream is stale\", kind: \"warning\" };",
    "    if (turn.state === \"approval_required\" || turn.state === \"needs_confirmation\") return { label: \"Waiting\", detail: \"Approval required\", kind: \"warning\" };",
    "    if (turn.state === \"executing\") return { label: \"Acting\", detail: \"Executing a task\", kind: \"warning\" };",
    "    if (turn.state === \"observing\") return { label: \"Watching\", detail: \"Reading the desktop\", kind: \"warning\" };",
    "    if (turn.state === \"failed\") return { label: \"Failed\", detail: \"Last task failed\", kind: \"error\" };",
    "    if (turn.state === \"completed\") return { label: \"Done\", detail: \"Last task completed\", kind: \"ok\" };",
    "    return { label: \"Idle\", detail: \"Ready for an agent task\", kind: \"ok\" };",
    "  }",
    "",
    "  function readUserNextAction(snapshot) {",
    "    const alerts = readArray(snapshot.alerts);",
    "    const blocker = alerts.find((alert) => alert && (alert.severity === \"error\" || alert.severity === \"warning\"));",
    "    if (blocker) return blocker.message || blocker.code;",
    "    const turn = snapshot.currentTurn || {};",
    "    if (turn.approvalState === \"required\") return \"Review the pending approval.\";",
    "    const extension = snapshot.runtimeHealth && snapshot.runtimeHealth.extension || {};",
    "    if (readChromeLiveConnectionState(extension) !== \"connected\") return \"Refresh Chrome extension heartbeat.\";",
    "    return \"Ready for the next agent task.\";",
    "  }",
    "",
    "  function renderEvidenceSummaryPanel(snapshot) {",
    "    const target = document.querySelector(\"[data-evidence-summary-body]\");",
    "    if (!target) return;",
    "    const lanes = createEvidenceSummaryLanes(snapshot);",
    "    const state = aggregateEvidenceState(lanes.map((lane) => lane.state));",
    "    const container = document.createElement(\"div\");",
    "    container.className = \"evidence-lanes\";",
    "    container.setAttribute(\"data-evidence-lanes\", \"\");",
    "    for (const lane of lanes) {",
    "      container.append(createEvidenceLaneCard(lane));",
    "    }",
    "    target.replaceChildren(container);",
    "    setEvidenceSummaryStatus(state === \"ready\" ? \"Ready\" : state === \"blocked\" ? \"Blocked\" : \"Needs evidence\", state === \"ready\" ? \"ok\" : state === \"blocked\" ? \"error\" : \"warning\");",
    "  }",
    "",
    "  function createEvidenceSummaryLanes(snapshot) {",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const readiness = snapshot.operatorReadiness || {};",
    "    const currentTurn = snapshot.currentTurn || {};",
    "    const replay = snapshot.replay || {};",
    "    const longHorizon = snapshot.longHorizon || {};",
    "    const extension = runtime.extension || {};",
    "    const nativeHost = runtime.nativeHost || {};",
    "    const chromeArtifact = findSmokeArtifact(snapshot, \"chrome\");",
    "    const codexArtifact = findSmokeArtifact(snapshot, \"codex-plugin\");",
    "    const nativeHostBridge = chromeArtifact && chromeArtifact.nativeHostBridge || {};",
    "    const installedExtension = chromeArtifact && chromeArtifact.installedExtension || {};",
    "    const pageSafety = chromeArtifact && chromeArtifact.pageSafety || {};",
    "    const pageControl = readChromePageControlSummary(runtime, chromeArtifact);",
    "    const chromeSetupGuide = createChromeSetupGuide(extension, nativeHost, chromeArtifact);",
    "    return [",
    "      {",
    "        id: \"computer-use-operator\",",
    "        title: \"Computer Use operator\",",
    "        state: aggregateEvidenceState([readiness.state === \"ready\" ? \"ready\" : readiness.state === \"blocked\" ? \"blocked\" : \"needs-evidence\", replay.state === \"available\" ? \"ready\" : \"needs-evidence\", longHorizon.state === \"observing\" ? \"ready\" : \"needs-evidence\"]),",
    "        summary: `turn ${currentTurn.state || \"unknown\"}, replay ${replay.state || \"empty\"}, money-run ${longHorizon.state || \"unknown\"}`",
    "      },",
    "      {",
    "        id: \"codex-plugin\",",
    "        title: \"Codex plugin\",",
    "        state: artifactEvidenceState(codexArtifact),",
    "        summary: codexArtifact ? `${codexArtifact.result || \"unknown\"}${codexArtifact.stale ? \" stale\" : \"\"}` : \"no smoke artifact\"",
    "      },",
    "      {",
    "        id: \"chrome-extension\",",
    "        title: \"Chrome extension\",",
    "        state: aggregateEvidenceState([chromeRuntimeEvidenceState(extension.state), nativeHostEvidenceState(nativeHost.state), liveConnectionEvidenceState(chromeSetupGuide.liveConnectionState), artifactEvidenceState(chromeArtifact), resultEvidenceState(nativeHostBridge.result), installedExtension.result === \"blocked\" ? \"needs-evidence\" : resultEvidenceState(installedExtension.result), pageSafetyEvidenceState(pageSafety.state), pageControlEvidenceState(pageControl.state)]),",
    "        summary: `extension ${extension.state || \"unknown\"}, host ${nativeHost.state || \"unknown\"}, live ${chromeSetupGuide.liveConnectionState}, smoke ${chromeArtifact && chromeArtifact.result || \"missing\"}`,",
    "        checks: [",
    "          { label: \"native host\", value: nativeHost.state || \"unknown\", state: nativeHostEvidenceState(nativeHost.state) },",
    "          { label: \"live connection\", value: chromeSetupGuide.liveConnectionState, state: liveConnectionEvidenceState(chromeSetupGuide.liveConnectionState) },",
    "          { label: \"smoke\", value: chromeArtifact && chromeArtifact.result || \"missing\", state: artifactEvidenceState(chromeArtifact) },",
    "          { label: \"page safety\", value: pageSafety.state || \"empty\", state: pageSafetyEvidenceState(pageSafety.state) },",
    "          { label: \"pageControl\", value: `${pageControl.capable ? \"capable\" : \"not capable\"}/${pageControl.state || \"not-probed\"}`, state: pageControlEvidenceState(pageControl.state) }",
    "        ],",
    "        nextActions: chromeSetupGuide.nextActions,",
    "        commands: chromeSetupGuide.commands",
    "      }",
    "    ];",
    "  }",
    "",
    "  function createEvidenceLaneCard(lane) {",
    "    const section = document.createElement(\"section\");",
    "    section.className = \"evidence-lane\";",
    "    section.setAttribute(\"data-evidence-lane\", lane.id);",
    "    section.setAttribute(\"data-evidence-state\", lane.state);",
    "    const heading = document.createElement(\"h3\");",
    "    heading.textContent = `${lane.title}: ${lane.state}`;",
    "    const summary = document.createElement(\"p\");",
    "    summary.textContent = lane.summary;",
    "    section.append(heading, summary);",
    "    if (readArray(lane.checks).length > 0) {",
    "      const checks = createMetricList(readArray(lane.checks).map((check) => [check.label || \"check\", `${formatValue(check.value)} (${check.state || \"unknown\"})`]));",
    "      checks.classList.add(\"evidence-checks\");",
    "      section.append(checks);",
    "    }",
    "    if (readArray(lane.nextActions).length > 0) {",
    "      const actions = document.createElement(\"ul\");",
    "      actions.className = \"event-list evidence-actions\";",
    "      actions.setAttribute(\"data-evidence-next-actions\", lane.id);",
    "      for (const action of readArray(lane.nextActions)) {",
    "        const item = document.createElement(\"li\");",
    "        item.textContent = String(action);",
    "        actions.append(item);",
    "      }",
    "      section.append(actions);",
    "    }",
    "    if (readArray(lane.commands).length > 0) {",
    "      section.append(createEvidenceCommandList(lane.commands, lane.id));",
    "    }",
    "    return section;",
    "  }",
    "",
    "  function createEvidenceCommandList(commands, laneId) {",
    "    const list = document.createElement(\"div\");",
    "    list.className = \"evidence-commands\";",
    "    list.setAttribute(\"data-evidence-commands\", laneId);",
    "    for (const command of readArray(commands)) {",
    "      const entry = document.createElement(\"div\");",
    "      entry.className = \"evidence-command\";",
    "      const label = document.createElement(\"strong\");",
    "      label.textContent = `${command.label || command.id || \"command\"}${command.mutates ? \" (mutates)\" : \"\"}`;",
    "      const code = document.createElement(\"code\");",
    "      code.textContent = command.command || \"\";",
    "      entry.append(label, code);",
    "      list.append(entry);",
    "    }",
    "    return list;",
    "  }",
    "",
    "  function createChromeSetupGuide(extension, nativeHost, chromeArtifact) {",
    "    const nativeHostState = nativeHost.state || \"unknown\";",
    "    const liveConnectionState = readChromeLiveConnectionState(extension);",
    "    const guide = readChromeSetupGuide(extension.setupGuide) || readChromeSetupGuide(nativeHost.setupGuide) || readChromeSetupGuide(chromeArtifact && chromeArtifact.setupGuide);",
    "    const commands = guide && guide.commands.length > 0 ? guide.commands : createDefaultChromeCommands(readChromeExtensionId(extension, nativeHost));",
    "    const nextActions = guide && guide.nextActions.length > 0 ? guide.nextActions : createDefaultChromeNextActions(nativeHostState, liveConnectionState, chromeArtifact);",
    "    return { nativeHostState, liveConnectionState, commands, nextActions };",
    "  }",
    "",
    "  function readChromeSetupGuide(guide) {",
    "    if (!guide || typeof guide !== \"object\" || Array.isArray(guide)) return null;",
    "    const nextActions = readChromeSetupActions(guide.nextActions);",
    "    const commands = dedupeChromeSetupCommands([",
    "      ...readChromeSetupCommands(guide.commands),",
    "      ...readChromeSetupCommands(guide.copyableCommands),",
    "      ...readChromeNamedSetupCommands(guide)",
    "    ]);",
    "    return nextActions.length > 0 || commands.length > 0 ? { nextActions, commands } : null;",
    "  }",
    "",
    "  function readChromeSetupActions(value) {",
    "    return readArray(value).flatMap((entry) => {",
    "      if (typeof entry === \"string\") return [entry];",
    "      if (!entry || typeof entry !== \"object\" || Array.isArray(entry)) return [];",
    "      const text = entry.title || entry.guidance || entry.nextAction || entry.reason || entry.copyText;",
    "      const command = Array.isArray(entry.command) ? formatCommandParts(entry.command) : entry.copyText;",
    "      return text && command && text !== command ? [`${text} ${command}`] : text ? [String(text)] : command ? [String(command)] : [];",
    "    });",
    "  }",
    "",
    "  function readChromeSetupCommands(value) {",
    "    if (Array.isArray(value) && value.every((entry) => typeof entry === \"string\")) return normalizeChromeSetupCommand(value, \"command\");",
    "    if (Array.isArray(value)) return value.flatMap((entry, index) => normalizeChromeSetupCommand(entry, `command-${index + 1}`));",
    "    if (!value || typeof value !== \"object\") return [];",
    "    return Object.entries(value).flatMap(([id, entry]) => normalizeChromeSetupCommand(entry, id));",
    "  }",
    "",
    "  function readChromeNamedSetupCommands(guide) {",
    "    return [",
    "      [\"install-host\", guide.installHostCommand],",
    "      [\"status\", guide.verifyStatusCommand],",
    "      [\"smoke\", guide.smokeCommand]",
    "    ].flatMap(([id, value]) => normalizeChromeSetupCommand(value, id));",
    "  }",
    "",
    "  function normalizeChromeSetupCommand(value, idHint) {",
    "    if (typeof value === \"string\") return [{ id: normalizeCommandId(idHint), label: readCommandLabel(idHint), command: value }];",
    "    if (Array.isArray(value) && value.every((entry) => typeof entry === \"string\")) return [{ id: normalizeCommandId(idHint), label: readCommandLabel(idHint), command: formatCommandParts(value) }];",
    "    if (!value || typeof value !== \"object\" || Array.isArray(value)) return [];",
    "    const command = value.copyText || value.commandText || value.commandLine || (typeof value.command === \"string\" && Array.isArray(value.args) ? formatCommandParts([value.command, ...value.args]) : \"\") || (typeof value.command === \"string\" ? value.command : typeof value.value === \"string\" ? value.value : \"\");",
    "    if (!command) return [];",
    "    return [{ id: normalizeCommandId(value.id || idHint), label: value.label || readCommandLabel(idHint), command, mutates: value.mutates === true }];",
    "  }",
    "",
    "  function dedupeChromeSetupCommands(commands) {",
    "    const seen = new Set();",
    "    return commands.filter((command) => {",
    "      const key = `${command.id}\\n${command.command}`;",
    "      if (seen.has(key)) return false;",
    "      seen.add(key);",
    "      return true;",
    "    });",
    "  }",
    "",
    "  function formatCommandParts(parts) {",
    "    return readArray(parts).map((part) => {",
    "      const text = String(part);",
    "      return /^[A-Za-z0-9_./:=@%+-]+$/.test(text) ? text : JSON.stringify(text);",
    "    }).join(\" \");",
    "  }",
    "",
    "  function createDefaultChromeCommands(extensionId) {",
    "    return [",
    "      { id: \"install-host\", label: \"Install host\", command: `skfiy chrome install-host --extension-id ${extensionId}`, mutates: true },",
    "      { id: \"status\", label: \"Status\", command: `skfiy chrome status --json --extension-id ${extensionId}` },",
    "      { id: \"smoke\", label: \"Smoke\", command: \"npm run smoke:chrome\" }",
    "    ];",
    "  }",
    "",
    "  function createDefaultChromeNextActions(nativeHostState, liveConnectionState, chromeArtifact) {",
    "    if (nativeHostState !== \"installed\") return [\"Install or repair the Chrome Native Messaging host from the packaged skfiy binary.\"];",
    "    if (liveConnectionState !== \"connected\") return [\"Refresh the installed extension heartbeat, then rerun Chrome status.\"];",
    "    if (!chromeArtifact || chromeArtifact.result !== \"passed\") return [\"Run the Chrome smoke and capture a fresh artifact.\"];",
    "    return [];",
    "  }",
    "",
    "  function readChromeLiveConnectionState(extension) {",
    "    const connection = extension.connection || {};",
    "    if (typeof extension.liveConnection === \"string\") return extension.liveConnection;",
    "    if (typeof connection.liveConnection === \"string\") return connection.liveConnection;",
    "    if (typeof connection.state === \"string\") return connection.state;",
    "    return extension.state === \"connected\" ? \"connected\" : \"unknown\";",
    "  }",
    "",
    "  function liveConnectionEvidenceState(state) {",
    "    if (state === \"connected\") return \"ready\";",
    "    if (state === \"invalid\") return \"blocked\";",
    "    return \"needs-evidence\";",
    "  }",
    "",
    "  function readChromeExtensionId(extension, nativeHost) {",
    "    const explicitIds = [...readArray(extension.extensionIds), ...readArray(nativeHost.extensionIds)].filter((value) => typeof value === \"string\");",
    "    if (explicitIds.length > 0) return explicitIds[0];",
    "    const origins = [...readArray(extension.allowedOrigins), ...readArray(nativeHost.allowedOrigins)].filter((value) => typeof value === \"string\");",
    "    for (const origin of origins) {",
    "      const match = origin.match(/^chrome-extension:\\/\\/([^/]+)\\//);",
    "      if (match && match[1]) return match[1];",
    "    }",
    "    return \"<extension-id>\";",
    "  }",
    "",
    "  function normalizeCommandId(value) {",
    "    return String(value || \"command\").replace(/([a-z0-9])([A-Z])/g, \"$1-$2\").replace(/[^a-zA-Z0-9]+/g, \"-\").replace(/^-+|-+$/g, \"\").toLowerCase() || \"command\";",
    "  }",
    "",
    "  function readCommandLabel(value) {",
    "    const id = normalizeCommandId(value);",
    "    if (id === \"install-host\") return \"Install host\";",
    "    if (id === \"status\") return \"Status\";",
    "    if (id === \"smoke\") return \"Smoke\";",
    "    return id.split(\"-\").filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(\" \") || \"Command\";",
    "  }",
    "",
    "  function findSmokeArtifact(snapshot, target) {",
    "    const artifacts = readArray(snapshot.smokeEvidence && snapshot.smokeEvidence.artifacts);",
    "    return artifacts.find((artifact) => artifact && artifact.target === target);",
    "  }",
    "",
    "  function artifactEvidenceState(artifact) {",
    "    if (!artifact) return \"needs-evidence\";",
    "    if (artifact.stale) return \"needs-evidence\";",
    "    return resultEvidenceState(artifact.result);",
    "  }",
    "",
    "  function resultEvidenceState(result) {",
    "    if (result === \"passed\") return \"ready\";",
    "    if (result === \"failed\") return \"blocked\";",
    "    if (result === \"blocked\") return \"needs-evidence\";",
    "    return \"needs-evidence\";",
    "  }",
    "",
    "  function pageSafetyEvidenceState(state) {",
    "    if (state === \"sensitive-paused\" || state === \"clear\") return \"ready\";",
    "    if (state === \"blocked\") return \"blocked\";",
    "    return \"needs-evidence\";",
    "  }",
    "",
    "  function pageControlEvidenceState(state) {",
    "    if (state === \"ready\" || state === \"sensitive-paused\" || state === \"needs_confirmation\") return \"ready\";",
    "    if (state === \"blocked_by_host_policy\" || state === \"blocked_by_chrome_host_permission\" || state === \"unavailable\" || state === \"active_tab_unavailable\" || state === \"content_script_not_loaded\" || state === \"not_loaded\") return \"blocked\";",
    "    return \"needs-evidence\";",
    "  }",
    "",
    "  function chromeRuntimeEvidenceState(state) {",
    "    if (state === \"connected\") return \"ready\";",
    "    if (state === \"native-host-installed\") return \"needs-evidence\";",
    "    if (state && state.startsWith(\"native-host-\")) return \"blocked\";",
    "    return \"needs-evidence\";",
    "  }",
    "",
    "  function nativeHostEvidenceState(state) {",
    "    if (state === \"installed\") return \"ready\";",
    "    if (state === \"missing\" || state === \"mismatched\" || state === \"invalid\" || state === \"cli-missing\") return \"blocked\";",
    "    return \"needs-evidence\";",
    "  }",
    "",
    "  function aggregateEvidenceState(states) {",
    "    if (states.some((state) => state === \"blocked\")) return \"blocked\";",
    "    if (states.length > 0 && states.every((state) => state === \"ready\")) return \"ready\";",
    "    if (states.some((state) => state === \"needs-evidence\")) return \"needs-evidence\";",
    "    return \"unknown\";",
    "  }",
    "",
    "  function renderOperatorEvidencePanel(snapshot) {",
    "    const target = document.querySelector(\"[data-operator-evidence-body]\");",
    "    if (!target) return;",
    "    const descriptor = snapshot.descriptor || {};",
    "    const bind = descriptor.bind || {};",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const readiness = snapshot.operatorReadiness || {};",
    "    const currentTurn = snapshot.currentTurn || {};",
    "    const replay = snapshot.replay || {};",
    "    const extension = runtime.extension || {};",
    "    const nativeHost = runtime.nativeHost || {};",
    "    const alerts = readArray(snapshot.alerts);",
    "    const artifacts = readArray(snapshot.smokeEvidence && snapshot.smokeEvidence.artifacts);",
    "    const hasError = alerts.some((alert) => alert && alert.severity === \"error\");",
    "    const hasWarning = alerts.some((alert) => alert && alert.severity === \"warning\");",
    "    target.replaceChildren();",
    "    target.append(createMetricList([",
    "      row(\"endpoint\", \"/api/operator-evidence\"),",
    "      row(\"dashboard\", descriptor.url),",
    "      row(\"bind\", bind.host && Number.isInteger(bind.port) ? `${bind.host}:${bind.port}` : undefined),",
    "      row(\"turn\", currentTurn.state),",
    "      row(\"replay\", replay.state),",
    "      row(\"readiness\", readiness.state),",
    "      row(\"alerts\", alerts.length),",
    "      row(\"extension\", extension.state),",
    "      row(\"native host\", nativeHost.state),",
    "      row(\"smoke artifacts\", artifacts.length)",
    "    ]));",
    "    setOperatorEvidenceStatus(hasError || readiness.state === \"blocked\" ? \"Blocked\" : hasWarning ? \"Attention\" : readiness.state || \"Loaded\", hasError || readiness.state === \"blocked\" ? \"error\" : hasWarning ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderRuntimePanel(snapshot) {",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const pageControl = readChromePageControlSummary(runtime, findSmokeArtifact(snapshot, \"chrome\"));",
    "    setRows(\"runtime-health\", [",
    "      row(\"version\", runtime.package && runtime.package.version),",
    "      row(\"app\", runtime.app && runtime.app.state),",
    "      row(\"helper\", runtime.helper && runtime.helper.state),",
    "      row(\"cli\", runtime.cli && runtime.cli.state),",
    "      row(\"dashboard\", runtime.dashboard && runtime.dashboard.state),",
    "      row(\"pid\", runtime.dashboard && runtime.dashboard.pid),",
    "      row(\"uptime\", runtime.dashboard && runtime.dashboard.uptimeSeconds),",
    "      row(\"extension\", runtime.extension && runtime.extension.state),",
    "      row(\"pageControl\", `${pageControl.capable ? \"capable\" : \"not capable\"}/${pageControl.state || \"not-probed\"}`),",
    "      row(\"pageControl next\", pageControl.nextAction || pageControl.reason),",
    "      row(\"desktop\", runtime.desktopSession && runtime.desktopSession.state)",
    "    ]);",
    "  }",
    "",
    "  function renderOperatorReadinessPanel(snapshot) {",
    "    const readiness = snapshot.operatorReadiness || {};",
    "    const commandSurface = readiness.commandSurface || {};",
    "    const extensionReadiness = readiness.extensionReadiness || {};",
    "    const packagedBinary = readiness.packagedBinary || {};",
    "    const recentSmokeEvidence = readiness.recentSmokeEvidence || {};",
    "    setRows(\"operator-readiness\", [",
    "      row(\"state\", readiness.state),",
    "      row(\"command surface\", commandSurface.state),",
    "      row(\"extension\", extensionReadiness.state),",
    "      row(\"binary\", packagedBinary.state),",
    "      row(\"signing\", packagedBinary.signingState),",
    "      row(\"smoke passed\", recentSmokeEvidence.recentPassedTargets),",
    "      row(\"smoke missing\", recentSmokeEvidence.missingTargets)",
    "    ], readiness.state || \"Unknown\", readiness.state === \"ready\" ? \"ok\" : readiness.state === \"blocked\" ? \"error\" : \"warning\");",
    "  }",
    "",
    "  function renderPermissionsPanel(snapshot) {",
    "    const permissions = snapshot.permissions || {};",
    "    const missing = Object.values(permissions).some((value) => value === \"denied\" || value === \"unknown\");",
    "    setRows(\"permissions\", [",
    "      row(\"screen\", permissions.screenRecording),",
    "      row(\"accessibility\", permissions.accessibility),",
    "      row(\"finder\", permissions.finderAutomation)",
    "    ], missing ? \"Needs attention\" : \"Ready\", missing ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderCurrentTurnPanel(snapshot) {",
    "    const turn = snapshot.currentTurn || {};",
    "    const freshness = readRuntimeSnapshotFreshness(snapshot, turn);",
    "    setRows(\"current-turn\", [",
    "      row(\"state\", turn.state),",
    "      row(\"snapshot freshness\", freshness.state),",
    "      row(\"snapshot age\", formatRuntimeSnapshotAge(freshness)),",
    "      row(\"source\", freshness.source),",
    "      row(\"stale\", freshness.stale),",
    "      row(\"target\", turn.targetApp),",
    "      row(\"risk\", turn.risk),",
    "      row(\"approval\", turn.approvalState),",
    "      row(\"stop\", turn.stopState),",
    "      row(\"agent provider\", turn.agentProvider),",
    "      row(\"command\", turn.command),",
    "      row(\"latest action\", formatRuntimeAction(turn.latestAction)),",
    "      row(\"latest verify\", formatRuntimeVerification(turn.latestVerification)),",
    "      row(\"latest screenshot\", formatRuntimeScreenshot(turn.latestScreenshot)),",
    "      row(\"message\", turn.latestMessage),",
    "      row(\"snapshot reason\", freshness.reason)",
    "    ], currentTurnStatusLabel(turn, freshness), currentTurnStatusKind(turn, freshness));",
    "  }",
    "",
    "  function renderReplayPanel(snapshot) {",
    "    const replay = snapshot.replay || {};",
    "    const freshness = readRuntimeSnapshotFreshness(snapshot, replay);",
    "    setRows(\"replay\", [",
    "      row(\"state\", replay.state),",
    "      row(\"snapshot freshness\", freshness.state),",
    "      row(\"snapshot age\", formatRuntimeSnapshotAge(freshness)),",
    "      row(\"source\", freshness.source),",
    "      row(\"stale\", freshness.stale),",
    "      row(\"screenshots\", replay.screenshotCount),",
    "      row(\"actions\", replay.actionCount),",
    "      row(\"verifications\", replay.verificationCount),",
    "      row(\"latest screenshot\", formatRuntimeScreenshot(Array.isArray(replay.screenshots) ? replay.screenshots.at(-1) : undefined)),",
    "      row(\"latest action\", formatRuntimeAction(Array.isArray(replay.actions) ? replay.actions.at(-1) : undefined)),",
    "      row(\"latest verify\", formatRuntimeVerification(Array.isArray(replay.verifications) ? replay.verifications.at(-1) : undefined)),",
    "      row(\"timeline tail\", formatRuntimeTimelineTail(replay.timelineTail)),",
    "      row(\"snapshot reason\", freshness.reason)",
    "    ], replayStatusLabel(replay, freshness), replayStatusKind(replay, freshness));",
    "  }",
    "",
    "  function readRuntimeSnapshotFreshness(snapshot, panel) {",
    "    const runtimeSnapshot = snapshot.runtimeHealth && snapshot.runtimeHealth.runtimeSnapshot || {};",
    "    const source = panel.source || runtimeSnapshot.source || \"unknown\";",
    "    const observedAt = panel.observedAt || runtimeSnapshot.observedAt;",
    "    const reason = panel.reason || runtimeSnapshot.reason;",
    "    const ageSeconds = readRuntimeSnapshotAgeSeconds(snapshot.generatedAt, observedAt);",
    "    const afterTurnEvidenceLoss = runtimeSnapshot.state === \"missing-after-turn\" || runtimeSnapshot.state === \"stale-after-turn\";",
    "    const empty = !afterTurnEvidenceLoss && (panel.freshInstall === true || runtimeSnapshot.freshInstall === true || panel.emptyReasonCode || runtimeSnapshot.emptyReasonCode || runtimeSnapshot.state === \"missing\");",
    "    const unavailable = runtimeSnapshot.state === \"unavailable\" || runtimeSnapshot.state === \"repair-failed\" || runtimeSnapshot.state === \"isolated\";",
    "    const stale = afterTurnEvidenceLoss || panel.stale === true || runtimeSnapshot.stale === true || (ageSeconds !== undefined && ageSeconds > RUNTIME_SNAPSHOT_STALE_SECONDS);",
    "    const state = empty ? \"empty\" : unavailable ? \"unavailable\" : stale ? \"stale\" : observedAt ? \"fresh\" : \"unknown\";",
    "    return { state, source, observedAt, reason, ageSeconds, stale };",
    "  }",
    "",
    "  function readRuntimeSnapshotAgeSeconds(generatedAt, observedAt) {",
    "    const generatedAtMs = Date.parse(generatedAt || \"\");",
    "    const observedAtMs = Date.parse(observedAt || \"\");",
    "    if (!Number.isFinite(generatedAtMs) || !Number.isFinite(observedAtMs)) return undefined;",
    "    return Math.max(0, Math.floor((generatedAtMs - observedAtMs) / 1000));",
    "  }",
    "",
    "  function formatRuntimeSnapshotAge(freshness) {",
    "    if (freshness.ageSeconds === undefined) return freshness.observedAt || \"unknown\";",
    "    return `${freshness.ageSeconds}s old${freshness.observedAt ? ` (${freshness.observedAt})` : \"\"}`;",
    "  }",
    "",
    "  function currentTurnStatusLabel(turn, freshness) {",
    "    if (freshness.state === \"stale\") return \"Stale\";",
    "    if (freshness.state === \"empty\") return \"Empty\";",
    "    if (freshness.state === \"unavailable\") return \"Unavailable\";",
    "    return turn.state === \"idle\" ? \"Idle\" : \"Active\";",
    "  }",
    "",
    "  function currentTurnStatusKind(turn, freshness) {",
    "    if (freshness.state === \"unavailable\") return \"error\";",
    "    if (freshness.state === \"stale\") return \"warning\";",
    "    if (freshness.state === \"empty\") return \"ok\";",
    "    return turn.state === \"idle\" ? \"ok\" : \"warning\";",
    "  }",
    "",
    "  function replayStatusLabel(replay, freshness) {",
    "    if (freshness.state === \"stale\") return \"Stale\";",
    "    if (freshness.state === \"empty\") return \"Empty\";",
    "    if (freshness.state === \"unavailable\") return \"Unavailable\";",
    "    return replay.state || \"Loaded\";",
    "  }",
    "",
    "  function replayStatusKind(replay, freshness) {",
    "    if (freshness.state === \"unavailable\") return \"error\";",
    "    if (freshness.state === \"stale\") return \"warning\";",
    "    return replay.state === \"available\" ? \"ok\" : \"warning\";",
    "  }",
    "",
    "  function formatRuntimeAction(action) {",
    "    if (!action || typeof action !== \"object\" || Array.isArray(action)) return \"none\";",
    "    if (action.type === \"plan\") return `plan: ${action.providerLabel || \"planner\"} ${action.command || \"\"}`.trim();",
    "    if (action.type === \"type_text\") return `type_text: ${action.textLength || 0} chars`;",
    "    if (action.type === \"press_key\") return `press_key: ${action.key || \"unknown\"}`;",
    "    if (action.type === \"verify\") return formatRuntimeVerification(action);",
    "    if (action.type === \"activate_app\" || action.type === \"open_session\") return `${action.type}: ${action.appName || action.bundleId || \"unknown app\"}`;",
    "    if (action.type === \"recover\" || action.type === \"switch_control\") return `${action.type}: ${action.action || action.from || \"\"}${action.to ? ` -> ${action.to}` : \"\"}${action.reason ? ` - ${action.reason}` : \"\"}`.trim();",
    "    return `${action.type || \"action\"}${action.message ? `: ${action.message}` : \"\"}`;",
    "  }",
    "",
    "  function formatRuntimeVerification(verification) {",
    "    if (!verification || typeof verification !== \"object\" || Array.isArray(verification)) return \"none\";",
    "    const action = verification.actionType || verification.type || \"verification\";",
    "    const status = verification.status || \"unknown\";",
    "    const detail = verification.message || verification.reason;",
    "    return `${action}: ${status}${detail ? ` - ${detail}` : \"\"}`;",
    "  }",
    "",
    "  function formatRuntimeScreenshot(screenshot) {",
    "    if (!screenshot || typeof screenshot !== \"object\" || Array.isArray(screenshot)) return \"none\";",
    "    const stage = screenshot.stage || \"screenshot\";",
    "    const path = screenshot.path || \"no path\";",
    "    const recommendation = screenshot.recommendation ? ` ${screenshot.recommendation}` : \"\";",
    "    const sources = Number.isFinite(screenshot.sourceCount) ? ` ${screenshot.sourceCount} sources` : \"\";",
    "    return `${stage}: ${path}${recommendation || sources ? ` (${`${recommendation}${sources}`.trim()})` : \"\"}`;",
    "  }",
    "",
    "  function formatRuntimeTimelineTail(timelineTail) {",
    "    const items = readArray(timelineTail).slice(-3);",
    "    if (items.length === 0) return \"none\";",
    "    return items.map((event) => `${event.status || \"event\"}: ${event.message || event.command || \"\"}`.trim()).join(\" | \");",
    "  }",
    "",
    "  function renderAppPolicyPanel(snapshot) {",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const extension = runtime.extension || {};",
    "    const hostPolicy = extension.hostPolicy || {};",
    "    const policy = hostPolicy.policy || {};",
    "    const target = panelBody(\"app-policy\");",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    target.append(createMetricList([",
    "      row(\"chrome policy\", hostPolicy.state),",
    "      row(\"source\", hostPolicy.source),",
    "      row(\"updated\", hostPolicy.updatedAt),",
    "      row(\"entries\", formatChromePolicyEntries(hostPolicy, policy)),",
    "      row(\"default\", policy.defaultMode),",
    "      row(\"always allow\", policy.allowedHosts),",
    "      row(\"current turn\", policy.currentTurnAllowedHosts),",
    "      row(\"blocked\", policy.blockedHosts),",
    "      row(\"endpoint\", \"/api/chrome-host-policy\")",
    "    ]));",
    "    target.append(createChromePolicyControls(snapshot));",
    "    setStatus(\"app-policy\", hostPolicy.state || \"Unknown\", hostPolicy.state === \"invalid\" ? \"error\" : \"ok\");",
    "  }",
    "",
    "  function formatChromePolicyEntries(hostPolicy, policy) {",
    "    const entries = readArray(hostPolicy && hostPolicy.entries);",
    "    const formattedEntries = entries.length > 0 ? entries : [",
    "      ...readArray(policy && policy.allowedHosts).map((host) => ({ decision: \"allow\", scope: \"always\", host })),",
    "      ...readArray(policy && policy.currentTurnAllowedHosts).map((host) => ({ decision: \"allow\", scope: \"current-turn\", host })),",
    "      ...readArray(policy && policy.blockedHosts).map((host) => ({ decision: \"block\", scope: \"host\", host }))",
    "    ];",
    "    if (formattedEntries.length === 0) return \"none\";",
    "    return formattedEntries.map((entry) => `${entry.decision || \"policy\"}:${entry.scope || \"host\"}:${entry.host || \"unknown\"}`).join(\", \");",
    "  }",
    "",
    "  function createChromePolicyControls(snapshot) {",
    "    const controls = document.createElement(\"form\");",
    "    controls.className = \"policy-controls\";",
    "    controls.setAttribute(\"data-chrome-policy-controls\", \"\");",
    "    controls.addEventListener(\"submit\", (event) => event.preventDefault());",
    "",
    "    const label = document.createElement(\"label\");",
    "    label.className = \"policy-host-control\";",
    "    const labelText = document.createElement(\"span\");",
    "    labelText.textContent = \"Current host\";",
    "    const input = document.createElement(\"input\");",
    "    input.type = \"text\";",
    "    input.name = \"host\";",
    "    input.autocomplete = \"off\";",
    "    input.spellcheck = false;",
    "    input.placeholder = suggestChromePolicyHost(snapshot) || \"example.com or https://example.com\";",
    "    input.value = chromeHostPolicyDraftHost;",
    "    input.setAttribute(\"aria-label\", \"Chrome host policy host\");",
    "    input.setAttribute(\"data-chrome-policy-host-input\", \"\");",
    "    input.addEventListener(\"input\", () => {",
    "      chromeHostPolicyDraftHost = input.value;",
    "    });",
    "    label.append(labelText, input);",
    "",
    "    const actions = document.createElement(\"div\");",
    "    actions.className = \"policy-actions\";",
    "    actions.append(",
    "      createChromePolicyButton(\"refresh\", \"Refresh\"),",
    "      createChromePolicyButton(\"always-allow\", \"Always\"),",
    "      createChromePolicyButton(\"allow-current-turn\", \"Allow turn\"),",
    "      createChromePolicyButton(\"block\", \"Block\"),",
    "      createChromePolicyButton(\"ask\", \"Ask\"),",
    "      createChromePolicyButton(\"reset\", \"Reset\")",
    "    );",
    "",
    "    const feedback = document.createElement(\"p\");",
    "    feedback.className = \"policy-feedback\";",
    "    feedback.setAttribute(\"data-chrome-policy-feedback\", \"\");",
    "    feedback.textContent = chromeHostPolicyFeedback;",
    "",
    "    controls.addEventListener(\"click\", (event) => {",
    "      if (!(event.target instanceof Element)) return;",
    "      const button = event.target.closest(\"button[data-policy-action]\");",
    "      if (!button) return;",
    "      event.preventDefault();",
    "      void updateChromePolicyFromDashboard(button.getAttribute(\"data-policy-action\") || \"\", input, feedback, button);",
    "    });",
    "    controls.append(label, actions, feedback);",
    "    return controls;",
    "  }",
    "",
    "  function createChromePolicyButton(action, label) {",
    "    const button = document.createElement(\"button\");",
    "    button.type = \"button\";",
    "    button.textContent = label;",
    "    button.setAttribute(\"data-policy-action\", action);",
    "    return button;",
    "  }",
    "",
    "  function suggestChromePolicyHost(snapshot) {",
    "    const command = snapshot && snapshot.currentTurn && snapshot.currentTurn.command;",
    "    if (typeof command !== \"string\") return \"\";",
    "    const match = command.match(/https?:\\/\\/[^\\s)]+/i);",
    "    if (!match) return \"\";",
    "    try {",
    "      return new URL(match[0]).hostname;",
    "    } catch {",
    "      return \"\";",
    "    }",
    "  }",
    "",
    "  async function updateChromePolicyFromDashboard(action, input, feedback, button) {",
    "    const host = input.value.trim();",
    "    chromeHostPolicyDraftHost = host;",
    "    if (action !== \"refresh\" && action !== \"reset\" && !host) {",
    "      setChromePolicyFeedback(feedback, \"Enter a host before setting policy.\");",
    "      return;",
    "    }",
    "",
    "    button.disabled = true;",
    "    setChromePolicyFeedback(feedback, action === \"refresh\" ? \"Refreshing policy...\" : \"Updating policy...\");",
    "    try {",
    "      if (action === \"refresh\") {",
    "        setChromePolicyFeedback(feedback, \"Policy refreshed.\");",
    "        await loadSnapshot();",
    "        return;",
    "      }",
    "",
    "      const response = await fetch(\"/api/chrome-host-policy\", {",
    "        method: \"POST\",",
    "        headers: { \"content-type\": \"application/json\" },",
    "        body: JSON.stringify(action === \"reset\" ? { action } : { action, host })",
    "      });",
    "      const payload = await response.json().catch(() => ({}));",
    "      if (!response.ok) {",
    "        const message = payload && payload.error && payload.error.message;",
    "        throw new Error(message || `Policy request failed: ${response.status}`);",
    "      }",
    "      setChromePolicyFeedback(feedback, payload && payload.result ? `Policy ${payload.result}.` : \"Policy updated.\");",
    "      await loadSnapshot();",
    "    } catch (error) {",
    "      setChromePolicyFeedback(feedback, error instanceof Error ? error.message : String(error));",
    "    } finally {",
    "      button.disabled = false;",
    "    }",
    "  }",
    "",
    "  function setChromePolicyFeedback(feedback, message) {",
    "    chromeHostPolicyFeedback = message;",
    "    feedback.textContent = message;",
    "  }",
    "",
    "  function renderSmokeEvidencePanel(snapshot) {",
    "    const artifacts = (snapshot.smokeEvidence && snapshot.smokeEvidence.artifacts) || [];",
    "    const target = panelBody(\"smoke-evidence\");",
    "    if (!target) return;",
    "    const items = artifacts.map((artifact) => `${artifact.target || \"unknown\"}: ${artifact.result || \"unknown\"}${artifact.stale ? \" (stale)\" : \"\"}`);",
    "    const hasStale = artifacts.some((artifact) => artifact.stale);",
    "    target.replaceChildren();",
    "    if (items.length === 0) {",
    "      const empty = document.createElement(\"p\");",
    "      empty.className = \"muted\";",
    "      empty.textContent = \"No smoke artifacts found.\";",
    "      target.append(empty);",
    "    } else {",
    "      const list = document.createElement(\"ul\");",
    "      list.className = \"event-list\";",
    "      for (const item of items) {",
    "        const entry = document.createElement(\"li\");",
    "        entry.textContent = item;",
    "        list.append(entry);",
    "      }",
    "      target.append(list);",
    "    }",
    "    const chromeArtifact = findSmokeArtifact(snapshot, \"chrome\");",
    "    target.append(createMetricList(createChromePageSafetyRows(chromeArtifact)));",
    "    target.append(createMetricList(createChromePageControlRows(snapshot, chromeArtifact)));",
    "    const finderArtifact = findSmokeArtifact(snapshot, \"finder\");",
    "    target.append(createMetricList(createFinderSmokeRows(finderArtifact)));",
    "    setStatus(\"smoke-evidence\", hasStale ? \"Stale\" : \"Fresh\", hasStale ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function createChromePageSafetyRows(chromeArtifact) {",
    "    const pageSafety = readChromePageSafetySummary(chromeArtifact);",
    "    return [",
    "      row(\"chrome page safety\", pageSafety.state),",
    "      row(\"sensitive pause\", pageSafety.sensitivePause),",
    "      row(\"pause count\", pageSafety.pauseCount),",
    "      row(\"checked runs\", pageSafety.checkedRuns),",
    "      row(\"finding kinds\", pageSafety.findingKinds),",
    "      row(\"sensitive page\", formatChromePageSafetyRun(pageSafety, \"sensitive-page\")),",
    "      row(\"form prefill\", formatChromePageSafetyRun(pageSafety, \"sensitive-form-prefill\")),",
    "      row(\"safety reason\", formatChromePageSafetyReason(pageSafety)),",
    "      row(\"safety source\", pageSafety.source)",
    "    ];",
    "  }",
    "",
    "  function createChromePageControlRows(snapshot, chromeArtifact) {",
    "    const pageControl = readChromePageControlSummary(snapshot.runtimeHealth || {}, chromeArtifact);",
    "    const capabilities = pageControl.capabilities || {};",
    "    return [",
    "      row(\"chrome pageControl\", pageControl.state || \"not-probed\"),",
    "      row(\"pageControl capable\", pageControl.capable === true ? \"capable\" : \"not capable\"),",
    "      row(\"active tab\", formatChromePageControlActiveTab(pageControl.activeTab)),",
    "      row(\"content script\", formatChromePageControlContentScript(pageControl.contentScript)),",
    "      row(\"DOM actions\", formatChromePageControlCapability(capabilities.domActions)),",
    "      row(\"screenshot\", formatChromePageControlCapability(capabilities.screenshot)),",
    "      row(\"click/fill/submit/scroll\", formatChromePageControlActions(capabilities)),",
    "      row(\"pageControl reason\", pageControl.reason),",
    "      row(\"pageControl next\", pageControl.nextAction || \"needs-action\"),",
    "      row(\"pageControl source\", pageControl.source)",
    "    ];",
    "  }",
    "",
    "  function readChromePageControlSummary(runtime, chromeArtifact) {",
    "    const extension = runtime && runtime.extension || {};",
    "    if (extension.pageControl && typeof extension.pageControl === \"object\" && !Array.isArray(extension.pageControl)) return extension.pageControl;",
    "    if (chromeArtifact && chromeArtifact.pageControl && typeof chromeArtifact.pageControl === \"object\" && !Array.isArray(chromeArtifact.pageControl)) return chromeArtifact.pageControl;",
    "    return {",
    "      schemaVersion: 1,",
    "      state: \"not-probed\",",
    "      source: \"dashboard-empty\",",
    "      capable: false,",
    "      reason: \"Chrome pageControl readiness has not been probed yet.\",",
    "      capabilities: {},",
    "      nextAction: \"Probe pageControl readiness from Chrome extension diagnostics.\"",
    "    };",
    "  }",
    "",
    "  function formatChromePageControlActiveTab(activeTab) {",
    "    if (!activeTab || typeof activeTab !== \"object\" || Array.isArray(activeTab)) return \"not-probed\";",
    "    const state = activeTab.state || \"unknown\";",
    "    const host = activeTab.host || \"unknown-host\";",
    "    const tabId = Number.isInteger(activeTab.tabId) ? ` tab ${activeTab.tabId}` : \"\";",
    "    return `${state} ${host}${tabId}`;",
    "  }",
    "",
    "  function formatChromePageControlContentScript(contentScript) {",
    "    if (!contentScript || typeof contentScript !== \"object\" || Array.isArray(contentScript)) return \"not-probed\";",
    "    return `${contentScript.state || \"unknown\"}${contentScript.reason ? ` - ${contentScript.reason}` : contentScript.lastError ? ` - ${contentScript.lastError}` : \"\"}`;",
    "  }",
    "",
    "  function formatChromePageControlCapability(value) {",
    "    if (value === true) return \"ready\";",
    "    if (value === false) return \"needs-action\";",
    "    if (typeof value === \"string\" && value.length > 0) return value;",
    "    return \"not-probed\";",
    "  }",
    "",
    "  function formatChromePageControlActions(capabilities) {",
    "    return [\"click\", \"fill\", \"submit\", \"scroll\"].map((key) => `${key}:${formatChromePageControlCapability(capabilities && capabilities[key])}`).join(\", \");",
    "  }",
    "",
    "  function createFinderSmokeRows(finderArtifact) {",
    "    const finder = readFinderSmokeSummary(finderArtifact);",
    "    const desktopPreflight = finder.desktopPreflight || {};",
    "    const finderObservation = finder.finderObservation || {};",
    "    return [",
    "      row(\"finder smoke\", finder.result),",
    "      row(\"desktop preflight\", formatFinderSmokeProbe(desktopPreflight)),",
    "      row(\"frontmost bundle\", desktopPreflight.frontmostBundleId),",
    "      row(\"display asleep\", desktopPreflight.mainDisplayAsleep),",
    "      row(\"desktop controllable\", desktopPreflight.controllable),",
    "      row(\"finder observation\", formatFinderSmokeProbe(finderObservation)),",
    "      row(\"accessibility trusted\", finderObservation.accessibilityTrusted),",
    "      row(\"finder semantic\", formatFinderSmokeProbe(finder.finderSemanticObservation)),",
    "      row(\"finder drag/drop\", formatFinderSmokeProbe(finder.finderItemDragDrop)),",
    "      row(\"finder reason\", finder.reason),",
    "      row(\"finder source\", finder.source)",
    "    ];",
    "  }",
    "",
    "  function readFinderSmokeSummary(finderArtifact) {",
    "    const finder = finderArtifact && finderArtifact.finder;",
    "    if (finder && typeof finder === \"object\" && !Array.isArray(finder)) return finder;",
    "    return {",
    "      result: \"missing\",",
    "      source: \"finder-smoke-empty\",",
    "      reason: \"Latest Finder smoke has not reported desktop preflight evidence yet.\"",
    "    };",
    "  }",
    "",
    "  function formatFinderSmokeProbe(probe) {",
    "    if (!probe || typeof probe !== \"object\" || Array.isArray(probe)) return \"missing\";",
    "    const result = probe.result || \"unknown\";",
    "    return `${result}${probe.reason ? ` - ${probe.reason}` : \"\"}`;",
    "  }",
    "",
    "  function readChromePageSafetySummary(chromeArtifact) {",
    "    const pageSafety = chromeArtifact && chromeArtifact.pageSafety;",
    "    if (pageSafety && typeof pageSafety === \"object\" && !Array.isArray(pageSafety)) return pageSafety;",
    "    return {",
    "      state: \"empty\",",
    "      source: \"chrome-smoke-empty\",",
    "      sensitivePause: false,",
    "      pauseCount: 0,",
    "      checkedRuns: 0,",
    "      reason: \"Latest Chrome smoke has not reported page-level safety evidence yet.\"",
    "    };",
    "  }",
    "",
    "  function formatChromePageSafetyRun(pageSafety, kind) {",
    "    const run = readArray(pageSafety.runs).find((entry) => entry && entry.kind === kind);",
    "    if (!run) return \"missing\";",
    "    const paused = run.sensitivePause ? \"paused\" : \"not paused\";",
    "    return `${run.result || \"unknown\"} (${paused})${run.reason ? ` - ${run.reason}` : \"\"}`;",
    "  }",
    "",
    "  function formatChromePageSafetyReason(pageSafety) {",
    "    if (pageSafety.reason) return pageSafety.reason;",
    "    const runReason = readArray(pageSafety.runs).map((run) => run && run.reason).find(Boolean);",
    "    if (runReason) return runReason;",
    "    const findingReason = readArray(pageSafety.findingReasons).find(Boolean);",
    "    return findingReason || \"-\";",
    "  }",
    "",
    "  function renderLongHorizonPanel(snapshot) {",
    "    const longHorizon = snapshot.longHorizon || {};",
    "    const activePane = longHorizon.activePane || {};",
    "    const recommendation = longHorizon.recommendation || {};",
    "    setRows(\"long-horizon-supervision\", [",
    "      row(\"state\", longHorizon.state),",
    "      row(\"session\", longHorizon.session),",
    "      row(\"source\", longHorizon.source),",
    "      row(\"active pane\", activePane.id),",
    "      row(\"command\", activePane.currentCommand),",
    "      row(\"recommend\", recommendation.action),",
    "      row(\"reason\", recommendation.reason),",
    "      row(\"mutates\", longHorizon.mutatesSession),",
    "      row(\"probes\", longHorizon.probeCommands && longHorizon.probeCommands.length)",
    "    ], longHorizon.state || \"Unknown\", longHorizon.state === \"observing\" ? \"ok\" : \"warning\");",
    "  }",
    "",
    "  function groupAlerts(alerts) {",
    "    const groups = new Map();",
    "    for (const alert of alerts) {",
    "      const group = classifyAlertGroup(alert);",
    "      if (!groups.has(group.id)) {",
    "        groups.set(group.id, { ...group, alerts: [], severityRank: 0 });",
    "      }",
    "      const bucket = groups.get(group.id);",
    "      bucket.alerts.push(alert);",
    "      bucket.severityRank = Math.max(bucket.severityRank, alertSeverityRank(alert));",
    "    }",
    "    return Array.from(groups.values()).sort((left, right) => right.severityRank - left.severityRank || left.order - right.order);",
    "  }",
    "",
    "  function classifyAlertGroup(alert) {",
    "    const code = String(alert && alert.code || \"\");",
    "    if (code.startsWith(\"desktop-\") || code === \"desktop-session-blocked\") return { id: \"desktop\", label: \"Desktop session\", order: 10 };",
    "    if (code.includes(\"recording\") || code.includes(\"accessibility\") || code.includes(\"finder-automation\")) return { id: \"permissions\", label: \"Permissions\", order: 20 };",
    "    if (code.startsWith(\"chrome-\") || code.startsWith(\"extension-\")) return { id: \"chrome\", label: \"Chrome bridge\", order: 30 };",
    "    if (code.startsWith(\"smoke-\")) return { id: \"evidence\", label: \"Smoke evidence\", order: 40 };",
    "    if (code.startsWith(\"release-\")) return { id: \"release\", label: \"Release drift\", order: 50 };",
    "    if (code.startsWith(\"runtime-snapshot\")) return { id: \"runtime\", label: \"Runtime snapshot\", order: 60 };",
    "    return { id: \"other\", label: \"Other\", order: 90 };",
    "  }",
    "",
    "  function alertSeverityRank(alert) {",
    "    if (alert && alert.severity === \"error\") return 3;",
    "    if (alert && alert.severity === \"warning\") return 2;",
    "    if (alert && alert.severity === \"info\") return 1;",
    "    return 0;",
    "  }",
    "",
    "  function createAlertBand(group) {",
    "    const section = document.createElement(\"section\");",
    "    section.className = \"alert-band\";",
    "    section.setAttribute(\"data-alert-group\", group.id);",
    "    section.setAttribute(\"data-alert-severity\", group.alerts.some((alert) => alert.severity === \"error\") ? \"error\" : group.alerts.some((alert) => alert.severity === \"warning\") ? \"warning\" : \"info\");",
    "    const heading = document.createElement(\"h3\");",
    "    heading.textContent = group.label;",
    "    const list = document.createElement(\"ul\");",
    "    list.className = \"event-list\";",
    "    for (const alert of group.alerts) {",
    "      const item = document.createElement(\"li\");",
    "      item.textContent = `${alert.severity || \"info\"}: ${alert.code || \"alert\"} - ${alert.message || \"\"}`;",
    "      list.append(item);",
    "    }",
    "    section.append(heading, list);",
    "    return section;",
    "  }",
    "",
    "  function renderAlertsPanel(snapshot) {",
    "    const alerts = snapshot.alerts || [];",
    "    const hasError = alerts.some((alert) => alert.severity === \"error\");",
    "    const hasWarning = alerts.some((alert) => alert.severity === \"warning\");",
    "    const target = panelBody(\"alerts\");",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    if (alerts.length === 0) {",
    "      const empty = document.createElement(\"p\");",
    "      empty.className = \"muted\";",
    "      empty.textContent = \"No alerts.\";",
    "      target.append(empty);",
    "      setStatus(\"alerts\", \"Clear\", \"ok\");",
    "      return;",
    "    }",
    "    const container = document.createElement(\"div\");",
    "    container.className = \"alert-groups\";",
    "    container.setAttribute(\"data-alert-groups\", \"\");",
    "    for (const group of groupAlerts(alerts)) {",
    "      container.append(createAlertBand(group));",
    "    }",
    "    target.append(container);",
    "    setStatus(\"alerts\", hasError ? \"Blocked\" : \"Attention\", hasError ? \"error\" : hasWarning ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderDogfoodReleasePanel(snapshot) {",
    "    const release = snapshot.dogfoodRelease || {};",
    "    const alpha = release.latestAlpha || {};",
    "    const cohort = release.cohort || {};",
    "    const drift = release.releaseDrift || {};",
    "    setRows(\"dogfood-release\", [",
    "      row(\"state\", release.state),",
    "      row(\"alpha\", alpha.tagName || alpha.state),",
    "      row(\"manifest\", release.manifest && release.manifest.state),",
    "      row(\"cohort ready\", cohort.ready),",
    "      row(\"reports\", cohort.acceptedReportCount),",
    "      row(\"drift\", drift.state)",
    "    ], release.state || \"Unknown\", drift.state === \"behind-head\" ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderSnapshot(snapshot) {",
    "    renderUserDashboard(snapshot);",
    "    renderEvidenceSummaryPanel(snapshot);",
    "    renderOperatorEvidencePanel(snapshot);",
    "    renderRuntimePanel(snapshot);",
    "    renderOperatorReadinessPanel(snapshot);",
    "    renderPermissionsPanel(snapshot);",
    "    renderCurrentTurnPanel(snapshot);",
    "    renderReplayPanel(snapshot);",
    "    renderAppPolicyPanel(snapshot);",
    "    renderSmokeEvidencePanel(snapshot);",
    "    renderLongHorizonPanel(snapshot);",
    "    renderAlertsPanel(snapshot);",
    "    renderDogfoodReleasePanel(snapshot);",
    "  }",
    "",
    "  function renderLoadedSnapshot(snapshot) {",
    "    renderSnapshot(snapshot);",
    "    if (snapshotState) snapshotState.textContent = `Snapshot ${snapshot.generatedAt || \"loaded\"}`;",
    "  }",
    "",
    "  function markSnapshotUnavailable(error) {",
    "    if (snapshotState) snapshotState.textContent = `Snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`;",
    "    for (const section of document.querySelectorAll(\"[data-panel-id]\")) {",
    "      setStatus(section.getAttribute(\"data-panel-id\"), \"Unavailable\", \"error\");",
    "    }",
    "    setOperatorEvidenceStatus(\"Unavailable\", \"error\");",
    "  }",
    "",
    "  async function loadSnapshot() {",
    "    try {",
    "      const response = await fetch(\"/snapshot.json\", { cache: \"no-store\" });",
    "      if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);",
    "      const snapshot = await response.json();",
    "      renderLoadedSnapshot(snapshot);",
    "    } catch (error) {",
    "      markSnapshotUnavailable(error);",
    "    }",
    "  }",
    "",
    "  function startDashboard() {",
    "    if (typeof EventSource !== \"function\") {",
    "      void loadSnapshot();",
    "      return;",
    "    }",
    "",
    "    let receivedSnapshot = false;",
    "    const events = new EventSource(\"/events\");",
    "    events.addEventListener(\"snapshot\", (event) => {",
    "      try {",
    "        receivedSnapshot = true;",
    "        renderLoadedSnapshot(JSON.parse(event.data));",
    "      } catch (error) {",
    "        markSnapshotUnavailable(error);",
    "      }",
    "    });",
    "    events.addEventListener(\"error\", () => {",
    "      if (receivedSnapshot) {",
    "        if (snapshotState) snapshotState.textContent = \"Live updates reconnecting...\";",
    "        return;",
    "      }",
    "",
    "      events.close();",
    "      void loadSnapshot();",
    "    });",
    "  }",
    "",
    "  if (document.readyState === \"loading\") {",
    "    document.addEventListener(\"DOMContentLoaded\", startDashboard, { once: true });",
    "  } else {",
    "    startDashboard();",
    "  }",
    "})();",
    "</script>"
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

type DashboardChromeControlAction =
  | "open-popup"
  | "observe"
  | "screenshot"
  | "click"
  | "fill"
  | "submit"
  | "scroll";

function normalizeDashboardChromeControlAction(value: unknown): DashboardChromeControlAction | undefined {
  if (
    value === "open-popup"
    || value === "observe"
    || value === "screenshot"
    || value === "click"
    || value === "fill"
    || value === "submit"
    || value === "scroll"
  ) {
    return value;
  }

  return undefined;
}

function normalizeDashboardChromeExtensionId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return /^[a-z]{32}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeDashboardChromeTargetTabId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

function normalizeOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDashboardChromeAppName(value: unknown): string | undefined {
  const trimmed = normalizeOptionalNonEmptyString(value);
  if (!trimmed || trimmed.startsWith("-") || /[\0\r\n]/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function readDashboardChromeAppNameFromEnv(env: NodeJS.ProcessEnv): string {
  return normalizeDashboardChromeAppName(env.SKFIY_CHROME_APP_NAME) ?? "Google Chrome";
}

function createDashboardChromeControlEnv(
  baseEnv: NodeJS.ProcessEnv,
  chromeAppName: string
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.SKFIY_CHROME_APP_NAME = chromeAppName;

  return env;
}

function normalizeDashboardChromeScrollDelta(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function validateDashboardChromeControlArguments({
  action,
  selector,
  text,
  dy
}: {
  action: DashboardChromeControlAction;
  selector?: string;
  text?: string;
  dy?: number;
}): { code: string; message: string } | undefined {
  if ((action === "click" || action === "fill" || action === "submit") && !selector) {
    return {
      code: "selector-required",
      message: `Chrome ${action} action requires a selector.`
    };
  }
  if (action === "fill" && !text) {
    return {
      code: "text-required",
      message: "Chrome fill action requires text."
    };
  }
  if (action === "scroll" && !Number.isFinite(dy)) {
    return {
      code: "dy-required",
      message: "Chrome scroll action requires a numeric dy value."
    };
  }

  return undefined;
}

function readDashboardChromePageControl(snapshot: DashboardSnapshot): Record<string, unknown> {
  const runtime = readRecord(snapshot.runtimeHealth) ?? {};
  const extension = readRecord(runtime.extension) ?? {};

  return readRecord(extension.pageControl) ?? {};
}

function validateDashboardChromeControlEligibility({
  action,
  pageControl,
  targetTabId
}: {
  action: DashboardChromeControlAction;
  pageControl: Record<string, unknown>;
  targetTabId: number;
}): { ok: true } | { ok: false; code: string; message: string } {
  const activeTab = readRecord(pageControl.activeTab) ?? {};
  const activeTabId = normalizeDashboardChromeTargetTabId(activeTab.tabId);
  if (activeTabId !== undefined && activeTabId !== targetTabId) {
    return {
      ok: false,
      code: "target-tab-mismatch",
      message: "Chrome control action target does not match the current dashboard page."
    };
  }

  const blockers = Array.isArray(pageControl.blockers) ? pageControl.blockers : [];
  const blockerCodes = blockers
    .map((blocker) => readRecord(blocker)?.code)
    .filter((code): code is string => typeof code === "string");
  const scheme = normalizeDashboardChromeScheme(activeTab.scheme);
  const host = readDashboardChromeHost(activeTab);
  if (
    scheme === "chrome"
    || scheme === "chrome-extension"
    || scheme === "file"
    || (scheme !== "" && scheme !== "http" && scheme !== "https")
    || host.startsWith("chrome://")
    || host.startsWith("chrome-extension://")
    || blockerCodes.includes("internal_chrome_page")
    || blockerCodes.includes("chrome_extension_page")
    || blockerCodes.includes("unsupported_scheme")
  ) {
    return {
      ok: false,
      code: "unsupported-page",
      message: "Open an ordinary HTTP or HTTPS page before launching Chrome control actions."
    };
  }
  if (action === "open-popup") {
    return { ok: true };
  }
  if (pageControl.state === "blocked_by_host_policy" || blockerCodes.includes("blocked_by_host_policy")) {
    return {
      ok: false,
      code: "host-policy-blocked",
      message: "Allow this host in skfiy before launching Chrome control actions."
    };
  }
  if (
    pageControl.state === "blocked_by_chrome_host_permission"
    || blockerCodes.includes("blocked_by_chrome_host_permission")
  ) {
    return {
      ok: false,
      code: "chrome-site-access-required",
      message: "Grant Chrome site access for the current host before launching page actions."
    };
  }
  if (
    pageControl.state === "sensitive-paused"
    || blockerCodes.includes("sensitive_form")
    || blockerCodes.includes("sensitive-paused")
  ) {
    return {
      ok: false,
      code: "sensitive-paused",
      message: "This Chrome action needs explicit user approval before it can run."
    };
  }

  const capabilities = readRecord(pageControl.capabilities) ?? {};
  if (action !== "screenshot" && capabilities.domActions !== true) {
    return {
      ok: false,
      code: "dom-actions-not-ready",
      message: "Chrome DOM actions are not ready for the current page."
    };
  }

  return { ok: true };
}

function readDashboardChromeHost(activeTab: Record<string, unknown>): string {
  return typeof activeTab.host === "string" ? activeTab.host : "";
}

function normalizeDashboardChromeScheme(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/:$/, "").toLowerCase();
}

function createDashboardChromeControlArgs({
  action,
  extensionId,
  targetTabId,
  selector,
  text,
  dy
}: {
  action: DashboardChromeControlAction;
  extensionId: string;
  targetTabId: number;
  selector?: string;
  text?: string;
  dy?: number;
}): string[] {
  const args = [
    "chrome",
    action,
    "--extension-id",
    extensionId,
    "--target-tab-id",
    String(targetTabId)
  ];

  if (selector) {
    args.push("--selector", selector);
  }
  if (text) {
    args.push("--text", text);
  }
  if (Number.isFinite(dy)) {
    args.push("--dy", String(dy));
  }
  args.push("--json");

  return args;
}

function runDashboardChromeControlCommand({
  binaryPath,
  args,
  env
}: DashboardChromeControlRunnerInput): Promise<DashboardChromeControlRunnerResult> {
  return new Promise((resolve) => {
    execFile(binaryPath, args, {
      cwd: path.dirname(path.dirname(binaryPath)),
      env,
      maxBuffer: 256 * 1024
    }, (error, stdout, stderr) => {
      const nodeError = error as NodeJS.ErrnoException | null;
      resolve({
        exitCode: typeof nodeError?.code === "number" ? nodeError.code : nodeError ? 1 : 0,
        stdout,
        stderr,
        error: nodeError?.message
      });
    });
  });
}

function openDashboardChromeControlPopup({
  url,
  chromeAppName
}: DashboardChromeControlPopupOpenInput): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", ["-a", chromeAppName, url], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseDashboardChromeControlStdout(stdout: unknown): Record<string, unknown> | undefined {
  if (typeof stdout !== "string" || !stdout.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stdout);
    return readRecord(parsed) ?? undefined;
  } catch {
    return undefined;
  }
}

function readDashboardChromeControlResult(
  runResult: DashboardChromeControlRunnerResult,
  parsed: Record<string, unknown> | undefined
): DashboardChromeControlActivityEntry["result"] {
  if (parsed?.result === "verified") {
    return "verified";
  }
  if (parsed?.result === "blocked") {
    return "blocked";
  }

  return runResult.exitCode === 0 ? "verified" : "failed";
}

function readDashboardChromeControlBlockerReason(
  runResult: DashboardChromeControlRunnerResult,
  parsed: Record<string, unknown> | undefined
): string | null {
  if (typeof parsed?.reason === "string") {
    return parsed.reason;
  }
  const error = readRecord(parsed?.error);
  if (typeof error?.message === "string") {
    return error.message;
  }
  if (typeof runResult.error === "string" && runResult.error) {
    return runResult.error;
  }
  if (typeof runResult.stderr === "string" && runResult.stderr.trim()) {
    return runResult.stderr.trim().slice(0, 240);
  }

  return null;
}

function createDashboardChromeControlStdoutSummary(
  parsed: Record<string, unknown> | undefined
): Record<string, unknown> {
  return {
    result: parsed?.result,
    action: parsed?.action,
    targetTabId: parsed?.targetTabId,
    reason: parsed?.reason
  };
}

function createDashboardChromeControlActivityEntry({
  action,
  chromeAppName,
  host,
  targetTabId,
  result,
  blockerReason,
  command,
  generatedAt
}: {
  action: DashboardChromeControlAction;
  chromeAppName: string;
  host?: string;
  targetTabId: number;
  result: DashboardChromeControlActivityEntry["result"];
  blockerReason: string | null;
  command: string;
  generatedAt: string;
}): DashboardChromeControlActivityEntry {
  return {
    kind: "chrome-control-action",
    title: `Chrome ${action}`,
    target: {
      app: chromeAppName,
      host,
      tabId: targetTabId
    },
    result,
    blockerReason,
    command,
    timestamp: generatedAt
  };
}

function appendDashboardChromeControlActivity(
  store: DashboardChromeControlActivityStore | undefined,
  entry: DashboardChromeControlActivityEntry
): void {
  if (!store) {
    return;
  }

  store.entries = [...store.entries, entry].slice(-20);
}

async function persistDashboardChromeControlActivity({
  homeDir,
  entry,
  io = createDefaultDashboardChromeControlActivityIo()
}: {
  homeDir?: string;
  entry: DashboardChromeControlActivityEntry;
  io?: DashboardChromeControlActivityIo;
}): Promise<void> {
  if (!homeDir) {
    throw new Error("Home directory is required to persist Chrome control Activity.");
  }

  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  const snapshot = await readDashboardRuntimeSnapshotForActivity(snapshotPath, io);
  const currentTurn = {
    ...(readRecord(snapshot.currentTurn) ?? {}),
    chromeControlActivity: entry
  };
  const existingReplay = readRecord(snapshot.replay) ?? {};
  const existingActions = Array.isArray(existingReplay.chromeControlActions)
    ? existingReplay.chromeControlActions.filter((value) => readRecord(value))
    : [];
  const replay = {
    state: typeof existingReplay.state === "string" ? existingReplay.state : "available",
    source: typeof existingReplay.source === "string" ? existingReplay.source : "runtime-snapshot",
    ...existingReplay,
    chromeControlActions: [...existingActions, entry].slice(-20)
  };
  const nextSnapshot = {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    observedAt: entry.timestamp,
    ...snapshot,
    currentTurn,
    replay
  };
  const text = `${JSON.stringify(nextSnapshot, null, 2)}\n`;

  await io.mkdir(path.dirname(snapshotPath));
  if (io.rename) {
    const tempPath = `${snapshotPath}.tmp-${process.pid}-${Date.now()}`;
    await io.writeFile(tempPath, text);
    await io.rename(tempPath, snapshotPath);
  } else {
    await io.writeFile(snapshotPath, text);
  }
}

async function readDashboardRuntimeSnapshotForActivity(
  snapshotPath: string,
  io: DashboardChromeControlActivityIo
): Promise<Record<string, unknown>> {
  try {
    if (io.exists && !await io.exists(snapshotPath)) {
      return createEmptyDashboardRuntimeSnapshotForActivity();
    }

    const parsed = JSON.parse(await io.readFile(snapshotPath)) as unknown;
    const snapshot = readRecord(parsed);
    if (snapshot?.schemaVersion !== RUNTIME_SNAPSHOT_SCHEMA_VERSION) {
      return createEmptyDashboardRuntimeSnapshotForActivity();
    }

    return snapshot;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return createEmptyDashboardRuntimeSnapshotForActivity();
    }
    throw error;
  }
}

function createEmptyDashboardRuntimeSnapshotForActivity(): Record<string, unknown> {
  return {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    observedAt: new Date().toISOString(),
    currentTurn: {
      state: "idle",
      source: "runtime-snapshot"
    },
    replay: {
      state: "available",
      source: "runtime-snapshot",
      chromeControlActions: []
    }
  };
}

function createDefaultDashboardChromeControlActivityIo(): DashboardChromeControlActivityIo {
  return {
    mkdir: async (targetPath) => {
      await fsMkdir(targetPath, { recursive: true });
    },
    readFile: (targetPath) => fsReadFile(targetPath, "utf8"),
    writeFile: (targetPath, content) => fsWriteFile(targetPath, content, "utf8"),
    rename: (oldPath, newPath) => fsRename(oldPath, newPath)
  };
}

function attachDashboardChromeControlActivity(
  snapshot: DashboardSnapshot,
  store: DashboardChromeControlActivityStore | undefined
): DashboardSnapshot {
  if (!store || store.entries.length === 0) {
    return snapshot;
  }

  const currentTurn = {
    ...snapshot.currentTurn,
    chromeControlActivity: store.entries.at(-1)
  };
  const existingReplayActions = Array.isArray(snapshot.replay.chromeControlActions)
    ? snapshot.replay.chromeControlActions
    : [];
  const replay = {
    ...snapshot.replay,
    chromeControlActions: [...existingReplayActions, ...store.entries].slice(-20)
  };

  return {
    ...snapshot,
    currentTurn,
    replay
  };
}

function formatDashboardChromeControlCommand(binaryPath: string, args: string[]): string {
  return [binaryPath, ...args].map((part, index) => {
    if (index > 0 && args[index - 1] === "--text") {
      return "<redacted>";
    }
    return /^[A-Za-z0-9_./:=@%+-]+$/.test(part) ? part : JSON.stringify(part);
  }).join(" ");
}

function readRequestBody(request: http.IncomingMessage, maxBytes = 32_768): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        request.destroy();
        reject(new Error("Dashboard request body exceeded 32768 bytes."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseJsonObject(text: string): {
  ok: true;
  value: Record<string, unknown>;
} | {
  ok: false;
  error: string;
} {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: "Request body must be a JSON object."
      };
    }

    return {
      ok: true,
      value: parsed as Record<string, unknown>
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function createDashboardChromePolicyErrorResponse({
  generatedAt,
  code,
  message
}: {
  generatedAt: string;
  code: string;
  message: string;
}): DashboardHttpResponse {
  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard chrome policy",
    generatedAt,
    source: "dashboard",
    plannedMutation: false,
    executesSystemMutation: false,
    result: "error",
    error: {
      code,
      message
    }
  }, undefined, 400);
}

function createDashboardChromeControlErrorResponse({
  generatedAt,
  code,
  message
}: {
  generatedAt: string;
  code: string;
  message: string;
}): DashboardHttpResponse {
  return jsonResponse({
    schemaVersion: 1,
    command: "dashboard chrome control action",
    generatedAt,
    source: "dashboard",
    plannedMutation: false,
    executesSystemMutation: false,
    result: "blocked",
    error: {
      code,
      message
    }
  }, undefined, 400);
}

function normalizeDashboardChromePolicyAction(
  value: unknown
): ChromeHostPolicyAction | "reset" | undefined {
  if (value === "always-allow" || value === "always_allow") {
    return "always_allow";
  }
  if (
    value === "allow-current-turn"
    || value === "allow_current_turn"
    || value === "current-turn"
  ) {
    return "allow_current_turn";
  }
  if (value === "block" || value === "block-host" || value === "block_host") {
    return "block_host";
  }
  if (value === "ask" || value === "ask-host" || value === "ask_host") {
    return "ask_host";
  }
  if (value === "reset") {
    return "reset";
  }

  return undefined;
}

function normalizeDashboardChromePolicyHost(value: unknown): string | undefined {
  const decision = decideChromeHostPolicy(createDefaultChromeHostPolicy(), value);

  return decision.host || undefined;
}
