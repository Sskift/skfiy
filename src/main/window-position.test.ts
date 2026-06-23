import { describe, expect, it } from "vitest";
import {
  calculatePetWindowBounds,
  movePetAnchorByDelta,
  readWindowPositionOverride,
  resizePetWindowBoundsKeepingBottom
} from "./window-position";

describe("calculatePetWindowBounds", () => {
  it("anchors the pet to the display containing the cursor instead of the primary display", () => {
    const bounds = calculatePetWindowBounds({
      cursorPoint: { x: 512, y: 500 },
      displays: [
        { workArea: { x: 2048, y: 0, width: 1792, height: 1120 } },
        { workArea: { x: 0, y: 0, width: 2048, height: 1152 } }
      ],
      windowSize: { width: 320, height: 224 },
      margin: 28
    });

    expect(bounds).toEqual({
      x: 1700,
      y: 900,
      width: 320,
      height: 224
    });
  });

  it("keeps the pet bottom anchored when the transparent window changes height", () => {
    expect(
      resizePetWindowBoundsKeepingBottom(
        { x: 80, y: 900, width: 320, height: 224 },
        { width: 320, height: 360 }
      )
    ).toEqual({
      x: 80,
      y: 764,
      width: 320,
      height: 360
    });
  });

  it("allows an explicit debug position override", () => {
    const override = readWindowPositionOverride({
      SKFIY_WINDOW_X: "80",
      SKFIY_WINDOW_Y: "120"
    });

    expect(override).toEqual({ x: 80, y: 120 });
  });

  it("clamps the visible pet anchor to the display bounds", () => {
    const displays = [
      {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        workArea: { x: 0, y: 25, width: 1440, height: 875 }
      }
    ];

    expect(movePetAnchorByDelta({
      anchor: { x: 100, y: 100 },
      delta: { x: -1000, y: -1000 },
      petSize: { width: 90, height: 66 },
      displays
    })).toEqual({ x: 0, y: 0 });

    expect(movePetAnchorByDelta({
      anchor: { x: 100, y: 100 },
      delta: { x: 10000, y: 10000 },
      petSize: { width: 90, height: 66 },
      displays
    })).toEqual({ x: 1350, y: 834 });
  });

  it("uses the display nearest to the requested pet anchor", () => {
    const displays = [
      {
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        workArea: { x: 0, y: 25, width: 1440, height: 875 }
      },
      {
        bounds: { x: 1440, y: 0, width: 1280, height: 720 },
        workArea: { x: 1440, y: 0, width: 1280, height: 720 }
      }
    ];

    const anchor = movePetAnchorByDelta({
      anchor: { x: 1500, y: 40 },
      delta: { x: 2000, y: 1000 },
      petSize: { width: 90, height: 66 },
      displays
    });

    expect(anchor).toEqual({ x: 2630, y: 654 });
  });
});
