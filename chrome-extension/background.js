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
  PAGE_DIAGNOSTICS: "skfiy.page.diagnostics",
  PAGE_DIAGNOSTICS_RESULT: "skfiy.page.diagnostics_result",
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

function createHostPermissionMessage(permissionDetails) {
  return `Missing optional Chrome host permission for ${permissionDetails.permissionOrigin}. Grant site access before page diagnostics or actions can run.`;
}

function readErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
  const nativeBridgeState = status.nativeBridgeState
    ?? (status.state === "synced"
      ? "connected"
      : status.state === "syncing"
        ? "connecting"
        : status.state === "error"
          ? "unavailable"
          : "unknown");

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
    nativeBridgeState,
    nativeLaunchOrigin: status.nativeLaunchOrigin ?? null,
    nativeMessageType: status.nativeMessageType ?? null,
    nativeResponseType: status.nativeResponseType ?? null,
    nativeResponseResult: status.nativeResponseResult ?? null,
    lastError,
    error: status.error ?? null
  };
}

async function readActiveTabDiagnosticsTarget() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return {
      tab: Array.isArray(tabs) ? tabs[0] : undefined,
      lastError: null
    };
  } catch (error) {
    return {
      tab: undefined,
      lastError: readErrorMessage(error)
    };
  }
}

async function readChromeHostPermissionStatus(permissionDetails) {
  if (!permissionDetails) {
    return {
      state: "not_applicable",
      reason: "non_http_page",
      origins: []
    };
  }

  const origins = [permissionDetails.permissionOrigin];
  if (typeof chrome.permissions?.contains !== "function") {
    return {
      state: "unknown",
      reason: "permissions_api_unavailable",
      code: "chrome_host_permission_unknown",
      origin: permissionDetails.origin,
      host: permissionDetails.host,
      origins
    };
  }

  try {
    const granted = await chrome.permissions.contains({ origins });
    if (granted) {
      return {
        state: "granted",
        origin: permissionDetails.origin,
        host: permissionDetails.host,
        origins
      };
    }

    return {
      state: "missing",
      reason: "chrome_host_permission_missing",
      code: "chrome_host_permission_missing",
      origin: permissionDetails.origin,
      host: permissionDetails.host,
      origins,
      message: createHostPermissionMessage(permissionDetails)
    };
  } catch (error) {
    return {
      state: "unknown",
      reason: "permissions_check_failed",
      code: "chrome_host_permission_unknown",
      origin: permissionDetails.origin,
      host: permissionDetails.host,
      origins,
      lastError: readErrorMessage(error)
    };
  }
}

async function readContentScriptSession(tab, policyDecision, hostPermission) {
  if (!Number.isInteger(tab?.id)) {
    return {
      state: "unavailable",
      reason: "missing_tab_id"
    };
  }

  if (policyDecision.decision !== "allowed") {
    return {
      state: "blocked_by_host_policy",
      reason: policyDecision.reason
    };
  }

  if (hostPermission.state !== "granted" && hostPermission.state !== "not_applicable") {
    return {
      state: "blocked_by_chrome_host_permission",
      reason: hostPermission.reason,
      lastError: hostPermission.message ?? hostPermission.lastError ?? null
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.PAGE_DIAGNOSTICS,
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      requestId: `content-diagnostics-${Date.now()}`
    });

    if (response?.type === MESSAGE_TYPES.PAGE_DIAGNOSTICS_RESULT && response.session) {
      return {
        state: "loaded",
        ...response.session
      };
    }

    return {
      state: "not_loaded",
      reason: "diagnostics_response_missing"
    };
  } catch (error) {
    const lastError = readErrorMessage(error);
    return {
      state: lastError.includes("Receiving end does not exist") ? "not_loaded" : "unavailable",
      reason: lastError.includes("Receiving end does not exist")
        ? "content_script_not_loaded"
        : "content_script_unavailable",
      lastError
    };
  }
}

async function readCurrentTabDiagnostics(policy) {
  const { tab, lastError } = await readActiveTabDiagnosticsTarget();
  if (!tab) {
    return {
      state: "unavailable",
      host: "",
      hostPolicy: {
        decision: "blocked",
        reason: "active_tab_unavailable"
      },
      chromeHostPermission: {
        state: "unknown",
        reason: "active_tab_unavailable",
        origins: []
      },
      contentScript: {
        state: "not_queried",
        reason: "active_tab_unavailable"
      },
      lastError
    };
  }

  const host = getHost(tab.url ?? "");
  const permissionDetails = getHostPermissionDetails(tab.url ?? "");
  const policyDecision = decideHostPolicy(policy, host);
  const hostPermission = await readChromeHostPermissionStatus(permissionDetails);
  const contentScript = await readContentScriptSession(tab, policyDecision, hostPermission);

  return {
    state: "available",
    tabId: tab.id ?? null,
    windowId: tab.windowId ?? null,
    host,
    origin: permissionDetails?.origin ?? null,
    hostPolicy: policyDecision,
    chromeHostPermission: hostPermission,
    contentScript
  };
}

