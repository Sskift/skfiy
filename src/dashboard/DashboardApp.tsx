import {
  Activity,
  ArrowDown,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Chrome,
  Eye,
  Folder,
  Gauge,
  History,
  Home,
  MonitorCog,
  MousePointer2,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Terminal,
  Trash2,
  Type as TypeIcon,
  TriangleAlert
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Skeleton } from "@heroui/react";
import {
  fetchChromeHostPolicy,
  fetchDashboardSnapshot,
  fetchProviderSettings,
  postChromeControlAction,
  postChromeHostPolicyAction,
  postPersonalMemoryAction,
  postPlannerProviderSettings
} from "./api";
import type {
  DashboardChromeControlActionRequest,
  DashboardChromeHostPolicyAction,
  DashboardChromeHostPolicyActionRequest,
  DashboardChromeHostPolicyResponse,
  DashboardPersonalMemoryActionRequest,
  DashboardPersonalMemoryActionResponse,
  DashboardPersonalMemorySummary,
  DashboardPersonalMemoryUsageBucket,
  DashboardPlannerProviderMode,
  DashboardPlannerProviderSettingsUpdate,
  DashboardAssistantProviderStatus,
  DashboardProviderSettingsAssistant,
  DashboardProviderSettingsPlanner,
  DashboardProviderSettingsResponse,
  DashboardProviderSummary,
  DashboardSnapshot
} from "./contracts";
import {
  readAlertMessages,
  readAppReadinessLanes,
  readCapabilitySummaries,
  readChromeControlState,
  readComputerUseReadiness,
  readDogfoodSummary,
  readKnowledgeGraph,
  readLatestTaskSignal,
  readNextAction,
  readProviderSummaries,
  readReadinessSummary,
  readRecentActivity,
  readRuntimeEvidenceSummary,
  readSnapshotState,
  readUnsupportedSmokeEvidence,
  type DashboardAppReadinessLane,
  type DashboardCapabilitySummary,
  type DashboardChromeControlState,
  type DashboardLatestTaskSignal,
  type DashboardRuntimeEvidenceSummary,
  type Tone
} from "./model";
import { KnowledgeGraph } from "./KnowledgeGraph";

export interface DashboardAppProps {
  loadChromeHostPolicy?: () => Promise<DashboardChromeHostPolicyResponse>;
  loadSnapshot?: () => Promise<DashboardSnapshot>;
  loadProviderSettings?: () => Promise<DashboardProviderSettingsResponse>;
  runChromeControlAction?: (
    request: DashboardChromeControlActionRequest
  ) => Promise<Record<string, unknown>>;
  runPersonalMemoryAction?: (
    request: DashboardPersonalMemoryActionRequest
  ) => Promise<DashboardPersonalMemoryActionResponse>;
  saveChromeHostPolicyAction?: (
    request: DashboardChromeHostPolicyActionRequest
  ) => Promise<DashboardChromeHostPolicyResponse>;
  savePlannerProviderSettings?: (
    update: DashboardPlannerProviderSettingsUpdate
  ) => Promise<DashboardProviderSettingsResponse>;
}

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "provider", label: "Provider", icon: Bot },
  { id: "memory", label: "Memory", icon: History },
  { id: "knowledge-graph", label: "Graph", icon: Gauge },
  { id: "computer-use", label: "Computer Use", icon: MonitorCog },
  { id: "browser", label: "Browser", icon: Chrome },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "next-action", label: "Next action", icon: ArrowRight }
] as const;

const CHROME_CONTROL_ACTIONS: Array<{
  action: DashboardChromeControlActionRequest["action"];
  label: string;
  icon: typeof Eye;
}> = [
  { action: "observe", label: "Observe current tab", icon: Eye },
  { action: "screenshot", label: "Screenshot current tab", icon: Camera },
  { action: "click", label: "Click selector", icon: MousePointerClick },
  { action: "fill", label: "Fill selector", icon: TypeIcon },
  { action: "submit", label: "Submit form", icon: Send },
  { action: "scroll", label: "Scroll page", icon: ArrowDown }
];

type ChromeHostPolicyControlAction = DashboardChromeHostPolicyAction | "refresh";

const CHROME_HOST_POLICY_ACTIONS: Array<{
  action: ChromeHostPolicyControlAction;
  label: string;
  icon: typeof RefreshCw;
}> = [
  { action: "refresh", label: "Refresh policy", icon: RefreshCw },
  { action: "always-allow", label: "Always allow", icon: ShieldCheck },
  { action: "allow-current-turn", label: "Allow current turn", icon: CheckCircle2 },
  { action: "block", label: "Block", icon: TriangleAlert },
  { action: "ask", label: "Ask", icon: ShieldCheck },
  { action: "reset", label: "Reset policy", icon: RotateCcw }
];

