import { describe, expect, it } from "vitest";

import {
  readTurnReplayTaskEvent,
  withRouteTaskEventMetadata
} from "./task-event-view";

describe("task event route metadata", () => {
  it("adds route-policy metadata for confirmation-gated routes", () => {
    expect(withRouteTaskEventMetadata({
      status: "needs_confirmation",
      message: "Route policy requires confirmation before continuing with Ghostty.",
      command: "run pwd"
    }, {
      kind: "needs_confirmation",
      reason: "Route policy requires confirmation before continuing with Ghostty.",
      targetRoute: {
        kind: "ghostty",
        bundleId: "com.mitchellh.ghostty"
      }
    })).toMatchObject({
      route: "ghostty",
      routeReason: "Route policy requires confirmation before continuing with Ghostty.",
      policyKind: "route-policy"
    });
  });

  it("preserves explicit app-policy denial metadata in replay task events", () => {
    const event = withRouteTaskEventMetadata({
      status: "blocked",
      message: "Ghostty is blocked by policy.",
      command: "run pwd"
    }, {
      kind: "ghostty",
      bundleId: "com.mitchellh.ghostty"
    }, {
      routeReason: "Ghostty is denied by configured app policy.",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });

    expect(event).toMatchObject({
      route: "ghostty",
      routeReason: "Ghostty is denied by configured app policy.",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
    expect(readTurnReplayTaskEvent(event)).toMatchObject({
      status: "blocked",
      route: "ghostty",
      routeReason: "Ghostty is denied by configured app policy.",
      denialKind: "app_policy",
      policyKind: "app-policy"
    });
  });
});
