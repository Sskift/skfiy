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
  HOST_POLICY_SYNC_REFRESH: "skfiy.host_policy.sync_refresh"
});

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

function formatContentScriptSession(session) {
  switch (session?.state) {
    case "loaded":
      return session.sensitivePaused ? "Loaded, sensitive pause active" : "Loaded";
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
  const lastError = diagnostics?.lastError ?? nativeHost.lastError ?? syncStatus?.lastError ?? syncStatus?.error;

  document.getElementById("native-host").textContent = nativeHost.name ?? "com.sskift.skfiy";
  document.getElementById("extension-version").textContent =
    diagnostics?.extension?.version ? `v${diagnostics.extension.version}` : "Unknown";
  document.getElementById("extension-manifest-version").textContent =
    formatManifestVersion(diagnostics?.extension);
  document.getElementById("extension-capabilities").textContent =
    formatCapabilities(diagnostics?.capabilities);
  document.getElementById("connection-status").textContent = formatConnection(syncStatus, nativeHost);
  document.getElementById("host-policy-reason").textContent = formatPolicyReason(currentTab.hostPolicy);
  document.getElementById("chrome-host-permission").textContent =
    formatHostPermission(currentTab.chromeHostPermission);
  document.getElementById("content-script-session").textContent =
    formatContentScriptSession(diagnostics?.session?.contentScript ?? currentTab.contentScript);
  document.getElementById("native-host-policy-state").textContent = formatPolicyState(
    nativeHost.policyState ?? syncStatus?.nativeHostPolicyState ?? syncStatus?.hostPolicyState
  );
  document.getElementById("policy-sync-state").textContent = formatSyncState(syncStatus?.state);
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

  const pauseElement = document.getElementById("sensitive-pause");
  if (sensitivePause?.host === host) {
    pauseElement.hidden = false;
    pauseElement.textContent = `${SENSITIVE_PAUSE_LABEL}: ${sensitivePause.reason ?? "review required"}`;
  } else {
    pauseElement.hidden = true;
    pauseElement.textContent = SENSITIVE_PAUSE_LABEL;
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

document.getElementById("sync-policy-button").addEventListener("click", () => {
  void refreshHostPolicy();
});

void renderPopup().catch((error) => {
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
