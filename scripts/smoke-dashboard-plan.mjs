import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const PRODUCT_PATH = "dist/skfiy -> skfiy dashboard -> loopback dashboard server";
export const DEFAULT_TIMEOUT_MS = 8_000;

export function createDefaultDashboardSmokeOptions(rootDir) {
  return {
    cliPath: path.join(rootDir, "dist", "skfiy"),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseDashboardSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--cli":
        options.cliPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readRequiredValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown dashboard smoke option: ${arg}`);
    }
  }

  return options;
}

export function classifyDashboardSmokeEvidence(evidence) {
  const cliOutput = evidence?.cliOutput;
  const descriptor = evidence?.descriptorResponse?.body;
  const snapshot = evidence?.snapshotResponse?.body;
  const shellBody = String(evidence?.shellResponse?.body ?? "");
  const outputBind = cliOutput?.bind;
  const descriptorBind = descriptor?.bind;
  const runtimeSnapshotCoverage = createRuntimeSnapshotCoverage(evidence);

  if (
    !evidence
    || evidence.runnerHasTmux
    || evidence.productPath !== PRODUCT_PATH
    || !isBuiltCliPath(evidence.cliPath)
    || !isDashboardCommand(evidence.command)
    || evidence.tokenLeakDetected
  ) {
    return "failed";
  }

  if (
    cliOutput?.command !== "dashboard"
    || cliOutput?.result !== "running"
    || cliOutput?.shouldOpen !== false
    || cliOutput?.tokenPrinted !== false
    || !hasDashboardLauncherContract(cliOutput)
    || !hasDashboardServerStatePath(cliOutput?.statePath)
    || !isLoopbackBind(outputBind)
    || !isMatchingDashboardUrl(cliOutput?.url, outputBind)
  ) {
    return "failed";
  }

  if (
    evidence.descriptorResponse?.status !== 200
    || descriptor?.auth?.tokenPrinted !== false
    || !isLoopbackBind(descriptorBind)
    || !sameBind(outputBind, descriptorBind)
    || descriptor?.url !== cliOutput.url
  ) {
    return "failed";
  }

  if (
    evidence.snapshotResponse?.status !== 200
    || snapshot?.schemaVersion !== 1
    || snapshot?.runtimeHealth?.package?.name !== "skfiy"
    || typeof snapshot?.runtimeHealth?.package?.version !== "string"
    || snapshot?.runtimeHealth?.app?.state !== "installed"
    || snapshot?.runtimeHealth?.app?.signing?.state !== "valid"
    || snapshot?.runtimeHealth?.cli?.state !== "installed"
    || !hasNativeHostEvidence(snapshot?.runtimeHealth?.nativeHost)
    || !hasExtensionAdapterEvidence(snapshot?.runtimeHealth?.extension)
    || !hasRuntimeSnapshotEvidence(
      snapshot?.runtimeHealth?.runtimeSnapshot,
      snapshot?.currentTurn,
      snapshot?.replay
    )
    || runtimeSnapshotCoverage.result !== "passed"
    || !hasRuntimeSnapshotCoverageEvidence(evidence.runtimeSnapshotCoverage, runtimeSnapshotCoverage)
    || !hasFreshInstallRuntimeSnapshotEvidence(evidence.freshInstallRuntimeSnapshot)
    || !hasMissingAfterTurnRuntimeSnapshotEvidence(evidence.missingAfterTurnRuntimeSnapshot)
    || !hasOperatorReadinessEvidence(snapshot?.operatorReadiness)
    || snapshot?.runtimeHealth?.dashboard?.state !== "running"
    || snapshot?.runtimeHealth?.dashboard?.url !== cliOutput.url
    || !Number.isInteger(snapshot?.runtimeHealth?.dashboard?.pid)
    || snapshot.runtimeHealth.dashboard.pid <= 0
    || !Number.isFinite(snapshot?.runtimeHealth?.dashboard?.uptimeSeconds)
    || snapshot.runtimeHealth.dashboard.uptimeSeconds < 0
    || !hasPermissionEvidence(snapshot?.permissions)
    || !hasDesktopSessionEvidence(snapshot?.runtimeHealth?.desktopSession)
    || !snapshot?.currentTurn
    || !snapshot?.replay
    || !Array.isArray(snapshot?.smokeEvidence?.artifacts)
    || !hasChromeNativeHostBridgeSmokeEvidence(snapshot.smokeEvidence.artifacts)
    || !hasChromeInstalledExtensionSmokeEvidence(snapshot.smokeEvidence.artifacts)
    || !hasDogfoodReleaseEvidence(snapshot?.dogfoodRelease)
    || !hasLongHorizonEvidence(snapshot?.longHorizon)
    || !Array.isArray(snapshot?.alerts)
  ) {
    return "failed";
  }

  if (!hasDashboardEventsEvidence(evidence.eventsResponse)) {
    return "failed";
  }

  if (!hasDashboardChromeHostPolicyApiEvidence(evidence.chromeHostPolicyApi)) {
    return "failed";
  }

  if (!hasDashboardStatusAutoDiscoveryEvidence(evidence.dashboardStatusAutoDiscovery, cliOutput)) {
    return "failed";
  }

  if (
    evidence.shellResponse?.status !== 200
    || !hasDashboardShellEvidence(shellBody)
  ) {
    return "failed";
  }

  return "passed";
}

function hasDashboardLauncherContract(cliOutput) {
  const descriptor = cliOutput?.descriptor;

  return Number.isInteger(cliOutput?.serverPid)
    && cliOutput.serverPid > 0
    && cliOutput?.auth?.mode === "optional-token"
    && cliOutput.auth.tokenPrinted === false
    && cliOutput?.updates?.transport === "sse"
    && cliOutput.updates.scope === "local-http"
    && cliOutput?.eventStore?.mode === "append-only"
    && cliOutput.eventStore.requiredForExecution === false
    && descriptor?.auth?.mode === "optional-token"
    && descriptor.auth.tokenPrinted === false
    && descriptor?.updates?.transport === "sse"
    && descriptor.updates.scope === "local-http"
    && descriptor?.eventStore?.mode === "append-only"
    && descriptor.eventStore.requiredForExecution === false
    && isLoopbackBind(descriptor?.bind)
    && sameBind(cliOutput.bind, descriptor.bind)
    && descriptor.url === cliOutput.url
    && isMatchingDashboardUrl(descriptor.url, descriptor.bind);
}

function hasDashboardServerStatePath(statePath) {
  return typeof statePath === "string"
    && statePath.includes("Application Support/skfiy/dashboard-server.json");
}

export function createRuntimeSnapshotCoverage(evidence) {
  const fixture = readRuntimeSnapshotFixture(evidence?.runtimeSnapshotFixture);

  if (!fixture) {
    return createRuntimeSnapshotCoverageResult("skipped", {
      reason: "Runtime snapshot fixture was not seeded in the isolated HOME."
    });
  }

  const snapshotResponse = evidence?.snapshotResponse;
  if (snapshotResponse?.status !== 200) {
    return createRuntimeSnapshotCoverageResult("failed", {
      fixture,
      reason: `Dashboard /snapshot.json returned ${snapshotResponse?.status ?? "no response"}.`
    });
  }

  const snapshot = snapshotResponse.body;
  if (!snapshot || typeof snapshot !== "object") {
    return createRuntimeSnapshotCoverageResult("failed", {
      fixture,
      reason: "Dashboard /snapshot.json did not return an object."
    });
  }

  const runtimeSnapshot = snapshot.runtimeHealth?.runtimeSnapshot;
  const failures = [];

  if (runtimeSnapshot?.state !== "available") {
    failures.push("runtimeHealth.runtimeSnapshot.state is not available");
  }

  if (runtimeSnapshot?.path !== fixture.path) {
    failures.push("runtimeHealth.runtimeSnapshot.path does not match the seeded fixture path");
  }

  if (runtimeSnapshot?.observedAt !== fixture.snapshot.observedAt) {
    failures.push("runtimeHealth.runtimeSnapshot.observedAt does not match the seeded fixture");
  }

  collectRuntimePanelMismatches(
    failures,
    "currentTurn",
    snapshot.currentTurn,
    fixture.snapshot.currentTurn
  );
  collectRuntimePanelMismatches(
    failures,
    "replay",
    snapshot.replay,
    fixture.snapshot.replay
  );

  if (failures.length > 0) {
    return createRuntimeSnapshotCoverageResult("failed", {
      fixture,
      reason: failures.join("; "),
      failures
    });
  }

  return createRuntimeSnapshotCoverageResult("passed", {
    fixture,
    reason: "Seeded runtime snapshot currentTurn and replay are visible at /snapshot.json."
  });
}

export function createDashboardHelpText(defaults) {
  return `Usage: npm run smoke:dashboard -- [options]

Runs the built skfiy CLI through the dashboard product path:
dist/skfiy -> skfiy dashboard --no-open --port 0 --json -> loopback dashboard server.

Options:
  --cli <path>          Built CLI path. Default: ${defaults.cliPath}
  --timeout-ms <ms>     Wait time for CLI output and dashboard fetches. Default: ${defaults.timeoutMs}
  --output <path>       Persist JSON evidence to a file.
  --require-passed      Exit 2 unless the dashboard smoke result is passed.
  -h, --help            Show this help.
`;
}

export async function writeDashboardSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);

  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function readRequiredValue(argv, index, name) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function isBuiltCliPath(cliPath) {
  if (typeof cliPath !== "string") {
    return false;
  }

  const normalized = path.normalize(cliPath);

  return path.basename(normalized) === "skfiy"
    && path.basename(path.dirname(normalized)) === "dist";
}

function isDashboardCommand(command) {
  if (!Array.isArray(command) || command.length < 6) {
    return false;
  }

  const [, subcommand, noOpenFlag, portFlag, portValue, jsonFlag] = command;

  return subcommand === "dashboard"
    && noOpenFlag === "--no-open"
    && portFlag === "--port"
    && portValue === "0"
    && jsonFlag === "--json";
}

function isLoopbackBind(bind) {
  return bind?.host === "127.0.0.1"
    && Number.isInteger(bind.port)
    && bind.port > 0
    && bind.port <= 65535;
}

function isMatchingDashboardUrl(url, bind) {
  return typeof url === "string"
    && isLoopbackBind(bind)
    && url === `http://127.0.0.1:${bind.port}/`;
}

function sameBind(left, right) {
  return left?.host === right?.host && left?.port === right?.port;
}

function hasPermissionEvidence(permissions) {
  const required = [
    "screenRecording",
    "accessibility",
    "microphone",
    "speechRecognition"
  ];

  return required.every((permission) =>
    typeof permissions?.[permission] === "string"
    && permissions[permission] !== "unknown"
  );
}

function hasDesktopSessionEvidence(desktopSession) {
  return desktopSession?.state === "controllable" || desktopSession?.state === "blocked";
}

function hasNativeHostEvidence(nativeHost) {
  const allowedStates = new Set([
    "installed",
    "missing",
    "mismatched",
    "cli-missing",
    "invalid"
  ]);

  return allowedStates.has(nativeHost?.state)
    && nativeHost?.hostName === "com.sskift.skfiy"
    && typeof nativeHost?.manifestPath === "string"
    && nativeHost.manifestPath.includes("NativeMessagingHosts/com.sskift.skfiy.json")
    && typeof nativeHost?.cliShimPath === "string"
    && path.basename(nativeHost.cliShimPath) === "skfiy"
    && Array.isArray(nativeHost?.allowedOrigins)
    && typeof nativeHost?.reason === "string";
}

function hasExtensionAdapterEvidence(extension) {
  const allowedLiveConnectionStates = new Set(["unknown", "connected", "stale"]);

  return typeof extension?.state === "string"
    && extension.state !== "unknown"
    && extension?.bridge === "native-messaging"
    && allowedLiveConnectionStates.has(extension?.liveConnection)
    && hasChromeHostPolicyEvidence(extension?.hostPolicy)
    && (
      typeof extension?.reason === "string"
      || hasExtensionConnectionEvidence(extension?.connection)
    );
}

function hasChromeHostPolicyEvidence(hostPolicy) {
  return hostPolicy?.schemaVersion === 1
    && (hostPolicy.state === "default" || hostPolicy.state === "configured" || hostPolicy.state === "invalid")
    && typeof hostPolicy.path === "string"
    && hostPolicy.path.includes("Application Support/skfiy/chrome-host-policy.json")
    && hostPolicy.policy?.defaultMode === "ask"
    && Array.isArray(hostPolicy.policy?.allowedHosts)
    && Array.isArray(hostPolicy.policy?.currentTurnAllowedHosts)
    && Array.isArray(hostPolicy.policy?.blockedHosts);
}

function hasDashboardChromeHostPolicyApiEvidence(api) {
  const showDefault = api?.showDefault?.body;
  const setBody = api?.setResponse?.body;
  const showConfigured = api?.showConfigured?.body;
  const resetBody = api?.resetResponse?.body;
  const configuredPolicy = showConfigured?.hostPolicy?.policy;

  return api?.productPath === "dist/skfiy -> dashboard /api/chrome-host-policy -> chrome-host-policy.json"
    && typeof api?.apiUrl === "string"
    && api.apiUrl.includes("/api/chrome-host-policy")
    && api?.showDefault?.status === 200
    && api?.setResponse?.status === 200
    && api?.showConfigured?.status === 200
    && api?.resetResponse?.status === 200
    && showDefault?.command === "dashboard chrome policy show"
    && showDefault?.executesSystemMutation === false
    && hasChromeHostPolicyEvidence(showDefault?.hostPolicy)
    && setBody?.command === "dashboard chrome policy set"
    && setBody?.source === "dashboard"
    && setBody?.plannedMutation === true
    && setBody?.executesSystemMutation === true
    && setBody?.result === "configured"
    && setBody?.action === "allow_current_turn"
    && setBody?.host === "dashboard-smoke.example"
    && hasChromeHostPolicyEvidence(setBody?.hostPolicy)
    && setBody.hostPolicy.policy.currentTurnAllowedHosts?.includes("dashboard-smoke.example")
    && showConfigured?.command === "dashboard chrome policy show"
    && hasChromeHostPolicyEvidence(showConfigured?.hostPolicy)
    && configuredPolicy?.currentTurnAllowedHosts?.includes("dashboard-smoke.example")
    && resetBody?.command === "dashboard chrome policy reset"
    && resetBody?.source === "dashboard"
    && resetBody?.plannedMutation === true
    && resetBody?.executesSystemMutation === true
    && resetBody?.result === "reset"
    && hasChromeHostPolicyEvidence(resetBody?.hostPolicy)
    && resetBody.hostPolicy.state === "default";
}

function hasDashboardStatusAutoDiscoveryEvidence(evidence, cliOutput) {
  const status = evidence?.stdoutJson;
  const dashboard = status?.dashboard;
  const dashboardReadiness = status?.readiness?.checks?.dashboard;

  return evidence?.productPath === "dist/skfiy dashboard -> dashboard-server.json -> skfiy status --json"
    && Array.isArray(evidence?.command)
    && evidence.command.length === 3
    && path.basename(evidence.command[0]) === "skfiy"
    && evidence.command[1] === "status"
    && evidence.command[2] === "--json"
    && evidence?.exitCode === 0
    && !evidence?.signal
    && evidence?.tokenLeakDetected === false
    && status?.schemaVersion === 1
    && status?.command === "status"
    && dashboard?.state === "running"
    && dashboard?.source === "dashboard-server-state"
    && dashboard?.url === cliOutput?.url
    && dashboard?.pid === cliOutput?.serverPid
    && dashboard?.statePath === cliOutput?.statePath
    && dashboard?.api?.chromeHostPolicy?.state === "reachable"
    && dashboardReadiness?.ready === true
    && dashboardReadiness?.state === "ready"
    && dashboardReadiness?.dashboardState === "running"
    && dashboardReadiness?.url === cliOutput?.url;
}

function hasExtensionConnectionEvidence(connection) {
  const allowedConnectionStates = new Set(["connected", "stale"]);

  return allowedConnectionStates.has(connection?.state)
    && connection?.liveConnection === connection.state
    && typeof connection?.path === "string"
    && connection.path.includes("Application Support/skfiy/chrome-extension-connection.json")
    && Number.isFinite(connection?.ageSeconds)
    && connection.ageSeconds >= 0
    && typeof connection?.observedAt === "string"
    && typeof connection?.launchOrigin === "string"
    && connection.launchOrigin.startsWith("chrome-extension://")
    && typeof connection?.messageType === "string"
    && typeof connection?.requestId === "string";
}

function hasRuntimeSnapshotEvidence(runtimeSnapshot, currentTurn, replay) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return false;
  }

  if (
    !currentTurn
    || typeof currentTurn !== "object"
    || !replay
    || typeof replay !== "object"
    || currentTurn.source !== "runtime-snapshot"
    || replay.source !== "runtime-snapshot"
  ) {
    return false;
  }

  if (
    runtimeSnapshot.state === "available"
    && isRuntimeSnapshotPath(runtimeSnapshot.path)
    && typeof runtimeSnapshot.observedAt === "string"
  ) {
    return hasAvailableRuntimePanelEvidence(currentTurn, replay);
  }

  if (
    runtimeSnapshot.state === "missing"
    && isRuntimeSnapshotPath(runtimeSnapshot.path)
    && typeof runtimeSnapshot.reason === "string"
    && typeof currentTurn.reason === "string"
    && typeof replay.reason === "string"
  ) {
    return true;
  }

  if (runtimeSnapshot.state === "repaired" || runtimeSnapshot.state === "isolated") {
    return isRuntimeSnapshotPath(runtimeSnapshot.path)
      && isRuntimeSnapshotPath(runtimeSnapshot.replacementPath)
      && isRuntimeSnapshotIsolationPath(runtimeSnapshot.isolatedPath)
      && isSha256(runtimeSnapshot.sha256)
      && typeof runtimeSnapshot.observedAt === "string"
      && typeof runtimeSnapshot.reason === "string"
      && currentTurn.recovery?.state === runtimeSnapshot.state
      && replay.recovery?.state === runtimeSnapshot.state
      && currentTurn.recovery?.isolatedPath === runtimeSnapshot.isolatedPath
      && replay.recovery?.isolatedPath === runtimeSnapshot.isolatedPath
      && currentTurn.recovery?.replacementPath === runtimeSnapshot.replacementPath
      && replay.recovery?.replacementPath === runtimeSnapshot.replacementPath;
  }

  return false;
}

