import { describe, expect, it } from "vitest";
import {
  readDesktopSessionDiagnosticsForRenderer,
  UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS
} from "./desktop-session-diagnostics";
import type { DesktopSessionStatus } from "./computer-use/types";

describe("readDesktopSessionDiagnosticsForRenderer", () => {
  it("classifies loginwindow as a desktop-session blocker", async () => {
    const status: DesktopSessionStatus = {
      controllable: false,
      frontmostBundleId: "com.apple.loginwindow",
      frontmostLocalizedName: "loginwindow",
      frontmostProcessIdentifier: 591
    };

    await expect(
      readDesktopSessionDiagnosticsForRenderer({
        helper: {
          getDesktopSessionStatus: async () => status
        }
      })
    ).resolves.toEqual({
      state: "blocked",
      status,
      reason: "Desktop session is locked by loginwindow (pid 591). Unlock the Mac and keep the display awake, then retry."
    });
  });

  it("returns an unknown diagnostic when the helper cannot read desktop state", async () => {
    const messages: string[] = [];

    await expect(
      readDesktopSessionDiagnosticsForRenderer({
        helper: {
          getDesktopSessionStatus: async () => {
            throw new Error("helper unavailable");
          }
        },
        onError: (message) => messages.push(message)
      })
    ).resolves.toEqual(UNKNOWN_DESKTOP_SESSION_DIAGNOSTICS);
    expect(messages).toEqual(["helper unavailable"]);
  });
});
