import {
  Activity,
  ArrowDown,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Chrome,
  Eye,
  EyeOff,
  FileSearch,
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
import { Button, Card, Chip, ProgressBar, Skeleton } from "@heroui/react";
import {
  fetchChromeHostPolicy,
  fetchDashboardEvidenceSummary,
  fetchDashboardSnapshot,
  fetchProviderSettings,
  postChromeControlAction,
  postChromeHostPolicyAction,
  postPersonalMemoryAction,
  postPersonalSkillAction,
  postPlannerProviderSettings
} from "./api";
import type {
  DashboardChromeControlActionRequest,
  DashboardChromeHostPolicyAction,
  DashboardChromeHostPolicyActionRequest,
  DashboardChromeHostPolicyResponse,
  DashboardEvidenceSummary,
  DashboardPersonalMemoryActionRequest,
  DashboardPersonalMemoryActionResponse,
  DashboardPersonalMemorySummary,
  DashboardPendingPersonalMemoryWrite,
  DashboardPersonalSkillActionRequest,
  DashboardPersonalSkillActionResponse,
  DashboardPersonalSkillCard,
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
  readActivityFeedSummary,
  readAgentSupervisionSummary,
  readAlertGroupSummary,
  readAlertMessages,
  readAppReadinessLanes,
  readAppsSitesSummary,
  readApprovalQueueSummary,
  readCapabilitySummaries,
  readChromeControlCommandHints,
  readChromeControlState,
  readChromeSetupGuideSummary,
  readComputerUseReadiness,
  readDogfoodSummary,
  readDashboardPanelSummary,
  readHomeSummary,
  readKnowledgeGraph,
  readLatestTaskSignal,
  readLongHorizonSummary,
  readNextAction,
  readOperatorEvidenceSummary,
  readOperatorReadinessChecks,
  readPersonalMutationReceipt,
  readProviderSummaries,
  readPromptStackSummary,
  readReadinessSummary,
  readRecentActivity,
  readRouteOutcome,
  readRuntimeEvidenceSummary,
  readRuntimeHealthSummary,
  readRuntimeSnapshotDetails,
  readSmokeArtifactInventory,
  readSmokeArtifactDetails,
  readSnapshotState,
  readUnsupportedSmokeEvidence,
  type DashboardAgentSupervisionSummary,
  type DashboardActivityFeedSummary,
  type DashboardAlertGroupSummary,
  type DashboardAppReadinessLane,
  type DashboardAppsSitesSummary,
  type DashboardApprovalQueueSummary,
  type DashboardCapabilitySummary,
  type DashboardChromeControlState,
  type DashboardChromeSetupGuideSummary,
  type DashboardComputerUseReadiness,
  type DashboardPanelCatalogSummary,
  type DashboardDogfoodSummary,
  type DashboardHomeSummary,
  type DashboardLatestTaskSignal,
  type DashboardLongHorizonSummary,
  type DashboardMutationReceipt,
  type DashboardNextAction,
  type DashboardOperatorEvidenceSummary,
  type DashboardOperatorReadinessChecks,
  type DashboardPromptStackSummary,
  type DashboardReadinessSummary,
  type DashboardRecentActivity,
  type DashboardRouteOutcome,
  type DashboardRuntimeEvidenceSummary,
  type DashboardRuntimeHealthSummary,
  type DashboardRuntimeSnapshotDetail,
  type DashboardSmokeArtifactInventory,
  type DashboardSmokeArtifactDetail,
  type DashboardStatusItem,
  type Tone
} from "./model";
import { KnowledgeGraph } from "./KnowledgeGraph";

export interface DashboardAppProps {
  loadEvidenceSummary?: () => Promise<DashboardEvidenceSummary>;
  loadChromeHostPolicy?: () => Promise<DashboardChromeHostPolicyResponse>;
  loadSnapshot?: () => Promise<DashboardSnapshot>;
  loadProviderSettings?: () => Promise<DashboardProviderSettingsResponse>;
  runChromeControlAction?: (
    request: DashboardChromeControlActionRequest
  ) => Promise<Record<string, unknown>>;
  runPersonalMemoryAction?: (
    request: DashboardPersonalMemoryActionRequest
  ) => Promise<DashboardPersonalMemoryActionResponse>;
  runPersonalSkillAction?: (
    request: DashboardPersonalSkillActionRequest
  ) => Promise<DashboardPersonalSkillActionResponse>;
  saveChromeHostPolicyAction?: (
    request: DashboardChromeHostPolicyActionRequest
  ) => Promise<DashboardChromeHostPolicyResponse>;
  savePlannerProviderSettings?: (
    update: DashboardPlannerProviderSettingsUpdate
  ) => Promise<DashboardProviderSettingsResponse>;
}

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "provider", label: "Agent", icon: Bot },
  { id: "memory", label: "Memory", icon: History },
  { id: "knowledge-graph", label: "Graph", icon: Gauge },
  { id: "agent-tools", label: "Tools", icon: MonitorCog },
  { id: "browser", label: "Browser Context", icon: Chrome },
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
  loadEvidenceSummary = fetchDashboardEvidenceSummary,
  loadChromeHostPolicy = fetchChromeHostPolicy,
  loadSnapshot = fetchDashboardSnapshot,
  loadProviderSettings = fetchProviderSettings,
  runChromeControlAction = postChromeControlAction,
  runPersonalMemoryAction = postPersonalMemoryAction,
  runPersonalSkillAction = postPersonalSkillAction,
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
  const [memoryMutationReceipt, setMemoryMutationReceipt] = useState<DashboardMutationReceipt | null>(null);
  const [evidenceSummary, setEvidenceSummary] = useState<DashboardEvidenceSummary | null>(null);
  const [evidenceSummaryError, setEvidenceSummaryError] = useState<string | null>(null);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingEvidenceSummary, setIsLoadingEvidenceSummary] = useState(false);
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
    setMemoryMutationReceipt(null);
    try {
      const response = await runPersonalMemoryAction(request);
      await refresh();
      setMemoryMutationReceipt(readPersonalMutationReceipt(response));
      setMemoryNotice(readPersonalMemoryNotice(response.result));
    } catch (submitError) {
      setMemoryError(readErrorMessage(submitError));
    } finally {
      setIsSavingMemory(false);
    }
  }, [refresh, runPersonalMemoryAction]);

  const submitPersonalSkillAction = useCallback(async (
    request: DashboardPersonalSkillActionRequest
  ) => {
    setIsSavingMemory(true);
    setMemoryError(null);
    setMemoryNotice(null);
    setMemoryMutationReceipt(null);
    try {
      const response = await runPersonalSkillAction(request);
      await refresh();
      setMemoryMutationReceipt(readPersonalMutationReceipt(response));
      setMemoryNotice(response.result === "unmuted" ? "Personal skill unmuted" : "Personal skill muted");
    } catch (submitError) {
      setMemoryError(readErrorMessage(submitError));
    } finally {
      setIsSavingMemory(false);
    }
  }, [refresh, runPersonalSkillAction]);

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

  const refreshEvidenceSummary = useCallback(async () => {
    setIsLoadingEvidenceSummary(true);
    setEvidenceSummaryError(null);
    try {
      setEvidenceSummary(await loadEvidenceSummary());
    } catch (summaryError) {
      setEvidenceSummaryError(readErrorMessage(summaryError));
    } finally {
      setIsLoadingEvidenceSummary(false);
    }
  }, [loadEvidenceSummary]);

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
            <span>Background Agent workspace</span>
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
            <h2>skfiy agent workspace</h2>
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
            evidenceSummary={evidenceSummary}
            evidenceSummaryError={evidenceSummaryError}
            isProviderSettingsLoading={isRefreshing && !providerSettings}
            isProviderSettingsSaving={isSavingProviderSettings}
            isLoadingEvidenceSummary={isLoadingEvidenceSummary}
            isMemorySaving={isSavingMemory}
            memoryError={memoryError}
            memoryMutationReceipt={memoryMutationReceipt}
            memoryNotice={memoryNotice}
            onLoadChromeHostPolicy={loadChromeHostPolicy}
            onRefresh={refresh}
            onRunPersonalMemoryAction={submitPersonalMemoryAction}
            onRunPersonalSkillAction={submitPersonalSkillAction}
            onRunChromeControlAction={runChromeControlAction}
            onSaveChromeHostPolicyAction={saveChromeHostPolicyAction}
            onLoadEvidenceSummary={refreshEvidenceSummary}
            onSubmitPlannerProviderSettings={submitPlannerProviderSettings}
          />
        ) : (
          <DashboardLoading />
        )}
      </main>
    </div>
  );
}

