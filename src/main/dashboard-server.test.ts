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

  it("serves a static dashboard HTML shell that points at the descriptor endpoint", () => {
    const response = createDashboardHttpResponse({
      method: "GET",
      url: "http://127.0.0.1:8787/"
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<!doctype html>");
    expect(response.body).toContain("skfiy Dashboard");
    expect(response.body).toContain("/descriptor.json");
    expect(response.body).toContain("runtime-health");
    expect(response.body).not.toContain("token=");
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
});
