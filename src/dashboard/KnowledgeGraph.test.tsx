import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
