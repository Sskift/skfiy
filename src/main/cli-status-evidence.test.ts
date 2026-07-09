import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCliStatusEvidence, withCliStatusEvidence } from "./cli-status-evidence";
import {
  createRuntimeSnapshotFromReplay,
  createRuntimeSnapshotStatePath
} from "./runtime-snapshot";

describe("CLI status evidence", () => {
  it("adds binary readiness, runtime snapshot, current turn, dashboard smoke, and page-control evidence", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const context = {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        generatedAt: "2026-07-07T00:00:00.000Z"
      };
      const status = {
        app: { state: "installed", path: context.appPath },
        cli: { state: "missing", path: context.cliShimPath },
        helper: { state: "installed", path: context.helperPath },
        extension: { state: "unknown" }
      };
      const evidence = createCliStatusEvidence(status, context);

      expect(evidence).toEqual(expect.objectContaining({
        schemaVersion: 1,
        source: "skfiy-status-local-evidence",
        binaryReadiness: expect.objectContaining({
          state: "needs-action",
          ready: false,
          cli: {
            state: "missing",
            path: context.cliShimPath
          }
        }),
        extensionPageControl: expect.objectContaining({
          capability: "chrome-extension-page-control",
          state: "needs-action"
        }),
        runtimeSnapshot: expect.objectContaining({
          state: "missing",
          freshInstall: true,
          routeOutcome: expect.objectContaining({
            kind: "idle",
            state: "idle",
            routeLabel: "unknown"
          })
        }),
        currentTurn: expect.objectContaining({
          state: "idle",
          source: "runtime-snapshot"
        }),
        dashboardSmoke: expect.objectContaining({
          state: "missing",
          directory: path.join(rootDir, ".skfiy-smoke")
        })
      }));
      expect(withCliStatusEvidence(status, context)).toEqual(expect.objectContaining({
        evidence,
        runtimeSnapshot: evidence.runtimeSnapshot
      }));
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("preserves token-free route outcome semantics from runtime snapshots", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
      mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
      writeFileSync(runtimeSnapshotPath, `${JSON.stringify(createRuntimeSnapshotFromReplay({
        replay: {
          transcript: {
            command: "Open Chrome with token=secret-token",
            approvalRequired: true,
            apps: [],
            screenshots: [],
            actions: [
              {
                type: "tool_result",
                turnId: "turn-1",
                toolCallId: "tool-1",
                route: "chrome",
                status: "blocked",
                summary: "Chrome route denied by app policy for token=secret-token at /Users/tester/Profile.",
                evidenceSummary: "No browser mutation executed.",
                artifactCount: 0
              }
            ],
            outcome: "blocked"
          },
          timeline: [
            {
              status: "blocked",
              route: "chrome",
              command: "Open Chrome with token=secret-token",
              message: "Chrome route denied by app policy for token=secret-token.",
              denialKind: "app_policy",
              policyKind: "app-policy",
              turnId: "turn-1",
              toolCallId: "tool-1"
            }
          ]
        },
        observedAt: "2026-07-07T00:00:00.000Z"
      }), null, 2)}\n`);

      const evidence = createCliStatusEvidence({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        extension: { state: "unknown" }
      }, {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: [],
        generatedAt: "2026-07-07T00:00:00.000Z"
      });

      expect(evidence.runtimeSnapshot).toMatchObject({
        state: "available",
        currentTurn: {
          state: "blocked",
          route: "chrome",
          latestToolStatus: "blocked"
        },
        routeOutcome: {
          kind: "app_policy_denied",
          state: "blocked",
          routeLabel: "chrome",
          detail: "Chrome route denied by app policy for redacted=[redacted]",
          denialKind: "app_policy",
          policyKind: "app-policy"
        },
        replay: {
          latestAction: {
            type: "tool_result",
            route: "chrome",
            status: "blocked",
            summary: "Chrome route denied by app policy for redacted=[redacted] at [path]",
            evidenceSummary: "No browser mutation executed.",
            artifactCount: 0
          },
          latestToolCall: {
            type: "tool_result",
            route: "chrome",
            status: "blocked",
            summary: "Chrome route denied by app policy for redacted=[redacted] at [path]"
          }
        }
      });
      expect(JSON.stringify(evidence)).not.toContain("secret-token");
      expect(JSON.stringify(evidence)).not.toContain("/Users/tester");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("validates explicit runtime snapshot route outcome before exposing CLI evidence", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
      mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
      const snapshot = {
        ...createRuntimeSnapshotFromReplay({
          replay: null,
          currentTurn: {
            status: "blocked",
            message: "Ghostty denied by app policy with token=secret-token",
            command: "open Ghostty token=secret-token",
            route: "ghostty",
            routeReason: "Ghostty denied by app policy with token=secret-token",
            denialKind: "app_policy",
            policyKind: "app-policy"
          },
          observedAt: "2026-07-07T00:00:15.000Z"
        }),
        routeOutcome: {
          kind: "not-a-route-kind",
          title: "Injected title token=secret-token",
          value: "app_policy_denied token=secret-token",
          detail: "Injected detail token=secret-token",
          tone: "loud",
          source: "runtime-snapshot token=secret-token",
          routeLabel: "ghostty token=secret-token",
          state: "blocked token=secret-token"
        }
      };
      writeFileSync(runtimeSnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

      const evidence = createCliStatusEvidence({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        extension: { state: "unknown" }
      }, {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: [],
        generatedAt: "2026-07-07T00:00:15.000Z"
      });

      expect(evidence.runtimeSnapshot).toMatchObject({
        state: "available",
        routeOutcome: {
          kind: "app_policy_denied",
          title: "Injected title redacted=[redacted]",
          value: "app_policy_denied redacted=[redacted]",
          detail: "Injected detail redacted=[redacted]",
          tone: "danger",
          source: "runtime-snapshot redacted=[redacted]",
          routeLabel: "ghostty redacted=[redacted]",
          state: "blocked redacted=[redacted]",
          denialKind: "app_policy",
          policyKind: "app-policy"
        }
      });
      expect(JSON.stringify(evidence)).not.toContain("secret-token");
      expect(JSON.stringify(evidence)).not.toContain("not-a-route-kind");
      expect(JSON.stringify(evidence)).not.toContain("loud");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("completes partial explicit runtime route outcomes before exposing CLI evidence", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
      mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
      const snapshot = {
        ...createRuntimeSnapshotFromReplay({
          replay: null,
          currentTurn: {
            status: "idle",
            message: "No active route."
          },
          observedAt: "2026-07-07T00:00:20.000Z"
        }),
        routeOutcome: {
          kind: "chrome_host_policy_denied",
          detail: "Chrome host policy blocked token=secret-token at /Users/tester/Profile.",
          policyKind: "chrome-host-policy"
        }
      };
      writeFileSync(runtimeSnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

      const evidence = createCliStatusEvidence({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        extension: { state: "unknown" }
      }, {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: [],
        generatedAt: "2026-07-07T00:00:20.000Z"
      });

      expect(evidence.runtimeSnapshot).toMatchObject({
        state: "available",
        routeOutcome: {
          kind: "chrome_host_policy_denied",
          title: "Chrome host policy denied route",
          value: "chrome_host_policy_denied",
          detail: "Chrome host policy blocked redacted=[redacted] at [path]",
          tone: "danger",
          source: "runtime-snapshot",
          routeLabel: "unknown",
          state: "chrome_host_policy_denied",
          policyKind: "chrome-host-policy"
        }
      });
      expect(JSON.stringify(evidence)).not.toContain("secret-token");
      expect(JSON.stringify(evidence)).not.toContain("/Users/tester");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("preserves Chrome host policy denial as a distinct route outcome from runtime snapshots", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
      mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
      writeFileSync(runtimeSnapshotPath, `${JSON.stringify(createRuntimeSnapshotFromReplay({
        replay: null,
        currentTurn: {
          status: "blocked",
          message: "Chrome host policy blocked this approved task: blocked.example",
          command: "open https://blocked.example/?token=secret-token",
          route: "chrome",
          routeReason: "Chrome host policy blocked this approved task: blocked.example",
          policyKind: "chrome-host-policy"
        },
        observedAt: "2026-07-07T00:00:30.000Z"
      }), null, 2)}\n`);

      const evidence = createCliStatusEvidence({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        extension: { state: "unknown" }
      }, {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: [],
        generatedAt: "2026-07-07T00:00:30.000Z"
      });

      expect(evidence.runtimeSnapshot).toMatchObject({
        state: "available",
        currentTurn: {
          state: "blocked",
          route: "chrome"
        },
        routeOutcome: {
          kind: "chrome_host_policy_denied",
          title: "Chrome host policy denied route",
          value: "chrome_host_policy_denied",
          state: "blocked",
          routeLabel: "chrome",
          detail: "Chrome host policy blocked this approved task: blocked.example",
          policyKind: "chrome-host-policy"
        }
      });
      expect(JSON.stringify(evidence)).not.toContain("secret-token");
      expect(JSON.stringify(evidence)).not.toContain("token=secret-token");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("preserves user denial as a distinct route outcome from runtime snapshots", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
      mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
      writeFileSync(runtimeSnapshotPath, `${JSON.stringify(createRuntimeSnapshotFromReplay({
        replay: null,
        currentTurn: {
          status: "denied",
          message: "User denied this desktop control request.",
          command: "open https://example.test/?token=secret-token",
          route: "chrome",
          routeReason: "User denied this desktop control request.",
          denialKind: "user"
        },
        observedAt: "2026-07-07T00:00:45.000Z"
      }), null, 2)}\n`);

      const evidence = createCliStatusEvidence({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        extension: { state: "unknown" }
      }, {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: [],
        generatedAt: "2026-07-07T00:00:45.000Z"
      });

      expect(evidence.runtimeSnapshot).toMatchObject({
        state: "available",
        currentTurn: {
          state: "denied",
          route: "chrome",
          denialKind: "user"
        },
        routeOutcome: {
          kind: "user_denied",
          title: "User denied route",
          value: "user_denied",
          state: "denied",
          routeLabel: "chrome",
          detail: "User denied this desktop control request.",
          denialKind: "user"
        }
      });
      expect(JSON.stringify(evidence)).not.toContain("secret-token");
      expect(JSON.stringify(evidence)).not.toContain("token=secret-token");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("preserves Task stopped as a stopped route outcome from runtime snapshots", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-root-"));
    const homeDir = mkdtempSync(path.join(tmpdir(), "skfiy-status-home-"));

    try {
      const runtimeSnapshotPath = createRuntimeSnapshotStatePath(homeDir);
      mkdirSync(path.dirname(runtimeSnapshotPath), { recursive: true });
      writeFileSync(runtimeSnapshotPath, `${JSON.stringify(createRuntimeSnapshotFromReplay({
        replay: null,
        currentTurn: {
          status: "cancelled",
          message: "Task stopped.",
          command: "stop current task"
        },
        observedAt: "2026-07-07T00:01:00.000Z"
      }), null, 2)}\n`);

      const evidence = createCliStatusEvidence({
        app: { state: "installed", path: "/repo/dist/skfiy.app" },
        cli: { state: "installed", path: "/repo/dist/skfiy" },
        helper: { state: "installed", path: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper" },
        extension: { state: "unknown" }
      }, {
        rootDir,
        homeDir,
        appPath: "/repo/dist/skfiy.app",
        helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
        cliShimPath: "/repo/dist/skfiy",
        extensionIds: [],
        generatedAt: "2026-07-07T00:01:00.000Z"
      });

      expect(evidence.runtimeSnapshot).toMatchObject({
        state: "available",
        currentTurn: {
          state: "cancelled",
          source: "runtime-snapshot"
        },
        routeOutcome: {
          kind: "stopped",
          title: "Route stopped",
          value: "stopped",
          state: "cancelled",
          routeLabel: "unknown",
          detail: "Task stopped."
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
