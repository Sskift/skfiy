import { describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "./contracts";
import {
  readActivityFeedSummary,
  readAgentSupervisionSummary,
  readAlertGroupSummary,
  readAppsSitesSummary,
  readApprovalQueueSummary,
  readChromeControlCommandHints,
  readChromeControlState,
  readChromeSetupGuideSummary,
  readComputerUseReadiness,
  readDashboardPanelSummary,
  readDogfoodSummary,
  readHomeSummary,
  readKnowledgeGraph,
  readLatestTaskSignal,
  readLongHorizonSummary,
  readNextAction,
  readOperatorEvidenceSummary,
  readOperatorReadinessChecks,
  readPersonalMutationReceipt,
  readPromptStackSummary,
  readRouteOutcome,
  readRuntimeSnapshotDetails,
  readRuntimeHealthSummary,
  readSnapshotState,
  readSmokeArtifactInventory,
  readSmokeArtifactDetails
} from "./model";

describe("readPromptStackSummary", () => {
  it("summarizes prompt context blocks without echoing memory text or provider secrets", () => {
    const snapshot = createSnapshot();
    const summary = readPromptStackSummary({
      ...snapshot,
      providers: {
        ...snapshot.providers,
        assistant: {
          provider: "assistant",
          mode: "codex",
          label: "Codex",
          health: "available",
          endpoint: "https://provider.example.test/chat?token=secret-provider-token"
        }
      }
    });

    expect(summary).toMatchObject({
      title: "Prompt stack",
      value: "6/7 ready",
      detail: "Snapshot-backed Background Agent prompt context inventory.",
      tone: "warning"
    });
    expect(summary.items).toEqual(expect.arrayContaining([
      { label: "memory", value: "2 durable entries", tone: "success" },
      { label: "session recall", value: "2 recent", tone: "success" },
      { label: "skills", value: "2", tone: "success" },
      { label: "working profile", value: "present", tone: "success" },
      { label: "Browser Context", value: "ready", tone: "success" },
      { label: "route", value: "approval_required", tone: "warning" }
    ]));
    expect(summary.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "identity",
        label: "Background Agent identity",
        value: "Codex (codex)",
        tone: "success"
      }),
      expect.objectContaining({
        id: "memory",
        label: "Personal memory",
        value: "1 user / 1 agent",
        detail: "1 pending write stays outside durable prompt memory."
      }),
      expect.objectContaining({
        id: "session-recall",
        label: "Session recall",
        value: "2/3 recent"
      }),
      expect.objectContaining({
        id: "route-context",
        label: "Route context",
        value: "approval_required",
        tone: "warning"
      })
    ]));
    expect(JSON.stringify(summary)).not.toContain("User prefers concise Chinese updates.");
    expect(JSON.stringify(summary)).not.toContain("Summarize current dashboard state.");
    expect(JSON.stringify(summary)).not.toContain("secret-provider-token");
  });
});

describe("readDashboardPanelSummary", () => {
  it("summarizes local descriptor panels without exposing token-like descriptor fields", () => {
    const snapshot = createSnapshot();
    const summary = readDashboardPanelSummary({
      ...snapshot,
      descriptor: {
        ...snapshot.descriptor,
        auth: { mode: "optional-token", token: "secret-dashboard-token" },
        panels: [
          {
            id: "runtime-health",
            title: "Runtime health",
            signals: ["app", "helper", "dashboard"],
            actions: []
          },
          {
            id: "app-policy",
            title: "App policy",
            signals: ["app-allow-ask-deny", "chrome-host-allow-ask-deny"],
            actions: ["show-chrome-host-policy", "set-chrome-host-policy", "reset-chrome-host-policy"]
          }
        ]
      }
    });

    expect(summary).toMatchObject({
      title: "Dashboard panels",
      value: "2 panels",
      detail: "5 signals and 3 local actions are advertised by the local descriptor.",
      tone: "success",
      panels: [
        {
          id: "runtime-health",
          title: "Runtime health",
          signalCount: 3,
          actionCount: 0,
          tone: "neutral"
        },
        {
          id: "app-policy",
          title: "App policy",
          signalCount: 2,
          actionCount: 3,
          tone: "warning"
        }
      ]
    });
    expect(summary.items).toEqual(expect.arrayContaining([
      { label: "bind", value: "127.0.0.1:51234", tone: "neutral" },
      { label: "auth", value: "optional-token", tone: "neutral" },
      { label: "updates", value: "sse", tone: "neutral" },
      { label: "actions", value: "3", tone: "warning" }
    ]));
    expect(JSON.stringify(summary)).not.toContain("secret-dashboard-token");
  });
});

describe("readKnowledgeGraph", () => {
  it("connects memory, sessions, provider, browser context, Computer Use, and alerts", () => {
    const graph = readKnowledgeGraph(createSnapshot());

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "memory:user", kind: "memory", label: "User preferences" }),
      expect.objectContaining({ id: "memory:agent", kind: "memory", label: "Agent operating notes" }),
      expect.objectContaining({
        id: "session:latest",
        kind: "session",
        label: "Latest session",
        detail: expect.stringContaining("Recall basis: matched terms: dashboard; score: 1")
      }),
      expect.objectContaining({ id: "session:recent-2", kind: "session", label: "Recent session 2" }),
      expect.objectContaining({ id: "provider:codex", kind: "provider", label: "Codex" }),
      expect.objectContaining({ id: "browser:context", kind: "browser", label: "Browser Context" }),
      expect.objectContaining({ id: "computer-use", kind: "computer-use", label: "Computer Use" }),
      expect.objectContaining({
        id: "skill:communication-style",
        kind: "skill",
        label: "Concise Chinese progress updates"
      }),
      expect.objectContaining({
        id: "skill:dashboard-knowledge-surface",
        kind: "skill",
        label: "Obsidian-style knowledge dashboard"
      }),
      expect.objectContaining({
        id: "profile:working",
        kind: "memory",
        label: "Working profile"
      }),
      expect.objectContaining({
        id: "memory:evolution",
        kind: "memory",
        label: "Memory evolution",
        detail: "2 learning receipts across 2 providers"
      }),
      expect.objectContaining({
        id: "memory:journal:pmj-20260623t120500000z-1",
        kind: "memory",
        label: "Learning receipt",
        detail: "pending · replace user · User prefers concise Chinese-first progress updates with verification evidence. · learned from Hermes turn turn-2"
      }),
      expect.objectContaining({
        id: "memory:pending:pmw-review-style",
        kind: "memory",
        label: "Pending user memory",
        tone: "warning"
      }),
      expect.objectContaining({ id: "alert:screen-recording-missing", kind: "alert" })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "memory:user", to: "provider:codex", label: "injects prompt" }),
      expect.objectContaining({ from: "memory:agent", to: "provider:codex", label: "guides behavior" }),
      expect.objectContaining({ from: "skill:memory-review", to: "memory:pending:pmw-review-style", label: "stages" }),
      expect.objectContaining({ from: "memory:pending:pmw-review-style", to: "memory:user", label: "awaits approval" }),
      expect.objectContaining({ from: "memory:user", to: "skill:communication-style", label: "distills skill" }),
      expect.objectContaining({ from: "memory:user", to: "profile:working", label: "shapes profile" }),
      expect.objectContaining({ from: "profile:working", to: "provider:codex", label: "travels with prompt" }),
      expect.objectContaining({ from: "skill:dashboard-knowledge-surface", to: "profile:working", label: "summarizes habit" }),
      expect.objectContaining({
        from: "skill:memory-review",
        to: "memory:journal:pmj-20260623t120500000z-1",
        label: "records receipt"
      }),
      expect.objectContaining({
        from: "skill:memory-review",
        to: "memory:evolution",
        label: "records timeline"
      }),
      expect.objectContaining({
        from: "memory:evolution",
        to: "memory:journal:pmj-20260623t120500000z-1",
        label: "orders receipt"
      }),
      expect.objectContaining({
        from: "memory:journal:pmj-20260623t120500000z-1",
        to: "memory:user",
        label: "awaits approval"
      }),
      expect.objectContaining({ from: "skill:communication-style", to: "provider:codex", label: "guides prompt" }),
      expect.objectContaining({ from: "skill:dashboard-knowledge-surface", to: "provider:codex", label: "guides prompt" }),
      expect.objectContaining({ from: "browser:context", to: "session:latest", label: "observed in" }),
      expect.objectContaining({ from: "session:latest", to: "provider:codex", label: "recalls context" }),
      expect.objectContaining({ from: "session:recent-2", to: "provider:codex", label: "recalls context" }),
      expect.objectContaining({ from: "provider:codex", to: "session:recent-2", label: "answered" }),
      expect.objectContaining({ from: "session:latest", to: "skill:memory-review", label: "teaches" }),
      expect.objectContaining({ from: "computer-use", to: "turn:current", label: "requires approval" }),
      expect.objectContaining({ from: "alert:screen-recording-missing", to: "computer-use", label: "blocked by" })
    ]));
  });

  it("surfaces high memory pressure as a warning graph node", () => {
    const graph = readKnowledgeGraph({
      ...createSnapshot(),
      personalMemory: {
        ...createSnapshot().personalMemory!,
        usage: {
          user: {
            usedChars: 1_210,
            limitChars: 1_375,
            percent: 88
          },
          agent: {
            usedChars: 320,
            limitChars: 2_200,
            percent: 14
          }
        }
      }
    });

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "memory:user",
        tone: "warning",
        detail: expect.stringContaining("88% - 1,210/1,375 chars")
      }),
      expect.objectContaining({
        id: "memory:agent",
        tone: "success",
        detail: expect.stringContaining("14% - 320/2,200 chars")
      })
    ]));
  });

  it("shows pending replace memory writes as revisions in the graph detail", () => {
    const graph = readKnowledgeGraph({
      ...createSnapshot(),
      personalMemory: {
        ...createSnapshot().personalMemory!,
        pendingWriteCount: 1,
        pendingWrites: [
          {
            id: "pmw-revise-progress",
            createdAt: "2026-06-24T05:00:00.000Z",
            source: "post-turn-review",
            action: "replace",
            target: "user",
            previousContent: "User prefers concise Chinese progress updates.",
            content: "User prefers concise Chinese-first progress updates with verification evidence."
          }
        ]
      }
    });

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "memory:pending:pmw-revise-progress",
        detail: "replace · from User prefers concise Chinese progress updates. -> User prefers concise Chinese-first progress updates with verification evidence."
      })
    ]));
  });

  it("keeps app-policy route denial explicit in the graph", () => {
    const graph = readKnowledgeGraph({
      ...createSnapshot(),
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        latestMessage: "Ghostty is denied by app policy.",
        command: "run pwd in Ghostty"
      }
    });

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "route:current",
        kind: "turn",
        label: "App policy denied route",
        tone: "danger",
        detail: "app_policy_denied · state blocked · route ghostty · Ghostty is denied by app policy."
      })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "computer-use", to: "turn:current", label: "denied by app policy" }),
      expect.objectContaining({ from: "computer-use", to: "route:current", label: "denied by app policy" }),
      expect.objectContaining({ from: "route:current", to: "turn:current", label: "summarizes turn" })
    ]));
  });

  it("keeps explicit stop-turn outcomes in the graph", () => {
    const graph = readKnowledgeGraph({
      ...createSnapshot(),
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      }
    });

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "route:current",
        kind: "turn",
        label: "Route stopped",
        tone: "neutral",
        detail: "stopped · state cancelled · route chrome · Task stopped."
      })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "computer-use", to: "turn:current", label: "stopped route" }),
      expect.objectContaining({ from: "computer-use", to: "route:current", label: "stopped route" }),
      expect.objectContaining({ from: "route:current", to: "turn:current", label: "summarizes turn" })
    ]));
  });
});

