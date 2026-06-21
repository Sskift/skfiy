import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDashboardServerState,
  createDashboardServerStatePath,
  readDashboardServerState,
  writeDashboardServerState
} from "./dashboard-server-state";

function createTempHome(): string {
  return mkdtempSync(path.join(tmpdir(), "skfiy-dashboard-state-"));
}

describe("dashboard server state", () => {
  it("writes and reads the loopback dashboard server state", async () => {
    const homeDir = createTempHome();

    try {
      const state = createDashboardServerState({
        pid: 12345,
        url: "http://127.0.0.1:8787/",
        bind: {
          host: "127.0.0.1",
          port: 8787
        },
        startedAt: "2026-06-20T00:00:00.000Z",
        rootDir: "/repo"
      });

      const statePath = await writeDashboardServerState({
        homeDir,
        state
      });

      expect(statePath).toBe(createDashboardServerStatePath(homeDir));
      expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual(state);
      expect(readDashboardServerState(homeDir)).toEqual({
        statePath,
        state
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("returns structured reasons when state is missing or invalid", () => {
    const homeDir = createTempHome();

    try {
      const statePath = createDashboardServerStatePath(homeDir);

      expect(readDashboardServerState(homeDir)).toEqual({
        statePath,
        reason: "Dashboard server state has not been recorded yet."
      });

      mkdirSync(path.dirname(statePath), { recursive: true });
      writeFileSync(statePath, "{}\n");

      expect(readDashboardServerState(homeDir)).toEqual({
        statePath,
        reason: "Dashboard server state is not a valid skfiy state file."
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
