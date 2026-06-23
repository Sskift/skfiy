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
});
