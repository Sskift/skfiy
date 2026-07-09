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
      operatorReadiness: { state: "unknown" },
      routeOutcome: { state: "unknown" }
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
        routeOutcome: {
          kind: "chrome_host_policy_denied",
          value: "chrome_host_policy_denied",
          detail: "Chrome host policy blocked token=secret.",
          token: "secret"
        },
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
      routeOutcome: {
        kind: "chrome_host_policy_denied",
        value: "chrome_host_policy_denied",
        detail: "Chrome host policy blocked redacted=[redacted]",
        token: "[redacted]"
      },
      smokeEvidence: { artifacts: [{ target: "ui", token: "[redacted]" }] },
      alerts: ["ok"]
    });
  });

  it("completes partial explicit route outcomes from snapshot route evidence", () => {
    const summary = createDashboardStatusSnapshotSummary(
      { state: "reachable", status: 200 },
      {
        schemaVersion: 1,
        generatedAt: "2026-07-07T00:00:00.000Z",
        runtimeHealth: {
          dashboard: { state: "running" }
        },
        operatorReadiness: { state: "blocked" },
        currentTurn: {
          state: "blocked",
          route: "chrome",
          routeReason: "Chrome host policy blocked token=secret-token at /Users/tester/Profile.",
          policyKind: "chrome-host-policy"
        },
        replay: {
          state: "available",
          source: "runtime-snapshot"
        },
        routeOutcome: {
          kind: "chrome_host_policy_denied"
        },
        smokeEvidence: { artifacts: [] },
        alerts: []
      }
    );

    expect(summary.routeOutcome).toMatchObject({
      kind: "chrome_host_policy_denied",
      title: "Chrome host policy denied route",
      value: "chrome_host_policy_denied",
      detail: "Chrome host policy blocked redacted=[redacted] at [path]",
      tone: "danger",
      source: "runtime-snapshot",
      routeLabel: "chrome",
      state: "blocked",
      policyKind: "chrome-host-policy"
    });
    expect(JSON.stringify(summary.routeOutcome)).not.toContain("secret-token");
    expect(JSON.stringify(summary.routeOutcome)).not.toContain("/Users/tester");
  });
});
