import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCliStatusEvidence, withCliStatusEvidence } from "./cli-status-evidence";

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
          freshInstall: true
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
});
