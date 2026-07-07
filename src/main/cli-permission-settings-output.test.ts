import { describe, expect, it } from "vitest";
import {
  createPermissionSettingsOpenOutput,
  createPermissionSettingsOpenUrl
} from "./cli-permission-settings-output";
import type { CliCommandInvocation } from "./cli-command-normalization";

function createInvocation(
  target: Extract<CliCommandInvocation, { kind: "permissions-open" }>["target"]
): Extract<CliCommandInvocation, { kind: "permissions-open" }> {
  return {
    kind: "permissions-open",
    path: `permissions open ${target}`,
    target,
    json: true
  };
}

describe("CLI permission settings output", () => {
  it("creates the System Settings URL for each permission target", () => {
    expect(createPermissionSettingsOpenUrl("screen-recording")).toBe(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
    expect(createPermissionSettingsOpenUrl("accessibility")).toBe(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    );
    expect(createPermissionSettingsOpenUrl("automation-finder")).toBe(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
    );
  });

  it("creates opened and error output with the same action plan", () => {
    const opened = createPermissionSettingsOpenOutput({
      invocation: createInvocation("accessibility"),
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "opened"
    });
    const errored = createPermissionSettingsOpenOutput({
      invocation: createInvocation("accessibility"),
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "error",
      error: "open failed"
    });

    expect(opened).toEqual({
      schemaVersion: 1,
      command: "permissions open",
      generatedAt: "2026-07-07T00:00:00.000Z",
      target: "accessibility",
      executesSystemMutation: true,
      result: "opened",
      systemSettings: {
        app: "System Settings",
        pane: "Privacy & Security",
        label: "Accessibility",
        anchor: "Privacy_Accessibility",
        url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
      },
      actionPlan: [
        {
          step: "open-system-settings",
          executor: "skfiy-cli",
          command: "open",
          args: ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"]
        },
        {
          step: "grant-permission",
          executor: "user",
          target: "accessibility",
          guidance: "Grant skfiy Accessibility access."
        }
      ]
    });
    expect(errored).toEqual({
      ...opened,
      result: "error",
      error: "open failed"
    });
  });
});
