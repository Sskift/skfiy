import type { DashboardProviderSummary, DashboardSnapshot } from "./contracts";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface DashboardStatusItem {
  label: string;
  value: string;
  tone: Tone;
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

export interface DashboardNextAction {
  title: string;
  detail: string;
  tone: Tone;
  source: string;
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

export function readChromeControlState(snapshot: DashboardSnapshot): {
  label: string;
  host: string;
  tabId?: number;
  tone: Tone;
  capabilities: string[];
  capable: boolean;
  reason: string;
  nextAction?: string;
  contentScript?: string;
} {
  const pageControl = readRecord(readRecord(snapshot.runtimeHealth.extension)?.pageControl);
  const activeTab = readRecord(pageControl?.activeTab);
  const capabilities = readRecord(pageControl?.capabilities);
  const contentScript = readRecord(pageControl?.contentScript);
  const capabilityLabels = Object.entries(capabilities ?? {})
    .filter(([, value]) => value === true || typeof value === "string")
    .map(([key]) => key);
  const state = readString(pageControl?.state) ?? "unknown";
  const capable = typeof pageControl?.capable === "boolean"
    ? pageControl.capable
    : state === "ready";

  return {
    label: state,
    host: readString(activeTab?.host) ?? "No active ordinary page",
    tabId: readNumber(activeTab?.tabId),
    tone: state === "ready" && capable
      ? "success"
      : state === "unavailable" || state === "blocked"
        ? "danger"
        : "warning",
    capabilities: capabilityLabels,
    capable,
    reason: readString(pageControl?.reason) ?? "Browser control readiness has not reported a reason.",
    nextAction: readString(pageControl?.nextAction),
    contentScript: readString(contentScript?.state)
  };
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
    ]
  };
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
      mode: "local",
      label: "Local",
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