async function readHostPolicySnapshot() {
  const policy = await readHostPolicy();
  const syncStatus = await readHostPolicySyncStatus(policy);
  const currentTab = await readCurrentTabDiagnostics(policy);
  return {
    policy,
    syncStatus,
    diagnostics: createDiagnostics(policy, syncStatus, currentTab)
  };
}

function readNativeHostConnectionState(syncStatus) {
  switch (syncStatus.state) {
    case "synced":
      return "connected";
    case "syncing":
      return "connecting";
    case "error":
      return "unavailable";
    default:
      return "unknown";
  }
}

function createDiagnostics(policy, syncStatus, currentTab) {
  const extension = readExtensionDiagnostics();
  const nativeHostLastError = syncStatus.lastError ?? syncStatus.error ?? null;
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
      connectionState: readNativeHostConnectionState(syncStatus),
      bridgeState: syncStatus.nativeBridgeState ?? readNativeHostConnectionState(syncStatus),
      syncState: syncStatus.state,
      syncSource: syncStatus.source,
      policyState: syncStatus.nativeHostPolicyState ?? syncStatus.hostPolicyState,
      launchOrigin: syncStatus.nativeLaunchOrigin ?? null,
      messageType: syncStatus.nativeMessageType ?? null,
      responseType: syncStatus.nativeResponseType ?? null,
      responseResult: syncStatus.nativeResponseResult ?? null,
      lastError: nativeHostLastError,
      lastRequestId: syncStatus.requestId,
      lastTrigger: syncStatus.trigger,
      updatedAt: syncStatus.updatedAt,
      requestedAt: syncStatus.requestedAt,
      completedAt: syncStatus.completedAt
    },
    hostPolicy: {
      defaultMode: policy.defaultMode,
      entryCount: countHostPolicyEntries(policy),
      ...hostPolicyEntryCounts
    },
    currentTab,
    session: {
      state: currentTab?.contentScript?.state ?? "not_queried",
      contentScript: currentTab?.contentScript ?? null,
      host: currentTab?.host ?? null
    },
    lastError: nativeHostLastError
      ?? currentTab?.chromeHostPermission?.lastError
      ?? currentTab?.chromeHostPermission?.message
      ?? currentTab?.contentScript?.lastError
      ?? currentTab?.lastError
      ?? null
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
    return {
      ok: true,
      chromeHostPermission: await readChromeHostPermissionStatus(permissionDetails)
    };
  }

  const chromeHostPermission = await readChromeHostPermissionStatus(permissionDetails);
  if (chromeHostPermission.state === "granted") {
    return {
      ok: true,
      chromeHostPermission
    };
  }

  return {
    ok: false,
    reason: chromeHostPermission.reason ?? "chrome_host_permission_missing",
    code: chromeHostPermission.code ?? "chrome_host_permission_missing",
    message: chromeHostPermission.message ?? chromeHostPermission.lastError ?? createHostPermissionMessage(permissionDetails),
    chromeHostPermission,
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
      message: permissionDecision.message,
      host,
      origin: permissionDecision.origin,
      chromeHostPermission: {
        state: permissionDecision.chromeHostPermission?.state ?? "missing",
        origins: [permissionDecision.permissionOrigin],
        message: permissionDecision.message
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
        nativeBridgeState: response.bridgeState ?? "connected",
        nativeLaunchOrigin: response.launchOrigin ?? null,
        nativeMessageType: response.messageType ?? MESSAGE_TYPES.HOST_POLICY_REQUEST,
        nativeResponseType: response.type ?? null,
        nativeResponseResult: response.result ?? null,
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
        nativeBridgeState: response?.bridgeState ?? "unavailable",
        nativeLaunchOrigin: response?.launchOrigin ?? null,
        nativeMessageType: response?.messageType ?? null,
        nativeResponseType: response?.type ?? null,
        nativeResponseResult: response?.result ?? null,
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
      nativeBridgeState: "unavailable",
      nativeLaunchOrigin: null,
      nativeMessageType: MESSAGE_TYPES.HOST_POLICY_REQUEST,
      nativeResponseType: null,
      nativeResponseResult: null,
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
