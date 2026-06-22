import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Chrome,
  Gauge,
  History,
  Home,
  MonitorCog,
  MousePointer2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Chip, Skeleton } from "@heroui/react";
import { fetchDashboardSnapshot } from "./api";
import type { DashboardSnapshot } from "./contracts";
import {
  readAlertMessages,
  readChromeControlState,
  readComputerUseReadiness,
  readNextAction,
  readProviderSummaries,
  readReadinessSummary,
  readRecentActivity,
  readSnapshotState,
  type Tone
} from "./model";

export interface DashboardAppProps {
  loadSnapshot?: () => Promise<DashboardSnapshot>;
}

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "connections", label: "Connections", icon: Bot },
  { id: "browser", label: "Browser", icon: Chrome },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "next-action", label: "Next action", icon: ArrowRight }
] as const;

export function DashboardApp({
  loadSnapshot = fetchDashboardSnapshot
}: DashboardAppProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setSnapshot(await loadSnapshot());
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [loadSnapshot]);

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
          <DashboardContent snapshot={snapshot} />
        ) : (
          <DashboardLoading />
        )}
      </main>
    </div>
  );
}

function DashboardContent({ snapshot }: { snapshot: DashboardSnapshot }) {
  const stateItems = useMemo(() => readSnapshotState(snapshot), [snapshot]);
  const readiness = useMemo(() => readReadinessSummary(snapshot), [snapshot]);
  const chromeControl = useMemo(() => readChromeControlState(snapshot), [snapshot]);
  const computerUse = useMemo(() => readComputerUseReadiness(snapshot), [snapshot]);
  const providers = useMemo(() => readProviderSummaries(snapshot), [snapshot]);
  const activity = useMemo(() => readRecentActivity(snapshot), [snapshot]);
  const nextAction = useMemo(() => readNextAction(snapshot), [snapshot]);
  const alerts = useMemo(() => readAlertMessages(snapshot), [snapshot]);

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
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--three">
          {stateItems.map((item) => (
            <MetricCard key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section
        id="connections"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="connections-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Connection</span>
            <h2 id="connections-title">Agent connection</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
          {providers.map((provider) => (
            <ProviderCard key={`${provider.mode}-${provider.label}`} provider={provider} />
          ))}
        </div>
      </section>

      <section
        id="browser"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="browser-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Readiness</span>
            <h2 id="browser-title">Browser and computer readiness</h2>
          </div>
        </div>
        <div className="skfiy-dashboard-grid skfiy-dashboard-grid--two">
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
              <span>Target</span>
              <strong>{chromeControl.host}</strong>
              <span>Tab</span>
              <strong>{chromeControl.tabId ?? "unknown"}</strong>
              <span>Script</span>
              <strong>{chromeControl.contentScript ?? "unknown"}</strong>
            </div>
            <p className="skfiy-dashboard-muted-message">{chromeControl.reason}</p>
            <div className="skfiy-dashboard-inline-list">
              {chromeControl.capabilities.length > 0 ? (
                chromeControl.capabilities.map((capability) => (
                  <StatusChip key={capability} tone="success">{capability}</StatusChip>
                ))
              ) : (
                <StatusChip tone="neutral">no actions</StatusChip>
              )}
            </div>
          </Card.Content>
        </Card.Root>
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
        </div>
      </section>

      <section
        id="activity"
        className="skfiy-dashboard-section skfiy-dashboard-grid skfiy-dashboard-grid--main"
        aria-labelledby="activity-title"
      >
        <div className="skfiy-dashboard-section-heading">
          <div>
            <span>Activity</span>
            <h2 id="activity-title">Recent activity</h2>
          </div>
        </div>
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

function ProviderCard({
  provider
}: {
  provider: { label: string; mode: string; health: string; endpoint?: string; binaryPath?: string };
}) {
  const detail = provider.endpoint ?? provider.binaryPath ?? provider.mode;

  return (
    <Card.Root className="skfiy-dashboard-card skfiy-dashboard-provider-card" variant="secondary">
      <Card.Header className="skfiy-dashboard-card-header">
        <div>
          <Card.Description>{provider.mode}</Card.Description>
          <Card.Title>{provider.label}</Card.Title>
        </div>
        <Bot size={18} aria-hidden="true" />
      </Card.Header>
      <Card.Content className="skfiy-dashboard-card-content">
        <div className="skfiy-dashboard-provider-summary">
          <span>{detail}</span>
          <StatusChip tone={readHealthTone(provider.health)}>{provider.health}</StatusChip>
        </div>
      </Card.Content>
    </Card.Root>
  );
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
