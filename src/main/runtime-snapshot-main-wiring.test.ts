import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  persistMainRuntimeSnapshot,
  type MainRuntimeSnapshotWriter
} from "./main-runtime-snapshot-writer";

function createWriterMock(): MainRuntimeSnapshotWriter {
  return {
    writeRuntimeSnapshot: vi.fn(async (input) => input as never),
    writeRuntimeTurnMarker: vi.fn(async (input) => input as never)
  } as unknown as MainRuntimeSnapshotWriter;
}

describe("runtime snapshot main-process wiring", () => {
  it("persists runtime snapshots and turn markers from task events", async () => {
    const writer = createWriterMock();

    await persistMainRuntimeSnapshot({
      homeDir: "/Users/tester",
      replay: null,
      currentTurnEvent: {
        status: "cancelled",
        message: "Task stopped.",
        command: "organize Downloads",
        route: "finder",
        routeReason: "Task stopped by operator.",
        stopTurnBehavior: {
          beforeStatus: "approval_required",
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        },
        replayReset: true
      },
      writer
    });

    const expectedCurrentTurn = {
      state: "cancelled",
      message: "Task stopped.",
      command: "organize Downloads",
      route: "finder",
      routeReason: "Task stopped by operator.",
      stopTurnBehavior: {
        beforeStatus: "approval_required",
        afterStatus: "cancelled",
        afterMessage: "Task stopped."
      }
    };

    expect(writer.writeRuntimeSnapshot).toHaveBeenCalledWith({
      homeDir: "/Users/tester",
      replay: null,
      currentTurn: expectedCurrentTurn
    });
    expect(writer.writeRuntimeTurnMarker).toHaveBeenCalledWith({
      homeDir: "/Users/tester",
      currentTurn: expectedCurrentTurn
    });
  });

  it("skips the turn marker when only replay changed", async () => {
    const writer = createWriterMock();

    await persistMainRuntimeSnapshot({
      homeDir: "/Users/tester",
      replay: null,
      writer
    });

    expect(writer.writeRuntimeSnapshot).toHaveBeenCalledWith({
      homeDir: "/Users/tester",
      replay: null,
      currentTurn: undefined
    });
    expect(writer.writeRuntimeTurnMarker).not.toHaveBeenCalled();
  });

  it("keeps Electron main wired through the runtime snapshot helper", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");

    expect(source).toContain("onReplayChanged");
    expect(source).toContain("persistRuntimeSnapshot(turnReplayStore.getReplay(), event)");
    expect(source).toContain("persistMainRuntimeSnapshot({");
    expect(source).not.toContain("writeRuntimeSnapshot({");
    expect(source).not.toContain("writeRuntimeTurnMarker({");
  });
});
