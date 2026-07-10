import { describe, expect, it } from "vitest";

import {
  readDashboardStatus,
  readDashboardStatusFromState,
  type DashboardStatusReaderIo
} from "./cli-dashboard-status-reader";

describe("CLI dashboard status reader", () => {
  it("discovers a running dashboard from server state and fetches status endpoints", async () => {
    const requestedUrls: string[] = [];
    const io: DashboardStatusReaderIo = {
      readServerState: () => ({
        statePath: "/home/Library/Application Support/skfiy/dashboard-server.json",
        state: {
          schemaVersion: 1,
          pid: 123,
          url: "http://127.0.0.1:8787/?token=secret",
          bind: {
            host: "127.0.0.1",
            port: 8787
          },
          startedAt: "2026-07-07T00:00:00.000Z"
        }
      }),
      isPidRunning: (pid) => pid === 123,
      fetchJson: async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/descriptor.json")) {
          return {
            state: "reachable",
            url,
            status: 200,
            body: {
              schemaVersion: 1,
              name: "skfiy-dashboard"
            }
          };
        }

        return {
          state: "reachable",
          url,
          status: 200,
          body: {
            schemaVersion: 1,
            hostPolicy: {
              state: "default"
            }
          }
        };
      }
    };

    await expect(readDashboardStatus(undefined, "/home", io)).resolves.toEqual({
      state: "running",
      url: "http://127.0.0.1:8787/?token=secret",
      source: "dashboard-server-state",
      statePath: "/home/Library/Application Support/skfiy/dashboard-server.json",
      pid: 123,
      startedAt: "2026-07-07T00:00:00.000Z",
      descriptor: {
        schemaVersion: 1,
        name: "skfiy-dashboard"
      },
      api: {
        chromeHostPolicy: {
          state: "reachable",
          url: "http://127.0.0.1:8787/api/chrome-host-policy",
          status: 200,
          body: {
            schemaVersion: 1,
            hostPolicy: {
              state: "default"
            }
          }
        }
      }
    });
    expect(requestedUrls).toEqual([
      "http://127.0.0.1:8787/descriptor.json",
      "http://127.0.0.1:8787/api/chrome-host-policy"
    ]);
  });

  it("reports stale dashboard server state without probing HTTP", () => {
    const io: DashboardStatusReaderIo = {
      readServerState: () => ({
        statePath: "/home/state.json",
        state: {
          schemaVersion: 1,
          pid: 999,
          url: "http://127.0.0.1:8787/",
          bind: {
            host: "127.0.0.1",
            port: 8787
          },
          startedAt: "2026-07-07T00:00:00.000Z"
        }
      }),
      isPidRunning: () => false
    };

    expect(readDashboardStatusFromState("/home", io)).toEqual({
      state: "not-running",
      source: "dashboard-server-state",
      statePath: "/home/state.json",
      url: "http://127.0.0.1:8787/",
      pid: 999,
      startedAt: "2026-07-07T00:00:00.000Z",
      reason: "Recorded dashboard process is no longer running."
    });
  });

  it("does not probe dashboard APIs when the descriptor is unreachable", async () => {
    const requestedUrls: string[] = [];
    const io: DashboardStatusReaderIo = {
      fetchJson: async (url) => {
        requestedUrls.push(url);

        return {
          state: "not-running",
          url,
          reason: "connect ECONNREFUSED"
        };
      }
    };

    await expect(readDashboardStatus("http://127.0.0.1:8787/", undefined, io)).resolves.toEqual({
      state: "not-running",
      url: "http://127.0.0.1:8787/",
      reason: "connect ECONNREFUSED",
      api: {
        chromeHostPolicy: {
          state: "not-probed",
          url: "http://127.0.0.1:8787/api/chrome-host-policy",
          reason: "Dashboard descriptor is not reachable."
        }
      }
    });
    expect(requestedUrls).toEqual(["http://127.0.0.1:8787/descriptor.json"]);
  });
});