describe("readComputerUseReadiness", () => {
  it("summarizes fallback permission readiness without exposing provider secrets", () => {
    const readiness = readComputerUseReadiness({
      ...createSnapshot(),
      permissions: {
        screenRecording: "missing",
        accessibility: "granted",
        finderAutomation: "not-determined"
      },
      providers: {
        ...createSnapshot().providers,
        planner: {
          provider: "planner",
          mode: "external-cua",
          label: "External CUA",
          health: "available",
          endpoint: "https://cua.example.test/plan?token=planner-secret"
        }
      }
    });

    expect(readiness.permissionSummary).toEqual({
      value: "2 needed",
      detail: "Screen Recording and Finder Automation need attention.",
      tone: "warning"
    });
    expect(JSON.stringify(readiness)).not.toContain("planner-secret");
  });

  it("reports ready when Computer Use permissions are granted", () => {
    const readiness = readComputerUseReadiness({
      ...createSnapshot(),
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "granted"
      }
    });

    expect(readiness.permissionSummary).toEqual({
      value: "Ready",
      detail: "Screen Recording, Accessibility, and Finder Automation are ready.",
      tone: "success"
    });
  });

  it("builds Finder Automation access steps from blocked Finder smoke", () => {
    const readiness = readComputerUseReadiness({
      ...createSnapshot(),
      permissions: {
        screenRecording: "granted",
        accessibility: "granted",
        finderAutomation: "unknown"
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "finder",
            result: "blocked",
            finderSemanticObservation: {
              result: "blocked",
              reason: "Automation permission is required to read Finder selection. Grant skfiy permission to control Finder, then try again."
            }
          }
        ]
      },
      alerts: []
    });

    expect(readiness.accessSteps).toEqual([
      {
        id: "open-automation-settings",
        label: "Open Automation settings",
        detail: "System Settings > Privacy & Security > Automation",
        tone: "warning"
      },
      {
        id: "allow-skfiy-finder",
        label: "Allow skfiy to control Finder",
        detail: "Enable Finder under skfiy, then keep Finder available.",
        tone: "warning"
      },
      {
        id: "rerun-finder-smoke",
        label: "Rerun Finder smoke",
        detail: "npm run smoke:finder -- --output .skfiy-smoke/finder-automation.json",
        tone: "neutral"
      }
    ]);
  });
});

describe("readSmokeArtifactDetails", () => {
  it("summarizes the smoke artifact inventory without artifact paths", () => {
    const base = createSmokeDetailSnapshot();
    const inventory = readSmokeArtifactInventory({
      ...base,
      smokeEvidence: {
        artifacts: [
          ...base.smokeEvidence.artifacts,
          {
            target: "dashboard",
            result: "failed",
            stale: true,
            path: "/repo/.skfiy-smoke/dashboard-current.json"
          }
        ]
      }
    });

    expect(inventory).toEqual({
      title: "Artifact inventory",
      value: "stale",
      detail: "3 artifacts: 1 passed, 2 attention, 1 stale.",
      tone: "warning",
      items: [
        { label: "chrome", value: "passed", tone: "success" },
        { label: "finder", value: "blocked", tone: "danger" },
        { label: "dashboard", value: "failed (stale)", tone: "warning" }
      ]
    });
    expect(JSON.stringify(inventory)).not.toContain(".skfiy-smoke");
  });

  it("summarizes Chrome safety, Chrome pageControl, and Finder smoke probes without artifact paths", () => {
    const details = readSmokeArtifactDetails(createSmokeDetailSnapshot());

    expect(details).toEqual([
      expect.objectContaining({
        id: "chrome-page-safety",
        title: "Chrome page safety",
        value: "sensitive-paused",
        tone: "warning",
        items: expect.arrayContaining([
          { label: "sensitive pause", value: "yes", tone: "warning" },
          { label: "pause count", value: "2", tone: "neutral" },
          { label: "checked runs", value: "2", tone: "neutral" },
          { label: "finding kinds", value: "credential", tone: "neutral" },
          { label: "sensitive page", value: "sensitive-paused (paused) - Sensitive UI text is visible.", tone: "warning" },
          { label: "form prefill", value: "passed (not paused)", tone: "success" },
          { label: "source", value: "chrome-smoke", tone: "neutral" }
        ])
      }),
      expect.objectContaining({
        id: "chrome-page-control",
        title: "Chrome pageControl",
        value: "ready",
        tone: "success",
        items: expect.arrayContaining([
          { label: "capable", value: "capable", tone: "success" },
          { label: "active tab", value: "eligible 127.0.0.1:60329 tab 123", tone: "neutral" },
          { label: "content script", value: "loaded", tone: "neutral" },
          { label: "DOM actions", value: "ready", tone: "neutral" },
          { label: "screenshot", value: "background_required", tone: "neutral" },
          { label: "click/fill/submit/scroll", value: "click:ready, fill:ready, submit:ready, scroll:ready", tone: "neutral" }
        ])
      }),
      expect.objectContaining({
        id: "finder-smoke",
        title: "Finder smoke",
        value: "blocked",
        tone: "danger",
        items: expect.arrayContaining([
          { label: "desktop preflight", value: "blocked - Desktop session is not controllable before target app launch.", tone: "danger" },
          { label: "frontmost bundle", value: "com.apple.loginwindow", tone: "neutral" },
          { label: "display asleep", value: "no", tone: "neutral" },
          { label: "desktop controllable", value: "no", tone: "neutral" },
          { label: "finder observation", value: "blocked - Skipped because desktop preflight is blocked.", tone: "danger" },
          { label: "accessibility trusted", value: "yes", tone: "neutral" },
          { label: "finder semantic", value: "skipped - Desktop preflight blocked.", tone: "warning" },
          { label: "finder drag/drop", value: "skipped - Desktop preflight blocked.", tone: "warning" }
        ])
      })
    ]);
    expect(JSON.stringify(details)).not.toContain("/repo/.skfiy-smoke");
  });
});

