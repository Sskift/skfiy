const DEFAULT_POLICY_LABEL = "Ask by default";
const SENSITIVE_PAUSE_LABEL = "Sensitive content pause";
const HOST_POLICY_STORAGE_KEY = "skfiyHostPolicy";
const LAST_SENSITIVE_PAUSE_KEY = "lastSensitivePause";
const MESSAGE_SCHEMA_VERSION = 1;
const HOST_POLICY_SHAPE = Object.freeze({
  defaultMode: "ask",
  allowedHosts: [],
  currentTurnAllowedHosts: [],
  blockedHosts: []
});

const MESSAGE_TYPES = Object.freeze({
  HOST_POLICY_SYNC_STATUS: "skfiy.host_policy.sync_status",
  HOST_POLICY_SYNC_REFRESH: "skfiy.host_policy.sync_refresh",
  NATIVE_HEARTBEAT: "skfiy.native.heartbeat",
  DEV_RELOAD_REQUEST: "skfiy.dev.reload"
});

let pendingHostPermissionOrigins = [];

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function labelForPolicy(policy, host) {
  if (!host) {
    return DEFAULT_POLICY_LABEL;
  }
  if (policy?.blockedHosts?.includes(host)) {
    return "Blocked";
  }
  if (policy?.allowedHosts?.includes(host)) {
    return "Always allowed";
  }
  if (policy?.currentTurnAllowedHosts?.includes(host)) {
    return "Allowed this turn";
  }
  return DEFAULT_POLICY_LABEL;
}

function formatPolicyReason(hostPolicy) {
  switch (hostPolicy?.reason) {
    case "host_allowed":
      return "Host allowed";
    case "blocked_host":
      return "Blocked host";
    case "default_policy":
      return "Default policy";
    case "missing_host":
      return "Missing host";
    case "active_tab_unavailable":
      return "Active tab unavailable";
    default:
      return hostPolicy?.reason || "Unknown";
  }
}

function formatSyncState(state) {
  switch (state) {
    case "synced":
      return "Synced";
    case "syncing":
      return "Syncing";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

function formatConnection(syncStatus, nativeHost = {}) {
  switch (nativeHost.connectionState ?? syncStatus?.state) {
    case "connected":
    case "synced":
      return "Synced with skfiy app";
    case "connecting":
    case "syncing":
      return "Syncing with skfiy app";
    case "unavailable":
    case "error":
      return "skfiy app unavailable";
    default:
      return "Waiting for skfiy app";
  }
}

function formatBridgeState(nativeHost = {}, syncStatus = {}) {
  switch (nativeHost.bridgeState ?? syncStatus?.nativeBridgeState) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "unavailable":
      return "Unavailable";
    case "unknown":
      return "Unknown";
    default:
      return nativeHost.bridgeState ?? syncStatus?.nativeBridgeState ?? "Unknown";
  }
}

function formatLaunchOrigin(nativeHost = {}, syncStatus = {}) {
  return nativeHost.launchOrigin ?? syncStatus?.nativeLaunchOrigin ?? "Not observed";
}

function formatSource(source) {
  if (source === "native_host") {
    return "Native host";
  }
  if (source === "local_storage") {
    return "Local storage";
  }
  return source || "Unknown";
}

function formatPolicyState(state) {
  switch (state) {
    case "configured":
      return "Configured";
    case "default":
      return "Default";
    case "invalid":
      return "Invalid";
    default:
      return "Unknown";
  }
}

function formatHeartbeat(heartbeat, syncStatus = {}) {
  const current = heartbeat && typeof heartbeat === "object"
    ? heartbeat
    : {};
  const state = current.state
    ?? (syncStatus.state === "synced" ? "connected" : syncStatus.state)
    ?? "unknown";
  const updatedAt = current.completedAt ?? current.updatedAt ?? syncStatus.completedAt ?? syncStatus.updatedAt;
  const suffix = updatedAt ? ` at ${formatUpdatedAt(updatedAt)}` : "";
  const lastError = current.lastError ?? syncStatus.lastError ?? syncStatus.error;

  switch (state) {
    case "connected":
      return `Connected${suffix}`;
    case "checking":
    case "syncing":
      return "Checking";
    case "error":
      return lastError ? `Error: ${lastError}` : "Error";
    case "unknown":
      return "Not checked";
    default:
      return formatDiagnosticToken(state);
  }
}

function formatDevReload(devReload = {}) {
  const lastError = devReload.lastError;

  switch (devReload.state) {
    case "checking":
      return "Checking heartbeat";
    case "scheduled":
      return devReload.reloadAt
        ? `Reload scheduled for ${formatUpdatedAt(devReload.reloadAt)}`
        : "Reload scheduled";
    case "blocked":
      return devReload.message ?? "Reload blocked";
    case "error":
      return lastError ? `Error: ${lastError}` : "Error";
    case "idle":
    case undefined:
    case null:
      return devReload.reloadAvailable === false
        ? "Unavailable in this browser context"
        : "Idle";
    default:
      return formatDiagnosticToken(devReload.state);
  }
}

function formatCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== "object") {
    return "Unknown";
  }

  const labels = [
    ["activeTab", "Active tab"],
    ["nativeMessaging", "Native messaging"],
    ["scripting", "Scripting"],
    ["storage", "Storage"],
    ["tabs", "Tabs"],
    ["downloads", "Downloads"]
  ]
    .filter(([key]) => capabilities[key] === true)
    .map(([, label]) => label);

  return labels.length > 0 ? labels.join(", ") : "None";
}

