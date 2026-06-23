export type BrowserPageContextState =
  | "ready"
  | "partial"
  | "blocked"
  | "blocked_by_chrome_host_permission"
  | "blocked_by_host_policy"
  | "active_tab_unavailable"
  | "content_script_not_loaded"
  | "not_loaded"
  | "sensitive-paused"
  | "not-probed"
  | "missing"
  | "stale"
  | "unavailable";

export interface BrowserPageContext {
  state: BrowserPageContextState;
  url?: string;
  title?: string;
  visibleText?: string;
  observedAt?: string;
  reason?: string;
  nextAction?: string;
}

const MAX_VISIBLE_TEXT_CHARS = 2_000;

export function createBrowserPageContextFromConnection(connection: unknown): BrowserPageContext {
  const record = readRecord(connection);

  if (!record) {
    return normalizeBrowserPageContext(undefined);
  }

  const connectionState = readOptionalString(record.state);
  const connectionObservedAt = readOptionalString(record.observedAt);
  const pageObservation = readRecord(record.pageObservation)
    ?? readRecord(readRecord(record.latestCommand)?.pageObservation);
  const pageControl = readRecord(record.pageControl)
    ?? readRecord(pageObservation?.pageControl);

  if (connectionState === "stale") {
    return normalizeBrowserPageContext({
      state: "stale",
      observedAt: connectionObservedAt,
      reason: readOptionalString(record.reason)
        ?? "Chrome page context heartbeat is stale.",
      nextAction: "Refresh the skfiy Chrome extension before using Browser Context."
    });
  }

  if (connectionState === "invalid") {
    return normalizeBrowserPageContext({
      state: "unavailable",
      observedAt: connectionObservedAt,
      reason: readOptionalString(record.reason)
        ?? "Chrome page context heartbeat is invalid.",
      nextAction: "Refresh the skfiy Chrome extension before using Browser Context."
    });
  }

  if (pageObservation) {
    return normalizeBrowserPageContext({
      state: normalizeConnectionStateForContext(readOptionalString(pageControl?.state) ?? connectionState),
      url: readOptionalString(pageObservation.url),
      title: readOptionalString(pageObservation.title),
      visibleText: readOptionalString(pageObservation.visibleText),
      observedAt: readOptionalString(pageObservation.observedAt) ?? connectionObservedAt,
      reason: readOptionalString(pageControl?.reason) ?? readOptionalString(record.reason),
      nextAction: readOptionalString(pageControl?.nextAction)
    });
  }

  if (pageControl) {
    return normalizeBrowserPageContext({
      state: normalizeConnectionStateForContext(readOptionalString(pageControl.state) ?? connectionState),
      observedAt: connectionObservedAt,
      reason: readOptionalString(pageControl.reason) ?? readOptionalString(record.reason),
      nextAction: readOptionalString(pageControl.nextAction)
    });
  }

  return normalizeBrowserPageContext({
    state: connectionState === "connected" ? "missing" : normalizeConnectionStateForContext(connectionState),
    observedAt: connectionObservedAt,
    reason: connectionState === "unavailable"
      ? readOptionalString(record.reason) ?? "Chrome page context is unavailable."
      : "Chrome page context has not been observed yet.",
    nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
  });
}

export function normalizeBrowserPageContext(raw: unknown): BrowserPageContext {
  const record = readRecord(raw);

  if (!record) {
    return {
      state: "missing",
      reason: "Chrome page context has not been observed yet.",
      nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
    };
  }

  const state = readBrowserPageContextState(record.state);
  const visibleText = readOptionalString(record.visibleText);

  return {
    state,
    ...(readOptionalString(record.url) ? { url: readOptionalString(record.url) } : {}),
    ...(readOptionalString(record.title) ? { title: readOptionalString(record.title) } : {}),
    ...(visibleText ? { visibleText: visibleText.slice(0, MAX_VISIBLE_TEXT_CHARS) } : {}),
    ...(readOptionalString(record.observedAt) ? { observedAt: readOptionalString(record.observedAt) } : {}),
    ...(readOptionalString(record.reason) ? { reason: readOptionalString(record.reason) } : {}),
    ...(readOptionalString(record.nextAction) ? { nextAction: readOptionalString(record.nextAction) } : {})
  };
}

export function createBrowserPageContextPromptBlock(context: BrowserPageContext): string {
  const lines = context.state === "ready" || context.state === "partial"
    ? [
        "Browser Context:",
        "Current Chrome page",
        `State: ${context.state}`,
        `URL: ${context.url ?? "unknown"}`,
        `Title: ${context.title ?? "unknown"}`,
        `Observed at: ${context.observedAt ?? "unknown"}`,
        "Visible text:",
        context.visibleText ?? ""
      ]
    : [
        "Browser Context:",
        "Browser context unavailable",
        `State: ${context.state}`,
        `Reason: ${context.reason ?? "Chrome page context is not ready."}`,
        ...(context.nextAction ? [`Next action: ${context.nextAction}`] : [])
      ];

  return lines.join("\n").trim();
}

function readBrowserPageContextState(value: unknown): BrowserPageContextState {
  if (
    value === "ready"
    || value === "partial"
    || value === "blocked"
    || value === "blocked_by_chrome_host_permission"
    || value === "blocked_by_host_policy"
    || value === "active_tab_unavailable"
    || value === "content_script_not_loaded"
    || value === "not_loaded"
    || value === "sensitive-paused"
    || value === "not-probed"
    || value === "missing"
    || value === "stale"
    || value === "unavailable"
  ) {
    return value;
  }

  return "missing";
}

function normalizeConnectionStateForContext(value: string | undefined): BrowserPageContextState {
  if (value === "connected") {
    return "ready";
  }
  if (value === "invalid") {
    return "unavailable";
  }

  return readBrowserPageContextState(value);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
