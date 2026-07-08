import { describe, expect, it } from "vitest";
import {
  createRuntimeSnapshotFromReplay,
  createRuntimeSnapshotStatePath,
  createRuntimeTurnMarker,
  createRuntimeTurnMarkerStatePath,
  readRuntimeSnapshotPanels,
  writeRuntimeSnapshot,
  writeRuntimeTurnMarker
} from "./runtime-snapshot";
import { createRuntimeSnapshotCurrentTurnFromTaskEvent } from "./main-runtime-snapshot-payload";
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
      routeOutcome: {
        kind: "approval_required",
        title: "Route approval required",
        value: "approval_required",
        state: "approval_required",
        source: "runtime-snapshot",
        routeLabel: "Ghostty",
        detail: "Approval required (low): Read-only terminal command."
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
      routeOutcome: {
        kind: "running",
        value: "observing",
        state: "observing",
        source: "runtime-snapshot",
        routeLabel: "unknown",
        detail: "Capturing the desktop."
      },
      replay: {
        state: "empty",
        source: "runtime-snapshot"
      }
    });
  });

  it("records Task stopped as a stopped route outcome", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: null,
      currentTurn: {
        status: "cancelled",
        message: "Task stopped.",
        command: "stop current task"
      },
      observedAt: "2026-06-20T10:01:10.000Z"
    })).toMatchObject({
      observedAt: "2026-06-20T10:01:10.000Z",
      currentTurn: {
        state: "cancelled",
        command: "stop current task",
        latestMessage: "Task stopped.",
        stopState: "inactive",
        updateSource: "live-task-event"
      },
      routeOutcome: {
        kind: "stopped",
        title: "Route stopped",
        value: "stopped",
        state: "cancelled",
        source: "runtime-snapshot",
        routeLabel: "unknown",
        detail: "Task stopped."
      }
    });
  });

  it("records Chrome host policy denial as a distinct blocked route outcome", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: null,
      currentTurn: createRuntimeSnapshotCurrentTurnFromTaskEvent({
        status: "blocked",
        message: "Chrome host policy blocked this approved task: blocked.example",
        command: "summarize current Chrome page",
        route: "chrome",
        routeReason: "Chrome host policy blocked this approved task: blocked.example",
        policyKind: "chrome-host-policy"
      }),
      observedAt: "2026-06-20T10:01:15.000Z"
    })).toMatchObject({
      observedAt: "2026-06-20T10:01:15.000Z",
      currentTurn: {
        state: "blocked",
        command: "summarize current Chrome page",
        route: "chrome",
        routeReason: "Chrome host policy blocked this approved task: blocked.example",
        policyKind: "chrome-host-policy",
        latestMessage: "Chrome host policy blocked this approved task: blocked.example"
      },
      routeOutcome: {
        kind: "chrome_host_policy_denied",
        title: "Chrome host policy denied route",
        value: "chrome_host_policy_denied",
        state: "blocked",
        source: "runtime-snapshot",
        routeLabel: "chrome",
        detail: "Chrome host policy blocked this approved task: blocked.example"
      }
    });
  });

  it("keeps replay timeline app-policy denial metadata in runtime route outcome", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: {
        transcript: {
          approvalRequired: false,
          apps: [],
          screenshots: [],
          actions: [],
          outcome: "blocked"
        },
        timeline: [
          {
            status: "blocked",
            command: "organize Finder",
            message: "Finder is denied by app policy. token=secret-token",
            route: "finder",
            routeReason: "Finder is denied by app policy. token=secret-token",
            denialKind: "app_policy",
            policyKind: "app-policy"
          }
        ]
      },
      observedAt: "2026-06-20T10:01:17.000Z"
    })).toMatchObject({
      observedAt: "2026-06-20T10:01:17.000Z",
      currentTurn: {
        state: "blocked",
        command: "organize Finder",
        route: "finder",
        routeReason: "Finder is denied by app policy. token=[redacted]",
        denialKind: "app_policy",
        policyKind: "app-policy",
        latestMessage: "Finder is denied by app policy. token=[redacted]"
      },
      routeOutcome: {
        kind: "app_policy_denied",
        title: "App policy denied route",
        value: "app_policy_denied",
        state: "blocked",
        source: "runtime-snapshot",
        routeLabel: "finder",
        detail: "Finder is denied by app policy. token=[redacted]"
      },
      replay: {
        timelineTail: [
          {
            status: "blocked",
            command: "organize Finder",
            route: "finder",
            routeReason: "Finder is denied by app policy. token=[redacted]",
            denialKind: "app_policy",
            policyKind: "app-policy"
          }
        ]
      }
    });
  });

  it("keeps replay timeline user denial metadata in runtime route outcome", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: {
        transcript: {
          approvalRequired: true,
          apps: [],
          screenshots: [],
          actions: [],
          outcome: "denied"
        },
        timeline: [
          {
            status: "denied",
            command: "fill Chrome form",
            message: "User denied this browser mutation.",
            route: "chrome",
            routeReason: "User denied this browser mutation.",
            denialKind: "user"
          }
        ]
      },
      observedAt: "2026-06-20T10:01:18.000Z"
    })).toMatchObject({
      observedAt: "2026-06-20T10:01:18.000Z",
      currentTurn: {
        state: "denied",
        command: "fill Chrome form",
        route: "chrome",
        routeReason: "User denied this browser mutation.",
        denialKind: "user",
        latestMessage: "User denied this browser mutation.",
        approvalState: "required"
      },
      routeOutcome: {
        kind: "user_denied",
        title: "User denied route",
        value: "user_denied",
        state: "denied",
        source: "runtime-snapshot",
        routeLabel: "chrome",
        detail: "User denied this browser mutation."
      }
    });
  });

  it("preserves live route clarification state before replay exists", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: null,
      currentTurn: {
        status: "needs_clarification",
        message: "No supported desktop control route matched this request. 请明确目标应用和动作。"
      },
      observedAt: "2026-06-20T10:01:20.000Z"
    })).toMatchObject({
      observedAt: "2026-06-20T10:01:20.000Z",
      currentTurn: {
        state: "needs_clarification",
        latestMessage: "No supported desktop control route matched this request. 请明确目标应用和动作。",
        approvalRequired: false,
        approvalState: "not-required",
        stopState: "inactive",
        updateSource: "live-task-event"
      },
      routeOutcome: {
        kind: "needs_clarification",
        title: "Route needs clarification",
        value: "needs_clarification",
        state: "needs_clarification",
        source: "runtime-snapshot",
        routeLabel: "unknown",
        detail: "No supported desktop control route matched this request. 请明确目标应用和动作。"
      }
    });
  });

  it("summarizes agent-owned tool lifecycle identity and result evidence", () => {
    expect(createRuntimeSnapshotFromReplay({
      replay: {
        transcript: {
          command: "打开 Chrome 测试页面",
          approvalRequired: true,
          apps: [],
          screenshots: [],
          actions: [
            {
              type: "tool_call",
              turnId: "turn-agent-1",
              toolCallId: "turn-agent-1-tool-1",
              route: "chrome",
              status: "planned",
              command: "打开 Chrome 测试页面"
            },
            {
              type: "approval_decision",
              turnId: "turn-agent-1",
              toolCallId: "turn-agent-1-tool-1",
              route: "chrome",
              decision: "approved"
            },
            {
              type: "tool_result",
              turnId: "turn-agent-1",
              toolCallId: "turn-agent-1-tool-1",
              route: "chrome",
              status: "completed",
              summary: "Chrome page opened.",
              evidenceSummary: "Screenshot captured.",
              artifactCount: 1
            }
          ],
          outcome: "completed"
        },
        timeline: [
          {
            status: "approval_required",
            command: "打开 Chrome 测试页面",
            turnId: "turn-agent-1",
            toolCallId: "turn-agent-1-tool-1",
            route: "chrome"
          },
          {
            status: "completed",
            command: "打开 Chrome 测试页面",
            turnId: "turn-agent-1",
            toolCallId: "turn-agent-1-tool-1",
            route: "chrome"
          }
        ]
      },
      observedAt: "2026-06-20T10:01:30.000Z"
    })).toMatchObject({
      currentTurn: {
        state: "completed",
        command: "打开 Chrome 测试页面",
        turnId: "turn-agent-1",
        toolCallId: "turn-agent-1-tool-1",
        route: "chrome",
        latestToolStatus: "completed",
        approvalRequired: true,
        approvalState: "approved",
        stopState: "inactive"
      },
      routeOutcome: {
        kind: "completed",
        title: "Route completed",
        value: "completed",
        state: "completed",
        source: "runtime-snapshot",
        routeLabel: "chrome",
        detail: "Chrome page opened."
      },
      replay: {
        state: "available",
        outcome: "completed",
        latestToolCall: {
          type: "tool_result",
          turnId: "turn-agent-1",
          toolCallId: "turn-agent-1-tool-1",
          route: "chrome",
          status: "completed",
          evidenceSummary: "Screenshot captured.",
          artifactCount: 1
        },
        timelineTail: [
          {
            status: "approval_required",
            command: "打开 Chrome 测试页面",
            turnId: "turn-agent-1",
            toolCallId: "turn-agent-1-tool-1",
            route: "chrome"
          },
          {
            status: "completed",
            command: "打开 Chrome 测试页面",
            turnId: "turn-agent-1",
            toolCallId: "turn-agent-1-tool-1",
            route: "chrome"
          }
        ]
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
    expect(snapshot.routeOutcome.detail).toBe("Running with secret=[redacted]");
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
      },
      routeOutcome: {
        kind: "approval_required",
        state: "approval_required",
        routeLabel: "Ghostty"
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

  it("writes a sanitized runtime turn marker for missing-snapshot diagnostics", async () => {
    const files: Record<string, string> = {};
    const writes: string[] = [];
    const renames: Array<[string, string]> = [];
    const markerPath = createRuntimeTurnMarkerStatePath("/Users/tester");

    expect(markerPath)
      .toBe("/Users/tester/Library/Application Support/skfiy/runtime-turn-marker.json");
    expect(createRuntimeTurnMarker({
      currentTurn: {
        status: "executing",
        message: "Using Bearer abc.def and token=super-secret",
        command: "curl https://example.test?api_key=abc123"
      },
      observedAt: "2026-06-20T10:03:00.000Z"
    })).toMatchObject({
      schemaVersion: 1,
      observedAt: "2026-06-20T10:03:00.000Z",
      currentTurn: {
        state: "executing",
        source: "runtime-turn-marker",
        updateSource: "live-task-event",
        command: "curl https://example.test?api_key=[redacted]",
        latestMessage: "Using Bearer [redacted] and token=[redacted]"
      }
    });

    await writeRuntimeTurnMarker({
      homeDir: "/Users/tester",
      currentTurn: {
        status: "executing",
        message: "Using Bearer abc.def and token=super-secret",
        command: "curl https://example.test?api_key=abc123"
      },
      observedAt: "2026-06-20T10:03:00.000Z",
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
    expect(writes[0]).toMatch(/runtime-turn-marker\.json\.tmp-/);
    expect(renames).toEqual([[writes[0], markerPath]]);
    expect(JSON.parse(files[markerPath])).toMatchObject({
      schemaVersion: 1,
      currentTurn: {
        state: "executing",
        source: "runtime-turn-marker"
      }
    });
    expect(files[markerPath]).not.toContain("super-secret");
    expect(files[markerPath]).not.toContain("abc123");
  });
});