function formatManifestVersion(extension) {
  if (extension?.manifestVersion) {
    return `MV${extension.manifestVersion}`;
  }
  return "Unknown";
}

function formatHostPermission(permission) {
  switch (permission?.state) {
    case "granted":
      return `Granted for ${permission.origins?.[0] ?? permission.origin ?? "current host"}`;
    case "missing":
      return permission.message
        ?? `Missing optional permission for ${permission.origins?.[0] ?? "current host"}`;
    case "not_applicable":
      return "Not required for this page";
    case "unknown":
      return permission.lastError
        ? `Unknown: ${permission.lastError}`
        : "Unknown";
    default:
      return "Unknown";
  }
}

function formatDiagnosticToken(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Unknown";
  }

  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function readPageSessionDiagnostics(diagnostics) {
  const session = diagnostics?.session && typeof diagnostics.session === "object"
    ? diagnostics.session
    : {};
  const contentScript = session.contentScript && typeof session.contentScript === "object"
    ? session.contentScript
    : diagnostics?.currentTab?.contentScript && typeof diagnostics.currentTab.contentScript === "object"
      ? diagnostics.currentTab.contentScript
      : {};

  return {
    ...session,
    ...contentScript
  };
}

function formatPageSafety(pageSafety) {
  const safety = pageSafety && typeof pageSafety === "object"
    ? pageSafety
    : { state: pageSafety };
  const state = safety.state ?? safety.status ?? safety.level ?? safety.kind;

  switch (state) {
    case "safe":
      return safety.reason ? `Safe: ${safety.reason}` : "Safe";
    case "sensitive":
      return safety.reason ? `Sensitive: ${safety.reason}` : "Sensitive";
    case "paused":
    case "sensitive_pause":
      return safety.reason ? `Sensitive pause: ${safety.reason}` : "Sensitive pause";
    case "unknown":
      return "Unknown";
    default: {
      const label = formatDiagnosticToken(state);
      return safety.reason ? `${label}: ${safety.reason}` : label;
    }
  }
}

function readSensitivePauseState(session, storedSensitivePause, host) {
  const pageSafety = session.pageSafety && typeof session.pageSafety === "object"
    ? session.pageSafety
    : {};
  const reason = session.sensitivePauseReason
    ?? session.pauseReason
    ?? pageSafety.sensitivePauseReason
    ?? pageSafety.pauseReason;

  if (session.sensitivePaused === true || reason) {
    return {
      active: true,
      label: reason ? `Active: ${reason}` : "Active",
      reason: reason ?? "review required"
    };
  }

  if (storedSensitivePause && storedSensitivePause.host === host) {
    const storedReason = storedSensitivePause.reason ?? "review required";
    return {
      active: true,
      label: `Active: ${storedReason}`,
      reason: storedReason
    };
  }

  if (session.sensitivePaused === false) {
    return {
      active: false,
      label: "Inactive"
    };
  }

  return {
    active: false,
    label: "Not reported"
  };
}

