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
import {
  DASHBOARD_RUNTIME_SNAPSHOT_STALE_SECONDS,
  type DashboardRuntimeSnapshotFreshnessState
} from "../shared/dashboard-runtime.js";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface DashboardStatusItem {
  label: string;
  value: string;
  tone: Tone;
}

export interface DashboardCommandHint {
  id: string;
  label: string;
  command: string;
  mutates: boolean;
}

export interface DashboardChromeSetupGuideSummary {
  source: string;
  nativeHostState: string;
  liveConnectionState: string;
  nextActions: string[];
  commands: DashboardCommandHint[];
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

export interface DashboardOperatorReadinessChecks {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardRuntimeHealthSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardComputerUseReadiness {
  desktop: {
    value: string;
    detail: string;
    tone: Tone;
  };
  permissionSummary: {
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

export interface DashboardSmokeArtifactDetail {
  id: string;
  title: string;
  value: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardSmokeArtifactInventory {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardDogfoodSummary {
  releaseState: string;
  releaseDriftState: string;
  cohortLabel: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardAlertGroup {
  id: "desktop" | "permissions" | "chrome" | "evidence" | "release" | "runtime" | "other";
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardAlertGroupSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  groups: DashboardAlertGroup[];
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

export interface DashboardHomeSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardAppsSitesSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardActivityFeedSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
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

export interface DashboardApprovalQueueSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardRuntimeEvidenceSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface DashboardOperatorEvidenceSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardRuntimeSnapshotDetail {
  id: "current-turn" | "replay";
  title: string;
  value: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardLongHorizonSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

export interface DashboardAgentSupervisionSummary {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  items: DashboardStatusItem[];
}

interface DashboardRuntimeSnapshotFreshness {
  state: DashboardRuntimeSnapshotFreshnessState;
  source: string;
  observedAt?: string;
  reason?: string;
  ageSeconds?: number;
  stale: boolean;
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
  items: DashboardStatusItem[];
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
  const routeOutcome = readRouteOutcome(snapshot);
  const latestTaskSignal = readLatestTaskSignal(snapshot);

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
      tone: latestTaskSignal.tone,
      detail: readString(snapshot.currentTurn.command) ?? readLatestMessage(snapshot)
    });
    pushEdge(edges, {
      from: "computer-use",
      to: "turn:current",
      label: readCurrentTurnGraphEdgeLabel(routeOutcome, snapshot.currentTurn, currentTurnState)
    });
    if (shouldShowRouteOutcomeGraphNode(routeOutcome)) {
      pushNode(nodes, {
        id: "route:current",
        label: routeOutcome.title,
        kind: "turn",
        tone: routeOutcome.tone,
        detail: createRouteOutcomeGraphDetail(routeOutcome)
      });
      pushEdge(edges, {
        from: "computer-use",
        to: "route:current",
        label: readCurrentTurnGraphEdgeLabel(routeOutcome, snapshot.currentTurn, currentTurnState)
      });
      pushEdge(edges, { from: "route:current", to: "turn:current", label: "summarizes turn" });
    }
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

function shouldShowRouteOutcomeGraphNode(routeOutcome: DashboardRouteOutcome): boolean {
  return routeOutcome.kind !== "idle" && routeOutcome.kind !== "unknown";
}

function createRouteOutcomeGraphDetail(routeOutcome: DashboardRouteOutcome): string {
  const route = routeOutcome.routeLabel === "unknown" ? "route unknown" : `route ${routeOutcome.routeLabel}`;
  return `${routeOutcome.value} · state ${routeOutcome.state} · ${route} · ${routeOutcome.detail}`;
}

function readCurrentTurnGraphEdgeLabel(
  routeOutcome: DashboardRouteOutcome,
  currentTurn: Record<string, unknown>,
  currentTurnState: string
): string {
  switch (routeOutcome.kind) {
    case "approval_required":
      return "requires approval";
    case "needs_confirmation":
      return "needs confirmation";
    case "needs_clarification":
      return "needs clarification";
    case "app_policy_denied":
      return "denied by app policy";
    case "user_denied":
      return "denied by user";
    case "blocked":
      return "blocked route";
    case "cancelled":
      return "cancelled route";
    case "stopped":
      return "stopped route";
    case "failed":
      return "failed route";
    case "completed":
      return "completed route";
    default:
      return currentTurn.approvalRequired === true || currentTurnState.includes("approval")
        ? "requires approval"
        : "routes action";
  }
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

export function readRuntimeHealthSummary(snapshot: DashboardSnapshot): DashboardRuntimeHealthSummary {
  const runtime = readRecord(snapshot.runtimeHealth) ?? {};
  const packageInfo = readRecord(runtime.package) ?? {};
  const app = readRecord(runtime.app) ?? {};
  const helper = readRecord(runtime.helper) ?? {};
  const cli = readRecord(runtime.cli) ?? {};
  const dashboard = readRecord(runtime.dashboard) ?? {};
  const extension = readRecord(runtime.extension) ?? {};
  const desktopSession = readRecord(runtime.desktopSession) ?? {};
  const pageControl = readRecord(extension.pageControl)
    ?? readRecord(findSmokeArtifact(snapshot, "chrome")?.pageControl);
  const dashboardState = readString(dashboard.state) ?? "unknown";
  const componentStates = [
    readString(app.state),
    readString(helper.state),
    readString(cli.state),
    dashboardState,
    readString(extension.state),
    readString(desktopSession.state)
  ].filter((state): state is string => Boolean(state));
  const tone = readRuntimeHealthTone(componentStates);
  const version = readString(packageInfo.version) ?? "unknown";

  return {
    title: "Runtime health",
    value: dashboardState,
    detail: version === "unknown"
      ? "Local runtime health from the dashboard snapshot."
      : `skfiy ${version} local runtime health from the dashboard snapshot.`,
    tone,
    items: [
      createStatusItem("version", version),
      createStatusItem("app", readString(app.state) ?? "unknown", readRuntimeComponentTone(readString(app.state))),
      createStatusItem("helper", readString(helper.state) ?? "unknown", readRuntimeComponentTone(readString(helper.state))),
      createStatusItem("cli", readString(cli.state) ?? "unknown", readRuntimeComponentTone(readString(cli.state))),
      createStatusItem("dashboard", dashboardState, readRuntimeComponentTone(dashboardState)),
      createStatusItem("pid", formatUnknownNumber(readNumber(dashboard.pid))),
      createStatusItem("uptime", formatUnknownNumber(readNumber(dashboard.uptimeSeconds))),
      createStatusItem("extension", readString(extension.state) ?? "unknown", readRuntimeComponentTone(readString(extension.state))),
      createStatusItem("pageControl", formatRuntimePageControlState(pageControl), readRuntimePageControlTone(pageControl)),
      createStatusItem(
        "pageControl next",
        readString(pageControl?.nextAction) ?? readString(pageControl?.reason) ?? "needs-action"
      ),
      createStatusItem(
        "desktop",
        readString(desktopSession.state) ?? "unknown",
        readRuntimeComponentTone(readString(desktopSession.state))
      )
    ]
  };
}

function readRuntimeHealthTone(states: string[]): Tone {
  const tones = states.map(readRuntimeComponentTone);
  if (tones.some((tone) => tone === "danger")) {
    return "danger";
  }
  if (tones.length > 0 && tones.every((tone) => tone === "success")) {
    return "success";
  }
  if (tones.some((tone) => tone === "warning")) {
    return "warning";
  }

  return "neutral";
}

function readRuntimeComponentTone(state: string | undefined): Tone {
  if (
    state === "installed"
    || state === "running"
    || state === "connected"
    || state === "ready"
    || state === "controllable"
    || state === "passed"
  ) {
    return "success";
  }
  if (
    state === "blocked"
    || state === "missing"
    || state === "failed"
    || state === "invalid"
    || state === "stale"
    || state === "unavailable"
  ) {
    return "danger";
  }
  if (!state || state === "unknown") {
    return "neutral";
  }

  return "warning";
}

function formatRuntimePageControlState(pageControl: Record<string, unknown> | undefined): string {
  const state = readString(pageControl?.state) ?? "not-probed";
  return `${pageControl?.capable === true ? "capable" : "not capable"}/${state}`;
}

function readRuntimePageControlTone(pageControl: Record<string, unknown> | undefined): Tone {
  const state = readString(pageControl?.state);
  if (pageControl?.capable === true && (state === "ready" || state === "partial" || state === "sensitive-paused")) {
    return "success";
  }

  return readRuntimeComponentTone(state);
}

export function readChromeControlState(snapshot: DashboardSnapshot): DashboardChromeControlState {
  const extension = readRecord(snapshot.runtimeHealth.extension);
  const nativeHost = readRecord(snapshot.runtimeHealth.nativeHost);
  const desktopSession = readRecord(snapshot.runtimeHealth.desktopSession);
  const chromeArtifact = findSmokeArtifact(snapshot, "chrome");
  const pageControl = readRecord(extension?.pageControl)
    ?? readRecord(chromeArtifact?.pageControl);
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
  const tabDiscovery = readChromeTabDiscoverySummary(extension, chromeArtifact);
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

export function readChromeControlCommandHints(
  chromeControl: DashboardChromeControlState
): DashboardCommandHint[] {
  if (
    !chromeControl.actionable
    || !chromeControl.extensionId
    || !Number.isInteger(chromeControl.tabId)
  ) {
    return [];
  }

  const commandFor = (action: string) =>
    `./dist/skfiy chrome ${action} --extension-id ${chromeControl.extensionId} --target-tab-id ${chromeControl.tabId}`;

  return [
    {
      id: "observe",
      label: "Observe current page",
      command: `${commandFor("observe")} --json`,
      mutates: false
    },
    {
      id: "screenshot",
      label: "Screenshot current page",
      command: `${commandFor("screenshot")} --json`,
      mutates: false
    },
    {
      id: "click",
      label: "Click confirmed selector",
      command: `${commandFor("click")} --selector <selector> --json`,
      mutates: true
    },
    {
      id: "fill",
      label: "Fill approved field",
      command: `${commandFor("fill")} --selector <selector> --text <text> --json`,
      mutates: true
    },
    {
      id: "submit",
      label: "Submit approved test form",
      command: `${commandFor("submit")} --selector form --json`,
      mutates: true
    },
    {
      id: "scroll",
      label: "Scroll current page",
      command: `${commandFor("scroll")} --dy 600 --json`,
      mutates: true
    }
  ];
}

export function readChromeSetupGuideSummary(snapshot: DashboardSnapshot): DashboardChromeSetupGuideSummary {
  const extension = readRecord(snapshot.runtimeHealth.extension) ?? {};
  const nativeHost = readRecord(snapshot.runtimeHealth.nativeHost) ?? {};
  const chromeArtifact = findSmokeArtifact(snapshot, "chrome");
  const runtimeGuide = readChromeSetupGuide(readRecord(extension.setupGuide), "runtime");
  const nativeHostGuide = readChromeSetupGuide(readRecord(nativeHost.setupGuide), "native-host");
  const artifactGuide = readChromeSetupGuide(readRecord(chromeArtifact?.setupGuide), "smoke-artifact");
  const guide = runtimeGuide ?? nativeHostGuide ?? artifactGuide;
  const nativeHostState = readString(nativeHost.state) ?? "unknown";
  const liveConnectionState = readString(extension.liveConnection)
    ?? readNestedString(extension, ["connection", "liveConnection"])
    ?? readNestedString(extension, ["connection", "state"])
    ?? (readString(extension.state) === "connected" ? "connected" : undefined)
    ?? "unknown";
  const extensionId = readChromeExtensionId(extension, nativeHost) ?? "<extension-id>";

  return {
    source: guide?.source ?? "derived",
    nativeHostState,
    liveConnectionState,
    nextActions: guide?.nextActions.length
      ? guide.nextActions
      : createDefaultChromeSetupNextActions(nativeHostState, liveConnectionState, chromeArtifact),
    commands: guide?.commands.length
      ? guide.commands
      : createDefaultChromeSetupCommands(extensionId)
  };
}

function readChromeSetupGuide(
  guide: Record<string, unknown> | undefined,
  source: DashboardChromeSetupGuideSummary["source"]
): Pick<DashboardChromeSetupGuideSummary, "source" | "nextActions" | "commands"> | undefined {
  if (!guide) {
    return undefined;
  }

  const nextActions = readChromeSetupActionTexts(guide.nextActions);
  const commands = dedupeChromeSetupCommands([
    ...readChromeSetupCommands(guide.commands),
    ...readChromeSetupCommands(guide.copyableCommands),
    ...readChromeNamedSetupCommands(guide)
  ]);
  if (nextActions.length === 0 && commands.length === 0) {
    return undefined;
  }

  return {
    source,
    nextActions,
    commands
  };
}

function readChromeSetupActionTexts(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .flatMap((entry) => {
      if (typeof entry === "string") {
        return [entry];
      }

      const record = readRecord(entry);
      if (!record) {
        return [];
      }

      const command = Array.isArray(record.command)
        ? formatChromeSetupCommandParts(record.command)
        : readString(record.copyText);
      const text = readString(record.title)
        ?? readString(record.guidance)
        ?? readString(record.nextAction)
        ?? readString(record.reason)
        ?? readString(record.copyText);
      if (text && command && text !== command) {
        return [`${text} ${command}`];
      }
      if (text) {
        return [text];
      }
      return command ? [command] : [];
    });
}

function readChromeSetupCommands(value: unknown): DashboardCommandHint[] {
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      return normalizeChromeSetupCommand(value, "command");
    }

    return value.flatMap((entry, index) => normalizeChromeSetupCommand(entry, `command-${index + 1}`));
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).flatMap(([key, entry]) =>
    normalizeChromeSetupCommand(entry, key)
  );
}

function readChromeNamedSetupCommands(guide: Record<string, unknown>): DashboardCommandHint[] {
  return [
    ["install-host", guide.installHostCommand],
    ["status", guide.verifyStatusCommand],
    ["smoke", guide.smokeCommand]
  ].flatMap(([id, value]) => normalizeChromeSetupCommand(value, String(id)));
}

function normalizeChromeSetupCommand(value: unknown, idHint: string): DashboardCommandHint[] {
  const id = normalizeChromeSetupCommandId(idHint);
  if (typeof value === "string") {
    return createChromeSetupCommandHint(id, readChromeSetupCommandLabel(id), value);
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return createChromeSetupCommandHint(id, readChromeSetupCommandLabel(id), formatChromeSetupCommandParts(value));
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  const command = readString(record.copyText)
    ?? readString(record.commandText)
    ?? readString(record.commandLine)
    ?? readChromeSetupCommandFromRecord(record)
    ?? readString(record.command ?? record.value);
  if (!command) {
    return [];
  }

  return createChromeSetupCommandHint(
    normalizeChromeSetupCommandId(readString(record.id) ?? idHint),
    readString(record.label) ?? readChromeSetupCommandLabel(id),
    command,
    readBoolean(record.mutates)
  );
}

function readChromeSetupCommandFromRecord(record: Record<string, unknown>): string | undefined {
  const command = readString(record.command);
  const args = readStringArray(record.args);
  if (!command || args.length === 0) {
    return undefined;
  }

  return formatChromeSetupCommandParts([command, ...args]);
}

function createChromeSetupCommandHint(
  id: string,
  label: string,
  command: string,
  explicitMutates?: boolean
): DashboardCommandHint[] {
  const normalizedCommand = normalizeDefaultSmokeCommand(command, id);
  if (!normalizedCommand) {
    return [];
  }

  return [{
    id,
    label,
    command: normalizedCommand,
    mutates: explicitMutates ?? (id === "install-host" || normalizedCommand.includes(" install-host "))
  }];
}

function dedupeChromeSetupCommands(commands: DashboardCommandHint[]): DashboardCommandHint[] {
  const seen = new Set<string>();
  const deduped: DashboardCommandHint[] = [];
  for (const command of commands) {
    const key = `${command.id}\n${command.command}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(command);
  }

  return deduped;
}

function formatChromeSetupCommandParts(parts: unknown[]): string {
  return parts.map((part) => {
    const text = String(part);
    return /^[A-Za-z0-9_./:=@%+-]+$/.test(text) ? text : JSON.stringify(text);
  }).join(" ");
}

function normalizeDefaultSmokeCommand(command: string, id: string): string {
  const trimmed = command.trim();
  const isSmokeCommand = id === "smoke"
    || /\bsmoke:chrome\b/u.test(trimmed)
    || /\bsmoke\s+chrome\b/u.test(trimmed);
  if (!isSmokeCommand) {
    return trimmed;
  }

  return trimmed
    .replace(/\s+--output(?:=|\s+)(?:"[^"]+"|'[^']+'|\S+)/gu, "")
    .replace(/\s+--\s*$/u, "")
    .trim();
}

function createDefaultChromeSetupCommands(extensionId: string): DashboardCommandHint[] {
  return [
    {
      id: "install-host",
      label: "Install host",
      command: `skfiy chrome install-host --extension-id ${extensionId}`,
      mutates: true
    },
    {
      id: "status",
      label: "Status",
      command: `skfiy chrome status --json --extension-id ${extensionId}`,
      mutates: false
    },
    {
      id: "smoke",
      label: "Smoke",
      command: "npm run smoke:chrome",
      mutates: false
    }
  ];
}

function createDefaultChromeSetupNextActions(
  nativeHostState: string,
  liveConnectionState: string,
  chromeArtifact: Record<string, unknown> | undefined
): string[] {
  if (nativeHostState !== "installed") {
    return ["Install or repair the Chrome Native Messaging host from the packaged skfiy binary."];
  }
  if (liveConnectionState !== "connected") {
    return ["Refresh the installed extension heartbeat, then rerun Chrome status."];
  }
  if (readString(chromeArtifact?.result) !== "passed") {
    return ["Run the Chrome smoke with the default output-free command."];
  }

  return [];
}

function normalizeChromeSetupCommandId(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    || "command";
}

function readChromeSetupCommandLabel(idHint: string): string {
  const id = normalizeChromeSetupCommandId(idHint);
  if (id === "install-host") {
    return "Install host";
  }
  if (id === "status") {
    return "Status";
  }
  if (id === "smoke") {
    return "Smoke";
  }

  return id
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    || "Command";
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

function readChromeTabDiscoverySummary(
  extension: Record<string, unknown> | undefined,
  chromeArtifact: Record<string, unknown> | undefined
): {
  label: string;
  reason?: string;
} {
  const candidate = [
    readRecord(extension?.tabDiscovery),
    readRecord(extension?.pageTabs),
    readRecord(chromeArtifact?.tabDiscovery),
    readRecord(chromeArtifact?.pageTabs)
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
  const source = formatChromeHostPolicySource(hostPolicy);
  const updatedAt = readString(hostPolicy?.updatedAt);
  const defaultMode = readString(policy?.defaultMode) ?? "ask";
  const tone = state === "invalid" ? "danger" : state === "configured" ? "success" : "warning";

  return {
    state,
    reason: readString(hostPolicy?.reason),
    source,
    updatedAt,
    defaultMode,
    entries,
    items: createChromeHostPolicyItems({ policy, state, source, updatedAt, defaultMode, entries, tone }),
    tone
  };
}

function createChromeHostPolicyItems({
  policy,
  state,
  source,
  updatedAt,
  defaultMode,
  entries,
  tone
}: {
  policy: Record<string, unknown> | undefined;
  state: string;
  source?: string;
  updatedAt?: string;
  defaultMode: string;
  entries: string[];
  tone: Tone;
}): DashboardStatusItem[] {
  const alwaysAllowedHosts = readStringArray(policy?.allowedHosts);
  const currentTurnHosts = readStringArray(policy?.currentTurnAllowedHosts);
  const blockedHosts = readStringArray(policy?.blockedHosts);

  return [
    createStatusItem("chrome policy", state, tone),
    createStatusItem("source", source ?? "unknown"),
    createStatusItem("updated", updatedAt ?? "unknown"),
    createStatusItem("entries", formatStringList(entries)),
    createStatusItem("default", defaultMode),
    createStatusItem("always allow", formatStringList(alwaysAllowedHosts), alwaysAllowedHosts.length > 0 ? "success" : "neutral"),
    createStatusItem("current turn", formatStringList(currentTurnHosts), currentTurnHosts.length > 0 ? "warning" : "neutral"),
    createStatusItem("blocked", formatStringList(blockedHosts), blockedHosts.length > 0 ? "danger" : "neutral"),
    createStatusItem("endpoint", "/api/chrome-host-policy")
  ];
}

function formatChromeHostPolicySource(hostPolicy: Record<string, unknown> | undefined): string | undefined {
  const source = readString(hostPolicy?.source);
  if (source) {
    return formatChromeHostPolicySourceValue(source);
  }

  const policyPath = readString(hostPolicy?.path);
  if (!policyPath) {
    return undefined;
  }

  return formatChromeHostPolicySourceValue(policyPath);
}

function formatChromeHostPolicySourceValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "unknown";
  }

  if (!/[\\/]/.test(trimmed) && !trimmed.startsWith("~")) {
    return trimmed;
  }

  return trimmed.split(/[\\/]/).filter(Boolean).at(-1) ?? "local policy file";
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

export function readOperatorReadinessChecks(snapshot: DashboardSnapshot): DashboardOperatorReadinessChecks {
  const readiness = readRecord(snapshot.operatorReadiness) ?? {};
  const commandSurface = readRecord(readiness.commandSurface) ?? {};
  const extensionReadiness = readRecord(readiness.extensionReadiness) ?? {};
  const packagedBinary = readRecord(readiness.packagedBinary) ?? {};
  const recentSmokeEvidence = readRecord(readiness.recentSmokeEvidence) ?? {};
  const state = readString(readiness.state) ?? "unknown";
  const passedTargets = readStringArray(recentSmokeEvidence.recentPassedTargets);
  const missingTargets = readStringArray(recentSmokeEvidence.missingTargets);
  const tone = readOperatorReadinessTone(state);

  return {
    title: "Operator readiness checks",
    value: state,
    detail: missingTargets.length > 0
      ? `Missing fresh evidence: ${missingTargets.join(", ")}.`
      : state === "ready"
        ? "Command surface, packaged runtime, and smoke evidence are aligned."
        : "Review readiness checks before starting the next Computer Use turn.",
    tone,
    items: [
      createStatusItem("state", state, tone),
      createStatusItem(
        "command surface",
        readString(commandSurface.state) ?? "unknown",
        readOperatorCheckTone(readString(commandSurface.state))
      ),
      createStatusItem(
        "extension",
        readString(extensionReadiness.state) ?? "unknown",
        readOperatorCheckTone(readString(extensionReadiness.state))
      ),
      createStatusItem(
        "binary",
        readString(packagedBinary.state) ?? "unknown",
        readOperatorCheckTone(readString(packagedBinary.state))
      ),
      createStatusItem(
        "signing",
        readString(packagedBinary.signingState) ?? "unknown",
        readSigningTone(readString(packagedBinary.signingState))
      ),
      createStatusItem("smoke passed", formatStringList(passedTargets)),
      createStatusItem("smoke missing", formatStringList(missingTargets), missingTargets.length > 0 ? "warning" : "success")
    ]
  };
}

function readOperatorReadinessTone(state: string): Tone {
  if (state === "ready") {
    return "success";
  }
  if (state === "blocked") {
    return "danger";
  }
  if (state === "unknown" || state === "missing") {
    return "neutral";
  }

  return "warning";
}

function readOperatorCheckTone(state: string | undefined): Tone {
  if (state === "ready" || state === "installed" || state === "connected" || state === "passed") {
    return "success";
  }
  if (state === "blocked" || state === "missing" || state === "failed" || state === "invalid") {
    return "danger";
  }
  if (!state || state === "unknown") {
    return "neutral";
  }

  return "warning";
}

function readSigningTone(state: string | undefined): Tone {
  if (state === "signed" || state === "valid" || state === "not-required") {
    return "success";
  }
  if (state === "invalid" || state === "missing") {
    return "danger";
  }
  if (!state || state === "unknown") {
    return "neutral";
  }

  return "warning";
}

function formatStringList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

export function readComputerUseReadiness(snapshot: DashboardSnapshot): DashboardComputerUseReadiness {
  const desktopSession = readRecord(snapshot.runtimeHealth.desktopSession);
  const desktopState = readString(desktopSession?.state) ?? "unknown";
  const frontmost = readString(desktopSession?.frontmostLocalizedName)
    ?? readString(desktopSession?.frontmostBundleId)
    ?? "No frontmost app reported";
  const permissions = [
    createPermissionStatus("Screen Recording", snapshot.permissions.screenRecording),
    createPermissionStatus("Accessibility", snapshot.permissions.accessibility),
    createPermissionStatus("Finder Automation", snapshot.permissions.finderAutomation)
  ];

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
    permissionSummary: readPermissionSummary(permissions),
    permissions,
    accessSteps: readComputerUseAccessSteps(snapshot)
  };
}

function readPermissionSummary(permissions: DashboardStatusItem[]): DashboardComputerUseReadiness["permissionSummary"] {
  const attention = permissions.filter((permission) => isPermissionAttentionState(permission.value));
  if (attention.length === 0) {
    return {
      value: "Ready",
      detail: "Screen Recording, Accessibility, and Finder Automation are ready.",
      tone: "success"
    };
  }
  const verb = attention.length === 1 ? "needs" : "need";

  return {
    value: `${attention.length} needed`,
    detail: `${formatPermissionLabelList(attention.map((permission) => permission.label))} ${verb} attention.`,
    tone: "warning"
  };
}

function formatPermissionLabelList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "Permissions";
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function isPermissionAttentionState(value: string): boolean {
  const normalized = value.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
  return normalized === "denied"
    || normalized === "unknown"
    || normalized === "not-determined"
    || normalized === "missing"
    || normalized === "blocked";
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

export function readSmokeArtifactInventory(snapshot: DashboardSnapshot): DashboardSmokeArtifactInventory {
  const artifacts = readRecordArray(snapshot.smokeEvidence.artifacts);
  const staleCount = artifacts.filter((artifact) => artifact.stale === true).length;
  const passedCount = artifacts.filter((artifact) => readString(artifact.result) === "passed").length;
  const attentionCount = artifacts.filter((artifact) => {
    const result = readString(artifact.result) ?? "unknown";
    return artifact.stale === true || !["passed", "available"].includes(result);
  }).length;
  const value = artifacts.length === 0
    ? "none"
    : staleCount > 0
      ? "stale"
      : attentionCount > 0
        ? "attention"
        : "fresh";
  const tone = artifacts.length === 0
    ? "warning"
    : staleCount > 0 || attentionCount > 0
      ? "warning"
      : "success";

  return {
    title: "Artifact inventory",
    value,
    detail: artifacts.length === 0
      ? "No smoke artifacts found."
      : `${artifacts.length} artifacts: ${passedCount} passed, ${attentionCount} attention, ${staleCount} stale.`,
    tone,
    items: artifacts.length > 0
      ? artifacts.map((artifact) => createStatusItem(
        readString(artifact.target) ?? "unknown",
        formatSmokeArtifactInventoryValue(artifact),
        artifact.stale === true ? "warning" : readSmokeDetailTone(readString(artifact.result) ?? "missing")
      ))
      : [createStatusItem("artifacts", "none", "warning")]
  };
}

function formatSmokeArtifactInventoryValue(artifact: Record<string, unknown>): string {
  const result = readString(artifact.result) ?? "unknown";
  return artifact.stale === true ? `${result} (stale)` : result;
}

export function readSmokeArtifactDetails(snapshot: DashboardSnapshot): DashboardSmokeArtifactDetail[] {
  const chromeArtifact = findSmokeArtifact(snapshot, "chrome");
  const pageSafety = readRecord(chromeArtifact?.pageSafety);
  const pageControl = readRecord(readRecord(snapshot.runtimeHealth.extension)?.pageControl)
    ?? readRecord(chromeArtifact?.pageControl);
  const finderArtifact = findSmokeArtifact(snapshot, "finder");
  const finder = readRecord(finderArtifact?.finder);

  return [
    createChromePageSafetyDetail(pageSafety),
    createChromePageControlDetail(pageControl),
    createFinderSmokeDetail(finder)
  ];
}

function createChromePageSafetyDetail(
  pageSafety: Record<string, unknown> | undefined
): DashboardSmokeArtifactDetail {
  const state = readString(pageSafety?.state) ?? "empty";
  const sensitivePause = pageSafety?.sensitivePause === true;
  const sensitivePage = formatChromePageSafetyRun(pageSafety, "sensitive-page");
  const formPrefill = formatChromePageSafetyRun(pageSafety, "sensitive-form-prefill");

  return {
    id: "chrome-page-safety",
    title: "Chrome page safety",
    value: state,
    tone: readSmokeDetailTone(state),
    items: [
      createStatusItem("state", state, readSmokeDetailTone(state)),
      createStatusItem("sensitive pause", sensitivePause ? "yes" : "no", sensitivePause ? "warning" : "success"),
      createStatusItem("pause count", formatUnknownNumber(readNumber(pageSafety?.pauseCount))),
      createStatusItem("checked runs", formatUnknownNumber(readNumber(pageSafety?.checkedRuns))),
      createStatusItem("finding kinds", readChromePageSafetyFindingKinds(pageSafety).join(", ") || "none"),
      createStatusItem("sensitive page", sensitivePage.value, sensitivePage.tone),
      createStatusItem("form prefill", formPrefill.value, formPrefill.tone),
      createStatusItem("reason", readChromePageSafetyReason(pageSafety)),
      createStatusItem("source", readString(pageSafety?.source) ?? "chrome-smoke-empty")
    ]
  };
}

function createChromePageControlDetail(
  pageControl: Record<string, unknown> | undefined
): DashboardSmokeArtifactDetail {
  const state = readString(pageControl?.state) ?? "not-probed";
  const capabilities = readRecord(pageControl?.capabilities);
  const tone = readSmokeDetailTone(state);

  return {
    id: "chrome-page-control",
    title: "Chrome pageControl",
    value: state,
    tone,
    items: [
      createStatusItem("state", state, tone),
      createStatusItem("capable", pageControl?.capable === true ? "capable" : "not capable", pageControl?.capable === true ? "success" : "warning"),
      createStatusItem("active tab", formatChromePageControlActiveTab(readRecord(pageControl?.activeTab))),
      createStatusItem("content script", formatChromePageControlContentScript(readRecord(pageControl?.contentScript))),
      createStatusItem("DOM actions", formatChromePageControlCapability(capabilities?.domActions)),
      createStatusItem("screenshot", formatChromePageControlCapability(capabilities?.screenshot)),
      createStatusItem("click/fill/submit/scroll", formatChromePageControlActions(capabilities)),
      createStatusItem("reason", readString(pageControl?.reason) ?? "Chrome pageControl readiness has not been probed yet."),
      createStatusItem("next", readString(pageControl?.nextAction) ?? "needs-action"),
      createStatusItem("source", readString(pageControl?.source) ?? "dashboard-empty")
    ]
  };
}

function createFinderSmokeDetail(
  finder: Record<string, unknown> | undefined
): DashboardSmokeArtifactDetail {
  const result = readString(finder?.result) ?? "missing";
  const desktopPreflight = readRecord(finder?.desktopPreflight);
  const finderObservation = readRecord(finder?.finderObservation);
  const finderSemanticObservation = readRecord(finder?.finderSemanticObservation);
  const finderItemDragDrop = readRecord(finder?.finderItemDragDrop);
  const tone = readSmokeDetailTone(result);

  return {
    id: "finder-smoke",
    title: "Finder smoke",
    value: result,
    tone,
    items: [
      createStatusItem("result", result, tone),
      createStatusItem("desktop preflight", formatFinderSmokeProbe(desktopPreflight), readSmokeDetailTone(readString(desktopPreflight?.result) ?? "missing")),
      createStatusItem("frontmost bundle", readString(desktopPreflight?.frontmostBundleId) ?? "unknown"),
      createStatusItem("display asleep", formatBoolean(desktopPreflight?.mainDisplayAsleep)),
      createStatusItem("desktop controllable", formatBoolean(desktopPreflight?.controllable)),
      createStatusItem("finder observation", formatFinderSmokeProbe(finderObservation), readSmokeDetailTone(readString(finderObservation?.result) ?? "missing")),
      createStatusItem("accessibility trusted", formatBoolean(finderObservation?.accessibilityTrusted)),
      createStatusItem("finder semantic", formatFinderSmokeProbe(finderSemanticObservation), readSmokeDetailTone(readString(finderSemanticObservation?.result) ?? "missing")),
      createStatusItem("finder drag/drop", formatFinderSmokeProbe(finderItemDragDrop), readSmokeDetailTone(readString(finderItemDragDrop?.result) ?? "missing")),
      createStatusItem("reason", readString(finder?.reason) ?? "Latest Finder smoke has not reported desktop preflight evidence yet."),
      createStatusItem("source", readString(finder?.source) ?? "finder-smoke-empty")
    ]
  };
}

export function readDogfoodSummary(snapshot: DashboardSnapshot): DashboardDogfoodSummary {
  const release = readRecord(snapshot.dogfoodRelease);
  const releaseState = readString(release?.state) ?? "unknown";
  const drift = readRecord(release?.releaseDrift);
  const releaseDriftState = readString(drift?.state) ?? "unknown";
  const cohort = readRecord(release?.cohort);
  const latestAlpha = readRecord(release?.latestAlpha);
  const manifest = readRecord(release?.manifest);
  const currentHead = readRecord(release?.currentHead);
  const acceptedReports = readNumber(cohort?.acceptedReportCount) ?? 0;
  const distinctTesters = readNumber(cohort?.distinctRealTesterCount) ?? 0;
  const totalReports = readNumber(cohort?.totalReports);
  const ready = cohort?.ready === true;
  const passedReady = cohort?.passedReady === true;
  const releaseCommit = readString(drift?.releaseCommitSha)
    ?? readString(latestAlpha?.shortCommit)
    ?? readString(latestAlpha?.commitSha);
  const headCommit = readString(drift?.currentHeadCommitSha)
    ?? readString(currentHead?.shortCommit)
    ?? readString(currentHead?.commitSha);
  const manifestState = readString(manifest?.state) ?? "unknown";
  const latestAlphaState = readString(latestAlpha?.state) ?? "unknown";
  const zipSha = readString(manifest?.zipSha256) ?? readString(latestAlpha?.zipSha256);
  const coverage = readRecord(cohort?.workflowCoverage);
  const passedCoverage = readRecord(cohort?.passedWorkflowCoverage);
  const cohortReadyValue = ready ? passedReady ? "passed" : "partial" : "no";
  const cohortReadyTone: Tone = ready ? passedReady ? "success" : "warning" : "neutral";

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
        : "neutral",
    items: [
      createStatusItem("state", releaseState, readDogfoodStateTone(releaseState, passedReady)),
      createStatusItem(
        "alpha",
        readString(latestAlpha?.tagName) ?? latestAlphaState,
        readDogfoodStateTone(latestAlphaState, passedReady)
      ),
      createStatusItem(
        "release commit",
        formatShortCommit(releaseCommit),
        releaseDriftState === "behind-head" ? "warning" : "neutral"
      ),
      createStatusItem(
        "head commit",
        formatShortCommit(headCommit),
        releaseDriftState === "behind-head" ? "warning" : "neutral"
      ),
      createStatusItem("manifest", manifestState, manifestState === "present" ? "success" : "warning"),
      createStatusItem("zip sha", formatShortSha(zipSha)),
      createStatusItem("cohort ready", cohortReadyValue, cohortReadyTone),
      createStatusItem(
        "reports",
        totalReports === undefined
          ? `${acceptedReports} accepted / ${distinctTesters} testers`
          : `${acceptedReports} accepted / ${distinctTesters} testers / ${totalReports} total`
      ),
      createStatusItem("workflow coverage", formatCoverageSummary(coverage), readCoverageTone(coverage)),
      createStatusItem("passed workflows", formatCoverageSummary(passedCoverage), readCoverageTone(passedCoverage)),
      createStatusItem(
        "drift",
        readDogfoodDriftLabel(releaseDriftState, releaseCommit, headCommit),
        releaseDriftState === "behind-head" ? "warning" : "success"
      )
    ]
  };
}

function readDogfoodStateTone(state: string, passedReady: boolean): Tone {
  if (
    state === "passed-cohort-ready"
    || (state === "cohort-ready" && passedReady)
    || state === "published"
    || state === "present"
  ) {
    return "success";
  }
  if (state === "missing" || state === "invalid") {
    return "danger";
  }
  if (state === "waiting-for-dogfood" || state === "cohort-ready") {
    return "warning";
  }

  return "neutral";
}

function readDogfoodDriftLabel(
  state: string,
  releaseCommit: string | undefined,
  headCommit: string | undefined
): string {
  if (state === "behind-head") {
    return `${state} ${formatShortCommit(releaseCommit)} -> ${formatShortCommit(headCommit)}`;
  }

  return state;
}

function formatShortCommit(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }

  return /^[a-f0-9]{7,40}$/iu.test(value) ? value.slice(0, 7) : value;
}

function formatShortSha(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }

  return /^[a-f0-9]{12,}$/iu.test(value) ? value.slice(0, 12) : value;
}

function formatCoverageSummary(coverage: Record<string, unknown> | undefined): string {
  if (!coverage) {
    return "unknown";
  }

  const entries = Object.entries(coverage).filter(([, value]) => typeof value === "boolean");
  if (entries.length === 0) {
    return "unknown";
  }

  const covered = entries.filter(([, value]) => value === true).length;
  return `${covered}/${entries.length}`;
}

function readCoverageTone(coverage: Record<string, unknown> | undefined): Tone {
  if (!coverage) {
    return "neutral";
  }

  const entries = Object.entries(coverage).filter(([, value]) => typeof value === "boolean");
  if (entries.length === 0) {
    return "neutral";
  }

  return entries.every(([, value]) => value === true) ? "success" : "warning";
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

export function readAppsSitesSummary(snapshot: DashboardSnapshot): DashboardAppsSitesSummary {
  const chromeControl = readChromeControlState(snapshot);

  return {
    title: "Apps and sites",
    value: readAppsSitesValue(chromeControl),
    detail: readAppsSitesDetail(chromeControl),
    tone: readAppsSitesTone(chromeControl),
    items: [
      createStatusItem(
        "Chrome",
        chromeControl.liveConnection === "connected" ? "Connected" : "Extension needs refresh",
        chromeControl.liveConnection === "connected" ? "success" : "warning"
      ),
      createStatusItem(
        "Native host",
        chromeControl.nativeHostState,
        chromeControl.nativeHostState === "installed" ? "success" : "warning"
      ),
      createStatusItem("Current page", chromeControl.activeTabLabel),
      createStatusItem("Host policy", chromeControl.hostPolicy.state, chromeControl.hostPolicy.tone),
      createStatusItem("Browser Context", chromeControl.browserContext.state, chromeControl.browserContext.tone),
      createStatusItem("Screenshot", chromeControl.screenshotLane, readScreenshotLaneTone(chromeControl.screenshotLane)),
      createStatusItem("Tab discovery", chromeControl.tabDiscoveryLabel)
    ]
  };
}

function readAppsSitesValue(chromeControl: DashboardChromeControlState): string {
  if (chromeControl.actionable && chromeControl.screenshotLane !== "ready") {
    return "Partial";
  }
  if (chromeControl.actionable && chromeControl.tone === "success") {
    return "Ready";
  }
  if (chromeControl.actionable) {
    return "Partial";
  }
  if (chromeControl.tone === "danger") {
    return "Blocked";
  }
  if (chromeControl.liveConnection !== "connected" || chromeControl.nativeHostState !== "installed") {
    return "Refresh";
  }

  return "Review";
}

function readAppsSitesTone(chromeControl: DashboardChromeControlState): Tone {
  if (chromeControl.actionable && chromeControl.screenshotLane !== "ready") {
    return "warning";
  }

  return chromeControl.tone;
}

function readAppsSitesDetail(chromeControl: DashboardChromeControlState): string {
  if (chromeControl.actionable && chromeControl.screenshotLane === "ready") {
    return "Chrome DOM actions and screenshot capture are ready for this HTTP(S) page.";
  }
  if (chromeControl.actionable) {
    return "Chrome DOM actions are ready; screenshots may need Chrome capture permission or desktop fallback.";
  }

  return chromeControl.nextAction
    ?? chromeControl.browserContext.nextAction
    ?? chromeControl.reason
    ?? chromeControl.browserContext.reason;
}

function readScreenshotLaneTone(value: string): Tone {
  if (value === "ready") {
    return "success";
  }
  if (value === "blocked") {
    return "danger";
  }
  if (value.includes("permission") || value.includes("fallback")) {
    return "warning";
  }

  return "neutral";
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

export function readAlertGroupSummary(snapshot: DashboardSnapshot): DashboardAlertGroupSummary {
  const groups = readAlertGroups(snapshot.alerts);
  const errorCount = snapshot.alerts.filter((alert) => readString(alert.severity) === "error").length;
  const warningCount = snapshot.alerts.filter((alert) => readString(alert.severity) === "warning").length;
  const tone: Tone = errorCount > 0 ? "danger" : warningCount > 0 ? "warning" : "success";

  return {
    title: "Alerts",
    value: snapshot.alerts.length === 0 ? "clear" : `${snapshot.alerts.length} alert${snapshot.alerts.length === 1 ? "" : "s"}`,
    detail: snapshot.alerts.length === 0
      ? "No dashboard alerts are active."
      : `Grouped by ${groups.length} blocker area${groups.length === 1 ? "" : "s"}.`,
    tone,
    groups
  };
}

function readAlertGroups(alerts: Array<Record<string, unknown>>): DashboardAlertGroup[] {
  const grouped = new Map<DashboardAlertGroup["id"], {
    definition: AlertGroupDefinition;
    alerts: Array<Record<string, unknown>>;
    severityRank: number;
  }>();

  for (const alert of alerts) {
    const definition = classifyAlertGroup(alert);
    const existing = grouped.get(definition.id) ?? {
      definition,
      alerts: [],
      severityRank: 0
    };
    existing.alerts.push(alert);
    existing.severityRank = Math.max(existing.severityRank, readAlertSeverityRank(alert));
    grouped.set(definition.id, existing);
  }

  return [...grouped.values()]
    .sort((left, right) =>
      right.severityRank - left.severityRank || left.definition.order - right.definition.order
    )
    .map(({ definition, alerts: groupAlerts }) => {
      const tone = groupAlerts.reduce<Tone>((highest, alert) =>
        readHigherAlertTone(highest, readAlertTone(alert)), "neutral");
      const firstAlert = groupAlerts[0];

      return {
        id: definition.id,
        title: definition.title,
        value: `${groupAlerts.length} alert${groupAlerts.length === 1 ? "" : "s"}`,
        detail: readString(firstAlert?.message)
          ?? readString(firstAlert?.code)
          ?? "Review dashboard alert.",
        tone,
        items: groupAlerts.map((alert) => createStatusItem(
          readString(alert.code) ?? "alert",
          readString(alert.message) ?? readString(alert.severity) ?? "Review dashboard alert.",
          readAlertTone(alert)
        ))
      };
    });
}

interface AlertGroupDefinition {
  id: DashboardAlertGroup["id"];
  title: string;
  order: number;
}

function classifyAlertGroup(alert: Record<string, unknown>): AlertGroupDefinition {
  const code = readString(alert.code) ?? "";
  if (code.startsWith("desktop-") || code === "desktop-session-blocked") {
    return { id: "desktop", title: "Desktop session", order: 10 };
  }
  if (code.includes("recording") || code.includes("accessibility") || code.includes("finder-automation")) {
    return { id: "permissions", title: "Permissions", order: 20 };
  }
  if (code.startsWith("chrome-") || code.startsWith("extension-")) {
    return { id: "chrome", title: "Chrome bridge", order: 30 };
  }
  if (code.startsWith("smoke-")) {
    return { id: "evidence", title: "Smoke evidence", order: 40 };
  }
  if (code.startsWith("release-")) {
    return { id: "release", title: "Release drift", order: 50 };
  }
  if (code.startsWith("runtime-snapshot")) {
    return { id: "runtime", title: "Runtime snapshot", order: 60 };
  }

  return { id: "other", title: "Other", order: 90 };
}

function readAlertSeverityRank(alert: Record<string, unknown>): number {
  const severity = readString(alert.severity);
  if (severity === "error") {
    return 3;
  }
  if (severity === "warning") {
    return 2;
  }
  if (severity === "info") {
    return 1;
  }

  return 0;
}

function readHigherAlertTone(left: Tone, right: Tone): Tone {
  return readToneSeverity(right) > readToneSeverity(left) ? right : left;
}

function readToneSeverity(tone: Tone): number {
  if (tone === "danger") {
    return 3;
  }
  if (tone === "warning") {
    return 2;
  }
  if (tone === "success") {
    return 1;
  }

  return 0;
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

export function readHomeSummary(snapshot: DashboardSnapshot): DashboardHomeSummary {
  const runtime = readRecord(snapshot.runtimeHealth) ?? {};
  const desktopSession = readRecord(runtime.desktopSession) ?? {};
  const freshness = readRuntimeSnapshotFreshness(snapshot, snapshot.currentTurn);
  const routeOutcome = readRouteOutcome(snapshot);
  const assistant = readHomeAssistantState(snapshot, snapshot.currentTurn, freshness, routeOutcome);
  const nextAction = readHomeNextAction(snapshot, routeOutcome);

  return {
    title: "Home",
    value: assistant.label,
    detail: assistant.detail,
    tone: assistant.tone,
    items: [
      createStatusItem("assistant", assistant.detail, assistant.tone),
      createStatusItem(
        "current task",
        readString(snapshot.currentTurn.command)
          ?? readString(snapshot.currentTurn.latestMessage)
          ?? "No active task"
      ),
      createStatusItem(
        "target",
        readString(snapshot.currentTurn.targetApp)
          ?? readString(desktopSession.frontmostLocalizedName)
          ?? "None"
      ),
      createStatusItem("risk", readString(snapshot.currentTurn.risk) ?? "not evaluated"),
      createStatusItem("next", nextAction.detail, nextAction.tone),
      createStatusItem("stop", readString(snapshot.currentTurn.stopState) ?? "inactive")
    ]
  };
}

function readHomeAssistantState(
  snapshot: DashboardSnapshot,
  turn: Record<string, unknown>,
  freshness: DashboardRuntimeSnapshotFreshness,
  routeOutcome: DashboardRouteOutcome
): { label: string; detail: string; tone: Tone } {
  if (snapshot.alerts.some((alert) => readString(alert.severity) === "error")) {
    return { label: "Blocked", detail: "Needs your attention", tone: "danger" };
  }
  if (freshness.state === "stale") {
    return { label: "Stale", detail: "Runtime stream is stale", tone: "warning" };
  }

  const turnState = readString(turn.state);
  if (turnState === "approval_required" || turnState === "needs_confirmation") {
    return { label: "Waiting", detail: "Approval required", tone: "warning" };
  }
  if (turnState === "executing") {
    return { label: "Acting", detail: "Executing a task", tone: "warning" };
  }
  if (turnState === "observing") {
    return { label: "Watching", detail: "Reading the desktop", tone: "warning" };
  }

  const routeAssistant = readHomeAssistantStateFromRouteOutcome(routeOutcome);
  if (routeAssistant) {
    return routeAssistant;
  }

  if (turnState === "failed") {
    return { label: "Failed", detail: "Last task failed", tone: "danger" };
  }
  if (turnState === "completed") {
    return { label: "Done", detail: "Last task completed", tone: "success" };
  }

  return { label: "Idle", detail: "Ready for an agent task", tone: "success" };
}

function readHomeAssistantStateFromRouteOutcome(
  routeOutcome: DashboardRouteOutcome
): { label: string; detail: string; tone: Tone } | undefined {
  switch (routeOutcome.kind) {
    case "app_policy_denied":
      return { label: "Policy denied", detail: routeOutcome.title, tone: "danger" };
    case "user_denied":
      return { label: "Denied", detail: routeOutcome.title, tone: "neutral" };
    case "blocked":
      return { label: "Blocked", detail: routeOutcome.title, tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", detail: routeOutcome.title, tone: "neutral" };
    case "stopped":
      return { label: "Stopped", detail: routeOutcome.title, tone: "neutral" };
    default:
      return undefined;
  }
}

function readHomeNextAction(
  snapshot: DashboardSnapshot,
  routeOutcome: DashboardRouteOutcome
): { detail: string; tone: Tone } {
  const blocker = snapshot.alerts.find((alert) => {
    const severity = readString(alert.severity);
    return severity === "error" || severity === "warning";
  });
  if (blocker) {
    return {
      detail: readString(blocker.message) ?? readString(blocker.code) ?? "Review dashboard alert.",
      tone: readAlertTone(blocker)
    };
  }

  if (readString(snapshot.currentTurn.approvalState) === "required") {
    return { detail: "Review the pending approval.", tone: "warning" };
  }

  const routeNextAction = readNextActionFromRouteOutcome(routeOutcome);
  if (routeNextAction) {
    return { detail: routeNextAction.title, tone: routeNextAction.tone };
  }

  const extension = readRecord(snapshot.runtimeHealth.extension) ?? {};
  const liveConnection = readString(extension.liveConnection)
    ?? readString(extension.connectionState)
    ?? readString(extension.state)
    ?? "unknown";
  if (liveConnection !== "connected") {
    return { detail: "Refresh Chrome extension heartbeat.", tone: "warning" };
  }

  return { detail: "Ready for the next agent task.", tone: "success" };
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
  const routeOutcome = readRouteOutcome(snapshot);
  const routeSignal = readLatestRouteOutcomeSignal(routeOutcome);
  if (routeSignal) {
    return routeSignal;
  }

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

function readLatestRouteOutcomeSignal(routeOutcome: DashboardRouteOutcome): DashboardLatestTaskSignal | undefined {
  switch (routeOutcome.kind) {
    case "app_policy_denied":
    case "blocked":
    case "failed":
      return {
        title: "Latest blocker",
        value: routeOutcome.value,
        detail: routeOutcome.detail,
        tone: routeOutcome.tone,
        source: routeOutcome.source
      };
    case "user_denied":
    case "cancelled":
    case "stopped":
      return {
        title: "Latest outcome",
        value: routeOutcome.value,
        detail: routeOutcome.detail,
        tone: routeOutcome.tone,
        source: routeOutcome.source
      };
    default:
      return undefined;
  }
}

export function readApprovalQueueSummary(snapshot: DashboardSnapshot): DashboardApprovalQueueSummary {
  const extension = readRecord(snapshot.runtimeHealth.extension) ?? {};
  const hostPolicy = readRecord(extension.hostPolicy) ?? {};
  const liveConnection = readString(extension.liveConnection)
    ?? readString(extension.connectionState)
    ?? readString(extension.state)
    ?? "unknown";
  const items: DashboardStatusItem[] = [];
  const currentTurnState = readString(snapshot.currentTurn.state) ?? "idle";
  const approvalState = readString(snapshot.currentTurn.approvalState) ?? "";

  if (
    currentTurnState.includes("approval")
    || currentTurnState === "needs_confirmation"
    || approvalState === "pending"
    || approvalState === "required"
    || snapshot.currentTurn.approvalRequired === true
  ) {
    const risk = readString(snapshot.currentTurn.risk) ?? "review";
    const detail = readString(snapshot.currentTurn.latestMessage)
      ?? readString(snapshot.currentTurn.command)
      ?? "Review the pending Computer Use action.";
    items.push(createStatusItem("Computer Use approval", `${risk}: ${detail}`, "warning"));
  }

  if (liveConnection !== "connected") {
    items.push(createStatusItem(
      "Chrome extension",
      "heartbeat not connected; refresh the extension before trusting page control",
      "warning"
    ));
  }

  if (readString(hostPolicy.state) === "default") {
    items.push(createStatusItem(
      "Chrome host policy",
      "ask-by-default; new sites will request approval",
      "warning"
    ));
  }

  return {
    title: "Approvals",
    value: items.length > 0 ? `${items.length} pending` : "clear",
    detail: items.length > 0
      ? "Review pending local approval and browser access requests."
      : "No pending local approvals.",
    tone: items.length > 0 ? "warning" : "success",
    items
  };
}

export function readActivityFeedSummary(snapshot: DashboardSnapshot): DashboardActivityFeedSummary {
  const turnState = readString(snapshot.currentTurn.state) ?? "idle";
  const replayState = readString(snapshot.replay.state) ?? "empty";
  const active = Boolean(turnState && turnState !== "idle");
  const items = [
    ...readChromeControlActivityItems(snapshot),
    createStatusItem("latest action", formatRuntimeAction(readRecord(snapshot.currentTurn.latestAction))),
    createStatusItem("verification", formatRuntimeVerification(readRecord(snapshot.currentTurn.latestVerification))),
    createStatusItem("screenshot", readRuntimeActivityScreenshot(snapshot)),
    createStatusItem("replay", replayState, replayState === "available" ? "success" : "neutral")
  ];

  return {
    title: "Activity feed",
    value: active ? "live" : replayState === "available" ? "recent" : "idle",
    detail: "Recent local activity from the current turn and replay snapshots.",
    tone: active ? "warning" : replayState === "available" ? "success" : "neutral",
    items
  };
}

function readChromeControlActivityItems(snapshot: DashboardSnapshot): DashboardStatusItem[] {
  const entries = [
    readRecord(snapshot.currentTurn.chromeControlActivity),
    readRecord(snapshot.currentTurn.latestChromeControlAction),
    ...readRecordArray(snapshot.replay.chromeControlActions)
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));

  return entries.slice(-4).map((entry) => createStatusItem(
    readString(entry.title) ?? "Chrome action",
    formatChromeControlActivity(entry),
    readChromeControlActivityTone(entry)
  ));
}

function formatChromeControlActivity(entry: Record<string, unknown>): string {
  const target = readRecord(entry.target) ?? {};
  const title = readString(entry.title) ?? "Chrome action";
  const host = readString(target.host) ?? "current page";
  const tabId = readNumber(target.tabId);
  const tab = tabId !== undefined ? ` tab ${tabId}` : "";
  return `${title}: ${formatChromeControlActivityResult(entry)} - ${host}${tab}`;
}

function formatChromeControlActivityResult(entry: Record<string, unknown>): string {
  const result = readString(entry.result);
  if (result === "verified") {
    return "Verified";
  }
  if (result === "blocked") {
    return readString(entry.blockerReason) ?? "Blocked";
  }
  if (result === "failed") {
    return readString(entry.blockerReason) ?? "Failed";
  }

  return readString(entry.blockerReason) ?? "Unknown";
}

function readChromeControlActivityTone(entry: Record<string, unknown>): Tone {
  const result = readString(entry.result);
  if (result === "verified") {
    return "success";
  }
  if (result === "blocked") {
    return "warning";
  }
  if (result === "failed") {
    return "danger";
  }

  return "neutral";
}

function readRuntimeActivityScreenshot(snapshot: DashboardSnapshot): string {
  const latestScreenshot = readRecord(snapshot.currentTurn.latestScreenshot);
  if (latestScreenshot) {
    return formatRuntimeScreenshot(latestScreenshot);
  }

  return `screenshots ${formatUnknownNumber(readNumber(snapshot.replay.screenshotCount))}`;
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

export function readOperatorEvidenceSummary(snapshot: DashboardSnapshot): DashboardOperatorEvidenceSummary {
  const descriptor = readRecord(snapshot.descriptor) ?? {};
  const bind = readRecord(descriptor.bind) ?? {};
  const runtime = readRecord(snapshot.runtimeHealth) ?? {};
  const extension = readRecord(runtime.extension) ?? {};
  const nativeHost = readRecord(runtime.nativeHost) ?? {};
  const readinessState = readString(snapshot.operatorReadiness.state) ?? "unknown";
  const alertCount = snapshot.alerts.length;
  const artifactCount = readRecordArray(snapshot.smokeEvidence.artifacts).length;
  const hasError = snapshot.alerts.some((alert) => readString(alert.severity) === "error");
  const hasWarning = snapshot.alerts.some((alert) => readString(alert.severity) === "warning");
  const tone: Tone = hasError || readinessState === "blocked"
    ? "danger"
    : hasWarning
      ? "warning"
      : readinessState === "ready"
        ? "success"
        : "neutral";

  return {
    title: "Operator evidence",
    value: hasError || readinessState === "blocked"
      ? "Blocked"
      : hasWarning
        ? "Attention"
        : readinessState,
    detail: "Dashboard, runtime, and readiness handoff payload.",
    tone,
    items: [
      createStatusItem("endpoint", "/api/operator-evidence"),
      createStatusItem("dashboard", readString(descriptor.url) ?? "unknown"),
      createStatusItem("bind", formatDashboardBind(bind)),
      createStatusItem("turn", readString(snapshot.currentTurn.state) ?? "unknown"),
      createStatusItem("replay", readString(snapshot.replay.state) ?? "unknown"),
      createStatusItem("readiness", readinessState, readReadinessTone(readinessState)),
      createStatusItem("alerts", alertCount, alertCount > 0 ? (hasError ? "danger" : "warning") : "success"),
      createStatusItem("extension", readString(extension.state) ?? "unknown"),
      createStatusItem("native host", readString(nativeHost.state) ?? "unknown"),
      createStatusItem("smoke artifacts", artifactCount)
    ]
  };
}

function formatDashboardBind(bind: Record<string, unknown>): string {
  const host = readString(bind.host);
  const port = readNumber(bind.port);
  return host && Number.isInteger(port) ? `${host}:${port}` : "unknown";
}

export function readRuntimeSnapshotDetails(snapshot: DashboardSnapshot): DashboardRuntimeSnapshotDetail[] {
  const currentTurnFreshness = readRuntimeSnapshotFreshness(snapshot, snapshot.currentTurn);
  const replayFreshness = readRuntimeSnapshotFreshness(snapshot, snapshot.replay);
  const routeOutcome = readRouteOutcome(snapshot);

  return [
    {
      id: "current-turn",
      title: "Current turn snapshot",
      value: readRuntimePanelStatusLabel(snapshot.currentTurn, currentTurnFreshness, "current-turn"),
      tone: readRuntimePanelTone(snapshot.currentTurn, currentTurnFreshness, "current-turn"),
      items: [
        createStatusItem("state", readString(snapshot.currentTurn.state) ?? "idle"),
        createStatusItem("route outcome", routeOutcome.value, routeOutcome.tone),
        createStatusItem("route detail", routeOutcome.detail),
        createStatusItem(
          "snapshot freshness",
          currentTurnFreshness.state,
          readRuntimeSnapshotFreshnessTone(currentTurnFreshness.state)
        ),
        createStatusItem("snapshot age", formatRuntimeSnapshotAge(currentTurnFreshness)),
        createStatusItem("source", currentTurnFreshness.source),
        createStatusItem("stale", currentTurnFreshness.stale),
        createStatusItem("target", readString(snapshot.currentTurn.targetApp) ?? "unknown"),
        createStatusItem("risk", readString(snapshot.currentTurn.risk) ?? "unknown"),
        createStatusItem("approval", readString(snapshot.currentTurn.approvalState) ?? "unknown"),
        createStatusItem("stop", readString(snapshot.currentTurn.stopState) ?? "unknown"),
        createStatusItem("agent provider", readString(snapshot.currentTurn.agentProvider) ?? "unknown"),
        createStatusItem("command", readString(snapshot.currentTurn.command) ?? "none"),
        createStatusItem("latest action", formatRuntimeAction(readRecord(snapshot.currentTurn.latestAction))),
        createStatusItem(
          "latest verify",
          formatRuntimeVerification(readRecord(snapshot.currentTurn.latestVerification))
        ),
        createStatusItem(
          "latest screenshot",
          formatRuntimeScreenshot(readRecord(snapshot.currentTurn.latestScreenshot))
        ),
        createStatusItem("message", readString(snapshot.currentTurn.latestMessage) ?? "none"),
        createStatusItem("snapshot reason", currentTurnFreshness.reason ?? "none")
      ]
    },
    {
      id: "replay",
      title: "Replay snapshot",
      value: readRuntimePanelStatusLabel(snapshot.replay, replayFreshness, "replay"),
      tone: readRuntimePanelTone(snapshot.replay, replayFreshness, "replay"),
      items: [
        createStatusItem("state", readString(snapshot.replay.state) ?? "empty"),
        createStatusItem(
          "snapshot freshness",
          replayFreshness.state,
          readRuntimeSnapshotFreshnessTone(replayFreshness.state)
        ),
        createStatusItem("snapshot age", formatRuntimeSnapshotAge(replayFreshness)),
        createStatusItem("source", replayFreshness.source),
        createStatusItem("stale", replayFreshness.stale),
        createStatusItem("screenshots", formatUnknownNumber(readNumber(snapshot.replay.screenshotCount))),
        createStatusItem("actions", formatUnknownNumber(readNumber(snapshot.replay.actionCount))),
        createStatusItem("verifications", formatUnknownNumber(readNumber(snapshot.replay.verificationCount))),
        createStatusItem(
          "latest screenshot",
          formatRuntimeScreenshot(readRecordArray(snapshot.replay.screenshots).at(-1))
        ),
        createStatusItem(
          "latest action",
          formatRuntimeAction(readRecordArray(snapshot.replay.actions).at(-1))
        ),
        createStatusItem(
          "latest verify",
          formatRuntimeVerification(readRecordArray(snapshot.replay.verifications).at(-1))
        ),
        createStatusItem("timeline tail", formatRuntimeTimelineTail(readRecordArray(snapshot.replay.timelineTail))),
        createStatusItem("snapshot reason", replayFreshness.reason ?? "none")
      ]
    }
  ];
}

export function readLongHorizonSummary(snapshot: DashboardSnapshot): DashboardLongHorizonSummary {
  const longHorizon = readRecord(snapshot.longHorizon) ?? {};
  const activePane = readRecord(longHorizon.activePane) ?? {};
  const recommendation = readRecord(longHorizon.recommendation) ?? {};
  const state = readString(longHorizon.state) ?? "unknown";
  const session = readString(longHorizon.session) ?? "money-run";
  const recommendationAction = readString(recommendation.action) ?? "none";
  const recommendationReason = readString(recommendation.reason) ?? readString(longHorizon.probeError);
  const probeCount = Array.isArray(longHorizon.probeCommands)
    ? longHorizon.probeCommands.length
    : undefined;
  const signalCount = readRecordArray(longHorizon.signals).length;
  const detail = recommendationReason
    ?? (state === "observing"
      ? `${session} is being observed through read-only probes.`
      : `No long-horizon supervision recommendation has been recorded for ${session}.`);

  return {
    title: "Long-horizon supervision",
    value: state,
    detail,
    tone: readLongHorizonTone(state),
    items: [
      createStatusItem("state", state, readLongHorizonTone(state)),
      createStatusItem("session", session),
      createStatusItem("source", readString(longHorizon.source) ?? "unknown"),
      createStatusItem("active pane", readString(activePane.id) ?? "none"),
      createStatusItem("command", readString(activePane.currentCommand) ?? "none"),
      createStatusItem("recommend", recommendationAction),
      createStatusItem("reason", recommendationReason ?? "none"),
      createStatusItem("mutates", readBoolean(longHorizon.mutatesSession) ?? false),
      createStatusItem("signals", formatUnknownNumber(signalCount)),
      createStatusItem("probes", formatUnknownNumber(probeCount))
    ]
  };
}

export function readAgentSupervisionSummary(snapshot: DashboardSnapshot): DashboardAgentSupervisionSummary {
  const longHorizon = readRecord(snapshot.longHorizon) ?? {};
  const readinessState = readString(snapshot.operatorReadiness.state) ?? "unknown";
  const activePane = readRecord(longHorizon.activePane) ?? {};
  const recommendation = readRecord(longHorizon.recommendation) ?? {};
  const moneyRunState = readString(longHorizon.state) ?? "not observed";
  const recommendationAction = readString(recommendation.action) ?? readNextAction(snapshot).detail;
  const recommendationReason = readString(recommendation.reason) ?? readString(longHorizon.probeError);
  const tone = readAgentSupervisionTone(moneyRunState, readinessState);

  return {
    title: "Agent supervision",
    value: tone === "success" ? "Ready" : "Needs evidence",
    detail: recommendationReason ?? recommendationAction,
    tone,
    items: [
      createStatusItem("money-run", moneyRunState, readLongHorizonTone(moneyRunState)),
      createStatusItem("active pane", readString(activePane.id) ?? "none"),
      createStatusItem("recommendation", recommendationAction),
      createStatusItem("reason", recommendationReason ?? "none"),
      createStatusItem("mutates session", readBoolean(longHorizon.mutatesSession) ?? "unknown")
    ]
  };
}

function readAgentSupervisionTone(moneyRunState: string, readinessState: string): Tone {
  if (moneyRunState === "observing" || moneyRunState === "ready" || readinessState === "ready") {
    return "success";
  }
  if (moneyRunState === "blocked" || moneyRunState === "failed" || readinessState === "blocked") {
    return "danger";
  }

  return "warning";
}

function readLongHorizonTone(state: string): Tone {
  if (state === "observing" || state === "ready") {
    return "success";
  }
  if (state === "blocked" || state === "failed") {
    return "danger";
  }
  if (state === "unknown" || state === "missing") {
    return "neutral";
  }

  return "warning";
}

function readRuntimeSnapshotFreshness(
  snapshot: DashboardSnapshot,
  panel: Record<string, unknown>
): DashboardRuntimeSnapshotFreshness {
  const runtimeSnapshot = readRecord(snapshot.runtimeHealth.runtimeSnapshot) ?? {};
  const source = readString(panel.source) ?? readString(runtimeSnapshot.source) ?? "unknown";
  const observedAt = readString(panel.observedAt) ?? readString(runtimeSnapshot.observedAt);
  const reason = readString(panel.reason) ?? readString(runtimeSnapshot.reason);
  const ageSeconds = readRuntimeSnapshotAgeSeconds(snapshot.generatedAt, observedAt);
  const runtimeState = readString(runtimeSnapshot.state);
  const afterTurnEvidenceLoss = runtimeState === "missing-after-turn" || runtimeState === "stale-after-turn";
  const empty = !afterTurnEvidenceLoss && (
    panel.freshInstall === true
    || runtimeSnapshot.freshInstall === true
    || Boolean(readString(panel.emptyReasonCode))
    || Boolean(readString(runtimeSnapshot.emptyReasonCode))
    || runtimeState === "missing"
  );
  const unavailable = runtimeState === "unavailable"
    || runtimeState === "repair-failed"
    || runtimeState === "isolated";
  const stale = afterTurnEvidenceLoss
    || panel.stale === true
    || runtimeSnapshot.stale === true
    || (
      ageSeconds !== undefined
      && ageSeconds > DASHBOARD_RUNTIME_SNAPSHOT_STALE_SECONDS
    );
  const state: DashboardRuntimeSnapshotFreshnessState = empty
    ? "empty"
    : unavailable
      ? "unavailable"
      : stale
        ? "stale"
        : observedAt
          ? "fresh"
          : "unknown";

  return { state, source, observedAt, reason, ageSeconds, stale };
}

function readRuntimeSnapshotAgeSeconds(generatedAt: string, observedAt: string | undefined): number | undefined {
  const generatedAtMs = Date.parse(generatedAt || "");
  const observedAtMs = Date.parse(observedAt || "");
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(observedAtMs)) {
    return undefined;
  }

  return Math.max(0, Math.floor((generatedAtMs - observedAtMs) / 1000));
}

function formatRuntimeSnapshotAge(freshness: DashboardRuntimeSnapshotFreshness): string {
  if (freshness.ageSeconds === undefined) {
    return freshness.observedAt ?? "unknown";
  }

  return `${freshness.ageSeconds}s old${freshness.observedAt ? ` (${freshness.observedAt})` : ""}`;
}

function readRuntimePanelStatusLabel(
  panel: Record<string, unknown>,
  freshness: DashboardRuntimeSnapshotFreshness,
  kind: DashboardRuntimeSnapshotDetail["id"]
): string {
  if (freshness.state === "stale") {
    return "Stale";
  }
  if (freshness.state === "empty") {
    return "Empty";
  }
  if (freshness.state === "unavailable") {
    return "Unavailable";
  }
  if (kind === "current-turn") {
    return readString(panel.state) === "idle" ? "Idle" : "Active";
  }

  return readString(panel.state) ?? "Loaded";
}

function readRuntimePanelTone(
  panel: Record<string, unknown>,
  freshness: DashboardRuntimeSnapshotFreshness,
  kind: DashboardRuntimeSnapshotDetail["id"]
): Tone {
  if (freshness.state === "unavailable") {
    return "danger";
  }
  if (freshness.state === "stale") {
    return "warning";
  }
  if (freshness.state === "empty") {
    return kind === "current-turn" ? "success" : "warning";
  }
  if (kind === "current-turn") {
    return readString(panel.state) === "idle" ? "success" : "warning";
  }

  return readString(panel.state) === "available" ? "success" : "warning";
}

function readRuntimeSnapshotFreshnessTone(state: DashboardRuntimeSnapshotFreshnessState): Tone {
  if (state === "fresh" || state === "empty") {
    return "success";
  }
  if (state === "stale") {
    return "warning";
  }
  if (state === "unavailable") {
    return "danger";
  }

  return "neutral";
}

function formatRuntimeAction(action: Record<string, unknown> | undefined): string {
  if (!action) {
    return "none";
  }

  const type = readString(action.type);
  if (type === "plan") {
    return `plan: ${readString(action.providerLabel) ?? "planner"} ${readString(action.command) ?? ""}`.trim();
  }
  if (type === "type_text") {
    return `type_text: ${readNumber(action.textLength) ?? 0} chars`;
  }
  if (type === "press_key") {
    return `press_key: ${readString(action.key) ?? "unknown"}`;
  }
  if (type === "verify") {
    return formatRuntimeVerification(action);
  }
  if (type === "activate_app" || type === "open_session") {
    return `${type}: ${readString(action.appName) ?? readString(action.bundleId) ?? "unknown app"}`;
  }
  if (type === "recover" || type === "switch_control") {
    const transition = [
      readString(action.action) ?? readString(action.from) ?? "",
      readString(action.to) ? `-> ${readString(action.to)}` : "",
      readString(action.reason) ? `- ${readString(action.reason)}` : ""
    ].filter(Boolean).join(" ");
    return `${type}: ${transition}`.trim();
  }

  return `${type ?? "action"}${readString(action.message) ? `: ${readString(action.message)}` : ""}`;
}

function formatRuntimeVerification(verification: Record<string, unknown> | undefined): string {
  if (!verification) {
    return "none";
  }

  const action = readString(verification.actionType) ?? readString(verification.type) ?? "verification";
  const status = readString(verification.status) ?? "unknown";
  const detail = readString(verification.message) ?? readString(verification.reason);
  return `${action}: ${status}${detail ? ` - ${detail}` : ""}`;
}

function formatRuntimeScreenshot(screenshot: Record<string, unknown> | undefined): string {
  if (!screenshot) {
    return "none";
  }

  const stage = readString(screenshot.stage) ?? "screenshot";
  const recommendation = readString(screenshot.recommendation);
  const sourceCount = readNumber(screenshot.sourceCount);
  const detail = [
    recommendation,
    sourceCount !== undefined ? `${sourceCount} sources` : undefined
  ].filter(Boolean).join(" ");

  return detail ? `${stage} (${detail})` : stage;
}

function formatRuntimeTimelineTail(timelineTail: Array<Record<string, unknown>>): string {
  const items = timelineTail.slice(-3);
  if (items.length === 0) {
    return "none";
  }

  return items
    .map((event) => `${readString(event.status) ?? "event"}: ${readString(event.message) ?? readString(event.command) ?? ""}`.trim())
    .join(" | ");
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

  const routeNextAction = readNextActionFromRouteOutcome(readRouteOutcome(snapshot));
  if (routeNextAction) {
    return routeNextAction;
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

function readNextActionFromRouteOutcome(routeOutcome: DashboardRouteOutcome): DashboardNextAction | undefined {
  switch (routeOutcome.kind) {
    case "approval_required":
      return {
        title: "Review pending approval",
        detail: routeOutcome.detail,
        tone: "warning",
        source: "Current route"
      };
    case "needs_confirmation":
      return {
        title: "Confirm route",
        detail: routeOutcome.detail,
        tone: "warning",
        source: "Current route"
      };
    case "needs_clarification":
      return {
        title: "Clarify route",
        detail: routeOutcome.detail,
        tone: "warning",
        source: "Current route"
      };
    case "app_policy_denied":
      return {
        title: "Review app policy denial",
        detail: routeOutcome.detail,
        tone: "danger",
        source: "Current route"
      };
    case "user_denied":
      return {
        title: "Route denied by user",
        detail: routeOutcome.detail,
        tone: "neutral",
        source: "Current route"
      };
    case "blocked":
      return {
        title: "Resolve route blocker",
        detail: routeOutcome.detail,
        tone: "danger",
        source: "Current route"
      };
    case "cancelled":
      return {
        title: "Route cancelled",
        detail: routeOutcome.detail,
        tone: "neutral",
        source: "Current route"
      };
    case "stopped":
      return {
        title: "Task stopped",
        detail: routeOutcome.detail,
        tone: "neutral",
        source: "Current route"
      };
    case "failed":
      return {
        title: "Review route failure",
        detail: routeOutcome.detail,
        tone: "danger",
        source: "Current route"
      };
    case "completed":
      return {
        title: "Route completed",
        detail: routeOutcome.detail,
        tone: "success",
        source: "Current route"
      };
    case "running":
      return {
        title: "Monitor running route",
        detail: routeOutcome.detail,
        tone: "warning",
        source: "Current route"
      };
    default:
      return undefined;
  }
}

function createPermissionStatus(label: string, value: unknown): DashboardStatusItem {
  const state = readString(value) ?? "unknown";

  return {
    label,
    value: state.replaceAll("-", " "),
    tone: state === "granted" ? "success" : state === "denied" ? "danger" : "warning"
  };
}

function createStatusItem(label: string, value: unknown, tone: Tone = "neutral"): DashboardStatusItem {
  return {
    label,
    value: formatStatusValue(value),
    tone
  };
}

function findSmokeArtifact(
  snapshot: DashboardSnapshot,
  target: string
): Record<string, unknown> | undefined {
  return readRecordArray(snapshot.smokeEvidence.artifacts)
    .find((artifact) => readString(artifact.target) === target);
}

function formatChromePageControlActiveTab(activeTab: Record<string, unknown> | undefined): string {
  if (!activeTab) {
    return "not-probed";
  }
  const state = readString(activeTab.state) ?? "unknown";
  const host = readString(activeTab.host) ?? "unknown-host";
  const tabId = readNumber(activeTab.tabId);
  return `${state} ${host}${Number.isInteger(tabId) ? ` tab ${tabId}` : ""}`;
}

function formatChromePageControlContentScript(contentScript: Record<string, unknown> | undefined): string {
  if (!contentScript) {
    return "not-probed";
  }

  return [
    readString(contentScript.state) ?? "unknown",
    readString(contentScript.reason) ?? readString(contentScript.lastError)
  ].filter(Boolean).join(" - ");
}

function formatChromePageControlCapability(value: unknown): string {
  if (value === true) {
    return "ready";
  }
  if (value === false) {
    return "needs-action";
  }
  return readString(value) ?? "not-probed";
}

function formatChromePageControlActions(capabilities: Record<string, unknown> | undefined): string {
  return ["click", "fill", "submit", "scroll"]
    .map((key) => `${key}:${formatChromePageControlCapability(capabilities?.[key])}`)
    .join(", ");
}

function formatChromePageSafetyRun(
  pageSafety: Record<string, unknown> | undefined,
  kind: string
): { value: string; tone: Tone } {
  const run = readRecordArray(pageSafety?.runs)
    .find((entry) => readString(entry.kind) === kind);
  if (!run) {
    return { value: "missing", tone: "neutral" };
  }

  const result = readString(run.result) ?? "unknown";
  const pause = run.sensitivePause === true ? "paused" : "not paused";
  const reason = readString(run.reason);
  return {
    value: `${result} (${pause})${reason ? ` - ${reason}` : ""}`,
    tone: readSmokeDetailTone(result)
  };
}

function readChromePageSafetyReason(pageSafety: Record<string, unknown> | undefined): string {
  return readString(pageSafety?.reason)
    ?? readRecordArray(pageSafety?.runs).map((run) => readString(run.reason)).find(Boolean)
    ?? readStringArray(pageSafety?.findingReasons)[0]
    ?? "-";
}

function readChromePageSafetyFindingKinds(pageSafety: Record<string, unknown> | undefined): string[] {
  const explicitKinds = readStringArray(pageSafety?.findingKinds);
  if (explicitKinds.length > 0) {
    return explicitKinds;
  }

  return [...new Set(readRecordArray(pageSafety?.runs)
    .flatMap((run) => readRecordArray(readRecord(run.pageSafety)?.findings))
    .map((finding) => readString(finding.kind))
    .filter((kind): kind is string => Boolean(kind)))];
}

function formatFinderSmokeProbe(probe: Record<string, unknown> | undefined): string {
  if (!probe) {
    return "missing";
  }

  const result = readString(probe.result) ?? "unknown";
  const reason = readString(probe.reason);
  return reason ? `${result} - ${reason}` : result;
}

function readSmokeDetailTone(state: string): Tone {
  if (["passed", "ready", "capable", "eligible"].includes(state)) {
    return "success";
  }
  if (
    state === "blocked"
    || state === "failed"
    || state === "unavailable"
    || state.startsWith("blocked_")
  ) {
    return "danger";
  }
  if (
    state === "sensitive-paused"
    || state === "needs-action"
    || state === "needs_confirmation"
    || state === "partial"
    || state === "skipped"
  ) {
    return "warning";
  }

  return "neutral";
}

function formatUnknownNumber(value: number | undefined): string {
  return value === undefined ? "unknown" : String(value);
}

function formatBoolean(value: unknown): string {
  return typeof value === "boolean" ? (value ? "yes" : "no") : "unknown";
}

function formatStatusValue(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return "unknown";
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
