import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ROUTE_OUTCOME_KINDS,
  ROUTE_OUTCOME_TONES
} from "../shared/route-outcome";

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
      expect(source, `${name} should preserve structured route outcomes`).toContain("routeOutcome?: RouteOutcome");
      expect(source, `${name} should preserve stop-turn behavior`).toContain("stopTurnBehavior?:");
    }

    expect(sources.preload).toContain("isTaskEventStopTurnBehavior");
    expect(sources.preload).toContain("candidate.stopTurnBehavior === undefined");
    expect(sources.preload).toContain("event.stopTurnBehavior === undefined");
  });

  it("keeps replay verification action fields across the preload boundary", () => {
    const sources = {
      mainTranscript: readFileSync(path.join(process.cwd(), "src/main/computer-use/turn-transcript.ts"), "utf8"),
      preload: readFileSync(path.join(process.cwd(), "src/main/preload.cts"), "utf8"),
      rendererTypes: readFileSync(path.join(process.cwd(), "src/renderer/app-types.ts"), "utf8"),
      rendererViewModel: readFileSync(path.join(process.cwd(), "src/renderer/app-view-model.ts"), "utf8")
    };

    for (const [name, source] of Object.entries(sources)) {
      expect(source, `${name} should preserve replay verify action type`).toContain("actionType");
      expect(source, `${name} should preserve replay action status`).toContain("status");
      expect(source, `${name} should preserve replay action message`).toContain("message");
    }

    expect(sources.preload).toContain("action.actionType === undefined");
    expect(sources.preload).toContain("action.status === undefined");
    expect(sources.preload).toContain("action.message === undefined");
  });

  it("keeps replay route action summary fields across main, preload, and renderer surfaces", () => {
    const sources = {
      mainTranscript: readFileSync(path.join(process.cwd(), "src/main/computer-use/turn-transcript.ts"), "utf8"),
      preload: readFileSync(path.join(process.cwd(), "src/main/preload.cts"), "utf8"),
      rendererTypes: readFileSync(path.join(process.cwd(), "src/renderer/app-types.ts"), "utf8"),
      rendererViewModel: readFileSync(path.join(process.cwd(), "src/renderer/app-view-model.ts"), "utf8")
    };
    const actionFields = [
      "turnId",
      "toolCallId",
      "route",
      "decision",
      "summary",
      "evidenceSummary",
      "artifactCount",
      "from",
      "to",
      "source",
      "frontmostBundleId",
      "targetPath",
      "selectedCount",
      "rootPath",
      "operationCount",
      "destructiveOperationCount",
      "createFolderCount",
      "moveFileCount"
    ];

    for (const [name, source] of Object.entries(sources)) {
      for (const field of actionFields) {
        expect(source, `${name} should preserve replay action field ${field}`).toContain(field);
      }
    }

    for (const field of actionFields) {
      expect(sources.preload, `preload should validate replay action field ${field}`)
        .toContain(`action.${field} === undefined`);
    }

    for (const actionType of [
      "tool_call",
      "approval_decision",
      "tool_result",
      "switch_control",
      "observe_finder_selection",
      "preview_finder_plan",
      "confirm_finder_plan"
    ]) {
      expect(sources.rendererViewModel, `renderer should format replay action ${actionType}`)
        .toContain(`action.type === "${actionType}"`);
    }
  });

  it("keeps route outcome kinds on the shared contract across runtime, bridge, dashboard, and pet surfaces", () => {
    const sources = {
      sharedRouteOutcome: readFileSync(path.join(process.cwd(), "src/shared/route-outcome.ts"), "utf8"),
      preload: readFileSync(path.join(process.cwd(), "src/main/preload.cts"), "utf8"),
      rendererTypes: readFileSync(path.join(process.cwd(), "src/renderer/app-types.ts"), "utf8"),
      rendererViewModel: readFileSync(path.join(process.cwd(), "src/renderer/app-view-model.ts"), "utf8"),
      dashboardModel: readFileSync(path.join(process.cwd(), "src/dashboard/model.ts"), "utf8"),
      runtimeSnapshot: readFileSync(path.join(process.cwd(), "src/main/runtime-snapshot.ts"), "utf8"),
      operatorEvidence: readFileSync(path.join(process.cwd(), "src/main/dashboard-operator-evidence.ts"), "utf8"),
      cliStatusEvidence: readFileSync(path.join(process.cwd(), "src/main/cli-status-evidence.ts"), "utf8")
    };

    expect(sources.rendererTypes).toContain("../shared/route-outcome.js");
    expect(sources.rendererTypes).not.toContain("export type RouteOutcomeKind =\n  |");

    for (const kind of ROUTE_OUTCOME_KINDS) {
      expect(sources.sharedRouteOutcome, `shared route outcome should declare ${kind}`).toContain(`"${kind}"`);
      expect(sources.preload, `preload validator should accept ${kind}`).toContain(`"${kind}"`);
      expect(sources.rendererViewModel, `pet route signal labels should cover ${kind}`)
        .toMatch(new RegExp(`\\b${kind}:`));
      expect(sources.dashboardModel, `dashboard model should handle ${kind}`).toContain(`"${kind}"`);
    }

    for (const tone of ROUTE_OUTCOME_TONES) {
      expect(sources.sharedRouteOutcome, `shared route outcome should declare tone ${tone}`).toContain(`"${tone}"`);
      expect(sources.preload, `preload validator should accept tone ${tone}`).toContain(`"${tone}"`);
    }

    expect(sources.sharedRouteOutcome).toContain("readExplicitRouteOutcome");
    expect(sources.sharedRouteOutcome).toContain("readExplicitRouteOutcomeKind(record.kind");
    expect(sources.sharedRouteOutcome).toContain("isRouteOutcomeKind(sanitized)");
    expect(sources.sharedRouteOutcome).toContain("isRouteOutcomeTone(record.tone)");

    for (const [name, source] of Object.entries({
      runtimeSnapshot: sources.runtimeSnapshot,
      operatorEvidence: sources.operatorEvidence,
      cliStatusEvidence: sources.cliStatusEvidence
    })) {
      expect(source, `${name} should validate route outcome kind with the shared predicate`)
        .toMatch(/isRouteOutcomeKind|readExplicitRouteOutcome/);
      expect(source, `${name} should validate route outcome tone with the shared predicate`)
        .toMatch(/isRouteOutcomeTone|readExplicitRouteOutcome/);
    }
  });

  it("keeps evidence summary route outcome state mapping aligned with the canonical outcome set", () => {
    const evidenceSummary = readFileSync(
      path.join(process.cwd(), "src/main/dashboard-evidence-summary.ts"),
      "utf8"
    );
    const mappedKinds = new Set(
      [...evidenceSummary.matchAll(/kind === "([^"]+)"/g)]
        .map((match) => match[1])
    );
    const knownNonFallbackKinds = ROUTE_OUTCOME_KINDS.filter((kind) => kind !== "unknown");

    expect([...mappedKinds].sort()).toEqual([...knownNonFallbackKinds].sort());
    expect(evidenceSummary).toContain('return "unknown";');
  });
});
