import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeGraph } from "./KnowledgeGraph";

describe("KnowledgeGraph", () => {
  it("renders memory, session, provider, browser, and Computer Use nodes", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success" },
        { id: "browser:context", label: "Browser Context", kind: "browser", tone: "warning" },
        { id: "computer-use", label: "Computer Use", kind: "computer-use", tone: "neutral" }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "browser:context", to: "session:latest", label: "observed in" }
      ]}
    />);

    expect(screen.getByRole("region", { name: "Knowledge graph" })).toBeInTheDocument();
    expect(screen.getAllByText("User preferences").length).toBeGreaterThan(0);
    expect(screen.getAllByText("injects prompt").length).toBeGreaterThan(0);

    const fallback = screen.getByRole("list", { name: "Knowledge graph nodes" });
    expect(within(fallback).getByText("Computer Use")).toBeInTheDocument();
  });

  it("renders vault backlinks that make graph relationships readable", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success" },
        { id: "browser:context", label: "Browser Context", kind: "browser", tone: "warning" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral" }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "browser:context", to: "session:latest", label: "observed in" }
      ]}
    />);

    const backlinks = screen.getByRole("list", { name: "Vault backlinks" });
    const items = within(backlinks).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(within(backlinks).getByText("User preferences")).toBeInTheDocument();
    expect(within(backlinks).getByText("injects prompt")).toBeInTheDocument();
    expect(within(backlinks).getByText("Codex")).toBeInTheDocument();
    expect(within(backlinks).getByText("Browser Context")).toBeInTheDocument();
    expect(within(backlinks).getByText("observed in")).toBeInTheDocument();
    expect(within(backlinks).getByText("Latest session")).toBeInTheDocument();
  });

  it("renders Obsidian-style vault notes for graph nodes", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries · short Chinese updates" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex assistant is selected." },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "provider:codex", to: "session:latest", label: "answered" }
      ]}
    />);

    const notes = screen.getByRole("list", { name: "Vault notes" });

    expect(within(notes).getAllByRole("listitem")).toHaveLength(3);
    expect(within(notes).getByText("User preferences.md")).toBeInTheDocument();
    expect(within(notes).getByText("Codex.md")).toBeInTheDocument();
    expect(within(notes).getByText("Latest session.md")).toBeInTheDocument();
    expect(within(notes).getByText("injects prompt -> Codex")).toBeInTheDocument();
    expect(within(notes).getAllByText(/Backlinks /u).length).toBeGreaterThan(0);
  });

  it("focuses a selected vault note with backlinks and detail", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries · short Chinese updates" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex assistant is selected." },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "provider:codex", to: "session:latest", label: "answered" }
      ]}
    />);

    fireEvent.click(within(screen.getByRole("list", { name: "Vault notes" }))
      .getByRole("button", { name: "Open note Codex.md" }));

    const focusedNote = screen.getByRole("region", { name: "Focused note" });
    expect(within(focusedNote).getByRole("heading", { name: "Codex.md" })).toBeInTheDocument();
    expect(within(focusedNote).getByText("provider")).toBeInTheDocument();
    expect(within(focusedNote).getByText("Codex assistant is selected.")).toBeInTheDocument();
    expect(within(focusedNote).getByText("Backlinks 2")).toBeInTheDocument();

    const backlinks = within(focusedNote).getByRole("list", { name: "Focused note backlinks" });
    expect(within(backlinks).getByText("User preferences -> injects prompt")).toBeInTheDocument();
    expect(within(backlinks).getByText("answered -> Latest session")).toBeInTheDocument();
  });

  it("filters the vault with lens controls while keeping focused relations readable", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex selected" },
        { id: "skill:communication-style", label: "Concise Chinese progress updates", kind: "skill", tone: "success", detail: "communication habit" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" }
      ]}
      edges={[
        { from: "memory:user", to: "skill:communication-style", label: "distills skill" },
        { from: "skill:communication-style", to: "provider:codex", label: "guides prompt" },
        { from: "provider:codex", to: "session:latest", label: "answered" }
      ]}
    />);

    const lens = screen.getByRole("toolbar", { name: "Vault lens" });
    expect(within(lens).getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(lens).getByRole("button", { name: "Skill 1" }));

    expect(within(lens).getByRole("button", { name: "Skill 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status", { name: "Vault lens summary" }))
      .toHaveTextContent("Showing 1 of 4 notes");

    const nodes = screen.getByRole("list", { name: "Knowledge graph nodes" });
    expect(within(nodes).getByText("Concise Chinese progress updates")).toBeInTheDocument();
    expect(within(nodes).queryByText("User preferences")).not.toBeInTheDocument();

    const focusedNote = screen.getByRole("region", { name: "Focused note" });
    expect(within(focusedNote).getByRole("heading", { name: "Concise Chinese progress updates.md" }))
      .toBeInTheDocument();
    expect(within(focusedNote).getByText("User preferences -> distills skill")).toBeInTheDocument();
    expect(within(focusedNote).getByText("guides prompt -> Codex")).toBeInTheDocument();
  });

  it("searches vault notes across detail and backlinks", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries" },
        { id: "memory:pending:pmw-review-style", label: "Pending user memory", kind: "memory", tone: "warning", detail: "add · User wants memory writes reviewed before becoming durable." },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex selected" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "memory:pending:pmw-review-style", to: "memory:user", label: "awaits approval" },
        { from: "provider:codex", to: "session:latest", label: "answered" }
      ]}
    />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Vault search" }), {
      target: { value: "approval" }
    });

    expect(screen.getByRole("status", { name: "Vault lens summary" }))
      .toHaveTextContent("Showing 2 of 4 notes for approval");

    const nodes = screen.getByRole("list", { name: "Knowledge graph nodes" });
    expect(within(nodes).getByText("User preferences")).toBeInTheDocument();
    expect(within(nodes).getByText("Pending user memory")).toBeInTheDocument();
    expect(within(nodes).queryByText("Codex")).not.toBeInTheDocument();

    const notes = screen.getByRole("list", { name: "Vault notes" });
    expect(within(notes).getByText("User preferences.md")).toBeInTheDocument();
    expect(within(notes).getByText("Pending user memory.md")).toBeInTheDocument();
    expect(within(notes).queryByText("Latest session.md")).not.toBeInTheDocument();

    const focusedNote = screen.getByRole("region", { name: "Focused note" });
    expect(within(focusedNote).getByRole("heading", { name: "User preferences.md" })).toBeInTheDocument();
    expect(within(focusedNote).getByText("Pending user memory -> awaits approval")).toBeInTheDocument();
  });

  it("shows a focused neighborhood for the selected vault note", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex selected" },
        { id: "browser:context", label: "Browser Context", kind: "browser", tone: "warning", detail: "Dashboard tab" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "browser:context", to: "session:latest", label: "observed in" },
        { from: "session:latest", to: "provider:codex", label: "recalls context" }
      ]}
    />);

    fireEvent.click(within(screen.getByRole("list", { name: "Vault notes" }))
      .getByRole("button", { name: "Open note Latest session.md" }));

    const neighborhood = screen.getByRole("list", { name: "Focused neighborhood" });
    expect(within(neighborhood).getByText("Browser Context")).toBeInTheDocument();
    expect(within(neighborhood).getByText("observed in")).toBeInTheDocument();
    expect(within(neighborhood).getByText("Codex")).toBeInTheDocument();
    expect(within(neighborhood).getByText("recalls context")).toBeInTheDocument();
  });

  it("keeps focused neighborhood keys unique when the same neighbor has two relations", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      render(<KnowledgeGraph
        nodes={[
          { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex selected" },
          { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" }
        ]}
        edges={[
          { from: "provider:codex", to: "session:latest", label: "answered" },
          { from: "session:latest", to: "provider:codex", label: "recalls context" }
        ]}
      />);

      expect(consoleError.mock.calls.some((call) => (
        call.some((part) => String(part).includes("Encountered two children with the same key"))
      ))).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("renders a readable learning loop when memory review closes the personalization cycle", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" },
        { id: "skill:memory-review", label: "Memory review", kind: "skill", tone: "neutral", detail: "Post-turn personalization distills durable notes." },
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries · short Chinese updates" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex assistant is selected." }
      ]}
      edges={[
        { from: "session:latest", to: "skill:memory-review", label: "teaches" },
        { from: "skill:memory-review", to: "memory:user", label: "distills" },
        { from: "memory:user", to: "provider:codex", label: "injects prompt" },
        { from: "provider:codex", to: "session:latest", label: "answered" }
      ]}
    />);

    const learningLoop = screen.getByRole("list", { name: "Learning loop" });
    expect(within(learningLoop).getByText("Latest session -> teaches -> Memory review")).toBeInTheDocument();
    expect(within(learningLoop).getByText("Memory review -> distills -> User preferences")).toBeInTheDocument();
    expect(within(learningLoop).getByText("User preferences -> injects prompt -> Codex")).toBeInTheDocument();
    expect(within(learningLoop).getByText("Codex -> answered -> Latest session")).toBeInTheDocument();
  });

  it("renders the next provider prompt stack in personalization order", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries" },
        { id: "memory:agent", label: "Agent operating notes", kind: "memory", tone: "success", detail: "1 entry" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" },
        { id: "skill:communication-style", label: "Concise Chinese progress updates", kind: "skill", tone: "success", detail: "communication habit" },
        { id: "profile:working", label: "Working profile", kind: "memory", tone: "success", detail: "Portable skfiy working profile" },
        { id: "browser:context", label: "Browser Context", kind: "browser", tone: "warning", detail: "Dashboard tab" },
        { id: "provider:hermes", label: "Hermes", kind: "provider", tone: "success", detail: "Hermes assistant is selected." }
      ]}
      edges={[
        { from: "memory:user", to: "provider:hermes", label: "injects prompt" },
        { from: "memory:agent", to: "provider:hermes", label: "guides behavior" },
        { from: "session:latest", to: "provider:hermes", label: "recalls context" },
        { from: "skill:communication-style", to: "provider:hermes", label: "guides prompt" },
        { from: "profile:working", to: "provider:hermes", label: "travels with prompt" },
        { from: "browser:context", to: "session:latest", label: "observed in" }
      ]}
    />);

    const promptStack = screen.getByRole("list", { name: "Prompt stack" });
    const steps = within(promptStack).getAllByRole("listitem");

    expect(steps.map((step) => step.textContent)).toEqual([
      "1MemoryUser preferences, Agent operating notes",
      "2Recalled sessionsLatest session",
      "3Personal skillsConcise Chinese progress updates",
      "4Working profileWorking profile",
      "5Browser ContextBrowser Context",
      "6Background AgentHermes"
    ]);
  });

  it("renders a prompt source ledger with durable, pending, and provider readiness states", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries" },
        { id: "memory:agent", label: "Agent operating notes", kind: "memory", tone: "success", detail: "1 entry" },
        { id: "memory:pending:pmw-review-style", label: "Pending user memory", kind: "memory", tone: "warning", detail: "awaiting approval" },
        { id: "session:latest", label: "Latest session", kind: "session", tone: "neutral", detail: "Codex: summarize dashboard" },
        { id: "skill:communication-style", label: "Concise Chinese progress updates", kind: "skill", tone: "success", detail: "communication habit" },
        { id: "profile:working", label: "Working profile", kind: "memory", tone: "success", detail: "Portable skfiy working profile" },
        { id: "browser:context", label: "Browser Context", kind: "browser", tone: "warning", detail: "Host policy blocked" },
        { id: "provider:hermes", label: "Hermes", kind: "provider", tone: "success", detail: "Hermes assistant is selected." }
      ]}
      edges={[
        { from: "memory:user", to: "provider:hermes", label: "injects prompt" },
        { from: "memory:agent", to: "provider:hermes", label: "guides behavior" },
        { from: "memory:pending:pmw-review-style", to: "memory:user", label: "awaits approval" },
        { from: "session:latest", to: "provider:hermes", label: "recalls context" },
        { from: "skill:communication-style", to: "provider:hermes", label: "guides prompt" },
        { from: "profile:working", to: "provider:hermes", label: "travels with prompt" },
        { from: "browser:context", to: "session:latest", label: "observed in" }
      ]}
    />);

    const ledger = screen.getByRole("list", { name: "Prompt source ledger" });
    const entries = within(ledger).getAllByRole("listitem");

    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Memoryprompt-safe durableUser preferences, Agent operating notes",
      "Pending memoryreview gatedPending user memory",
      "Recalled sessionsprompt-safe recallLatest session",
      "Personal skillsprompt-safe distilledConcise Chinese progress updates",
      "Working profileprompt-safe portableWorking profile",
      "Browser Contextblocked or gatedBrowser Context",
      "Background AgentreadyHermes"
    ]);
  });

  it("keeps Browser Context visible in the ledger when no page context is available", () => {
    render(<KnowledgeGraph
      nodes={[
        { id: "memory:user", label: "User preferences", kind: "memory", tone: "success", detail: "2 entries" },
        { id: "provider:codex", label: "Codex", kind: "provider", tone: "success", detail: "Codex assistant is selected." }
      ]}
      edges={[
        { from: "memory:user", to: "provider:codex", label: "injects prompt" }
      ]}
    />);

    const ledger = screen.getByRole("list", { name: "Prompt source ledger" });

    expect(within(ledger).getByText("Browser Context")).toBeInTheDocument();
    expect(within(ledger).getByText("unavailable")).toBeInTheDocument();
    expect(within(ledger).getByText("No current page context")).toBeInTheDocument();
  });
});
