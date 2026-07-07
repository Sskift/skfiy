import type {
  CliCommandInvocation,
  PermissionSettingsTarget
} from "./cli-command-normalization.js";

const SYSTEM_SETTINGS_PRIVACY_PANE_URL_PREFIX =
  "x-apple.systempreferences:com.apple.preference.security?";

const PERMISSION_SETTINGS_TARGET_DETAILS: Record<PermissionSettingsTarget, {
  label: string;
  anchor: string;
  guidance: string;
}> = {
  "screen-recording": {
    label: "Screen Recording",
    anchor: "Privacy_ScreenCapture",
    guidance: "Grant skfiy Screen Recording access."
  },
  accessibility: {
    label: "Accessibility",
    anchor: "Privacy_Accessibility",
    guidance: "Grant skfiy Accessibility access."
  },
  "automation-finder": {
    label: "Automation",
    anchor: "Privacy_Automation",
    guidance: "Grant skfiy permission to control Finder in Automation."
  }
};

export function createPermissionSettingsOpenUrl(target: PermissionSettingsTarget): string {
  return `${SYSTEM_SETTINGS_PRIVACY_PANE_URL_PREFIX}${PERMISSION_SETTINGS_TARGET_DETAILS[target].anchor}`;
}

export function createPermissionSettingsOpenOutput({
  invocation,
  generatedAt,
  result,
  error
}: {
  invocation: Extract<CliCommandInvocation, { kind: "permissions-open" }>;
  generatedAt: string;
  result: "not-run" | "opened" | "error";
  error?: string;
}): Record<string, unknown> {
  const targetDetails = PERMISSION_SETTINGS_TARGET_DETAILS[invocation.target];
  const url = createPermissionSettingsOpenUrl(invocation.target);

  return {
    schemaVersion: 1,
    command: "permissions open",
    generatedAt,
    target: invocation.target,
    executesSystemMutation: true,
    result,
    ...(error ? { error } : {}),
    systemSettings: {
      app: "System Settings",
      pane: "Privacy & Security",
      label: targetDetails.label,
      anchor: targetDetails.anchor,
      url
    },
    actionPlan: [
      {
        step: "open-system-settings",
        executor: "skfiy-cli",
        command: "open",
        args: [url]
      },
      {
        step: "grant-permission",
        executor: "user",
        target: invocation.target,
        guidance: targetDetails.guidance
      }
    ]
  };
}
