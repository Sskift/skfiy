import { describe, expect, it } from "vitest";
import {
  COMPACT_WINDOW_SIZE,
  EXPANDED_WINDOW_SIZE,
  createPetWindowModeTransition,
  readPetWindowSize
} from "./main-window-state";

const displays = [
  {
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    workArea: { x: 0, y: 25, width: 1440, height: 875 }
  }
];

describe("main window state", () => {
  it("keeps the current bounds when the requested mode already matches the window size", () => {
    expect(createPetWindowModeTransition({
      mode: "compact",
      currentBounds: { x: 80, y: 120, ...COMPACT_WINDOW_SIZE },
      displays
    })).toEqual({ kind: "unchanged" });
  });

  it("keeps the bottom edge anchored when no visible pet anchor has been reported", () => {
    expect(createPetWindowModeTransition({
      mode: "expanded",
      currentBounds: { x: 80, y: 780, ...COMPACT_WINDOW_SIZE },
      displays
    })).toEqual({
      kind: "set-bounds",
      bounds: {
        x: 80,
        y: 346,
        ...EXPANDED_WINDOW_SIZE
      }
    });
  });

  it("keeps the visible pet anchored when changing between compact and expanded modes", () => {
    expect(createPetWindowModeTransition({
      mode: "expanded",
      currentBounds: { x: 20, y: 30, ...COMPACT_WINDOW_SIZE },
      currentPetAnchor: { x: 110, y: 96 },
      currentPetSize: COMPACT_WINDOW_SIZE,
      displays
    })).toEqual({
      kind: "set-bounds",
      bounds: {
        x: 109,
        y: 0,
        ...EXPANDED_WINDOW_SIZE
      }
    });

    expect(createPetWindowModeTransition({
      mode: "compact",
      currentBounds: { x: 109, y: 0, ...EXPANDED_WINDOW_SIZE },
      currentPetAnchor: { x: 110, y: 434 },
      currentPetSize: COMPACT_WINDOW_SIZE,
      displays
    })).toEqual({
      kind: "set-bounds",
      bounds: {
        x: 109,
        y: 433,
        ...COMPACT_WINDOW_SIZE
      }
    });
  });

  it("maps pet window modes to stable window sizes", () => {
    expect(readPetWindowSize("compact")).toEqual(COMPACT_WINDOW_SIZE);
    expect(readPetWindowSize("expanded")).toEqual(EXPANDED_WINDOW_SIZE);
  });
});
