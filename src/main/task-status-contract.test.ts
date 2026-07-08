import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CANONICAL_TASK_STATUSES = [
  "idle",
  "planned",
  "observing",
  "executing",
  "running",
  "approval_required",
  "needs_confirmation",
  "needs_clarification",
  "completed",
  "denied",
  "blocked",
  "failed",
  "cancelled"
];

describe("task status boundary contract", () => {
  it("keeps main, preload, renderer, and pet status maps aligned", () => {
    const sources = {
      mainTaskEvents: readFileSync(path.join(process.cwd(), "src/main/task-event-view.ts"), "utf8"),
      preload: readFileSync(path.join(process.cwd(), "src/main/preload.cts"), "utf8"),
      rendererTypes: readFileSync(path.join(process.cwd(), "src/renderer/app-types.ts"), "utf8"),
      petAtlas: readFileSync(path.join(process.cwd(), "src/renderer/pet-atlas.ts"), "utf8")
    };

    for (const [name, source] of Object.entries(sources)) {
      for (const status of CANONICAL_TASK_STATUSES) {
        expect(source, `${name} should include task status ${status}`).toContain(`"${status}"`);
      }
    }
  });

  it("allows canonical task statuses through the Electron preload bridge", () => {
    const preload = readFileSync(path.join(process.cwd(), "src/main/preload.cts"), "utf8");

    for (const status of CANONICAL_TASK_STATUSES) {
      expect(preload).toContain(`"${status}"`);
    }
  });

  it("keeps route metadata fields on task events across the bridge boundary", () => {
    const sources = {
      mainTaskEvents: readFileSync(path.join(process.cwd(), "src/main/task-event-view.ts"), "utf8"),
      preload: readFileSync(path.join(process.cwd(), "src/main/preload.cts"), "utf8"),
      rendererTypes: readFileSync(path.join(process.cwd(), "src/renderer/app-types.ts"), "utf8"),
      rendererTaskState: readFileSync(path.join(process.cwd(), "src/renderer/app-task-state.ts"), "utf8")
    };

    for (const [name, source] of Object.entries(sources)) {
      expect(source, `${name} should preserve route labels`).toContain("route?: string");
      expect(source, `${name} should preserve route reasons`).toContain("routeReason?: string");
      expect(source, `${name} should preserve denial kind`).toContain("denialKind?: string");
      expect(source, `${name} should preserve policy kind`).toContain("policyKind?: string");
    }
  });
});
