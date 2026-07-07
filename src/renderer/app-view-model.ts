export type PermissionKey = "screenRecording" | "accessibility";
export type PermissionState = "granted" | "denied" | "not-determined" | "unknown";
export type DesktopSessionDiagnosticState = "controllable" | "blocked" | "unknown";
export type PermissionSettingsTarget = "screen-recording" | "accessibility";
export type TaskStatus =
  | "idle"
  | "planned"
  | "observing"
  | "executing"
  | "running"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "denied"
  | "blocked"
  | "failed"
  | "cancelled";
export type Tone = "success" | "warning" | "danger" | "neutral";
export type TurnTranscriptOutcome =
  | "completed"
  | "approval_required"
  | "verification_failed"
  | "denied"
  | "blocked"
  | "cancelled"
  | "failed"
  | "running";

export interface PermissionRow {
  key: PermissionKey;
  settingsTarget: PermissionSettingsTarget;
  label: string;
}

export const PERMISSION_ROWS: PermissionRow[] = [
  { key: "screenRecording", settingsTarget: "screen-recording", label: "屏幕录制" },
  { key: "accessibility", settingsTarget: "accessibility", label: "辅助功能" }
];

export const PERMISSION_STATE_COPY: Record<PermissionState, string> = {
  granted: "已授权",
  denied: "未授权",
  "not-determined": "待授权",
  unknown: "未知"
};

export const DESKTOP_SESSION_STATE_COPY: Record<DesktopSessionDiagnosticState, string> = {
  controllable: "可控",
  blocked: "不可控",
  unknown: "未知"
};

const BLOCKING_PERMISSION_STATES: readonly PermissionState[] = ["denied", "not-determined"];

export function readExternalCuaStatusLabel(settings: {
  externalEndpoint?: string;
  externalApiKeyConfigured: boolean;
}): string {
  const endpointConfigured = Boolean(settings.externalEndpoint?.trim());

  if (endpointConfigured && settings.externalApiKeyConfigured) {
    return "External CUA 已配置";
  }

  if (endpointConfigured) {
    return "External CUA 缺少 API Key";
  }

  if (settings.externalApiKeyConfigured) {
    return "External CUA 缺少 Endpoint";
  }

  return "External CUA 未配置";
}

export function readAssistantAgentReadinessLabel(
  readiness: "ready" | "unconfigured" | "unavailable"
): string {
  if (readiness === "ready") {
    return "ready";
  }
  if (readiness === "unconfigured") {
    return "unconfigured";
  }

  return "unavailable";
}

export function readAssistantAgentProviderDetail(
  response: { settings: { cwd: string; timeoutMs: number } },
  provider: {
    label: string;
    executablePath?: string;
    readiness: "ready" | "unconfigured" | "unavailable";
  }
): string {
  const executable = provider.executablePath ?? "not configured";
  return [
    `${provider.label} · ${readAssistantAgentReadinessLabel(provider.readiness)}`,
    `binary ${executable}`,
    `cwd ${response.settings.cwd || "default"}`,
    `timeout ${Math.round(response.settings.timeoutMs / 1000)}s`
  ].join(" · ");
}

export function readSelectedAssistantAgentProvider<TProvider extends {
  id: string;
  selected?: boolean;
}>(
  providers: TProvider[],
  mode: string,
  fallbackProvider: TProvider
): TProvider {
  return providers.find((provider) => provider.selected)
    ?? providers.find((provider) => provider.id === mode)
    ?? fallbackProvider;
}

export function formatFinderPreviewMove(
  move: { from: string; to: string },
  rootPath: string
): string {
  return `${readPathPreview(move.from, rootPath)} -> ${readPathPreview(move.to, rootPath)}`;
}