function hasRuntimeSnapshotCoverageEvidence(coverage, expectedCoverage) {
  return coverage?.result === "passed"
    && expectedCoverage?.result === "passed"
    && coverage?.path === expectedCoverage.path
    && coverage?.observedAt === expectedCoverage.observedAt
    && typeof coverage?.reason === "string"
    && Array.isArray(coverage?.currentTurnFields)
    && Array.isArray(coverage?.replayFields)
    && coverage.currentTurnFields.includes("command")
    && coverage.currentTurnFields.includes("targetApp")
    && coverage.currentTurnFields.includes("approvalState")
    && coverage.currentTurnFields.includes("stopState")
    && coverage.currentTurnFields.includes("latestAction")
    && coverage.currentTurnFields.includes("latestVerification")
    && coverage.currentTurnFields.includes("latestScreenshot")
    && coverage.replayFields.includes("screenshotCount")
    && coverage.replayFields.includes("verificationCount")
    && coverage.replayFields.includes("screenshots")
    && coverage.replayFields.includes("actions")
    && coverage.replayFields.includes("verifications")
    && coverage.replayFields.includes("timelineTail");
}

function hasFreshInstallRuntimeSnapshotEvidence(freshInstall) {
  const snapshot = freshInstall?.snapshotResponse?.body;
  const runtimeSnapshot = snapshot?.runtimeHealth?.runtimeSnapshot;
  const currentTurn = snapshot?.currentTurn;
  const replay = snapshot?.replay;
  const pathValue = runtimeSnapshot?.path;

  return freshInstall?.productPath === "smoke:dashboard -> isolated fresh HOME -> missing runtime-snapshot.json"
    && freshInstall?.runtimeSnapshotExistsBeforeLaunch === false
    && freshInstall?.runtimeSnapshotExistsAfterFetch === false
    && freshInstall?.snapshotResponse?.status === 200
    && freshInstall?.cliOutput?.command === "dashboard"
    && freshInstall?.cliOutput?.result === "running"
    && hasDashboardEventsEvidence(freshInstall?.eventsResponse)
    && runtimeSnapshot?.state === "missing"
    && runtimeSnapshot?.freshInstall === true
    && runtimeSnapshot?.emptyReasonCode === "runtime-snapshot-missing"
    && runtimeSnapshot?.reason === "Runtime snapshot has not been recorded yet."
    && isRuntimeSnapshotPath(pathValue)
    && currentTurn?.state === "idle"
    && currentTurn?.source === "runtime-snapshot"
    && currentTurn?.freshInstall === true
    && currentTurn?.emptyReasonCode === "runtime-snapshot-missing"
    && currentTurn?.reason === runtimeSnapshot.reason
    && currentTurn?.path === pathValue
    && replay?.state === "empty"
    && replay?.source === "runtime-snapshot"
    && replay?.freshInstall === true
    && replay?.emptyReasonCode === "runtime-snapshot-missing"
    && replay?.reason === runtimeSnapshot.reason
    && replay?.path === pathValue
    && freshInstall?.cleanup?.exited === true;
}

