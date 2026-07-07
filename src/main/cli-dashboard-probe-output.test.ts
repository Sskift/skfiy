import { describe, expect, it } from "vitest";
import {
  createDashboardApiUrl,
  createDashboardFetchSummary,
  createDashboardProbeNotRunOutput,
  createDashboardStatusSnapshotSummary
} from "./cli-dashboard-probe-output";
import type { CliCommandInvocation } from "./cli-command-normalization";

describe("CLI dashboard probe output", () => {
  it("creates a sanitized not-run dashboard probe shape", () => {
    const invocation: Extract<CliCommandInvocation, { kind: "dashboard-probe" }> = {
      kind: "dashboard-probe",
      path: "dashboard status",
      subcommand: "status",
      json: true,
      options: {
        url: "http://127.0.0.1:8787/?token=secret"
      }
    };

    expect(createDashboardProbeNotRunOutput({
      invocation,
      generatedAt: "2026-07-07T00:00:00.000Z"
    })).toEqual({
      schemaVersion: 1,
      command: "dashboard status",
      generatedAt: "2026-07-07T00:00:00.000Z",
      executesSystemMutation: false,
      result: "not-run",
      url: "http://127.0.0.1:8787/",
      endpoints: {
        descriptor: "http://127.0.0.1:8787/descriptor.json",
        snapshot: "http://127.0.0.1:8787/snapshot.json",
        operatorEvidence: "http://127.0.0.1:8787/api/operator-evidence"
      },
      fetch: {
        descriptor: { state: "unknown" },
        snapshot: { state: "unknown" },
        operatorEvidence: { state: "unknown" }
      },
      descriptor: { state: "unknown" },
      snapshot: { state: "unknown" },
      operatorEvidence: { state: "unknown" },
      operatorReadiness: { state: "unknown" }
    });
  });

  it("summarizes fetch and snapshot output without exposing token fields", () => {
    expect(createDashboardApiUrl("http://localhost:3000/dashboard")).toBe(
      "http://localhost:3000/api/chrome-host-policy"
    );
    expect(createDashboardFetchSummary({
      state: "blocked",
      status: 403,
      url: "http://localhost:3000/descriptor.json?token=secret",
      reason: "bad token=secret"
    })).toEqual({
      state: "blocked",
      status: 403,
      url: "http://localhost:3000/descriptor.json",
      reason: "bad redacted=[redacted]"
    });

    expect(createDashboardStatusSnapshotSummary(
      { state: "reachable", status: 200 },
      {
        schemaVersion: 1,
        generatedAt: "2026-07-07T00:00:00.000Z",
        runtimeHealth: {
          dashboard: { state: "running", token: "secret" }
        },
        operatorReadiness: { state: "ready", token: "secret" },
        smokeEvidence: { artifacts: [{ target: "ui", token: "secret" }] },
        alerts: ["ok"],
        token: "secret"
      }
    )).toEqual({
      state: "reachable",
      status: 200,
      schemaVersion: 1,
      generatedAt: "2026-07-07T00:00:00.000Z",
      runtimeHealth: {
        dashboard: { state: "running", token: "[redacted]" },
        cli: { state: "unknown" },
        extension: { state: "unknown" },
        nativeHost: { state: "unknown" }
      },
      operatorReadiness: { state: "ready", token: "[redacted]" },
      smokeEvidence: { artifacts: [{ target: "ui", token: "[redacted]" }] },
      alerts: ["ok"]
    });
  });
});
