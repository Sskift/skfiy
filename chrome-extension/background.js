export const NATIVE_MESSAGING_HOST_NAME = "com.sskift.skfiy";
export const CONTENT_SCRIPT_FILE = "content-script.js";
export const MESSAGE_SCHEMA_VERSION = 1;

export const HOST_POLICY_SHAPE = Object.freeze({
  defaultMode: "ask",
  allowedHosts: [],
  currentTurnAllowedHosts: [],
  blockedHosts: []
});

export const MESSAGE_TYPES = Object.freeze({
  PAGE_OBSERVE: "skfiy.page.observe",
  PAGE_OBSERVE_RESULT: "skfiy.page.observe_result",
  PAGE_ACTION: "skfiy.page.action",
  PAGE_ACTION_RESULT: "skfiy.page.action_result",
  PAGE_SCREENSHOT: "skfiy.page.screenshot",
  PAGE_SCREENSHOT_RESULT: "skfiy.page.screenshot_result",
  DOWNLOADS_STATUS: "skfiy.downloads.status",
  DOWNLOADS_STATUS_RESULT: "skfiy.downloads.status_result",
  PAGE_SENSITIVE_PAUSE: "skfiy.page.sensitive_pause",
  HOST_POLICY_REQUEST: "skfiy.host_policy.request",
  HOST_POLICY_RESPONSE: "skfiy.host_policy.response",
  NATIVE_MESSAGE: "skfiy.native.message"
});

const HOST_POLICY_STORAGE_KEY = "skfiyHostPolicy";
const LAST_SENSITIVE_PAUSE_KEY = "lastSensitivePause";

function getHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function clampDownloadsLimit(value) {
  if (!Number.isFinite(value)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.trunc(value)));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readHostPolicy() {
  const stored = await chrome.storage.local.get(HOST_POLICY_STORAGE_KEY);
  return {
    ...HOST_POLICY_SHAPE,
    ...(stored[HOST_POLICY_STORAGE_KEY] ?? {})
  };
}

function decideHostPolicy(policy, host) {
  if (!host) {
    return { decision: "blocked", reason: "missing_host" };
  }
  if (policy.blockedHosts.includes(host)) {
    return { decision: "blocked", reason: "blocked_host" };
  }
  if (policy.allowedHosts.includes(host) || policy.currentTurnAllowedHosts.includes(host)) {
    return { decision: "allowed", reason: "host_allowed" };
  }
  return { decision: policy.defaultMode, reason: "default_policy" };
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE]
  });
}

async function routePageMessage(message) {
  const tab = message.tabId ? await chrome.tabs.get(message.tabId) : await getActiveTab();
  const host = getHost(tab?.url ?? "");
  const policy = await readHostPolicy();
  const policyDecision = decideHostPolicy(policy, host);

  if (!tab?.id || policyDecision.decision !== "allowed") {
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      host,
      policyDecision
    };
  }

  await ensureContentScript(tab.id);
  return chrome.tabs.sendMessage(tab.id, {
    ...message,
    schemaVersion: MESSAGE_SCHEMA_VERSION
  });
}

async function routePageScreenshot(message) {
  const tab = message.tabId ? await chrome.tabs.get(message.tabId) : await getActiveTab();
  const host = getHost(tab?.url ?? "");
  const policy = await readHostPolicy();
  const policyDecision = decideHostPolicy(policy, host);

  if (!tab?.id || policyDecision.decision !== "allowed") {
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      host,
      policyDecision
    };
  }

  const format = message.payload?.format === "jpeg" ? "jpeg" : "png";
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format,
    ...(format === "jpeg" && typeof message.payload?.quality === "number"
      ? { quality: message.payload.quality }
      : {})
  });

  return {
    type: MESSAGE_TYPES.PAGE_SCREENSHOT_RESULT,
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    requestId: message.requestId,
    host,
    tabId: tab.id,
    format,
    dataUrl
  };
}

async function readDownloadsStatus(message) {
  const limit = clampDownloadsLimit(message.payload?.limit);
  const includeFilePaths = message.payload?.includeFilePaths === true;

  if (includeFilePaths && message.payload?.confirmed !== true) {
    return {
      type: MESSAGE_TYPES.DOWNLOADS_STATUS_RESULT,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      result: "blocked",
      reason: "download_path_exposure_requires_confirmation"
    };
  }

  const downloads = await chrome.downloads.search({
    limit,
    orderBy: ["-startTime"]
  });

  return {
    type: MESSAGE_TYPES.DOWNLOADS_STATUS_RESULT,
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    requestId: message.requestId,
    downloads: downloads.map((download) => ({
      id: download.id,
      state: download.state,
      danger: download.danger,
      paused: download.paused,
      exists: download.exists,
      canResume: download.canResume,
      mime: download.mime,
      bytesReceived: download.bytesReceived,
      totalBytes: download.totalBytes,
      startTime: download.startTime,
      endTime: download.endTime,
      urlHost: getHost(download.url ?? ""),
      ...(includeFilePaths ? { filename: download.filename } : {})
    }))
  };
}

function unwrapNativeMessage(message) {
  const payload = message?.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
    ? message.payload
    : message;

  return {
    ...payload,
    requestId: payload.requestId ?? message.requestId,
    schemaVersion: MESSAGE_SCHEMA_VERSION
  };
}

async function persistHostPolicyResponse(response) {
  if (response?.hostPolicy?.policy) {
    await chrome.storage.local.set({
      [HOST_POLICY_STORAGE_KEY]: {
        ...HOST_POLICY_SHAPE,
        ...response.hostPolicy.policy
      }
    });
  }
}

function sendNativeMessage(message) {
  return new Promise((resolve) => {
    const port = chrome.runtime.connectNative(NATIVE_MESSAGING_HOST_NAME);
    let settled = false;
    const finish = (response) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        port.disconnect();
      } catch {
        // The port may already be closed by Chrome after the response frame.
      }
      resolve(response);
    };

    port.onMessage.addListener((response) => {
      void persistHostPolicyResponse(response).finally(() => finish(response));
    });
    port.onDisconnect.addListener(() => {
      finish({
        type: MESSAGE_TYPES.NATIVE_MESSAGE,
        schemaVersion: MESSAGE_SCHEMA_VERSION,
        requestId: message.requestId ?? "unknown",
        ok: false,
        error: chrome.runtime.lastError?.message ?? "native_host_disconnected"
      });
    });
    port.postMessage(unwrapNativeMessage(message));
  });
}

async function handleRuntimeMessage(message) {
  if (message?.type === MESSAGE_TYPES.PAGE_OBSERVE || message?.type === MESSAGE_TYPES.PAGE_ACTION) {
    return routePageMessage(message);
  }

  if (message?.type === MESSAGE_TYPES.PAGE_SCREENSHOT) {
    return routePageScreenshot(message);
  }

  if (message?.type === MESSAGE_TYPES.DOWNLOADS_STATUS) {
    return readDownloadsStatus(message);
  }

  if (message?.type === MESSAGE_TYPES.HOST_POLICY_REQUEST) {
    const policy = await readHostPolicy();
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      policy
    };
  }

  if (message?.type === MESSAGE_TYPES.PAGE_SENSITIVE_PAUSE) {
    await chrome.storage.local.set({
      [LAST_SENSITIVE_PAUSE_KEY]: {
        ...message,
        observedAt: new Date().toISOString()
      }
    });
    return { ok: true };
  }

  if (message?.type === MESSAGE_TYPES.NATIVE_MESSAGE) {
    return sendNativeMessage(message);
  }

  return { ok: false, error: "unsupported_message" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleRuntimeMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});
