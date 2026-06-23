import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardApp } from "./DashboardApp";
import type { DashboardProviderSettingsResponse, DashboardSnapshot } from "./contracts";

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
    latestUpdatedAt: "2026-06-23T10:00:00.000Z",
    recentUserEntries: ["User prefers concise Chinese updates."],
    recentAgentEntries: ["For dashboard work, prefer dense Obsidian-like knowledge surfaces."]
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
    expect(within(navigation).getByRole("link", { name: "Provider" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Memory" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Graph" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Computer Use" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Browser" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Activity" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Next action" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "skfiy control plane" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Provider" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Knowledge graph" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Computer Use" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Browser" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Next action" })).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Overview" });
    expect(within(overview).getByRole("heading", { name: "Assistant Provider" })).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Computer Use" })).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Chrome Browser Context" })).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Current Turn" })).toBeInTheDocument();

    const provider = screen.getByRole("region", { name: "Provider" });
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
    expect(within(memory).getByText("User prefers concise Chinese updates.")).toBeInTheDocument();
    expect(within(memory).getByText("For dashboard work, prefer dense Obsidian-like knowledge surfaces.")).toBeInTheDocument();
    expect(within(memory).getByText("sessions 2")).toBeInTheDocument();

    const graph = screen.getByRole("region", { name: "Knowledge graph" });
    expect(within(graph).getAllByText("User preferences").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Latest session").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Codex").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Browser Context").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("Computer Use").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("injects prompt").length).toBeGreaterThan(0);

    const computerUse = screen.getByRole("region", { name: "Computer Use" });
    expect(within(computerUse).getByRole("heading", { name: "Computer use" })).toBeInTheDocument();
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
    expect(within(activity).getByText("release behind-head")).toBeInTheDocument();
    expect(within(activity).getByText("cohort 1/1")).toBeInTheDocument();

    const nextAction = screen.getByRole("region", { name: "Next action" });
    expect(within(nextAction).getByRole("heading", { name: "Grant Screen Recording" })).toBeInTheDocument();
    expect(within(nextAction).getByText("Screen Recording is not granted.")).toBeInTheDocument();

    expect(screen.getByLabelText("Dashboard connection: connected")).toBeInTheDocument();
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
    expect(within(overview).getByText("Codex")).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Chrome Browser Context" })).toBeInTheDocument();
    expect(within(overview).getByText("blocked_by_chrome_host_permission")).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "Current Turn" })).toBeInTheDocument();
    expect(within(overview).getAllByText("failed").length).toBeGreaterThan(0);

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getByRole("heading", { name: "Latest blocker" })).toBeInTheDocument();
    expect(within(activity).getAllByText("Chrome host permission missing").length).toBeGreaterThan(0);
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
    fireEvent.change(within(form).getByLabelText("Mode"), {
      target: { value: "external-cua" }
    });
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
      expect(within(memory).queryByText("User prefers concise Chinese updates.")).not.toBeInTheDocument();
    });
    expect(within(memory).getByText("Memory forgotten")).toBeInTheDocument();
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
