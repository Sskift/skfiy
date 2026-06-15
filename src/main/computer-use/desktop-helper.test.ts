import { describe, expect, it } from "vitest";
import { DesktopHelperClient } from "./desktop-helper";
import type { DesktopHelperProcessResult, ProcessRunner } from "./types";

function createClientWithResponses(responses: DesktopHelperProcessResult[]) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: ProcessRunner = async (command, args) => {
    calls.push({ command, args: [...args] });
    const response = responses.shift();

    if (!response) {
      throw new Error("Unexpected helper invocation.");
    }

    return response;
  };

  return {
    calls,
    client: new DesktopHelperClient({
      helperPath: "/tmp/skfiy-helper",
      runner
    })
  };
}

describe("DesktopHelperClient", () => {
  it("builds safe argument arrays for each helper command", async () => {
    const ok = { stdout: "{\"ok\":true}", stderr: "", exitCode: 0 };
    const { calls, client } = createClientWithResponses([
      { stdout: "{\"apps\":[]}", stderr: "", exitCode: 0 },
      ok,
      { stdout: "{\"outputPath\":\"/tmp/shot.png\"}", stderr: "", exitCode: 0 },
      ok,
      ok,
      ok,
      ok,
      ok,
      ok
    ]);

    await client.listApps();
    await client.activateApp("com.mitchellh.ghostty");
    await client.screenshot("/tmp/shot.png");
    await client.typeText("echo hello; rm -rf /");
    await client.pressKey("enter");
    await client.click(12, 34);
    await client.selectInputSource("com.bytedance.inputmethod.doubaoime.pinyin");
    await client.doubleTapFunctionKey();
    await client.pressShortcut("space", ["control", "option", "command", "shift"]);

    expect(calls).toEqual([
      { command: "/tmp/skfiy-helper", args: ["list-apps"] },
      { command: "/tmp/skfiy-helper", args: ["activate-app", "--bundle-id", "com.mitchellh.ghostty"] },
      { command: "/tmp/skfiy-helper", args: ["screenshot", "--output", "/tmp/shot.png"] },
      { command: "/tmp/skfiy-helper", args: ["type-text", "--text", "echo hello; rm -rf /"] },
      { command: "/tmp/skfiy-helper", args: ["press-key", "--key", "enter"] },
      { command: "/tmp/skfiy-helper", args: ["click", "--x", "12", "--y", "34"] },
      {
        command: "/tmp/skfiy-helper",
        args: [
          "select-input-source",
          "--source-id",
          "com.bytedance.inputmethod.doubaoime.pinyin"
        ]
      },
      {
        command: "/tmp/skfiy-helper",
        args: ["double-tap-fn"]
      },
      {
        command: "/tmp/skfiy-helper",
        args: [
          "press-shortcut",
          "--key",
          "space",
          "--modifiers",
          "control,option,command,shift"
        ]
      }
    ]);
  });

  it("dispatches desktop actions through safe helper commands", async () => {
    const { calls, client } = createClientWithResponses([
      { stdout: "{\"ok\":true}", stderr: "", exitCode: 0 },
      { stdout: "{\"outputPath\":\"/tmp/action-shot.png\"}", stderr: "", exitCode: 0 },
      { stdout: "{\"ok\":true,\"message\":\"clicked\"}", stderr: "", exitCode: 0 },
      { stdout: "{\"ok\":true}", stderr: "", exitCode: 0 },
      { stdout: "{\"ok\":true}", stderr: "", exitCode: 0 }
    ]);

    await expect(
      client.executeAction({ type: "activate_app", bundleId: "com.mitchellh.ghostty" })
    ).resolves.toEqual({ ok: true });
    await expect(
      client.executeAction({ type: "screenshot", outputPath: "/tmp/action-shot.png" })
    ).resolves.toEqual({ outputPath: "/tmp/action-shot.png" });
    await expect(client.executeAction({ type: "click", x: 12, y: 34 })).resolves.toEqual({
      ok: true,
      message: "clicked"
    });
    await expect(client.executeAction({ type: "type_text", text: "hello" })).resolves.toEqual({
      ok: true
    });
    await expect(client.executeAction({ type: "press_key", key: "enter" })).resolves.toEqual({
      ok: true
    });

    expect(calls).toEqual([
      { command: "/tmp/skfiy-helper", args: ["activate-app", "--bundle-id", "com.mitchellh.ghostty"] },
      { command: "/tmp/skfiy-helper", args: ["screenshot", "--output", "/tmp/action-shot.png"] },
      { command: "/tmp/skfiy-helper", args: ["click", "--x", "12", "--y", "34"] },
      { command: "/tmp/skfiy-helper", args: ["type-text", "--text", "hello"] },
      { command: "/tmp/skfiy-helper", args: ["press-key", "--key", "enter"] }
    ]);
  });

  it("parses JSON responses from listApps and getAppState", async () => {
    const { calls, client } = createClientWithResponses([
      {
        stdout: JSON.stringify({
          apps: [
            { bundleId: "com.mitchellh.ghostty", name: "Ghostty", pid: 4312 },
            { bundleId: "com.apple.finder", name: "Finder" }
          ]
        }),
        stderr: "",
        exitCode: 0
      },
      {
        stdout: JSON.stringify({
          bundleId: "com.mitchellh.ghostty",
          isRunning: true,
          isActive: false,
          screenshotPath: "/tmp/state.png"
        }),
        stderr: "",
        exitCode: 0
      }
    ]);

    await expect(client.listApps()).resolves.toEqual([
      { bundleId: "com.mitchellh.ghostty", name: "Ghostty", pid: 4312 },
      { bundleId: "com.apple.finder", name: "Finder" }
    ]);

    await expect(client.getAppState("com.mitchellh.ghostty", "/tmp/state.png")).resolves.toEqual({
      bundleId: "com.mitchellh.ghostty",
      isRunning: true,
      isActive: false,
      screenshotPath: "/tmp/state.png"
    });

    expect(calls[1]).toEqual({
      command: "/tmp/skfiy-helper",
      args: [
        "get-app-state",
        "--bundle-id",
        "com.mitchellh.ghostty",
        "--screenshot-output",
        "/tmp/state.png"
      ]
    });
  });

  it("returns app state for observe_app desktop actions", async () => {
    const { calls, client } = createClientWithResponses([
      {
        stdout: JSON.stringify({
          bundleId: "com.mitchellh.ghostty",
          isRunning: true,
          isActive: true,
          screenshotPath: "/tmp/observed.png"
        }),
        stderr: "",
        exitCode: 0
      }
    ]);

    await expect(
      client.executeAction({
        type: "observe_app",
        bundleId: "com.mitchellh.ghostty",
        screenshotOutputPath: "/tmp/observed.png"
      })
    ).resolves.toEqual({
      bundleId: "com.mitchellh.ghostty",
      isRunning: true,
      isActive: true,
      screenshotPath: "/tmp/observed.png"
    });

    expect(calls).toEqual([
      {
        command: "/tmp/skfiy-helper",
        args: [
          "get-app-state",
          "--bundle-id",
          "com.mitchellh.ghostty",
          "--screenshot-output",
          "/tmp/observed.png"
        ]
      }
    ]);
  });

  it("parses enveloped Swift helper responses and normalizes payload names", async () => {
    const { client } = createClientWithResponses([
      {
        stdout: JSON.stringify({
          ok: true,
          command: "list-apps",
          data: {
            apps: [
              {
                bundleId: "com.mitchellh.ghostty",
                localizedName: "Ghostty",
                processIdentifier: 4312,
                isActive: true
              }
            ]
          }
        }),
        stderr: "",
        exitCode: 0
      },
      {
        stdout: JSON.stringify({
          ok: true,
          command: "activate-app",
          data: { bundleId: "com.mitchellh.ghostty", activated: true }
        }),
        stderr: "",
        exitCode: 0
      },
      {
        stdout: JSON.stringify({
          ok: true,
          command: "screenshot",
          data: { output: "/tmp/shot.png" }
        }),
        stderr: "",
        exitCode: 0
      },
      {
        stdout: JSON.stringify({
          ok: true,
          command: "get-app-state",
          data: {
            app: {
              bundleId: "com.mitchellh.ghostty",
              localizedName: "Ghostty",
              processIdentifier: 4312,
              isActive: false
            },
            screenshot: { output: "/tmp/state.png" }
          }
        }),
        stderr: "",
        exitCode: 0
      }
    ]);

    await expect(client.listApps()).resolves.toEqual([
      { bundleId: "com.mitchellh.ghostty", name: "Ghostty", pid: 4312 }
    ]);
    await expect(client.activateApp("com.mitchellh.ghostty")).resolves.toEqual({ ok: true });
    await expect(client.screenshot("/tmp/shot.png")).resolves.toEqual({
      outputPath: "/tmp/shot.png"
    });
    await expect(client.getAppState("com.mitchellh.ghostty", "/tmp/state.png")).resolves.toEqual({
      bundleId: "com.mitchellh.ghostty",
      isRunning: true,
      isActive: false,
      screenshotPath: "/tmp/state.png"
    });
  });

  it("throws useful errors when the helper exits non-zero", async () => {
    const { client } = createClientWithResponses([
      {
        stdout: "",
        stderr: "Accessibility permission denied",
        exitCode: 13
      }
    ]);

    await expect(client.click(1, 2)).rejects.toThrow(
      "Desktop helper command failed (click) with exit code 13: Accessibility permission denied"
    );
  });

  it("throws useful errors from helper error envelopes", async () => {
    const { client } = createClientWithResponses([
      {
        stdout: JSON.stringify({
          ok: false,
          command: "click",
          error: {
            code: "accessibility_permission_required",
            message: "Accessibility permission is required for this action."
          }
        }),
        stderr: "",
        exitCode: 1
      }
    ]);

    await expect(client.click(1, 2)).rejects.toThrow(
      "Desktop helper command failed (click) with exit code 1: Accessibility permission is required for this action."
    );
  });

  it("throws useful errors for invalid JSON responses", async () => {
    const { client } = createClientWithResponses([
      {
        stdout: "not-json",
        stderr: "",
        exitCode: 0
      }
    ]);

    await expect(client.listApps()).rejects.toThrow(
      "Desktop helper returned invalid JSON for list-apps: not-json"
    );
  });

  it("rejects invalid action inputs before invoking the helper", async () => {
    const { calls, client } = createClientWithResponses([]);

    await expect(client.executeAction({ type: "click", x: Number.NaN, y: 1 })).rejects.toThrow(
      "x must be a finite number"
    );
    await expect(client.executeAction({ type: "type_text", text: "" })).rejects.toThrow(
      "text must be a non-empty string"
    );
    await expect(client.executeAction({ type: "screenshot", outputPath: "" })).rejects.toThrow(
      "outputPath must be a non-empty string"
    );
    await expect(
      client.executeAction({ type: "activate_app", bundleId: "" })
    ).rejects.toThrow("bundleId must be a non-empty string");
    await expect(client.executeAction({ type: "press_key", key: "" })).rejects.toThrow(
      "key must be a non-empty string"
    );
    await expect(
      client.executeAction({
        type: "observe_app",
        bundleId: "com.mitchellh.ghostty",
        screenshotOutputPath: ""
      })
    ).rejects.toThrow("screenshotOutputPath must be a non-empty string");
    await expect(client.executeAction({ type: "drag" } as never)).rejects.toThrow(
      "Unsupported desktop action type: drag"
    );

    expect(calls).toEqual([]);
  });

  it("rejects invalid legacy helper method inputs before invoking the helper", async () => {
    const { calls, client } = createClientWithResponses([]);

    await expect(client.click(Number.POSITIVE_INFINITY, 1)).rejects.toThrow(
      "x must be a finite number"
    );
    await expect(client.typeText("")).rejects.toThrow("text must be a non-empty string");
    await expect(client.pressKey("")).rejects.toThrow("key must be a non-empty string");
    await expect(client.activateApp("")).rejects.toThrow("bundleId must be a non-empty string");
    await expect(client.screenshot("")).rejects.toThrow(
      "outputPath must be a non-empty string"
    );
    await expect(client.getAppState("com.mitchellh.ghostty", "")).rejects.toThrow(
      "screenshotOutputPath must be a non-empty string"
    );
    await expect(client.selectInputSource("")).rejects.toThrow(
      "sourceId must be a non-empty string"
    );
    await expect(client.pressShortcut("", ["control"])).rejects.toThrow(
      "key must be a non-empty string"
    );
    await expect(client.pressShortcut("space", [])).rejects.toThrow(
      "modifiers must include at least one modifier"
    );
    await expect(client.pressShortcut("space", ["control", ""])).rejects.toThrow(
      "modifier must be a non-empty string"
    );

    expect(calls).toEqual([]);
  });
});
