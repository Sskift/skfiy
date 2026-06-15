import { describe, expect, it } from "vitest";
import type { ObservedElement } from "./observed-elements";
import {
  createClickActionForTarget,
  planClickActionForTarget
} from "./element-click-planner";

const ELEMENTS: ObservedElement[] = [
  {
    id: "window:0",
    role: "window",
    source: "window",
    label: "skfiy-shell",
    bounds: { x: 10, y: 20, width: 640, height: 480 },
    confidence: 1,
    metadata: {
      bundleId: "com.mitchellh.ghostty",
      pid: 54502,
      layer: 0
    }
  },
  {
    id: "ocr:0",
    role: "text",
    source: "ocr",
    label: "Run",
    bounds: { x: 42, y: 50, width: 80, height: 24 },
    confidence: 0.91,
    metadata: {
      bundleId: "com.mitchellh.ghostty",
      pid: 54502
    }
  }
];

describe("createClickActionForTarget", () => {
  it("creates a coordinate click from an observed element id", () => {
    expect(createClickActionForTarget(ELEMENTS, { elementId: "window:0" })).toEqual({
      type: "click",
      x: 330,
      y: 260
    });
  });

  it("uses explicit coordinate fallback when no element id is available", () => {
    expect(createClickActionForTarget(ELEMENTS, {
      coordinates: { x: 44, y: 55 },
      allowCoordinateFallback: true
    })).toEqual({
      type: "click",
      x: 44,
      y: 55
    });
  });

  it("creates a coordinate click from a unique observed text label", () => {
    expect(createClickActionForTarget(ELEMENTS, { label: "run" })).toEqual({
      type: "click",
      x: 82,
      y: 62
    });
  });

  it("asks for user confirmation when a label target is ambiguous", () => {
    expect(planClickActionForTarget([
      ...ELEMENTS,
      {
        id: "ocr:1",
        role: "text",
        source: "ocr",
        label: "Run",
        bounds: { x: 200, y: 50, width: 80, height: 24 },
        confidence: 0.9,
        metadata: {
          bundleId: "com.mitchellh.ghostty",
          pid: 54502
        }
      }
    ], { label: "run" })).toMatchObject({
      type: "needs_user_confirmation",
      reason: "Multiple observed elements matched label: run",
      candidates: [
        { id: "ocr:0", label: "Run" },
        { id: "ocr:1", label: "Run" }
      ]
    });
  });

  it("rejects coordinate fallback unless it is explicitly allowed", () => {
    expect(() => createClickActionForTarget(ELEMENTS, {
      coordinates: { x: 44, y: 55 }
    })).toThrow("Coordinate click fallback must be explicitly allowed.");
  });

  it("does not fall back to coordinates when an element id is unknown", () => {
    expect(() => createClickActionForTarget(ELEMENTS, {
      elementId: "window:missing",
      coordinates: { x: 44, y: 55 },
      allowCoordinateFallback: true
    })).toThrow("Observed element was not found: window:missing");
  });
});
