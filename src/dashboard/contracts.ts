export interface DashboardDescriptor {
  schemaVersion: number;
  bind: {
    host: string;
    port: number;
  };
  url: string;
  auth: Record<string, unknown>;
  updates: Record<string, unknown>;
  eventStore?: Record<string, unknown>;
  panels: Array<Record<string, unknown>>;
}

export interface DashboardProviderSummary {
  provider?: "assistant" | "planner" | string;
  mode: string;
  label: string;
  health: "available" | "unavailable" | "unknown" | string;
  detail?: string;
  binaryPath?: string;
  endpoint?: string;
  endpointConfigured?: boolean;
  externalProviderLabel?: string;
  externalEndpoint?: string;
  externalApiKeyConfigured?: boolean;
  timeoutMs?: number;
  selectedProvider?: string;
  configured?: boolean;
  readiness?: string;
  lastHealthAt?: string;
  lastError?: string;
  providers?: DashboardAssistantProviderStatus[];
}

export interface DashboardAssistantProviderStatus {
  provider?: "assistant" | string;
  id: "codex" | "claude-code" | "hermes" | string;
  label: string;
  selected: boolean;
  configured: boolean;
  readiness: "ready" | "unconfigured" | "unavailable" | "unknown" | string;
  binaryPath?: string;
  binarySource: "default" | "env" | string;
  resolvedBinaryPath?: string;
  lastError?: string;
}

export type DashboardBrowserContextState =
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
  | "unavailable"
  | string;

export interface DashboardBrowserContextStatus {
  schemaVersion?: number;
  state: DashboardBrowserContextState;
  source?: string;
  url?: string;
  title?: string;
  observedAt?: string;
  reason?: string;
  nextAction?: string;
}

export interface DashboardSnapshot {
  schemaVersion: number;
  generatedAt: string;
  descriptor: DashboardDescriptor;
  runtimeHealth: Record<string, unknown>;
  operatorReadiness: Record<string, unknown>;
  permissions: Record<string, unknown>;
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
  smokeEvidence: {
    artifacts: Array<Record<string, unknown>>;
  };
  dogfoodRelease: Record<string, unknown>;
  longHorizon: Record<string, unknown>;
  alerts: Array<Record<string, unknown>>;
  personalMemory?: DashboardPersonalMemorySummary;
  providers?: {
    assistant?: DashboardProviderSummary;
    planner?: DashboardProviderSummary;
  };
}

export interface DashboardPersonalMemorySummary {
  userEntryCount: number;
  agentEntryCount: number;
  sessionCount: number;
  latestUpdatedAt?: string;
  usage?: DashboardPersonalMemoryUsage;
  recentUserEntries: string[];
  recentAgentEntries: string[];
  pendingWriteCount?: number;
  pendingWrites?: DashboardPendingPersonalMemoryWrite[];
  mutedPersonalSkillIds?: string[];
  personalSkills?: DashboardPersonalSkillCard[];
  workingProfile?: DashboardWorkingProfile;
  memoryJournal?: DashboardPersonalMemoryJournalEntry[];
  latestSession?: DashboardPersonalMemorySessionSummary;
  recentSessions?: DashboardPersonalMemorySessionSummary[];
}

export interface DashboardWorkingProfile {
  label: "Working profile" | string;
  source: "derived-local-memory" | string;
  portability: "plain-text" | string;
  summary: string;
  habits: string[];
  evidence: string[];
  memoryEntryCount: number;
  sessionCount: number;
  skillCount: number;
}

export interface DashboardPendingPersonalMemoryWrite {
  id: string;
  createdAt: string;
  source: string;
  action: "add" | "replace" | "remove" | string;
  target: DashboardPersonalMemoryTarget;
  content: string;
  previousContent?: string;
}

export interface DashboardPersonalMemoryJournalEntry {
  id: string;
  createdAt: string;
  source: string;
  stage: "durable" | "pending" | string;
  turnId: string;
  providerLabel: string;
  userInput: string;
  action: "add" | "replace" | "remove" | string;
  target: DashboardPersonalMemoryTarget;
  content: string;
  previousContent?: string;
}

export interface DashboardPersonalSkillCard {
  id: string;
  kind: "communication" | "dashboard" | "workflow" | string;
  label: string;
  description: string;
  promptHint: string;
  evidenceCount: number;
  evidence: string[];
}

export interface DashboardPersonalMemoryUsage {
  user: DashboardPersonalMemoryUsageBucket;
  agent: DashboardPersonalMemoryUsageBucket;
}

export interface DashboardPersonalMemoryUsageBucket {
  usedChars: number;
  limitChars: number;
  percent: number;
}