function formatContentScriptSession(session) {
  const sensitivePaused = session?.sensitivePaused === true || Boolean(session?.sensitivePauseReason);

  switch (session?.state) {
    case "loaded":
      return sensitivePaused ? "Loaded, sensitive pause active" : "Loaded";
    case "blocked_by_host_policy":
      return "Blocked by host policy";
    case "blocked_by_chrome_host_permission":
      return "Blocked by missing host permission";
    case "unavailable":
      return session.lastError ? `Unavailable: ${session.lastError}` : "Unavailable";
    case "unknown":
      return "Unknown";
    case "not_queried":
      return "Not queried";
    case "not_loaded":
      return "Not loaded";
    default:
      return "Unknown";
  }
}

function readPageControlDiagnostics(diagnostics) {
  if (diagnostics?.currentTab?.pageControl && typeof diagnostics.currentTab.pageControl === "object") {
    return diagnostics.currentTab.pageControl;
  }
  if (diagnostics?.session?.pageControl && typeof diagnostics.session.pageControl === "object") {
    return diagnostics.session.pageControl;
  }
  const session = readPageSessionDiagnostics(diagnostics);
  return session.pageControl && typeof session.pageControl === "object" ? session.pageControl : {};
}

function formatReadyControls(capabilities = {}) {
  const labels = [
    ["screenshot", "screenshot"],
    ["domActions", "DOM actions"],
    ["click", "click"],
    ["fill", "fill"],
    ["submit", "submit"],
    ["scroll", "scroll"]
  ]
    .filter(([key]) => capabilities[key] === true)
    .map(([, label]) => label);

  return labels.length > 0 ? labels.join(", ") : "no controls";
}

function formatPageControlReadiness(pageControl) {
  const capabilities = pageControl?.capabilities && typeof pageControl.capabilities === "object"
    ? pageControl.capabilities
    : {};
  const reason = pageControl?.reason ? `: ${pageControl.reason}` : "";

  switch (pageControl?.state) {
    case "ready":
      return `Ready (${formatReadyControls(capabilities)})`;
    case "partial":
      return `Partial (${formatReadyControls(capabilities)})${reason}`;
    case "sensitive-paused":
      return `Paused${reason}`;
    case "needs_confirmation":
      return `Needs confirmation${reason}`;
    case "blocked_by_chrome_host_permission":
      return "Blocked by missing host permission";
    case "blocked_by_host_policy":
      return "Blocked by host policy";
    case "content_script_not_loaded":
    case "not_loaded":
      return "Content script not loaded";
    case "unavailable":
      return reason ? `Unavailable${reason}` : "Unavailable";
    default: {
      const label = formatDiagnosticToken(pageControl?.state);
      return reason ? `${label}${reason}` : label;
    }
  }
}

function setChip(id, label, state) {
  const element = document.getElementById(id);
  element.textContent = label;
  element.dataset.state = state;
}

function readConnectionChip(syncStatus, nativeHost = {}) {
  const state = nativeHost.connectionState ?? syncStatus?.state;

  if (state === "connected" || state === "synced") {
    return {
      label: "Connected",
      state: "connected"
    };
  }

  if (state === "connecting" || state === "syncing") {
    return {
      label: "Connecting",
      state: "unknown"
    };
  }

  if (state === "unavailable" || state === "error") {
    return {
      label: "Disconnected",
      state: "disconnected"
    };
  }

  return {
    label: "Waiting",
    state: "unknown"
  };
}

function readPermissionOrigin(permission = {}) {
  if (Array.isArray(permission.origins) && permission.origins.length > 0) {
    return permission.origins[0];
  }
  if (permission.origin) {
    return `${permission.origin}/*`;
  }
  return "this site";
}