export function DashboardApp({
  loadChromeHostPolicy = fetchChromeHostPolicy,
  loadSnapshot = fetchDashboardSnapshot,
  loadProviderSettings = fetchProviderSettings,
  runChromeControlAction = postChromeControlAction,
  runPersonalMemoryAction = postPersonalMemoryAction,
  saveChromeHostPolicyAction = postChromeHostPolicyAction,
  savePlannerProviderSettings = postPlannerProviderSettings
}: DashboardAppProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [providerSettings, setProviderSettings] = useState<DashboardProviderSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerSettingsError, setProviderSettingsError] = useState<string | null>(null);
  const [providerSettingsNotice, setProviderSettingsNotice] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingProviderSettings, setIsSavingProviderSettings] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const [snapshotResult, providerSettingsResult] = await Promise.allSettled([
      loadSnapshot(),
      loadProviderSettings()
    ]);

    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
      setError(null);
    } else {
      setError(readErrorMessage(snapshotResult.reason));
    }

    if (providerSettingsResult.status === "fulfilled") {
      setProviderSettings(providerSettingsResult.value);
      setProviderSettingsError(null);
    } else {
      setProviderSettingsError(readErrorMessage(providerSettingsResult.reason));
    }

    setProviderSettingsNotice(null);
    setIsRefreshing(false);
  }, [loadProviderSettings, loadSnapshot]);

  const submitPersonalMemoryAction = useCallback(async (
    request: DashboardPersonalMemoryActionRequest
  ) => {
    setIsSavingMemory(true);
    setMemoryError(null);
    setMemoryNotice(null);
    try {
      const response = await runPersonalMemoryAction(request);
      await refresh();
      setMemoryNotice(response.result === "not-found" ? "Memory was already absent" : "Memory forgotten");
    } catch (submitError) {
      setMemoryError(readErrorMessage(submitError));
    } finally {
      setIsSavingMemory(false);
    }
  }, [refresh, runPersonalMemoryAction]);

  const submitPlannerProviderSettings = useCallback(async (
    update: DashboardPlannerProviderSettingsUpdate
  ) => {
    setIsSavingProviderSettings(true);
    setProviderSettingsError(null);
    setProviderSettingsNotice(null);
    try {
      await savePlannerProviderSettings(update);
      setProviderSettings(await loadProviderSettings());
      setProviderSettingsNotice("Planner settings saved");
    } catch (submitError) {
      setProviderSettingsError(readErrorMessage(submitError));
    } finally {
      setIsSavingProviderSettings(false);
    }
  }, [loadProviderSettings, savePlannerProviderSettings]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="skfiy-dashboard-shell">
      <aside className="skfiy-dashboard-sidebar" aria-label="skfiy dashboard">
        <div className="skfiy-dashboard-brand">
          <div className="skfiy-dashboard-brand-mark" aria-hidden="true">s</div>
          <div>
            <h1>skfiy</h1>
            <span>Computer Use control</span>
          </div>
        </div>
        <nav aria-label="skfiy dashboard navigation">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={item.id === "overview" ? "page" : undefined}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <main className="skfiy-dashboard-main">
        <header className="skfiy-dashboard-topbar" aria-label="Dashboard session status">
          <div>
            <span className="skfiy-dashboard-kicker">Local dashboard</span>
            <h2>skfiy control plane</h2>
          </div>
          <div className="skfiy-dashboard-topbar-actions">
            <StatusChip
              tone={snapshot ? "success" : error ? "danger" : "neutral"}
              ariaLabel={`Dashboard connection: ${snapshot ? "connected" : error ? "error" : "loading"}`}
            >
              {snapshot ? "connected" : error ? "error" : "loading"}
            </StatusChip>
            <Button
              aria-label="Refresh dashboard"
              className="skfiy-dashboard-button"
              isDisabled={isRefreshing}
              onPress={() => void refresh()}
              size="sm"
              variant="outline"
            >
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </header>
        {error ? (
          <section className="skfiy-dashboard-error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {error}
          </section>
        ) : null}
        {snapshot ? (
          <DashboardContent
            snapshot={snapshot}
            providerSettings={providerSettings}
            providerSettingsError={providerSettingsError}
            providerSettingsNotice={providerSettingsNotice}
            isProviderSettingsLoading={isRefreshing && !providerSettings}
            isProviderSettingsSaving={isSavingProviderSettings}
            isMemorySaving={isSavingMemory}
            memoryError={memoryError}
            memoryNotice={memoryNotice}
            onLoadChromeHostPolicy={loadChromeHostPolicy}
            onRefresh={refresh}
            onRunPersonalMemoryAction={submitPersonalMemoryAction}
            onRunChromeControlAction={runChromeControlAction}
            onSaveChromeHostPolicyAction={saveChromeHostPolicyAction}
            onSubmitPlannerProviderSettings={submitPlannerProviderSettings}
          />
        ) : (
          <DashboardLoading />
        )}
      </main>
    </div>
  );
}