export interface DashboardPersonalMemorySessionSummary {
  createdAt: string;
  userInput: string;
  providerLabel: string;
  browserTitle?: string;
  browserUrl?: string;
}

export type DashboardPersonalMemoryTarget = "user" | "agent";

export interface DashboardPersonalMemoryActionRequest {
  action: "forget" | "approve-pending" | "reject-pending";
  target?: DashboardPersonalMemoryTarget;
  content?: string;
  pendingId?: string;
}

export interface DashboardPersonalMemoryActionResponse {
  schemaVersion?: number;
  command?: string;
  generatedAt?: string;
  source?: string;
  plannedMutation?: boolean;
  executesSystemMutation?: boolean;
  result?: "forgotten" | "approved" | "rejected" | "not-found" | "error" | string;
  applied?: number;
  ignored?: number;
  blocked?: number;
  pendingWriteCount?: number;
  personalMemory?: {
    userEntryCount: number;
    agentEntryCount: number;
    usage?: DashboardPersonalMemoryUsage;
    latestUpdatedAt?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export interface DashboardPersonalSkillActionRequest {
  action: "mute" | "unmute";
  skillId: string;
}

export interface DashboardPersonalSkillActionResponse {
  schemaVersion?: number;
  command?: string;
  generatedAt?: string;
  source?: string;
  plannedMutation?: boolean;
  executesSystemMutation?: boolean;
  result?: "muted" | "unmuted" | "unchanged" | "error" | string;
  personalSkills?: {
    disabledSkillIds: string[];
    mutedSkillCount: number;
    updatedAt?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export type DashboardKnowledgeGraphNodeKind =
  | "memory"
  | "session"
  | "provider"
  | "browser"
  | "computer-use"
  | "skill"
  | "turn"
  | "alert";

export interface DashboardKnowledgeGraphNode {
  id: string;
  label: string;
  kind: DashboardKnowledgeGraphNodeKind;
  tone: "success" | "warning" | "danger" | "neutral";
  detail?: string;
}

export interface DashboardKnowledgeGraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface DashboardKnowledgeGraph {
  nodes: DashboardKnowledgeGraphNode[];
  edges: DashboardKnowledgeGraphEdge[];
}

export interface DashboardChromeControlActionRequest {
  action: "observe" | "screenshot" | "click" | "fill" | "submit" | "scroll";
  extensionId: string;
  chromeAppName?: string;
  targetTabId: number;
  selector?: string;
  text?: string;
  dy?: number;
}

export type DashboardChromeHostPolicyAction =
  | "always-allow"
  | "allow-current-turn"
  | "block"
  | "ask"
  | "reset";

export interface DashboardChromeHostPolicyActionRequest {
  action: DashboardChromeHostPolicyAction;
  host?: string;
}

export interface DashboardChromeHostPolicyResponse {
  schemaVersion?: number;
  command?: string;
  generatedAt?: string;
  source?: string;
  plannedMutation?: boolean;
  executesSystemMutation?: boolean;
  result?: string;
  action?: DashboardChromeHostPolicyAction;
  host?: string;
  hostPolicy?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

export type DashboardPlannerProviderMode =
  | "local-deterministic"
  | "external-cua"
  | "disabled";

export type DashboardAssistantAgentMode =
  | "codex"
  | "claude-code"
  | "hermes";

export interface DashboardProviderSettingsPlanner {
  provider?: "planner" | string;
  mode: DashboardPlannerProviderMode;
  label: string;
  health: "available" | "unavailable" | "unknown" | string;
  endpoint?: string;
  externalProviderLabel: string;
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}

export interface DashboardProviderSettingsAssistant extends DashboardProviderSummary {
  provider?: "assistant" | string;
  selectedProvider: DashboardAssistantAgentMode | string;
  configured: boolean;
  readiness: string;
  timeoutMs: number;
  lastHealthAt: string;
  providers: DashboardAssistantProviderStatus[];
}

export interface DashboardProviderSettingsResponse {
  schemaVersion: number;
  command: string;
  generatedAt: string;
  source: string;
  plannedMutation: boolean;
  executesSystemMutation: boolean;
  result: string;
  providers: {
    assistant?: DashboardProviderSettingsAssistant;
    planner: DashboardProviderSettingsPlanner;
  };
}

export interface DashboardPlannerProviderSettingsUpdate {
  mode?: DashboardPlannerProviderMode;
  externalProviderLabel?: string;
  externalEndpoint?: string;
  externalApiKey?: string;
}

export interface DashboardAssistantAgentSettingsUpdate {
  mode?: DashboardAssistantAgentMode;
}
