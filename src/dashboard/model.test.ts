import { describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "./contracts";
import { readKnowledgeGraph } from "./model";

describe("readKnowledgeGraph", () => {
  it("connects memory, sessions, provider, browser context, Computer Use, and alerts", () => {
    const graph = readKnowledgeGraph(createSnapshot());

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "memory:user", kind: "memory", label: "User preferences" }),
      expect.objectContaining({ id: "memory:agent", kind: "memory", label: "Agent operating notes" }),
      expect.objectContaining({ id: "session:latest", kind: "session", label: "Latest session" }),
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
});

function createSnapshot(): DashboardSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-23T12:00:00.000Z",
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
          createdAt: "2026-06-23T12:00:00.000Z",
          providerLabel: "Codex",
          userInput: "summarize dashboard",
          browserTitle: "Dashboard"
        },
        {
          createdAt: "2026-06-23T11:55:00.000Z",
          providerLabel: "Hermes",
          userInput: "remember concise updates"
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
