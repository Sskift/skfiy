import { describe, expect, it } from "vitest";

import {
  isEnabledEnvFlag,
  readFiniteNumber,
  readMode,
  readPermissionSettingsTarget,
  readPetWindowMode,
  readRunCommandRequest,
  readTmuxMonitorInput,
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

  it("normalizes run-command requests without main-process side effects", () => {
    expect(readRunCommandRequest("  organize Downloads  ", { mode: "quiet" })).toEqual({
      ok: true,
      command: "organize Downloads",
      mode: "quiet"
    });
    expect(readRunCommandRequest("open Chrome", { mode: "unexpected" })).toEqual({
      ok: true,
      command: "open Chrome",
      mode: "active"
    });
    expect(readRunCommandRequest("open Chrome", null)).toEqual({
      ok: true,
      command: "open Chrome",
      mode: "active"
    });

    expect(readRunCommandRequest(42, { mode: "active" })).toEqual({
      ok: false,
      message: "Command must be text."
    });
    expect(readRunCommandRequest("  ", { mode: "quiet" })).toEqual({
      ok: false,
      message: "No command was provided."
    });
  });

  it("normalizes env flags", () => {
    expect(isEnabledEnvFlag("1")).toBe(true);
    expect(isEnabledEnvFlag("true")).toBe(true);
    expect(isEnabledEnvFlag("on")).toBe(true);
    expect(isEnabledEnvFlag("TRUE")).toBe(false);
    expect(isEnabledEnvFlag(undefined)).toBe(false);
  });

  it("normalizes tmux monitor requests", () => {
    expect(readTmuxMonitorInput({
      sessionName: "money-run",
      label: "Money run",
      intervalMs: 60_000,
      enabled: false
    })).toEqual({
      sessionName: "money-run",
      label: "Money run",
      intervalMs: 60_000,
      enabled: false
    });
    expect(readTmuxMonitorInput({ sessionName: "money-run", intervalMs: Number.NaN })).toEqual({
      sessionName: "money-run",
      intervalMs: 300_000
    });
    expect(readTmuxMonitorInput(null)).toEqual({
      sessionName: "",
      intervalMs: 300_000
    });
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
