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
        approvalState: "required",
        stopState: "available",
        latestMessage: "Approval required (low): Read-only terminal command.",
        latestAction: {
          type: "verify",
          actionType: "type_text",
          status: "passed"
        },
        latestVerification: {
          type: "verify",
          actionType: "type_text",
          status: "passed"
        },
        latestScreenshot: {
          stage: "before",
          path: "/tmp/before.png",
          recommendation: "structured_first",
          sourceCount: 0
        },
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
        screenshots: [
          {
            stage: "before",
            path: "/tmp/before.png"
          }
        ],
        actions: [
          {
            type: "plan",
            command: "pwd"
          },
          {
            type: "type_text",
            textLength: 3
          },
          {
            type: "verify",
            actionType: "type_text",
            status: "passed"
          }
        ],
        verifications: [
          {
            type: "verify",
            actionType: "type_text",
            status: "passed"
          }
        ],
        timelineTail: [
          {
            status: "approval_required",
            command: "pwd"
          }
        ],
        source: "runtime-snapshot"
      }
    });
  });

  it("records live task event state even before a replay exists", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: null,
      currentTurn: {
        status: "observing",
        message: "Capturing the desktop.",
        command: "take screenshot"
      },
      observedAt: "2026-06-20T10:01:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      observedAt: "2026-06-20T10:01:00.000Z",
      currentTurn: {
        state: "observing",
        command: "take screenshot",
        latestMessage: "Capturing the desktop.",
        approvalRequired: false,
        approvalState: "not-required",
        stopState: "available",
        source: "runtime-snapshot",
        updateSource: "live-task-event"
      },
      replay: {
        state: "empty",
        source: "runtime-snapshot"
      }
    });
  });

  it("lets the latest live event refresh replay-derived current turn state", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: createReplay(),
      currentTurn: {
        status: "completed",
        message: "Screenshot saved: /tmp/manual.png"
      },
      observedAt: "2026-06-20T10:02:00.000Z"
    })).toMatchObject({
      currentTurn: {
        state: "completed",
        command: "pwd",
        latestMessage: "Screenshot saved: /tmp/manual.png",
        updateSource: "live-task-event",
        stopState: "inactive"
      },
      replay: {
        state: "available",
        screenshotCount: 1
      }
    });
  });

  it("redacts obvious secret-bearing text from snapshot summaries", () => {
    const snapshot = createRuntimeSnapshotFromReplay({
      replay: {
        transcript: {
          command: "curl https://example.test?token=super-secret",
          approvalRequired: false,
          apps: [],
          screenshots: [],
          actions: [
            {
              type: "plan",
              providerLabel: "External CUA",
              command: "echo api_key=abc123",
              rationale: "Use Bearer abc.def as the session token."
            },
            {
              type: "type_text",
              text: "password=hidden"
            }
          ],
          outcome: "running"
        },
        timeline: [
          {
            status: "executing",
            message: "Running with secret=shh",
            command: "curl https://example.test?token=super-secret"
          }
        ]
      },
      observedAt: "2026-06-20T10:00:00.000Z"
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.currentTurn.command).toBe("curl https://example.test?token=[redacted]");
    expect(serialized).toContain("api_key=[redacted]");
    expect(serialized).toContain("Bearer [redacted]");
    expect(serialized).toContain("secret=[redacted]");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("password=hidden");
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

  it("uses an atomic temp-file rename when the runtime IO supports it", async () => {
    const files: Record<string, string> = {};
    const writes: string[] = [];
    const renames: Array<[string, string]> = [];
    const runtimePath = createRuntimeSnapshotStatePath("/Users/tester");

    await writeRuntimeSnapshot({
      homeDir: "/Users/tester",
      replay: createReplay(),
      observedAt: "2026-06-20T10:00:00.000Z",
      io: {
        mkdir: async () => {},
        writeFile: async (targetPath, content) => {
          writes.push(targetPath);
          files[targetPath] = content;
        },
        rename: async (oldPath, newPath) => {
          renames.push([oldPath, newPath]);
          files[newPath] = files[oldPath];
          delete files[oldPath];
        }
      }
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/runtime-snapshot\.json\.tmp-/);
    expect(renames).toEqual([[writes[0], runtimePath]]);
    expect(JSON.parse(files[runtimePath])).toMatchObject({
      schemaVersion: 1,
      currentTurn: {
        state: "approval_required"
      }
    });
  });
});
