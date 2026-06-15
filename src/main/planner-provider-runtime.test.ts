import { describe, expect, it } from "vitest";
import { decidePlannerProviderRuntime } from "./planner-provider-runtime";

describe("planner provider runtime gate", () => {
  it("allows local deterministic Computer Use execution", () => {
    expect(decidePlannerProviderRuntime({
      mode: "local-deterministic",
      externalProviderLabel: "External CUA"
    })).toEqual({
      decision: "run-local-deterministic"
    });
  });

  it("fails closed when Computer Use planner mode is disabled", () => {
    expect(decidePlannerProviderRuntime({
      mode: "disabled",
      externalProviderLabel: "External CUA"
    })).toEqual({
      decision: "unavailable",
      status: "failed",
      message: "Computer Use planner is disabled in settings."
    });
  });

  it("reports external CUA as configured but not implemented", () => {
    expect(decidePlannerProviderRuntime({
      mode: "external-cua",
      externalProviderLabel: "External CUA"
    })).toEqual({
      decision: "unavailable",
      status: "failed",
      message: "External CUA provider is configured but not implemented yet."
    });
  });
});
