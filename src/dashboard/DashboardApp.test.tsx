import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    state: "ready"
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
    state: "waiting-for-dogfood"
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
      mode: "codex",
      label: "Codex",
      health: "available",
      binaryPath: "codex",
      timeoutMs: 45000
    },
    planner: {
      mode: "local-deterministic",
      label: "Local deterministic",
      health: "available"
    }
  }
};

describe("DashboardApp", () => {
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
    expect(within(readiness).getByText("127.0.0.1:52363")).toBeInTheDocument();
    expect(within(readiness).getByText("Screen Recording")).toBeInTheDocument();

    const connections = screen.getByRole("region", { name: "Agent connection" });
    expect(within(connections).getByText("Codex")).toBeInTheDocument();
    expect(within(connections).getByText("Local deterministic")).toBeInTheDocument();

    const nextAction = screen.getByRole("region", { name: "Next action" });
    expect(within(nextAction).getByRole("heading", { name: "Grant Screen Recording" })).toBeInTheDocument();
    expect(within(nextAction).getByText("Screen Recording is not granted.")).toBeInTheDocument();

    expect(screen.getByLabelText("Dashboard connection: connected")).toBeInTheDocument();
  });
});
