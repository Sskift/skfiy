import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardApp } from "./DashboardApp";
import type { DashboardSnapshot } from "./contracts";

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
      pageControl: {
        state: "ready",
        activeTab: { host: "127.0.0.1:52363", tabId: 42 },
        capabilities: {
          observe: true,
          click: true,
          fill: true,
          submit: true,
          scroll: true,
          screenshot: "background_required"
        }
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
  }
};

describe("DashboardApp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a user-control dashboard from the skfiy snapshot contract", async () => {
    render(<DashboardApp loadSnapshot={vi.fn(async () => snapshot)} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "skfiy" })).toBeInTheDocument();
    });

    const navigation = screen.getByRole("navigation", { name: "skfiy dashboard navigation" });
    expect(within(navigation).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Connections" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Browser" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Activity" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Next action" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "skfiy control plane" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agent connection" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Browser and computer readiness" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recent activity" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Next action" })).toBeInTheDocument();

    const readiness = screen.getByRole("region", { name: "Browser and computer readiness" });
    expect(within(readiness).getByRole("heading", { name: "Browser control" })).toBeInTheDocument();
    expect(within(readiness).getByRole("heading", { name: "Computer use" })).toBeInTheDocument();
    expect(within(readiness).getByRole("heading", { name: "Chrome readiness" })).toBeInTheDocument();
    expect(within(readiness).getByRole("heading", { name: "Finder readiness" })).toBeInTheDocument();
    expect(within(readiness).getByRole("heading", { name: "Ghostty readiness" })).toBeInTheDocument();
    expect(within(readiness).getByText("Chrome Native Messaging host manifest is not installed.")).toBeInTheDocument();
    expect(within(readiness).getByText("Finder Automation has not been proven because desktop preflight is blocked.")).toBeInTheDocument();
    expect(within(readiness).getByText("No fresh Ghostty smoke artifact has been recorded.")).toBeInTheDocument();
    expect(within(readiness).getByText("ignored unsupported smoke: voice")).toBeInTheDocument();
    expect(within(readiness).getByText("127.0.0.1:52363")).toBeInTheDocument();
    expect(within(readiness).getByText("Screen Recording")).toBeInTheDocument();

    const connections = screen.getByRole("region", { name: "Agent connection" });
    expect(within(connections).getByText("Codex")).toBeInTheDocument();
    expect(within(connections).getByText("assistant · codex")).toBeInTheDocument();
    expect(within(connections).getByText("OpenAI CUA")).toBeInTheDocument();
    expect(within(connections).getByText("planner · external-cua")).toBeInTheDocument();
    expect(within(connections).getByText("External CUA endpoint and API key are configured.")).toBeInTheDocument();
    expect(within(connections).getByText("api key configured")).toBeInTheDocument();

    const activity = screen.getByRole("region", { name: "Recent activity" });
    expect(within(activity).getByRole("heading", { name: "Dogfood and replay" })).toBeInTheDocument();
    expect(within(activity).getByText("release behind-head")).toBeInTheDocument();
    expect(within(activity).getByText("cohort 1/1")).toBeInTheDocument();

    const nextAction = screen.getByRole("region", { name: "Next action" });
    expect(within(nextAction).getByRole("heading", { name: "Grant Screen Recording" })).toBeInTheDocument();
    expect(within(nextAction).getByText("Screen Recording is not granted.")).toBeInTheDocument();

    expect(screen.getByLabelText("Dashboard connection: connected")).toBeInTheDocument();
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
});

function createProviderSettingsPayload(planner: {
  mode: "local-deterministic" | "external-cua" | "disabled";
  externalProviderLabel: string;
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}) {
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
        health: "available"
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