function readPersonalMemoryNotice(result: DashboardPersonalMemoryActionResponse["result"]): string {
  if (result === "approved") {
    return "Pending memory approved";
  }
  if (result === "rejected") {
    return "Pending memory rejected";
  }
  if (result === "not-found") {
    return "Memory was already absent";
  }
  return "Memory forgotten";
}

function DashboardContent({
  snapshot,
  providerSettings,
  providerSettingsError,
  providerSettingsNotice,
  evidenceSummary,
  evidenceSummaryError,
  isProviderSettingsLoading,
  isProviderSettingsSaving,
  isLoadingEvidenceSummary,
  isMemorySaving,
  memoryError,
  memoryMutationReceipt,
  memoryNotice,
  onLoadChromeHostPolicy,
  onRefresh,
  onRunPersonalMemoryAction,
  onRunPersonalSkillAction,
  onRunChromeControlAction,
  onSaveChromeHostPolicyAction,
  onLoadEvidenceSummary,
  onSubmitPlannerProviderSettings
}: {
  snapshot: DashboardSnapshot;
  providerSettings: DashboardProviderSettingsResponse | null;
  providerSettingsError: string | null;
  providerSettingsNotice: string | null;
  evidenceSummary: DashboardEvidenceSummary | null;
  evidenceSummaryError: string | null;
  isProviderSettingsLoading: boolean;
  isProviderSettingsSaving: boolean;
  isLoadingEvidenceSummary: boolean;
  isMemorySaving: boolean;
  memoryError: string | null;
  memoryMutationReceipt: DashboardMutationReceipt | null;
  memoryNotice: string | null;
  onLoadChromeHostPolicy: () => Promise<DashboardChromeHostPolicyResponse>;
  onRefresh: () => Promise<void>;
  onRunPersonalMemoryAction: (
    request: DashboardPersonalMemoryActionRequest
  ) => Promise<void>;
  onRunPersonalSkillAction: (
    request: DashboardPersonalSkillActionRequest
  ) => Promise<void>;
  onRunChromeControlAction: (
    request: DashboardChromeControlActionRequest
  ) => Promise<Record<string, unknown>>;
  onSaveChromeHostPolicyAction: (
    request: DashboardChromeHostPolicyActionRequest
  ) => Promise<DashboardChromeHostPolicyResponse>;
  onLoadEvidenceSummary: () => Promise<void>;
  onSubmitPlannerProviderSettings: (
    update: DashboardPlannerProviderSettingsUpdate
  ) => Promise<void>;
}) {
  const stateItems = useMemo(() => readSnapshotState(snapshot), [snapshot]);
  const readiness = useMemo(() => readReadinessSummary(snapshot), [snapshot]);
  const readinessChecks = useMemo(() => readOperatorReadinessChecks(snapshot), [snapshot]);
  const capabilities = useMemo(() => readCapabilitySummaries(snapshot), [snapshot]);
  const panelCatalog = useMemo(() => readDashboardPanelSummary(snapshot), [snapshot]);
  const chromeControl = useMemo(() => readChromeControlState(snapshot), [snapshot]);
  const chromeSetupGuide = useMemo(() => readChromeSetupGuideSummary(snapshot), [snapshot]);
  const computerUse = useMemo(() => readComputerUseReadiness(snapshot), [snapshot]);
  const agentSupervision = useMemo(() => readAgentSupervisionSummary(snapshot), [snapshot]);
  const appReadiness = useMemo(() => readAppReadinessLanes(snapshot), [snapshot]);
  const smokeArtifactInventory = useMemo(() => readSmokeArtifactInventory(snapshot), [snapshot]);
  const smokeArtifactDetails = useMemo(() => readSmokeArtifactDetails(snapshot), [snapshot]);
  const unsupportedSmoke = useMemo(() => readUnsupportedSmokeEvidence(snapshot), [snapshot]);
  const providers = useMemo(() => readProviderSummaries(snapshot), [snapshot]);
  const promptStack = useMemo(() => readPromptStackSummary(snapshot), [snapshot]);
  const activity = useMemo(() => readRecentActivity(snapshot), [snapshot]);
  const homeSummary = useMemo(() => readHomeSummary(snapshot), [snapshot]);
  const appsSitesSummary = useMemo(() => readAppsSitesSummary(snapshot), [snapshot]);
  const activityFeed = useMemo(() => readActivityFeedSummary(snapshot), [snapshot]);
  const alertGroups = useMemo(() => readAlertGroupSummary(snapshot), [snapshot]);
  const routeOutcome = useMemo(() => readRouteOutcome(snapshot), [snapshot]);
  const approvalQueue = useMemo(() => readApprovalQueueSummary(snapshot), [snapshot]);
  const latestSignal = useMemo(() => readLatestTaskSignal(snapshot), [snapshot]);
  const runtimeEvidence = useMemo(() => readRuntimeEvidenceSummary(snapshot), [snapshot]);
  const runtimeHealth = useMemo(() => readRuntimeHealthSummary(snapshot), [snapshot]);
  const operatorEvidence = useMemo(() => readOperatorEvidenceSummary(snapshot), [snapshot]);
  const runtimeSnapshotDetails = useMemo(() => readRuntimeSnapshotDetails(snapshot), [snapshot]);
  const longHorizon = useMemo(() => readLongHorizonSummary(snapshot), [snapshot]);
  const dogfood = useMemo(() => readDogfoodSummary(snapshot), [snapshot]);
  const nextAction = useMemo(() => readNextAction(snapshot), [snapshot]);
  const alerts = useMemo(() => readAlertMessages(snapshot), [snapshot]);
  const knowledgeGraph = useMemo(() => readKnowledgeGraph(snapshot), [snapshot]);
  const dashboardUrl = formatDashboardUrl(snapshot.descriptor.url);

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
              <strong title={dashboardUrl}>{dashboardUrl}</strong>
            </div>
            <div>
              <span>Alerts</span>
              <strong>{alerts.length === 0 ? "none" : String(alerts.length)}</strong>
            </div>
          </div>
        </div>
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
        <DashboardCommandCenter
          activity={activity}
          alerts={alerts}
          capabilities={capabilities}
          chromeControl={chromeControl}
          computerUse={computerUse}
          dogfood={dogfood}
          knowledgeGraph={knowledgeGraph}
          nextAction={nextAction}
          readiness={readiness}
          routeOutcome={routeOutcome}
          runtimeEvidence={runtimeEvidence}
          stateItems={stateItems}
        />
        <OperatorReadinessChecksCard summary={readinessChecks} />
        <RuntimeHealthCard summary={runtimeHealth} />
        <DashboardPanelCatalogCard summary={panelCatalog} />
        <HomeSummaryCard summary={homeSummary} />
        <AppsSitesSummaryCard summary={appsSitesSummary} />
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
            <h2 id="provider-title">Background Agent</h2>
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
          <PromptStackCard summary={promptStack} />
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
          assistantProviderLabel={snapshot.providers?.assistant?.label ?? "Background Agent"}
          error={memoryError}
          isSaving={isMemorySaving}
          memory={snapshot.personalMemory}
          mutationReceipt={memoryMutationReceipt}
          notice={memoryNotice}
          onForget={onRunPersonalMemoryAction}
          onMuteSkill={onRunPersonalSkillAction}
        />
      </section>

      <section
        id="agent-tools"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="agent-tools-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Tool layer</span>
            <h2 id="agent-tools-title">Agent tools</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
          <Card.Root className="skfiy-dashboard-card skfiy-dashboard-readiness-card" variant="secondary">
            <Card.Header className="skfiy-dashboard-card-header">
              <div>
                <Card.Description>Computer Use</Card.Description>
                <Card.Title>Computer Use tool</Card.Title>
              </div>
              <MonitorCog size={18} aria-hidden="true" />
            </Card.Header>
            <Card.Content className="skfiy-dashboard-card-content">
              <p className="skfiy-dashboard-muted-message">
                Permissioned desktop/app-control tool invoked by the selected Background Agent.
              </p>
              <div className="skfiy-dashboard-inline-list" aria-label="Computer Use permission summary">
                <StatusChip tone={computerUse.permissionSummary.tone}>
                  {computerUse.permissionSummary.value}
                </StatusChip>
                <span>{computerUse.permissionSummary.detail}</span>
              </div>
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
              {computerUse.accessSteps.length > 0 ? (
                <div className="skfiy-dashboard-control-panel">
                  <h4>Finder Automation access checklist</h4>
                  <ul
                    aria-label="Finder Automation access checklist"
                    className="skfiy-dashboard-evidence-list"
                  >
                    {computerUse.accessSteps.map((step) => (
                      <li key={step.id}>
                        <StatusChip tone={step.tone}>{step.label}</StatusChip>
                        <span>{step.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card.Content>
          </Card.Root>
          <AgentSupervisionCard summary={agentSupervision} />
          {appReadiness.map((lane) => (
            <AppReadinessCard key={lane.id} lane={lane} />
          ))}
          {unsupportedSmoke ? (
            <div className="skfiy-dashboard-inline-list skfiy-dashboard-grid-note">
              <StatusChip tone="warning">{unsupportedSmoke}</StatusChip>
            </div>
          ) : null}
          <SmokeArtifactInventoryCard summary={smokeArtifactInventory} />
          <SmokeArtifactDetailsCard details={smokeArtifactDetails} />
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
              {chromeControl.browserContextAccessSteps.length > 0 ? (
                <div className="skfiy-dashboard-control-panel">
                  <h4>Browser Context access checklist</h4>
                  <ul
                    aria-label="Browser Context access checklist"
                    className="skfiy-dashboard-evidence-list"
                  >
                    {chromeControl.browserContextAccessSteps.map((step) => (
                      <li key={step.id}>
                        <StatusChip tone={step.tone}>{step.label}</StatusChip>
                        <span>{step.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
                <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Chrome host policy details">
                  {chromeControl.hostPolicy.items.map((item) => (
                    <li key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.tone}</small>
                    </li>
                  ))}
                </ul>
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
              <ChromeSetupGuidePanel setupGuide={chromeSetupGuide} />
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
          <ActivityFeedCard summary={activityFeed} />
          <AlertGroupCard summary={alertGroups} />
          <RouteOutcomeCard outcome={routeOutcome} />
          <ApprovalQueueCard summary={approvalQueue} />
          <LatestSignalCard signal={latestSignal} />
          <RuntimeEvidenceCard evidence={runtimeEvidence} />
          <RuntimeSnapshotDetailsCard details={runtimeSnapshotDetails} />
          <LongHorizonCard summary={longHorizon} />
          <EvidenceSummaryCard
            error={evidenceSummaryError}
            isLoading={isLoadingEvidenceSummary}
            onLoad={onLoadEvidenceSummary}
            summary={evidenceSummary}
          />
          <OperatorEvidenceCard summary={operatorEvidence} />
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
              <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Release gate details">
                {dogfood.items.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.tone}</small>
                  </li>
                ))}
              </ul>
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

function DashboardCommandCenter({
  activity,
  alerts,
  capabilities,
  chromeControl,
  computerUse,
  dogfood,
  knowledgeGraph,
  nextAction,
  readiness,
  routeOutcome,
  runtimeEvidence,
  stateItems
}: {
  activity: DashboardRecentActivity;
  alerts: string[];
  capabilities: DashboardCapabilitySummary[];
  chromeControl: DashboardChromeControlState;
  computerUse: DashboardComputerUseReadiness;
  dogfood: DashboardDogfoodSummary;
  knowledgeGraph: ReturnType<typeof readKnowledgeGraph>;
  nextAction: DashboardNextAction;
  readiness: DashboardReadinessSummary;
  routeOutcome: DashboardRouteOutcome;
  runtimeEvidence: DashboardRuntimeEvidenceSummary;
  stateItems: DashboardStatusItem[];
}) {
  const routeTone = routeOutcome.kind === "idle" ? "success" : routeOutcome.tone;
  const routeScore = routeOutcome.kind === "idle" ? 100 : readToneScore(routeOutcome.tone);
  const radarMetrics = [
    { label: "Readiness", score: readToneScore(readiness.tone), tone: readiness.tone },
    { label: "Desktop", score: readToneScore(computerUse.desktop.tone), tone: computerUse.desktop.tone },
    { label: "Browser", score: readToneScore(chromeControl.tone), tone: chromeControl.tone },
    { label: "Route", score: routeScore, tone: routeTone },
    { label: "Evidence", score: readToneScore(runtimeEvidence.tone), tone: runtimeEvidence.tone },
    { label: "Release", score: readToneScore(dogfood.tone), tone: dogfood.tone },
    { label: "Alerts", score: alerts.length === 0 ? 100 : Math.max(10, 80 - alerts.length * 18), tone: alerts.length === 0 ? "success" as const : "warning" as const }
  ];
  const operationalScore = Math.round(
    radarMetrics.reduce((sum, metric) => sum + metric.score, 0) / Math.max(1, radarMetrics.length)
  );
  const flowNodes = [
    { label: "Agent", detail: capabilities[0]?.value ?? "provider", tone: capabilities[0]?.tone ?? "neutral" },
    { label: "Memory", detail: `${knowledgeGraph.nodes.filter((node) => node.kind === "memory").length} nodes`, tone: readGraphTone(knowledgeGraph, "memory") },
    { label: "Browser", detail: chromeControl.label, tone: chromeControl.tone },
    { label: "Tool layer", detail: computerUse.desktop.value, tone: computerUse.desktop.tone },
    { label: "Route", detail: routeOutcome.value, tone: routeTone },
    { label: "Evidence", detail: runtimeEvidence.value, tone: runtimeEvidence.tone }
  ];
  const activityBars = [
    { label: "Actions", value: activity.actionCount ?? 0, tone: "success" as const },
    { label: "Screenshots", value: activity.screenshotCount ?? 0, tone: "neutral" as const },
    { label: "Checks", value: activity.verificationCount ?? 0, tone: "warning" as const }
  ];
  const progressItems = [
    ...stateItems.map((item) => ({
      label: item.label,
      value: item.value,
      score: readToneScore(item.tone),
      tone: item.tone
    })),
    {
      label: "Browser context",
      value: chromeControl.browserContext.state,
      score: readToneScore(chromeControl.browserContext.tone),
      tone: chromeControl.browserContext.tone
    },
    {
      label: "Route outcome",
      value: routeOutcome.value,
      score: routeScore,
      tone: routeTone
    },
    {
      label: "Next action",
      value: nextAction.title,
      score: readToneScore(nextAction.tone),
      tone: nextAction.tone
    }
  ];

  return (
    <Card.Root
      aria-label="Agent workspace"
      className="skfiy-dashboard-card skfiy-dashboard-command-center"
      role="region"
      variant="secondary"
    >
      <Card.Content className="skfiy-dashboard-command-grid">
        <section className="skfiy-dashboard-command-brief" aria-label="Live command brief">
          <span className="skfiy-dashboard-kicker">Background Agent workspace</span>
          <h3>{readiness.title}</h3>
          <p>{readiness.detail}</p>
          <div className="skfiy-dashboard-command-next">
            <span>Next</span>
            <strong>{nextAction.title}</strong>
            <p>{nextAction.detail}</p>
          </div>
          <ProgressMeter
            label="Operational confidence"
            score={operationalScore}
            tone={readiness.tone}
            valueLabel={`${operationalScore}%`}
          />
        </section>
        <section className="skfiy-dashboard-command-chart" aria-label="Readiness radar">
          <SignalRadarChart metrics={radarMetrics} score={operationalScore} />
        </section>
        <section className="skfiy-dashboard-command-flow" aria-label="Runtime flow">
          <RuntimeFlowChart nodes={flowNodes} />
        </section>
        <section className="skfiy-dashboard-command-evidence" aria-label="Evidence and activity">
          <div className="skfiy-dashboard-mini-chart-heading">
            <span>Activity texture</span>
            <strong>{activity.turnState}</strong>
          </div>
          <ActivityBarChart items={activityBars} />
          <div className="skfiy-dashboard-progress-stack">
            {progressItems.map((item) => (
              <ProgressMeter
                key={`${item.label}-${item.value}`}
                label={item.label}
                score={item.score}
                tone={item.tone}
                valueLabel={item.value}
              />
            ))}
          </div>
        </section>
      </Card.Content>
    </Card.Root>
  );
}

function OperatorReadinessChecksCard({ summary }: { summary: DashboardOperatorReadinessChecks }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Command surface and runtime proof</Card.Description>
        </div>
        <Gauge size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Operator readiness checks">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function RuntimeHealthCard({ summary }: { summary: DashboardRuntimeHealthSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Local process and bridge state</Card.Description>
        </div>
        <MonitorCog size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Runtime health details">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function DashboardPanelCatalogCard({ summary }: { summary: DashboardPanelCatalogSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Local descriptor surface</Card.Description>
        </div>
        <FileSearch size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
          {summary.items.map((item) => (
            <StatusChip key={`${item.label}-${item.value}`} tone={item.tone}>
              {item.label} {item.value}
            </StatusChip>
          ))}
        </div>
        <ul className="skfiy-dashboard-evidence-list" aria-label="Dashboard panel catalog">
          {summary.panels.map((panel) => (
            <li key={panel.id}>
              <StatusChip tone={panel.tone}>{panel.id}</StatusChip>
              <strong>{panel.title}</strong>
              <span>{panel.signalCount} signals · {panel.actionCount} actions</span>
              <small>
                {panel.actions.length > 0
                  ? `actions: ${panel.actions.join(", ")}`
                  : "read-only panel"}
              </small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function HomeSummaryCard({ summary }: { summary: DashboardHomeSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Assistant task snapshot</Card.Description>
        </div>
        <Home size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Home summary details">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function AppsSitesSummaryCard({ summary }: { summary: DashboardAppsSitesSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Browser access snapshot</Card.Description>
        </div>
        <Chrome size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Apps and sites details">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function ProgressMeter({
  label,
  score,
  tone,
  valueLabel
}: {
  label: string;
  score: number;
  tone: Tone;
  valueLabel: string;
}) {
  const boundedScore = clampScore(score);

  return (
    <ProgressBar.Root
      aria-label={label}
      className="skfiy-dashboard-progress"
      maxValue={100}
      minValue={0}
      value={boundedScore}
    >
      <div className="skfiy-dashboard-progress-copy">
        <span>{label}</span>
        <ProgressBar.Output>{valueLabel}</ProgressBar.Output>
      </div>
      <ProgressBar.Track className="skfiy-dashboard-progress-track">
        <ProgressBar.Fill className="skfiy-dashboard-progress-fill" data-tone={tone} />
      </ProgressBar.Track>
    </ProgressBar.Root>
  );
}

function SignalRadarChart({
  metrics,
  score
}: {
  metrics: Array<{ label: string; score: number; tone: Tone }>;
  score: number;
}) {
  const center = 96;
  const radius = 70;
  const polygon = metrics
    .map((metric, index) => {
      const point = readRadarPoint(index, metrics.length, center, radius * (clampScore(metric.score) / 100));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <div className="skfiy-dashboard-radar">
      <svg aria-label="Readiness radar chart" role="img" viewBox="0 0 192 192">
        <defs>
          <linearGradient id="skfiy-dashboard-radar-fill" x1="20%" x2="100%" y1="20%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.72" />
            <stop offset="52%" stopColor="#60a5fa" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.36" />
          </linearGradient>
        </defs>
        {[0.33, 0.66, 1].map((scale) => (
          <polygon
            className="skfiy-dashboard-radar-grid"
            key={scale}
            points={metrics
              .map((_, index) => {
                const point = readRadarPoint(index, metrics.length, center, radius * scale);
                return `${point.x},${point.y}`;
              })
              .join(" ")}
          />
        ))}
        {metrics.map((metric, index) => {
          const edge = readRadarPoint(index, metrics.length, center, radius);
          const dot = readRadarPoint(index, metrics.length, center, radius * (clampScore(metric.score) / 100));
          return (
            <g key={metric.label}>
              <line className="skfiy-dashboard-radar-axis" x1={center} x2={edge.x} y1={center} y2={edge.y} />
              <circle className="skfiy-dashboard-radar-dot" cx={dot.x} cy={dot.y} data-tone={metric.tone} r="3.8" />
              <text className="skfiy-dashboard-radar-label" x={edge.x} y={edge.y}>{metric.label}</text>
            </g>
          );
        })}
        <polygon className="skfiy-dashboard-radar-shape" points={polygon} />
      </svg>
      <div className="skfiy-dashboard-radar-score">
        <span>{score}%</span>
        <strong>confidence</strong>
      </div>
    </div>
  );
}

function RuntimeFlowChart({
  nodes
}: {
  nodes: Array<{ label: string; detail: string; tone: Tone }>;
}) {
  return (
    <div className="skfiy-dashboard-flow-chart" role="img" aria-label="Agent runtime flow chart">
      {nodes.map((node, index) => (
        <div className="skfiy-dashboard-flow-node" data-tone={node.tone} key={`${node.label}-${index}`}>
          <span>{node.label}</span>
          <strong>{node.detail}</strong>
        </div>
      ))}
    </div>
  );
}

function ActivityBarChart({
  items
}: {
  items: Array<{ label: string; value: number; tone: Tone }>;
}) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="skfiy-dashboard-activity-chart" role="img" aria-label="Activity bar chart">
      {items.map((item) => (
        <div className="skfiy-dashboard-activity-bar" key={item.label}>
          <span>{item.label}</span>
          <div>
            <i data-tone={item.tone} style={{ width: `${Math.max(8, Math.round((item.value / maxValue) * 100))}%` }} />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function readRadarPoint(
  index: number,
  total: number,
  center: number,
  radius: number
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / Math.max(1, total)) * Math.PI * 2;
  return {
    x: Math.round((center + Math.cos(angle) * radius) * 100) / 100,
    y: Math.round((center + Math.sin(angle) * radius) * 100) / 100
  };
}

function readGraphTone(
  graph: ReturnType<typeof readKnowledgeGraph>,
  kind: string
): Tone {
  const nodes = graph.nodes.filter((node) => node.kind === kind);
  if (nodes.some((node) => node.tone === "danger")) {
    return "danger";
  }
  if (nodes.some((node) => node.tone === "warning")) {
    return "warning";
  }
  if (nodes.some((node) => node.tone === "success")) {
    return "success";
  }
  return "neutral";
}

function readToneScore(tone: Tone): number {
  if (tone === "success") {
    return 100;
  }
  if (tone === "warning") {
    return 48;
  }
  if (tone === "danger") {
    return 16;
  }
  return 68;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function PersonalMemoryPanel({
  assistantProviderLabel,
  error,
  isSaving,
  memory,
  mutationReceipt,
  notice,
  onForget,
  onMuteSkill
}: {
  assistantProviderLabel: string;
  error: string | null;
  isSaving: boolean;
  memory: DashboardPersonalMemorySummary | undefined;
  mutationReceipt: DashboardMutationReceipt | null;
  notice: string | null;
  onForget: (request: DashboardPersonalMemoryActionRequest) => Promise<void>;
  onMuteSkill: (request: DashboardPersonalSkillActionRequest) => Promise<void>;
}) {
  const userEntries = memory?.recentUserEntries ?? [];
  const agentEntries = memory?.recentAgentEntries ?? [];
  const pendingWrites = memory?.pendingWrites ?? [];
  const personalSkills = memory?.personalSkills ?? [];
  const mutedSkillIds = memory?.mutedPersonalSkillIds ?? [];
  const memoryJournal = memory?.memoryJournal ?? [];

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
          <StatusChip tone={pendingWrites.length > 0 ? "warning" : "neutral"}>
            pending writes {memory?.pendingWriteCount ?? pendingWrites.length}
          </StatusChip>
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
        <PendingMemoryWriteList
          isSaving={isSaving}
          onApprove={(write) => onForget({ action: "approve-pending", pendingId: write.id })}
          onReject={(write) => onForget({ action: "reject-pending", pendingId: write.id })}
          writes={pendingWrites}
        />
        <PersonalSkillCardList
          isSaving={isSaving}
          onMute={(skill) => onMuteSkill({ action: "mute", skillId: skill.id })}
          onUnmute={(skillId) => onMuteSkill({ action: "unmute", skillId })}
          mutedSkillIds={mutedSkillIds}
          skills={personalSkills}
        />
        <WorkingProfilePanel profile={memory?.workingProfile} />
        <MemoryEvolutionTrail entries={memoryJournal} />
        <MemoryJournalList entries={memoryJournal} />
        <RecentSessionRecallList
          sessions={memory?.recentSessions ?? []}
          targetProviderLabel={assistantProviderLabel}
        />
        <PersonalMutationReceiptPanel receipt={mutationReceipt} />
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

function PersonalMutationReceiptPanel({
  receipt
}: {
  receipt: DashboardMutationReceipt | null;
}) {
  if (!receipt) {
    return null;
  }

  return (
    <div
      aria-label="Personal memory mutation receipt"
      className="skfiy-dashboard-control-panel"
      role="region"
    >
      <h3>{receipt.title}</h3>
      <div className="skfiy-dashboard-inline-list">
        <StatusChip tone={receipt.tone}>result {receipt.result}</StatusChip>
        {receipt.items.map((item) => (
          <StatusChip key={`${item.label}-${item.value}`} tone={item.tone}>
            {item.label} {item.value}
          </StatusChip>
        ))}
      </div>
    </div>
  );
}

function WorkingProfilePanel({
  profile
}: {
  profile: DashboardPersonalMemorySummary["workingProfile"];
}) {
  if (!profile) {
    return null;
  }

  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-working-profile">
      <h3>Working profile</h3>
      <div className="skfiy-dashboard-inline-list" aria-label="Working profile status">
        <StatusChip tone="success">{profile.source}</StatusChip>
        <StatusChip tone="neutral">{profile.portability}</StatusChip>
        <StatusChip tone="neutral">profile memory {profile.memoryEntryCount}</StatusChip>
        <StatusChip tone="neutral">profile sessions {profile.sessionCount}</StatusChip>
        <StatusChip tone="neutral">profile skills {profile.skillCount}</StatusChip>
      </div>
      <p>{profile.summary}</p>
      {profile.habits.length > 0 ? (
        <ul aria-label="Working profile habits">
          {profile.habits.map((habit) => (
            <li key={habit}>
              <span>{habit}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {profile.evidence.length > 0 ? (
        <div
          aria-label="Working profile evidence"
          className="skfiy-dashboard-personal-skill-evidence"
          role="list"
        >
          {profile.evidence.map((evidence) => (
            <span key={evidence} role="listitem">{evidence}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MemoryEvolutionTrail({
  entries
}: {
  entries: NonNullable<DashboardPersonalMemorySummary["memoryJournal"]>;
}) {
  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-memory-evolution">
      <h3>Memory evolution</h3>
      {entries.length > 0 ? (
        <ol aria-label="Memory evolution trail">
          {entries.map((entry) => (
            <li data-stage={entry.stage} key={`evolution-${entry.id}`}>
              <span>Turn {entry.turnId} · {entry.providerLabel} · {entry.stage}</span>
              <strong>{formatMemoryEvolutionAction(entry)}</strong>
              {entry.previousContent ? <em>from {entry.previousContent}</em> : null}
              <em>to {entry.content}</em>
              <small>learned after: {entry.userInput}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="skfiy-dashboard-empty">No memory evolution has been recorded yet.</p>
      )}
    </div>
  );
}

function formatMemoryEvolutionAction(
  entry: NonNullable<DashboardPersonalMemorySummary["memoryJournal"]>[number]
): string {
  const action = entry.action === "replace"
    ? "replace"
    : entry.action === "remove"
      ? "remove"
      : "add";
  return `${action} ${entry.target} memory`;
}

function MemoryJournalList({
  entries
}: {
  entries: NonNullable<DashboardPersonalMemorySummary["memoryJournal"]>;
}) {
  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-memory-journal">
      <h3>Memory journal</h3>
      {entries.length > 0 ? (
        <ul aria-label="Memory journal">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.providerLabel} · {entry.stage} · {formatMemoryJournalAction(entry)}</span>
              <small>{formatGeneratedAt(entry.createdAt)} · {entry.source}</small>
              <strong>{entry.content}</strong>
              {entry.previousContent ? <em>previous: {entry.previousContent}</em> : null}
              <small>learned from: {entry.userInput}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="skfiy-dashboard-empty">No learning receipts have been recorded yet.</p>
      )}
    </div>
  );
}

function formatMemoryJournalAction(
  entry: NonNullable<DashboardPersonalMemorySummary["memoryJournal"]>[number]
): string {
  const action = entry.action === "replace"
    ? "replace"
    : entry.action === "remove"
      ? "remove"
      : "add";
  return `${action} ${entry.target}`;
}

function PersonalSkillCardList({
  isSaving,
  mutedSkillIds,
  onMute,
  onUnmute,
  skills
}: {
  isSaving: boolean;
  mutedSkillIds: string[];
  onMute: (skill: DashboardPersonalSkillCard) => Promise<void>;
  onUnmute: (skillId: string) => Promise<void>;
  skills: DashboardPersonalSkillCard[];
}) {
  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-personal-skill-list">
      <h3>Personal skill cards</h3>
      {skills.length > 0 ? (
        <ul aria-label="Personal skill cards">
          {skills.map((skill) => (
            <li key={skill.id}>
              <span>{skill.kind} · evidence {skill.evidenceCount}</span>
              <strong>{skill.label}</strong>
              <small>{skill.promptHint}</small>
              <div
                aria-label={`Evidence for ${skill.label}`}
                className="skfiy-dashboard-personal-skill-evidence"
                role="list"
              >
                {skill.evidence.length > 0 ? skill.evidence.map((evidence) => (
                  <span key={evidence} role="listitem">{evidence}</span>
                )) : (
                  <span role="listitem">No retained evidence text.</span>
                )}
              </div>
              <button
                aria-label={`Mute personal skill: ${skill.label}`}
                className="skfiy-dashboard-icon-button"
                disabled={isSaving}
                onClick={() => void onMute(skill)}
                title="Mute personal skill"
                type="button"
              >
                <EyeOff size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="skfiy-dashboard-empty">No personal skills have been distilled yet.</p>
      )}
      {mutedSkillIds.length > 0 ? (
        <>
          <h4>Muted personal skills</h4>
          <ul aria-label="Muted personal skills">
            {mutedSkillIds.map((skillId) => (
              <li key={skillId}>
                <span>muted</span>
                <strong>{formatMutedPersonalSkillLabel(skillId)}</strong>
                <small>{skillId}</small>
                <button
                  aria-label={`Unmute personal skill: ${skillId}`}
                  className="skfiy-dashboard-icon-button"
                  disabled={isSaving}
                  onClick={() => void onUnmute(skillId)}
                  title="Unmute personal skill"
                  type="button"
                >
                  <Eye size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function formatMutedPersonalSkillLabel(skillId: string): string {
  return skillId.trim().replace(/-/gu, " ");
}

function PendingMemoryWriteList({
  isSaving,
  onApprove,
  onReject,
  writes
}: {
  isSaving: boolean;
  onApprove: (write: DashboardPendingPersonalMemoryWrite) => Promise<void>;
  onReject: (write: DashboardPendingPersonalMemoryWrite) => Promise<void>;
  writes: DashboardPendingPersonalMemoryWrite[];
}) {
  return (
    <div className="skfiy-dashboard-key-value-list skfiy-dashboard-pending-memory-list">
      <h3>Pending memory writes</h3>
      {writes.length > 0 ? (
        <ul aria-label="Pending memory writes">
          {writes.map((write) => (
            <li
              aria-label={`Pending memory revision: ${formatPendingMemoryActionLabel(write)}`}
              key={write.id}
            >
              <span className="skfiy-dashboard-pending-memory-meta">
                <span>{write.source}</span>
                <strong>{formatPendingMemoryActionLabel(write)}</strong>
              </span>
              <small>{formatGeneratedAt(write.createdAt)}</small>
              {write.previousContent ? (
                <div className="skfiy-dashboard-memory-revision">
                  <span>Previous</span>
                  <em>{write.previousContent}</em>
                  <span>Proposed</span>
                  <strong>{write.content}</strong>
                </div>
              ) : (
                <strong>{write.content}</strong>
              )}
              <div className="skfiy-dashboard-pending-memory-actions">
                <button
                  aria-label={`Approve pending memory: ${write.content}`}
                  className="skfiy-dashboard-icon-button"
                  disabled={isSaving}
                  onClick={() => void onApprove(write)}
                  title="Approve pending memory"
                  type="button"
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                </button>
                <button
                  aria-label={`Reject pending memory: ${write.content}`}
                  className="skfiy-dashboard-icon-button"
                  disabled={isSaving}
                  onClick={() => void onReject(write)}
                  title="Reject pending memory"
                  type="button"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="skfiy-dashboard-empty">No memory writes are waiting for review.</p>
      )}
    </div>
  );
}

function formatPendingMemoryActionLabel(write: DashboardPendingPersonalMemoryWrite): string {
  const action = write.action === "replace"
    ? "replace"
    : write.action === "remove"
      ? "remove"
      : "add";
  return `${action} ${write.target} memory`;
}

function RecentSessionRecallList({
  sessions,
  targetProviderLabel
}: {
  sessions: NonNullable<DashboardPersonalMemorySummary["recentSessions"]>;
  targetProviderLabel: string;
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
                <em>volatile session recall</em>
                <small className="skfiy-dashboard-session-recall-route">
                  recalls context -&gt; {targetProviderLabel}
                </small>
                {session.recallBasis ? (
                  <small className="skfiy-dashboard-session-recall-basis">
                    Recall basis: {session.recallBasis}
                  </small>
                ) : null}
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
        <ul aria-label={title}>
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

function PromptStackCard({ summary }: { summary: DashboardPromptStackSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>Background Agent context</Card.Description>
          <Card.Title>{summary.title}</Card.Title>
        </div>
        <Bot size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
          {summary.items.map((item) => (
            <StatusChip key={`${item.label}-${item.value}`} tone={item.tone}>
              {item.label} {item.value}
            </StatusChip>
          ))}
        </div>
        <ul className="skfiy-dashboard-evidence-list" aria-label="Prompt stack blocks">
          {summary.blocks.map((block) => (
            <li key={block.id}>
              <StatusChip tone={block.tone}>{block.value}</StatusChip>
              <strong>{block.label}</strong>
              <span>{block.detail}</span>
            </li>
          ))}
        </ul>
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
  const canOpenAccessPage = chromeControl.browserContextAccessSteps.some(
    (step) => step.id === "open-skfiy-chrome-popup"
  )
    && Boolean(chromeControl.extensionId)
    && Number.isInteger(chromeControl.tabId);
  const commandHints = useMemo(() => readChromeControlCommandHints(chromeControl), [chromeControl]);

  const launchAction = async (action: DashboardChromeControlActionRequest["action"]) => {
    const trimmedSelector = selector.trim();
    const trimmedText = text.trim();
    const targetTabId = Number.isInteger(chromeControl.tabId) ? chromeControl.tabId : undefined;
    const canLaunch = action === "open-popup" ? canOpenAccessPage : canRun;
    if (!canLaunch || !chromeControl.extensionId || targetTabId === undefined) {
      setFeedbackTone("warning");
      setFeedback(action === "open-popup"
        ? "Chrome access page is not available for the current tab."
        : chromeControl.actionUnavailableReason ?? "Chrome action controls are not ready.");
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
        {canOpenAccessPage ? (
          <button
            className="skfiy-dashboard-button button"
            disabled={busyAction !== null}
            onClick={() => void launchAction("open-popup")}
            type="button"
          >
            <ShieldCheck size={15} aria-hidden="true" />
            {busyAction === "open-popup" ? "Opening access page" : "Open access page"}
          </button>
        ) : null}
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
      {commandHints.length > 0 ? (
        <ul className="skfiy-dashboard-evidence-command-list" aria-label="Chrome control command hints">
          {commandHints.map((command) => (
            <li key={command.id}>
              <span>{command.label}</span>
              <code>{command.command}</code>
              <StatusChip tone={command.mutates ? "warning" : "neutral"}>
                {command.mutates ? "mutates" : "read-only"}
              </StatusChip>
            </li>
          ))}
        </ul>
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

function ChromeSetupGuidePanel({ setupGuide }: { setupGuide: DashboardChromeSetupGuideSummary }) {
  return (
    <div className="skfiy-dashboard-control-panel" aria-label="Chrome setup guide" role="region">
      <h4>Chrome setup guide</h4>
      <div className="skfiy-dashboard-key-value">
        <span>Source</span>
        <strong>{setupGuide.source}</strong>
        <span>Native host</span>
        <strong>{setupGuide.nativeHostState}</strong>
        <span>Live connection</span>
        <strong>{setupGuide.liveConnectionState}</strong>
      </div>
      {setupGuide.nextActions.length > 0 ? (
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Chrome setup next actions">
          {setupGuide.nextActions.map((action) => (
            <li key={action}>
              <span>next</span>
              <strong>{action}</strong>
              <small>action</small>
            </li>
          ))}
        </ul>
      ) : null}
      {setupGuide.commands.length > 0 ? (
        <ul className="skfiy-dashboard-evidence-command-list" aria-label="Chrome setup command hints">
          {setupGuide.commands.map((command) => (
            <li key={`${command.id}-${command.command}`}>
              <span>{command.label}</span>
              <code>{command.command}</code>
              <StatusChip tone={command.mutates ? "warning" : "neutral"}>
                {command.mutates ? "mutates" : "read-only"}
              </StatusChip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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

function EvidenceSummaryCard({
  error,
  isLoading,
  onLoad,
  summary
}: {
  error: string | null;
  isLoading: boolean;
  onLoad: () => Promise<void>;
  summary: DashboardEvidenceSummary | null;
}) {
  const tone = readEvidenceSummaryTone(summary?.status.state);

  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>Evidence summary</Card.Title>
          <Card.Description>Compact local readiness contract</Card.Description>
        </div>
        <Gauge size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">
          Readiness, plugin, and Chrome bridge lanes grouped for handoff review.
        </p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary ? tone : "neutral"}>
            summary {summary?.status.state ?? "not loaded"}
          </StatusChip>
          {summary ? (
            <>
              <StatusChip tone="neutral">lanes {summary.status.laneCount}</StatusChip>
              <StatusChip tone="success">ready {summary.status.readyLaneCount}</StatusChip>
              <StatusChip tone="warning">attention {summary.status.attentionLaneCount}</StatusChip>
              <StatusChip tone="danger">blocked {summary.status.blockedLaneCount}</StatusChip>
            </>
          ) : null}
        </div>
        <button
          className="skfiy-dashboard-button button"
          disabled={isLoading}
          onClick={() => void onLoad()}
          type="button"
        >
          <RefreshCw size={15} aria-hidden="true" />
          {isLoading ? "Loading summary" : "Load evidence summary"}
        </button>
        {summary ? (
          <ul
            aria-label="Evidence summary contract"
            className="skfiy-dashboard-evidence-detail-list"
          >
            <li>
              <span>endpoint</span>
              <strong>{summary.dashboard.endpoint}</strong>
            </li>
            <li>
              <span>token free</span>
              <strong>{summary.outputPolicy?.tokenFree ? "yes" : "unknown"}</strong>
            </li>
            <li>
              <span>source</span>
              <strong>{summary.outputPolicy?.source ?? "unknown"}</strong>
            </li>
          </ul>
        ) : null}
        {summary?.lanes.length ? (
          <ul className="skfiy-dashboard-evidence-list" aria-label="Evidence summary lanes">
            {summary.lanes.map((lane) => (
              <li key={lane.id}>
                <span>{lane.title}</span>
                <strong>{lane.state}</strong>
                <small>{lane.summary}</small>
                {lane.checks.length > 0 ? (
                  <ul
                    aria-label={`Checks for ${lane.title}`}
                    className="skfiy-dashboard-evidence-detail-list"
                  >
                    {lane.checks.map((check) => (
                      <li key={check.id}>
                        <span>{check.label}</span>
                        <strong>{formatEvidenceCheckValue(check.value, check.state)}</strong>
                        <small>{check.stale ? `${check.state} · stale` : check.state}</small>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {lane.nextActions.length > 0 ? (
                  <ul
                    aria-label={`Next actions for ${lane.title}`}
                    className="skfiy-dashboard-evidence-detail-list"
                  >
                    {lane.nextActions.map((action) => (
                      <li key={action}>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {lane.setupGuide ? (
                  <ul
                    aria-label={`Setup guide for ${lane.title}`}
                    className="skfiy-dashboard-evidence-detail-list"
                  >
                    <li>
                      <span>source</span>
                      <strong>{lane.setupGuide.source}</strong>
                    </li>
                    <li>
                      <span>native host</span>
                      <strong>{lane.setupGuide.nativeHostState}</strong>
                    </li>
                    <li>
                      <span>live connection</span>
                      <strong>{lane.setupGuide.liveConnectionState}</strong>
                    </li>
                  </ul>
                ) : null}
                {lane.commands?.length ? (
                  <ul
                    aria-label={`Commands for ${lane.title}`}
                    className="skfiy-dashboard-evidence-command-list"
                  >
                    {lane.commands.map((command) => (
                      <li key={`${command.id}-${command.command}`}>
                        <span>{command.label}</span>
                        <code>{command.command}</code>
                        <StatusChip tone={command.mutates ? "warning" : "neutral"}>
                          {command.mutates ? "mutates" : "read-only"}
                        </StatusChip>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="skfiy-dashboard-control-feedback" data-tone="danger" role="alert">
            {error}
          </p>
        ) : null}
      </Card.Content>
    </Card.Root>
  );
}

function formatEvidenceCheckValue(
  value: DashboardEvidenceSummary["lanes"][number]["checks"][number]["value"],
  fallback: string
): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value ?? fallback;
}

function readEvidenceSummaryTone(state: DashboardEvidenceSummary["status"]["state"] | undefined): Tone {
  if (state === "ready") {
    return "success";
  }
  if (state === "blocked") {
    return "danger";
  }
  if (state === "needs-evidence") {
    return "warning";
  }
  return "neutral";
}

function SmokeArtifactInventoryCard({
  summary
}: {
  summary: DashboardSmokeArtifactInventory;
}) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>Smoke evidence</Card.Description>
          <Card.Title>{summary.title}</Card.Title>
        </div>
        <FileSearch size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Smoke artifact inventory">
          {summary.items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function SmokeArtifactDetailsCard({
  details
}: {
  details: DashboardSmokeArtifactDetail[];
}) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>Smoke evidence</Card.Description>
          <Card.Title>Artifact probes</Card.Title>
        </div>
        <CheckCircle2 size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        {details.map((detail) => (
          <div key={detail.id} className="skfiy-dashboard-control-panel">
            <div className="skfiy-dashboard-inline-list">
              <StatusChip tone={detail.tone}>{detail.title}</StatusChip>
              <StatusChip tone={detail.tone}>{detail.value}</StatusChip>
            </div>
            <ul
              aria-label={`${detail.title} artifact details`}
              className="skfiy-dashboard-evidence-detail-list"
            >
              {detail.items.map((item) => (
                <li key={`${detail.id}-${item.label}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.tone}</small>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card.Content>
    </Card.Root>
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

function RouteOutcomeCard({ outcome }: { outcome: DashboardRouteOutcome }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>Route outcome</Card.Title>
          <Card.Description>{outcome.source}</Card.Description>
        </div>
        <ArrowRight size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">
          <strong>{outcome.title}</strong>
          <span> {outcome.detail}</span>
        </p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={outcome.tone}>{outcome.value}</StatusChip>
          <StatusChip tone="neutral">state {outcome.state}</StatusChip>
          <StatusChip tone="neutral">route {outcome.routeLabel}</StatusChip>
        </div>
      </Card.Content>
    </Card.Root>
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

function OperatorEvidenceCard({ summary }: { summary: DashboardOperatorEvidenceSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Read-only dashboard evidence payload</Card.Description>
        </div>
        <Eye size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Operator evidence details">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
        <div className="skfiy-dashboard-inline-list skfiy-dashboard-operator-actions" aria-label="Operator evidence actions">
          <a
            className="skfiy-dashboard-button button"
            href="/api/operator-evidence"
            rel="noreferrer"
            target="_blank"
          >
            <Eye size={14} aria-hidden="true" />
            Operator evidence JSON
          </a>
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function RuntimeSnapshotDetailsCard({ details }: { details: DashboardRuntimeSnapshotDetail[] }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>Runtime snapshots</Card.Title>
          <Card.Description>Current turn and replay freshness</Card.Description>
        </div>
        <History size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">
          Latest runtime snapshot details from the local operator state.
        </p>
        <ul className="skfiy-dashboard-evidence-list" aria-label="Runtime snapshot panels">
          {details.map((detail) => (
            <li key={detail.id}>
              <span>{detail.title}</span>
              <strong>{detail.value}</strong>
              <small>{detail.id}</small>
              <ul
                aria-label={`${detail.title} details`}
                className="skfiy-dashboard-evidence-detail-list"
              >
                {detail.items.map((item) => (
                  <li key={`${detail.id}-${item.label}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.tone}</small>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function ActivityFeedCard({ summary }: { summary: DashboardActivityFeedSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Recent actions and replay</Card.Description>
        </div>
        <MousePointerClick size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Activity feed details">
          {summary.items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function AlertGroupCard({ summary }: { summary: DashboardAlertGroupSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Grouped blocker areas</Card.Description>
        </div>
        <TriangleAlert size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        {summary.groups.length > 0 ? (
          <ul className="skfiy-dashboard-evidence-list" aria-label="Alert groups">
            {summary.groups.map((group) => (
              <li key={group.id}>
                <span>{group.title}</span>
                <strong>{group.value}</strong>
                <small>{group.tone}</small>
                <ul
                  aria-label={`${group.title} alerts`}
                  className="skfiy-dashboard-evidence-detail-list"
                >
                  {group.items.map((item) => (
                    <li key={`${group.id}-${item.label}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.tone}</small>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="skfiy-dashboard-empty">No dashboard alerts are active.</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function ApprovalQueueCard({ summary }: { summary: DashboardApprovalQueueSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Local approval queue</Card.Description>
        </div>
        <ShieldCheck size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        {summary.items.length > 0 ? (
          <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Approval queue details">
            {summary.items.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.tone}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="skfiy-dashboard-empty">No approval requests are waiting.</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function AgentSupervisionCard({ summary }: { summary: DashboardAgentSupervisionSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Read-only Background Agent supervision</Card.Description>
        </div>
        <Bot size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Agent supervision details">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}

function LongHorizonCard({ summary }: { summary: DashboardLongHorizonSummary }) {
  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-card--wide" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Title>{summary.title}</Card.Title>
          <Card.Description>Read-only money-run supervision</Card.Description>
        </div>
        <Activity size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <p className="skfiy-dashboard-message">{summary.detail}</p>
        <div className="skfiy-dashboard-inline-list">
          <StatusChip tone={summary.tone}>{summary.value}</StatusChip>
        </div>
        <ul className="skfiy-dashboard-evidence-detail-list" aria-label="Long-horizon supervision details">
          {summary.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.tone}</small>
            </li>
          ))}
        </ul>
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

function formatDashboardUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value.replace(/[?#].*$/u, "") || "unknown";
  }
}
