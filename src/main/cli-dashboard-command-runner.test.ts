import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDashboardServerStatePath } from "./dashboard-server-state";
import { runSkfiyCli } from "./cli-command-runner";

function createTempRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "skfiy-cli-"));
}

describe("CLI dashboard command runner", () => {
  it("runs dashboard status and snapshot probes against loopback JSON without leaking tokens", async () => {
    const requests: string[] = [];
    const server = http.createServer((request, response) => {
      requests.push(request.url ?? "");
      response.setHeader("content-type", "application/json");

      if (request.url === "/descriptor.json") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          bind: { host: "127.0.0.1", port: 0 },
          url: "http://127.0.0.1:0/",
          auth: {
            mode: "optional-token",
            tokenPrinted: false
          },
          token: "descriptor-secret"
        }));
        return;
      }

      if (request.url === "/snapshot.json") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          runtimeHealth: {
            dashboard: { state: "running", url: "http://127.0.0.1:0/" },
            cli: { state: "installed" },
            extension: {
              state: "connected",
              authorization: "Bearer snapshot-secret"
            },
            nativeHost: { state: "installed" }
          },
          operatorReadiness: {
            state: "ready",
            extensionReadiness: {
              state: "ready",
              token: "operator-secret"
            }
          },
          smokeEvidence: {
            artifacts: [
              {
                target: "dashboard",
                result: "passed"
              }
            ]
          },
          alerts: []
        }));
        return;
      }

      if (request.url === "/api/operator-evidence") {
        response.end(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor: {
            url: "http://127.0.0.1:0/",
            token: "evidence-descriptor-secret"
          },
          snapshot: {
            readiness: {
              state: "ready",
              bearer: "Bearer evidence-secret"
            }
          },
          status: {
            state: "ready",
            dashboardUrl: "http://127.0.0.1:0/"
          },
          outputPolicy: {
            tokenFree: true,
            source: "allowlisted-dashboard-summary"
          }
        }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const dashboardUrl = `http://127.0.0.1:${address.port}/?token=super-secret`;
      const sanitizedUrl = `http://127.0.0.1:${address.port}/`;
      const statusStdout: string[] = [];
      const snapshotStdout: string[] = [];
      const stderr: string[] = [];

      await expect(runSkfiyCli({
        argv: ["dashboard", "status", "--json", "--url", dashboardUrl],
        rootDir: "/repo",
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => statusStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);
      await expect(runSkfiyCli({
        argv: ["dashboard", "snapshot", "--json", "--url", dashboardUrl],
        rootDir: "/repo",
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => snapshotStdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) }
      })).resolves.toBe(0);

      const statusOutput = JSON.parse(statusStdout.join(""));
      const snapshotOutput = JSON.parse(snapshotStdout.join(""));

      expect(statusOutput).toMatchObject({
        schemaVersion: 1,
        command: "dashboard status",
        generatedAt: "2026-06-20T00:00:00.000Z",
        executesSystemMutation: false,
        result: "ok",
        url: sanitizedUrl,
        endpoints: {
          descriptor: `${sanitizedUrl}descriptor.json`,
          snapshot: `${sanitizedUrl}snapshot.json`,
          operatorEvidence: `${sanitizedUrl}api/operator-evidence`
        },
        fetch: {
          descriptor: {
            state: "reachable",
            status: 200
          },
          snapshot: {
            state: "reachable",
            status: 200
          },
          operatorEvidence: {
            state: "reachable",
            status: 200
          }
        },
        descriptor: {
          schemaVersion: 1,
          token: "[redacted]"
        },
        snapshot: {
          schemaVersion: 1,
          runtimeHealth: {
            dashboard: { state: "running" },
            extension: {
              state: "connected",
              authorization: "[redacted]"
            }
          },
          operatorReadiness: {
            state: "ready",
            extensionReadiness: {
              token: "[redacted]"
            }
          }
        },
        operatorReadiness: {
          state: "ready",
          extensionReadiness: {
            token: "[redacted]"
          }
        },
        operatorEvidence: {
          schemaVersion: 1,
          snapshot: {
            readiness: {
              state: "ready",
              bearer: "redacted [redacted]"
            }
          },
          outputPolicy: {
            tokenFree: true
          }
        }
      });
      expect(snapshotOutput).toMatchObject({
        schemaVersion: 1,
        command: "dashboard snapshot",
        result: "ok",
        snapshot: {
          schemaVersion: 1,
          operatorReadiness: {
            state: "ready",
            extensionReadiness: {
              token: "[redacted]"
            }
          },
          runtimeHealth: {
            extension: {
              authorization: "[redacted]"
            }
          }
        }
      });
      expect(requests).toEqual([
        "/descriptor.json",
        "/snapshot.json",
        "/api/operator-evidence",
        "/descriptor.json",
        "/snapshot.json"
      ]);
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("super-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("descriptor-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("snapshot-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("operator-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("evidence-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("evidence-descriptor-secret");
      expect(`${statusStdout.join("")}\n${snapshotStdout.join("")}`).not.toContain("token=super-secret");
      expect(stderr).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("runs dashboard through the shared CLI entrypoint without printing tokens", async () => {
    const homeDir = createTempRoot();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const started: Array<{ port: number; rootDir?: string }> = [];

    try {
      await expect(runSkfiyCli({
        argv: ["dashboard", "--no-open", "--port", "0", "--json"],
        rootDir: "/repo",
        homeDir,
        generatedAt: "2026-06-20T00:00:00.000Z",
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) },
        keepDashboardAlive: false,
        dashboardServerStarter: async (input) => {
          started.push(input);
          return {
            bind: { host: "127.0.0.1", port: 51234 },
            url: "http://127.0.0.1:51234/",
            close: async () => undefined
          };
        }
      })).resolves.toBe(0);

      expect(started).toEqual([{ port: 0, rootDir: "/repo" }]);
      const statePath = createDashboardServerStatePath(homeDir);
      const output = JSON.parse(stdout.join(""));
      expect(output).toMatchObject({
        schemaVersion: 1,
        command: "dashboard",
        generatedAt: "2026-06-20T00:00:00.000Z",
        serverPid: process.pid,
        bind: {
          host: "127.0.0.1",
          port: 51234
        },
        url: "http://127.0.0.1:51234/",
        statePath,
        result: "running",
        shouldOpen: false,
        tokenPrinted: false,
        auth: {
          mode: "optional-token",
          tokenPrinted: false
        },
        updates: {
          transport: "sse",
          scope: "local-http"
        },
        eventStore: {
          mode: "append-only",
          requiredForExecution: false
        },
        descriptor: {
          bind: {
            host: "127.0.0.1",
            port: 51234
          },
          url: "http://127.0.0.1:51234/",
          auth: {
            mode: "optional-token",
            tokenPrinted: false
          },
          updates: {
            transport: "sse",
            scope: "local-http"
          },
          eventStore: {
            mode: "append-only",
            requiredForExecution: false
          }
        }
      });
      expect(JSON.parse(readFileSync(statePath, "utf8"))).toMatchObject({
        schemaVersion: 1,
        pid: process.pid,
        url: "http://127.0.0.1:51234/",
        bind: {
          host: "127.0.0.1",
          port: 51234
        },
        startedAt: "2026-06-20T00:00:00.000Z",
        rootDir: "/repo"
      });
      expect(JSON.stringify(output)).not.toContain("token=");
      expect(stderr).toEqual([]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("opens dashboard URL by default and skips opening when --no-open is set", async () => {
    const homeDir = createTempRoot();
    const openedUrls: string[] = [];
    const createBase = (stdout: string[]) => ({
      rootDir: "/repo",
      homeDir,
      generatedAt: "2026-06-20T00:00:00.000Z",
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: () => undefined },
      keepDashboardAlive: false,
      dashboardOpener: async (url: string) => {
        openedUrls.push(url);
      },
      dashboardServerStarter: async (input: { port: number; rootDir?: string }) => ({
        bind: { host: "127.0.0.1" as const, port: input.port },
        url: `http://127.0.0.1:${input.port}/`,
        close: async () => undefined
      })
    });
    const firstStdout: string[] = [];
    const secondStdout: string[] = [];

    try {
      await expect(runSkfiyCli({
        ...createBase(firstStdout),
        argv: ["dashboard", "--port", "8788", "--json"]
      })).resolves.toBe(0);
      await expect(runSkfiyCli({
        ...createBase(secondStdout),
        argv: ["dashboard", "--no-open", "--port", "8789", "--json"]
      })).resolves.toBe(0);

      expect(openedUrls).toEqual(["http://127.0.0.1:8788/"]);
      expect(JSON.parse(firstStdout.join(""))).toMatchObject({
        url: "http://127.0.0.1:8788/",
        statePath: createDashboardServerStatePath(homeDir),
        shouldOpen: true
      });
      expect(JSON.parse(secondStdout.join(""))).toMatchObject({
        url: "http://127.0.0.1:8789/",
        statePath: createDashboardServerStatePath(homeDir),
        shouldOpen: false
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
