import { describe, expect, it, vi } from "vitest";
import { createTmuxSupervisionReport } from "./computer-use/tmux-supervisor";
import {
  createAutomationMonitorManager,
  createAutomationMonitorStore
} from "./automation-monitor";

describe("automation monitor manager", () => {
  it("persists a skfiy-owned tmux session monitor and runs it through read-only supervision", async () => {
    const io = createMemoryIo();
    const client = {
      observeSession: vi.fn(async (sessionName: string) => createTmuxSupervisionReport({
        sessionName,
        hasSession: true,
        windowsOutput: "@4\t1\tzsh\t1\t1",
        panesOutput: `${sessionName}\t@4\t1\tzsh\t%4\t0\t1\t0\tzsh\tmoney-run-goal`,
        paneTails: {
          "%4": "Working (2m) · 1 background terminal running"
        }
      }))
    };
    const manager = createAutomationMonitorManager({
      now: () => "2026-06-25T10:00:00.000Z",
      store: createAutomationMonitorStore({
        filePath: "/state/automation-monitors.json",
        io
      }),
      tmuxClient: client
    });

    const definition = manager.upsertTmuxSessionMonitor({
      sessionName: "money-run-goal",
      label: "money-run goal",
      intervalMs: 600_000
    });
    await manager.runMonitorNow(definition.id);

    expect(client.observeSession).toHaveBeenCalledWith("money-run-goal");
    expect(manager.readSnapshot()).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-25T10:00:00.000Z",
      activeCount: 1,
      attentionCount: 0,
      monitors: [
        {
          id: "tmux-session:money-run-goal",
          kind: "tmux-session",
          label: "money-run goal",
          enabled: true,
          intervalMs: 600_000,
          sessionName: "money-run-goal",
          status: "observing",
          checkCount: 1,
          lastCheckedAt: "2026-06-25T10:00:00.000Z",
          lastSummary: "money-run-goal has 1 window, 1 pane, and no obvious block markers."
        }
      ]
    });
    expect(JSON.parse(io.files["/state/automation-monitors.json"])).toMatchObject({
      monitors: [
        {
          id: "tmux-session:money-run-goal",
          kind: "tmux-session",
          sessionName: "money-run-goal",
          intervalMs: 600_000,
          enabled: true
        }
      ],
      runtimes: [
        {
          id: "tmux-session:money-run-goal",
          status: "observing",
          checkCount: 1,
          lastCheckedAt: "2026-06-25T10:00:00.000Z",
          lastSummary: "money-run-goal has 1 window, 1 pane, and no obvious block markers."
        }
      ]
    });
  });

  it("schedules enabled monitors on skfiy-owned intervals", async () => {
    const scheduled: Array<{ intervalMs: number; callback: () => Promise<void> }> = [];
    const client = {
      observeSession: vi.fn(async (sessionName: string) => createTmuxSupervisionReport({
        sessionName,
        hasSession: true,
        windowsOutput: "@4\t1\tzsh\t1\t1",
        panesOutput: `${sessionName}\t@4\t1\tzsh\t%4\t0\t1\t0\tzsh\t`,
        paneTails: {
          "%4": "Working"
        }
      }))
    };
    const manager = createAutomationMonitorManager({
      now: () => "2026-06-25T10:05:00.000Z",
      setInterval: (callback, intervalMs) => {
        scheduled.push({ callback, intervalMs });
        return `timer-${scheduled.length}`;
      },
      clearInterval: vi.fn(),
      store: createAutomationMonitorStore({
        filePath: "/state/automation-monitors.json",
        io: createMemoryIo()
      }),
      tmuxClient: client
    });

    manager.upsertTmuxSessionMonitor({
      sessionName: "money-run-goal",
      intervalMs: 123_000
    });
    manager.start();

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.intervalMs).toBe(123_000);

    await scheduled[0]?.callback();

    expect(client.observeSession).toHaveBeenCalledWith("money-run-goal");
    expect(manager.readSnapshot().monitors[0]).toMatchObject({
      status: "observing",
      checkCount: 1
    });
  });

  it("keeps attention state when a tmux monitor detects an approval or error signal", async () => {
    const client = {
      observeSession: vi.fn(async (sessionName: string) => createTmuxSupervisionReport({
        sessionName,
        hasSession: true,
        windowsOutput: "@4\t1\tnode\t1\t1",
        panesOutput: `${sessionName}\t@4\t1\tnode\t%4\t0\t1\t0\tnode\tworker`,
        paneTails: {
          "%4": "Traceback (most recent call last):\nError: permission denied"
        }
      }))
    };
    const manager = createAutomationMonitorManager({
      now: () => "2026-06-25T10:10:00.000Z",
      store: createAutomationMonitorStore({
        filePath: "/state/automation-monitors.json",
        io: createMemoryIo()
      }),
      tmuxClient: client
    });
    const definition = manager.upsertTmuxSessionMonitor({
      sessionName: "money-run-goal",
      intervalMs: 600_000
    });

    await manager.runMonitorNow(definition.id);

    expect(manager.readSnapshot()).toMatchObject({
      attentionCount: 1,
      monitors: [
        {
          status: "needs_attention",
          lastSummary: "money-run-goal recent output contains an obvious error marker in pane %4.",
          lastReport: {
            status: "needs_attention",
            recommendation: {
              action: "inspect_output"
            }
          }
        }
      ]
    });
  });
});

function createMemoryIo() {
  const files: Record<string, string> = {};

  return {
    files,
    exists: (filePath: string) => Object.prototype.hasOwnProperty.call(files, filePath),
    mkdir: vi.fn(),
    readFile: (filePath: string) => files[filePath] ?? "",
    rename: (fromPath: string, toPath: string) => {
      files[toPath] = files[fromPath] ?? "";
      delete files[fromPath];
    },
    writeFile: (filePath: string, content: string) => {
      files[filePath] = content;
    }
  };
}