function hasMissingAfterTurnRuntimeSnapshotEvidence(missingAfterTurn) {
  const snapshot = missingAfterTurn?.snapshotResponse?.body;
  const runtimeSnapshot = snapshot?.runtimeHealth?.runtimeSnapshot;
  const currentTurn = snapshot?.currentTurn;
  const replay = snapshot?.replay;
  const pathValue = runtimeSnapshot?.path;
  const markerPath = runtimeSnapshot?.markerPath;
  const marker = missingAfterTurn?.marker;
  const matchingAlert = Array.isArray(snapshot?.alerts)
    ? snapshot.alerts.find((alert) =>
      alert?.code === "runtime-snapshot-missing-after-turn"
      && alert?.severity === "warning"
      && alert?.path === pathValue
      && alert?.markerPath === markerPath
    )
    : undefined;

  return missingAfterTurn?.productPath === "smoke:dashboard -> isolated HOME marker -> missing runtime-snapshot.json"
    && missingAfterTurn?.runtimeSnapshotExistsBeforeLaunch === false
    && missingAfterTurn?.markerExistsBeforeLaunch === true
    && missingAfterTurn?.runtimeSnapshotExistsAfterFetch === false
    && missingAfterTurn?.snapshotResponse?.status === 200
    && missingAfterTurn?.cliOutput?.command === "dashboard"
    && missingAfterTurn?.cliOutput?.result === "running"
    && hasDashboardEventsEvidence(missingAfterTurn?.eventsResponse)
    && runtimeSnapshot?.state === "missing-after-turn"
    && runtimeSnapshot?.freshInstall === false
    && runtimeSnapshot?.emptyReasonCode === "runtime-snapshot-missing-after-turn"
    && runtimeSnapshot?.reason === "Runtime snapshot is missing after a recent app turn was observed."
    && isRuntimeSnapshotPath(pathValue)
    && isRuntimeTurnMarkerPath(markerPath)
    && markerPath === missingAfterTurn?.markerPath
    && runtimeSnapshot?.markerObservedAt === marker?.observedAt
    && runtimeSnapshot?.markerState === "recent"
    && Number.isFinite(runtimeSnapshot?.markerAgeSeconds)
    && currentTurn?.state === marker?.currentTurn?.state
    && currentTurn?.command === marker?.currentTurn?.command
    && currentTurn?.source === "runtime-turn-marker"
    && currentTurn?.freshInstall === false
    && currentTurn?.path === pathValue
    && currentTurn?.markerPath === markerPath
    && replay?.state === "empty"
    && replay?.source === "runtime-snapshot"
    && replay?.freshInstall === false
    && replay?.path === pathValue
    && replay?.markerPath === markerPath
    && Boolean(matchingAlert)
    && missingAfterTurn?.cleanup?.exited === true;
}