function applyInteractionSummary(syncStatus, diagnostics) {
  const nativeHost = diagnostics?.nativeHost ?? {};
  const currentTab = diagnostics?.currentTab ?? {};
  const pageControl = readPageControlDiagnostics(diagnostics);
  const connectionChip = readConnectionChip(syncStatus, nativeHost);
  const host = currentTab.host || document.getElementById("current-host").textContent || "This page";
  const permission = currentTab.chromeHostPermission ?? {};
  const pageControlState = pageControl?.state;
  let summary = "Checking this page.";
  let actionSummary = "skfiy is reading the current Chrome tab state.";
  let pageChip = {
    label: "Checking page",
    state: "unknown"
  };

  if (permission.state === "missing" || pageControlState === "blocked_by_chrome_host_permission") {
    const origin = readPermissionOrigin(permission);
    summary = "Grant site access to control this page.";
    actionSummary = `Chrome needs permission for ${origin} before skfiy can observe or act.`;
    pageChip = {
      label: "Needs access",
      state: "blocked"
    };
  } else if (pageControlState === "ready") {
    summary = "Ready to control this page.";
    actionSummary = `${host} can be observed and controlled through skfiy.`;
    pageChip = {
      label: "Ready",
      state: "ready"
    };
  } else if (pageControlState === "partial") {
    summary = "Page control is partially available.";
    actionSummary = pageControl.reason || `${host} can be observed, but some actions are not available.`;
    pageChip = {
      label: "Partial",
      state: "unknown"
    };
  } else if (pageControlState === "blocked_by_host_policy") {
    summary = "Allow this host in skfiy first.";
    actionSummary = pageControl.reason || `${host} is blocked by the current skfiy host policy.`;
    pageChip = {
      label: "Policy blocked",
      state: "blocked"
    };
  } else if (pageControlState === "sensitive-paused") {
    summary = "Sensitive content pause is active.";
    actionSummary = pageControl.reason || "Review the page before allowing skfiy to act here.";
    pageChip = {
      label: "Paused",
      state: "blocked"
    };
  } else if (connectionChip.state === "disconnected") {
    summary = "Connect the skfiy app to control this page.";
    actionSummary = "The Chrome adapter is loaded, but the native skfiy app is not connected.";
    pageChip = {
      label: "No app",
      state: "blocked"
    };
  }

  document.getElementById("interaction-summary").textContent = summary;
  document.getElementById("page-action-summary").textContent = actionSummary;
  setChip("connection-chip", connectionChip.label, connectionChip.state);
  setChip("page-control-chip", pageChip.label, pageChip.state);
}

function applyPageDiagnostics(diagnostics, storedSensitivePause, host) {
  const session = readPageSessionDiagnostics(diagnostics);
  const pauseState = readSensitivePauseState(session, storedSensitivePause, host ?? diagnostics?.currentTab?.host);
  const pauseElement = document.getElementById("sensitive-pause");

  document.getElementById("page-safety").textContent = formatPageSafety(session.pageSafety);
  document.getElementById("sensitive-pause-status").textContent = pauseState.label;

  if (pauseState.active) {
    pauseElement.hidden = false;
    pauseElement.textContent = `${SENSITIVE_PAUSE_LABEL}: ${pauseState.reason}`;
  } else {
    pauseElement.hidden = true;
    pauseElement.textContent = SENSITIVE_PAUSE_LABEL;
  }
}

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) {
    return "Never";
  }
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return updatedAt;
  }
  return date.toLocaleString();
}

