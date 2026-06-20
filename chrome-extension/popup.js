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

function formatConnection(syncStatus) {
  switch (syncStatus?.state) {
    case "synced":
      return "Synced with skfiy app";
    case "syncing":
      return "Syncing with skfiy app";
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

function applySyncStatus(syncStatus) {
  document.getElementById("connection-status").textContent = formatConnection(syncStatus);
  document.getElementById("policy-sync-state").textContent = formatSyncState(syncStatus?.state);
  document.getElementById("policy-sync-source").textContent = formatSource(syncStatus?.source);
  document.getElementById("policy-sync-entry-count").textContent = String(syncStatus?.entryCount ?? 0);
  document.getElementById("policy-sync-updated-at").textContent = formatUpdatedAt(syncStatus?.updatedAt);

  const errorLabel = document.getElementById("policy-sync-error-label");
  const errorElement = document.getElementById("policy-sync-error");
  if (syncStatus?.error) {
    errorLabel.hidden = false;
    errorElement.hidden = false;
    errorElement.textContent = syncStatus.error;
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
  applySyncStatus(snapshot?.syncStatus);

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
  applySyncStatus({ state: "syncing", source: "native_host", entryCount: 0 });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const host = hostFromUrl(tab?.url ?? "");
    const snapshot = await requestPolicySnapshot(MESSAGE_TYPES.HOST_POLICY_SYNC_REFRESH);
    const policy = {
      ...HOST_POLICY_SHAPE,
      ...(snapshot?.policy ?? {})
    };

    document.getElementById("host-policy").textContent = labelForPolicy(policy, host);
    applySyncStatus(snapshot?.syncStatus);
  } catch (error) {
    applySyncStatus({
      state: "error",
      source: "native_host",
      entryCount: 0,
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unable to refresh policy"
    });
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
    error: error instanceof Error ? error.message : "Unable to read status"
  });
});