function hasAvailableRuntimePanelEvidence(currentTurn, replay) {
  return typeof currentTurn?.state === "string"
    && currentTurn.state !== "idle"
    && typeof currentTurn?.command === "string"
    && currentTurn.command.length > 0
    && typeof currentTurn?.targetApp === "string"
    && typeof currentTurn?.targetBundleId === "string"
    && typeof currentTurn?.risk === "string"
    && typeof currentTurn?.plannerProvider === "string"
    && typeof currentTurn?.approvalRequired === "boolean"
    && typeof currentTurn?.latestMessage === "string"
    && replay?.state === "available"
    && typeof replay?.outcome === "string"
    && Number.isInteger(replay?.screenshotCount)
    && Number.isInteger(replay?.actionCount)
    && Number.isInteger(replay?.verificationCount)
    && Number.isInteger(replay?.timelineCount)
    && typeof replay?.latestMessage === "string";
}

function readRuntimeSnapshotFixture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const snapshot = value.snapshot;
  const currentTurn = snapshot?.currentTurn;
  const replay = snapshot?.replay;

  if (
    typeof value.path !== "string"
    || !isRuntimeSnapshotPath(value.path)
    || snapshot?.schemaVersion !== 1
    || typeof snapshot?.observedAt !== "string"
    || !currentTurn
    || typeof currentTurn !== "object"
    || Array.isArray(currentTurn)
    || !replay
    || typeof replay !== "object"
    || Array.isArray(replay)
  ) {
    return undefined;
  }

  return {
    path: value.path,
    snapshot: {
      observedAt: snapshot.observedAt,
      currentTurn,
      replay
    }
  };
}

