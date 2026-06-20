import { describe, expect, it } from "vitest";
import {
  createRuntimeSnapshotFromReplay,
  createRuntimeSnapshotStatePath,
  readRuntimeSnapshotPanels,
  writeRuntimeSnapshot
} from "./runtime-snapshot";
import type { TurnReplay } from "./computer-use/turn-replay-store";

function createReplay(): TurnReplay {
  return {
    transcript: {
      command: "pwd",
      risk: {
        level: "low",
        reason: "Read-only terminal command.",
        requiresApproval: false
      },
      planner: {
        providerLabel: "External CUA",
        input: "打开 Ghostty 执行 pwd 并截图",
        command: "pwd",
        rationale: "Read the current working directory."
      },
      approvalRequired: false,
      apps: [
        {
          name: "Ghostty",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502
        }
      ],
      screenshots: [
        {
          stage: "before",
          path: "/tmp/before.png",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          accessibilityTrusted: true,
          grounding: {
            bundleId: "com.mitchellh.ghostty",
            screenshotPath: "/tmp/before.png",
            recommendation: "structured_first",
            sources: []
          }
        }
      ],
      actions: [
        { type: "plan", providerLabel: "External CUA", command: "pwd" },
        { type: "type_text", text: "pwd" },
        {
          type: "verify",
          actionType: "type_text",
          status: "passed",
          message: "type_text helper result accepted."
        }
      ],
      outcome: "running"
    },
    timeline: [
      {
        status: "approval_required",
        command: "pwd",
        message: "Approval required (low): Read-only terminal command."
      }
    ]
  };
}

describe("runtime snapshot", () => {
  it("summarizes active turn and replay state for dashboard panels", () => {
    expect(createRuntimeSnapshotStatePath("/Users/tester"))
      .toBe("/Users/tester/Library/Application Support/skfiy/runtime-snapshot.json");

    expect(createRuntimeSnapshotFromReplay({
      replay: createReplay(),
      observedAt: "2026-06-20T10:00:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      observedAt: "2026-06-20T10:00:00.000Z",
      currentTurn: {
        state: "approval_required",
        command: "pwd",
        targetApp: "Ghostty",
        targetBundleId: "com.mitchellh.ghostty",
        risk: "low",
        plannerProvider: "External CUA",
        approvalRequired: true,
        latestMessage: "Approval required (low): Read-only terminal command.",
        source: "runtime-snapshot"
      },
      replay: {
        state: "available",
        outcome: "running",
        screenshotCount: 1,
        actionCount: 3,
        verificationCount: 1,
        timelineCount: 1,
        latestMessage: "Approval required (low): Read-only terminal command.",
        source: "runtime-snapshot"
      }
    });
  });

  it("writes and reads the runtime snapshot without leaking tokens", async () => {
    const files: Record<string, string> = {};
    const mkdirs: string[] = [];

    await writeRuntimeSnapshot({
      homeDir: "/Users/tester",
      replay: createReplay(),
      observedAt: "2026-06-20T10:00:00.000Z",
      io: {
        mkdir: async (targetPath) => {
          mkdirs.push(targetPath);
        },
        writeFile: async (targetPath, content) => {
          files[targetPath] = content;
        }
      }
    });

    const runtimePath = createRuntimeSnapshotStatePath("/Users/tester");

    expect(mkdirs).toEqual([
      "/Users/tester/Library/Application Support/skfiy"
    ]);
    expect(JSON.parse(files[runtimePath])).toMatchObject({
      currentTurn: {
        state: "approval_required",
        command: "pwd"
      }
    });
    expect(files[runtimePath]).not.toContain("token=");
    expect(readRuntimeSnapshotPanels({
      homeDir: "/Users/tester",
      io: {
        exists: (targetPath) => Object.hasOwn(files, targetPath),
        readFile: (targetPath) => files[targetPath]
      }
    })).toMatchObject({
      currentTurn: {
        state: "approval_required",
        command: "pwd",
        source: "runtime-snapshot"
      },
      replay: {
        state: "available",
        screenshotCount: 1,
        source: "runtime-snapshot"
      }
    });
  });
});
