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
  id: "local" | "codex" | "claude-code" | string;
  label: string;
  selected: boolean;
  configured: boolean;
  readiness: "ready" | "unconfigured" | "unavailable" | "unknown" | string;
  binaryPath?: string;
  binarySource: "built-in" | "default" | "env" | string;
  resolvedBinaryPath?: string;
  lastError?: string;
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
  providers?: {
    assistant?: DashboardProviderSummary;
    planner?: DashboardProviderSummary;
  };
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
  selectedProvider: string;
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
