import http from "node:http";
import type {
  DashboardDescriptor,
  DashboardDescriptorInput
} from "./dashboard-status.js";
import { createDashboardDescriptor } from "./dashboard-status.js";

export interface DashboardHttpRequest {
  method?: string;
  url: string | URL;
}

export interface DashboardHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface DashboardHttpResponseOptions extends DashboardDescriptorInput {
  createDescriptor?: (input: DashboardDescriptorInput) => DashboardDescriptor;
}

export interface DashboardServer {
  bind: {
    host: "127.0.0.1";
    port: number;
  };
  url: string;
  close: () => Promise<void>;
}

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
  const server = http.createServer((request, response) => {
    const dashboardResponse = createDashboardHttpResponse({
      method: request.method,
      url: request.url ?? "/"
    }, {
      ...options,
      port: readServerPort(server)
    });

    response.writeHead(dashboardResponse.status, dashboardResponse.headers);
    response.end(dashboardResponse.body);
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

function createDescriptorFromOptions(
  options: DashboardHttpResponseOptions
): DashboardDescriptor {
  const { createDescriptor = createDashboardDescriptor, ...descriptorInput } = options;

  return createDescriptor(descriptorInput);
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

function jsonResponse(value: unknown, bodyOverride?: string): DashboardHttpResponse {
  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: bodyOverride ?? `${JSON.stringify(value)}\n`
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

function renderDashboardHtml(descriptor: DashboardDescriptor): string {
  const panels = descriptor.panels
    .map((panel) => {
      const signals = panel.signals
        .map((signal) => `<li>${escapeHtml(signal)}</li>`)
        .join("");

      return [
        `<section data-panel-id="${escapeHtml(panel.id)}">`,
        `<h2>${escapeHtml(panel.title)}</h2>`,
        `<ul>${signals}</ul>`,
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
    "body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.4;color:#111827;background:#f9fafb}",
    "main{max-width:920px;margin:0 auto}",
    "section{border:1px solid #d1d5db;background:#fff;border-radius:8px;margin:1rem 0;padding:1rem}",
    "h1,h2{margin:0 0 .5rem}",
    "a{color:#0f766e}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>skfiy Dashboard</h1>",
    '<p><a href="/descriptor.json">Dashboard descriptor</a></p>',
    panels,
    "</main>",
    "</body>",
    "</html>"
  ].join("");
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
