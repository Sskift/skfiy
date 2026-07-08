import { describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "./dashboard-data";
import { createDashboardDescriptor } from "./dashboard-status";
import { createDashboardEvidenceSummary } from "./dashboard-evidence-summary";

describe("dashboard evidence summary", () => {
  it("summarizes operator, Codex plugin, and Chrome extension evidence without leaking secrets", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const snapshot: DashboardSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        extension: {
          state: "native-host-installed",
          liveConnection: "stale"
        },
        nativeHost: {
          state: "installed",
          hostName: "com.sskift.skfiy"
        }
      },
      operatorReadiness: {
        state: "needs-evidence"
      },
      permissions: {},
      currentTurn: {
        state: "idle",
        command: "open https://example.test/?token=secret-token"
      },
      replay: {
        state: "available",
        screenshotCount: 2
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "codex-plugin",
            result: "passed",
            productPath: "codex plugin marketplace add -> installed skfiy CLI -> MCP stdio",
            ageSeconds: 30
          },
          {
            target: "chrome",
            result: "passed",
            productPath: "renderer -> preload -> main -> CDP -> Chrome",
            ageSeconds: 45,
            nativeHostBridge: {
              result: "passed"
            },
            installedExtension: {
              result: "blocked",
              blockedReason: "branded_chrome_load_extension_removed"
            }
          }
        ]
      },
      dogfoodRelease: { state: "unknown" },
      longHorizon: {
        state: "observing",
        session: "money-run",
        mutatesSession: false
      },
      alerts: [
        {
          code: "chrome-extension-heartbeat-stale",
          severity: "warning",
          message: "token=secret-token"
        }
      ]
    };

    const summary = createDashboardEvidenceSummary({ descriptor, snapshot });

    expect(summary).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      dashboard: {
        url: "http://127.0.0.1:8787/",
        bind: {
          host: "127.0.0.1",
          port: 8787
        },
        endpoint: "/api/evidence-summary"
      },
      status: {
        state: "needs-evidence",
        laneCount: 3,
        readyLaneCount: 1,
        blockedLaneCount: 0,
        attentionLaneCount: 2
      },
      outputPolicy: {
        tokenFree: true,
        source: "dashboard-evidence-summary"
      }
    });
    expect(summary.lanes.map((lane) => [lane.id, lane.state])).toEqual([
      ["computer-use-operator", "needs-evidence"],
      ["codex-plugin", "ready"],
      ["chrome-extension", "needs-evidence"]
    ]);
    expect(summary.lanes.find((lane) => lane.id === "codex-plugin")).toMatchObject({
      title: "Codex plugin",
      checks: [
        {
          id: "codex-plugin-smoke",
          state: "ready",
          value: "passed",
          ageSeconds: 30
        },
        {
          id: "codex-plugin-product-path",
          state: "ready",
          value: "codex plugin marketplace add -> installed skfiy CLI -> MCP stdio"
        }
      ]
    });
    expect(summary.lanes.find((lane) => lane.id === "computer-use-operator")).toMatchObject({
      checks: expect.arrayContaining([
        {
          id: "route-outcome",
          label: "Route outcome",
          state: "unknown",
          value: "idle"
        },
        {
          id: "route-detail",
          label: "Route detail",
          state: "unknown",
          value: "open https://example.test/?token=redacted-secret"
        }
      ])
    });
    expect(summary.lanes.find((lane) => lane.id === "chrome-extension")).toMatchObject({
      checks: expect.arrayContaining([
        {
          id: "native-host-bridge",
          label: "Packaged host bridge",
          state: "ready",
          value: "passed"
        },
        {
          id: "installed-extension",
          label: "Installed extension proof",
          state: "needs-evidence",
          value: "blocked"
        }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain("secret-token");
    expect(JSON.stringify(summary)).not.toContain("token=secret-token");
  });

  it("keeps app-policy denial distinct in the operator evidence lane", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const snapshot: DashboardSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        extension: { state: "connected", liveConnection: "connected" },
        nativeHost: { state: "installed" }
      },
      operatorReadiness: { state: "ready" },
      permissions: {},
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy. token=secret-token",
        latestMessage: "Ghostty is denied by app policy."
      },
      replay: { state: "available" },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "observing" },
      alerts: []
    };

    const lane = createDashboardEvidenceSummary({ descriptor, snapshot }).lanes
      .find((entry) => entry.id === "computer-use-operator");

    expect(lane).toMatchObject({
      state: "blocked",
      checks: expect.arrayContaining([
        {
          id: "route-outcome",
          label: "Route outcome",
          state: "blocked",
          value: "app_policy_denied"
        },
        {
          id: "route-detail",
          label: "Route detail",
          state: "blocked",
          value: "Ghostty is denied by app policy. token=redacted-secret"
        }
      ])
    });
    expect(JSON.stringify(lane)).not.toContain("secret-token");
  });

  it("keeps Chrome host policy denial distinct in the operator evidence lane", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const snapshot: DashboardSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        extension: { state: "connected", liveConnection: "connected" },
        nativeHost: { state: "installed" }
      },
      operatorReadiness: { state: "ready" },
      permissions: {},
      currentTurn: {
        state: "blocked",
        route: "chrome",
        policyKind: "chrome-host-policy",
        routeReason: "Chrome host policy blocked this approved task: token=secret-token",
        latestMessage: "Chrome host policy blocked this approved task: blocked.example"
      },
      replay: { state: "available" },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "observing" },
      alerts: []
    };

    const lane = createDashboardEvidenceSummary({ descriptor, snapshot }).lanes
      .find((entry) => entry.id === "computer-use-operator");

    expect(lane).toMatchObject({
      state: "blocked",
      checks: expect.arrayContaining([
        {
          id: "route-outcome",
          label: "Route outcome",
          state: "blocked",
          value: "chrome_host_policy_denied"
        },
        {
          id: "route-detail",
          label: "Route detail",
          state: "blocked",
          value: "Chrome host policy blocked this approved task: token=redacted-secret"
        }
      ])
    });
    expect(JSON.stringify(lane)).not.toContain("secret-token");
  });

  it("keeps explicit stop-turn results visible in the operator evidence lane", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const snapshot: DashboardSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        extension: { state: "connected", liveConnection: "connected" },
        nativeHost: { state: "installed" }
      },
      operatorReadiness: { state: "ready" },
      permissions: {},
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      },
      replay: { state: "available" },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "observing" },
      alerts: []
    };

    const lane = createDashboardEvidenceSummary({ descriptor, snapshot }).lanes
      .find((entry) => entry.id === "computer-use-operator");

    expect(lane).toMatchObject({
      checks: expect.arrayContaining([
        {
          id: "route-outcome",
          label: "Route outcome",
          state: "ready",
          value: "stopped"
        },
        {
          id: "route-detail",
          label: "Route detail",
          state: "ready",
          value: "Task stopped."
        }
      ])
    });
  });

  it("marks missing Codex plugin and broken Chrome host evidence as actionable blockers", () => {
    const descriptor = createDashboardDescriptor({ port: 0 });
    const snapshot: DashboardSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running" },
        extension: { state: "native-host-mismatched" },
        nativeHost: { state: "mismatched" }
      },
      operatorReadiness: { state: "ready" },
      permissions: {},
      currentTurn: { state: "idle" },
      replay: { state: "available" },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "observing" },
      alerts: []
    };

    const summary = createDashboardEvidenceSummary({ descriptor, snapshot });

    expect(summary.status).toMatchObject({
      state: "blocked",
      readyLaneCount: 1,
      blockedLaneCount: 1,
      attentionLaneCount: 1
    });
    expect(summary.lanes.map((lane) => [lane.id, lane.state])).toEqual([
      ["computer-use-operator", "ready"],
      ["codex-plugin", "needs-evidence"],
      ["chrome-extension", "blocked"]
    ]);
  });

  it("surfaces Chrome setup guide next actions and commands when present", () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const snapshot: DashboardSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        extension: {
          state: "native-host-missing",
          setupGuide: {
            nextActions: [
              {
                id: "install-native-host",
                title: "Install the Chrome Native Messaging host.",
                command: [
                  "skfiy",
                  "chrome",
                  "install-host",
                  "--extension-id",
                  "abcdefghijklmnopabcdefghijklmnop",
                  "token=secret-token"
                ]
              }
            ],
            installHostCommand: [
              "skfiy",
              "chrome",
              "install-host",
              "--extension-id",
              "abcdefghijklmnopabcdefghijklmnop",
              "token=secret-token"
            ],
            verifyStatusCommand: [
              "skfiy",
              "chrome",
              "status",
              "--json",
              "--extension-id",
              "abcdefghijklmnopabcdefghijklmnop"
            ],
            smokeCommand: [
              "skfiy",
              "smoke",
              "chrome",
              "--output",
              ".skfiy-smoke/chrome.json"
            ]
          }
        },
        nativeHost: {
          state: "missing",
          hostName: "com.sskift.skfiy",
          allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
        }
      },
      operatorReadiness: { state: "ready" },
      permissions: {},
      currentTurn: { state: "idle" },
      replay: { state: "available" },
      smokeEvidence: {
        artifacts: [
          {
            target: "codex-plugin",
            result: "passed",
            productPath: "codex plugin marketplace add -> installed skfiy CLI -> MCP stdio"
          }
        ]
      },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "observing" },
      alerts: []
    };

    const summary = createDashboardEvidenceSummary({ descriptor, snapshot });
    const chromeLane = summary.lanes.find((lane) => lane.id === "chrome-extension");

    expect(chromeLane).toMatchObject({
      state: "blocked",
      setupGuide: {
        source: "runtime",
        nativeHostState: "missing",
        liveConnectionState: "unknown",
        nextActions: [
          "Install the Chrome Native Messaging host. skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop token=redacted-secret"
        ],
        commands: [
          {
            id: "install-host",
            label: "Install host",
            command: "skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop token=redacted-secret"
          },
          {
            id: "status",
            label: "Status",
            command: "skfiy chrome status --json --extension-id abcdefghijklmnopabcdefghijklmnop"
          },
          {
            id: "smoke",
            label: "Smoke",
            command: "skfiy smoke chrome --output .skfiy-smoke/chrome.json"
          }
        ]
      },
      nextActions: [
        "Install the Chrome Native Messaging host. skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop token=redacted-secret"
      ]
    });
    expect(chromeLane?.checks).toEqual(expect.arrayContaining([
      {
        id: "native-host",
        label: "Native host install status",
        state: "blocked",
        value: "missing"
      },
      {
        id: "live-connection",
        label: "Live connection status",
        state: "needs-evidence",
        value: "unknown"
      }
    ]));
    expect(JSON.stringify(summary)).not.toContain("secret-token");
  });
});
