import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardApp } from "./DashboardApp";
import type {
  DashboardPersonalSkillActionResponse,
  DashboardProviderSettingsResponse,
  DashboardSnapshot
} from "./contracts";

const snapshot: DashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-06-22T08:00:00.000Z",
  descriptor: {
    schemaVersion: 1,
    bind: { host: "127.0.0.1", port: 52363 },
    url: "http://127.0.0.1:52363/",
    auth: { mode: "optional-token", tokenPrinted: false },
    updates: { transport: "sse", scope: "local-http" },
    eventStore: { mode: "append-only", requiredForExecution: false },
    panels: []
  },
  runtimeHealth: {
    app: { state: "installed" },
    helper: { state: "installed" },
    dashboard: { state: "running", url: "http://127.0.0.1:52363/" },
    extension: {
      state: "connected",
      liveConnection: "connected",
      extensionIds: ["plcpkkhlcacihjfohlojdknnkademlno"],
      tabDiscovery: {
        result: "verified",
        discoveryMode: "chrome-apple-events",
        tabs: [{ id: 42, host: "127.0.0.1:52363" }]
      },
      hostPolicy: {
        schemaVersion: 1,
        state: "configured",
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
        activeTab: { host: "127.0.0.1:52363", tabId: 42, scheme: "http" },
        contentScript: { state: "loaded" },
        capabilities: {
          domActions: true,
          observe: true,
          click: true,
          fill: true,
          submit: true,
          scroll: true,
          screenshot: "background_required"
        }
      },
      browserContext: {
        state: "ready",
        source: "runtime-health",
        url: "http://127.0.0.1:52363/dashboard",
        title: "skfiy Dashboard",
        observedAt: "2026-06-22T07:59:58.000Z",
        reason: "Current Chrome page context is ready."
      }
    },
    nativeHost: { state: "installed" },
    desktopSession: { state: "controllable" },
    cli: { state: "installed" }
  },
  operatorReadiness: {
    state: "blocked",
    appReadiness: {
      chrome: {
        app: "Chrome",
        state: "blocked",
        source: "runtime",
        reason: "Chrome Native Messaging host manifest is not installed."
      },
      finder: {
        app: "Finder",
        state: "blocked",
        source: "finder-smoke",
        reason: "Finder Automation has not been proven because desktop preflight is blocked."
      },
      ghostty: {
        app: "Ghostty",
        state: "needs-evidence",
        source: "smoke-missing",
        reason: "No fresh Ghostty smoke artifact has been recorded."
      }
    },
    recentSmokeEvidence: {
      state: "needs-evidence",
      requiredTargets: ["chrome", "cli"],
      recentPassedTargets: ["dashboard"],
      missingTargets: ["chrome", "cli"],
      unsupportedTargets: ["voice"],
      unsupportedPassedTargets: ["voice"]
    }
  },
  permissions: {
    screenRecording: "granted",
    accessibility: "granted",
    finderAutomation: "granted"
  },
  currentTurn: {
    state: "idle",
    latestMessage: "你好，我在。"
  },
  replay: {
    state: "empty",
    actionCount: 0
  },
  smokeEvidence: {
    artifacts: [
      { target: "chrome", result: "passed" },
      { target: "dashboard", result: "passed" }
    ]
  },
  dogfoodRelease: {
    state: "waiting-for-dogfood",
    releaseDrift: {
      state: "behind-head",
      releaseCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      currentHeadCommitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    cohort: {
      state: "present",
      acceptedReportCount: 1,
      distinctRealTesterCount: 1,
      ready: false,
      passedReady: false
    }
  },
  longHorizon: {
    state: "observing",
    session: "money-run"
  },
  alerts: [
    {
      code: "screen-recording-missing",
      severity: "warning",
      message: "Screen Recording is not granted."
    }
  ],
  providers: {
    assistant: {
      provider: "assistant",
      mode: "codex",
      label: "Codex",
      health: "available",
      detail: "Codex assistant is selected."
    },
    planner: {
      provider: "planner",
      mode: "external-cua",
      label: "OpenAI CUA",
      health: "available",
      detail: "External CUA endpoint and API key are configured.",
      endpointConfigured: true,
      externalApiKeyConfigured: true
    }
  },
  personalMemory: {
    userEntryCount: 1,
    agentEntryCount: 1,
    sessionCount: 2,
    latestUpdatedAt: "2026-07-07T10:00:00.000Z",
    usage: {
      user: {
        usedChars: 37,
        limitChars: 1_375,
        percent: 2
      },
      agent: {
        usedChars: 66,
        limitChars: 2_200,
        percent: 3
      }
    },
    recentUserEntries: ["User prefers concise Chinese updates."],
    recentAgentEntries: ["For dashboard work, prefer dense Obsidian-like knowledge surfaces."],
    pendingWriteCount: 2,
    pendingWrites: [
      {
        id: "pmw-approve",
        createdAt: "2026-06-24T05:00:00.000Z",
        source: "post-turn-review",
        action: "add",
        target: "user",
        content: "User wants memory writes reviewed before becoming durable."
      },
      {
        id: "pmw-reject",
        createdAt: "2026-06-24T05:01:00.000Z",
        source: "post-turn-review",
        action: "add",
        target: "agent",
        content: "Use pending review before changing durable operating notes."
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
        evidence: ["For dashboard work, prefer dense Obsidian-like knowledge surfaces."]
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
        "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
      ],
      memoryEntryCount: 2,
      sessionCount: 2,
      skillCount: 2
    },
    recentSessions: [
      {
        createdAt: "2026-07-07T10:00:00.000Z",
        providerLabel: "Codex",
        userInput: "Summarize current dashboard state.",
        recallBasis: "matched terms: dashboard; score: 1",
        browserTitle: "skfiy Dashboard"
      },
      {
        createdAt: "2026-07-07T09:55:00.000Z",
        providerLabel: "Hermes",
        userInput: "以后进度更新短一点",
        recallBasis: "matched terms: concise, updates; score: 2"
      }
    ],
    memoryJournal: [
      {
        id: "pmj-20260623T100000000Z-1",
        createdAt: "2026-07-07T10:00:00.000Z",
        source: "post-turn-review",
        stage: "durable",
        turnId: "turn-1",
        providerLabel: "Codex",
        userInput: "Summarize current dashboard state.",
        action: "add",
        target: "user",
        content: "User prefers concise Chinese updates."
      },
      {
        id: "pmj-20260623T100500000Z-1",
        createdAt: "2026-07-07T10:05:00.000Z",
        source: "post-turn-review",
        stage: "pending",
        turnId: "turn-2",
        providerLabel: "Hermes",
        userInput: "以后带验证证据",
        action: "replace",
        target: "user",
        previousContent: "User prefers concise Chinese updates.",
        content: "User prefers concise Chinese-first progress updates with verification evidence."
      }
    ]
  }
};

