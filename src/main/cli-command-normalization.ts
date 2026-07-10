import path from "node:path";
import {
  createDefaultChromeHostPolicy,
  decideChromeHostPolicy,
  type ChromeHostPolicyAction
} from "./chrome-host-policy.js";
import type { ChromeExtensionPageControlInput } from "./chrome-extension-page-control.js";
import {
  LOCAL_ORIGIN_PET_SKIN_DISPLAY_NAME,
  LOCAL_ORIGIN_PET_SKIN_SLUG
} from "./pet-skin.js";
import {
  createSmokeScriptArgs,
  createSmokeScriptPath,
  isSmokeTarget,
  type SmokeTarget
} from "./cli-smoke-command.js";

export const PERMISSION_SETTINGS_TARGETS = [
  "screen-recording",
  "accessibility",
  "automation-finder"
] as const;

export type PermissionSettingsTarget = typeof PERMISSION_SETTINGS_TARGETS[number];
export type DashboardProbeSubcommand = "status" | "snapshot";
export type ChromeSubcommand =
  | "status"
  | "extension-info"
  | "tabs"
  | "observe"
  | "screenshot"
  | "click"
  | "fill"
  | "submit"
  | "scroll"
  | "reload-extension"
  | "install-host"
  | "uninstall-host";
type ChromePageControlSubcommand = ChromeExtensionPageControlInput["action"];
export type ChromePolicySubcommand = "show" | "set" | "reset";
export type SkinSubcommand = "import";
export type McpTransport = "stdio";

export interface NormalizeCliCommandOptions {
  rootDir?: string;
}

export type CliCommandInvocation =
  | {
      kind: "commands";
      path: "commands" | "help";
      json: boolean;
      options: Record<string, never>;
    }
  | {
      kind: "status";
      path: "status";
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        dashboardUrl?: string;
      };
    }
  | {
      kind: "doctor";
      path: "doctor";
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        dashboardUrl?: string;
      };
    }
  | {
      kind: "operator-status";
      path: "operator status";
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        dashboardUrl?: string;
        requireReady: boolean;
      };
    }
  | {
      kind: "dashboard";
      path: "dashboard";
      json: boolean;
      options: {
        noOpen: boolean;
        port: number;
      };
    }
  | {
      kind: "dashboard-probe";
      path: `dashboard ${DashboardProbeSubcommand}`;
      subcommand: DashboardProbeSubcommand;
      json: boolean;
      options: {
        url: string;
      };
    }
  | {
      kind: "permissions-open";
      path: `permissions open ${PermissionSettingsTarget}`;
      target: PermissionSettingsTarget;
      json: boolean;
    }
  | {
      kind: "chrome";
      path: `chrome ${ChromeSubcommand}`;
      subcommand: ChromeSubcommand;
      json: boolean;
      options: {
        extensionIds: string[];
        cliShimPath: string;
        targetTabId?: number;
        selector?: string;
        text?: string;
        dy?: number;
      };
    }
  | {
      kind: "chrome-policy";
      path: `chrome policy ${ChromePolicySubcommand}`;
      subcommand: ChromePolicySubcommand;
      json: boolean;
      options: {
        host?: string;
        action?: ChromeHostPolicyAction;
      };
    }
  | {
      kind: "skin-import";
      path: `skin ${SkinSubcommand}`;
      subcommand: SkinSubcommand;
      json: boolean;
      options: {
        sourcePath: string;
        slug: string;
        displayName: string;
        licenseSource: string;
      };
    }
  | {
      kind: "mcp-serve";
      path: "mcp serve";
      json: boolean;
      options: {
        transport: McpTransport;
      };
    }
  | {
      kind: "smoke";
      path: `smoke ${SmokeTarget}`;
      target: SmokeTarget;
      json: boolean;
      outputPath: string;
      options: {
        requirePassed: boolean;
        scriptPath: string;
        scriptArgs: string[];
      };
    }
  | {
      kind: "release-check";
      path: "release check";
      json: boolean;
      jsonOutputPath: string;
      options: Record<string, never>;
    }
  | {
      kind: "alpha-artifact";
      path: "alpha artifact";
      json: boolean;
      options: Record<string, never>;
    };