function collectRuntimePanelMismatches(failures, panelName, actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    failures.push(`${panelName} is not an object`);
    return;
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expectedValue)) {
      failures.push(`${panelName}.${key} does not match the seeded fixture`);
    }
  }
}

function createRuntimeSnapshotCoverageResult(result, { fixture, reason, failures } = {}) {
  return {
    result,
    reason,
    ...(fixture ? {
      path: fixture.path,
      observedAt: fixture.snapshot.observedAt,
      currentTurnFields: Object.keys(fixture.snapshot.currentTurn),
      replayFields: Object.keys(fixture.snapshot.replay)
    } : {}),
    ...(failures ? { failures } : {})
  };
}

function isRuntimeSnapshotPath(value) {
  return typeof value === "string"
    && value.includes("Application Support/skfiy/runtime-snapshot.json");
}

function isRuntimeTurnMarkerPath(value) {
  return typeof value === "string"
    && value.includes("Application Support/skfiy/runtime-turn-marker.json");
}

function isRuntimeSnapshotIsolationPath(value) {
  return isRuntimeSnapshotPath(value)
    && /\.corrupt-[0-9A-Za-z]+-[a-f0-9]{12}\.json$/.test(value);
}

function hasChromeNativeHostBridgeSmokeEvidence(artifacts) {
  if (!Array.isArray(artifacts)) {
    return false;
  }

  return artifacts.some((artifact) => {
    const nativeHostBridge = artifact?.nativeHostBridge;

    return artifact?.target === "chrome"
      && nativeHostBridge?.result === "passed"
      && nativeHostBridge?.productPath === "dist/skfiy -> Chrome Native Messaging heartbeat"
      && nativeHostBridge?.responseResult === "accepted"
      && typeof nativeHostBridge?.heartbeatPath === "string"
      && nativeHostBridge.heartbeatPath.includes("Application Support/skfiy/chrome-extension-connection.json")
      && nativeHostBridge?.heartbeatHostName === "com.sskift.skfiy"
      && typeof nativeHostBridge?.heartbeatLaunchOrigin === "string"
      && nativeHostBridge.heartbeatLaunchOrigin.startsWith("chrome-extension://")
      && nativeHostBridge?.heartbeatMessageType === "skfiy.page.observe"
      && nativeHostBridge?.heartbeatRequestId === "chrome-smoke-native-host";
  });
}

