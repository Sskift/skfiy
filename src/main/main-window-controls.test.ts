import { describe, expect, it, vi } from "vitest";

import {
  applyPetWindowDragMove,
  applyPetWindowMode,
  type PetWindowControlTarget
} from "./main-window-controls";
import { COMPACT_WINDOW_SIZE } from "./main-window-state";
import type { DisplayLike, PetWindowBounds } from "./window-position";

const displays: DisplayLike[] = [
  {
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    workArea: { x: 0, y: 25, width: 1440, height: 875 }
  }
];

function createWindow(bounds: PetWindowBounds, destroyed = false): PetWindowControlTarget {
  return {
    getBounds: vi.fn(() => bounds),
    isDestroyed: vi.fn(() => destroyed),
    setBounds: vi.fn(),
    setPosition: vi.fn()
  };
}

describe("main window controls", () => {
  it("applies plain pet window drag movement without changing visible pet anchor state", () => {
    const window = createWindow({ x: 80, y: 120, width: 90, height: 66 });
    const anchorState = {
      currentPetAnchor: { x: 120, y: 140 },
      currentPetSize: { width: 90, height: 66 }
    };

    expect(applyPetWindowDragMove({
      ...anchorState,
      deltaX: 10.4,
      deltaY: -20.6,
      displays,
      visibleRectValue: null,
      window
    })).toEqual(anchorState);

    expect(window.setPosition).toHaveBeenCalledWith(90, 99);
    expect(window.setBounds).not.toHaveBeenCalled();
  });

  it("updates visible pet anchor state when drag movement is bounded by the visible pet rect", () => {
    const window = createWindow({ x: 20, y: 30, width: 320, height: 500 });

    expect(applyPetWindowDragMove({
      currentPetAnchor: null,
      currentPetSize: null,
      deltaX: -100,
      deltaY: -1000,
      displays,
      visibleRectValue: { x: 1, y: 433, width: 90, height: 66 },
      window
    })).toEqual({
      currentPetAnchor: { x: 0, y: 0 },
      currentPetSize: { width: 90, height: 66 }
    });

    expect(window.setBounds).toHaveBeenCalledWith({
      x: -1,
      y: -433,
      width: 320,
      height: 500
    });
    expect(window.setPosition).not.toHaveBeenCalled();
  });

  it("ignores destroyed windows and invalid movement payloads", () => {
    const destroyedWindow = createWindow({ x: 80, y: 120, width: 90, height: 66 }, true);
    const anchorState = {
      currentPetAnchor: null,
      currentPetSize: null
    };

    expect(applyPetWindowDragMove({
      ...anchorState,
      deltaX: 10,
      deltaY: 20,
      displays,
      visibleRectValue: null,
      window: destroyedWindow
    })).toEqual(anchorState);
    expect(destroyedWindow.setPosition).not.toHaveBeenCalled();

    const window = createWindow({ x: 80, y: 120, width: 90, height: 66 });
    expect(applyPetWindowDragMove({
      ...anchorState,
      deltaX: "10",
      deltaY: 20,
      displays,
      visibleRectValue: null,
      window
    })).toEqual(anchorState);
    expect(window.setPosition).not.toHaveBeenCalled();
  });

  it("applies mode changes while preserving the visible pet anchor", () => {
    const window = createWindow({ x: 20, y: 30, ...COMPACT_WINDOW_SIZE });

    expect(applyPetWindowMode({
      currentPetAnchor: { x: 110, y: 96 },
      currentPetSize: COMPACT_WINDOW_SIZE,
      displays,
      mode: "expanded",
      window
    })).toBe(true);

    expect(window.setBounds).toHaveBeenCalledWith({
      x: 109,
      y: 95,
      width: 320,
      height: 500
    });
  });

  it("ignores invalid mode changes", () => {
    const window = createWindow({ x: 20, y: 30, ...COMPACT_WINDOW_SIZE });

    expect(applyPetWindowMode({
      currentPetAnchor: null,
      currentPetSize: null,
      displays,
      mode: "maximized",
      window
    })).toBe(false);

    expect(window.setBounds).not.toHaveBeenCalled();
  });
});