function DashboardContent({
  snapshot,
  providerSettings,
  providerSettingsError,
  providerSettingsNotice,
  isProviderSettingsLoading,
  isProviderSettingsSaving,
  isMemorySaving,
  memoryError,
  memoryNotice,
  onLoadChromeHostPolicy,
  onRefresh,
  onRunPersonalMemoryAction,
  onRunChromeControlAction,
  onSaveChromeHostPolicyAction,
  onSubmitPlannerProviderSettings
}: {
  snapshot: DashboardSnapshot;
  providerSettings: DashboardProviderSettingsResponse | null;
  providerSettingsError: string | null;
  providerSettingsNotice: string | null;
  isProviderSettingsLoading: boolean;
  isProviderSettingsSaving: boolean;
  isMemorySaving: boolean;
  memoryError: string | null;
  memoryNotice: string | null;
  onLoadChromeHostPolicy: () => Promise<DashboardChromeHostPolicyResponse>;
  onRefresh: () => Promise<void>;
  onRunPersonalMemoryAction: (
    request: DashboardPersonalMemoryActionRequest
  ) => Promise<void>;
  onRunChromeControlAction: (
    request: DashboardChromeControlActionRequest
  ) => Promise<Record<string, unknown>>;
  onSaveChromeHostPolicyAction: (
    request: DashboardChromeHostPolicyActionRequest
  ) => Promise<DashboardChromeHostPolicyResponse>;
  onSubmitPlannerProviderSettings: (
    update: DashboardPlannerProviderSettingsUpdate
  ) => Promise<void>;
}) {
  const stateItems = useMemo(() => readSnapshotState(snapshot), [snapshot]);
  const readiness = useMemo(() => readReadinessSummary(snapshot), [snapshot]);
  const capabilities = useMemo(() => readCapabilitySummaries(snapshot), [snapshot]);
  const chromeControl = useMemo(() => readChromeControlState(snapshot), [snapshot]);
  const computerUse = useMemo(() => readComputerUseReadiness(snapshot), [snapshot]);
  const appReadiness = useMemo(() => readAppReadinessLanes(snapshot), [snapshot]);
  const unsupportedSmoke = useMemo(() => readUnsupportedSmokeEvidence(snapshot), [snapshot]);
  const providers = useMemo(() => readProviderSummaries(snapshot), [snapshot]);
  const activity = useMemo(() => readRecentActivity(snapshot), [snapshot]);
  const latestSignal = useMemo(() => readLatestTaskSignal(snapshot), [snapshot]);
  const runtimeEvidence = useMemo(() => readRuntimeEvidenceSummary(snapshot), [snapshot]);
  const dogfood = useMemo(() => readDogfoodSummary(snapshot), [snapshot]);
  const nextAction = useMemo(() => readNextAction(snapshot), [snapshot]);
  const alerts = useMemo(() => readAlertMessages(snapshot), [snapshot]);
  const knowledgeGraph = useMemo(() => readKnowledgeGraph(snapshot), [snapshot]);

  return (
    <div className="skfiy-dashboard-content">
      <section id="overview" className="skfiy-dashboard-section" aria-labelledby="overview-title">
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Overview</span>
            <h2 id="overview-title">Overview</h2>
          </div>
          <StatusChip tone={readiness.tone}>
            {readiness.label}
          </StatusChip>
        </div>
        <div className="skfiy-dashboard-overview-panel">
          <div className="skfiy-dashboard-overview-copy">
            <span className="skfiy-dashboard-kicker">Operator readiness</span>
            <h3>{readiness.title}</h3>
            <p>{readiness.detail}</p>
          </div>
          <div className="skfiy-dashboard-overview-meta">
            <div>
              <span>Updated</span>
              <strong>{formatGeneratedAt(snapshot.generatedAt)}</strong>
            </div>
            <div>
              <span>Dashboard</span>
              <strong>{snapshot.descriptor.url}</strong>
            </div>
            <div>
              <span>Alerts</span>
              <strong>{alerts.length === 0 ? "none" : String(alerts.length)}</strong>
            </div>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--four">
          {capabilities.map((capability) => (
            <CapabilityCard key={capability.id} capability={capability} />
          ))}
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--three">
          {stateItems.map((item) => (
            <MetricCard key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section
        id="provider"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="provider-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Connection</span>
            <h2 id="provider-title">Provider</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
          {providers.map((provider) => (
            <ProviderCard key={`${provider.mode}-${provider.label}`} provider={provider} />
          ))}
          <AssistantProviderSettingsPanel
            assistant={providerSettings?.providers.assistant}
            error={providerSettingsError}
            isLoading={isProviderSettingsLoading}
          />
          <PlannerProviderSettingsForm
            settings={providerSettings}
            error={providerSettingsError}
            notice={providerSettingsNotice}
            isLoading={isProviderSettingsLoading}
            isSaving={isProviderSettingsSaving}
            onSubmit={onSubmitPlannerProviderSettings}
          />
        </div>
      </section>

      <section
        id="memory"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="memory-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Local knowledge</span>
            <h2 id="memory-title">Memory</h2>
          </div>
        </div>
        <PersonalMemoryPanel
          error={memoryError}
          isSaving={isMemorySaving}
          memory={snapshot.personalMemory}
          notice={memoryNotice}
          onForget={onRunPersonalMemoryAction}
        />
      </section>

      <section
        id="knowledge-graph"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main skfiy-dashboard-section--graph"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Vault map</span>
            <h2>Knowledge graph</h2>
          </div>
          <StatusChip tone="neutral">{knowledgeGraph.nodes.length} nodes</StatusChip>
        </div>
        <KnowledgeGraph nodes={knowledgeGraph.nodes} edges={knowledgeGraph.edges} />
      </section>

      <section
        id="computer-use"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="computer-use-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Readiness</span>
            <h2 id="computer-use-title">Computer Use</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
          <Card.Root className="skfiy-dashboard-card skfiy-dashboard-readiness-card" variant="secondary">
            <Card.Header className="skfiy-dashboard-card-header">
              <div>
                <Card.Description>Desktop control</Card.Description>
                <Card.Title>Computer use</Card.Title>
              </div>
              <MonitorCog size={18} aria-hidden="true" />
            </Card.Header>
            <Card.Content className="skfiy-dashboard-card-content">
              <StatusRow
                icon={<MousePointer2 size={16} aria-hidden="true" />}
                label="Desktop session"
                tone={computerUse.desktop.tone}
                value={computerUse.desktop.value}
                detail={computerUse.desktop.detail}
              />
              <div className="skfiy-dashboard-permission-grid" aria-label="Computer use permissions">
                {computerUse.permissions.map((permission) => (
                  <StatusRow
                    key={permission.label}
                    label={permission.label}
                    tone={permission.tone}
                    value={permission.value}
                  />
                ))}
              </div>
            </Card.Content>
          </Card.Root>
          {appReadiness.map((lane) => (
            <AppReadinessCard key={lane.id} lane={lane} />
          ))}
          {unsupportedSmoke ? (
            <div className="skfiy-dashboard-inline-list skfiy-dashboard-grid-note">
              <StatusChip tone="warning">{unsupportedSmoke}</StatusChip>
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="browser"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="browser-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Bridge</span>
            <h2 id="browser-title">Browser</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--main">
          <Card.Root className="skfiy-dashboard-card skfiy-dashboard-readiness-card" variant="secondary">
            <Card.Header className="skfiy-dashboard-card-header">
              <div>
                <Card.Description>Apps and sites</Card.Description>
                <Card.Title>Browser control</Card.Title>
              </div>
              <Chrome size={18} aria-hidden="true" />
            </Card.Header>
            <Card.Content className="skfiy-dashboard-card-content">
              <div className="skfiy-dashboard-key-value">
                <span>State</span>
                <StatusChip tone={chromeControl.tone}>{chromeControl.label}</StatusChip>
                <span>Extension id</span>
                <strong>{chromeControl.extensionId ?? "unknown"}</strong>
                <span>Active tab</span>
                <strong>{chromeControl.activeTabLabel}</strong>
                <span>Browser Context</span>
                <StatusChip tone={chromeControl.browserContext.tone}>{chromeControl.browserContext.state}</StatusChip>
                <span>Page title</span>
                <strong>{chromeControl.browserContext.title ?? "unknown"}</strong>
                <span>Page URL</span>
                <strong>{chromeControl.browserContext.url ?? "unknown"}</strong>
                <span>Chrome</span>
                <strong>{chromeControl.liveConnection}</strong>
                <span>Native host</span>
                <strong>{chromeControl.nativeHostState}</strong>
                <span>Script</span>
                <strong>{chromeControl.contentScript ?? "unknown"}</strong>
                <span>Screenshot</span>
                <strong>{chromeControl.screenshotLane}</strong>
                <span>Tab discovery</span>
                <strong>{chromeControl.tabDiscoveryLabel}</strong>
                <span>Host policy</span>
                <StatusChip tone={chromeControl.hostPolicy.tone}>{chromeControl.hostPolicy.state}</StatusChip>
              </div>
              <p className="skfiy-dashboard-muted-message">{chromeControl.reason}</p>
              <p className="skfiy-dashboard-muted-message">{chromeControl.browserContext.reason}</p>
              {chromeControl.browserContext.nextAction ? (
                <p className="skfiy-dashboard-muted-message">{chromeControl.browserContext.nextAction}</p>
              ) : null}
              {chromeControl.nextAction ? (
                <p className="skfiy-dashboard-muted-message">{chromeControl.nextAction}</p>
              ) : null}
              {chromeControl.tabDiscoveryReason ? (
                <p className="skfiy-dashboard-muted-message">{chromeControl.tabDiscoveryReason}</p>
              ) : null}
              <div className="skfiy-dashboard-inline-list">
                {chromeControl.capabilities.length > 0 ? (
                  chromeControl.capabilities.map((capability) => (
                    <StatusChip key={capability} tone="success">{capability}</StatusChip>
                  ))
                ) : (
                  <StatusChip tone="neutral">no actions</StatusChip>
                )}
              </div>
              <div className="skfiy-dashboard-control-panel" aria-label="Chrome host policy state">
                <div className="skfiy-dashboard-key-value">
                  <span>Reason</span>
                  <strong>{chromeControl.hostPolicy.reason ?? "No host policy reason reported."}</strong>
                  <span>Default</span>
                  <strong>{chromeControl.hostPolicy.defaultMode}</strong>
                </div>
                <div className="skfiy-dashboard-inline-list">
                  {chromeControl.hostPolicy.entries.length > 0 ? (
                    chromeControl.hostPolicy.entries.map((entry) => (
                      <StatusChip key={entry} tone="neutral">{entry}</StatusChip>
                    ))
                  ) : (
                    <StatusChip tone="neutral">none</StatusChip>
                  )}
                </div>
              </div>
              <ChromeControlActions
                chromeControl={chromeControl}
                onRefresh={onRefresh}
                onRunAction={onRunChromeControlAction}
              />
              <ChromeHostPolicyControls
                chromeControl={chromeControl}
                onLoadPolicy={onLoadChromeHostPolicy}
                onRefresh={onRefresh}
                onSavePolicyAction={onSaveChromeHostPolicyAction}
              />
            </Card.Content>
          </Card.Root>
        </div>
      </section>

      <section
        id="activity"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-label="Activity"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Runtime</span>
            <h2>Activity</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
          <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
            <Card.Header className="skfiy-dashboard-card-header">
              <div>
                <Card.Title>Current turn</Card.Title>
                <Card.Description>Latest user-facing runtime state</Card.Description>
              </div>
              <History size={18} aria-hidden="true" />
            </Card.Header>
            <Card.Content className="skfiy-dashboard-card-content">
              <p className="skfiy-dashboard-message">{activity.latestMessage}</p>
              <div className="skfiy-dashboard-inline-list">
                <StatusChip tone={activity.turnState === "failed" ? "danger" : "neutral"}>
                  turn {activity.turnState}
                </StatusChip>
                <StatusChip tone="neutral">
                  replay {activity.replayState}
                </StatusChip>
                {activity.command ? <StatusChip tone="neutral">{activity.command}</StatusChip> : null}
                {activity.targetApp ? <StatusChip tone="neutral">{activity.targetApp}</StatusChip> : null}
              </div>
              <div className="skfiy-dashboard-activity-counts">
                <ActivityCount label="Actions" value={activity.actionCount} />
                <ActivityCount label="Screenshots" value={activity.screenshotCount} />
                <ActivityCount label="Checks" value={activity.verificationCount} />
              </div>
            </Card.Content>
          </Card.Root>
          <LatestSignalCard signal={latestSignal} />
          <RuntimeEvidenceCard evidence={runtimeEvidence} />
          <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
            <Card.Header className="skfiy-dashboard-card-header">
              <div>
                <Card.Title>Release gate</Card.Title>
                <Card.Description>Release drift and cohort status</Card.Description>
              </div>
              <Activity size={18} aria-hidden="true" />
            </Card.Header>
            <Card.Content className="skfiy-dashboard-card-content">
              <p className="skfiy-dashboard-message">{dogfood.detail}</p>
              <div className="skfiy-dashboard-inline-list">
                <StatusChip tone={dogfood.tone}>release {dogfood.releaseDriftState}</StatusChip>
                <StatusChip tone="neutral">dogfood {dogfood.releaseState}</StatusChip>
                <StatusChip tone="neutral">{dogfood.cohortLabel}</StatusChip>
                <StatusChip tone="neutral">replay {activity.replayState}</StatusChip>
              </div>
            </Card.Content>
          </Card.Root>
        </div>
      </section>

      <section
        id="next-action"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="next-action-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Action</span>
            <h2 id="next-action-title">Next action</h2>
          </div>
        </div>
        <Card.Root className="skfiy-dashboard-card skfiy-dashboard-next-action" variant="secondary">
          <Card.Header className="skfiy-dashboard-card-header">
            <div>
              <Card.Description>{nextAction.source}</Card.Description>
              <Card.Title>{nextAction.title}</Card.Title>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
          </Card.Header>
          <Card.Content className="skfiy-dashboard-card-content">
            <p className="skfiy-dashboard-next-action-copy">{nextAction.detail}</p>
            <div className="skfiy-dashboard-inline-list">
              <StatusChip tone={nextAction.tone}>{nextAction.tone}</StatusChip>
              <StatusChip tone={alerts.length > 0 ? "warning" : "success"}>
                {alerts.length === 0 ? "no alerts" : `${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}
              </StatusChip>
            </div>
          </Card.Content>
        </Card.Root>
      </section>
    </div>
  );
}

function PersonalMemoryPanel({
  error,
  isSaving,
  memory,
  notice,
  onForget
}: {
  error: string | null;
  isSaving: boolean;
  memory: DashboardPersonalMemorySummary | undefined;
  notice: string | null;
  onForget: (request: DashboardPersonalMemoryActionRequest) => Promise<void>;
}) {
  const userEntries = memory?.recentUserEntries ?? [];
  const agentEntries = memory?.recentAgentEntries ?? [];

  return (
    <Card.Root
      aria-label="Personal memory"
      className="skfiy-dashboard-card"
      role="region"
      variant="secondary"
    >
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>Personalization</Card.Description>
          <Card.Title>Personal memory</Card.Title>
        </div>
        <History size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <div className="skfiy-dashboard-inline-list" aria-label="Personal memory status">
          <StatusChip tone={memory ? "success" : "warning"}>
            user entries {memory?.userEntryCount ?? 0}
          </StatusChip>
          <StatusChip tone={memory ? "success" : "warning"}>
            agent notes {memory?.agentEntryCount ?? 0}
          </StatusChip>
          <StatusChip tone="neutral">sessions {memory?.sessionCount ?? 0}</StatusChip>
          {memory?.usage?.user ? (
            <StatusChip tone={readMemoryUsageTone(memory.usage.user)}>
              user budget {formatMemoryUsage(memory.usage.user)}
            </StatusChip>
          ) : null}
          {memory?.usage?.agent ? (
            <StatusChip tone={readMemoryUsageTone(memory.usage.agent)}>
              agent budget {formatMemoryUsage(memory.usage.agent)}
            </StatusChip>
          ) : null}
          <StatusChip tone="neutral">updated {formatGeneratedAt(memory?.latestUpdatedAt ?? "")}</StatusChip>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
          <MemoryEntryList
            entries={userEntries}
            isSaving={isSaving}
            onForget={(entry) => onForget({ action: "forget", target: "user", content: entry })}
            title="User preferences"
          />
          <MemoryEntryList
            entries={agentEntries}
            isSaving={isSaving}
            onForget={(entry) => onForget({ action: "forget", target: "agent", content: entry })}
            title="Agent operating notes"
          />
        </div>
        <RecentSessionRecallList sessions={memory?.recentSessions ?? []} />
        <p
          aria-live="polite"
          className="skfiy-dashboard-control-feedback"
          data-tone={error ? "danger" : notice ? "success" : "neutral"}
        >
          {error ?? notice ?? ""}
        </p>
      </Card.Content>
    </Card.Root>
  );
}

function RecentSessionRecallList({
  sessions
}: {
  sessions: NonNullable<DashboardPersonalMemorySummary["recentSessions"]>;
}) {
  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-session-recall-list">
      <h3>Recent session recall</h3>
      {sessions.length > 0 ? (
        <ul aria-label="Recent session recall">
          {sessions.map((session) => {
            const browserLabel = session.browserTitle ?? session.browserUrl;
            return (
              <li key={`${session.createdAt}-${session.providerLabel}-${session.userInput}`}>
                <span>{browserLabel ? `${session.providerLabel} · ${browserLabel}` : session.providerLabel}</span>
                <small>{formatGeneratedAt(session.createdAt)}</small>
                <strong>{session.userInput}</strong>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="skfiy-dashboard-empty">No recalled sessions have been indexed yet.</p>
      )}
    </div>
  );
}

function readMemoryUsageTone(
  usage: DashboardPersonalMemoryUsageBucket
): "success" | "warning" | "danger" | "neutral" {
  if (usage.percent >= 90) {
    return "danger";
  }
  if (usage.percent >= 75) {
    return "warning";
  }
  return "success";
}

function formatMemoryUsage(usage: DashboardPersonalMemoryUsageBucket): string {
  return `${usage.percent}% - ${formatInteger(usage.usedChars)}/${formatInteger(usage.limitChars)} chars`;
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function MemoryEntryList({
  entries,
  isSaving,
  onForget,
  title
}: {
  entries: string[];
  isSaving: boolean;
  onForget: (entry: string) => Promise<void>;
  title: string;
}) {
  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-memory-list">
      <h3>{title}</h3>
      {entries.length > 0 ? (
        <ul>
          {entries.map((entry) => (
            <li key={entry}>
              <span>{entry}</span>
              <button
                aria-label={`Forget memory: ${entry}`}
                className="skfiy-dashboard-icon-button"
                disabled={isSaving}
                onClick={() => void onForget(entry)}
                title="Forget memory"
                type="button"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="skfiy-dashboard-empty">No durable memory has been recorded yet.</p>
      )}
    </div>
  );
}

function AssistantProviderSettingsPanel({
  assistant,
  error,
  isLoading
}: {
  assistant: DashboardProviderSettingsAssistant | undefined;
  error: string | null;
  isLoading: boolean;
}) {
  const providers = assistant?.providers ?? [];

  return (
    <Card.Root
      aria-label="Assistant provider health"
      className="skfiy-dashboard-card skfiy-dashboard-assistant-provider-card"
      role="region"
      variant="secondary"
    >
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>Assistant settings</Card.Description>
          <Card.Title>Assistant providers</Card.Title>
        </div>
        <Bot size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <div className="skfiy-dashboard-inline-list" aria-label="Assistant provider settings status">
          <StatusChip tone={readHealthTone(assistant?.health ?? "unknown")}>
            {assistant?.health ?? (isLoading ? "loading settings" : "unknown")}
          </StatusChip>
          <StatusChip tone={assistant?.selectedProvider ? "success" : "warning"}>
            selected {assistant?.selectedProvider ?? "unknown"}
          </StatusChip>
          <StatusChip tone="neutral">timeout {assistant?.timeoutMs ?? 0}ms</StatusChip>
          <StatusChip tone="neutral">last health {formatGeneratedAt(assistant?.lastHealthAt ?? "")}</StatusChip>
        </div>
        {providers.length > 0 ? (
          <div className="skfiy-dashboard-assistant-provider-list">
            {providers.map((provider) => (
              <AssistantProviderStateItem key={provider.id} provider={provider} />
            ))}
          </div>
        ) : (
          <div className="skfiy-dashboard-empty">
            {isLoading ? "Loading assistant provider health." : "Assistant provider health has not been reported."}
          </div>
        )}
        {error && !assistant ? (
          <div className="skfiy-dashboard-error skfiy-dashboard-provider-form-message" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </Card.Content>
    </Card.Root>
  );
}

function AssistantProviderStateItem({
  provider
}: {
  provider: DashboardAssistantProviderStatus;
}) {
  const resolvedBinaryPath = provider.resolvedBinaryPath && provider.resolvedBinaryPath !== provider.binaryPath
    ? provider.resolvedBinaryPath
    : undefined;

  return (
    <div className="skfiy-dashboard-assistant-provider-item">
      <div className="skfiy-dashboard-assistant-provider-heading">
        <div>
          <h3>{provider.label}</h3>
          <span>{provider.id}</span>
        </div>
        <StatusChip tone={provider.selected ? "success" : "neutral"}>
          {provider.selected ? "selected" : "standby"}
        </StatusChip>
      </div>
      <div className="skfiy-dashboard-inline-list">
        <StatusChip tone={readAssistantReadinessTone(provider.readiness)}>
          readiness {provider.readiness}
        </StatusChip>
        <StatusChip tone={provider.configured ? "success" : "warning"}>
          {provider.configured ? "configured" : "unconfigured"}
        </StatusChip>
        <StatusChip tone="neutral">source {provider.binarySource}</StatusChip>
      </div>
      <div className="skfiy-dashboard-key-value">
        <span>Binary</span>
        <strong>{provider.binaryPath ?? "not configured"}</strong>
        {resolvedBinaryPath ? (
          <>
            <span>Resolved</span>
            <strong>{resolvedBinaryPath}</strong>
          </>
        ) : null}
      </div>
      {provider.lastError ? (
        <p className="skfiy-dashboard-muted-message">{provider.lastError}</p>
      ) : null}
    </div>
  );
}

function PlannerProviderSettingsForm({
  error,
  isLoading,
  isSaving,
  notice,
  onSubmit,
  settings
}: {
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  notice: string | null;
  onSubmit: (update: DashboardPlannerProviderSettingsUpdate) => Promise<void>;
  settings: DashboardProviderSettingsResponse | null;
}) {
  const planner = settings?.providers.planner;
  const [mode, setMode] = useState<DashboardPlannerProviderMode>("local-deterministic");
  const [externalProviderLabel, setExternalProviderLabel] = useState("External CUA");
  const [externalEndpoint, setExternalEndpoint] = useState("");
  const [externalApiKey, setExternalApiKey] = useState("");

  useEffect(() => {
    if (!planner) {
      return;
    }

    setMode(readPlannerProviderMode(planner.mode));
    setExternalProviderLabel(planner.externalProviderLabel || planner.label || "External CUA");
    setExternalEndpoint(readPlannerProviderEndpoint(planner));
    setExternalApiKey("");
  }, [planner]);

  const controlsDisabled = isLoading || isSaving || !planner;
  const apiKeyConfigured = planner?.externalApiKeyConfigured;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const apiKey = externalApiKey.trim();
    setExternalApiKey("");

    void onSubmit({
      mode,
      externalProviderLabel: externalProviderLabel.trim(),
      externalEndpoint: externalEndpoint.trim(),
      ...(apiKey.length > 0 ? { externalApiKey: apiKey } : {})
    });
  };

  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-provider-settings-card" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>Planner settings</Card.Description>
          <Card.Title>Provider settings</Card.Title>
        </div>
        <Bot size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <form
          aria-label="Planner provider settings"
          className="skfiy-dashboard-provider-form"
          onSubmit={handleSubmit}
        >
          <div className="skfiy-dashboard-inline-list" aria-label="Planner provider settings status">
            <StatusChip tone={readHealthTone(planner?.health ?? "unknown")}>
              {planner?.health ?? (isLoading ? "loading settings" : "unknown")}
            </StatusChip>
            <StatusChip tone={apiKeyConfigured ? "success" : apiKeyConfigured === false ? "warning" : "neutral"}>
              {apiKeyConfigured ? "api key configured" : apiKeyConfigured === false ? "api key missing" : "api key unknown"}
            </StatusChip>
          </div>
          <div className="skfiy-dashboard-provider-form-grid">
            <div className="skfiy-dashboard-field">
              <label htmlFor="planner-provider-mode">Mode</label>
              <select
                id="planner-provider-mode"
                disabled={controlsDisabled}
                onChange={(event) => setMode(readPlannerProviderMode(event.target.value))}
                value={mode}
              >
                <option value="local-deterministic">local-deterministic</option>
                <option value="external-cua">external-cua</option>
                <option value="disabled">disabled</option>
              </select>
            </div>
            <div className="skfiy-dashboard-field">
              <label htmlFor="planner-provider-label">External provider label</label>
              <input
                id="planner-provider-label"
                disabled={controlsDisabled}
                onChange={(event) => setExternalProviderLabel(event.target.value)}
                required
                type="text"
                value={externalProviderLabel}
              />
            </div>
            <div className="skfiy-dashboard-field skfiy-dashboard-field--wide">
              <label htmlFor="planner-provider-endpoint">Endpoint</label>
              <input
                id="planner-provider-endpoint"
                disabled={controlsDisabled}
                onChange={(event) => setExternalEndpoint(event.target.value)}
                placeholder="https://"
                type="url"
                value={externalEndpoint}
              />
            </div>
            <div className="skfiy-dashboard-field skfiy-dashboard-field--wide">
              <label htmlFor="planner-provider-api-key">API key</label>
              <input
                id="planner-provider-api-key"
                autoComplete="off"
                disabled={controlsDisabled}
                onChange={(event) => setExternalApiKey(event.target.value)}
                placeholder={apiKeyConfigured ? "Configured" : "Missing"}
                type="password"
                value={externalApiKey}
              />
            </div>
          </div>
          {error ? (
            <div className="skfiy-dashboard-error skfiy-dashboard-provider-form-message" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="skfiy-dashboard-empty skfiy-dashboard-provider-form-message" aria-live="polite">
              {notice}
            </div>
          ) : null}
          <div className="skfiy-dashboard-provider-form-actions">
            <button
              className="skfiy-dashboard-button button"
              disabled={controlsDisabled}
              type="submit"
            >
              <Save size={15} aria-hidden="true" />
              {isSaving ? "Saving planner settings" : "Save planner settings"}
            </button>
          </div>
        </form>
      </Card.Content>
    </Card.Root>
  );
}

function ProviderCard({
  provider
}: {
  provider: DashboardProviderSummary;
}) {
  const description = provider.provider
    ? `${provider.provider} · ${provider.mode}`
    : provider.mode;
  const detail = readProviderDetail(provider);

  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-provider-card" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>{description}</Card.Description>
          <Card.Title>{provider.label}</Card.Title>
        </div>
        <Bot size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <div className="skfiy-dashboard-provider-summary">
          <span>{detail}</span>
          <StatusChip tone={readHealthTone(provider.health)}>{provider.health}</StatusChip>
        </div>
        {typeof provider.externalApiKeyConfigured === "boolean" ? (
          <div className="skfiy-dashboard-inline-list">
            <StatusChip tone={provider.externalApiKeyConfigured ? "success" : "warning"}>
              {provider.externalApiKeyConfigured ? "api key configured" : "api key missing"}
            </StatusChip>
            {typeof provider.endpointConfigured === "boolean" ? (
              <StatusChip tone={provider.endpointConfigured ? "success" : "warning"}>
                {provider.endpointConfigured ? "endpoint configured" : "endpoint missing"}
              </StatusChip>
            ) : null}
          </div>
        ) : null}
      </Card.Content>
    </Card.Root>
  );
}

function ChromeControlActions({
  chromeControl,
  onRefresh,
  onRunAction
}: {
  chromeControl: DashboardChromeControlState;
  onRefresh: () => Promise<void>;
  onRunAction: (
    request: DashboardChromeControlActionRequest
  ) => Promise<Record<string, unknown>>;
}) {
  const [selector, setSelector] = useState("");
  const [text, setText] = useState("");
  const [dy, setDy] = useState("600");
  const [busyAction, setBusyAction] = useState<DashboardChromeControlActionRequest["action"] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<Tone>("neutral");
  const canRun = chromeControl.actionable
    && Boolean(chromeControl.extensionId)
    && Number.isInteger(chromeControl.tabId);

  const launchAction = async (action: DashboardChromeControlActionRequest["action"]) => {
    const trimmedSelector = selector.trim();
    const trimmedText = text.trim();
    const targetTabId = Number.isInteger(chromeControl.tabId) ? chromeControl.tabId : undefined;
    if (!canRun || !chromeControl.extensionId || targetTabId === undefined) {
      setFeedbackTone("warning");
      setFeedback(chromeControl.actionUnavailableReason ?? "Chrome action controls are not ready.");
      return;
    }
    if ((action === "click" || action === "fill") && !trimmedSelector) {
      setFeedbackTone("warning");
      setFeedback("Enter a selector before launching this action.");
      return;
    }
    if (action === "fill" && !trimmedText) {
      setFeedbackTone("warning");
      setFeedback("Enter fill text before launching this action.");
      return;
    }

    const request: DashboardChromeControlActionRequest = {
      action,
      extensionId: chromeControl.extensionId,
      ...(chromeControl.chromeAppName ? { chromeAppName: chromeControl.chromeAppName } : {}),
      targetTabId
    };
    if (action === "click" || action === "fill") {
      request.selector = trimmedSelector;
    }
    if (action === "submit") {
      request.selector = trimmedSelector || "form";
    }
    if (action === "fill") {
      request.text = trimmedText;
    }
    if (action === "scroll") {
      const scrollDelta = readScrollDelta(dy);
      if (scrollDelta === undefined) {
        setFeedbackTone("warning");
        setFeedback("Enter a numeric scroll delta before launching this action.");
        return;
      }
      request.dy = scrollDelta;
    }

    setBusyAction(action);
    setFeedbackTone("neutral");
    setFeedback(`Running Chrome ${action}...`);
    try {
      const payload = await onRunAction(request);
      setFeedbackTone("success");
      setFeedback(formatChromeActionFeedback(action, payload));
      await onRefresh();
    } catch (error) {
      setFeedbackTone("danger");
      setFeedback(readErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <form
      aria-label="Chrome control actions"
      className="skfiy-dashboard-control-form"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="skfiy-dashboard-control-fields">
        <div className="skfiy-dashboard-field">
          <label htmlFor="chrome-control-selector">Selector</label>
          <input
            id="chrome-control-selector"
            aria-label="Chrome action selector"
            autoComplete="off"
            onChange={(event) => setSelector(event.target.value)}
            placeholder="#selector"
            spellCheck={false}
            type="text"
            value={selector}
          />
        </div>
        <div className="skfiy-dashboard-field">
          <label htmlFor="chrome-control-fill-text">Text</label>
          <input
            id="chrome-control-fill-text"
            aria-label="Chrome fill text"
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
            placeholder="fill text"
            type="text"
            value={text}
          />
        </div>
        <div className="skfiy-dashboard-field">
          <label htmlFor="chrome-control-scroll-delta">dy</label>
          <input
            id="chrome-control-scroll-delta"
            aria-label="Chrome scroll delta"
            inputMode="numeric"
            onChange={(event) => setDy(event.target.value)}
            type="number"
            value={dy}
          />
        </div>
      </div>
      <div className="skfiy-dashboard-control-actions">
        {CHROME_CONTROL_ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.action}
              className="skfiy-dashboard-button button"
              disabled={busyAction !== null}
              onClick={() => void launchAction(item.action)}
              type="button"
            >
              <Icon size={15} aria-hidden="true" />
              {busyAction === item.action ? `Running ${item.action}` : item.label}
            </button>
          );
        })}
      </div>
      {chromeControl.actionUnavailableReason ? (
        <p className="skfiy-dashboard-muted-message">{chromeControl.actionUnavailableReason}</p>
      ) : null}
      <p
        aria-live="polite"
        className="skfiy-dashboard-control-feedback"
        data-tone={feedbackTone}
      >
        {feedback}
      </p>
    </form>
  );
}

function ChromeHostPolicyControls({
  chromeControl,
  onLoadPolicy,
  onRefresh,
  onSavePolicyAction
}: {
  chromeControl: DashboardChromeControlState;
  onLoadPolicy: () => Promise<DashboardChromeHostPolicyResponse>;
  onRefresh: () => Promise<void>;
  onSavePolicyAction: (
    request: DashboardChromeHostPolicyActionRequest
  ) => Promise<DashboardChromeHostPolicyResponse>;
}) {
  const [host, setHost] = useState("");
  const [busyAction, setBusyAction] = useState<ChromeHostPolicyControlAction | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<Tone>("neutral");

  const updatePolicy = async (action: ChromeHostPolicyControlAction) => {
    const trimmedHost = host.trim();
    if (action !== "refresh" && action !== "reset" && !trimmedHost) {
      setFeedbackTone("warning");
      setFeedback("Enter a host before setting policy.");
      return;
    }

    setBusyAction(action);
    setFeedbackTone("neutral");
    setFeedback(action === "refresh" ? "Refreshing policy..." : "Updating policy...");
    try {
      if (action === "refresh") {
        await onLoadPolicy();
        setFeedbackTone("success");
        setFeedback("Policy refreshed.");
        await onRefresh();
        return;
      }

      const payload = await onSavePolicyAction(
        action === "reset" ? { action } : { action, host: trimmedHost }
      );
      setFeedbackTone("success");
      setFeedback(formatChromePolicyFeedback(payload));
      await onRefresh();
    } catch (error) {
      setFeedbackTone("danger");
      setFeedback(readErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <form
      aria-label="Chrome host policy controls"
      className="skfiy-dashboard-control-form"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="skfiy-dashboard-control-fields skfiy-dashboard-control-fields--policy">
        <div className="skfiy-dashboard-field">
          <label htmlFor="chrome-host-policy-host">Host</label>
          <input
            id="chrome-host-policy-host"
            aria-label="Chrome host policy host"
            autoComplete="off"
            onChange={(event) => setHost(event.target.value)}
            placeholder={chromeControl.host === "No active ordinary page" ? "example.com" : chromeControl.host}
            spellCheck={false}
            type="text"
            value={host}
          />
        </div>
      </div>
      <div className="skfiy-dashboard-control-actions">
        {CHROME_HOST_POLICY_ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.action}
              className="skfiy-dashboard-button button"
              disabled={busyAction !== null}
              onClick={() => void updatePolicy(item.action)}
              type="button"
            >
              <Icon size={15} aria-hidden="true" />
              {busyAction === item.action ? "Working" : item.label}
            </button>
          );
        })}
      </div>
      <p
        aria-live="polite"
        className="skfiy-dashboard-control-feedback"
        data-tone={feedbackTone}
      >
        {feedback}
      </p>
    </form>
  );
}

function AppReadinessCard({ lane }: { lane: DashboardAppReadinessLane }) {
  const Icon = lane.id === "chrome"
    ? Chrome
    : lane.id === "finder"
      ? Folder
      : Terminal;

  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-readiness-card" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>{lane.source}</Card.Description>
          <Card.Title>{lane.title}</Card.Title>
        </div>
        <Icon size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <StatusRow
          label={lane.title.replace(" readiness", "")}
          tone={lane.tone}
          value={lane.value}
          detail={lane.detail}
        />
      </Card.Content>
    </Card.Root>
  );
}

function readScrollDelta(value: string): number | undefined {
  if (!value.trim()) {
    return 600;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatChromeActionFeedback(
  action: DashboardChromeControlActionRequest["action"],
  payload: Record<string, unknown>
): string {
  const activityEntry = readRecord(payload.activityEntry);
  const title = readPayloadString(activityEntry?.title) ?? `Chrome ${action}`;
  const result = readPayloadString(activityEntry?.result)
    ?? readPayloadString(payload.result)
    ?? "reported";
  const blockerReason = readPayloadString(activityEntry?.blockerReason);
  return blockerReason ? `${title}: ${result} - ${blockerReason}` : `${title}: ${result}`;
}

function formatChromePolicyFeedback(payload: DashboardChromeHostPolicyResponse): string {
  const result = payload.result === "reset" ? "reset" : payload.result ?? "updated";
  return `Policy ${result}.`;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readPayloadString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readProviderDetail(provider: DashboardProviderSummary): string {
  if (provider.detail) {
    return provider.detail;
  }
  if (typeof provider.endpointConfigured === "boolean") {
    return provider.endpointConfigured ? "endpoint configured" : "endpoint missing";
  }

  return provider.endpoint ?? provider.binaryPath ?? provider.mode;
}

function StatusRow({
  detail,
  icon,
  label,
  tone,
  value
}: {
  detail?: string;
  icon?: ReactNode;
  label: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div className="skfiy-dashboard-status-row">
      <div className="skfiy-dashboard-status-row-icon" data-tone={tone} aria-hidden="true">
        {icon ?? <CircleForTone tone={tone} />}
      </div>
      <div>
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      <StatusChip tone={tone}>{value}</StatusChip>
    </div>
  );
}

function ActivityCount({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function LatestSignalCard({ signal }: { signal: DashboardLatestTaskSignal }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{signal.title}</Card.Title>
          <Card.Description>{signal.source}</Card.Description>
        </div>
        <TriangleAlert size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{signal.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={signal.tone}>{signal.value}</StatusChip>
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function RuntimeEvidenceCard({ evidence }: { evidence: DashboardRuntimeEvidenceSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{evidence.title}</Card.Title>
          <Card.Description>Smoke and replay proof</Card.Description>
        </div>
        <Activity size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{evidence.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={evidence.tone}>{evidence.value}</StatusChip>
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function CapabilityCard({ capability }: { capability: DashboardCapabilitySummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-capability-card" variant="tertiary">
      <Card.Content className="skfiy-dashboard-card-content">
        <div className="skfiy-dashboard-capability-card-heading">
          <h3>{capability.title}</h3>
          <StatusChip tone={capability.tone}>{capability.value}</StatusChip>
        </div>
        <p>{capability.detail}</p>
      </Card.Content>
    </Card.Root>
  );
}

function MetricCard({ item }: { item: { label: string; value: string; tone: Tone } }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-metric" variant="tertiary">
      <Card.Content className="skfiy-dashboard-card-content">
        <div className="skfiy-dashboard-metric-icon" data-tone={item.tone}>
          {item.tone === "success" ? (
            <ShieldCheck size={17} aria-hidden="true" />
          ) : item.tone === "warning" ? (
            <TriangleAlert size={17} aria-hidden="true" />
          ) : (
            <Gauge size={17} aria-hidden="true" />
          )}
        </div>
        <div>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function CircleForTone({ tone }: { tone: Tone }) {
  return tone === "success" ? (
    <CheckCircle2 size={16} aria-hidden="true" />
  ) : tone === "danger" || tone === "warning" ? (
    <TriangleAlert size={16} aria-hidden="true" />
  ) : (
    <Gauge size={16} aria-hidden="true" />
  );
}

function DashboardLoading() {
  return (
    <div className="skfiy-dashboard-content" aria-busy="true" aria-label="Loading dashboard">
      <div className="skfiy-dashboard-grid skfiy-dashboard-grid--three">
        <Skeleton.Root className="skfiy-dashboard-skeleton" animationType="pulse" />
        <Skeleton.Root className="skfiy-dashboard-skeleton" animationType="pulse" />
        <Skeleton.Root className="skfiy-dashboard-skeleton" animationType="pulse" />
      </div>
      <Skeleton.Root className="skfiy-dashboard-skeleton skfiy-dashboard-skeleton--wide" animationType="pulse" />
      <Skeleton.Root className="skfiy-dashboard-skeleton skfiy-dashboard-skeleton--wide" animationType="pulse" />
    </div>
  );
}

function StatusChip({
  ariaLabel,
  children,
  tone
}: {
  ariaLabel?: string;
  children: ReactNode;
  tone: Tone;
}) {
  return (
    <Chip.Root
      aria-label={ariaLabel}
      className="skfiy-dashboard-chip"
      color={readChipColor(tone)}
      data-tone={tone}
      size="sm"
      variant="soft"
    >
      <Chip.Label>{children}</Chip.Label>
    </Chip.Root>
  );
}

function readChipColor(tone: Tone): "default" | "success" | "warning" | "danger" {
  if (tone === "success" || tone === "warning" || tone === "danger") {
    return tone;
  }

  return "default";
}

function readHealthTone(health: string): Tone {
  if (health === "available") {
    return "success";
  }
  if (health === "unavailable") {
    return "danger";
  }

  return "warning";
}

function readAssistantReadinessTone(readiness: string): Tone {
  if (readiness === "ready") {
    return "success";
  }
  if (readiness === "unavailable" || readiness === "unconfigured") {
    return "danger";
  }

  return "warning";
}

function readPlannerProviderMode(value: unknown): DashboardPlannerProviderMode {
  return value === "external-cua" || value === "disabled"
    ? value
    : "local-deterministic";
}

function readPlannerProviderEndpoint(planner: DashboardProviderSettingsPlanner): string {
  return planner.externalEndpoint ?? planner.endpoint ?? "";
}

function readErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(date);
}