function hasChromeInstalledExtensionSmokeEvidence(artifacts) {
  if (!Array.isArray(artifacts)) {
    return false;
  }

  return artifacts.some((artifact) => {
    const installedExtension = artifact?.installedExtension;
    const browserSelection = installedExtension?.browserSelection;
    const hasBrowserSelection = typeof browserSelection?.chromeAppName === "string"
      && typeof browserSelection?.source === "string"
      && typeof browserSelection?.loadExtensionFriendly === "boolean"
      && Array.isArray(browserSelection?.candidateAppNames);

    if (
      artifact?.target !== "chrome"
      || installedExtension?.productPath !== "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat"
      || !hasBrowserSelection
    ) {
      return false;
    }

    if (installedExtension?.result === "passed") {
      return true;
    }

    return installedExtension?.result === "blocked"
      && installedExtension?.blockedReason === "branded_chrome_load_extension_removed"
      && typeof installedExtension?.chromeVersion === "string"
      && installedExtension?.recommendedBrowser === "Chrome for Testing or Chromium"
      && Array.isArray(installedExtension?.diagnosticExtensionNames)
      && installedExtension.diagnosticExtensionNames.includes("Google Network Speech");
  });
}

function hasDogfoodReleaseEvidence(dogfoodRelease) {
  return typeof dogfoodRelease?.state === "string"
    && hasLatestAlphaEvidence(dogfoodRelease.latestAlpha)
    && hasCurrentHeadEvidence(dogfoodRelease.currentHead)
    && hasReleaseDriftEvidence(dogfoodRelease.releaseDrift)
    && hasManifestEvidence(dogfoodRelease.manifest)
    && hasCohortEvidence(dogfoodRelease.cohort);
}

