import { describe, expect, it } from "vitest";

import {
  isEnabledEnvFlag,
  readElectronMediaPermissionState,
  readFiniteNumber,
  readMode,
  readPermissionSettingsTarget,
  readPetWindowMode,
  readVisiblePetRect
} from "./main-ipc-payload";

describe("main IPC payload helpers", () => {
  it("normalizes command and settings mode payloads", () => {
    expect(readMode("quiet")).toBe("quiet");
    expect(readMode("active")).toBe("active");
    expect(readMode("unexpected")).toBe("active");
    expect(readMode(undefined)).toBe("active");

    expect(readPetWindowMode("compact")).toBe("compact");
    expect(readPetWindowMode("expanded")).toBe("expanded");
    expect(readPetWindowMode("wide")).toBeUndefined();

    expect(readPermissionSettingsTarget("screen-recording")).toBe("screen-recording");
    expect(readPermissionSettingsTarget("accessibility")).toBe("accessibility");
    expect(readPermissionSettingsTarget("automation-finder")).toBeUndefined();
  });

  it("normalizes env flags and media permission states", () => {
    expect(isEnabledEnvFlag("1")).toBe(true);
    expect(isEnabledEnvFlag("true")).toBe(true);
    expect(isEnabledEnvFlag("on")).toBe(true);
    expect(isEnabledEnvFlag("TRUE")).toBe(false);
    expect(isEnabledEnvFlag(undefined)).toBe(false);

    expect(readElectronMediaPermissionState("granted")).toBe("granted");
    expect(readElectronMediaPermissionState("restricted")).toBe("denied");
    expect(readElectronMediaPermissionState("not-determined")).toBe("not-determined");
  });

  it("reads finite numbers and visible pet rectangles defensively", () => {
    expect(readFiniteNumber(12)).toBe(12);
    expect(readFiniteNumber(Number.NaN)).toBeUndefined();
    expect(readFiniteNumber("12")).toBeUndefined();

    expect(readVisiblePetRect({
      x: 10,
      y: 20,
      width: 64,
      height: 64
    })).toEqual({
      x: 10,
      y: 20,
      width: 64,
      height: 64
    });
    expect(readVisiblePetRect({ x: 10, y: 20, width: 0, height: 64 })).toBeUndefined();
    expect(readVisiblePetRect({ x: 10, y: 20, width: 64 })).toBeUndefined();
    expect(readVisiblePetRect(null)).toBeUndefined();
  });
});
