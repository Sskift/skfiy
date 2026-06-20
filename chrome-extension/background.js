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
  HOST_POLICY_SYNC_STATUS: "skfiy.host_policy.sync_status",
  HOST_POLICY_SYNC_REFRESH: "skfiy.host_policy.sync_refresh",
  NATIVE_MESSAGE: "skfiy.native.message"
});

const HOST_POLICY_STORAGE_KEY = "skfiyHostPolicy";
const HOST_POLICY_SYNC_STORAGE_KEY = "skfiyHostPolicySync";
const LAST_SENSITIVE_PAUSE_KEY = "lastSensitivePause";
const HOST_POLICY_SYNC_REQUEST_PREFIX = "host-policy-sync";
const FALLBACK_EXTENSION_MANIFEST = Object.freeze({
  manifest_version: 3,
  name: "skfiy Chrome Adapter",
  version: "0.0.1",
  minimum_chrome_version: "116",
  permissions: ["activeTab", "downloads", "nativeMessaging", "scripting", "storage", "tabs"],
  optional_host_permissions: ["http://*/*", "https://*/*"]
});

let hostPolicySyncPromise = null;

function readExtensionManifest() {
  if (typeof chrome.runtime.getManifest === "function") {
    return chrome.runtime.getManifest();
  }

  return FALLBACK_EXTENSION_MANIFEST;
}

function readExtensionDiagnostics() {
  const manifest = {
    ...FALLBACK_EXTENSION_MANIFEST,
    ...readExtensionManifest()
  };
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const optionalHostPermissions = Array.isArray(manifest.optional_host_permissions)
    ? manifest.optional_host_permissions
    : [];

  return {
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    id: chrome.runtime.id ?? null,
    name: manifest.name ?? FALLBACK_EXTENSION_MANIFEST.name,
    version: manifest.version ?? FALLBACK_EXTENSION_MANIFEST.version,
    manifestVersion: manifest.manifest_version ?? FALLBACK_EXTENSION_MANIFEST.manifest_version,
    minimumChromeVersion: manifest.minimum_chrome_version ?? null,
    capabilities: {
      activeTab: permissions.includes("activeTab"),
      downloads: permissions.includes("downloads"),
      nativeMessaging: permissions.includes("nativeMessaging"),
      scripting: permissions.includes("scripting"),
      storage: permissions.includes("storage"),
      tabs: permissions.includes("tabs"),
      optionalHostPermissions
    }
  };
}

function getHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function getHostPermissionDetails(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return {
      origin: parsedUrl.origin,
      host: parsedUrl.host,
      permissionOrigin: `${parsedUrl.protocol}//${parsedUrl.hostname}/*`
    };
  } catch {
    return null;
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

function countHostPolicyEntries(policy) {
  return [
    policy?.allowedHosts,
    policy?.currentTurnAllowedHosts,
    policy?.blockedHosts
  ].reduce((count, entries) => {
    return count + (Array.isArray(entries) ? entries.length : 0);
  }, 0);
}

async function readHostPolicySyncStatus(policyOverride) {
  const policy = policyOverride ?? await readHostPolicy();
  const stored = await chrome.storage.local.get(HOST_POLICY_SYNC_STORAGE_KEY);
  const status = stored[HOST_POLICY_SYNC_STORAGE_KEY] ?? {};
  const entryCount = countHostPolicyEntries(policy);
  const lastError = status.lastError ?? status.error ?? null;

  return {
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    state: status.state ?? "unknown",
    source: status.source ?? (status.state === "synced" ? "native_host" : "local_storage"),
    updatedAt: status.updatedAt ?? null,
    entryCount,
    trigger: status.trigger ?? null,
    requestId: status.requestId ?? null,
    requestedAt: status.requestedAt ?? null,
    completedAt: status.completedAt ?? null,
    hostPolicyState: status.hostPolicyState ?? null,
    nativeHostPolicyState: status.nativeHostPolicyState ?? status.hostPolicyState ?? null,
    lastError,
    error: status.error ?? null
  };
}

async function readHostPolicySnapshot() {
  const policy = await readHostPolicy();
  const syncStatus = await readHostPolicySyncStatus(policy);
  return {
    policy,
    syncStatus,
    diagnostics: createDiagnostics(policy, syncStatus)
  };
}

function createDiagnostics(policy, syncStatus) {
  const extension = readExtensionDiagnostics();
  const hostPolicyEntryCounts = {
    allowedHosts: Array.isArray(policy.allowedHosts) ? policy.allowedHosts.length : 0,
    currentTurnAllowedHosts: Array.isArray(policy.currentTurnAllowedHosts)
      ? policy.currentTurnAllowedHosts.length
      : 0,
    blockedHosts: Array.isArray(policy.blockedHosts) ? policy.blockedHosts.length : 0
  };

  return {
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    extension: {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      manifestVersion: extension.manifestVersion,
      minimumChromeVersion: extension.minimumChromeVersion
    },
    capabilities: extension.capabilities,
    nativeHost: {
      name: NATIVE_MESSAGING_HOST_NAME,
      syncState: syncStatus.state,
      policyState: syncStatus.nativeHostPolicyState ?? syncStatus.hostPolicyState,
      lastError: syncStatus.lastError,
      lastRequestId: syncStatus.requestId,
      lastTrigger: syncStatus.trigger,
      updatedAt: syncStatus.updatedAt
    },
    hostPolicy: {
      defaultMode: policy.defaultMode,
      entryCount: countHostPolicyEntries(policy),
      ...hostPolicyEntryCounts
    }
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

function normalizeSyncTrigger(trigger) {
  if (typeof trigger !== "string" || trigger.trim().length === 0) {
    return "manual";
  }
  return trigger.trim().replace(/[^a-z0-9_.-]/gi, "_").slice(0, 64);
}

async function writeHostPolicySyncStatus(status) {
  await chrome.storage.local.set({
    [HOST_POLICY_SYNC_STORAGE_KEY]: {
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      ...status
    }
  });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE]
  });
}