describe("readRuntimeHealthSummary", () => {
  it("summarizes fallback runtime health details without leaking local paths", () => {
    const summary = readRuntimeHealthSummary({
      ...createSnapshot(),
      runtimeHealth: {
        package: { version: "0.1.0" },
        app: {
          state: "installed",
          path: "/Users/me/dev/skfiy/dist/skfiy.app"
        },
        helper: {
          state: "installed",
          path: "/Users/me/dev/skfiy/dist/skfiy-helper"
        },
        cli: {
          state: "installed",
          path: "/Users/me/dev/skfiy/dist/skfiy"
        },
        dashboard: {
          state: "running",
          pid: 4242,
          uptimeSeconds: 37
        },
        extension: {
          state: "connected",
          pageControl: {
            state: "ready",
            capable: true,
            nextAction: "Use pageControl actions.",
            source: "runtime-health"
          }
        },
        desktopSession: {
          state: "controllable"
        }
      }
    });

    expect(summary).toMatchObject({
      title: "Runtime health",
      value: "running",
      detail: "skfiy 0.1.0 local runtime health from the dashboard snapshot.",
      tone: "success",
      items: expect.arrayContaining([
        { label: "version", value: "0.1.0", tone: "neutral" },
        { label: "app", value: "installed", tone: "success" },
        { label: "helper", value: "installed", tone: "success" },
        { label: "cli", value: "installed", tone: "success" },
        { label: "dashboard", value: "running", tone: "success" },
        { label: "pid", value: "4242", tone: "neutral" },
        { label: "uptime", value: "37", tone: "neutral" },
        { label: "extension", value: "connected", tone: "success" },
        { label: "pageControl", value: "capable/ready", tone: "success" },
        { label: "pageControl next", value: "Use pageControl actions.", tone: "neutral" },
        { label: "desktop", value: "controllable", tone: "success" }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain("/Users/me");
  });
});

describe("readSnapshotState", () => {
  it.each([
    {
      label: "route blocker",
      currentTurn: {
        state: "blocked",
        route: "finder",
        latestMessage: "Screen Recording permission is denied."
      },
      expected: { label: "Turn", value: "blocked", tone: "danger" }
    },
    {
      label: "route failure",
      currentTurn: {
        state: "failed",
        route: "ghostty",
        latestMessage: "Ghostty command failed."
      },
      expected: { label: "Turn", value: "failed", tone: "danger" }
    },
    {
      label: "route cancellation",
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Browser task cancelled before execution."
      },
      expected: { label: "Turn", value: "cancelled", tone: "neutral" }
    },
    {
      label: "route completion",
      currentTurn: {
        state: "completed",
        route: "tmux_supervision",
        latestMessage: "money-run supervision completed."
      },
      expected: { label: "Turn", value: "completed", tone: "success" }
    }
  ])("uses route outcome tone for $label", ({ currentTurn, expected }) => {
    const state = readSnapshotState({
      ...createSnapshot(),
      currentTurn
    });

    expect(state).toEqual(expect.arrayContaining([expected]));
  });
});

describe("readOperatorReadinessChecks", () => {
  it("summarizes fallback operator readiness details without leaking local paths", () => {
    const checks = readOperatorReadinessChecks({
      ...createSnapshot(),
      operatorReadiness: {
        state: "blocked",
        commandSurface: {
          state: "ready",
          binaryPath: "/Users/me/dev/skfiy/dist/skfiy"
        },
        extensionReadiness: {
          state: "blocked",
          manifestPath: "/Users/me/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.skfiy.json"
        },
        packagedBinary: {
          state: "ready",
          signingState: "unsigned",
          appPath: "/Users/me/dev/skfiy/dist/skfiy.app"
        },
        recentSmokeEvidence: {
          recentPassedTargets: ["dashboard"],
          missingTargets: ["chrome", "cli"]
        }
      }
    });

    expect(checks).toMatchObject({
      title: "Operator readiness checks",
      value: "blocked",
      detail: "Missing fresh evidence: chrome, cli.",
      tone: "danger",
      items: expect.arrayContaining([
        { label: "state", value: "blocked", tone: "danger" },
        { label: "command surface", value: "ready", tone: "success" },
        { label: "extension", value: "blocked", tone: "danger" },
        { label: "binary", value: "ready", tone: "success" },
        { label: "signing", value: "unsigned", tone: "warning" },
        { label: "smoke passed", value: "dashboard", tone: "neutral" },
        { label: "smoke missing", value: "chrome, cli", tone: "warning" }
      ])
    });
    expect(JSON.stringify(checks)).not.toContain("/Users/me");
  });
});

describe("readRuntimeSnapshotDetails", () => {
  it("summarizes current-turn and replay snapshot freshness without leaking screenshot paths", () => {
    const details = readRuntimeSnapshotDetails(createRuntimeSnapshotDetailFixture());
    const currentTurn = details.find((detail) => detail.id === "current-turn");
    const replay = details.find((detail) => detail.id === "replay");

    expect(currentTurn).toMatchObject({
      title: "Current turn snapshot",
      value: "Stale",
      tone: "warning",
      items: expect.arrayContaining([
        { label: "snapshot freshness", value: "stale", tone: "warning" },
        { label: "snapshot age", value: "40s old (2026-06-20T00:00:20.000Z)", tone: "neutral" },
        { label: "target", value: "Ghostty", tone: "neutral" },
        { label: "risk", value: "low", tone: "neutral" },
        { label: "approval", value: "approved", tone: "neutral" },
        { label: "route outcome", value: "executing", tone: "warning" },
        { label: "route detail", value: "Typing command.", tone: "neutral" },
        { label: "latest action", value: "type_text: 3 chars", tone: "neutral" },
        { label: "latest verify", value: "press_key: passed - enter accepted", tone: "neutral" },
        { label: "latest screenshot", value: "after (structured_first 2 sources)", tone: "neutral" }
      ])
    });
    expect(replay).toMatchObject({
      title: "Replay snapshot",
      value: "Stale",
      tone: "warning",
      items: expect.arrayContaining([
        { label: "screenshots", value: "2", tone: "neutral" },
        { label: "actions", value: "3", tone: "neutral" },
        { label: "verifications", value: "1", tone: "neutral" },
        { label: "latest action", value: "type_text: 3 chars", tone: "neutral" },
        { label: "latest verify", value: "press_key: passed - enter accepted", tone: "neutral" },
        { label: "latest screenshot", value: "after (structured_first 2 sources)", tone: "neutral" },
        {
          label: "timeline tail",
          value: "executing: Typing command. | completed: pwd",
          tone: "neutral"
        }
      ])
    });

    expect(JSON.stringify(details)).not.toContain("/tmp/after.png");
  });

  it("keeps route outcome semantics visible in current-turn snapshot details", () => {
    const details = readRuntimeSnapshotDetails({
      ...createSnapshot(),
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        denialKind: "app_policy",
        policyKind: "app-policy",
        latestMessage: "Ghostty is denied by app policy."
      },
      alerts: []
    });
    const currentTurn = details.find((detail) => detail.id === "current-turn");

    expect(currentTurn).toMatchObject({
      items: expect.arrayContaining([
        { label: "route outcome", value: "app_policy_denied", tone: "danger" },
        { label: "route detail", value: "Ghostty is denied by app policy.", tone: "neutral" },
        { label: "denial kind", value: "app_policy", tone: "neutral" },
        { label: "policy kind", value: "app-policy", tone: "neutral" }
      ])
    });
  });

  it("keeps Task stopped visible in current-turn snapshot details", () => {
    const details = readRuntimeSnapshotDetails({
      ...createSnapshot(),
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      },
      alerts: []
    });
    const currentTurn = details.find((detail) => detail.id === "current-turn");

    expect(currentTurn).toMatchObject({
      items: expect.arrayContaining([
        { label: "route outcome", value: "stopped", tone: "neutral" },
        { label: "route detail", value: "Task stopped.", tone: "neutral" }
      ])
    });
  });
});

describe("readOperatorEvidenceSummary", () => {
  it("summarizes operator evidence handoff state without provider secrets or artifact paths", () => {
    const summary = readOperatorEvidenceSummary({
      ...createSnapshot(),
      descriptor: {
        ...createSnapshot().descriptor,
        url: "http://127.0.0.1:51234/?token=secret-dashboard-token#hidden"
      },
      operatorReadiness: {
        state: "blocked"
      },
      runtimeHealth: {
        extension: { state: "connected" },
        nativeHost: { state: "installed" }
      },
      currentTurn: {
        state: "approval_required"
      },
      replay: {
        state: "available"
      },
      providers: {
        planner: {
          mode: "external-cua",
          label: "External CUA",
          health: "available",
          endpoint: "https://cua.example.test/plan?token=planner-secret"
        }
      },
      smokeEvidence: {
        artifacts: [
          { target: "chrome", result: "passed", path: "/repo/.skfiy-smoke/chrome.json" },
          { target: "dashboard", result: "passed", path: "/repo/.skfiy-smoke/dashboard.json" }
        ]
      },
      alerts: [
        { severity: "warning", code: "release-artifact-older-than-head", message: "Release artifact is behind HEAD." }
      ]
    });

    expect(summary).toMatchObject({
      title: "Operator evidence",
      value: "Blocked",
      detail: "Dashboard, runtime, and readiness handoff payload.",
      tone: "danger",
      items: expect.arrayContaining([
        { label: "endpoint", value: "/api/operator-evidence", tone: "neutral" },
        { label: "dashboard", value: "http://127.0.0.1:51234/", tone: "neutral" },
        { label: "bind", value: "127.0.0.1:51234", tone: "neutral" },
        { label: "token free", value: "yes", tone: "success" },
        { label: "source", value: "allowlisted-dashboard-summary", tone: "neutral" },
        { label: "turn", value: "approval_required", tone: "neutral" },
        { label: "route", value: "unknown", tone: "neutral" },
        { label: "route outcome", value: "approval_required", tone: "warning" },
        { label: "replay", value: "available", tone: "neutral" },
        { label: "readiness", value: "blocked", tone: "danger" },
        { label: "alerts", value: "1", tone: "warning" },
        { label: "extension", value: "connected", tone: "neutral" },
        { label: "native host", value: "installed", tone: "neutral" },
        { label: "smoke artifacts", value: "2", tone: "neutral" }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain("planner-secret");
    expect(JSON.stringify(summary)).not.toContain("secret-dashboard-token");
    expect(JSON.stringify(summary)).not.toContain("/repo/.skfiy-smoke");
  });
});

describe("readLongHorizonSummary", () => {
  it("summarizes money-run supervision without exposing pane tail or probe commands", () => {
    const summary = readLongHorizonSummary(createLongHorizonSnapshotFixture());

    expect(summary).toMatchObject({
      title: "Long-horizon supervision",
      value: "observing",
      detail: "money-run has 2 windows, 3 panes, and no obvious block markers.",
      tone: "success",
      items: expect.arrayContaining([
        { label: "state", value: "observing", tone: "success" },
        { label: "session", value: "money-run", tone: "neutral" },
        { label: "source", value: "tmux-read-only-probe", tone: "neutral" },
        { label: "active pane", value: "%1", tone: "neutral" },
        { label: "command", value: "zsh", tone: "neutral" },
        { label: "recommend", value: "continue_observing", tone: "neutral" },
        {
          label: "reason",
          value: "money-run has 2 windows, 3 panes, and no obvious block markers.",
          tone: "neutral"
        },
        { label: "mutates", value: "no", tone: "neutral" },
        { label: "signals", value: "0", tone: "neutral" },
        { label: "probes", value: "2", tone: "neutral" }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain("building...");
    expect(JSON.stringify(summary)).not.toContain("tmux capture-pane");
  });
});

describe("readAgentSupervisionSummary", () => {
  it("summarizes fallback Agents state without exposing pane tails, probes, or provider secrets", () => {
    const summary = readAgentSupervisionSummary({
      ...createLongHorizonSnapshotFixture(),
      providers: {
        ...createSnapshot().providers,
        planner: {
          provider: "planner",
          mode: "external-cua",
          label: "External CUA",
          health: "available",
          endpoint: "https://cua.example.test/plan?token=planner-secret"
        }
      }
    });

    expect(summary).toMatchObject({
      title: "Agent supervision",
      value: "Ready",
      detail: "money-run has 2 windows, 3 panes, and no obvious block markers.",
      tone: "success",
      items: [
        { label: "money-run", value: "observing", tone: "success" },
        { label: "active pane", value: "%1", tone: "neutral" },
        { label: "recommendation", value: "continue_observing", tone: "neutral" },
        {
          label: "reason",
          value: "money-run has 2 windows, 3 panes, and no obvious block markers.",
          tone: "neutral"
        },
        { label: "mutates session", value: "no", tone: "neutral" }
      ]
    });
    expect(JSON.stringify(summary)).not.toContain("building...");
    expect(JSON.stringify(summary)).not.toContain("tmux capture-pane");
    expect(JSON.stringify(summary)).not.toContain("planner-secret");
  });
});

describe("readApprovalQueueSummary", () => {
  it("summarizes pending Computer Use and browser approvals without exposing provider secrets", () => {
    const summary = readApprovalQueueSummary(createApprovalQueueSnapshotFixture());

    expect(summary).toMatchObject({
      title: "Approvals",
      value: "3 pending",
      detail: "Review pending local approval and browser access requests.",
      tone: "warning",
      items: [
        {
          label: "Computer Use approval",
          value: "high: Approval required before moving files.",
          tone: "warning"
        },
        {
          label: "Chrome extension",
          value: "heartbeat not connected; refresh the extension before trusting page control",
          tone: "warning"
        },
        {
          label: "Chrome host policy",
          value: "ask-by-default; new sites will request approval",
          tone: "warning"
        }
      ]
    });
    expect(JSON.stringify(summary)).not.toContain("planner-secret");
  });

  it("keeps route confirmation distinct from Computer Use approval", () => {
    const summary = readApprovalQueueSummary({
      ...createClearApprovalQueueSnapshotFixture(),
      currentTurn: {
        state: "needs_confirmation",
        approvalState: "required",
        targetRoute: { kind: "finder", bundleId: "com.apple.finder" },
        latestMessage: "Confirm before organizing Finder."
      }
    });

    expect(summary).toMatchObject({
      title: "Approvals",
      value: "1 pending",
      detail: "Review pending route confirmation and browser access requests.",
      tone: "warning",
      items: [
        {
          label: "Route confirmation",
          value: "Confirm before organizing Finder.",
          tone: "warning"
        }
      ]
    });
  });

  it("reports a clear queue when no local approvals are waiting", () => {
    expect(readApprovalQueueSummary(createClearApprovalQueueSnapshotFixture())).toMatchObject({
      title: "Approvals",
      value: "clear",
      detail: "No pending local approvals.",
      tone: "success",
      items: []
    });
  });
});

describe("readDogfoodSummary", () => {
  it("summarizes release gate details without exposing local artifact paths", () => {
    const summary = readDogfoodSummary({
      ...createSnapshot(),
      dogfoodRelease: {
        state: "cohort-ready",
        latestAlpha: {
          state: "published",
          path: "/repo/docs/release-evidence/latest-alpha.json",
          tagName: "skfiy-alpha-def4567",
          commitSha: "def4567890abcdef1234567890abcdef12345678",
          shortCommit: "def4567",
          manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
          zipPath: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.zip",
          zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        },
        currentHead: {
          state: "present",
          commitSha: "fedcba9876543210fedcba9876543210fedcba98",
          shortCommit: "fedcba9"
        },
        releaseDrift: {
          state: "behind-head",
          releaseCommitSha: "def4567890abcdef1234567890abcdef12345678",
          currentHeadCommitSha: "fedcba9876543210fedcba9876543210fedcba98"
        },
        manifest: {
          state: "present",
          path: "/repo/.skfiy-alpha/skfiy-0.1.0-def4567-macos-unsigned.json",
          zipSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        },
        cohort: {
          state: "present",
          path: "/repo/.skfiy-dogfood/internal-alpha-cohort.json",
          totalReports: 3,
          acceptedReportCount: 3,
          distinctRealTesterCount: 3,
          ready: true,
          passedReady: false,
          workflowCoverage: {
            "coding-terminal": true,
            "browser-fallback": true,
            "finder-file": true
          },
          passedWorkflowCoverage: {
            "coding-terminal": true,
            "browser-fallback": false,
            "finder-file": true
          }
        }
      }
    });

    expect(summary).toMatchObject({
      releaseState: "cohort-ready",
      releaseDriftState: "behind-head",
      cohortLabel: "cohort 3/3",
      detail: "Accepted dogfood cohort exists, but passed workflow coverage is incomplete.",
      tone: "warning",
      items: expect.arrayContaining([
        { label: "alpha", value: "skfiy-alpha-def4567", tone: "success" },
        { label: "release commit", value: "def4567", tone: "warning" },
        { label: "head commit", value: "fedcba9", tone: "warning" },
        { label: "manifest", value: "present", tone: "success" },
        { label: "zip sha", value: "0123456789ab", tone: "neutral" },
        { label: "cohort ready", value: "partial", tone: "warning" },
        { label: "reports", value: "3 accepted / 3 testers / 3 total", tone: "neutral" },
        { label: "workflow coverage", value: "3/3", tone: "success" },
        { label: "passed workflows", value: "2/3", tone: "warning" },
        { label: "drift", value: "behind-head def4567 -> fedcba9", tone: "warning" }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain(".skfiy-alpha");
    expect(JSON.stringify(summary)).not.toContain(".skfiy-dogfood");
    expect(JSON.stringify(summary)).not.toContain("/repo/");
  });
});

describe("readAlertGroupSummary", () => {
  it("groups dashboard alerts by blocker area using fallback dashboard semantics", () => {
    const summary = readAlertGroupSummary({
      ...createSnapshot(),
      alerts: [
        {
          code: "chrome-native-host-missing",
          severity: "error",
          message: "Chrome Native Messaging host is not installed."
        },
        {
          code: "release-artifact-older-than-head",
          severity: "warning",
          message: "Latest alpha release is older than the current HEAD."
        },
        {
          code: "screen-recording-missing",
          severity: "warning",
          message: "Screen Recording is not granted."
        },
        {
          code: "desktop-session-loginwindow",
          severity: "error",
          message: "Desktop is at loginwindow."
        }
      ]
    });

    expect(summary).toMatchObject({
      title: "Alerts",
      value: "4 alerts",
      detail: "Grouped by 4 blocker areas.",
      tone: "danger",
      groups: [
        expect.objectContaining({
          id: "desktop",
          title: "Desktop session",
          value: "1 alert",
          tone: "danger",
          items: [
            { label: "desktop-session-loginwindow", value: "Desktop is at loginwindow.", tone: "danger" }
          ]
        }),
        expect.objectContaining({
          id: "chrome",
          title: "Chrome bridge",
          value: "1 alert",
          tone: "danger",
          items: [
            { label: "chrome-native-host-missing", value: "Chrome Native Messaging host is not installed.", tone: "danger" }
          ]
        }),
        expect.objectContaining({
          id: "permissions",
          title: "Permissions",
          value: "1 alert",
          tone: "warning",
          items: [
            { label: "screen-recording-missing", value: "Screen Recording is not granted.", tone: "warning" }
          ]
        }),
        expect.objectContaining({
          id: "release",
          title: "Release drift",
          value: "1 alert",
          tone: "warning",
          items: [
            { label: "release-artifact-older-than-head", value: "Latest alpha release is older than the current HEAD.", tone: "warning" }
          ]
        })
      ]
    });
  });

  it("reports a clear alert state when no dashboard alerts are active", () => {
    expect(readAlertGroupSummary({
      ...createSnapshot(),
      alerts: []
    })).toEqual({
      title: "Alerts",
      value: "clear",
      detail: "No dashboard alerts are active.",
      tone: "success",
      groups: []
    });
  });
});

describe("readActivityFeedSummary", () => {
  it("summarizes replay activity without leaking Chrome commands or screenshot paths", () => {
    const summary = readActivityFeedSummary(createActivityFeedSnapshotFixture());

    expect(summary).toMatchObject({
      title: "Activity feed",
      value: "live",
      detail: "Recent local activity from the current turn and replay snapshots.",
      tone: "warning",
      items: expect.arrayContaining([
        {
          label: "Chrome fill",
          value: "Chrome fill: Verified - example.test tab 42",
          tone: "success"
        },
        { label: "latest action", value: "type_text: 3 chars", tone: "neutral" },
        { label: "verification", value: "press_key: passed - enter accepted", tone: "neutral" },
        { label: "screenshot", value: "after (structured_first 2 sources)", tone: "neutral" },
        { label: "replay", value: "available", tone: "success" }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain("/tmp/after.png");
    expect(JSON.stringify(summary)).not.toContain("/repo/dist/skfiy");
    expect(JSON.stringify(summary)).not.toContain("typed-secret");
  });
});

describe("readHomeSummary", () => {
  it("summarizes fallback Home state without exposing provider secrets", () => {
    const summary = readHomeSummary(createHomeSummarySnapshotFixture());

    expect(summary).toMatchObject({
      title: "Home",
      value: "Confirm",
      detail: "Route needs confirmation",
      tone: "warning",
      items: [
        { label: "assistant", value: "Route needs confirmation", tone: "warning" },
        { label: "current task", value: "organize Downloads", tone: "neutral" },
        { label: "target", value: "Finder", tone: "neutral" },
        { label: "risk", value: "high", tone: "neutral" },
        { label: "next", value: "Confirm route", tone: "warning" },
        { label: "stop", value: "armed", tone: "neutral" }
      ]
    });
    expect(JSON.stringify(summary)).not.toContain("planner-secret");
  });

  it("surfaces stale runtime state before idle readiness", () => {
    const summary = readHomeSummary({
      ...createSnapshot(),
      generatedAt: "2026-07-07T12:10:00.000Z",
      currentTurn: {
        state: "idle",
        source: "runtime-snapshot",
        observedAt: "2026-07-07T12:00:00.000Z"
      },
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        runtimeSnapshot: {
          state: "available",
          source: "runtime-snapshot",
          observedAt: "2026-07-07T12:00:00.000Z"
        }
      },
      alerts: []
    });

    expect(summary).toMatchObject({
      value: "Stale",
      detail: "Runtime stream is stale",
      tone: "warning"
    });
  });

  it("surfaces stopped route state instead of falling back to idle", () => {
    const summary = readHomeSummary({
      ...createSnapshot(),
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      },
      alerts: []
    });

    expect(summary).toMatchObject({
      value: "Stopped",
      detail: "Route stopped",
      tone: "neutral",
      items: expect.arrayContaining([
        { label: "assistant", value: "Route stopped", tone: "neutral" },
        { label: "current task", value: "Task stopped.", tone: "neutral" },
        { label: "next", value: "Task stopped", tone: "neutral" }
      ])
    });
  });

  it("keeps route confirmation distinct from approval in the Home summary", () => {
    const summary = readHomeSummary({
      ...createSnapshot(),
      currentTurn: {
        state: "needs_confirmation",
        targetRoute: { kind: "finder", bundleId: "com.apple.finder" },
        reason: "Confirm before organizing Finder.",
        latestMessage: "Confirm before organizing Finder."
      },
      alerts: []
    });

    expect(summary).toMatchObject({
      value: "Confirm",
      detail: "Route needs confirmation",
      tone: "warning",
      items: expect.arrayContaining([
        { label: "assistant", value: "Route needs confirmation", tone: "warning" },
        { label: "next", value: "Confirm route", tone: "warning" }
      ])
    });
  });

  it("surfaces pending approval before treating a running route as in progress", () => {
    const summary = readHomeSummary({
      ...createSnapshot(),
      currentTurn: {
        state: "running",
        route: "finder",
        approvalState: "pending",
        approvalRequired: true,
        latestMessage: "Finder file moves need review.",
        command: "organize Downloads"
      },
      alerts: []
    });

    expect(summary).toMatchObject({
      value: "Approval",
      detail: "Route approval required",
      tone: "warning",
      items: expect.arrayContaining([
        { label: "assistant", value: "Route approval required", tone: "warning" },
        { label: "current task", value: "organize Downloads", tone: "neutral" },
        { label: "target", value: "finder", tone: "neutral" },
        { label: "next", value: "Review pending approval", tone: "warning" }
      ])
    });
  });

  it("keeps app-policy denial visible in the Home next action", () => {
    const summary = readHomeSummary({
      ...createSnapshot(),
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        latestMessage: "Ghostty is denied by app policy.",
        command: "run pwd in Ghostty"
      },
      alerts: []
    });

    expect(summary).toMatchObject({
      value: "Policy denied",
      detail: "App policy denied route",
      tone: "danger",
      items: expect.arrayContaining([
        { label: "assistant", value: "App policy denied route", tone: "danger" },
        { label: "next", value: "Review app policy denial", tone: "danger" }
      ])
    });
  });
});

describe("readLatestTaskSignal", () => {
  it("keeps app-policy denial distinct from a generic blocked turn", () => {
    const signal = readLatestTaskSignal({
      ...createSnapshot(),
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        latestMessage: "Ghostty is denied by app policy."
      }
    });

    expect(signal).toEqual({
      title: "Latest blocker",
      value: "app_policy_denied",
      detail: "Ghostty is denied by app policy.",
      tone: "danger",
      source: "Current turn"
    });
  });

  it("surfaces Task stopped as the latest route outcome", () => {
    const signal = readLatestTaskSignal({
      ...createSnapshot(),
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      }
    });

    expect(signal).toEqual({
      title: "Latest outcome",
      value: "stopped",
      detail: "Task stopped.",
      tone: "neutral",
      source: "Current turn"
    });
  });

  it.each([
    [
      "confirmation",
      {
        state: "needs_confirmation",
        targetRoute: { kind: "finder", bundleId: "com.apple.finder" },
        reason: "Confirm before organizing Finder."
      },
      {
        title: "Confirm route",
        value: "needs_confirmation",
        detail: "Confirm before organizing Finder.",
        tone: "warning"
      }
    ],
    [
      "clarification",
      {
        state: "needs_clarification",
        route: "chrome",
        reason: "Clarify which browser tab to use."
      },
      {
        title: "Clarify route",
        value: "needs_clarification",
        detail: "Clarify which browser tab to use.",
        tone: "warning"
      }
    ],
    [
      "running",
      {
        state: "executing",
        route: "ghostty",
        latestMessage: "Typing command."
      },
      {
        title: "Route in progress",
        value: "executing",
        detail: "Typing command.",
        tone: "warning"
      }
    ],
    [
      "completion",
      {
        state: "completed",
        route: "finder",
        latestMessage: "Finder organization completed."
      },
      {
        title: "Latest outcome",
        value: "completed",
        detail: "Finder organization completed.",
        tone: "success"
      }
    ]
  ])("surfaces %s as the latest route signal", (_label, currentTurn, expected) => {
    const signal = readLatestTaskSignal({
      ...createSnapshot(),
      alerts: [],
      currentTurn
    });

    expect(signal).toEqual({
      ...expected,
      source: "Current turn"
    });
  });
});

describe("readNextAction", () => {
  it("keeps app-policy denial as the current route next action", () => {
    const action = readNextAction({
      ...createSnapshot(),
      alerts: [],
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        latestMessage: "Ghostty is denied by app policy.",
        command: "run pwd in Ghostty"
      }
    });

    expect(action).toEqual({
      title: "Review app policy denial",
      detail: "Ghostty is denied by app policy.",
      tone: "danger",
      source: "Current route"
    });
  });

  it("keeps Chrome host policy denial as a distinct current route next action", () => {
    const action = readNextAction({
      ...createSnapshot(),
      alerts: [],
      currentTurn: {
        state: "blocked",
        route: "chrome",
        routeReason: "Chrome host policy blocked this approved task: blocked.example",
        policyKind: "chrome-host-policy",
        latestMessage: "Chrome host policy blocked this approved task: blocked.example",
        command: "summarize current Chrome page"
      }
    });

    expect(action).toEqual({
      title: "Review Chrome host policy denial",
      detail: "Chrome host policy blocked this approved task: blocked.example",
      tone: "danger",
      source: "Current route"
    });
  });

  it("keeps stop-turn outcomes visible as the current route next action", () => {
    const action = readNextAction({
      ...createSnapshot(),
      alerts: [],
      currentTurn: {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped.",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      }
    });

    expect(action).toEqual({
      title: "Task stopped",
      detail: "Task stopped.",
      tone: "neutral",
      source: "Current route"
    });
  });

  it("keeps explicit dashboard alerts ahead of route outcomes", () => {
    const action = readNextAction({
      ...createSnapshot(),
      currentTurn: {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        latestMessage: "Ghostty is denied by app policy."
      },
      alerts: [
        {
          code: "accessibility-missing",
          severity: "error",
          message: "Accessibility is not granted.",
          nextAction: "Grant Accessibility before routing another task."
        }
      ]
    });

    expect(action).toEqual({
      title: "Grant Accessibility",
      detail: "Grant Accessibility before routing another task.",
      tone: "danger",
      source: "Dashboard alert"
    });
  });
});

describe("readChromeControlState", () => {
  it("derives Chrome control command hints for an actionable current tab", () => {
    const chromeControl = readChromeControlState({
      ...createSnapshot(),
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        extension: {
          state: "connected",
          liveConnection: "connected",
          extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"],
          pageControl: {
            state: "ready",
            capable: true,
            activeTab: {
              host: "127.0.0.1:51234",
              tabId: 42,
              scheme: "http"
            },
            contentScript: {
              state: "loaded"
            },
            capabilities: {
              domActions: true,
              observe: true,
              click: true,
              fill: true,
              submit: true,
              scroll: true,
              screenshot: true
            }
          }
        },
        nativeHost: {
          state: "installed"
        },
        desktopSession: {
          state: "controllable"
        }
      }
    });

    expect(readChromeControlCommandHints(chromeControl)).toEqual([
      {
        id: "observe",
        label: "Observe current page",
        command: "./dist/skfiy chrome observe --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 42 --json",
        mutates: false
      },
      {
        id: "screenshot",
        label: "Screenshot current page",
        command: "./dist/skfiy chrome screenshot --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 42 --json",
        mutates: false
      },
      {
        id: "click",
        label: "Click confirmed selector",
        command: "./dist/skfiy chrome click --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 42 --selector <selector> --json",
        mutates: true
      },
      {
        id: "fill",
        label: "Fill approved field",
        command: "./dist/skfiy chrome fill --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 42 --selector <selector> --text <text> --json",
        mutates: true
      },
      {
        id: "submit",
        label: "Submit approved test form",
        command: "./dist/skfiy chrome submit --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 42 --selector form --json",
        mutates: true
      },
      {
        id: "scroll",
        label: "Scroll current page",
        command: "./dist/skfiy chrome scroll --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id 42 --dy 600 --json",
        mutates: true
      }
    ]);
  });

  it("does not create Chrome command hints before page actions are ready", () => {
    expect(readChromeControlCommandHints(readChromeControlState(createSnapshot()))).toEqual([]);
  });

  it("falls back to Chrome smoke artifact pageControl and tab discovery without exposing artifact paths", () => {
    const chromeControl = readChromeControlState({
      ...createSnapshot(),
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        extension: {
          state: "connected",
          liveConnection: "connected",
          extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"]
        },
        nativeHost: {
          state: "installed"
        },
        desktopSession: {
          state: "controllable"
        }
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "chrome",
            result: "passed",
            path: "/repo/.skfiy-smoke/chrome-current.json",
            pageControl: {
              state: "ready",
              capable: true,
              activeTab: {
                host: "artifact.example",
                tabId: 77,
                scheme: "https"
              },
              contentScript: {
                state: "loaded"
              },
              capabilities: {
                domActions: true,
                observe: true,
                screenshot: "background_required"
              },
              reason: "pageControl from smoke artifact.",
              nextAction: "Use artifact pageControl."
            },
            tabDiscovery: {
              state: "artifact",
              tabs: [
                { id: 77, host: "artifact.example" },
                { id: 78, host: "docs.example" }
              ],
              fallbackReason: "Apple Events fallback discovered the tabs."
            }
          }
        ]
      }
    });

    expect(chromeControl).toMatchObject({
      label: "ready",
      activeTabLabel: "artifact.example tab 77",
      contentScript: "loaded",
      screenshotLane: "screenshot needs permission",
      tabDiscoveryLabel: "artifact · 2 tabs",
      tabDiscoveryReason: "Apple Events fallback discovered the tabs.",
      reason: "pageControl from smoke artifact.",
      nextAction: "Use artifact pageControl."
    });
    expect(JSON.stringify(chromeControl)).not.toContain(".skfiy-smoke");
  });

  it("summarizes Chrome host policy details without exposing local policy paths", () => {
    const chromeControl = readChromeControlState({
      ...createSnapshot(),
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        extension: {
          state: "connected",
          liveConnection: "connected",
          extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"],
          hostPolicy: {
            schemaVersion: 1,
            state: "configured",
            source: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
            path: "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json",
            updatedAt: "2026-07-08T10:00:00.000Z",
            reason: "Chrome host policy loaded from disk.",
            policy: {
              defaultMode: "ask",
              allowedHosts: ["127.0.0.1"],
              currentTurnAllowedHosts: ["turn.example"],
              blockedHosts: ["blocked.example"]
            },
            entries: [
              { decision: "allow", scope: "always", host: "127.0.0.1" },
              { decision: "allow", scope: "current-turn", host: "turn.example" },
              { decision: "block", scope: "host", host: "blocked.example" }
            ]
          },
          pageControl: {
            state: "ready",
            capable: true,
            activeTab: {
              host: "127.0.0.1:51234",
              tabId: 42,
              scheme: "http"
            },
            capabilities: {
              domActions: true,
              observe: true
            }
          }
        }
      }
    });

    expect(chromeControl.hostPolicy.items).toEqual([
      { label: "chrome policy", value: "configured", tone: "success" },
      { label: "source", value: "chrome-host-policy.json", tone: "neutral" },
      { label: "updated", value: "2026-07-08T10:00:00.000Z", tone: "neutral" },
      {
        label: "entries",
        value: "allow:always:127.0.0.1, allow:current-turn:turn.example, block:host:blocked.example",
        tone: "neutral"
      },
      { label: "default", value: "ask", tone: "neutral" },
      { label: "always allow", value: "127.0.0.1", tone: "success" },
      { label: "current turn", value: "turn.example", tone: "warning" },
      { label: "blocked", value: "blocked.example", tone: "danger" },
      { label: "endpoint", value: "/api/chrome-host-policy", tone: "neutral" }
    ]);
    expect(JSON.stringify(chromeControl.hostPolicy)).not.toContain("/Users/tester");
  });

  it("summarizes current page access for the React Apps and Sites card", () => {
    const summary = readAppsSitesSummary({
      ...createSnapshot(),
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        extension: {
          state: "connected",
          liveConnection: "connected",
          extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"],
          hostPolicy: {
            state: "configured",
            reason: "Chrome host policy loaded from disk."
          },
          pageControl: {
            state: "ready",
            capable: true,
            activeTab: {
              host: "127.0.0.1:51234",
              tabId: 42,
              scheme: "http"
            },
            contentScript: {
              state: "loaded"
            },
            capabilities: {
              domActions: true,
              observe: true,
              click: true,
              fill: true,
              submit: true,
              scroll: true,
              screenshot: true
            }
          },
          browserContext: {
            state: "ready",
            title: "skfiy Dashboard",
            url: "http://127.0.0.1:51234/dashboard",
            reason: "Current Chrome page context is ready."
          }
        },
        nativeHost: {
          state: "installed"
        },
        desktopSession: {
          state: "controllable"
        }
      }
    });

    expect(summary).toEqual({
      title: "Apps and sites",
      value: "Ready",
      detail: "Chrome DOM actions and screenshot capture are ready for this HTTP(S) page.",
      tone: "success",
      items: [
        { label: "Chrome", value: "Connected", tone: "success" },
        { label: "Native host", value: "installed", tone: "success" },
        { label: "Current page", value: "127.0.0.1:51234 tab 42", tone: "neutral" },
        { label: "Host policy", value: "configured", tone: "success" },
        { label: "Browser Context", value: "ready", tone: "success" },
        { label: "Screenshot", value: "ready", tone: "success" },
        { label: "Tab discovery", value: "not-probed", tone: "neutral" }
      ]
    });
  });

  it("summarizes artifact pageControl fallback for Apps and Sites without artifact paths", () => {
    const summary = readAppsSitesSummary({
      ...createSnapshot(),
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        extension: {
          state: "connected",
          liveConnection: "connected",
          extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"]
        },
        nativeHost: {
          state: "installed"
        },
        desktopSession: {
          state: "controllable"
        }
      },
      smokeEvidence: {
        artifacts: [
          {
            target: "chrome",
            result: "passed",
            path: "/repo/.skfiy-smoke/chrome-current.json",
            pageControl: {
              state: "ready",
              capable: true,
              activeTab: {
                host: "artifact.example",
                tabId: 77,
                scheme: "https"
              },
              capabilities: {
                domActions: true,
                observe: true,
                screenshot: "background_required"
              }
            },
            tabDiscovery: {
              state: "artifact",
              tabs: [
                { id: 77, host: "artifact.example" },
                { id: 78, host: "docs.example" }
              ],
              fallbackReason: "Apple Events fallback discovered the tabs."
            }
          }
        ]
      }
    });

    expect(summary).toMatchObject({
      title: "Apps and sites",
      value: "Partial",
      detail: "Chrome DOM actions are ready; screenshots may need Chrome capture permission or desktop fallback.",
      tone: "warning",
      items: expect.arrayContaining([
        { label: "Current page", value: "artifact.example tab 77", tone: "neutral" },
        { label: "Screenshot", value: "screenshot needs permission", tone: "warning" },
        { label: "Tab discovery", value: "artifact · 2 tabs", tone: "neutral" }
      ])
    });
    expect(JSON.stringify(summary)).not.toContain(".skfiy-smoke");
  });

  it("derives Chrome setup guide commands from the runtime snapshot without artifact output paths", () => {
    const setupGuide = readChromeSetupGuideSummary({
      ...createSnapshot(),
      runtimeHealth: {
        ...createSnapshot().runtimeHealth,
        extension: {
          state: "native-host-missing",
          setupGuide: {
            nextActions: [
              {
                title: "Install the Chrome Native Messaging host.",
                command: [
                  "skfiy",
                  "chrome",
                  "install-host",
                  "--extension-id",
                  "abcdefghijklmnopabcdefghijklmnop"
                ]
              }
            ],
            installHostCommand: [
              "skfiy",
              "chrome",
              "install-host",
              "--extension-id",
              "abcdefghijklmnopabcdefghijklmnop"
            ],
            verifyStatusCommand: [
              "skfiy",
              "chrome",
              "status",
              "--json",
              "--extension-id",
              "abcdefghijklmnopabcdefghijklmnop"
            ],
            smokeCommand: [
              "npm",
              "run",
              "smoke:chrome",
              "--",
              "--output",
              ".skfiy-smoke/chrome.json"
            ]
          }
        },
        nativeHost: {
          state: "missing"
        }
      }
    });

    expect(setupGuide).toEqual({
      source: "runtime",
      nativeHostState: "missing",
      liveConnectionState: "unknown",
      nextActions: [
        "Install the Chrome Native Messaging host. skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop"
      ],
      commands: [
        {
          id: "install-host",
          label: "Install host",
          command: "skfiy chrome install-host --extension-id abcdefghijklmnopabcdefghijklmnop",
          mutates: true
        },
        {
          id: "status",
          label: "Status",
          command: "skfiy chrome status --json --extension-id abcdefghijklmnopabcdefghijklmnop",
          mutates: false
        },
        {
          id: "smoke",
          label: "Smoke",
          command: "npm run smoke:chrome",
          mutates: false
        }
      ]
    });
    expect(JSON.stringify(setupGuide)).not.toContain(".skfiy-smoke");
  });

  it("uses output-free default Chrome setup commands when no setup guide is present", () => {
    const setupGuide = readChromeSetupGuideSummary(createSnapshot());

    expect(setupGuide.source).toBe("derived");
    expect(setupGuide.nextActions).toEqual([
      "Run the Chrome smoke with the default output-free command."
    ]);
    expect(setupGuide.commands).toEqual(expect.arrayContaining([
      {
        id: "install-host",
        label: "Install host",
        command: "skfiy chrome install-host --extension-id <extension-id>",
        mutates: true
      },
      {
        id: "status",
        label: "Status",
        command: "skfiy chrome status --json --extension-id <extension-id>",
        mutates: false
      },
      {
        id: "smoke",
        label: "Smoke",
        command: "npm run smoke:chrome",
        mutates: false
      }
    ]));
  });

  it("turns Browser Context permission blockers into popup grant and observe steps", () => {
    const snapshot = createSnapshot();
    const extension = snapshot.runtimeHealth.extension as Record<string, unknown>;
    const chromeControl = readChromeControlState({
      ...snapshot,
      runtimeHealth: {
        ...snapshot.runtimeHealth,
        extension: {
          ...extension,
          extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"],
          pageControl: {
            state: "blocked_by_chrome_host_permission",
            activeTab: {
              host: "mew.bytedance.net",
              tabId: 1782098572
            },
            hostPolicy: {
              decision: "allowed"
            },
            chromeHostPermission: {
              state: "missing",
              origins: ["https://mew.bytedance.net/*"]
            },
            chromeCapturePermission: {
              state: "missing",
              origins: ["<all_urls>"]
            },
            capabilities: {
              observe: false,
              screenshot: false
            }
          }
        }
      }
    });

    expect(chromeControl.browserContextAccessSteps).toEqual(expect.arrayContaining([
      {
        id: "open-skfiy-chrome-popup",
        label: "Open skfiy Chrome popup",
        detail: "Click Grant https://mew.bytedance.net/* + <all_urls> and observe.",
        tone: "warning"
      },
      {
        id: "observe-current-page",
        label: "Observe current page",
        detail: "The popup observes the page automatically after access is granted.",
        tone: "neutral"
      }
    ]));
    expect(readChromeControlCommandHints(chromeControl)).toEqual([
      {
        id: "open-popup",
        label: "Open access page",
        command: "POST /api/chrome-control-action {\"action\":\"open-popup\",\"extensionId\":\"plcpkkhlcacihjfohlojdknnkademlno\",\"targetTabId\":1782098572}",
        mutates: true
      }
    ]);
  });
});

function createSmokeDetailSnapshot(): DashboardSnapshot {
  return {
    ...createSnapshot(),
    smokeEvidence: {
      artifacts: [
        {
          target: "chrome",
          result: "passed",
          path: "/repo/.skfiy-smoke/chrome-current.json",
          pageSafety: {
            state: "sensitive-paused",
            source: "chrome-smoke",
            sensitivePause: true,
            pauseCount: 2,
            checkedRuns: 2,
            runs: [
              {
                kind: "sensitive-page",
                result: "sensitive-paused",
                sensitivePause: true,
                reason: "Sensitive UI text is visible.",
                pageSafety: {
                  findings: [
                    {
                      kind: "credential",
                      severity: "sensitive"
                    }
                  ]
                }
              },
              {
                kind: "sensitive-form-prefill",
                result: "passed",
                sensitivePause: false
              }
            ]
          },
          pageControl: {
            source: "chrome-smoke-action",
            state: "ready",
            capable: true,
            activeTab: {
              state: "eligible",
              tabId: 123,
              host: "127.0.0.1:60329"
            },
            contentScript: {
              state: "loaded"
            },
            capabilities: {
              domActions: true,
              screenshot: "background_required",
              click: true,
              fill: true,
              submit: true,
              scroll: true
            },
            reason: "pageControl is ready.",
            nextAction: "Use pageControl actions."
          }
        },
        {
          target: "finder",
          result: "blocked",
          path: "/repo/.skfiy-smoke/finder-current.json",
          finder: {
            result: "blocked",
            source: "finder-smoke",
            desktopPreflight: {
              result: "blocked",
              reason: "Desktop session is not controllable before target app launch.",
              frontmostBundleId: "com.apple.loginwindow",
              mainDisplayAsleep: false,
              controllable: false
            },
            finderObservation: {
              result: "blocked",
              reason: "Skipped because desktop preflight is blocked.",
              accessibilityTrusted: true
            },
            finderSemanticObservation: {
              result: "skipped",
              reason: "Desktop preflight blocked."
            },
            finderItemDragDrop: {
              result: "skipped",
              reason: "Desktop preflight blocked."
            },
            reason: "Desktop session is not controllable before target app launch."
          }
        }
      ]
    }
  };
}

describe("readPersonalMutationReceipt", () => {
  it("summarizes personal memory mutation safety without echoing memory content", () => {
    const receipt = readPersonalMutationReceipt({
      command: "dashboard personal memory",
      source: "dashboard",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "forgotten",
      applied: 1,
      ignored: 0,
      blocked: 0,
      pendingWriteCount: 2,
      personalMemory: {
        userEntryCount: 0,
        agentEntryCount: 1
      }
    });

    expect(receipt).toEqual({
      title: "Personal memory mutation receipt",
      result: "forgotten",
      tone: "success",
      items: [
        { label: "command", value: "dashboard personal memory", tone: "neutral" },
        { label: "source", value: "dashboard", tone: "neutral" },
        { label: "planned mutation", value: "yes", tone: "warning" },
        { label: "system mutation", value: "yes", tone: "warning" },
        { label: "applied", value: "1", tone: "success" },
        { label: "ignored", value: "0", tone: "neutral" },
        { label: "blocked", value: "0", tone: "success" },
        { label: "pending writes", value: "2", tone: "warning" }
      ]
    });
    expect(JSON.stringify(receipt)).not.toContain("User prefers concise Chinese updates.");
  });

  it("summarizes personal skill mute receipts", () => {
    expect(readPersonalMutationReceipt({
      command: "dashboard personal skills",
      source: "dashboard",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "muted",
      personalSkills: {
        disabledSkillIds: ["dashboard-knowledge-surface"],
        mutedSkillCount: 1
      }
    })).toEqual({
      title: "Personal skill mutation receipt",
      result: "muted",
      tone: "success",
      items: [
        { label: "command", value: "dashboard personal skills", tone: "neutral" },
        { label: "source", value: "dashboard", tone: "neutral" },
        { label: "planned mutation", value: "yes", tone: "warning" },
        { label: "system mutation", value: "yes", tone: "warning" },
        { label: "muted skills", value: "1", tone: "warning" }
      ]
    });
  });
});

describe("readRouteOutcome", () => {
  it("uses an explicit snapshot route outcome before reclassifying current turn fields", () => {
    const outcome = readRouteOutcome({
      ...createSnapshot(),
      currentTurn: {
        state: "executing",
        command: "still running"
      },
      routeOutcome: {
        kind: "needs_confirmation",
        title: "Route needs confirmation",
        value: "needs_confirmation",
        detail: "Runtime replay needs a human verification check.",
        tone: "warning",
        source: "runtime-snapshot",
        routeLabel: "Ghostty",
        state: "needs_confirmation",
        policyKind: "route-policy"
      }
    });

    expect(outcome).toMatchObject({
      kind: "needs_confirmation",
      title: "Route needs confirmation",
      value: "needs_confirmation",
      detail: "Runtime replay needs a human verification check.",
      source: "runtime-snapshot",
      routeLabel: "Ghostty",
      state: "needs_confirmation",
      policyKind: "route-policy"
    });
  });

  it.each([
    [
      "app-policy denial",
      {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        denialKind: "app_policy",
        policyKind: "app-policy",
        latestMessage: "Ghostty is denied by app policy."
      },
      {
        kind: "app_policy_denied",
        title: "App policy denied route",
        value: "app_policy_denied",
        tone: "danger",
        routeLabel: "ghostty",
        denialKind: "app_policy",
        policyKind: "app-policy"
      }
    ],
    [
      "user denial",
      {
        state: "denied",
        route: "chrome",
        reason: "User denied this browser mutation."
      },
      {
        kind: "user_denied",
        title: "User denied route",
        value: "user_denied",
        tone: "neutral",
        routeLabel: "chrome"
      }
    ],
    [
      "blocked user denial metadata",
      {
        state: "blocked",
        route: "finder",
        denialKind: "user",
        reason: "User denied this Finder organization request."
      },
      {
        kind: "user_denied",
        title: "User denied route",
        value: "user_denied",
        tone: "neutral",
        routeLabel: "finder",
        denialKind: "user"
      }
    ],
    [
      "Chrome host policy denial",
      {
        state: "blocked",
        route: "chrome",
        routeReason: "Chrome host policy blocked this approved task: blocked.example",
        policyKind: "chrome-host-policy",
        latestMessage: "Chrome host policy blocked this approved task: blocked.example"
      },
      {
        kind: "chrome_host_policy_denied",
        title: "Chrome host policy denied route",
        value: "chrome_host_policy_denied",
        tone: "danger",
        routeLabel: "chrome",
        policyKind: "chrome-host-policy"
      }
    ],
    [
      "environment blocker",
      {
        state: "blocked",
        route: "finder",
        latestMessage: "Screen Recording permission is denied."
      },
      {
        kind: "blocked",
        title: "Route blocked",
        value: "blocked",
        tone: "danger",
        routeLabel: "finder"
      }
    ],
    [
      "confirmation gate",
      {
        state: "needs_confirmation",
        targetRoute: { kind: "finder", bundleId: "com.apple.finder" },
        reason: "Confirm before organizing Finder."
      },
      {
        kind: "needs_confirmation",
        title: "Route needs confirmation",
        value: "needs_confirmation",
        tone: "warning",
        routeLabel: "finder"
      }
    ],
    [
      "cancellation",
      {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Browser task cancelled before execution."
      },
      {
        kind: "cancelled",
        title: "Route cancelled",
        value: "cancelled",
        tone: "neutral",
        routeLabel: "chrome"
      }
    ],
    [
      "stop turn",
      {
        state: "cancelled",
        route: "chrome",
        latestMessage: "Task stopped."
      },
      {
        kind: "stopped",
        title: "Route stopped",
        value: "stopped",
        tone: "neutral",
        routeLabel: "chrome"
      }
    ],
    [
      "stopTurnBehavior artifact",
      {
        state: "cancelled",
        route: "finder",
        stopTurnBehavior: {
          afterStatus: "cancelled",
          afterMessage: "Task stopped."
        }
      },
      {
        kind: "stopped",
        title: "Route stopped",
        value: "stopped",
        tone: "neutral",
        routeLabel: "finder"
      }
    ],
    [
      "completion",
      {
        state: "completed",
        route: "tmux_supervision",
        latestMessage: "money-run supervision completed.",
        approvalRequired: true
      },
      {
        kind: "completed",
        title: "Route completed",
        value: "completed",
        tone: "success",
        routeLabel: "tmux_supervision"
      }
    ]
  ])("keeps %s distinct", (_label, currentTurn, expected) => {
    const outcome = readRouteOutcome({
      ...createSnapshot(),
      currentTurn
    });

    expect(outcome).toMatchObject(expected);
  });
});

function createRuntimeSnapshotDetailFixture(): DashboardSnapshot {
  const base = createSnapshot();

  return {
    ...base,
    generatedAt: "2026-06-20T00:01:00.000Z",
    runtimeHealth: {
      ...base.runtimeHealth,
      runtimeSnapshot: {
        state: "available",
        source: "runtime-snapshot",
        observedAt: "2026-06-20T00:00:20.000Z"
      }
    },
    currentTurn: {
      state: "executing",
      source: "runtime-snapshot",
      observedAt: "2026-06-20T00:00:20.000Z",
      command: "pwd",
      targetApp: "Ghostty",
      risk: "low",
      approvalState: "approved",
      stopState: "armed",
      agentProvider: "Codex",
      latestAction: { type: "type_text", textLength: 3 },
      latestVerification: {
        type: "verify",
        actionType: "press_key",
        status: "passed",
        message: "enter accepted"
      },
      latestScreenshot: {
        stage: "after",
        path: "/tmp/after.png",
        recommendation: "structured_first",
        sourceCount: 2
      },
      latestMessage: "Typing command."
    },
    replay: {
      state: "available",
      source: "runtime-snapshot",
      observedAt: "2026-06-20T00:00:20.000Z",
      screenshotCount: 2,
      actionCount: 3,
      verificationCount: 1,
      screenshots: [
        { stage: "before", path: "/tmp/before.png" },
        {
          stage: "after",
          path: "/tmp/after.png",
          recommendation: "structured_first",
          sourceCount: 2
        }
      ],
      actions: [
        { type: "plan", providerLabel: "External CUA", command: "pwd" },
        { type: "type_text", textLength: 3 }
      ],
      verifications: [
        {
          type: "verify",
          actionType: "press_key",
          status: "passed",
          message: "enter accepted"
        }
      ],
      timelineTail: [
        { status: "executing", message: "Typing command." },
        { status: "completed", command: "pwd" }
      ]
    }
  };
}

function createActivityFeedSnapshotFixture(): DashboardSnapshot {
  const activity = {
    kind: "chrome-control-action",
    title: "Chrome fill",
    target: {
      app: "Google Chrome",
      host: "example.test",
      tabId: 42
    },
    result: "verified",
    command: "/repo/dist/skfiy chrome fill --selector #token --text typed-secret --json",
    timestamp: "2026-06-20T00:00:30.000Z"
  };

  return {
    ...createRuntimeSnapshotDetailFixture(),
    currentTurn: {
      ...createRuntimeSnapshotDetailFixture().currentTurn,
      chromeControlActivity: activity
    },
    replay: {
      ...createRuntimeSnapshotDetailFixture().replay,
      chromeControlActions: [activity]
    }
  };
}

function createHomeSummarySnapshotFixture(): DashboardSnapshot {
  return {
    ...createSnapshot(),
    currentTurn: {
      state: "needs_confirmation",
      command: "organize Downloads",
      targetApp: "Finder",
      risk: "high",
      approvalState: "required",
      stopState: "armed",
      latestMessage: "Confirm the Finder plan."
    },
    runtimeHealth: {
      ...createSnapshot().runtimeHealth,
      desktopSession: {
        state: "controllable",
        frontmostLocalizedName: "Finder"
      }
    },
    providers: {
      ...createSnapshot().providers,
      planner: {
        provider: "planner",
        mode: "external-cua",
        label: "External CUA",
        health: "available",
        endpoint: "https://cua.example.test/plan?token=planner-secret"
      }
    },
    alerts: []
  };
}

function createLongHorizonSnapshotFixture(): DashboardSnapshot {
  return {
    ...createSnapshot(),
    longHorizon: {
      state: "observing",
      session: "money-run",
      source: "tmux-read-only-probe",
      mutatesSession: false,
      summary: {
        windowCount: 2,
        paneCount: 3,
        activePaneIds: ["%1"],
        deadPaneIds: []
      },
      activePane: {
        id: "%1",
        windowName: "agent",
        currentCommand: "zsh",
        title: "main",
        recentTailPreview: "building...\nwaiting for next event"
      },
      signals: [],
      recommendation: {
        action: "continue_observing",
        reason: "money-run has 2 windows, 3 panes, and no obvious block markers.",
        mutatesSession: false
      },
      probeCommands: [
        "tmux has-session -t money-run",
        "tmux capture-pane -p -t %1 -S -120"
      ]
    }
  };
}

function createApprovalQueueSnapshotFixture(): DashboardSnapshot {
  return {
    ...createSnapshot(),
    currentTurn: {
      state: "approval_required",
      approvalState: "required",
      approvalRequired: true,
      risk: "high",
      command: "move files in Finder",
      latestMessage: "Approval required before moving files."
    },
    runtimeHealth: {
      ...createSnapshot().runtimeHealth,
      extension: {
        state: "stale",
        liveConnection: "disconnected",
        hostPolicy: {
          state: "default",
          reason: "Chrome host policy has not been configured."
        }
      }
    },
    providers: {
      ...createSnapshot().providers,
      planner: {
        provider: "planner",
        mode: "external-cua",
        label: "External CUA",
        health: "available",
        endpoint: "https://cua.example.test/plan?token=planner-secret"
      }
    }
  };
}

function createClearApprovalQueueSnapshotFixture(): DashboardSnapshot {
  return {
    ...createSnapshot(),
    currentTurn: {
      state: "idle",
      latestMessage: "Ready."
    },
    runtimeHealth: {
      ...createSnapshot().runtimeHealth,
      extension: {
        state: "connected",
        liveConnection: "connected",
        hostPolicy: {
          state: "configured"
        }
      }
    }
  };
}

function createSnapshot(): DashboardSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-07T12:00:00.000Z",
    descriptor: {
      schemaVersion: 1,
      bind: { host: "127.0.0.1", port: 51234 },
      url: "http://127.0.0.1:51234/",
      auth: { mode: "optional-token", tokenPrinted: false },
      updates: { transport: "sse", scope: "local-http" },
      panels: []
    },
    runtimeHealth: {
      desktopSession: { state: "controllable" },
      extension: {
        liveConnection: "connected",
        browserContext: {
          state: "ready",
          title: "skfiy Dashboard",
          url: "http://127.0.0.1:51234/dashboard",
          reason: "Current Chrome page context is ready."
        }
      },
      nativeHost: { state: "installed" }
    },
    operatorReadiness: {},
    permissions: {
      screenRecording: "missing",
      accessibility: "granted",
      finderAutomation: "unknown"
    },
    currentTurn: {
      state: "approval_required",
      command: "move a file in Finder",
      approvalRequired: true,
      latestMessage: "Approval required."
    },
    replay: {
      state: "available",
      actionCount: 1
    },
    smokeEvidence: { artifacts: [] },
    dogfoodRelease: {},
    longHorizon: {},
    personalMemory: {
      userEntryCount: 1,
      agentEntryCount: 1,
      sessionCount: 3,
      recentUserEntries: ["User prefers concise Chinese updates."],
      recentAgentEntries: ["Prefer Obsidian-like dashboard surfaces."],
      pendingWriteCount: 1,
      pendingWrites: [
        {
          id: "pmw-review-style",
          createdAt: "2026-06-24T05:00:00.000Z",
          source: "post-turn-review",
          action: "add",
          target: "user",
          content: "User wants memory writes reviewed before becoming durable."
        }
      ],
      personalSkills: [
        {
          id: "communication-style",
          kind: "communication",
          label: "Concise Chinese progress updates",
          description: "User prefers short Chinese progress updates.",
          promptHint: "Use concise Chinese progress updates.",
          evidenceCount: 2,
          evidence: ["User prefers concise Chinese updates."]
        },
        {
          id: "dashboard-knowledge-surface",
          kind: "dashboard",
          label: "Obsidian-style knowledge dashboard",
          description: "User wants dashboard work to feel like a linked local knowledge surface.",
          promptHint: "Favor linked memory, sessions, skills, and graph/canvas evidence over control-plane panels.",
          evidenceCount: 2,
          evidence: ["Prefer Obsidian-like dashboard surfaces."]
        }
      ],
      workingProfile: {
        label: "Working profile",
        source: "derived-local-memory",
        portability: "plain-text",
        summary: "Portable skfiy working profile: Concise Chinese progress updates; Obsidian-style knowledge dashboard.",
        habits: [
          "Use concise Chinese progress updates.",
          "Favor linked memory, sessions, skills, and graph/canvas evidence over control-plane panels."
        ],
        evidence: [
          "User prefers concise Chinese updates.",
          "Prefer Obsidian-like dashboard surfaces."
        ],
        memoryEntryCount: 2,
        sessionCount: 3,
        skillCount: 2
      },
      recentSessions: [
        {
          createdAt: "2026-07-07T12:00:00.000Z",
          providerLabel: "Codex",
          userInput: "summarize dashboard",
          recallBasis: "matched terms: dashboard; score: 1",
          browserTitle: "Dashboard"
        },
        {
          createdAt: "2026-07-07T11:55:00.000Z",
          providerLabel: "Hermes",
          userInput: "remember concise updates",
          recallBasis: "matched terms: concise, updates; score: 2"
        }
      ],
      memoryJournal: [
        {
          id: "pmj-20260623T120000000Z-1",
          createdAt: "2026-07-07T12:00:00.000Z",
          source: "post-turn-review",
          stage: "durable",
          turnId: "turn-1",
          providerLabel: "Codex",
          userInput: "summarize dashboard",
          action: "add",
          target: "user",
          content: "User prefers concise Chinese updates."
        },
        {
          id: "pmj-20260623T120500000Z-1",
          createdAt: "2026-07-07T12:05:00.000Z",
          source: "post-turn-review",
          stage: "pending",
          turnId: "turn-2",
          providerLabel: "Hermes",
          userInput: "bring verification evidence",
          action: "replace",
          target: "user",
          previousContent: "User prefers concise Chinese updates.",
          content: "User prefers concise Chinese-first progress updates with verification evidence."
        }
      ]
    },
    providers: {
      assistant: {
        provider: "assistant",
        mode: "codex",
        label: "Codex",
        health: "available"
      },
      planner: {
        provider: "planner",
        mode: "local-deterministic",
        label: "Local deterministic",
        health: "available"
      }
    },
    alerts: [
      {
        code: "screen-recording-missing",
        severity: "warning",
        message: "Screen Recording is not granted."
      }
    ]
  };
}
