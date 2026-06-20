import { describe, expect, it } from "vitest";
import http from "node:http";
import { createDashboardDescriptor } from "./dashboard-status";
import {
  createDashboardHttpResponse,
  startDashboardServer
} from "./dashboard-server";

function readUrl(url: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body
        });
      });
    }).on("error", reject);
  });
}

function requestUrl(
  url: string,
  {
    method = "GET",
    body
  }: {
    method?: string;
    body?: string;
  } = {}
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method,
      headers: body ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      } : undefined
    }, (response) => {
      let responseBody = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: responseBody
        });
      });
    });

    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function readFirstSseEvent(url: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  event: string;
}> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let event = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        event += chunk;

        if (event.includes("\n\n")) {
          request.destroy();
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            event: event.slice(0, event.indexOf("\n\n") + 2)
          });
        }
      });
      response.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "ECONNRESET") {
          reject(error);
        }
      });
      response.on("end", () => {
        reject(new Error(`SSE response ended before an event: ${event}`));
      });
    });

    request.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") {
        reject(error);
      }
    });
    request.setTimeout(1_000, () => {
      request.destroy(new Error("Timed out waiting for first SSE event."));
    });
  });
}

describe("dashboard loopback HTTP response helper", () => {
  it("serves the descriptor JSON without echoing requested host or tokens", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://0.0.0.0:9999/descriptor.json"
      },
      {
        port: 8787,
        requestedHost: "0.0.0.0"
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");

    const descriptor = JSON.parse(response.body);
    expect(descriptor).toEqual(createDashboardDescriptor({ port: 8787 }));
    expect(descriptor.bind.host).toBe("127.0.0.1");
    expect(response.body).not.toContain("0.0.0.0");
    expect(response.body).not.toContain("token=");
  });

  it("serves a dashboard HTML shell that renders snapshot-backed operator panels", () => {
    const response = createDashboardHttpResponse({
      method: "GET",
      url: "http://127.0.0.1:8787/"
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<!doctype html>");
    expect(response.body).toContain("skfiy Dashboard");
    expect(response.body).toContain("/descriptor.json");
    expect(response.body).toContain("/snapshot.json");
    expect(response.body).toContain("runtime-health");
    expect(response.body).toContain("data-dashboard-root");
    expect(response.body).toContain("data-snapshot-state");
    expect(response.body).toContain("Loading snapshot");
    expect(response.body).toContain('data-panel-body="runtime-health"');
    expect(response.body).toContain('data-panel-body="long-horizon-supervision"');
    expect(response.body).toContain('data-panel-body="dogfood-release"');
    expect(response.body).toContain('new EventSource("/events")');
    expect(response.body).toContain('fetch("/snapshot.json", { cache: "no-store" })');
    expect(response.body).toContain("/api/chrome-host-policy");
    expect(response.body).toContain("renderAppPolicyPanel(snapshot)");
    expect(response.body).toContain("data-chrome-policy-host-input");
    expect(response.body).toContain("data-chrome-policy-feedback");
    expect(response.body).toContain('createChromePolicyButton("refresh", "Refresh")');
    expect(response.body).toContain('createChromePolicyButton("always-allow", "Always")');
    expect(response.body).toContain('createChromePolicyButton("block", "Block")');
    expect(response.body).toContain('createChromePolicyButton("ask", "Ask")');
    expect(response.body).toContain('createChromePolicyButton("reset", "Reset")');
    expect(response.body).toContain("formatChromePolicyEntries(hostPolicy, policy)");
    expect(response.body).toContain("renderLongHorizonPanel");
    expect(response.body).toContain("groupAlerts(alerts)");
    expect(response.body).toContain("createAlertBand(group)");
    expect(response.body).toContain("data-alert-groups");
    expect(response.body).toContain("data-alert-group");
    expect(response.body).toContain("Desktop session");
    expect(response.body).toContain("Chrome bridge");
    expect(response.body).not.toContain("token=");
  });

  it("serves a token-free initial snapshot event for local live refresh", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/events"
      },
      {
        port: 8787,
        createSnapshot: () => ({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor: createDashboardDescriptor({ port: 8787 }),
          runtimeHealth: {
            dashboard: { state: "running" }
          },
          permissions: {},
          currentTurn: { state: "idle" },
          replay: { state: "empty" },
          smokeEvidence: { artifacts: [] },
          dogfoodRelease: { state: "unknown" },
          longHorizon: { state: "unknown" },
          alerts: []
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store, no-transform");
    expect(response.body).toContain("event: snapshot\n");
    expect(response.body).toContain("data: ");
    expect(response.body).toContain('"generatedAt":"2026-06-20T00:00:00.000Z"');
    expect(response.body).not.toContain("token=");
  });

  it("serves snapshot JSON from an injected read-only provider without caching or tokens", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/snapshot.json"
      },
      {
        port: 8787,
        createSnapshot: () => ({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor: createDashboardDescriptor({ port: 8787 }),
          runtimeHealth: {
            app: { state: "installed" },
            helper: { state: "installed" },
            dashboard: { state: "running" },
            extension: { state: "unknown" }
          },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            microphone: "granted",
            speechRecognition: "not-determined",
            finderAutomation: "unknown"
          },
          currentTurn: { state: "idle" },
          replay: { state: "empty" },
          smokeEvidence: { artifacts: [] },
          dogfoodRelease: { state: "unknown" },
          longHorizon: { state: "unknown", session: "money-run" },
          alerts: []
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");

    const snapshot = JSON.parse(response.body);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      runtimeHealth: {
        app: { state: "installed" },
        dashboard: { state: "running" }
      },
      permissions: {
        screenRecording: "granted",
        finderAutomation: "unknown"
      },
      currentTurn: { state: "idle" },
      replay: { state: "empty" },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { session: "money-run" }
    });
    expect(response.body).not.toContain("token=");
  });

  it("serves a workspace-backed snapshot when a root directory is provided", () => {
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0"
      }),
      "/repo/.skfiy-smoke/ui-current.json": JSON.stringify({
        result: "passed",
        productPath: "dist/skfiy.app"
      })
    };

    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/snapshot.json"
      },
      {
        port: 8787,
        rootDir: "/repo",
        workspaceIo: {
          exists: (targetPath) =>
            Object.hasOwn(files, targetPath)
            || targetPath === "/repo/.skfiy-smoke"
            || targetPath === "/repo/dist/skfiy",
          readFile: (targetPath) => files[targetPath],
          readdir: (targetPath) =>
            targetPath === "/repo/.skfiy-smoke" ? ["ui-current.json"] : [],
          stat: () => ({ mtimeMs: 42 })
        }
      }
    );

    expect(response.status).toBe(200);
    const snapshot = JSON.parse(response.body);

    expect(snapshot.runtimeHealth).toMatchObject({
      package: {
        name: "skfiy",
        version: "0.1.0"
      },
      cli: {
        state: "installed",
        path: "/repo/dist/skfiy"
      }
    });
    expect(snapshot.smokeEvidence.artifacts).toEqual([
      {
        target: "ui",
        result: "passed",
        path: "/repo/.skfiy-smoke/ui-current.json",
        productPath: "dist/skfiy.app",
        mtimeMs: 42,
        ageSeconds: expect.any(Number),
        stale: true
      }
    ]);
    expect(snapshot.smokeEvidence.artifacts[0].ageSeconds).toBeGreaterThan(86_400);
  });

  it("keeps the response helper read-only and minimal for unsupported routes", () => {
    const response = createDashboardHttpResponse({
      method: "POST",
      url: "http://127.0.0.1:8787/descriptor.json"
    });

    expect(response).toMatchObject({
      status: 405,
      body: "Method Not Allowed\n"
    });
    expect(response.headers["allow"]).toBe("GET, HEAD");
  });

  it("starts a loopback-only dashboard server and serves descriptor JSON", async () => {
    const dashboard = await startDashboardServer({
      port: 0,
      requestedHost: "0.0.0.0"
    });

    try {
      expect(dashboard.bind.host).toBe("127.0.0.1");
      expect(dashboard.url).toBe(`http://127.0.0.1:${dashboard.bind.port}/`);

      const response = await readUrl(`${dashboard.url}descriptor.json`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");

      const descriptor = JSON.parse(response.body);
      expect(descriptor.bind).toEqual(dashboard.bind);
      expect(response.body).not.toContain("0.0.0.0");
      expect(response.body).not.toContain("token=");
    } finally {
      await dashboard.close();
    }
  });

  it("streams an initial snapshot event from the loopback dashboard server", async () => {
    const dashboard = await startDashboardServer({
      port: 0,
      requestedHost: "0.0.0.0",
      createSnapshot: ({ descriptor }) => ({
        schemaVersion: 1,
        generatedAt: "2026-06-20T00:00:00.000Z",
        descriptor,
        runtimeHealth: {
          dashboard: { state: "running" }
        },
        permissions: {},
        currentTurn: { state: "idle" },
        replay: { state: "empty" },
        smokeEvidence: { artifacts: [] },
        dogfoodRelease: { state: "unknown" },
        longHorizon: { state: "unknown" },
        alerts: []
      })
    });

    try {
      const response = await readFirstSseEvent(`${dashboard.url}events`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("no-store, no-transform");
      expect(response.event).toContain("event: snapshot\n");
      expect(response.event).toContain('"generatedAt":"2026-06-20T00:00:00.000Z"');
      expect(response.event).not.toContain("token=");
    } finally {
      await dashboard.close();
    }
  });

  it("serves local Chrome host policy show, set, and reset through the loopback server", async () => {
    const files: Record<string, string> = {};
    const chromeHostPolicyIo = {
      exists: async (targetPath: string) => Object.hasOwn(files, targetPath),
      mkdir: async () => undefined,
      readFile: async (targetPath: string) => files[targetPath],
      writeFile: async (targetPath: string, content: string) => {
        files[targetPath] = content;
      },
      rm: async (targetPath: string) => {
        delete files[targetPath];
      }
    };
    const policyPath = "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json";
    const dashboard = await startDashboardServer({
      port: 0,
      homeDir: "/Users/tester",
      chromeHostPolicyIo
    });

    try {
      const showDefault = await readUrl(`${dashboard.url}api/chrome-host-policy`);

      expect(showDefault.status).toBe(200);
      expect(showDefault.headers["cache-control"]).toBe("no-store");
      expect(JSON.parse(showDefault.body)).toMatchObject({
        command: "dashboard chrome policy show",
        executesSystemMutation: false,
        hostPolicy: {
          state: "default",
          path: policyPath,
          policy: {
            defaultMode: "ask",
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      });

      const setResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "always-allow",
          host: "https://Example.com/docs"
        })
      });

      expect(setResponse.status).toBe(200);
      expect(JSON.parse(setResponse.body)).toMatchObject({
        command: "dashboard chrome policy set",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "configured",
        action: "always_allow",
        host: "example.com",
        hostPolicy: {
          state: "configured",
          path: policyPath,
          policy: {
            allowedHosts: ["example.com"],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      });
      expect(JSON.parse(files[policyPath])).toMatchObject({
        schemaVersion: 1,
        policy: {
          allowedHosts: ["example.com"]
        }
      });

      const blockResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "block",
          host: "Example.com"
        })
      });

      expect(blockResponse.status).toBe(200);
      expect(JSON.parse(blockResponse.body)).toMatchObject({
        command: "dashboard chrome policy set",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "configured",
        action: "block_host",
        host: "example.com",
        hostPolicy: {
          state: "configured",
          policy: {
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: ["example.com"]
          }
        }
      });

      const askResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "ask",
          host: "Example.com"
        })
      });

      expect(askResponse.status).toBe(200);
      expect(JSON.parse(askResponse.body)).toMatchObject({
        command: "dashboard chrome policy set",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "configured",
        action: "ask_host",
        host: "example.com",
        hostPolicy: {
          state: "configured",
          policy: {
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      });

      const resetResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "reset"
        })
      });

      expect(resetResponse.status).toBe(200);
      expect(JSON.parse(resetResponse.body)).toMatchObject({
        command: "dashboard chrome policy reset",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "reset",
        hostPolicy: {
          state: "default",
          path: policyPath
        }
      });
      expect(files[policyPath]).toBeUndefined();
      expect(setResponse.body).not.toContain("token=");
      expect(blockResponse.body).not.toContain("token=");
      expect(askResponse.body).not.toContain("token=");
      expect(resetResponse.body).not.toContain("token=");
    } finally {
      await dashboard.close();
    }
  });
});
