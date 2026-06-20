const DEFAULT_POLICY_LABEL = "Ask by default";
const SENSITIVE_PAUSE_LABEL = "Sensitive content pause";
const HOST_POLICY_STORAGE_KEY = "skfiyHostPolicy";
const LAST_SENSITIVE_PAUSE_KEY = "lastSensitivePause";

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

async function renderPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = hostFromUrl(tab?.url ?? "");
  const stored = await chrome.storage.local.get([HOST_POLICY_STORAGE_KEY, LAST_SENSITIVE_PAUSE_KEY]);
  const policy = stored[HOST_POLICY_STORAGE_KEY] ?? { defaultMode: "ask" };
  const sensitivePause = stored[LAST_SENSITIVE_PAUSE_KEY];

  document.getElementById("connection-status").textContent = "Waiting for skfiy app";
  document.getElementById("current-host").textContent = host || "Unknown";
  document.getElementById("host-policy").textContent = labelForPolicy(policy, host);

  const pauseElement = document.getElementById("sensitive-pause");
  if (sensitivePause?.host === host) {
    pauseElement.hidden = false;
    pauseElement.textContent = `${SENSITIVE_PAUSE_LABEL}: ${sensitivePause.reason ?? "review required"}`;
  } else {
    pauseElement.hidden = true;
    pauseElement.textContent = SENSITIVE_PAUSE_LABEL;
  }
}

void renderPopup().catch((error) => {
  document.getElementById("connection-status").textContent =
    error instanceof Error ? error.message : "Unable to read status";
});
