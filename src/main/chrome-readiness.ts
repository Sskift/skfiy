import {
  readChromeApprovalPolicyHost
} from "./chrome-approval-policy.js";
import {
  readChromeHostPolicyState,
  type ChromeHostPolicyIo
} from "./chrome-host-policy.js";
import {
  CHROME_NATIVE_HOST_NAME,
  createChromeExtensionConnectionStatePath,
  createChromeNativeHostInstallPlan,
  readChromeExtensionConnectionStatus,
  readChromeNativeHostStatus,
  type ChromeNativeHostIo
} from "./chrome-native-host.js";

export interface ChromeReadinessDiagnosticsInput {
  homeDir: string;
  cliShimPath: string;
  extensionIds: string[];
  approvalProbeCommand?: string;
  generatedAt?: string;
  io?: ChromeNativeHostIo & ChromeHostPolicyIo;
}

export interface ChromeReadinessDiagnostics {
  schemaVersion: 1;
  state: "ready" | "needs_setup" | "blocked";
  generatedAt: string;
  nativeHost: {
    hostName: typeof CHROME_NATIVE_HOST_NAME;
    state: "installed" | "missing" | "mismatched" | "cli-missing" | "invalid";
    manifestPath: string;
    cliShimPath: string;
    allowedOrigins: string[];
    reason: string;
  };
  extensionManifest: {
    state: "planned";
    manifestVersion: 3;
    hostName: typeof CHROME_NATIVE_HOST_NAME;
    allowedOrigins: string[];
    nativeMessaging: true;
    optionalHostPermissions: ["http://*/*", "https://*/*"];
  };
  hostPolicy: {
    schemaVersion: 1;
    state: "default" | "configured" | "invalid";
    path: string;
    defaultMode: "ask";
    entryCount: number;
    reason?: string;
  };
  approvalPolicy: {
    state: "ready" | "no_probe";
    host?: string;
    defaultAction: "allow_current_turn_after_user_approval";
    failClosed: true;
  };
  liveConnection: {
    state: "connected" | "stale" | "unknown" | "invalid";
    liveConnection: "connected" | "stale" | "unknown";
    path: string;
    reason?: string;
    ageSeconds?: number;
    launchOrigin?: string;
    messageType?: string;
    requestId?: string;
  };
}

export async function createChromeReadinessDiagnostics({
  homeDir,
  cliShimPath,
  extensionIds,
  approvalProbeCommand,
  generatedAt = new Date().toISOString(),
  io
}: ChromeReadinessDiagnosticsInput): Promise<ChromeReadinessDiagnostics> {
  const nativeHost = await readChromeNativeHostStatus({
    homeDir,
    cliShimPath,
    extensionIds,
    io
  });
  const hostPolicyState = await readChromeHostPolicyState({
    homeDir,
    io
  });
  const liveConnection = await readChromeExtensionConnectionStatus({
    homeDir,
    generatedAt,
    io
  });
  const installPlan = createChromeNativeHostInstallPlan({
    homeDir,
    cliShimPath,
    extensionIds
  });
  const approvalHost = approvalProbeCommand
    ? readChromeApprovalPolicyHost(approvalProbeCommand)
    : undefined;
  const hostPolicyEntryCount = hostPolicyState.policy.allowedHosts.length
    + hostPolicyState.policy.currentTurnAllowedHosts.length
    + hostPolicyState.policy.blockedHosts.length;
  const state = nativeHost.state === "installed" && hostPolicyState.state !== "invalid"
    ? "ready"
    : hostPolicyState.state === "invalid" || nativeHost.state === "invalid"
      ? "blocked"
      : "needs_setup";

  return {
    schemaVersion: 1,
    state,
    generatedAt,
    nativeHost: {
      hostName: nativeHost.hostName,
      state: nativeHost.state,
      manifestPath: nativeHost.manifestPath,
      cliShimPath: nativeHost.cliShimPath,
      allowedOrigins: nativeHost.allowedOrigins,
      reason: nativeHost.reason
    },
    extensionManifest: {
      state: "planned",
      manifestVersion: 3,
      hostName: installPlan.hostName,
      allowedOrigins: installPlan.manifest.allowed_origins,
      nativeMessaging: true,
      optionalHostPermissions: ["http://*/*", "https://*/*"]
    },
    hostPolicy: {
      schemaVersion: hostPolicyState.schemaVersion,
      state: hostPolicyState.state,
      path: hostPolicyState.path,
      defaultMode: hostPolicyState.policy.defaultMode,
      entryCount: hostPolicyEntryCount,
      ...(hostPolicyState.reason ? { reason: hostPolicyState.reason } : {})
    },
    approvalPolicy: {
      state: approvalHost ? "ready" : "no_probe",
      ...(approvalHost ? { host: approvalHost } : {}),
      defaultAction: "allow_current_turn_after_user_approval",
      failClosed: true
    },
    liveConnection: {
      state: liveConnection.state,
      liveConnection: liveConnection.liveConnection,
      path: liveConnection.path,
      ...(liveConnection.reason ? { reason: liveConnection.reason } : {}),
      ...(typeof liveConnection.ageSeconds === "number" ? { ageSeconds: liveConnection.ageSeconds } : {}),
      ...(liveConnection.launchOrigin ? { launchOrigin: liveConnection.launchOrigin } : {}),
      ...(liveConnection.messageType ? { messageType: liveConnection.messageType } : {}),
      ...(liveConnection.requestId ? { requestId: liveConnection.requestId } : {})
    }
  };
}

export function createChromeReadinessConnectionPath(homeDir: string): string {
  return createChromeExtensionConnectionStatePath(homeDir);
}
