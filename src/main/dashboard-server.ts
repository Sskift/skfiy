import http from "node:http";
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
  applyChromeHostPolicyAction,
  createDefaultChromeHostPolicy,
  decideChromeHostPolicy,
  readChromeHostPolicyState,
  resetChromeHostPolicyState,
  writeChromeHostPolicyState,
  type ChromeHostPolicyAction,
  type ChromeHostPolicyResetIo
} from "./chrome-host-policy.js";

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
  workspaceIo?: DashboardWorkspaceIo;
  createDescriptor?: (input: DashboardDescriptorInput) => DashboardDescriptor;
  createSnapshot?: (input: DashboardSnapshotInput) => DashboardSnapshot;
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
  const server = http.createServer((request, response) => {
    void handleDashboardServerRequest({
      request,
      response,
      server,
      options,
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

function createDescriptorFromOptions(
  options: DashboardHttpResponseOptions
): DashboardDescriptor {
  const {
    createDescriptor = createDashboardDescriptor,
    createSnapshot: _createSnapshot,
    rootDir: _rootDir,
    homeDir: _homeDir,
    chromeHostPolicyIo: _chromeHostPolicyIo,
    workspaceIo: _workspaceIo,
    ...descriptorInput
  } = options;

  return createDescriptor(descriptorInput);
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

function createSnapshotFromOptions(
  options: DashboardHttpResponseOptions,
  descriptor: DashboardDescriptor
): DashboardSnapshot {
  const { createSnapshot, rootDir, workspaceIo } = options;

  if (createSnapshot) {
    return createSnapshot({ descriptor });
  }

  if (rootDir) {
    return createDashboardWorkspaceSnapshot({
      rootDir,
      descriptor,
      io: workspaceIo
    });
  }

  return createDashboardSnapshot({ descriptor });
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
    ".dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}",
    ".panel{border:1px solid #d6dbe1;background:#fff;border-radius:8px;padding:14px;min-width:0}",
    ".panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}",
    ".panel-status{font-size:12px;color:#425466;background:#eef2f5;border:1px solid #d6dbe1;border-radius:999px;padding:2px 8px;white-space:nowrap}",
    ".signals{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}",
    ".signals span{font-size:12px;color:#425466;background:#f2f4f7;border-radius:999px;padding:2px 7px}",
    ".metric-list{display:grid;grid-template-columns:minmax(96px,140px) minmax(0,1fr);gap:7px 10px;margin:0}",
    ".metric-list dt{color:#66727f;font-size:12px}",
    ".metric-list dd{margin:0;color:#172026;font-size:13px;min-width:0;overflow-wrap:anywhere}",
    ".event-list{margin:0;padding-left:18px;color:#172026;font-size:13px}",
    ".event-list li{margin:5px 0}",
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
    "</nav>",
    "</div>",
    '<div class="dashboard-grid">',
    panels,
    "</div>",
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
    "  function setRows(id, rows, statusLabel = \"Loaded\", statusKind = \"ok\") {",
    "    const target = panelBody(id);",
    "    if (!target) return;",
    "    target.replaceChildren();",
    "    const list = document.createElement(\"dl\");",
    "    list.className = \"metric-list\";",
    "    for (const [label, value] of rows) {",
    "      const term = document.createElement(\"dt\");",
    "      term.textContent = label;",
    "      const description = document.createElement(\"dd\");",
    "      description.textContent = value;",
    "      list.append(term, description);",
    "    }",
    "    target.append(list);",
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
    "  function renderRuntimePanel(snapshot) {",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    setRows(\"runtime-health\", [",
    "      row(\"version\", runtime.package && runtime.package.version),",
    "      row(\"app\", runtime.app && runtime.app.state),",
    "      row(\"helper\", runtime.helper && runtime.helper.state),",
    "      row(\"cli\", runtime.cli && runtime.cli.state),",
    "      row(\"dashboard\", runtime.dashboard && runtime.dashboard.state),",
    "      row(\"pid\", runtime.dashboard && runtime.dashboard.pid),",
    "      row(\"uptime\", runtime.dashboard && runtime.dashboard.uptimeSeconds),",
    "      row(\"extension\", runtime.extension && runtime.extension.state),",
    "      row(\"desktop\", runtime.desktopSession && runtime.desktopSession.state)",
    "    ]);",
    "  }",
    "",
    "  function renderPermissionsPanel(snapshot) {",
    "    const permissions = snapshot.permissions || {};",
    "    const missing = Object.values(permissions).some((value) => value === \"denied\" || value === \"unknown\");",
    "    setRows(\"permissions\", [",
    "      row(\"screen\", permissions.screenRecording),",
    "      row(\"accessibility\", permissions.accessibility),",
    "      row(\"microphone\", permissions.microphone),",
    "      row(\"speech\", permissions.speechRecognition),",
    "      row(\"finder\", permissions.finderAutomation)",
    "    ], missing ? \"Needs attention\" : \"Ready\", missing ? \"warning\" : \"ok\");",
    "  }",
    "",
    "  function renderCurrentTurnPanel(snapshot) {",
    "    const turn = snapshot.currentTurn || {};",
    "    setRows(\"current-turn\", [",
    "      row(\"state\", turn.state),",
    "      row(\"target\", turn.targetApp),",
    "      row(\"risk\", turn.risk),",
    "      row(\"voice\", turn.voiceProvider),",
    "      row(\"command\", turn.command)",
    "    ], turn.state === \"idle\" ? \"Idle\" : \"Active\", turn.state === \"idle\" ? \"ok\" : \"warning\");",
    "  }",
    "",
    "  function renderReplayPanel(snapshot) {",
    "    const replay = snapshot.replay || {};",
    "    setRows(\"replay\", [",
    "      row(\"state\", replay.state),",
    "      row(\"screenshots\", replay.screenshotCount),",
    "      row(\"actions\", replay.actionCount),",
    "      row(\"verifications\", replay.verificationCount)",
    "    ]);",
    "  }",
    "",
    "  function renderAppPolicyPanel(snapshot) {",
    "    const runtime = snapshot.runtimeHealth || {};",
    "    const extension = runtime.extension || {};",
    "    const hostPolicy = extension.hostPolicy || {};",
    "    const policy = hostPolicy.policy || {};",
    "    setRows(\"app-policy\", [",
    "      row(\"chrome policy\", hostPolicy.state),",
    "      row(\"default\", policy.defaultMode),",
    "      row(\"always allow\", policy.allowedHosts),",
    "      row(\"current turn\", policy.currentTurnAllowedHosts),",
    "      row(\"blocked\", policy.blockedHosts),",
    "      row(\"endpoint\", \"/api/chrome-host-policy\")",
    "    ], hostPolicy.state || \"Unknown\", hostPolicy.state === \"invalid\" ? \"error\" : \"ok\");",
    "  }",
    "",
    "  function renderSmokeEvidencePanel(snapshot) {",
    "    const artifacts = (snapshot.smokeEvidence && snapshot.smokeEvidence.artifacts) || [];",
    "    const items = artifacts.map((artifact) => `${artifact.target || \"unknown\"}: ${artifact.result || \"unknown\"}${artifact.stale ? \" (stale)\" : \"\"}`);",
    "    const hasStale = artifacts.some((artifact) => artifact.stale);",
    "    setList(\"smoke-evidence\", items, \"No smoke artifacts found.\", hasStale ? \"Stale\" : \"Fresh\", hasStale ? \"warning\" : \"ok\");",
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
    "  function renderAlertsPanel(snapshot) {",
    "    const alerts = snapshot.alerts || [];",
    "    const items = alerts.map((alert) => `${alert.severity || \"info\"}: ${alert.code || \"alert\"} - ${alert.message || \"\"}`);",
    "    const hasError = alerts.some((alert) => alert.severity === \"error\");",
    "    setList(\"alerts\", items, \"No alerts.\", hasError ? \"Blocked\" : \"Clear\", hasError ? \"error\" : \"ok\");",
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
    "    renderRuntimePanel(snapshot);",
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
