import { render, screen, within } from "@testing-library/react";
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
});
