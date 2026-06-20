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
});
