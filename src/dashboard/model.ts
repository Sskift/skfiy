import type {
  DashboardKnowledgeGraph,
  DashboardKnowledgeGraphEdge,
  DashboardKnowledgeGraphNode,
  DashboardPendingPersonalMemoryWrite,
  DashboardPersonalMemoryActionResponse,
  DashboardPersonalMemoryJournalEntry,
  DashboardPersonalSkillActionResponse,
  DashboardPersonalMemoryUsageBucket,
  DashboardProviderSummary,
  DashboardSnapshot
} from "./contracts";
import {
  readRouteOutcome as readSharedRouteOutcome,
  type RouteOutcome,
  type RouteOutcomeKind
} from "../shared/route-outcome.js";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface DashboardStatusItem {
  label: string;
  value: string;
  tone: Tone;
}

export interface DashboardMutationReceipt {
  title: string;
  result: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardReadinessSummary {
  title: string;
  label: string;
  detail: string;
  tone: Tone;
}

export interface DashboardComputerUseReadiness {
  desktop: {
    value: string;
    detail: string;
    tone: Tone;
  };
  permissions: DashboardStatusItem[];
  accessSteps: DashboardComputerUseAccessStep[];
}

export interface DashboardAppReadinessLane {
  id: "chrome" | "finder" | "ghostty";
  title: string;
  value: string;
  detail: string;
  source: string;
  tone: Tone;
}

export interface DashboardDogfoodSummary {
  releaseState: string;
  releaseDriftState: string;
  cohortLabel: string;
  detail: string;
  tone: Tone;
}

export interface DashboardCapabilitySummary {
  id: "assistant-provider" | "computer-use" | "browser-context" | "current-turn";
  title: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface DashboardRecentActivity {
  latestMessage: string;
  turnState: string;
  replayState: string;
  command?: string;
  targetApp?: string;
  actionCount?: number;
  screenshotCount?: number;
  verificationCount?: number;
}

export type DashboardRouteOutcomeKind = RouteOutcomeKind;
export type DashboardRouteOutcome = RouteOutcome;

export interface DashboardAssistantProviderView {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface DashboardLatestTaskSignal {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  source: string;
}

export interface DashboardRuntimeEvidenceSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface DashboardNextAction {
  title: string;
  detail: string;
  tone: Tone;
  source: string;
}

export interface DashboardChromeHostPolicySummary {
  state: string;
  reason?: string;
  source?: string;
  updatedAt?: string;
  defaultMode: string;
  entries: string[];
  tone: Tone;
}

export interface DashboardBrowserContextSummary {
  state: string;
  label: string;
  tone: Tone;
  source?: string;
  url?: string;
  title?: string;
  observedAt?: string;
  reason: string;
  nextAction?: string;
}

export interface DashboardBrowserContextAccessStep {
  id: string;
  label: string;
  detail: string;
  tone: Tone;
}

export interface DashboardComputerUseAccessStep {
  id: string;
  label: string;
  detail: string;
  tone: Tone;
}

export interface DashboardChromeControlState {
  label: string;
  host: string;
  activeTabLabel: string;
  tabId?: number;
  windowId?: number;
  extensionId?: string;
  chromeAppName?: string;
  liveConnection: string;
  nativeHostState: string;
  tone: Tone;
  capabilities: string[];
  capable: boolean;
  actionable: boolean;
  actionUnavailableReason?: string;
  reason: string;
  nextAction?: string;
  contentScript?: string;
  screenshotLane: string;
  tabDiscoveryLabel: string;
  tabDiscoveryReason?: string;
  browserContext: DashboardBrowserContextSummary;
  browserContextAccessSteps: DashboardBrowserContextAccessStep[];
  hostPolicy: DashboardChromeHostPolicySummary;
}

export function readKnowledgeGraph(snapshot: DashboardSnapshot): DashboardKnowledgeGraph {
  const nodes: DashboardKnowledgeGraphNode[] = [];
  const edges: DashboardKnowledgeGraphEdge[] = [];
  const assistant = readAssistantProviderView(snapshot);
  const assistantProvider = readProviderSummaries(snapshot)
    .find((provider) => provider.provider === "assistant");
  const providerId = `provider:${sanitizeNodeId(assistantProvider?.mode ?? assistant.value)}`;
  const personalMemory = snapshot.personalMemory;
  const pendingMemoryWrites = personalMemory?.pendingWrites ?? [];
  const memoryJournal = personalMemory?.memoryJournal ?? [];
  const workingProfile = personalMemory?.workingProfile;
  const browserContext = readBrowserContextSummary(snapshot);
  const computerUse = readComputerUseReadiness(snapshot);
  const currentTurnState = readString(snapshot.currentTurn.state) ?? "idle";

  pushNode(nodes, {
    id: providerId,
    label: assistant.value,
    kind: "provider",
    tone: assistant.tone,
    detail: assistant.detail
  });

  pushNode(nodes, {
    id: "computer-use",
    label: "Computer Use",
    kind: "computer-use",
    tone: computerUse.desktop.tone,
    detail: computerUse.desktop.detail
  });

  if (currentTurnState !== "idle" || readString(snapshot.currentTurn.command)) {
    pushNode(nodes, {
      id: "turn:current",
      label: "Current turn",
      kind: "turn",
      tone: readLatestTaskSignal(snapshot).tone,
      detail: readString(snapshot.currentTurn.command) ?? readLatestMessage(snapshot)
    });
    pushEdge(edges, {
      from: "computer-use",
      to: "turn:current",
      label: snapshot.currentTurn.approvalRequired === true || currentTurnState.includes("approval")
        ? "requires approval"
        : "routes action"
    });
  }

  if (personalMemory && (personalMemory.userEntryCount > 0 || personalMemory.recentUserEntries.length > 0)) {
    pushNode(nodes, {
      id: "memory:user",
      label: "User preferences",
      kind: "memory",
      tone: readMemoryUsageTone(personalMemory.usage?.user),
      detail: createMemoryNodeDetail(
        personalMemory.userEntryCount,
        personalMemory.recentUserEntries[0],
        personalMemory.usage?.user
      )
    });
    pushEdge(edges, { from: "memory:user", to: providerId, label: "injects prompt" });
  }

  if (personalMemory && (personalMemory.agentEntryCount > 0 || personalMemory.recentAgentEntries.length > 0)) {
    pushNode(nodes, {
      id: "memory:agent",
      label: "Agent operating notes",
      kind: "memory",
      tone: readMemoryUsageTone(personalMemory.usage?.agent),
      detail: createMemoryNodeDetail(
        personalMemory.agentEntryCount,
        personalMemory.recentAgentEntries[0],
        personalMemory.usage?.agent
      )
    });
    pushEdge(edges, { from: "memory:agent", to: providerId, label: "guides behavior" });
  }

  if (personalMemory && personalMemory.sessionCount > 0) {
    const sessions = readRecentMemorySessions(personalMemory);
    if (sessions.length > 0) {
      sessions.forEach((session, index) => {
        const nodeId = index === 0 ? "session:latest" : `session:recent-${index + 1}`;
        pushNode(nodes, {
          id: nodeId,
          label: index === 0 ? "Latest session" : `Recent session ${index + 1}`,
          kind: "session",
          tone: "neutral",
          detail: createSessionNodeDetail(session)
        });
        pushEdge(edges, { from: providerId, to: nodeId, label: "answered" });
        pushEdge(edges, { from: nodeId, to: providerId, label: "recalls context" });
      });
    } else {
      pushNode(nodes, {
        id: "session:latest",
        label: "Latest session",
        kind: "session",
        tone: "neutral",
        detail: `${personalMemory.sessionCount} remembered sessions`
      });
    }
  }

  if (personalMemory && (
    personalMemory.userEntryCount > 0
    || personalMemory.agentEntryCount > 0
    || personalMemory.sessionCount > 0
    || pendingMemoryWrites.length > 0
    || memoryJournal.length > 0
  )) {
    pushNode(nodes, {
      id: "skill:memory-review",
      label: "Memory review",
      kind: "skill",
      tone: "neutral",
      detail: "Post-turn personalization distills durable notes."
    });
    if (nodes.some((node) => node.id === "memory:user")) {
      pushEdge(edges, { from: "skill:memory-review", to: "memory:user", label: "distills" });
    }
    if (nodes.some((node) => node.id === "memory:agent")) {
      pushEdge(edges, { from: "skill:memory-review", to: "memory:agent", label: "distills" });
    }
    nodes
      .filter((node) => node.kind === "session")
      .forEach((node) => {
        pushEdge(edges, { from: node.id, to: "skill:memory-review", label: "teaches" });
      });

    pendingMemoryWrites.forEach((write) => {
      const pendingId = `memory:pending:${sanitizeNodeId(write.id)}`;
      const targetId = write.target === "agent" ? "memory:agent" : "memory:user";
      pushNode(nodes, {
        id: pendingId,
        label: write.target === "agent" ? "Pending agent memory" : "Pending user memory",
        kind: "memory",
        tone: "warning",
        detail: createPendingMemoryNodeDetail(write)
      });
      pushEdge(edges, { from: "skill:memory-review", to: pendingId, label: "stages" });
      pushEdge(edges, { from: pendingId, to: targetId, label: "awaits approval" });
    });

    if (memoryJournal.length > 0) {
      pushNode(nodes, {
        id: "memory:evolution",
        label: "Memory evolution",
        kind: "memory",
        tone: memoryJournal.some((entry) => entry.stage === "pending") ? "warning" : "success",
        detail: createMemoryEvolutionNodeDetail(memoryJournal)
      });
      pushEdge(edges, { from: "skill:memory-review", to: "memory:evolution", label: "records timeline" });
    }

    memoryJournal.forEach((entry) => {
      const journalId = `memory:journal:${sanitizeNodeId(entry.id)}`;
      const targetId = entry.target === "agent" ? "memory:agent" : "memory:user";
      pushNode(nodes, {
        id: journalId,
        label: "Learning receipt",
        kind: "memory",
        tone: entry.stage === "pending" ? "warning" : "success",
        detail: createMemoryJournalNodeDetail(entry)
      });
      pushEdge(edges, { from: "skill:memory-review", to: journalId, label: "records receipt" });
      pushEdge(edges, { from: "memory:evolution", to: journalId, label: "orders receipt" });
      pushEdge(edges, {
        from: journalId,
        to: targetId,
        label: entry.stage === "pending" ? "awaits approval" : "updates memory"
      });
    });
  }

  for (const skill of personalMemory?.personalSkills ?? []) {
    const skillId = `skill:${sanitizeNodeId(skill.id)}`;
    pushNode(nodes, {
      id: skillId,
      label: skill.label,
      kind: "skill",
      tone: "success",
      detail: `${skill.kind} · ${skill.promptHint}`
    });
    if (nodes.some((node) => node.id === "memory:user")) {
      pushEdge(edges, { from: "memory:user", to: skillId, label: "distills skill" });
    }
    if (nodes.some((node) => node.id === "memory:agent")) {
      pushEdge(edges, { from: "memory:agent", to: skillId, label: "distills skill" });
    }
    nodes
      .filter((node) => node.kind === "session")
      .forEach((node) => {
        pushEdge(edges, { from: node.id, to: skillId, label: "teaches" });
      });
    pushEdge(edges, { from: skillId, to: providerId, label: "guides prompt" });
  }

  if (workingProfile) {
    pushNode(nodes, {
      id: "profile:working",
      label: workingProfile.label,
      kind: "memory",
      tone: "success",
      detail: workingProfile.summary
    });
    if (nodes.some((node) => node.id === "memory:user")) {
      pushEdge(edges, { from: "memory:user", to: "profile:working", label: "shapes profile" });
    }
    if (nodes.some((node) => node.id === "memory:agent")) {
      pushEdge(edges, { from: "memory:agent", to: "profile:working", label: "shapes profile" });
    }
    nodes
      .filter((node) => node.kind === "session")
      .forEach((node) => {
        pushEdge(edges, { from: node.id, to: "profile:working", label: "teaches profile" });
      });
    nodes
      .filter((node) => node.kind === "skill" && node.id !== "skill:memory-review")
      .forEach((node) => {
        pushEdge(edges, { from: node.id, to: "profile:working", label: "summarizes habit" });
      });
    pushEdge(edges, { from: "profile:working", to: providerId, label: "travels with prompt" });
  }

  if (browserContext.state !== "missing") {
    pushNode(nodes, {
      id: "browser:context",
      label: "Browser Context",
      kind: "browser",
      tone: browserContext.tone,
      detail: browserContext.title ?? browserContext.url ?? browserContext.reason
    });
    nodes
      .filter((node) => node.kind === "session")
      .forEach((node) => {
        pushEdge(edges, { from: "browser:context", to: node.id, label: "observed in" });
      });
  }

  snapshot.alerts.slice(0, 5).forEach((alert, index) => {
    const code = readString(alert.code) ?? `alert-${index + 1}`;
    const alertId = `alert:${sanitizeNodeId(code)}`;
    pushNode(nodes, {
      id: alertId,
      label: titleize(code),
      kind: "alert",
      tone: readAlertTone(alert),
      detail: readString(alert.message) ?? "Review dashboard alert."
    });
    pushEdge(edges, {
      from: alertId,
      to: readAlertGraphTarget(code, alert, providerId),
      label: "blocked by"
    });
  });

  return {
    nodes,
    edges: edges.filter((edge) => (
      nodes.some((node) => node.id === edge.from)
      && nodes.some((node) => node.id === edge.to)
    ))
  };
}

export function readPersonalMutationReceipt(
  response: DashboardPersonalMemoryActionResponse | DashboardPersonalSkillActionResponse | null | undefined
): DashboardMutationReceipt | null {
  if (!response) {
    return null;
  }

  const record = response as unknown as Record<string, unknown>;
  const result = readString(response.result) ?? "reported";
  const command = readString(response.command);
  const source = readString(response.source);
  const plannedMutation = readBoolean(record.plannedMutation);
  const executesSystemMutation = readBoolean(record.executesSystemMutation);
  const applied = readNumber(record.applied);
  const ignored = readNumber(record.ignored);
  const blocked = readNumber(record.blocked);
  const pendingWriteCount = readNumber(record.pendingWriteCount);
  const personalSkills = readRecord(record.personalSkills);
  const mutedSkillCount = readNumber(personalSkills?.mutedSkillCount);
  const items: DashboardStatusItem[] = [];

  if (command) {
    items.push({ label: "command", value: command, tone: "neutral" });
  }
  if (source) {
    items.push({ label: "source", value: source, tone: "neutral" });
  }
  if (typeof plannedMutation === "boolean") {
    items.push({
      label: "planned mutation",
      value: plannedMutation ? "yes" : "no",
      tone: plannedMutation ? "warning" : "success"
    });
  }
  if (typeof executesSystemMutation === "boolean") {
    items.push({
      label: "system mutation",
      value: executesSystemMutation ? "yes" : "no",
      tone: executesSystemMutation ? "warning" : "success"
    });
  }
  if (typeof applied === "number") {
    items.push({ label: "applied", value: String(applied), tone: applied > 0 ? "success" : "neutral" });
  }
  if (typeof ignored === "number") {
    items.push({ label: "ignored", value: String(ignored), tone: ignored > 0 ? "warning" : "neutral" });
  }
  if (typeof blocked === "number") {
    items.push({ label: "blocked", value: String(blocked), tone: blocked > 0 ? "danger" : "success" });
  }
  if (typeof pendingWriteCount === "number") {
    items.push({ label: "pending writes", value: String(pendingWriteCount), tone: pendingWriteCount > 0 ? "warning" : "success" });
  }
  if (typeof mutedSkillCount === "number") {
    items.push({ label: "muted skills", value: String(mutedSkillCount), tone: mutedSkillCount > 0 ? "warning" : "success" });
  }

  return {
    title: command === "dashboard personal skills" ? "Personal skill mutation receipt" : "Personal memory mutation receipt",
    result,
    tone: readMutationReceiptTone({ result, blocked }),
    items
  };
}

function readRecentMemorySessions(
  personalMemory: NonNullable<DashboardSnapshot["personalMemory"]>
) {
  if (Array.isArray(personalMemory.recentSessions) && personalMemory.recentSessions.length > 0) {
    return personalMemory.recentSessions.slice(0, 3);
  }

  return personalMemory.latestSession ? [personalMemory.latestSession] : [];
}

function createSessionNodeDetail(
  session: NonNullable<DashboardSnapshot["personalMemory"]>["latestSession"]
): string {
  if (!session) {
    return "remembered session";
  }

  const browserLabel = session.browserTitle ?? session.browserUrl;
  const base = browserLabel
    ? `${session.providerLabel}: ${session.userInput} · ${browserLabel}`
    : `${session.providerLabel}: ${session.userInput}`;

  return session.recallBasis
    ? `${base} · Recall basis: ${session.recallBasis}`
    : base;
}

export function readSnapshotState(snapshot: DashboardSnapshot): DashboardStatusItem[] {
  return [
    {
      label: "Desktop",
      value: readNestedString(snapshot.runtimeHealth, ["desktopSession", "state"]) ?? "unknown",
      tone: readNestedString(snapshot.runtimeHealth, ["desktopSession", "state"]) === "controllable"
        ? "success"
        : "warning"
    },
    {
      label: "Extension",
      value: readNestedString(snapshot.runtimeHealth, ["extension", "liveConnection"])
        ?? readNestedString(snapshot.runtimeHealth, ["extension", "state"])
        ?? "unknown",
      tone: readNestedString(snapshot.runtimeHealth, ["extension", "liveConnection"]) === "connected"
        ? "success"
        : "warning"
    },
    {
      label: "Turn",
      value: readString(snapshot.currentTurn.state) ?? "idle",
      tone: snapshot.currentTurn.state === "failed" ? "danger" : "neutral"
    }
  ];
}

export function readChromeControlState(snapshot: DashboardSnapshot): DashboardChromeControlState {
  const extension = readRecord(snapshot.runtimeHealth.extension);
  const nativeHost = readRecord(snapshot.runtimeHealth.nativeHost);
  const desktopSession = readRecord(snapshot.runtimeHealth.desktopSession);
  const pageControl = readRecord(extension?.pageControl);
  const activeTab = readRecord(pageControl?.activeTab);
  const capabilities = readRecord(pageControl?.capabilities);
  const contentScript = readRecord(pageControl?.contentScript);
  const browserContext = readDashboardBrowserContextSummary(readRecord(extension?.browserContext), pageControl);
  const browserContextAccessSteps = readBrowserContextAccessSteps(pageControl);
  const capabilityLabels = Object.entries(capabilities ?? {})
    .filter(([, value]) => value === true || typeof value === "string")
    .map(([key, value]) => typeof value === "string" ? `${key}: ${value}` : key);
  const state = readString(pageControl?.state) ?? "unknown";
  const capable = typeof pageControl?.capable === "boolean"
    ? pageControl.capable
    : state === "ready";
  const host = readString(activeTab?.host) ?? "No active ordinary page";
  const tabId = readNumber(activeTab?.tabId);
  const windowId = readNumber(activeTab?.windowId);
  const extensionId = readChromeExtensionId(extension, nativeHost);
  const liveConnection = readString(extension?.liveConnection)
    ?? readNestedString(extension ?? {}, ["connection", "liveConnection"])
    ?? readNestedString(extension ?? {}, ["connection", "state"])
    ?? readString(extension?.state)
    ?? "unknown";
  const nativeHostState = readString(nativeHost?.state)
    ?? readString(extension?.nativeHostState)
    ?? "unknown";
  const screenshotLane = readChromeScreenshotLane(pageControl, capabilities);
  const tabDiscovery = readChromeTabDiscoverySummary(extension);
  const hostPolicy = readChromeHostPolicySummary(
    readRecord(extension?.hostPolicy)
      ?? readRecord(snapshot.runtimeHealth.chromeHostPolicy)
      ?? readRecord(pageControl?.hostPolicy)
  );
  const actionable = isChromeControlActionable({
    desktopSession,
    extension,
    liveConnection,
    nativeHostState,
    pageControl,
    capabilities
  });
  const actionUnavailableReason = readChromeActionUnavailableReason({
    actionable,
    extensionId,
    tabId
  });

  return {
    label: state,
    host,
    activeTabLabel: formatChromeActiveTabLabel(host, tabId),
    tabId,
    windowId,
    extensionId,
    chromeAppName: readString(extension?.chromeAppName),
    liveConnection,
    nativeHostState,
    tone: state === "ready" && capable
      ? "success"
      : state === "unavailable" || state === "blocked"
        ? "danger"
        : "warning",
    capabilities: capabilityLabels,
    capable,
    actionable,
    actionUnavailableReason,
    reason: readString(pageControl?.reason) ?? "Browser control readiness has not reported a reason.",
    nextAction: readString(pageControl?.nextAction),
    contentScript: readString(contentScript?.state),
    screenshotLane,
    tabDiscoveryLabel: tabDiscovery.label,
    tabDiscoveryReason: tabDiscovery.reason,
    browserContext,
    browserContextAccessSteps,
    hostPolicy
  };
}

function readBrowserContextAccessSteps(
  pageControl: Record<string, unknown> | undefined
): DashboardBrowserContextAccessStep[] {
  const state = readString(pageControl?.state) ?? "";
  if (state === "ready") {
    return [];
  }

  const activeTab = readRecord(pageControl?.activeTab);
  const hostPolicy = readRecord(pageControl?.hostPolicy);
  const chromeHostPermission = readRecord(pageControl?.chromeHostPermission);
  const chromeCapturePermission = readRecord(pageControl?.chromeCapturePermission);
  const host = readString(activeTab?.host)
    ?? readString(chromeHostPermission?.host)
    ?? readHostFromPermissionOrigin(readString(chromeHostPermission?.origin));
  const hostOrigins = readStringArray(chromeHostPermission?.origins);
  const captureOrigins = readStringArray(chromeCapturePermission?.origins);
  const chromePopupGrantOrigins = [
    ...(readString(chromeHostPermission?.state) === "missing"
      ? [hostOrigins[0] ?? readString(chromeHostPermission?.origin) ?? "current page origin"]
      : []),
    ...(readString(chromeCapturePermission?.state) === "missing"
      ? [captureOrigins[0] ?? "<all_urls>"]
      : [])
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  const steps: DashboardBrowserContextAccessStep[] = [];

  if (host && readString(hostPolicy?.decision) !== "allowed") {
    steps.push({
      id: "allow-current-host",
      label: "Allow current host",
      detail: host,
      tone: "warning"
    });
  }

  if (readString(chromeHostPermission?.state) === "missing") {
    steps.push({
      id: "grant-site-access",
      label: "Grant Chrome site access",
      detail: hostOrigins[0] ?? readString(chromeHostPermission?.origin) ?? "current page origin",
      tone: "warning"
    });
  }

  if (readString(chromeCapturePermission?.state) === "missing") {
    steps.push({
      id: "grant-visible-tab-capture",
      label: "Grant visible-tab capture",
      detail: captureOrigins[0] ?? "<all_urls>",
      tone: "warning"
    });
  }

  if (chromePopupGrantOrigins.length > 0) {
    steps.push({
      id: "open-skfiy-chrome-popup",
      label: "Open skfiy Chrome popup",
      detail: `Click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`,
      tone: "warning"
    });
  }

  if (steps.length > 0) {
    steps.push({
      id: "observe-current-page",
      label: "Observe current page",
      detail: "The popup observes the page automatically after access is granted.",
      tone: "neutral"
    });
  }

  return steps;
}

function readHostFromPermissionOrigin(origin: string | undefined): string | undefined {
  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

function readDashboardBrowserContextSummary(
  browserContext: Record<string, unknown> | undefined,
  pageControl: Record<string, unknown> | undefined
): DashboardBrowserContextSummary {
  const state = readString(browserContext?.state) ?? "missing";
  const title = readString(browserContext?.title);
  const url = readString(browserContext?.url);
  const nextAction = readString(browserContext?.nextAction);
  const reason = readString(browserContext?.reason)
    ?? readString(pageControl?.reason)
    ?? "Browser Context has not reported readiness.";

  return {
    state,
    label: title ?? url ?? titleize(state),
    tone: readBrowserContextTone(state),
    source: readString(browserContext?.source),
    url,
    title,
    observedAt: readString(browserContext?.observedAt),
    reason,
    nextAction
  };
}

function readBrowserContextTone(state: string): Tone {
  if (state === "ready") {
    return "success";
  }
  if (state === "partial" || state === "sensitive-paused" || state === "stale" || state === "not-probed") {
    return "warning";
  }
  if (
    state.startsWith("blocked")
    || state === "unavailable"
    || state === "active_tab_unavailable"
    || state === "content_script_not_loaded"
    || state === "not_loaded"
  ) {
    return "danger";
  }

  return "neutral";
}

function readChromeExtensionId(
  extension: Record<string, unknown> | undefined,
  nativeHost: Record<string, unknown> | undefined
): string | undefined {
  return readString(extension?.extensionId)
    ?? readStringArray(extension?.extensionIds)[0]
    ?? readString(nativeHost?.extensionId)
    ?? readStringArray(nativeHost?.extensionIds)[0]
    ?? readChromeExtensionIdFromAllowedOrigins(readStringArray(extension?.allowedOrigins))
    ?? readChromeExtensionIdFromAllowedOrigins(readStringArray(nativeHost?.allowedOrigins));
}

function readChromeExtensionIdFromAllowedOrigins(origins: string[]): string | undefined {
  for (const origin of origins) {
    const match = origin.match(/^chrome-extension:\/\/([a-z]{32})\//i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function formatChromeActiveTabLabel(host: string, tabId: number | undefined): string {
  return Number.isInteger(tabId) ? `${host} tab ${tabId}` : host;
}

function readChromeScreenshotLane(
  pageControl: Record<string, unknown> | undefined,
  capabilities: Record<string, unknown> | undefined
): string {
  const screenshot = capabilities?.screenshot;
  const domActions = capabilities?.domActions;
  if (domActions === true && screenshot !== true) {
    return "screenshot needs permission";
  }
  if (screenshot === true) {
    return "ready";
  }
  if (isChromeInternalPage(pageControl)) {
    return "blocked";
  }

  return "fallback available";
}

function readChromeTabDiscoverySummary(extension: Record<string, unknown> | undefined): {
  label: string;
  reason?: string;
} {
  const candidate = [
    readRecord(extension?.tabDiscovery),
    readRecord(extension?.pageTabs)
  ].find(Boolean);
  if (!candidate) {
    return { label: "not-probed" };
  }

  const state = readString(candidate.state)
    ?? readString(candidate.result)
    ?? "reported";
  const discoveryMode = readString(candidate.discoveryMode) ?? readString(candidate.mode);
  const tabCount = readRecordArray(candidate.tabs).length;
  const reason = readString(candidate.reason) ?? readString(candidate.fallbackReason);
  if (discoveryMode === "chrome-apple-events") {
    return {
      label: "Using Chrome tab fallback",
      reason
    };
  }

  return {
    label: tabCount > 0 ? `${state} · ${tabCount} tab${tabCount === 1 ? "" : "s"}` : state,
    reason
  };
}

function readChromeHostPolicySummary(
  hostPolicy: Record<string, unknown> | undefined
): DashboardChromeHostPolicySummary {
  const policy = readRecord(hostPolicy?.policy);
  const entries = summarizeChromeHostPolicyEntries(readChromeHostPolicyEntries(hostPolicy, policy));
  const state = readString(hostPolicy?.state) ?? "unknown";

  return {
    state,
    reason: readString(hostPolicy?.reason),
    source: readString(hostPolicy?.source),
    updatedAt: readString(hostPolicy?.updatedAt),
    defaultMode: readString(policy?.defaultMode) ?? "ask",
    entries,
    tone: state === "invalid" ? "danger" : state === "configured" ? "success" : "warning"
  };
}

function summarizeChromeHostPolicyEntries(entries: string[]): string[] {
  const maxVisibleEntries = 12;
  if (entries.length <= maxVisibleEntries) {
    return entries;
  }

  return [
    ...entries.slice(0, maxVisibleEntries),
    `and ${entries.length - maxVisibleEntries} more`
  ];
}

function readChromeHostPolicyEntries(
  hostPolicy: Record<string, unknown> | undefined,
  policy: Record<string, unknown> | undefined
): string[] {
  const entries = readRecordArray(hostPolicy?.entries).map(formatChromeHostPolicyEntry);
  if (entries.length > 0) {
    return entries;
  }

  return [
    ...readStringArray(policy?.allowedHosts).map((host) => `allow:always:${host}`),
    ...readStringArray(policy?.currentTurnAllowedHosts).map((host) => `allow:current-turn:${host}`),
    ...readStringArray(policy?.blockedHosts).map((host) => `block:host:${host}`)
  ];
}

function formatChromeHostPolicyEntry(entry: Record<string, unknown>): string {
  return [
    readString(entry.decision) ?? "policy",
    readString(entry.scope) ?? "host",
    readString(entry.host) ?? "unknown"
  ].join(":");
}

function isChromeControlActionable({
  capabilities,
  desktopSession,
  extension,
  liveConnection,
  nativeHostState,
  pageControl
}: {
  capabilities: Record<string, unknown> | undefined;
  desktopSession: Record<string, unknown> | undefined;
  extension: Record<string, unknown> | undefined;
  liveConnection: string;
  nativeHostState: string;
  pageControl: Record<string, unknown> | undefined;
}): boolean {
  const state = readString(pageControl?.state) ?? "";
  const blockerCodes = readChromeBlockerCodes(pageControl);
  if (
    (nativeHostState !== "installed" || liveConnection !== "connected" || readString(extension?.state) === "stale")
    && isDesktopLockedForChromeRefresh(desktopSession)
  ) {
    return false;
  }
  if (nativeHostState !== "installed" || liveConnection !== "connected" || readString(extension?.state) === "stale") {
    return false;
  }
  if (isChromeInternalPage(pageControl)) {
    return false;
  }
  if (
    state === "blocked_by_host_policy"
    || state === "blocked_by_chrome_host_permission"
    || blockerCodes.includes("blocked_by_host_policy")
    || blockerCodes.includes("blocked_by_chrome_host_permission")
  ) {
    return false;
  }

  return capabilities?.domActions === true
    && (pageControl?.capable === true || state === "ready" || state === "partial");
}

function readChromeActionUnavailableReason({
  actionable,
  extensionId,
  tabId
}: {
  actionable: boolean;
  extensionId: string | undefined;
  tabId: number | undefined;
}): string | undefined {
  if (!actionable) {
    return "Chrome page actions are not ready for the current tab.";
  }
  if (!extensionId) {
    return "Chrome extension id is not available yet.";
  }
  if (!Number.isInteger(tabId)) {
    return "Active Chrome tab id is not available yet.";
  }

  return undefined;
}

function isChromeInternalPage(pageControl: Record<string, unknown> | undefined): boolean {
  const activeTab = readRecord(pageControl?.activeTab);
  const blockerCodes = readChromeBlockerCodes(pageControl);
  const scheme = readString(activeTab?.scheme) ?? "";
  const host = readString(activeTab?.host) ?? "";
  return scheme === "chrome"
    || scheme === "chrome-extension"
    || host.startsWith("chrome://")
    || host.startsWith("chrome-extension://")
    || blockerCodes.includes("internal_chrome_page")
    || blockerCodes.includes("chrome_extension_page");
}

function readChromeBlockerCodes(pageControl: Record<string, unknown> | undefined): string[] {
  return readRecordArray(pageControl?.blockers)
    .map((blocker) => readString(blocker.code))
    .filter((code): code is string => Boolean(code));
}

function isDesktopLockedForChromeRefresh(
  desktopSession: Record<string, unknown> | undefined
): boolean {
  return readString(desktopSession?.state) === "blocked"
    || desktopSession?.mainDisplayAsleep === true
    || desktopSession?.cgSessionScreenIsLocked === true
    || desktopSession?.ioConsoleLocked === true
    || readString(desktopSession?.frontmostBundleId) === "com.apple.loginwindow";
}

export function readReadinessSummary(snapshot: DashboardSnapshot): DashboardReadinessSummary {
  const state = readNestedString(snapshot.operatorReadiness, ["state"]) ?? "unknown";

  if (state === "ready") {
    return {
      title: "Ready for Computer Use",
      label: "ready",
      detail: "Agent, browser, packaged runtime, and fresh evidence are aligned.",
      tone: "success"
    };
  }

  if (state === "blocked") {
    return {
      title: "Needs attention before control",
      label: "blocked",
      detail: "One or more required runtime checks are blocking safe operation.",
      tone: "danger"
    };
  }

  return {
    title: "Needs fresh readiness evidence",
    label: state,
    detail: "The runtime is present, but skfiy needs newer proof before it can be treated as ready.",
    tone: "warning"
  };
}

export function readComputerUseReadiness(snapshot: DashboardSnapshot): DashboardComputerUseReadiness {
  const desktopSession = readRecord(snapshot.runtimeHealth.desktopSession);
  const desktopState = readString(desktopSession?.state) ?? "unknown";
  const frontmost = readString(desktopSession?.frontmostLocalizedName)
    ?? readString(desktopSession?.frontmostBundleId)
    ?? "No frontmost app reported";

  return {
    desktop: {
      value: desktopState,
      detail: frontmost,
      tone: desktopState === "controllable"
        ? "success"
        : desktopState === "blocked"
          ? "danger"
          : "warning"
    },
    permissions: [
      createPermissionStatus("Screen Recording", snapshot.permissions.screenRecording),
      createPermissionStatus("Accessibility", snapshot.permissions.accessibility),
      createPermissionStatus("Finder Automation", snapshot.permissions.finderAutomation)
    ],
    accessSteps: readComputerUseAccessSteps(snapshot)
  };
}

function readComputerUseAccessSteps(snapshot: DashboardSnapshot): DashboardComputerUseAccessStep[] {
  if (readString(snapshot.permissions.finderAutomation) === "granted") {
    return [];
  }

  if (!hasFinderAutomationPermissionBlocker(snapshot)) {
    return [];
  }

  return [
    {
      id: "open-automation-settings",
      label: "Open Automation settings",
      detail: "System Settings > Privacy & Security > Automation",
      tone: "warning"
    },
    {
      id: "allow-skfiy-finder",
      label: "Allow skfiy to control Finder",
      detail: "Enable Finder under skfiy, then keep Finder available.",
      tone: "warning"
    },
    {
      id: "rerun-finder-smoke",
      label: "Rerun Finder smoke",
      detail: "npm run smoke:finder -- --output .skfiy-smoke/finder-automation.json",
      tone: "neutral"
    }
  ];
}

function hasFinderAutomationPermissionBlocker(snapshot: DashboardSnapshot): boolean {
  const finderAlert = snapshot.alerts.some((alert) => (
    readString(alert.code) === "finder-automation-permission"
    || isFinderAutomationPermissionReason(readString(alert.reason))
    || isFinderAutomationPermissionReason(readString(alert.message))
  ));
  if (finderAlert) {
    return true;
  }

  const appReadiness = readRecord(snapshot.operatorReadiness.appReadiness);
  const finderReadiness = readRecord(appReadiness?.finder);
  if (isFinderAutomationPermissionReason(readString(finderReadiness?.reason))) {
    return true;
  }

  return readRecordArray(snapshot.smokeEvidence.artifacts)
    .filter((artifact) => readString(artifact.target) === "finder")
    .some((artifact) => {
      const finderObservation = readRecord(artifact.finderObservation);
      const finderSemanticObservation = readRecord(artifact.finderSemanticObservation);
      const desktopPreflight = readRecord(artifact.desktopPreflight);

      return [
        readString(artifact.reason),
        readString(artifact.blocker),
        readString(finderObservation?.reason),
        readString(finderSemanticObservation?.reason),
        readString(desktopPreflight?.reason)
      ].some(isFinderAutomationPermissionReason);
    });
}

function isFinderAutomationPermissionReason(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }

  const normalized = reason.toLowerCase();
  return normalized.includes("finder") && normalized.includes("automation permission");
}

export function readAppReadinessLanes(snapshot: DashboardSnapshot): DashboardAppReadinessLane[] {
  const appReadiness = readRecord(snapshot.operatorReadiness.appReadiness);

  return [
    createAppReadinessLane("chrome", "Chrome readiness", readRecord(appReadiness?.chrome)),
    createAppReadinessLane("finder", "Finder readiness", readRecord(appReadiness?.finder)),
    createAppReadinessLane("ghostty", "Ghostty readiness", readRecord(appReadiness?.ghostty))
  ];
}

export function readUnsupportedSmokeEvidence(snapshot: DashboardSnapshot): string | undefined {
  const unsupported = readStringArray(readRecord(snapshot.operatorReadiness.recentSmokeEvidence)?.unsupportedTargets);
  return unsupported.length > 0
    ? `ignored unsupported smoke: ${unsupported.join(", ")}`
    : undefined;
}

export function readDogfoodSummary(snapshot: DashboardSnapshot): DashboardDogfoodSummary {
  const release = readRecord(snapshot.dogfoodRelease);
  const releaseState = readString(release?.state) ?? "unknown";
  const drift = readRecord(release?.releaseDrift);
  const releaseDriftState = readString(drift?.state) ?? "unknown";
  const cohort = readRecord(release?.cohort);
  const acceptedReports = readNumber(cohort?.acceptedReportCount) ?? 0;
  const distinctTesters = readNumber(cohort?.distinctRealTesterCount) ?? 0;
  const ready = cohort?.ready === true;
  const passedReady = cohort?.passedReady === true;

  return {
    releaseState,
    releaseDriftState,
    cohortLabel: `cohort ${acceptedReports}/${distinctTesters}`,
    detail: ready
      ? passedReady
        ? "Accepted dogfood cohort has passed workflow coverage."
        : "Accepted dogfood cohort exists, but passed workflow coverage is incomplete."
      : "Dogfood cohort is not ready yet.",
    tone: releaseDriftState === "behind-head"
      ? "warning"
      : releaseState === "cohort-ready" && passedReady
        ? "success"
        : "neutral"
  };
}

export function readProviderSummaries(snapshot: DashboardSnapshot): DashboardProviderSummary[] {
  return [
    snapshot.providers?.assistant ?? {
      provider: "assistant",
      mode: "codex",
      label: "Codex",
      health: "unknown",
      detail: "Provider settings are not present in this snapshot."
    },
    snapshot.providers?.planner ?? {
      provider: "planner",
      mode: "local-deterministic",
      label: "Local deterministic",
      health: "unknown",
      detail: "Provider settings are not present in this snapshot."
    }
  ];
}

export function readCapabilitySummaries(snapshot: DashboardSnapshot): DashboardCapabilitySummary[] {
  const assistant = readAssistantProviderView(snapshot);
  const computerUse = readComputerUseReadiness(snapshot);
  const browserContext = readBrowserContextSummary(snapshot);
  const latestSignal = readLatestTaskSignal(snapshot);

  return [
    {
      id: "assistant-provider",
      title: "Assistant Provider",
      value: assistant.value,
      detail: assistant.detail,
      tone: assistant.tone
    },
    {
      id: "computer-use",
      title: "Computer Use",
      value: computerUse.desktop.value,
      detail: computerUse.desktop.detail,
      tone: computerUse.desktop.tone
    },
    {
      id: "browser-context",
      title: "Chrome Browser Context",
      value: browserContext.state,
      detail: readBrowserContextDetail(browserContext),
      tone: browserContext.tone
    },
    {
      id: "current-turn",
      title: "Current Turn",
      value: latestSignal.value,
      detail: latestSignal.detail,
      tone: latestSignal.tone
    }
  ];
}

export function readAssistantProviderView(snapshot: DashboardSnapshot): DashboardAssistantProviderView {
  const providers = readProviderSummaries(snapshot);
  const assistant = providers.find((provider) => provider.provider === "assistant") ?? providers[0];
  const health = assistant?.health ?? "unknown";

  return {
    label: "Assistant Provider",
    value: assistant?.label ?? "unknown",
    detail: assistant?.detail ?? (health === "unknown"
      ? "Assistant provider health has not been reported."
      : `assistant ${health}`),
    tone: readHealthTone(health)
  };
}

export function readBrowserContextSummary(snapshot: DashboardSnapshot): DashboardBrowserContextSummary {
  return readChromeControlState(snapshot).browserContext;
}

function readBrowserContextDetail(browserContext: DashboardBrowserContextSummary): string {
  return browserContext.title
    ?? browserContext.url
    ?? browserContext.nextAction
    ?? browserContext.reason;
}

function readHealthTone(health: string): Tone {
  if (health === "available" || health === "ready") {
    return "success";
  }
  if (health === "unavailable" || health === "failed") {
    return "danger";
  }

  return "warning";
}

function createAppReadinessLane(
  id: DashboardAppReadinessLane["id"],
  title: string,
  lane: Record<string, unknown> | undefined
): DashboardAppReadinessLane {
  const state = readString(lane?.state) ?? "needs-evidence";

  return {
    id,
    title,
    value: state,
    detail: readString(lane?.reason) ?? "No readiness detail has been recorded yet.",
    source: readString(lane?.source) ?? "snapshot",
    tone: readReadinessTone(state)
  };
}

function readReadinessTone(state: string): Tone {
  if (state === "ready") {
    return "success";
  }
  if (state === "blocked") {
    return "danger";
  }

  return "warning";
}

export function readAlertMessages(snapshot: DashboardSnapshot): string[] {
  return snapshot.alerts
    .map((alert) => readString(alert.message))
    .filter((message): message is string => Boolean(message));
}

export function readLatestMessage(snapshot: DashboardSnapshot): string {
  return readString(snapshot.currentTurn.latestMessage)
    ?? readString(snapshot.replay.latestMessage)
    ?? "Ready for an agent or Computer Use turn.";
}

export function readRecentActivity(snapshot: DashboardSnapshot): DashboardRecentActivity {
  return {
    latestMessage: readLatestMessage(snapshot),
    turnState: readString(snapshot.currentTurn.state) ?? "idle",
    replayState: readString(snapshot.replay.state) ?? "empty",
    command: readString(snapshot.currentTurn.command),
    targetApp: readString(snapshot.currentTurn.targetApp),
    actionCount: readNumber(snapshot.replay.actionCount),
    screenshotCount: readNumber(snapshot.replay.screenshotCount),
    verificationCount: readNumber(snapshot.replay.verificationCount)
  };
}

export function readRouteOutcome(snapshot: DashboardSnapshot): DashboardRouteOutcome {
  return readSharedRouteOutcome({
    currentTurn: snapshot.currentTurn,
    replay: snapshot.replay,
    defaultSource: "Current turn",
    includeCommandDetail: true
  });
}

export function readLatestTaskSignal(snapshot: DashboardSnapshot): DashboardLatestTaskSignal {
  const currentTurnState = readString(snapshot.currentTurn.state) ?? "idle";
  const currentTurnDetail = readCurrentTurnDetail(snapshot);

  if (["failed", "blocked", "denied"].includes(currentTurnState)) {
    return {
      title: "Latest blocker",
      value: currentTurnState,
      detail: currentTurnDetail,
      tone: "danger",
      source: "Current turn"
    };
  }

  if (["approval_required", "needs_confirmation"].includes(currentTurnState)) {
    return {
      title: "Latest blocker",
      value: currentTurnState,
      detail: currentTurnDetail,
      tone: "warning",
      source: "Current turn"
    };
  }

  const browserContext = readBrowserContextSummary(snapshot);
  if (browserContext.tone === "danger" || browserContext.tone === "warning") {
    return {
      title: "Latest blocker",
      value: browserContext.state,
      detail: browserContext.nextAction ?? browserContext.reason,
      tone: browserContext.tone,
      source: "Browser Context"
    };
  }

  const visibleAlert = snapshot.alerts.find((alert) => readString(alert.severity) === "error")
    ?? snapshot.alerts.find((alert) => readString(alert.severity) === "warning");
  if (visibleAlert) {
    return {
      title: "Latest blocker",
      value: readString(visibleAlert.code) ?? readString(visibleAlert.severity) ?? "alert",
      detail: readString(visibleAlert.message) ?? "Review dashboard alert.",
      tone: readAlertTone(visibleAlert),
      source: "Dashboard alert"
    };
  }

  const evidence = readRuntimeEvidenceSummary(snapshot);
  if (evidence.tone !== "success") {
    return {
      title: "Latest blocker",
      value: evidence.value,
      detail: evidence.detail,
      tone: evidence.tone,
      source: "Runtime evidence"
    };
  }

  return {
    title: "Latest signal",
    value: currentTurnState,
    detail: readLatestMessage(snapshot),
    tone: "success",
    source: "Current turn"
  };
}

export function readRuntimeEvidenceSummary(snapshot: DashboardSnapshot): DashboardRuntimeEvidenceSummary {
  const recentSmokeEvidence = readRecord(snapshot.operatorReadiness.recentSmokeEvidence);
  const recentPassedTargets = readStringArray(recentSmokeEvidence?.recentPassedTargets);
  const missingTargets = readStringArray(recentSmokeEvidence?.missingTargets);
  const unsupportedTargets = readStringArray(recentSmokeEvidence?.unsupportedTargets);
  const state = readString(recentSmokeEvidence?.state) ?? "unknown";
  const detail = missingTargets.length > 0
    ? `Missing fresh evidence: ${missingTargets.join(", ")}.`
    : recentPassedTargets.length > 0
      ? `Fresh evidence: ${recentPassedTargets.join(", ")}.`
      : "No recent smoke evidence has been recorded.";

  return {
    title: "Runtime evidence",
    value: state,
    detail: unsupportedTargets.length > 0
      ? `${detail} Ignored unsupported smoke: ${unsupportedTargets.join(", ")}.`
      : detail,
    tone: state === "ready"
      ? "success"
      : missingTargets.length > 0
        ? "warning"
        : "neutral"
  };
}

function readCurrentTurnDetail(snapshot: DashboardSnapshot): string {
  const error = readRecord(snapshot.currentTurn.error);
  return readString(error?.message)
    ?? readString(snapshot.currentTurn.error)
    ?? readString(snapshot.currentTurn.latestMessage)
    ?? readString(snapshot.currentTurn.message)
    ?? readString(snapshot.currentTurn.command)
    ?? readLatestMessage(snapshot);
}

export function readNextAction(snapshot: DashboardSnapshot): DashboardNextAction {
  const currentTurnState = readString(snapshot.currentTurn.state) ?? "";
  const approvalState = readString(snapshot.currentTurn.approvalState) ?? "";
  if (
    currentTurnState.includes("approval")
    || approvalState === "pending"
    || snapshot.currentTurn.approvalRequired === true
  ) {
    return {
      title: "Review pending approval",
      detail: readString(snapshot.currentTurn.command)
        ?? readLatestMessage(snapshot),
      tone: "warning",
      source: "Current turn"
    };
  }

  const alertWithNextAction = snapshot.alerts.find((alert) => readString(alert.nextAction));
  if (alertWithNextAction) {
    return {
      title: readAlertActionTitle(alertWithNextAction),
      detail: readString(alertWithNextAction.nextAction) ?? readString(alertWithNextAction.message) ?? "Review dashboard alert.",
      tone: readAlertTone(alertWithNextAction),
      source: "Dashboard alert"
    };
  }

  const visibleAlert = snapshot.alerts.find((alert) => readString(alert.severity) === "error")
    ?? snapshot.alerts.find((alert) => readString(alert.severity) === "warning")
    ?? snapshot.alerts[0];
  if (visibleAlert) {
    return {
      title: readAlertActionTitle(visibleAlert),
      detail: readString(visibleAlert.message) ?? "Review dashboard alert.",
      tone: readAlertTone(visibleAlert),
      source: "Dashboard alert"
    };
  }

  const chromeControl = readChromeControlState(snapshot);
  if (chromeControl.browserContext.tone !== "success" && chromeControl.browserContext.nextAction) {
    return {
      title: "Prepare Browser Context",
      detail: chromeControl.browserContext.nextAction,
      tone: chromeControl.browserContext.tone,
      source: "Browser Context"
    };
  }

  if (chromeControl.tone !== "success" && chromeControl.nextAction) {
    return {
      title: "Prepare browser control",
      detail: chromeControl.nextAction,
      tone: chromeControl.tone,
      source: "Browser"
    };
  }

  const readinessState = readString(snapshot.operatorReadiness.state) ?? "unknown";
  if (readinessState === "ready") {
    return {
      title: "Start a Computer Use turn",
      detail: readLatestMessage(snapshot),
      tone: "success",
      source: "Ready"
    };
  }

  const recentSmokeEvidence = readRecord(snapshot.operatorReadiness.recentSmokeEvidence);
  const missingTargets = readStringArray(recentSmokeEvidence?.missingTargets);
  return {
    title: readinessState === "blocked" ? "Resolve readiness blockers" : "Collect readiness evidence",
    detail: missingTargets.length > 0
      ? `Missing fresh evidence: ${missingTargets.join(", ")}.`
      : "Review readiness checks before starting the next turn.",
    tone: readinessState === "blocked" ? "danger" : "warning",
    source: "Readiness"
  };
}

function createPermissionStatus(label: string, value: unknown): DashboardStatusItem {
  const state = readString(value) ?? "unknown";

  return {
    label,
    value: state.replaceAll("-", " "),
    tone: state === "granted" ? "success" : state === "denied" ? "danger" : "warning"
  };
}

function pushNode(nodes: DashboardKnowledgeGraphNode[], node: DashboardKnowledgeGraphNode): void {
  if (!nodes.some((existing) => existing.id === node.id)) {
    nodes.push(node);
  }
}

function pushEdge(edges: DashboardKnowledgeGraphEdge[], edge: DashboardKnowledgeGraphEdge): void {
  if (!edges.some((existing) => (
    existing.from === edge.from
    && existing.to === edge.to
    && existing.label === edge.label
  ))) {
    edges.push(edge);
  }
}

function createMemoryNodeDetail(
  count: number,
  sample: string | undefined,
  usage: DashboardPersonalMemoryUsageBucket | undefined
): string {
  const usageLabel = usage
    ? `${usage.percent}% - ${formatInteger(usage.usedChars)}/${formatInteger(usage.limitChars)} chars`
    : undefined;
  const countLabel = usageLabel ? `${count} entries · ${usageLabel}` : `${count} entries`;
  return sample ? `${countLabel} · ${sample}` : countLabel;
}

function readMemoryUsageTone(
  usage: DashboardPersonalMemoryUsageBucket | undefined
): Tone {
  if (!usage) {
    return "success";
  }
  if (usage.percent >= 95) {
    return "danger";
  }
  if (usage.percent >= 75) {
    return "warning";
  }
  return "success";
}

function createPendingMemoryNodeDetail(
  write: DashboardPendingPersonalMemoryWrite
): string {
  const action = write.action === "replace"
    ? "replace"
    : write.action === "remove"
      ? "remove"
      : "add";
  if (action === "replace" && write.previousContent) {
    return `${action} · from ${write.previousContent} -> ${write.content}`;
  }
  return `${action} · ${write.content}`;
}

function createMemoryJournalNodeDetail(entry: DashboardPersonalMemoryJournalEntry): string {
  const action = entry.action === "replace"
    ? "replace"
    : entry.action === "remove"
      ? "remove"
      : "add";
  return `${entry.stage} · ${action} ${entry.target} · ${entry.content} · learned from ${entry.providerLabel} turn ${entry.turnId}`;
}

function createMemoryEvolutionNodeDetail(entries: DashboardPersonalMemoryJournalEntry[]): string {
  const providerCount = new Set(entries
    .map((entry) => entry.providerLabel.trim())
    .filter(Boolean)).size;
  return `${entries.length} ${entries.length === 1 ? "learning receipt" : "learning receipts"} across ${providerCount} ${providerCount === 1 ? "provider" : "providers"}`;
}

function readMutationReceiptTone({
  blocked,
  result
}: {
  blocked: number | undefined;
  result: string;
}): Tone {
  if (blocked && blocked > 0) {
    return "danger";
  }
  if (result === "error") {
    return "danger";
  }
  if (result === "not-found" || result === "unchanged") {
    return "neutral";
  }
  return "success";
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function sanitizeNodeId(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    || "unknown";
}

function readAlertGraphTarget(
  code: string,
  alert: Record<string, unknown>,
  providerId: string
): string {
  const haystack = [
    code,
    readString(alert.message),
    readString(alert.nextAction)
  ].join(" ").toLocaleLowerCase();

  if (/chrome|browser|extension|page-control/u.test(haystack)) {
    return "browser:context";
  }
  if (/provider|assistant|codex|claude|hermes/u.test(haystack)) {
    return providerId;
  }

  return "computer-use";
}

function readAlertTone(alert: Record<string, unknown>): Tone {
  const severity = readString(alert.severity);
  if (severity === "error") {
    return "danger";
  }
  if (severity === "warning") {
    return "warning";
  }

  return "neutral";
}

function readAlertActionTitle(alert: Record<string, unknown>): string {
  const code = readString(alert.code) ?? "";
  if (code.endsWith("-missing")) {
    return `Grant ${titleize(code.replace(/-missing$/, ""))}`;
  }
  if (code.startsWith("page-control")) {
    return "Prepare Browser Control";
  }
  if (code.startsWith("chrome-extension")) {
    return "Connect Chrome Extension";
  }
  if (code.startsWith("chrome-native-host")) {
    return "Repair Chrome Native Host";
  }
  if (code.startsWith("desktop")) {
    return "Unlock Desktop Session";
  }
  if (code.startsWith("finder")) {
    return "Prove Finder Automation";
  }
  if (code.startsWith("runtime-snapshot")) {
    return "Repair Runtime State";
  }
  if (code.startsWith("smoke")) {
    return "Refresh Smoke Evidence";
  }
  if (code.startsWith("release")) {
    return "Refresh Alpha Release";
  }

  return "Review Dashboard Alert";
}

function titleize(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readNestedString(record: Record<string, unknown>, keys: string[]): string | undefined {
  let current: unknown = record;
  for (const key of keys) {
    current = readRecord(current)?.[key];
  }

  return readString(current);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
      .map((item) => readRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
