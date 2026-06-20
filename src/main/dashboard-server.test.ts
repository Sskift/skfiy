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
    expect(response.body).toContain("renderLongHorizonPanel");
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
});
