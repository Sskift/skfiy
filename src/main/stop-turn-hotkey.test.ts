import { describe, expect, it, vi } from "vitest";
import {
  readStopTurnHotkeyStatus,
  registerStopTurnHotkey,
  STOP_TURN_ACCELERATOR
} from "./stop-turn-hotkey";

describe("registerStopTurnHotkey", () => {
  it("registers a skfiy-owned global panic accelerator and notifies the renderer", () => {
    let callback: (() => void) | undefined;
    const send = vi.fn();
    const registered = registerStopTurnHotkey({
      registry: {
        register(accelerator, nextCallback) {
          callback = nextCallback;
          return accelerator === STOP_TURN_ACCELERATOR;
        }
      },
      getWindow: () => ({
        isDestroyed: () => false,
        webContents: { send }
      })
    });

    expect(registered).toBe(true);
    expect(STOP_TURN_ACCELERATOR).toBe("Control+Alt+Shift+Esc");

    callback?.();

    expect(send).toHaveBeenCalledWith("skfiy:stop-turn-hotkey");
  });

  it("does not notify a destroyed window", () => {
    let callback: (() => void) | undefined;
    const send = vi.fn();

    registerStopTurnHotkey({
      registry: {
        register(_accelerator, nextCallback) {
          callback = nextCallback;
          return true;
        }
      },
      getWindow: () => ({
        isDestroyed: () => true,
        webContents: { send }
      })
    });

    callback?.();

    expect(send).not.toHaveBeenCalled();
  });

  it("reports the runtime registration state for product-path smoke tests", () => {
    expect(readStopTurnHotkeyStatus(true)).toEqual({
      accelerator: STOP_TURN_ACCELERATOR,
      label: "Ctrl Opt Shift Esc",
      registered: true
    });
    expect(readStopTurnHotkeyStatus(false)).toEqual({
      accelerator: STOP_TURN_ACCELERATOR,
      label: "Ctrl Opt Shift Esc",
      registered: false
    });
  });
});
