import { createChromeHostPolicyStatePath } from "./chrome-host-policy.js";
import {
  createChromePageControlCapability,
  createChromePageControlNextAction,
  createChromePageSafetyCapability
} from "./cli-chrome-capabilities.js";
import { createDashboardApiUrl } from "./cli-dashboard-probe-output.js";
import {
  createFinderAutomationPermissionDiagnosticMessage,
  createFinderAutomationState,
  createFinderDesktopPreflightDiagnosticMessage,
  createFinderSmokeRerunAction,
  isFinderSmokeDesktopPreflightBlocked,
  readLatestFinderSmokeEvidence,
  withFinderSmokeStatus
} from "./cli-finder-smoke-status.js";
import {
  readRecord,
  readString
} from "./cli-record-utils.js";
import {
  createCliStatusReadinessSummary,
  withChromePageCapabilityStatus,
  withStatusReadiness
} from "./cli-status-capabilities.js";

export interface CliDoctorStatusInput {
  rootDir: string;
  homeDir: string;
  appPath: string;
  helperPath: string;
  cliShimPath: string;
  extensionIds: string[];
  dashboardUrl?: string;
}

export interface CliDoctorSignatureStatus {
  state: "valid" | "invalid" | "unknown";
  reason?: string;
}

export function createDoctorOutput({
  status,
  signature,
  statusInput
}: {
  status: Record<string, unknown>;
  signature: CliDoctorSignatureStatus;
  statusInput: CliDoctorStatusInput;
}): Record<string, unknown> {
  const statusWithCapabilities = withFinderSmokeStatus(
    withChromePageCapabilityStatus(status, statusInput),
    statusInput
  );
  const diagnostics: Array<Record<string, unknown>> = [];
  const nextActions: string[] = [];
  const addDiagnostic = ({
    code,
    severity,
    message,
    nextAction,
    details
  }: {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    nextAction?: string;
    details?: Record<string, unknown>;
  }) => {
    diagnostics.push({
      code,
      severity,
      message,
      ...(details ? { details } : {}),
      ...(nextAction ? { nextAction } : {})
    });

    if (nextAction && !nextActions.includes(nextAction)) {
      nextActions.push(nextAction);
    }
  };
  const app = readRecord(statusWithCapabilities.app);
  const cli = readRecord(statusWithCapabilities.cli);
  const helper = readRecord(statusWithCapabilities.helper);
  const permissions = readRecord(statusWithCapabilities.permissions);
  const desktopSession = readRecord(statusWithCapabilities.desktopSession);
  const extension = readRecord(statusWithCapabilities.extension);
  const nativeHost = readRecord(statusWithCapabilities.nativeHost);
  const dashboard = readRecord(statusWithCapabilities.dashboard);
  const finder = readRecord(statusWithCapabilities.finder);
  const latestFinderSmoke = readRecord(finder?.latestSmoke) ?? readLatestFinderSmokeEvidence(statusInput.rootDir);
  const finderAutomation = readRecord(finder?.automation);
  const finderAutomationState =
    readString(finderAutomation?.state)
    ?? createFinderAutomationState(readString(permissions?.finderAutomation), latestFinderSmoke);
  const pageSafety = readRecord(extension?.pageSafety);
  const pageControl = readRecord(extension?.pageControl);
  const hostPolicy = readRecord(extension?.hostPolicy) ?? {
    state: statusInput.homeDir ? "unknown" : "not-probed",
    path: statusInput.homeDir ? createChromeHostPolicyStatePath(statusInput.homeDir) : undefined,
    reason: statusInput.homeDir
      ? "Chrome host policy was not included in status output."
      : "Home directory is required to locate the Chrome host policy file."
  };
  const dashboardApi = readRecord(readRecord(dashboard?.api)?.chromeHostPolicy) ?? {
    state: statusInput.dashboardUrl ? "unknown" : "not-probed",
    url: createDashboardApiUrl(statusInput.dashboardUrl),
    reason: statusInput.dashboardUrl
      ? "Dashboard Chrome host policy API was not included in status output."
      : "Pass --dashboard-url <url> to probe dashboard API reachability."
  };

  if (app?.state !== "installed") {
    addDiagnostic({
      code: "app-missing",
      severity: "error",
      message: `skfiy.app is missing at ${statusInput.appPath}.`,
      nextAction: "Run `npm run build` to create dist/skfiy.app and the CLI shim."
    });
  }

  if (cli?.state === "missing") {
    addDiagnostic({
      code: "cli-binary-missing",
      severity: "error",
      message: `Packaged skfiy CLI is missing at ${statusInput.cliShimPath}.`,
      nextAction: "Run `npm run build` so dist/skfiy exists before product smoke or dogfood runs."
    });
  }

  if (helper?.state !== "installed" || helper?.path !== statusInput.helperPath) {
    addDiagnostic({
      code: "helper-location",
      severity: "error",
      message: "skfiy-helper must be embedded beside the app executable for product-path TCC attribution.",
      nextAction: "Run `npm run build` so skfiy-helper is embedded at dist/skfiy.app/Contents/MacOS/skfiy-helper.",
      details: {
        expectedHelperPath: statusInput.helperPath,
        actualHelperPath: helper?.path
      }
    });
  }

  if (signature.state !== "valid") {
    addDiagnostic({
      code: "code-signature",
      severity: "warning",
      message: signature.reason ?? "skfiy.app code signature could not be verified.",
      nextAction: "Run `npm run release:mac:check` to inspect signing/notarization readiness."
    });
  }

  if (permissions?.screenRecording !== "granted") {
    addDiagnostic({
      code: "screen-recording-permission",
      severity: "error",
      message: "Screen Recording is required for Computer Use observation.",
      nextAction: "Open System Settings > Privacy & Security > Screen Recording and grant skfiy."
    });
  }

  if (permissions?.accessibility !== "granted") {
    addDiagnostic({
      code: "accessibility-permission",
      severity: "error",
      message: "Accessibility is required for Computer Use clicks, typing, scrolling, and drag actions.",
      nextAction: "Open System Settings > Privacy & Security > Accessibility and grant skfiy."
    });
  }

  if (permissions?.finderAutomation !== "granted" && finderAutomationState !== "proven-by-smoke") {
    if (isFinderSmokeDesktopPreflightBlocked(latestFinderSmoke)) {
      addDiagnostic({
        code: "finder-automation-unproven",
        severity: "info",
        message: createFinderDesktopPreflightDiagnosticMessage(latestFinderSmoke),
        nextAction: readString(latestFinderSmoke.nextAction) ?? createFinderSmokeRerunAction(),
        details: {
          latestFinderSmoke
        }
      });
    } else if (readString(latestFinderSmoke.automationEvidence) === "blocked") {
      addDiagnostic({
        code: "finder-automation-permission",
        severity: "warning",
        message: createFinderAutomationPermissionDiagnosticMessage(latestFinderSmoke),
        nextAction: "Open System Settings > Privacy & Security > Automation and grant skfiy permission to control Finder, then rerun the Finder smoke.",
        details: {
          latestFinderSmoke
        }
      });
    } else {
      addDiagnostic({
        code: "finder-automation-unknown",
        severity: "info",
        message: "Finder Automation has not been proven from CLI status yet.",
        nextAction: "Run a Finder smoke once and grant Finder Automation when macOS prompts."
      });
    }
  }

  if (desktopSession?.state === "blocked" || desktopSession?.controllable === false) {
    addDiagnostic({
      code: "desktop-session-blocked",
      severity: "error",
      message: "The active desktop session is not controllable.",
      nextAction: "Wake and unlock the Mac, then rerun `skfiy status --json` before collecting Computer Use evidence.",
      details: {
        frontmostBundleId: desktopSession.frontmostBundleId,
        mainDisplayAsleep: desktopSession.mainDisplayAsleep
      }
    });
  }

  if (statusInput.extensionIds.length > 0 && nativeHost?.state !== "installed") {
    addDiagnostic({
      code: "chrome-native-host",
      severity: "warning",
      message: typeof nativeHost?.reason === "string"
        ? nativeHost.reason
        : "Chrome Native Messaging host is not installed for the requested extension.",
      nextAction:
        `Run \`skfiy chrome install-host --extension-id ${statusInput.extensionIds[0]}\` to install the Chrome Native Messaging host.`
    });
  }

  if (statusInput.dashboardUrl && dashboard?.state !== "running") {
    addDiagnostic({
      code: "dashboard-not-running",
      severity: "warning",
      message: "The provided dashboard URL is not serving a descriptor.",
      nextAction: "Start the dashboard with `skfiy dashboard --no-open --json` or pass the current dashboard URL."
    });
  }

  if (
    statusInput.dashboardUrl
    && dashboard?.state === "running"
    && dashboardApi.state !== "reachable"
  ) {
    addDiagnostic({
      code: "dashboard-api-unreachable",
      severity: "warning",
      message: "The dashboard is running, but its Chrome host policy API is not reachable.",
      nextAction: "Restart `skfiy dashboard --no-open --json` and rerun `skfiy doctor --json --dashboard-url <url>`.",
      details: {
        url: dashboardApi.url,
        state: dashboardApi.state,
        status: dashboardApi.status,
        reason: dashboardApi.reason
      }
    });
  }

  if (hostPolicy.state === "invalid") {
    addDiagnostic({
      code: "chrome-host-policy-invalid",
      severity: "warning",
      message: typeof hostPolicy.reason === "string"
        ? hostPolicy.reason
        : "Chrome host policy state is invalid.",
      nextAction: "Run `skfiy chrome policy reset` to return Chrome host policy to default ask mode.",
      details: {
        path: hostPolicy.path
      }
    });
  }

  if (pageControl?.state !== "ready") {
    addDiagnostic({
      code: "chrome-page-control-readiness",
      severity: pageControl?.state === "not-probed" ? "info" : "warning",
      message: readString(pageControl?.reason)
        ?? "Chrome extension page control readiness has not been proven.",
      nextAction: readString(pageControl?.nextAction)
        ?? createChromePageControlNextAction({
          state: readString(pageControl?.state) ?? "not-probed",
          extensionIds: statusInput.extensionIds
        }),
      details: {
        state: readString(pageControl?.state) ?? "not-probed",
        source: readString(pageControl?.source) ?? "not-probed"
      }
    });
  }

  const readiness = createCliStatusReadinessSummary(statusWithCapabilities, statusInput);

  return {
    result: diagnostics.length === 0 ? "ok" : "needs-action",
    capabilities: {
      chromeExtensionPageSafety: pageSafety?.capable === true,
      chromeExtensionPageControl: pageControl?.state === "ready"
    },
    readiness,
    preflight: {
      runtime: {
        appPath: statusInput.appPath,
        appState: app?.state ?? "unknown",
        helperPath: statusInput.helperPath,
        helperState: helper?.state ?? "unknown",
        cliPath: statusInput.cliShimPath,
        cliState: cli?.state ?? "unknown",
        signature
      },
      dashboard: {
        state: dashboard?.state ?? "unknown",
        url: statusInput.dashboardUrl,
        api: {
          chromeHostPolicy: dashboardApi
        }
      },
      chrome: {
        extensionIds: statusInput.extensionIds,
        extension: extension ?? { state: "unknown" },
        nativeHost: nativeHost ?? { state: "unknown" },
        hostPolicy,
        pageSafety: pageSafety ?? createChromePageSafetyCapability({
          extensionState: "unknown",
          nativeHostState: readString(nativeHost?.state) ?? "unknown",
          liveConnection: "unknown",
          extensionIds: statusInput.extensionIds,
          cliShimPath: statusInput.cliShimPath,
          hostPolicy
        }),
        pageControl: pageControl ?? createChromePageControlCapability({
          extensionState: "unknown",
          nativeHostState: readString(nativeHost?.state) ?? "unknown",
          liveConnection: "unknown",
          extensionIds: statusInput.extensionIds
        })
      },
      finder: {
        automation: finderAutomation ?? {
          state: finderAutomationState,
          permissionState: readString(permissions?.finderAutomation) ?? "unknown",
          evidence: readString(latestFinderSmoke.automationEvidence) ?? "unknown"
        },
        latestSmoke: latestFinderSmoke
      }
    },
    diagnostics,
    nextActions,
    status: withStatusReadiness(statusWithCapabilities, statusInput),
    signature
  };
}