export type NormalizeCliCommandResult =
  | {
      ok: true;
      invocation: CliCommandInvocation;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export function normalizeCliCommand(
  argv: string[],
  options: NormalizeCliCommandOptions = {}
): NormalizeCliCommandResult {
  const rootDir = options.rootDir ?? process.cwd();
  const command = argv[0];

  if (command === "commands" || command === "help" || command === "--help" || command === "-h") {
    return ok({
      kind: "commands",
      path: command === "help" || command === "--help" || command === "-h" ? "help" : "commands",
      json: argv.includes("--json"),
      options: {}
    });
  }

  if (command === "status") {
    return ok({
      kind: "status",
      path: "status",
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        dashboardUrl: readOptionValue(argv, "--dashboard-url")
      }
    });
  }

  if (command === "doctor") {
    return ok({
      kind: "doctor",
      path: "doctor",
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        dashboardUrl: readOptionValue(argv, "--dashboard-url")
      }
    });
  }

  if (command === "operator") {
    const subcommand = argv[1];

    if (subcommand !== "status") {
      return error(
        "unknown-operator-subcommand",
        `Unknown operator subcommand: ${subcommand ?? ""}`
      );
    }

    return ok({
      kind: "operator-status",
      path: "operator status",
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        dashboardUrl: readOptionValue(argv, "--dashboard-url"),
        requireReady: argv.includes("--require-ready")
      }
    });
  }

  if (command === "dashboard") {
    const subcommand = argv[1];
    if (isDashboardProbeSubcommand(subcommand)) {
      const url = readOptionValue(argv, "--url") ?? readOptionValue(argv, "--dashboard-url");

      if (!url || url.startsWith("--")) {
        return error(
          "missing-dashboard-url",
          `Dashboard ${subcommand} requires --url <url>.`
        );
      }

      return ok({
        kind: "dashboard-probe",
        path: `dashboard ${subcommand}`,
        subcommand,
        json: argv.includes("--json"),
        options: {
          url
        }
      });
    }

    if (subcommand && !subcommand.startsWith("--")) {
      return error(
        "unknown-dashboard-subcommand",
        `Unknown dashboard subcommand: ${subcommand}`
      );
    }

    const port = readNumberOption(argv, "--port", 0);

    return ok({
      kind: "dashboard",
      path: "dashboard",
      json: argv.includes("--json"),
      options: {
        noOpen: argv.includes("--no-open"),
        port
      }
    });
  }

  if (command === "permissions") {
    const subcommand = argv[1];
    const target = argv[2];

    if (subcommand !== "open") {
      return error(
        "unknown-permissions-subcommand",
        `Unknown permissions subcommand: ${subcommand ?? ""}`
      );
    }
    if (!isPermissionSettingsTarget(target)) {
      return error(
        "unknown-permission-settings-target",
        `Unknown permission settings target: ${target ?? ""}`
      );
    }

    return ok({
      kind: "permissions-open",
      path: `permissions open ${target}`,
      target,
      json: argv.includes("--json")
    });
  }

  if (command === "chrome") {
    const subcommand = argv[1];

    if (subcommand === "policy") {
      const policySubcommand = argv[2];

      if (!isChromePolicySubcommand(policySubcommand)) {
        return error(
          "unknown-chrome-policy-subcommand",
          `Unknown chrome policy subcommand: ${policySubcommand ?? ""}`
        );
      }

      if (policySubcommand === "set") {
        const host = readOptionValue(argv, "--host");
        const actionValue = readOptionValue(argv, "--action");
        const action = normalizeChromePolicySetAction(actionValue);

        if (!host || host.startsWith("--")) {
          return error(
            "missing-chrome-policy-host",
            "Chrome policy set requires --host <host>."
          );
        }
        if (!action) {
          return error(
            "unknown-chrome-policy-action",
            `Unknown chrome policy action: ${actionValue ?? ""}`
          );
        }

        return ok({
          kind: "chrome-policy",
          path: "chrome policy set",
          subcommand: policySubcommand,
          json: argv.includes("--json"),
          options: {
            host,
            action
          }
        });
      }

      return ok({
        kind: "chrome-policy",
        path: `chrome policy ${policySubcommand}`,
        subcommand: policySubcommand,
        json: argv.includes("--json"),
        options: {}
      });
    }

    if (!isChromeSubcommand(subcommand)) {
      return error(
        "unknown-chrome-subcommand",
        `Unknown chrome subcommand: ${subcommand ?? ""}`
      );
    }

    const selector = readOptionValue(argv, "--selector");
    const text = readOptionValue(argv, "--text");
    const dyValue = readOptionValue(argv, "--dy");
    let dy: number | undefined;

    if ((subcommand === "click" || subcommand === "fill" || subcommand === "submit")
      && (!selector || selector.startsWith("--"))) {
      return error(
        "missing-chrome-action-selector",
        `Chrome ${subcommand} requires --selector <css>.`
      );
    }
    if (subcommand === "fill" && (text === undefined || text.startsWith("--"))) {
      return error(
        "missing-chrome-action-text",
        "Chrome fill requires --text <text>."
      );
    }
    if (subcommand === "scroll") {
      if (dyValue === undefined || dyValue.startsWith("--")) {
        return error(
          "missing-chrome-action-dy",
          "Chrome scroll requires --dy <pixels>."
        );
      }
      dy = Number(dyValue);
      if (!Number.isFinite(dy)) {
        return error(
          "invalid-chrome-action-dy",
          `Chrome scroll --dy must be a number: ${dyValue}`
        );
      }
    }

    return ok({
      kind: "chrome",
      path: `chrome ${subcommand}`,
      subcommand,
      json: argv.includes("--json"),
      options: {
        extensionIds: readRepeatedOptionValues(argv, "--extension-id"),
        cliShimPath: resolveOptionPath(argv, "--cli", rootDir, path.join(rootDir, "dist", "skfiy")),
        targetTabId: readOptionalNumberOption(argv, "--target-tab-id"),
        ...(selector !== undefined ? { selector } : {}),
        ...(text !== undefined ? { text } : {}),
        ...(dy !== undefined ? { dy } : {})
      }
    });
  }

  if (command === "skin") {
    const subcommand = argv[1];

    if (!isSkinSubcommand(subcommand)) {
      return error("unknown-skin-subcommand", `Unknown skin subcommand: ${subcommand ?? ""}`);
    }

    const sourceValue = readOptionValue(argv, "--source");
    if (!sourceValue || sourceValue.startsWith("--")) {
      return error("missing-skin-source", "Skin import requires --source <image-or-atlas>.");
    }

    return ok({
      kind: "skin-import",
      path: "skin import",
      subcommand,
      json: argv.includes("--json"),
      options: {
        sourcePath: path.isAbsolute(sourceValue) ? sourceValue : path.resolve(rootDir, sourceValue),
        slug: readOptionValue(argv, "--slug") ?? LOCAL_ORIGIN_PET_SKIN_SLUG,
        displayName:
          readOptionValue(argv, "--display-name") ?? LOCAL_ORIGIN_PET_SKIN_DISPLAY_NAME,
        licenseSource: readOptionValue(argv, "--license-source") ?? "local-user-provided"
      }
    });
  }

  if (command === "mcp") {
    const subcommand = argv[1];

    if (subcommand !== "serve") {
      return error("unknown-mcp-subcommand", `Unknown mcp subcommand: ${subcommand ?? ""}`);
    }
    if (!argv.includes("--stdio")) {
      return error("missing-mcp-transport", "MCP serve requires --stdio.");
    }

    return ok({
      kind: "mcp-serve",
      path: "mcp serve",
      json: argv.includes("--json"),
      options: {
        transport: "stdio"
      }
    });
  }

  if (command === "smoke") {
    const target = argv[1];

    if (!isSmokeTarget(target)) {
      return error("unknown-smoke-target", `Unknown smoke target: ${target ?? ""}`);
    }
    const smokeArgv = argv.slice(2);

    return ok({
      kind: "smoke",
      path: `smoke ${target}`,
      target,
      json: argv.includes("--json"),
      outputPath: resolveOptionPath(smokeArgv, "--output", rootDir, ""),
      options: {
        requirePassed: smokeArgv.includes("--require-passed"),
        scriptPath: createSmokeScriptPath(target, rootDir),
        scriptArgs: createSmokeScriptArgs(target, smokeArgv, rootDir)
      }
    });
  }

  if (command === "release" && argv[1] === "check") {
    return ok({
      kind: "release-check",
      path: "release check",
      json: argv.includes("--json"),
      jsonOutputPath: resolveOptionPath(argv, "--json-output", rootDir, ""),
      options: {}
    });
  }

  if (command === "alpha" && argv[1] === "artifact") {
    return ok({
      kind: "alpha-artifact",
      path: "alpha artifact",
      json: argv.includes("--json"),
      options: {}
    });
  }

  return error("unknown-command", `Unknown command: ${command ?? ""}`);
}

