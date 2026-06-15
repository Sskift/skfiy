import { describe, expect, it } from "vitest";
import type { DesktopAppState } from "./types";
import {
  extractObservedElementsFromAppState,
  resolveClickTarget
} from "./observed-elements";

function createState(): DesktopAppState {
  return {
    bundleId: "com.mitchellh.ghostty",
    pid: 54502,
    isRunning: true,
    isActive: true,
    screenshotPath: "/tmp/ghostty.png",
    windows: [
      {
        title: "background",
        layer: 3,
        bounds: { x: 200, y: 100, width: 300, height: 200 }
      },
      {
        title: "skfiy-shell",
        layer: 0,
        bounds: { x: 10, y: 20, width: 640, height: 480 }
      },
      {
        title: "hidden",
        layer: 0,
        bounds: { x: 0, y: 0, width: 0, height: 100 }
      }
    ]
  };
}

describe("observed elements", () => {
  it("extracts window elements from app observations in front-to-back order", () => {
    expect(extractObservedElementsFromAppState(createState())).toEqual([
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
        id: "window:1",
        role: "window",
        source: "window",
        label: "background",
        bounds: { x: 200, y: 100, width: 300, height: 200 },
        confidence: 1,
        metadata: {
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          layer: 3
        }
      }
    ]);
  });

  it("uses the bundle id when a window has no title", () => {
    const state = createState();
    state.windows = [
      {
        layer: 0,
        bounds: { x: 1, y: 2, width: 3, height: 4 }
      }
    ];

    expect(extractObservedElementsFromAppState(state)[0]).toMatchObject({
      label: "com.mitchellh.ghostty"
    });
  });

  it("resolves a click target to the center of an observed element", () => {
    const elements = extractObservedElementsFromAppState(createState());

    expect(resolveClickTarget(elements, "window:0")).toEqual({
      elementId: "window:0",
      x: 330,
      y: 260
    });
  });

  it("throws when resolving an unknown element id", () => {
    const elements = extractObservedElementsFromAppState(createState());

    expect(() => resolveClickTarget(elements, "window:missing")).toThrow(
      "Observed element was not found: window:missing"
    );
  });
});