function hasLongHorizonEvidence(longHorizon) {
  const allowedStates = new Set([
    "observing",
    "needs_attention",
    "blocked"
  ]);

  return allowedStates.has(longHorizon?.state)
    && longHorizon?.session === "money-run"
    && longHorizon?.source === "tmux-read-only-probe"
    && longHorizon?.mutatesSession === false
    && Number.isInteger(longHorizon?.summary?.windowCount)
    && Number.isInteger(longHorizon?.summary?.paneCount)
    && Array.isArray(longHorizon?.summary?.activePaneIds)
    && Array.isArray(longHorizon?.summary?.deadPaneIds)
    && Array.isArray(longHorizon?.signals)
    && typeof longHorizon?.recommendation?.action === "string"
    && typeof longHorizon?.recommendation?.reason === "string"
    && longHorizon?.recommendation?.mutatesSession === false
    && Array.isArray(longHorizon?.probeCommands)
    && longHorizon.probeCommands.includes("tmux has-session -t money-run");
}

function hasOperatorReadinessEvidence(operatorReadiness) {
  const commandSurface = operatorReadiness?.commandSurface;
  const extensionReadiness = operatorReadiness?.extensionReadiness;
  const packagedBinary = operatorReadiness?.packagedBinary;
  const recentSmokeEvidence = operatorReadiness?.recentSmokeEvidence;
  const allowedOverallStates = new Set(["ready", "needs-evidence", "blocked"]);
  const allowedCheckStates = new Set(["ready", "needs-evidence", "blocked"]);

  return allowedOverallStates.has(operatorReadiness?.state)
    && commandSurface?.state === "ready"
    && typeof commandSurface?.path === "string"
    && path.basename(commandSurface.path) === "skfiy"
    && allowedCheckStates.has(extensionReadiness?.state)
    && typeof extensionReadiness?.nativeHostState === "string"
    && packagedBinary?.state === "ready"
    && packagedBinary?.checks?.app === true
    && packagedBinary?.checks?.helper === true
    && packagedBinary?.checks?.cli === true
    && packagedBinary?.checks?.signing === true
    && packagedBinary?.signingState === "valid"
    && recentSmokeEvidence?.state === "ready"
    && Array.isArray(recentSmokeEvidence?.requiredTargets)
    && ["chrome", "cli"].every((target) =>
      recentSmokeEvidence.requiredTargets.includes(target)
    )
    && Array.isArray(recentSmokeEvidence?.recentPassedTargets)
    && ["chrome", "cli"].every((target) =>
      recentSmokeEvidence.recentPassedTargets.includes(target)
    )
    && Array.isArray(recentSmokeEvidence?.missingTargets)
    && recentSmokeEvidence.missingTargets.length === 0;
}

function hasDashboardShellEvidence(shellBody) {
  return shellBody.includes("skfiy Dashboard")
    && shellBody.includes("/descriptor.json")
    && shellBody.includes("/snapshot.json")
    && shellBody.includes('new EventSource("/events")')
    && shellBody.includes("data-dashboard-root")
    && shellBody.includes('aria-label="skfiy user dashboard"')
    && shellBody.includes('data-user-panel="home"')
    && shellBody.includes('data-user-panel="approvals"')
    && shellBody.includes('data-user-panel="apps-sites"')
    && shellBody.includes("renderUserDashboard(snapshot)")
    && shellBody.includes("readUserNextAction(snapshot)")
    && shellBody.includes("Advanced Diagnostics")
    && shellBody.includes("data-snapshot-state")
    && shellBody.includes('data-panel-body="operator-readiness"')
    && shellBody.includes('data-panel-body="long-horizon-supervision"')
    && shellBody.includes("/api/chrome-host-policy")
    && shellBody.includes('fetch("/snapshot.json", { cache: "no-store" })')
    && shellBody.includes("renderAppPolicyPanel(snapshot)")
    && shellBody.includes("renderOperatorReadinessPanel(snapshot)")
    && shellBody.includes("renderLongHorizonPanel")
    && shellBody.includes("renderAlertsPanel(snapshot)")
    && shellBody.includes("groupAlerts(alerts)")
    && shellBody.includes("createAlertBand(group)")
    && shellBody.includes("data-alert-groups");
}

