import {
  SMOKE_TARGETS
} from "./cli-smoke-command.js";

export const CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY = "chrome-extension-page-safety";
export const CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY = "chrome-extension-page-control";

export interface CliCommandDefinition {
  path: string;
  summary: string;
  jsonOutput: boolean;
  plannedMutation: boolean;
  executesSystemMutation: boolean;
  outputShape: string;
  capabilities?: string[];
}

export interface CliCommandSurface {
  schemaVersion: 1;
  commands: CliCommandDefinition[];
}

const SMOKE_COMMANDS: CliCommandDefinition[] = SMOKE_TARGETS.map((target) => ({
  path: `smoke ${target}`,
  summary: `Run the ${target} smoke target and output artifact.`,
  jsonOutput: true,
  plannedMutation: true,
  executesSystemMutation: true,
  outputShape: "smoke"
}));

const COMMANDS: CliCommandDefinition[] = [
  {
    path: "commands",
    summary: "List the packaged skfiy CLI command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "command-surface"
  },
  {
    path: "help",
    summary: "Alias for commands; prints the CLI command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "command-surface"
  },
  {
    path: "status",
    summary: "Report app, helper, permissions, desktop-session, extension, and dashboard status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "status",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "doctor",
    summary: "Return actionable permission and packaging diagnostics.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "doctor",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "operator status",
    summary: "Return a compact read-only readiness summary for operator supervisors.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "operator-status",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "dashboard",
    summary: "Describe the local loopback dashboard command surface.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard"
  },
  {
    path: "dashboard status",
    summary: "Fetch descriptor, snapshot status, and operator readiness from a running dashboard.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard-status"
  },
  {
    path: "dashboard snapshot",
    summary: "Fetch the full snapshot JSON from a running dashboard.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "dashboard-snapshot"
  },
  {
    path: "permissions open <screen-recording|accessibility|automation-finder>",
    summary: "Open the matching macOS Privacy & Security permission settings panel.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "permission-settings-open"
  },
  {
    path: "chrome status",
    summary: "Report Chrome extension and native host status.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "chrome-status",
    capabilities: [CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY, CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome extension-info",
    summary: "Print local unpacked Chrome extension setup info and follow-up commands.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "chrome-extension-info",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome tabs",
    summary: "List Chrome tabs visible to the skfiy extension with page-control eligibility blockers.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-tabs",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome observe",
    summary: "Observe the requested Chrome tab through the installed skfiy extension page-control bridge.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-page-observe",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome screenshot",
    summary: "Capture the requested Chrome tab through the installed skfiy extension page-control bridge.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-page-screenshot",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome click",
    summary: "Click a CSS selector in the requested Chrome tab through the installed skfiy extension page-control bridge.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-page-action",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome fill",
    summary: "Fill a CSS selector in the requested Chrome tab through the installed skfiy extension page-control bridge.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-page-action",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome submit",
    summary: "Submit a CSS selector in the requested Chrome tab through the installed skfiy extension page-control bridge.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-page-action",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome scroll",
    summary: "Scroll the requested Chrome tab through the installed skfiy extension page-control bridge.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-page-action",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome reload-extension",
    summary: "Open chrome://extensions and click the unpacked extension reload control through desktop Computer Use.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-extension-reload",
    capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
  },
  {
    path: "chrome policy show",
    summary: "Show the user-level Chrome host policy state.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "chrome-host-policy"
  },
  {
    path: "chrome policy set",
    summary: "Set a Chrome host policy entry for one host.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-policy"
  },
  {
    path: "chrome policy reset",
    summary: "Reset the user-level Chrome host policy state to ask by default.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-policy"
  },
  {
    path: "chrome install-host",
    summary: "Install the Chrome Native Messaging host for the current skfiy CLI.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-plan"
  },
  {
    path: "chrome uninstall-host",
    summary: "Uninstall the Chrome Native Messaging host manifest.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "chrome-host-plan"
  },
  {
    path: "skin import",
    summary: "Import local licensed pet art into the user skin directory.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: true,
    outputShape: "pet-skin-import"
  },
  {
    path: "mcp serve",
    summary: "Serve skfiy status and Computer Use tools over MCP stdio for Codex plugins.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "mcp-server"
  },
  ...SMOKE_COMMANDS,
  {
    path: "release check",
    summary: "Plan release gate checks and a JSON output artifact.",
    jsonOutput: true,
    plannedMutation: false,
    executesSystemMutation: false,
    outputShape: "release-check"
  },
  {
    path: "alpha artifact",
    summary: "Plan alpha artifact creation without mutating the system.",
    jsonOutput: true,
    plannedMutation: true,
    executesSystemMutation: false,
    outputShape: "alpha-artifact"
  }
];

export function createCliCommandSurface(): CliCommandSurface {
  return {
    schemaVersion: 1,
    commands: COMMANDS.map((command) => ({ ...command }))
  };
}