export function isChromePageControlSubcommand(
  value: ChromeSubcommand
): value is ChromePageControlSubcommand {
  return value === "observe"
    || value === "screenshot"
    || value === "click"
    || value === "fill"
    || value === "submit"
    || value === "scroll";
}

export function normalizeChromePolicyHostForCli(value: string | undefined): string | undefined {
  const decision = decideChromeHostPolicy(createDefaultChromeHostPolicy(), value);

  return decision.host || undefined;
}

function ok(invocation: CliCommandInvocation): NormalizeCliCommandResult {
  return {
    ok: true,
    invocation
  };
}

function error(code: string, message: string): NormalizeCliCommandResult {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function isChromeSubcommand(value: string | undefined): value is ChromeSubcommand {
  return value === "status"
    || value === "extension-info"
    || value === "tabs"
    || value === "observe"
    || value === "screenshot"
    || value === "click"
    || value === "fill"
    || value === "submit"
    || value === "scroll"
    || value === "reload-extension"
    || value === "install-host"
    || value === "uninstall-host";
}

function isDashboardProbeSubcommand(value: string | undefined): value is DashboardProbeSubcommand {
  return value === "status" || value === "snapshot";
}

function isChromePolicySubcommand(value: string | undefined): value is ChromePolicySubcommand {
  return value === "show" || value === "set" || value === "reset";
}

function isSkinSubcommand(value: string | undefined): value is SkinSubcommand {
  return value === "import";
}

function normalizeChromePolicySetAction(value: string | undefined): ChromeHostPolicyAction | undefined {
  if (value === "always-allow" || value === "always_allow") {
    return "always_allow";
  }
  if (
    value === "allow-current-turn"
    || value === "allow_current_turn"
    || value === "current-turn"
  ) {
    return "allow_current_turn";
  }
  if (value === "block" || value === "block-host" || value === "block_host") {
    return "block_host";
  }
  if (value === "ask" || value === "ask-host" || value === "ask_host") {
    return "ask_host";
  }

  return undefined;
}

function isPermissionSettingsTarget(value: string | undefined): value is PermissionSettingsTarget {
  return PERMISSION_SETTINGS_TARGETS.includes(value as PermissionSettingsTarget);
}

function readNumberOption(argv: string[], name: string, fallback: number): number {
  const value = readOptionValue(argv, name);

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid numeric option ${name}: ${value}`);
  }

  return parsed;
}

function readOptionalNumberOption(argv: string[], name: string): number | undefined {
  const value = readOptionValue(argv, name);

  if (value === undefined) {
    return undefined;
  }

  return readNumberOption(argv, name, 0);
}

function resolveOptionPath(
  argv: string[],
  name: string,
  rootDir: string,
  fallback: string
): string {
  const value = readOptionValue(argv, name);

  if (value === undefined || value === "") {
    return fallback;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(rootDir, value);
}

function readOptionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function readRepeatedOptionValues(argv: string[], name: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }

  return values;
}