function hasDashboardEventsEvidence(eventsResponse) {
  if (
    eventsResponse?.status !== 200
    || eventsResponse?.headers?.["content-type"] !== "text/event-stream; charset=utf-8"
    || eventsResponse?.headers?.["cache-control"] !== "no-store, no-transform"
  ) {
    return false;
  }

  const event = parseFirstServerSentEvent(eventsResponse.body);

  return event?.event === "snapshot"
    && event.data?.schemaVersion === 1
    && typeof event.data?.generatedAt === "string"
    && event.data?.currentTurn
    && event.data?.replay;
}

function parseFirstServerSentEvent(body) {
  if (typeof body !== "string" || !body.includes("\n\n")) {
    return undefined;
  }

  const lines = body.slice(0, body.indexOf("\n\n")).split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));

  if (!eventLine || !dataLine) {
    return undefined;
  }

  try {
    return {
      event: eventLine.slice("event: ".length),
      data: JSON.parse(dataLine.slice("data: ".length))
    };
  } catch {
    return undefined;
  }
}

function hasLatestAlphaEvidence(latestAlpha) {
  if (!latestAlpha || typeof latestAlpha !== "object") {
    return false;
  }

  if (latestAlpha.state === "missing") {
    return typeof latestAlpha.path === "string";
  }

  return (latestAlpha.state === "published" || latestAlpha.state === "present")
    && typeof latestAlpha.tagName === "string"
    && typeof latestAlpha.commitSha === "string"
    && typeof latestAlpha.manifestPath === "string"
    && typeof latestAlpha.zipPath === "string"
    && isSha256(latestAlpha.zipSha256);
}

function hasCurrentHeadEvidence(currentHead) {
  return currentHead?.state === "present"
    && isCommitSha(currentHead.commitSha)
    && typeof currentHead.shortCommit === "string"
    && currentHead.shortCommit === currentHead.commitSha.slice(0, 7);
}

function hasReleaseDriftEvidence(releaseDrift) {
  if (!releaseDrift || typeof releaseDrift !== "object") {
    return false;
  }

  if (releaseDrift.state === "unknown") {
    return typeof releaseDrift.reason === "string";
  }

  return (releaseDrift.state === "current" || releaseDrift.state === "behind-head")
    && isCommitSha(releaseDrift.releaseCommitSha)
    && isCommitSha(releaseDrift.currentHeadCommitSha)
    && (
      releaseDrift.state === "current"
        ? releaseDrift.releaseCommitSha === releaseDrift.currentHeadCommitSha
        : releaseDrift.releaseCommitSha !== releaseDrift.currentHeadCommitSha
    );
}

function hasManifestEvidence(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return false;
  }

  if (manifest.state === "missing" || manifest.state === "unknown") {
    return typeof manifest.reason === "string" || typeof manifest.path === "string";
  }

  return manifest.state === "present"
    && typeof manifest.path === "string"
    && isSha256(manifest.sha256)
    && typeof manifest.commitSha === "string"
    && manifest.bundleIdentifier === "com.sskift.skfiy"
    && isSha256(manifest.zipSha256);
}

function hasCohortEvidence(cohort) {
  if (!cohort || typeof cohort !== "object") {
    return false;
  }

  return (cohort.state === "present" || cohort.state === "missing")
    && Number.isInteger(cohort.totalReports)
    && cohort.totalReports >= 0
    && Number.isInteger(cohort.acceptedReportCount)
    && cohort.acceptedReportCount >= 0
    && Number.isInteger(cohort.distinctRealTesterCount)
    && cohort.distinctRealTesterCount >= 0
    && typeof cohort.ready === "boolean"
    && typeof cohort.passedReady === "boolean"
    && hasWorkflowCoverage(cohort.workflowCoverage)
    && hasWorkflowCoverage(cohort.passedWorkflowCoverage)
    && Array.isArray(cohort.acceptedReportIssueUrls);
}

function hasWorkflowCoverage(coverage) {
  const requiredWorkflows = [
    "coding-terminal",
    "screenshot-inspection",
    "finder-file",
    "browser-fallback"
  ];

  return coverage && typeof coverage === "object"
    && requiredWorkflows.every((workflow) => typeof coverage[workflow] === "boolean");
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}