export function readPathPreview(filePath: string, rootPath: string): string {
  const normalizedRoot = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
  return filePath.startsWith(normalizedRoot)
    ? filePath.slice(normalizedRoot.length)
    : filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

export function readMissingPermissionRows(
  permissions: Record<PermissionKey, { state: PermissionState }>
): PermissionRow[] {
  return PERMISSION_ROWS.filter((permission) =>
    BLOCKING_PERMISSION_STATES.includes(permissions[permission.key].state)
  );
}

export function readDesktopSessionPermissionState(
  diagnostics: { state: DesktopSessionDiagnosticState }
): PermissionState {
  if (diagnostics.state === "controllable") {
    return "granted";
  }

  if (diagnostics.state === "blocked") {
    return "denied";
  }

  return "unknown";
}

export function readVisiblePetRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

export function canStopTurn(status: TaskStatus): boolean {
  return (
    status === "planned"
    || status === "running"
    || status === "observing"
    || status === "executing"
    || status === "approval_required"
    || status === "needs_confirmation"
  );
}

export function canDismissTaskBubble(status: TaskStatus): boolean {
  return (
    status === "completed"
    || status === "denied"
    || status === "blocked"
    || status === "failed"
    || status === "cancelled"
  );
}

export function getDashboardStatusCopy(task: {
  status: TaskStatus;
  message: string;
}): { label: string; detail: string; tone: Tone } {
  switch (task.status) {
    case "planned":
      return { label: "任务已规划", detail: task.message, tone: "warning" };
    case "observing":
      return { label: "正在观察桌面", detail: task.message, tone: "warning" };
    case "executing":
    case "running":
      return { label: "正在执行任务", detail: task.message, tone: "warning" };
    case "approval_required":
      return { label: "等待审批", detail: task.message, tone: "warning" };
    case "needs_confirmation":
      return { label: "需要人工确认", detail: task.message, tone: "warning" };
    case "completed":
      return { label: "任务已完成", detail: task.message, tone: "success" };
    case "denied":
      return { label: "请求已拒绝", detail: task.message, tone: "neutral" };
    case "blocked":
      return { label: "环境阻塞", detail: task.message, tone: "danger" };
    case "failed":
      return { label: "任务失败", detail: task.message, tone: "danger" };
    case "cancelled":
      return { label: "任务已停止", detail: task.message, tone: "neutral" };
    case "idle":
    default:
      return { label: "待命中", detail: task.message, tone: "neutral" };
  }
}

export function getRiskCopy(risk?: {
  level: "low" | "medium" | "high" | "blocked";
  reason: string;
  requiresApproval: boolean;
}): { label: string; detail: string; tone: Tone } {
  if (!risk) {
    return {
      label: "未评估风险",
      detail: "下一次执行前会重新检查权限和动作风险",
      tone: "neutral"
    };
  }

  if (risk.level === "blocked") {
    return { label: "已阻止", detail: risk.reason, tone: "danger" };
  }

  if (risk.level === "high") {
    return { label: "高风险", detail: risk.reason, tone: "danger" };
  }

  if (risk.level === "medium") {
    return {
      label: risk.requiresApproval ? "中风险，需要审批" : "中风险",
      detail: risk.reason,
      tone: "warning"
    };
  }

  return { label: "低风险", detail: risk.reason, tone: "success" };
}

export function getPermissionHealthCopy(
  permissions: Record<PermissionKey, { state: PermissionState }>,
  diagnostics: { state: DesktopSessionDiagnosticState; reason: string }
): { label: string; detail: string; tone: Tone } {
  if (diagnostics.state === "blocked") {
    return {
      label: "桌面暂不可控",
      detail: diagnostics.reason,
      tone: "danger"
    };
  }

  const missingRows = readMissingPermissionRows(permissions);
  if (missingRows.length > 0) {
    return {
      label: `${missingRows.length} 项授权待处理`,
      detail: missingRows.map((row) => row.label).join("、"),
      tone: "warning"
    };
  }

  if (diagnostics.state === "controllable") {
    return {
      label: "授权已就绪",
      detail: "桌面会话可控",
      tone: "success"
    };
  }

  return {
    label: "授权待检查",
    detail: "刷新后确认屏幕录制和辅助功能状态",
    tone: "neutral"
  };
}

export function getPolicySummary(settings: {
  apps: Array<{ policy: "allow" | "ask" | "deny" }>;
}): string {
  const askCount = settings.apps.filter((entry) => entry.policy === "ask").length;
  const denyCount = settings.apps.filter((entry) => entry.policy === "deny").length;

  if (denyCount > 0) {
    return `${denyCount} 个应用已阻止，${askCount} 个应用执行前询问`;
  }

  if (askCount > 0) {
    return `${askCount} 个应用执行前询问`;
  }

  return "常用应用已允许";
}

export function getRecentExecutionCopy(replay: {
  transcript: {
    outcome: TurnTranscriptOutcome;
    command?: string;
  };
} | null): { label: string; detail: string; tone: Tone } {
  const transcript = replay?.transcript;
  if (!transcript) {
    return {
      label: "暂无最近执行",
      detail: "完成一次任务后会显示摘要",
      tone: "neutral"
    };
  }

  const outcomeCopy: Record<TurnTranscriptOutcome, string> = {
    completed: "已完成",
    approval_required: "等待审批",
    verification_failed: "需要确认",
    denied: "已拒绝",
    blocked: "环境阻塞",
    cancelled: "已停止",
    failed: "失败",
    running: "进行中"
  };
  const tone =
    transcript.outcome === "completed"
      ? "success"
      : transcript.outcome === "failed"
        || transcript.outcome === "verification_failed"
        || transcript.outcome === "blocked"
        ? "danger"
        : transcript.outcome === "denied" || transcript.outcome === "cancelled"
          ? "neutral"
          : "warning";

  return {
    label: outcomeCopy[transcript.outcome],
    detail: transcript.command ?? "最近任务未记录命令",
    tone
  };
}

export function getPanelVisibilityState({
  assistantPanelOpen,
  detailsOpen,
  hasStartupWarning,
  permissionOnboardingOpen,
  taskStatus
}: {
  assistantPanelOpen: boolean;
  detailsOpen: boolean;
  hasStartupWarning: boolean;
  permissionOnboardingOpen: boolean;
  taskStatus: TaskStatus;
}): {
  bubbleAriaLabel: string;
  settingsBubble: boolean;
  showPanel: boolean;
  showStartupWarning: boolean;
} {
  const showStartupWarning = hasStartupWarning
    && !detailsOpen
    && !permissionOnboardingOpen
    && taskStatus === "idle";
  const showPanel =
    assistantPanelOpen
    || detailsOpen
    || permissionOnboardingOpen
    || taskStatus !== "idle"
    || showStartupWarning;
  const bubbleAriaLabel = detailsOpen
    ? "skfiy settings"
    : permissionOnboardingOpen
      ? "权限引导"
      : assistantPanelOpen
        ? "skfiy assistant panel"
        : "skfiy task status";

  return {
    bubbleAriaLabel,
    settingsBubble: detailsOpen || permissionOnboardingOpen,
    showPanel,
    showStartupWarning
  };
}

export function getReplayAccessibilityLabel(record: { accessibilityTrusted?: boolean }): string {
  if (record.accessibilityTrusted === true) {
    return "AX ok";
  }

  if (record.accessibilityTrusted === false) {
    return "AX denied";
  }

  return "AX unknown";
}

export function getReplayOcrLabel(record: { ocrLabels?: unknown[] }): string | null {
  if (!record.ocrLabels) {
    return null;
  }

  return `OCR ${record.ocrLabels.length}`;
}

export function formatReplayPlanner(planner: {
  providerLabel: string;
  command: string;
  rationale?: string;
}): string {
  return `${planner.providerLabel}: ${planner.command}`
    + (planner.rationale ? ` (${planner.rationale})` : "");
}

export function formatReplayAction(action: {
  type: string;
  appName?: string;
  bundleId?: string;
  text?: string;
  key?: string;
  action?: string;
  actionType?: string;
  status?: string;
  stage?: string;
  message?: string;
  reason?: string;
  providerLabel?: string;
  command?: string;
}): string {
  if (action.type === "plan") {
    return `${action.type}: ${action.providerLabel ?? ""} ${action.command ?? ""}`.trim();
  }

  if (action.type === "type_text") {
    return `${action.type}: ${action.text ?? ""}`;
  }

  if (action.type === "press_key") {
    return `${action.type}: ${action.key ?? ""}`;
  }

  if (action.type === "activate_app" || action.type === "open_session") {
    return `${action.type}: ${action.appName ?? action.bundleId ?? ""}`;
  }

  if (action.type === "recover") {
    return `${action.type}: ${action.action ?? ""} ${action.stage ?? ""}`.trim();
  }

  if (action.type === "verify") {
    const detail = action.reason ?? action.message ?? "";
    return `${action.type}: ${action.actionType ?? ""} ${action.status ?? ""} ${detail}`.trim();
  }

  return action.type;
}
