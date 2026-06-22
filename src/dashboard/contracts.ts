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

export interface DashboardProviderSettingsResponse {
  schemaVersion: number;
  command: string;
  generatedAt: string;
  source: string;
  plannedMutation: boolean;
  executesSystemMutation: boolean;
  result: string;
  providers: {
    assistant?: Record<string, unknown>;
    planner: DashboardProviderSettingsPlanner;
  };
}

export interface DashboardPlannerProviderSettingsUpdate {
  mode?: DashboardPlannerProviderMode;
  externalProviderLabel?: string;
  externalEndpoint?: string;
  externalApiKey?: string;
}