function applySyncStatus(syncStatus, diagnostics) {
  const nativeHost = diagnostics?.nativeHost ?? {};
  const currentTab = diagnostics?.currentTab ?? {};
  const devReload = diagnostics?.devReload ?? {};
  const lastError = diagnostics?.lastError ?? nativeHost.lastError ?? syncStatus?.lastError ?? syncStatus?.error;

  document.getElementById("native-host").textContent = nativeHost.name ?? "com.sskift.skfiy";
  document.getElementById("extension-version").textContent =
    diagnostics?.extension?.version ? `v${diagnostics.extension.version}` : "Unknown";
  document.getElementById("extension-manifest-version").textContent =
    formatManifestVersion(diagnostics?.extension);
  document.getElementById("extension-capabilities").textContent =
    formatCapabilities(diagnostics?.capabilities);
  document.getElementById("connection-status").textContent = formatConnection(syncStatus, nativeHost);
  document.getElementById("native-bridge-state").textContent = formatBridgeState(nativeHost, syncStatus);
  document.getElementById("native-launch-origin").textContent = formatLaunchOrigin(nativeHost, syncStatus);
  document.getElementById("host-policy-reason").textContent = formatPolicyReason(currentTab.hostPolicy);
  document.getElementById("chrome-host-permission").textContent =
    formatHostPermission(currentTab.chromeHostPermission);
  applyGrantSiteAccessState(currentTab.chromeHostPermission);
  document.getElementById("content-script-session").textContent =
    formatContentScriptSession(readPageSessionDiagnostics(diagnostics));
  document.getElementById("page-control-readiness").textContent =
    formatPageControlReadiness(readPageControlDiagnostics(diagnostics));
  applyInteractionSummary(syncStatus, diagnostics);
  applyPageDiagnostics(diagnostics, undefined, currentTab.host);
  document.getElementById("native-host-policy-state").textContent = formatPolicyState(
    nativeHost.policyState ?? syncStatus?.nativeHostPolicyState ?? syncStatus?.hostPolicyState
  );
  document.getElementById("policy-sync-state").textContent = formatSyncState(syncStatus?.state);
  document.getElementById("native-heartbeat").textContent =
    formatHeartbeat(devReload.heartbeat, syncStatus);
  document.getElementById("dev-reload-status").textContent = formatDevReload(devReload);
  document.getElementById("policy-sync-source").textContent = formatSource(syncStatus?.source);
  document.getElementById("policy-sync-entry-count").textContent = String(syncStatus?.entryCount ?? 0);
  document.getElementById("policy-sync-updated-at").textContent = formatUpdatedAt(syncStatus?.updatedAt);

  const errorLabel = document.getElementById("policy-sync-error-label");
  const errorElement = document.getElementById("policy-sync-error");
  if (lastError) {
    errorLabel.hidden = false;
    errorElement.hidden = false;
    errorElement.textContent = lastError;
  } else {
    errorLabel.hidden = true;
    errorElement.hidden = true;
    errorElement.textContent = "None";
  }
}

function applyGrantSiteAccessState(chromeHostPermission) {
  const button = document.getElementById("grant-site-access-button");
  const origins = Array.isArray(chromeHostPermission?.origins)
    ? chromeHostPermission.origins.filter((origin) => typeof origin === "string" && origin.length > 0)
    : [];
  pendingHostPermissionOrigins = chromeHostPermission?.state === "missing" ? origins : [];
  button.hidden = pendingHostPermissionOrigins.length === 0;
  button.disabled = false;
  if (pendingHostPermissionOrigins.length > 0) {
    button.textContent = `Grant ${pendingHostPermissionOrigins[0]}`;
  } else {
    button.textContent = "Grant site access";
  }
}

async function requestPolicySnapshot(type) {
  return chrome.runtime.sendMessage({
    type,
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    requestId: `popup-${Date.now()}`
  });
}

async function renderPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = hostFromUrl(tab?.url ?? "");
  const stored = await chrome.storage.local.get([HOST_POLICY_STORAGE_KEY, LAST_SENSITIVE_PAUSE_KEY]);
  const snapshot = await requestPolicySnapshot(MESSAGE_TYPES.HOST_POLICY_SYNC_STATUS);
  const policy = {
    ...HOST_POLICY_SHAPE,
    ...(snapshot?.policy ?? stored[HOST_POLICY_STORAGE_KEY] ?? {})
  };
  const sensitivePause = stored[LAST_SENSITIVE_PAUSE_KEY];

  document.getElementById("current-host").textContent = host || "Unknown";
  document.getElementById("host-policy").textContent = labelForPolicy(policy, host);
  applySyncStatus(snapshot?.syncStatus, snapshot?.diagnostics);
  applyPageDiagnostics(snapshot?.diagnostics, sensitivePause, host);
}

function shouldAutoCheckHeartbeat() {
  try {
    return new URL(globalThis.location?.href ?? "").searchParams.has("skfiyWake");
  } catch {
    return false;
  }
}

