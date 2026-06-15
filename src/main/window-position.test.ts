import { describe, expect, it } from "vitest";
import { calculatePetWindowBounds, readWindowPositionOverride } from "./window-position";

describe("calculatePetWindowBounds", () => {
  it("anchors the pet to the display containing the cursor instead of the primary display", () => {
    const bounds = calculatePetWindowBounds({
      cursorPoint: { x: 512, y: 500 },
      displays: [
        { workArea: { x: 2048, y: 0, width: 1792, height: 1120 } },
        { workArea: { x: 0, y: 0, width: 2048, height: 1152 } }
      ],
      windowSize: { width: 320, height: 360 },
      margin: 28
    });

    expect(bounds).toEqual({
      x: 1700,
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
});
