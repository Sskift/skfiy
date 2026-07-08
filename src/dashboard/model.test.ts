import { describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "./contracts";
import {
  readActivityFeedSummary,
  readAgentSupervisionSummary,
  readApprovalQueueSummary,
  readChromeControlCommandHints,
  readChromeControlState,
  readChromeSetupGuideSummary,
  readComputerUseReadiness,
  readHomeSummary,
  readKnowledgeGraph,
  readLongHorizonSummary,
  readPersonalMutationReceipt,
  readRouteOutcome,
  readRuntimeSnapshotDetails,
  readSmokeArtifactDetails
} from "./model";

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
      value: "Waiting",
      detail: "Approval required",
      tone: "warning",
      items: [
        { label: "assistant", value: "Approval required", tone: "warning" },
        { label: "current task", value: "organize Downloads", tone: "neutral" },
        { label: "target", value: "Finder", tone: "neutral" },
        { label: "risk", value: "high", tone: "neutral" },
        { label: "next", value: "Review the pending approval.", tone: "warning" },
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
          pageControl: {
            state: "blocked_by_chrome_host_permission",
            activeTab: {
              host: "mew.bytedance.net"
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
  it.each([
    [
      "app-policy denial",
      {
        state: "blocked",
        route: "ghostty",
        reason: "Ghostty is denied by app policy.",
        latestMessage: "Ghostty is denied by app policy."
      },
      {
        kind: "app_policy_denied",
        title: "App policy denied route",
        value: "app_policy_denied",
        tone: "danger",
        routeLabel: "ghostty"
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
        latestMessage: "Task stopped."
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