function readTargetTabId() {
  try {
    const value = new URL(globalThis.location?.href ?? "").searchParams.get("skfiyTargetTabId");
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isInteger(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function refreshHostPolicy() {
  const button = document.getElementById("sync-policy-button");
  button.disabled = true;
  applySyncStatus({ state: "syncing", source: "native_host", entryCount: 0 }, undefined);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const host = hostFromUrl(tab?.url ?? "");
    const snapshot = await requestPolicySnapshot(MESSAGE_TYPES.HOST_POLICY_SYNC_REFRESH);
    const policy = {
      ...HOST_POLICY_SHAPE,
      ...(snapshot?.policy ?? {})
    };

    document.getElementById("host-policy").textContent = labelForPolicy(policy, host);
    applySyncStatus(snapshot?.syncStatus, snapshot?.diagnostics);
  } catch (error) {
    applySyncStatus({
      state: "error",
      source: "native_host",
      entryCount: 0,
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "Unable to refresh policy",
      error: error instanceof Error ? error.message : "Unable to refresh policy"
    }, undefined);
  } finally {
    button.disabled = false;
  }
}

async function checkHeartbeat() {
  const button = document.getElementById("heartbeat-button");
  button.disabled = true;
  document.getElementById("native-heartbeat").textContent = "Checking";

  try {
    const targetTabId = readTargetTabId();
    const snapshot = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.NATIVE_HEARTBEAT,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: `popup-${Date.now()}`,
      ...(Number.isInteger(targetTabId) ? { tabId: targetTabId } : {})
    });
    applySyncStatus(snapshot?.syncStatus, snapshot?.diagnostics);
  } catch (error) {
    applySyncStatus({
      state: "error",
      source: "native_host",
      entryCount: 0,
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "Unable to check heartbeat",
      error: error instanceof Error ? error.message : "Unable to check heartbeat"
    }, undefined);
  } finally {
    button.disabled = false;
  }
}

async function reloadExtension() {
  const button = document.getElementById("dev-reload-button");
  button.disabled = true;
  document.getElementById("dev-reload-status").textContent = "Checking heartbeat";

  try {
    const snapshot = await requestPolicySnapshot(MESSAGE_TYPES.DEV_RELOAD_REQUEST);
    applySyncStatus(snapshot?.syncStatus, snapshot?.diagnostics);
    document.getElementById("dev-reload-status").textContent =
      formatDevReload(snapshot?.devReload ?? snapshot?.diagnostics?.devReload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reload extension";
    document.getElementById("dev-reload-status").textContent = `Error: ${message}`;
    applySyncStatus({
      state: "error",
      source: "native_host",
      entryCount: 0,
      updatedAt: new Date().toISOString(),
      lastError: message,
      error: message
    }, undefined);
  } finally {
    button.disabled = false;
  }
}

async function grantSiteAccess() {
  const button = document.getElementById("grant-site-access-button");
  const origins = [...pendingHostPermissionOrigins];
  if (origins.length === 0) {
    button.hidden = true;
    return;
  }

  button.disabled = true;
  button.textContent = "Requesting access";

  try {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      button.textContent = "Access not granted";
      return;
    }
    button.textContent = "Access granted";
    await refreshHostPolicy();
  } catch (error) {
    button.textContent = error instanceof Error ? error.message : "Unable to request access";
  } finally {
    button.disabled = false;
  }
}

document.getElementById("sync-policy-button").addEventListener("click", () => {
  void refreshHostPolicy();
});

document.getElementById("grant-site-access-button").addEventListener("click", () => {
  void grantSiteAccess();
});

document.getElementById("heartbeat-button").addEventListener("click", () => {
  void checkHeartbeat();
});

document.getElementById("dev-reload-button").addEventListener("click", () => {
  void reloadExtension();
});

void renderPopup()
  .then(() => {
    if (shouldAutoCheckHeartbeat()) {
      void checkHeartbeat();
    }
  })
  .catch((error) => {
    document.getElementById("connection-status").textContent =
      error instanceof Error ? error.message : "Unable to read status";
    applySyncStatus({
      state: "error",
      source: "local_storage",
      entryCount: 0,
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "Unable to read status",
      error: error instanceof Error ? error.message : "Unable to read status"
    }, undefined);
  });
