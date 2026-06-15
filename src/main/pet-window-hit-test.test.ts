import { describe, expect, it } from "vitest";
import { shouldCaptureMouseForPetOverlay } from "./pet-window-hit-test";

describe("shouldCaptureMouseForPetOverlay", () => {
  it("captures mouse over the pet body so it can be clicked or dragged", () => {
    expect(
      shouldCaptureMouseForPetOverlay({ x: 160, y: 250 }, { capsuleOpen: false, dragging: false })
    ).toBe(true);
  });

  it("captures mouse over the command capsule only while the capsule is open", () => {
    const capsulePoint = { x: 160, y: 92 };

    expect(
      shouldCaptureMouseForPetOverlay(capsulePoint, { capsuleOpen: false, dragging: false })
    ).toBe(false);
    expect(
      shouldCaptureMouseForPetOverlay(capsulePoint, { capsuleOpen: true, dragging: false })
    ).toBe(true);
  });

  it("keeps transparent window areas click-through", () => {
    expect(
      shouldCaptureMouseForPetOverlay({ x: 10, y: 10 }, { capsuleOpen: true, dragging: false })
    ).toBe(false);
  });

  it("captures mouse while the renderer is dragging even if the pointer leaves the hot region", () => {
    expect(
      shouldCaptureMouseForPetOverlay({ x: -20, y: 500 }, { capsuleOpen: false, dragging: true })
    ).toBe(true);
  });
});