async function ensureHostPermission(tab) {
  const permissionDetails = getHostPermissionDetails(tab?.url ?? "");
  if (!permissionDetails) {
    return { ok: true };
  }

  const hasPermission = await chrome.permissions.contains({
    origins: [permissionDetails.permissionOrigin]
  });

  if (hasPermission) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "chrome_host_permission_missing",
    code: "chrome_host_permission_missing",
    ...permissionDetails
  };
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

  const permissionDecision = await ensureHostPermission(tab);
  if (!permissionDecision.ok) {
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      result: "blocked",
      reason: permissionDecision.reason,
      code: permissionDecision.code,
      host,
      origin: permissionDecision.origin,
      chromeHostPermission: {
        origins: [permissionDecision.permissionOrigin]
      },
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

export async function syncHostPolicy(trigger = "manual") {
  const normalizedTrigger = normalizeSyncTrigger(trigger);
  const requestedAt = new Date().toISOString();
  const requestId = `${HOST_POLICY_SYNC_REQUEST_PREFIX}-${normalizedTrigger}-${Date.now()}`;

  await writeHostPolicySyncStatus({
    state: "syncing",
    trigger: normalizedTrigger,
    requestId,
    requestedAt
  });

  try {
    const response = await sendNativeMessage({
      type: MESSAGE_TYPES.HOST_POLICY_REQUEST,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId
    }, {
      syncHostPolicy: false
    });
    const completedAt = new Date().toISOString();

    if (response?.hostPolicy?.policy) {
      await writeHostPolicySyncStatus({
        state: "synced",
        source: "native_host",
        trigger: normalizedTrigger,
        requestId,
        requestedAt,
        completedAt,
        hostPolicyState: response.hostPolicy.state ?? "unknown",
        nativeHostPolicyState: response.hostPolicy.state ?? "unknown",
        entryCount: countHostPolicyEntries(response.hostPolicy.policy)
      });
    } else {
      const message = response?.error ?? response?.reason ?? "host_policy_unavailable";
      await writeHostPolicySyncStatus({
        state: "error",
        source: "native_host",
        trigger: normalizedTrigger,
        requestId,
        requestedAt,
        completedAt,
        entryCount: countHostPolicyEntries(await readHostPolicy()),
        lastError: message,
        error: message
      });
    }

    return response;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);

    await writeHostPolicySyncStatus({
      state: "error",
      source: "native_host",
      trigger: normalizedTrigger,
      requestId,
      requestedAt,
      completedAt,
      entryCount: countHostPolicyEntries(await readHostPolicy()),
      lastError: message,
      error: message
    });

    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId,
      ok: false,
      error: message
    };
  }
}

function scheduleHostPolicySync(trigger) {
  if (!hostPolicySyncPromise) {
    hostPolicySyncPromise = syncHostPolicy(trigger).finally(() => {
      hostPolicySyncPromise = null;
    });
  }
  return hostPolicySyncPromise;
}

function sendNativeMessage(message, options = {}) {
  return new Promise((resolve) => {
    const nativeMessage = unwrapNativeMessage(message);
    if (options.syncHostPolicy !== false && nativeMessage.type !== MESSAGE_TYPES.HOST_POLICY_REQUEST) {
      void scheduleHostPolicySync("native_host_connect");
    }

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
        requestId: nativeMessage.requestId ?? "unknown",
        ok: false,
        error: chrome.runtime.lastError?.message ?? "native_host_disconnected"
      });
    });
    port.postMessage(nativeMessage);
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
    const { policy, syncStatus, diagnostics } = await readHostPolicySnapshot();
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      policy,
      syncStatus,
      diagnostics
    };
  }

  if (message?.type === MESSAGE_TYPES.HOST_POLICY_SYNC_STATUS) {
    const { policy, syncStatus, diagnostics } = await readHostPolicySnapshot();
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      policy,
      syncStatus,
      diagnostics
    };
  }

  if (message?.type === MESSAGE_TYPES.HOST_POLICY_SYNC_REFRESH) {
    await syncHostPolicy("popup_manual");
    const { policy, syncStatus, diagnostics } = await readHostPolicySnapshot();
    return {
      type: MESSAGE_TYPES.HOST_POLICY_RESPONSE,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: message.requestId,
      policy,
      syncStatus,
      diagnostics
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

globalThis.skfiyChromeAdapterDiagnostics = Object.freeze({
  readStatus(requestId = "extension-diagnostics") {
    return handleRuntimeMessage({
      type: MESSAGE_TYPES.HOST_POLICY_SYNC_STATUS,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId
    });
  },
  refreshHostPolicy(requestId = "extension-diagnostics-refresh") {
    return handleRuntimeMessage({
      type: MESSAGE_TYPES.HOST_POLICY_SYNC_REFRESH,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleRuntimeMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void scheduleHostPolicySync("runtime_installed");
});

chrome.runtime.onStartup.addListener(() => {
  void scheduleHostPolicySync("runtime_startup");
});