describe("DashboardApp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a user-control dashboard from the skfiy snapshot contract", async () => {
    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => snapshot)}
    />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "skfiy" })).toBeInTheDocument();
    });

    const navigation = screen.getByRole("navigation", { name: "skfiy dashboard navigation" });
    expect(within(navigation).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Agent" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Memory" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Graph" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Tools" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Browser Context" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Activity" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Next action" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "skfiy agent workspace" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Background Agent" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Knowledge graph" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agent tools" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Browser" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Next action" })).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Overview" });
    expect(within(overview).getByRole("heading", { name: "Assistant Provider" })).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Computer Use" })).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Chrome Browser Context" })).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Current Turn" })).toBeInTheDocument();
    const commandCenter = within(overview).getByRole("region", { name: "Agent workspace" });
    expect(within(commandCenter).getByText("Background Agent workspace")).toBeInTheDocument();
    expect(within(commandCenter).getByRole("img", { name: "Readiness radar chart" })).toBeInTheDocument();
    expect(within(commandCenter).getByRole("img", { name: "Agent runtime flow chart" })).toBeInTheDocument();
    expect(within(commandCenter).getByRole("img", { name: "Activity bar chart" })).toBeInTheDocument();
    expect(within(commandCenter).getByRole("progressbar", { name: "Operational confidence" })).toBeInTheDocument();
    expect(within(commandCenter).getByRole("progressbar", { name: "Browser context" })).toBeInTheDocument();

    const provider = screen.getByRole("region", { name: "Background Agent" });
    expect(within(provider).getByText("assistant · codex")).toBeInTheDocument();
    expect(within(provider).getByText("planner · external-cua")).toBeInTheDocument();
    expect(within(provider).getByText("External CUA endpoint and API key are configured.")).toBeInTheDocument();
    expect(within(provider).getAllByText("api key configured").length).toBeGreaterThan(0);

    const assistantHealth = within(provider).getByRole("region", { name: "Assistant provider health" });
    expect(within(assistantHealth).getByText("selected codex")).toBeInTheDocument();
    expect(within(assistantHealth).getByText("timeout 45000ms")).toBeInTheDocument();
    expect(within(assistantHealth).getByRole("heading", { name: "Codex" })).toBeInTheDocument();
    expect(within(assistantHealth).getByRole("heading", { name: "Claude Code" })).toBeInTheDocument();
    expect(within(assistantHealth).getByRole("heading", { name: "Hermes" })).toBeInTheDocument();
    expect(within(assistantHealth).getAllByText("readiness ready").length).toBeGreaterThanOrEqual(1);
    expect(within(assistantHealth).getByText("/opt/homebrew/bin/codex")).toBeInTheDocument();
    expect(within(assistantHealth).getByText("source env")).toBeInTheDocument();
    expect(within(assistantHealth).getByText("readiness unavailable")).toBeInTheDocument();
    expect(within(assistantHealth).getByText("missing-claude not found")).toBeInTheDocument();

    const memory = screen.getByRole("region", { name: "Memory" });
    expect(within(memory).getByRole("heading", { name: "Personal memory" })).toBeInTheDocument();
    const userPreferenceList = within(memory).getByRole("list", { name: "User preferences" });
    expect(within(userPreferenceList).getByText("User prefers concise Chinese updates.")).toBeInTheDocument();
    const agentNoteList = within(memory).getByRole("list", { name: "Agent operating notes" });
    expect(within(agentNoteList).getByText(
      "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
    )).toBeInTheDocument();
    expect(within(memory).getByText("user budget 2% - 37/1,375 chars")).toBeInTheDocument();
    expect(within(memory).getByText("agent budget 3% - 66/2,200 chars")).toBeInTheDocument();
    expect(within(memory).getByText("sessions 2")).toBeInTheDocument();
    expect(within(memory).getByText("pending writes 2")).toBeInTheDocument();
    expect(within(memory).getByRole("heading", { name: "Pending memory writes" })).toBeInTheDocument();
    expect(within(memory).getByText("User wants memory writes reviewed before becoming durable.")).toBeInTheDocument();
    expect(within(memory).getByRole("heading", { name: "Personal skill cards" })).toBeInTheDocument();
    expect(within(memory).getByText("Concise Chinese progress updates")).toBeInTheDocument();
    expect(within(memory).getByText("Obsidian-style knowledge dashboard")).toBeInTheDocument();
    expect(within(memory).getByRole("heading", { name: "Working profile" })).toBeInTheDocument();
    expect(within(memory).getByText(
      "Portable skfiy working profile: Concise Chinese progress updates; Obsidian-style knowledge dashboard."
    )).toBeInTheDocument();
    expect(within(memory).getByText("plain-text")).toBeInTheDocument();
    const communicationEvidence = within(memory).getByRole("list", {
      name: "Evidence for Concise Chinese progress updates"
    });
    expect(within(communicationEvidence).getByText("User prefers concise Chinese updates.")).toBeInTheDocument();
    const dashboardEvidence = within(memory).getByRole("list", {
      name: "Evidence for Obsidian-style knowledge dashboard"
    });
    expect(within(dashboardEvidence).getByText(
      "For dashboard work, prefer dense Obsidian-like knowledge surfaces."
    )).toBeInTheDocument();
    expect(within(memory).getByRole("heading", { name: "Memory evolution" })).toBeInTheDocument();
    const memoryEvolution = within(memory).getByRole("list", { name: "Memory evolution trail" });
    expect(within(memoryEvolution).getByText("Turn turn-2 · Hermes · pending")).toBeInTheDocument();
    expect(within(memoryEvolution).getByText("replace user memory")).toBeInTheDocument();
    expect(within(memoryEvolution).getByText("from User prefers concise Chinese updates.")).toBeInTheDocument();
    expect(within(memoryEvolution).getByText(
      "to User prefers concise Chinese-first progress updates with verification evidence."
    )).toBeInTheDocument();
    expect(within(memoryEvolution).getByText("learned after: 以后带验证证据")).toBeInTheDocument();
    expect(within(memory).getByRole("heading", { name: "Recent session recall" })).toBeInTheDocument();
    expect(within(memory).getByText("Codex · skfiy Dashboard")).toBeInTheDocument();
    expect(within(memory).getByText("Summarize current dashboard state.")).toBeInTheDocument();
    expect(within(memory).getByText("Hermes")).toBeInTheDocument();
    expect(within(memory).getByText("以后进度更新短一点")).toBeInTheDocument();
    const sessionRecall = within(memory).getByRole("list", { name: "Recent session recall" });
    expect(within(sessionRecall).getAllByText("recalls context -> Codex")).toHaveLength(2);
    expect(within(sessionRecall).getAllByText("volatile session recall")).toHaveLength(2);
    expect(within(sessionRecall).getByText("Recall basis: matched terms: dashboard; score: 1")).toBeInTheDocument();
    expect(within(sessionRecall).getByText("Recall basis: matched terms: concise, updates; score: 2")).toBeInTheDocument();

    const graph = screen.getByRole("region", { name: "Knowledge graph" });
    expect(within(graph).getAllByText("User preferences").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText(/2% - 37\/1,375 chars/u).length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Latest session").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Recent session 2").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Codex").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Browser Context").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Computer Use").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Concise Chinese progress updates").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Obsidian-style knowledge dashboard").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Working profile").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Pending user memory").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("injects prompt").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("guides prompt").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("stages").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("awaits approval").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("travels with prompt").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("recalls context").length).toBeGreaterThan(0);
    expect(within(graph).getByRole("list", { name: "Vault notes" })).toBeInTheDocument();
    expect(within(graph).getByText("User preferences.md")).toBeInTheDocument();
    expect(within(graph).getByText("Recent session 2.md")).toBeInTheDocument();
    expect(within(graph).getAllByText(/Recall basis: matched terms:/u).length).toBeGreaterThan(0);
    fireEvent.click(within(graph).getByRole("button", { name: "Open note User preferences.md" }));
    const focusedNote = within(graph).getByRole("region", { name: "Focused note" });
    expect(within(focusedNote).getByRole("heading", { name: "User preferences.md" })).toBeInTheDocument();
    expect(within(focusedNote).getByText(/2% - 37\/1,375 chars/u)).toBeInTheDocument();
    expect(within(focusedNote).getByText("injects prompt -> Codex")).toBeInTheDocument();

    const computerUse = screen.getByRole("region", { name: "Agent tools" });
    expect(within(computerUse).getByRole("heading", { name: "Computer Use tool" })).toBeInTheDocument();
    expect(within(computerUse).getByRole("heading", { name: "Chrome readiness" })).toBeInTheDocument();
    expect(within(computerUse).getByRole("heading", { name: "Finder readiness" })).toBeInTheDocument();
    expect(within(computerUse).getByRole("heading", { name: "Ghostty readiness" })).toBeInTheDocument();
    expect(within(computerUse).getByText("Chrome Native Messaging host manifest is not installed.")).toBeInTheDocument();
    expect(within(computerUse).getByText("Finder Automation has not been proven because desktop preflight is blocked.")).toBeInTheDocument();
    expect(within(computerUse).getByText("No fresh Ghostty smoke artifact has been recorded.")).toBeInTheDocument();
    expect(within(computerUse).getByText("ignored unsupported smoke: voice")).toBeInTheDocument();
    expect(within(computerUse).getByText("Screen Recording")).toBeInTheDocument();

    const browser = screen.getByRole("region", { name: "Browser" });
    expect(within(browser).getByRole("heading", { name: "Browser control" })).toBeInTheDocument();
    expect(within(browser).getByText("127.0.0.1:52363 tab 42")).toBeInTheDocument();
    expect(within(browser).getByText("Browser Context")).toBeInTheDocument();
    expect(within(browser).getByText("skfiy Dashboard")).toBeInTheDocument();
    expect(within(browser).getByText("http://127.0.0.1:52363/dashboard")).toBeInTheDocument();
    expect(within(browser).getByText("Current Chrome page context is ready.")).toBeInTheDocument();
    expect(within(browser).getByText("plcpkkhlcacihjfohlojdknnkademlno")).toBeInTheDocument();
    expect(within(browser).getByText("screenshot: background_required")).toBeInTheDocument();
    expect(within(browser).getByText("Using Chrome tab fallback")).toBeInTheDocument();
    expect(within(browser).getByText("allow:always:127.0.0.1")).toBeInTheDocument();

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(within(activity).getByRole("heading", { name: "Latest blocker" })).toBeInTheDocument();
    expect(within(activity).getByRole("heading", { name: "Runtime evidence" })).toBeInTheDocument();
    expect(within(activity).getByRole("heading", { name: "Operator evidence" })).toBeInTheDocument();
    expect(within(activity).getByRole("link", { name: "Operator evidence JSON" }))
      .toHaveAttribute("href", "/api/operator-evidence");
    expect(within(activity).getByText("release behind-head")).toBeInTheDocument();
    expect(within(activity).getByText("cohort 1/1")).toBeInTheDocument();

    const nextAction = screen.getByRole("region", { name: "Next action" });
    expect(within(nextAction).getByRole("heading", { name: "Grant Screen Recording" })).toBeInTheDocument();
    expect(within(nextAction).getByText("Screen Recording is not granted.")).toBeInTheDocument();

    expect(screen.getByLabelText("Dashboard connection: connected")).toBeInTheDocument();
  });

  it("frames Computer Use as an agent tool layer instead of a primary chat surface", async () => {
    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => snapshot)}
    />);

    await screen.findByRole("heading", { level: 1, name: "skfiy" });

    expect(screen.getAllByText("Background Agent workspace").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "skfiy agent workspace" })).toBeInTheDocument();

    const navigation = screen.getByRole("navigation", { name: "skfiy dashboard navigation" });
    expect(within(navigation).getByRole("link", { name: "Agent" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Tools" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Computer Use" })).not.toBeInTheDocument();

    const commandCenter = screen.getByRole("region", { name: "Agent workspace" });
    expect(within(commandCenter).getByText("Background Agent workspace")).toBeInTheDocument();
    expect(within(commandCenter).getByText("Tool layer")).toBeInTheDocument();
    expect(within(commandCenter).queryByText("Computer Use")).not.toBeInTheDocument();

    const tools = screen.getByRole("region", { name: "Agent tools" });
    expect(within(tools).getByRole("heading", { name: "Agent tools" })).toBeInTheDocument();
    expect(within(tools).getByRole("heading", { name: "Computer Use tool" })).toBeInTheDocument();
    expect(within(tools).getByText(
      "Permissioned desktop/app-control tool invoked by the selected Background Agent."
    )).toBeInTheDocument();
  });

  it("shows assistant provider, current turn, browser context, and latest blocker", async () => {
    const extension = snapshot.runtimeHealth.extension as Record<string, unknown>;
    const blockedSnapshot: DashboardSnapshot = {
      ...snapshot,
      runtimeHealth: {
        ...snapshot.runtimeHealth,
        extension: {
          ...extension,
          browserContext: {
            state: "blocked_by_chrome_host_permission",
            source: "runtime-health",
            reason: "Chrome host permission missing",
            nextAction: "Grant site access"
          }
        }
      },
      currentTurn: {
        state: "failed",
        latestMessage: "Chrome host permission missing",
        command: "summarize current page"
      }
    };

    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => blockedSnapshot)}
    />);

    const overview = await screen.findByRole("region", { name: "Overview" });
    expect(within(overview).getByRole("heading", { name: "Assistant Provider" })).toBeInTheDocument();
    expect(within(overview).getAllByText("Codex").length).toBeGreaterThan(0);
    expect(within(overview).getByRole("heading", { name: "Chrome Browser Context" })).toBeInTheDocument();
    expect(within(overview).getAllByText("blocked_by_chrome_host_permission").length).toBeGreaterThan(0);
    expect(within(overview).getByRole("heading", { name: "Current Turn" })).toBeInTheDocument();
    expect(within(overview).getAllByText("failed").length).toBeGreaterThan(0);

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getByRole("heading", { name: "Latest blocker" })).toBeInTheDocument();
    expect(within(activity).getAllByText("Chrome host permission missing").length).toBeGreaterThan(0);
  });

  it("shows a browser context access checklist for the current tab permission chain", async () => {
    const extension = snapshot.runtimeHealth.extension as Record<string, unknown>;
    const blockedSnapshot: DashboardSnapshot = {
      ...snapshot,
      runtimeHealth: {
        ...snapshot.runtimeHealth,
        extension: {
          ...extension,
          pageControl: {
            state: "blocked_by_host_policy",
            reason: "Host policy has not allowed this page.",
            activeTab: {
              host: "bytedance.larkoffice.com",
              tabId: 1782098572,
              windowId: 1782098107
            },
            hostPolicy: {
              decision: "ask",
              reason: "default_policy"
            },
            chromeHostPermission: {
              state: "missing",
              origins: ["https://bytedance.larkoffice.com/*"]
            },
            chromeCapturePermission: {
              state: "missing",
              origins: ["<all_urls>"]
            },
            capabilities: {
              observe: false,
              screenshot: false
            }
          },
          browserContext: {
            state: "blocked_by_host_policy",
            source: "extension.connection.pageControl",
            reason: "Host policy has not allowed this page.",
            nextAction: "Grant page access"
          }
        }
      }
    };

    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => blockedSnapshot)}
    />);

    const browser = await screen.findByRole("region", { name: "Browser" });
    const checklist = within(browser).getByRole("list", { name: "Browser Context access checklist" });
    expect(within(checklist).getByText("Allow current host")).toBeInTheDocument();
    expect(within(checklist).getByText("bytedance.larkoffice.com")).toBeInTheDocument();
    expect(within(checklist).getByText("Grant Chrome site access")).toBeInTheDocument();
    expect(within(checklist).getByText("https://bytedance.larkoffice.com/*")).toBeInTheDocument();
    expect(within(checklist).getByText("Grant visible-tab capture")).toBeInTheDocument();
    expect(within(checklist).getByText("<all_urls>")).toBeInTheDocument();
    expect(within(checklist).getByText("Open skfiy Chrome popup")).toBeInTheDocument();
    expect(within(checklist).getByText("Click Grant https://bytedance.larkoffice.com/* + <all_urls> and observe.")).toBeInTheDocument();
    expect(within(checklist).getByText("Observe current page")).toBeInTheDocument();
    expect(within(checklist).getByText("The popup observes the page automatically after access is granted.")).toBeInTheDocument();
  });

  it("opens the target-tab Chrome extension access page from blocked Browser Context recovery", async () => {
    const extension = snapshot.runtimeHealth.extension as Record<string, unknown>;
    const blockedSnapshot: DashboardSnapshot = {
      ...snapshot,
      runtimeHealth: {
        ...snapshot.runtimeHealth,
        extension: {
          ...extension,
          pageControl: {
            state: "blocked_by_chrome_host_permission",
            reason: "Chrome host permission missing",
            activeTab: {
              host: "mew-test.bytedance.net",
              tabId: 1782098572,
              windowId: 1782098107
            },
            hostPolicy: {
              decision: "allowed",
              reason: "host_allowed"
            },
            chromeHostPermission: {
              state: "missing",
              origins: ["https://mew-test.bytedance.net/*"]
            },
            chromeCapturePermission: {
              state: "missing",
              origins: ["<all_urls>"]
            },
            capabilities: {
              observe: false,
              screenshot: false
            }
          },
          browserContext: {
            state: "blocked_by_chrome_host_permission",
            source: "extension.connection.pageControl",
            reason: "Chrome host permission missing",
            nextAction: "Open the skfiy extension popup and click Grant https://mew-test.bytedance.net/* + <all_urls> and observe."
          }
        }
      }
    };
    const runChromeControlAction = vi.fn(async () => ({
      result: "verified",
      action: "open-popup",
      wakeUrl: "chrome-extension://plcpkkhlcacihjfohlojdknnkademlno/popup.html?skfiyTargetTabId=1782098572",
      activityEntry: {
        title: "Chrome open-popup",
        result: "verified"
      }
    }));

    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => blockedSnapshot)}
      runChromeControlAction={runChromeControlAction}
    />);

    const browser = await screen.findByRole("region", { name: "Browser" });
    fireEvent.click(within(browser).getByRole("button", { name: "Open access page" }));

    await waitFor(() => expect(runChromeControlAction).toHaveBeenCalledTimes(1));
    expect(runChromeControlAction).toHaveBeenCalledWith({
      action: "open-popup",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 1782098572
    });
    expect(within(browser).getByText("Chrome open-popup: verified")).toBeInTheDocument();
  });

  it("shows a Finder Automation access checklist when Finder smoke exposes the macOS permission blocker", async () => {
    const blockedSnapshot: DashboardSnapshot = {
      ...snapshot,
      permissions: {
        ...snapshot.permissions,
        finderAutomation: "unknown"
      },
      smokeEvidence: {
        artifacts: [
          ...snapshot.smokeEvidence.artifacts,
          {
            target: "finder",
            result: "blocked",
            finderSemanticObservation: {
              result: "blocked",
              reason: "Verification failed (selection): Automation permission is required to read Finder selection. Grant skfiy permission to control Finder, then try again."
            }
          }
        ]
      },
      alerts: [
        ...snapshot.alerts,
        {
          code: "finder-automation-permission",
          severity: "warning",
          message: "Finder Automation appears blocked by macOS Automation permission.",
          reason: "Automation permission is required to read Finder selection."
        }
      ]
    };

    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => blockedSnapshot)}
    />);

    const computerUse = await screen.findByRole("region", { name: "Agent tools" });
    const checklist = within(computerUse).getByRole("list", { name: "Finder Automation access checklist" });
    expect(within(checklist).getByText("Open Automation settings")).toBeInTheDocument();
    expect(within(checklist).getByText("System Settings > Privacy & Security > Automation")).toBeInTheDocument();
    expect(within(checklist).getByText("Allow skfiy to control Finder")).toBeInTheDocument();
    expect(within(checklist).getByText("Enable Finder under skfiy, then keep Finder available.")).toBeInTheDocument();
    expect(within(checklist).getByText("Rerun Finder smoke")).toBeInTheDocument();
  });

  it("loads redacted planner settings from the provider settings endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/snapshot.json") {
        return createJsonResponse(snapshot);
      }
      if (url === "/api/provider-settings") {
        expect(init?.method).toBeUndefined();
        return createJsonResponse(createProviderSettingsPayload({
          mode: "external-cua",
          externalProviderLabel: "OpenAI CUA",
          externalEndpoint: "https://cua.example.test/plan",
          externalApiKeyConfigured: false
        }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<DashboardApp />);

    const form = await screen.findByRole("form", { name: "Planner provider settings" });
    await waitFor(() => {
      expect(within(form).getByLabelText("Mode")).toHaveValue("external-cua");
      expect(within(form).getByLabelText("External provider label")).toHaveValue("OpenAI CUA");
      expect(within(form).getByLabelText("Endpoint")).toHaveValue("https://cua.example.test/plan");
    });
    expect(within(form).getByText("api key missing")).toBeInTheDocument();
    expect(within(form).getByLabelText("API key")).toHaveValue("");
    expect(screen.queryByDisplayValue("sk-secret")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/provider-settings", { cache: "no-store" });
  });

  it("submits planner settings, refreshes status, and never echoes the API key", async () => {
    const submittedBodies: unknown[] = [];
    let currentProviderSettings = createProviderSettingsPayload({
      mode: "local-deterministic",
      externalProviderLabel: "External CUA",
      externalEndpoint: undefined,
      externalApiKeyConfigured: false
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/snapshot.json") {
        return createJsonResponse(snapshot);
      }
      if (url === "/api/provider-settings" && init?.method === "POST") {
        submittedBodies.push(JSON.parse(String(init.body)));
        currentProviderSettings = createProviderSettingsPayload({
          mode: "external-cua",
          externalProviderLabel: "OpenAI CUA",
          externalEndpoint: "https://cua.example.test/plan",
          externalApiKeyConfigured: true
        });
        return createJsonResponse({
          ...currentProviderSettings,
          result: "configured"
        });
      }
      if (url === "/api/provider-settings") {
        return createJsonResponse(currentProviderSettings);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<DashboardApp />);

    const form = await screen.findByRole("form", { name: "Planner provider settings" });
    await waitFor(() => {
      expect(within(form).getByLabelText("Mode")).toHaveValue("local-deterministic");
      expect(within(form).getByRole("button", { name: "Save planner settings" })).toBeEnabled();
    });
    const modeInput = within(form).getByLabelText("Mode");
    fireEvent.change(modeInput, {
      target: { value: "external-cua" }
    });
    expect(modeInput).toHaveValue("external-cua");
    fireEvent.change(within(form).getByLabelText("External provider label"), {
      target: { value: "OpenAI CUA" }
    });
    fireEvent.change(within(form).getByLabelText("Endpoint"), {
      target: { value: "https://cua.example.test/plan" }
    });
    fireEvent.change(within(form).getByLabelText("API key"), {
      target: { value: "sk-secret" }
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save planner settings" }));

    await waitFor(() => {
      expect(submittedBodies).toEqual([
        {
          planner: {
            mode: "external-cua",
            externalProviderLabel: "OpenAI CUA",
            externalEndpoint: "https://cua.example.test/plan",
            externalApiKey: "sk-secret"
          }
        }
      ]);
    });

    await waitFor(() => {
      expect(within(form).getByText("api key configured")).toBeInTheDocument();
    });
    expect(within(form).getByLabelText("API key")).toHaveValue("");
    expect(screen.getByText("Planner settings saved")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("sk-secret")).not.toBeInTheDocument();
    expect(screen.queryByText("sk-secret")).not.toBeInTheDocument();

    const providerSettingsReads = fetchMock.mock.calls.filter(([input, init]) => (
      String(input) === "/api/provider-settings" && init?.method !== "POST"
    ));
    expect(providerSettingsReads).toHaveLength(2);
  });

  it("forgets a personal memory entry from dashboard controls and refreshes the snapshot", async () => {
    let currentSnapshot = snapshot;
    const loadSnapshot = vi.fn(async () => currentSnapshot);
    const loadProviderSettings = vi.fn(async () => createProviderSettingsPayload({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    }));
    const runPersonalMemoryAction = vi.fn(async (request: unknown) => {
      expect(request).toEqual({
        action: "forget",
        target: "user",
        content: "User prefers concise Chinese updates."
      });
      currentSnapshot = {
        ...snapshot,
        personalMemory: {
          ...snapshot.personalMemory!,
          userEntryCount: 0,
          recentUserEntries: []
        }
      };
      return { result: "forgotten" };
    });

    render(<DashboardApp
      loadProviderSettings={loadProviderSettings}
      loadSnapshot={loadSnapshot}
      runPersonalMemoryAction={runPersonalMemoryAction}
    />);

    const memory = await screen.findByRole("region", { name: "Memory" });
    fireEvent.click(within(memory).getByRole("button", {
      name: "Forget memory: User prefers concise Chinese updates."
    }));

    await waitFor(() => {
      expect(runPersonalMemoryAction).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(within(memory).queryByRole("button", {
        name: "Forget memory: User prefers concise Chinese updates."
      })).not.toBeInTheDocument();
    });
    expect(within(memory).getByText("Memory forgotten")).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("approves and rejects staged personal memory writes from dashboard controls", async () => {
    let currentSnapshot = snapshot;
    const loadSnapshot = vi.fn(async () => currentSnapshot);
    const loadProviderSettings = vi.fn(async () => createProviderSettingsPayload({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    }));
    const runPersonalMemoryAction = vi.fn(async (request: unknown) => {
      if ((request as { action?: string }).action === "approve-pending") {
        expect(request).toEqual({
          action: "approve-pending",
          pendingId: "pmw-approve"
        });
        currentSnapshot = {
          ...snapshot,
          personalMemory: {
            ...snapshot.personalMemory!,
            pendingWriteCount: 1,
            pendingWrites: snapshot.personalMemory!.pendingWrites!.filter((write) => (
              write.id === "pmw-reject"
            ))
          }
        };
      }
      if ((request as { action?: string }).action === "reject-pending") {
        expect(request).toEqual({
          action: "reject-pending",
          pendingId: "pmw-reject"
        });
        currentSnapshot = {
          ...snapshot,
          personalMemory: {
            ...snapshot.personalMemory!,
            pendingWriteCount: 0,
            pendingWrites: []
          }
        };
      }
      return { result: (request as { action?: string }).action === "approve-pending" ? "approved" : "rejected" };
    });

    render(<DashboardApp
      loadProviderSettings={loadProviderSettings}
      loadSnapshot={loadSnapshot}
      runPersonalMemoryAction={runPersonalMemoryAction}
    />);

    const memory = await screen.findByRole("region", { name: "Memory" });
    fireEvent.click(within(memory).getByRole("button", {
      name: "Approve pending memory: User wants memory writes reviewed before becoming durable."
    }));
    await waitFor(() => {
      expect(runPersonalMemoryAction).toHaveBeenCalledWith({
        action: "approve-pending",
        pendingId: "pmw-approve"
      });
    });
    expect(within(memory).getByText("Pending memory approved")).toBeInTheDocument();

    fireEvent.click(within(memory).getByRole("button", {
      name: "Reject pending memory: Use pending review before changing durable operating notes."
    }));
    await waitFor(() => {
      expect(runPersonalMemoryAction).toHaveBeenCalledWith({
        action: "reject-pending",
        pendingId: "pmw-reject"
      });
    });
    expect(within(memory).getByText("Pending memory rejected")).toBeInTheDocument();
  });

  it("renders pending replace memory writes as explicit revisions", async () => {
    const replaceSnapshot: DashboardSnapshot = {
      ...snapshot,
      personalMemory: {
        ...snapshot.personalMemory!,
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
    };
    const loadSnapshot = vi.fn(async () => replaceSnapshot);
    const loadProviderSettings = vi.fn(async () => createProviderSettingsPayload({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    }));

    render(<DashboardApp
      loadProviderSettings={loadProviderSettings}
      loadSnapshot={loadSnapshot}
      runPersonalMemoryAction={vi.fn()}
    />);

    const memory = await screen.findByRole("region", { name: "Memory" });
    const pendingWrites = within(memory).getByRole("list", { name: "Pending memory writes" });
    const revision = within(pendingWrites).getByRole("listitem", {
      name: "Pending memory revision: replace user memory"
    });

    expect(within(revision).getByText("replace user memory")).toBeInTheDocument();
    expect(within(revision).getByText("Previous")).toBeInTheDocument();
    expect(within(revision).getByText("User prefers concise Chinese progress updates.")).toBeInTheDocument();
    expect(within(revision).getByText("Proposed")).toBeInTheDocument();
    expect(within(revision).getByText(
      "User prefers concise Chinese-first progress updates with verification evidence."
    )).toBeInTheDocument();
  });

  it("renders memory journal learning receipts with provider and stage", async () => {
    render(<DashboardApp
      loadProviderSettings={vi.fn(async () => createProviderSettingsPayload({
        mode: "external-cua",
        externalProviderLabel: "OpenAI CUA",
        externalEndpoint: "https://cua.example.test/plan",
        externalApiKeyConfigured: true
      }))}
      loadSnapshot={vi.fn(async () => snapshot)}
    />);

    const memory = await screen.findByRole("region", { name: "Memory" });
    const journal = within(memory).getByRole("list", { name: "Memory journal" });

    expect(within(journal).getByText("Codex · durable · add user")).toBeInTheDocument();
    expect(within(journal).getByText("Hermes · pending · replace user")).toBeInTheDocument();
    expect(within(journal).getByText("User prefers concise Chinese-first progress updates with verification evidence.")).toBeInTheDocument();
    expect(within(journal).getByText("learned from: 以后带验证证据")).toBeInTheDocument();
  });

  it("mutes a personal skill card from dashboard controls and refreshes the snapshot", async () => {
    let currentSnapshot = snapshot;
    const loadSnapshot = vi.fn(async () => currentSnapshot);
    const loadProviderSettings = vi.fn(async () => createProviderSettingsPayload({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    }));
    const runPersonalSkillAction = vi.fn(async (request: unknown): Promise<DashboardPersonalSkillActionResponse> => {
      expect(request).toEqual({
        action: "mute",
        skillId: "dashboard-knowledge-surface"
      });
      currentSnapshot = {
        ...snapshot,
        personalMemory: {
          ...snapshot.personalMemory!,
          mutedPersonalSkillIds: ["dashboard-knowledge-surface"],
          personalSkills: snapshot.personalMemory!.personalSkills!.filter((skill) => (
            skill.id !== "dashboard-knowledge-surface"
          ))
        }
      };
      return { result: "muted" };
    });

    render(<DashboardApp
      loadProviderSettings={loadProviderSettings}
      loadSnapshot={loadSnapshot}
      runPersonalSkillAction={runPersonalSkillAction}
    />);

    const memory = await screen.findByRole("region", { name: "Memory" });
    expect(within(memory).getByText("Obsidian-style knowledge dashboard")).toBeInTheDocument();

    fireEvent.click(within(memory).getByRole("button", {
      name: "Mute personal skill: Obsidian-style knowledge dashboard"
    }));

    await waitFor(() => {
      expect(runPersonalSkillAction).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(within(memory).queryByText("Obsidian-style knowledge dashboard")).not.toBeInTheDocument();
    });
    expect(within(memory).getByText("Personal skill muted")).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("launches Chrome control actions from the React browser section and refreshes the snapshot", async () => {
    const actionRequests: unknown[] = [];
    const loadSnapshot = vi.fn(async () => snapshot);
    const loadProviderSettings = vi.fn(async () => createProviderSettingsPayload({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/chrome-control-action");
      actionRequests.push(JSON.parse(String(init?.body)));
      const action = (actionRequests.at(-1) as { action: string }).action;
      return createJsonResponse({
        result: "verified",
        action,
        activityEntry: {
          title: `Chrome ${action}`,
          result: "verified"
        }
      });
    });

    render(<DashboardApp loadSnapshot={loadSnapshot} loadProviderSettings={loadProviderSettings} />);

    const form = await screen.findByRole("form", { name: "Chrome control actions" });
    const selectorInput = within(form).getByLabelText("Chrome action selector");
    const textInput = within(form).getByLabelText("Chrome fill text");
    const scrollInput = within(form).getByLabelText("Chrome scroll delta");

    fireEvent.click(within(form).getByRole("button", { name: "Click selector" }));
    expect(within(form).getByText("Enter a selector before launching this action.")).toBeInTheDocument();
    expect(actionRequests).toEqual([]);

    fireEvent.change(selectorInput, { target: { value: "#name" } });
    fireEvent.click(within(form).getByRole("button", { name: "Fill selector" }));
    expect(within(form).getByText("Enter fill text before launching this action.")).toBeInTheDocument();
    expect(actionRequests).toEqual([]);

    fireEvent.change(textInput, { target: { value: "skfiy dashboard" } });
    fireEvent.click(within(form).getByRole("button", { name: "Fill selector" }));
    await waitFor(() => expect(actionRequests).toHaveLength(1));
    expect(actionRequests[0]).toEqual({
      action: "fill",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 42,
      selector: "#name",
      text: "skfiy dashboard"
    });
    expect(within(form).getByText("Chrome fill: verified")).toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Observe current tab" }));
    await waitFor(() => expect(actionRequests).toHaveLength(2));
    expect(actionRequests[1]).toEqual({
      action: "observe",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 42
    });

    fireEvent.click(within(form).getByRole("button", { name: "Screenshot current tab" }));
    await waitFor(() => expect(actionRequests).toHaveLength(3));
    expect(actionRequests[2]).toEqual({
      action: "screenshot",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 42
    });

    fireEvent.click(within(form).getByRole("button", { name: "Click selector" }));
    await waitFor(() => expect(actionRequests).toHaveLength(4));
    expect(actionRequests[3]).toEqual({
      action: "click",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 42,
      selector: "#name"
    });

    fireEvent.change(selectorInput, { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Submit form" }));
    await waitFor(() => expect(actionRequests).toHaveLength(5));
    expect(actionRequests[4]).toEqual({
      action: "submit",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 42,
      selector: "form"
    });

    fireEvent.change(scrollInput, { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Scroll page" }));
    await waitFor(() => expect(actionRequests).toHaveLength(6));
    expect(actionRequests[5]).toEqual({
      action: "scroll",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      targetTabId: 42,
      dy: 600
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(7);
  });

  it("updates Chrome host policy from React controls and refreshes policy state", async () => {
    const policyRequests: unknown[] = [];
    const policyMethods: Array<string | undefined> = [];
    const loadSnapshot = vi.fn(async () => snapshot);
    const loadProviderSettings = vi.fn(async () => createProviderSettingsPayload({
      mode: "external-cua",
      externalProviderLabel: "OpenAI CUA",
      externalEndpoint: "https://cua.example.test/plan",
      externalApiKeyConfigured: true
    }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/chrome-host-policy");
      policyMethods.push(init?.method);
      if (init?.method === "POST") {
        policyRequests.push(JSON.parse(String(init.body)));
        return createJsonResponse({
          result: (policyRequests.at(-1) as { action: string }).action === "reset" ? "reset" : "configured",
          hostPolicy: { state: "configured" }
        });
      }
      return createJsonResponse({
        hostPolicy: { state: "configured" }
      });
    });

    render(<DashboardApp loadSnapshot={loadSnapshot} loadProviderSettings={loadProviderSettings} />);

    const form = await screen.findByRole("form", { name: "Chrome host policy controls" });
    const hostInput = within(form).getByLabelText("Chrome host policy host");

    fireEvent.click(within(form).getByRole("button", { name: "Refresh policy" }));
    await waitFor(() => expect(policyMethods).toEqual([undefined]));
    expect(within(form).getByText("Policy refreshed.")).toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Always allow" }));
    expect(within(form).getByText("Enter a host before setting policy.")).toBeInTheDocument();
    expect(policyRequests).toEqual([]);

    fireEvent.change(hostInput, { target: { value: "https://example.test/path" } });
    fireEvent.click(within(form).getByRole("button", { name: "Always allow" }));
    await waitFor(() => expect(policyRequests).toHaveLength(1));
    expect(policyRequests[0]).toEqual({
      action: "always-allow",
      host: "https://example.test/path"
    });
    expect(within(form).getByText("Policy configured.")).toBeInTheDocument();

    fireEvent.change(hostInput, { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Reset policy" }));
    await waitFor(() => expect(policyRequests).toHaveLength(2));
    expect(policyRequests[1]).toEqual({ action: "reset" });
    expect(loadSnapshot).toHaveBeenCalledTimes(4);
  });
});

function createProviderSettingsPayload(planner: {
  mode: "local-deterministic" | "external-cua" | "disabled";
  externalProviderLabel: string;
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}): DashboardProviderSettingsResponse {
  return {
    schemaVersion: 1,
    command: "dashboard provider settings",
    generatedAt: "2026-06-22T08:00:01.000Z",
    source: "dashboard",
    plannedMutation: false,
    executesSystemMutation: false,
    result: "ok",
    providers: {
      assistant: {
        provider: "assistant",
        mode: "codex",
        label: "Codex",
        health: "available",
        configured: true,
        readiness: "ready",
        selectedProvider: "codex",
        timeoutMs: 45_000,
        lastHealthAt: "2026-06-22T08:00:01.000Z",
        providers: [
          {
            provider: "assistant",
            id: "codex",
            label: "Codex",
            selected: true,
            configured: true,
            readiness: "ready",
            binaryPath: "/opt/homebrew/bin/codex",
            binarySource: "env",
            resolvedBinaryPath: "/opt/homebrew/bin/codex"
          },
          {
            provider: "assistant",
            id: "claude-code",
            label: "Claude Code",
            selected: false,
            configured: true,
            readiness: "unavailable",
            binaryPath: "missing-claude",
            binarySource: "default",
            lastError: "missing-claude not found"
          },
          {
            provider: "assistant",
            id: "hermes",
            label: "Hermes",
            selected: false,
            configured: true,
            readiness: "ready",
            binaryPath: "/Users/tester/.local/bin/hermes",
            binarySource: "default"
          }
        ]
      },
      planner: {
        provider: "planner",
        mode: planner.mode,
        label: planner.externalProviderLabel,
        health: planner.mode === "disabled" ? "unavailable" : "available",
        endpoint: planner.externalEndpoint,
        externalProviderLabel: planner.externalProviderLabel,
        externalEndpoint: planner.externalEndpoint,
        externalApiKeyConfigured: planner.externalApiKeyConfigured
      }
    }
  };
}

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
