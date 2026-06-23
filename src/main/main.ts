import { app, BrowserWindow, globalShortcut, ipcMain, screen, systemPreferences } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import {
  createTurnReplayStore,
  type TurnReplay,
  type TurnReplayTaskEvent
} from "./computer-use/turn-replay-store.js";
import type {
  DesktopActionResult,
  DesktopAppState,
  FinderSelectionResult,
  PermissionState,
  PermissionSummary,
  PermissionSettingsTarget
} from "./computer-use/types.js";
import type { TmuxSupervisionReport } from "./computer-use/tmux-supervisor.js";
import {
  createAppPolicySettingsStore,
  decideAppPolicy,
  readInitialAppPolicySettings
} from "./app-policy-settings.js";
import {
  AssistantAgentTurnRuntimeError,
  readAssistantAgentProviderStates,
  runAssistantAgentTurn,
  type AssistantAgentPlannedToolCall,
  type AssistantAgentTurnResult
} from "./assistant-agent.js";
import {
  createAssistantAgentSettingsStore,
  readInitialAssistantAgentSettingsFromConfig
} from "./assistant-agent-settings.js";
import {
  createPersonalMemoryStore,
  createSkfiyApplicationSupportPath
} from "./personal-memory.js";
import {
  createFallbackPersonalMemoryOperations,
  createPersonalMemoryReviewPrompt,
  parsePersonalMemoryReview
} from "./personal-memory-review.js";
import { createSessionMemoryStore } from "./session-memory.js";
import { summarizeAssistantToolPlan } from "./assistant-tools.js";
import {
  createBrowserPageContextFromConnection,
  type BrowserPageContext
} from "./browser-page-context.js";
import {
  createAssistantComputerUseExecutor,
  type AssistantComputerUseTerminalStatus,
  type AssistantComputerUseToolIdentity,
  type AssistantComputerUseToolResult
} from "./assistant-computer-use-executor.js";
import { applyApprovedChromeTaskHostPolicy } from "./chrome-approval-policy.js";
import { createChromeCdpClient } from "./chrome-cdp-client.js";
import { readChromeCdpEndpoint } from "./chrome-cdp-settings.js";
import { readChromeExtensionConnectionStatus } from "./chrome-native-host.js";
import { createTmuxSupervisionClient } from "./tmux-supervision-client.js";
import {
  createPlannerProviderSettingsStore,
  readInitialPlannerProviderSettings
} from "./planner-provider-settings.js";
import { decidePlannerProviderRuntime } from "./planner-provider-runtime.js";
import { resolvePlannerCommand } from "./planner-command.js";
import { createExternalCuaTerminalPlannerFromEnv } from "./external-cua-planner.js";
import { readDesktopSessionDiagnosticsForRenderer } from "./desktop-session-diagnostics.js";
import { resolveHelperPath as resolveDesktopHelperPath } from "./helper-path.js";
import {
  runChromePageTask,
  type ChromeDesktopClient,
  type ChromeTaskEvent
} from "./orchestrator/chrome-task.js";
import type { GhosttyTaskEvent } from "./orchestrator/events.js";
import {
  runFinderOrganizationTask,
  type FinderDesktopClient,
  type FinderPlanPreview,
  type FinderTaskEvent
} from "./orchestrator/finder-task.js";
import { runGhosttyCommandTask, type DesktopClient } from "./orchestrator/ghostty-task.js";
import {
  runTmuxSupervisionTask,
  type TmuxSupervisionTaskEvent
} from "./orchestrator/tmux-supervision-task.js";
import {
  readPermissionDiagnosticsForRenderer,
  readPermissionsForRenderer
} from "./permissions.js";
import { selectCommandRoute, type CommandRoute, type ExecutableCommandRoute } from "./task-routing.js";
import { readStartupWarnings } from "./startup-guard.js";
import {
  readStopTurnHotkeyStatus,
  registerStopTurnHotkey,
  STOP_TURN_ACCELERATOR
} from "./stop-turn-hotkey.js";
import {
  calculatePetWindowOffsetForMode,
  calculatePetWindowBounds,
  movePetAnchorByDelta,
  readWindowPositionOverride,
  resizePetWindowBoundsKeepingBottom,
  resizePetWindowBoundsKeepingPetAnchor,
  type PetWindowBounds,
  type Point,
  type Size
} from "./window-position.js";
import {
  writeRuntimeSnapshot,
  writeRuntimeTurnMarker,
  type RuntimeSnapshotCurrentTurnInput
} from "./runtime-snapshot.js";
import { readDefaultLocalOriginPetSkin } from "./pet-skin.js";
import { readDefaultApprovalBypass } from "./approval-bypass.js";

type ManualMode = "active" | "quiet";
type TaskStatus =
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
type PetWindowMode = "compact" | "expanded";
type ComputerUseTaskEvent =
  | GhosttyTaskEvent
  | ChromeTaskEvent
  | FinderTaskEvent
  | TmuxSupervisionTaskEvent;
type ComputerUseCommandRoute = ExecutableCommandRoute;

interface TaskEvent {
  status: TaskStatus;
  message?: string;
  command?: string;
  replayReset?: boolean;
  replayRecord?: ObserveAppReplayRecord;
  finderSelection?: FinderSelectionResult;
  finderPlanPreview?: FinderPlanPreview;
  tmuxSupervisionReport?: TmuxSupervisionReport;
}

interface PendingApproval extends AssistantComputerUseToolIdentity {
  command: string;
  mode: ManualMode;
  route: ComputerUseCommandRoute;
  planApproved?: boolean;
}

interface ObserveAppReplayRecord extends DesktopAppState {
  stage: "before" | "after";
}

interface VisiblePetRect extends Point, Size {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.SKFIY_DEV_SERVER_URL;
app.setName("skfiy");
const COMPACT_WINDOW_SIZE: Size = { width: 90, height: 66 };
const EXPANDED_WINDOW_SIZE: Size = { width: 320, height: 500 };
const PERSONAL_MEMORY_REVIEW_TIMEOUT_MS = 15_000;
const skfiyAppSupportDir = createSkfiyApplicationSupportPath(os.homedir());
const appPolicySettingsStore = createAppPolicySettingsStore(readInitialAppPolicySettings());
const chromeCdpEndpoint = readChromeCdpEndpoint({
  argv: process.argv,
  env: process.env
});
const plannerProviderSettingsStore = createPlannerProviderSettingsStore(
  readInitialPlannerProviderSettings(process.env)
);
const assistantAgentSettingsStore = createAssistantAgentSettingsStore(
  readInitialAssistantAgentSettingsFromConfig(process.env, { cwd: process.cwd() })
);
const personalMemoryStore = createPersonalMemoryStore({
  baseDir: skfiyAppSupportDir
});
const sessionMemoryStore = createSessionMemoryStore({
  baseDir: skfiyAppSupportDir
});
const turnReplayStore = createTurnReplayStore({
  onReplayChanged: (replay) => {
    persistRuntimeSnapshot(replay);
  }
});
const assistantComputerUseExecutor = createAssistantComputerUseExecutor({
  replayStore: turnReplayStore
});
let mainWindow: BrowserWindow | null = null;
let currentPetAnchor: Point | null = null;
let currentPetSize: Size | null = null;
let currentTaskId = 0;
let screenshotSerial = 0;
let activeTaskController: AbortController | null = null;
let activeComputerUseToolIdentity: AssistantComputerUseToolIdentity | null = null;
let pendingApproval: PendingApproval | null = null;
let stopTurnHotkeyRegistered = false;

function persistRuntimeSnapshot(
  replay: TurnReplay | null,
  currentTurn?: RuntimeSnapshotCurrentTurnInput
): void {
  const homeDir = os.homedir();

  void (async () => {
    await writeRuntimeSnapshot({
      homeDir,
      replay,
      currentTurn
    });

    if (currentTurn) {
      await writeRuntimeTurnMarker({
        homeDir,
        currentTurn
      });
    }
  })().catch(() => {
    // Dashboard runtime evidence is best-effort and must not block Computer Use turns.
  });
}

function emitTaskEvent(window: BrowserWindow | null, event: TaskEvent) {
  persistRuntimeSnapshot(turnReplayStore.getReplay(), event);

  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:task-event", event);
}

function emitTurnReplayTaskEvent(window: BrowserWindow | null, event: TaskEvent): void {
  turnReplayStore.recordTaskEvent(readTurnReplayTaskEvent(event));
  emitTaskEvent(window, event);
}

function resolveHelperPath(): string {
  return resolveDesktopHelperPath({
    env: process.env,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  });
}

function createScreenshotPath(scope: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  screenshotSerial += 1;
  return path.join(os.tmpdir(), "skfiy", `${scope}-${timestamp}-${screenshotSerial}.png`);
}

function createGhosttyDesktopClient(helper: DesktopHelperClient): DesktopClient {
  return {
    getPermissions: async () => helper.getPermissions(),
    listApps: async () => helper.listApps(),
    ocrImage: async (inputPath) => helper.ocrImage(inputPath),
    executeAction: async (action) => {
      const result = await helper.executeAction(action);
      assertDesktopActionResult(result, action.type);
      return result;
    }
  };
}

function createFinderDesktopClient(helper: DesktopHelperClient): FinderDesktopClient {
  return {
    executeAction: async (action) => helper.executeAction(action),
    getFinderSelection: async () => helper.getFinderSelection(),
    getFinderItemLayout: async (folderPath, itemNames) =>
      helper.getFinderItemLayout(folderPath, itemNames)
  };
}

function createChromeDesktopClient(helper: DesktopHelperClient): ChromeDesktopClient {
  return {
    executeAction: async (action) => helper.executeAction(action)
  };
}

function assertDesktopActionResult(result: DesktopActionResult, label: string): void {
  if ("ok" in result && !result.ok) {
    throw new Error(result.message ?? `Desktop helper could not ${label}.`);
  }
}

function createTaskEvent(event: ComputerUseTaskEvent, mode: ManualMode): TaskEvent {
  const prefix = mode === "quiet" ? "Quiet mode: " : "";

  switch (event.type) {
    case "started":
      return {
        status: "executing",
        message: `${prefix}Risk ${event.risk.level}: ${event.risk.reason}`,
        replayReset: true
      };
    case "approval_required":
      return {
        status: "approval_required",
        message: `Approval required (${event.risk.level}): ${event.risk.reason}`,
        command: "command" in event ? event.command : `监督 tmux ${event.sessionName}`
      };
    case "observing":
      return {
        status: "observing",
        message: `${prefix}${event.message}`
      };
    case "locating_app":
      return {
        status: "observing",
        message: `${prefix}Finding ${event.appName}.`
      };
    case "session_opened":
      return {
        status: "observing",
        message: `${prefix}Opened ${event.appName} session: ${event.title}.`
      };
    case "app_activated":
      return {
        status: "executing",
        message: `${prefix}Activated ${event.appName}.`
      };
    case "fallback_switch":
      return {
        status: "executing",
        message: `${prefix}Switching Chrome control from ${formatControlChannel(event.from)} to ${event.to} (${event.stage}): ${event.reason}`
      };
    case "session_initialized":
      return {
        status: "executing",
        message: `${prefix}Initialized Ghostty session marker: ${event.title}.`
      };
    case "action_verified":
      return {
        status: event.status === "passed" ? "executing" : "needs_confirmation",
        message: event.status === "passed"
          ? `${prefix}Verified ${event.actionType}: ${event.message ?? "passed."}`
          : `${prefix}Verification needs confirmation for ${event.actionType}: ${event.reason ?? event.status}`
      };
    case "verification_failed":
      if (event.stage === "permissions") {
        return {
          status: "failed",
          message: `${prefix}${event.reason}`
        };
      }

      return {
        status: "needs_confirmation",
        message: `${prefix}Verification failed (${event.stage}): ${event.reason}`
      };
    case "recovery_attempted":
      return {
        status: "executing",
        message: `${prefix}Recovering ${event.stage} observation with ${event.action}: ${event.reason}`
      };
    case "screenshot_before":
      return {
        status: "observing",
        message: `${prefix}Captured before screenshot: ${event.path}`,
        replayRecord: createObserveAppReplayRecord("before", event.observation)
      };
    case "finder_selection_observed":
      return {
        status: "observing",
        message: `${prefix}Observed Finder selection: ${formatFinderSelectionSummary(event.context)}`,
        finderSelection: event.context
      };
    case "plan_preview":
      return {
        status: "executing",
        message: `${prefix}Finder plan preview: ${event.preview.createFolders.length} folders, ${event.preview.moveFiles.length} moves, ${event.preview.destructiveOperationCount} destructive operations.`,
        finderPlanPreview: event.preview
      };
    case "plan_confirmation_required":
      return {
        status: "approval_required",
        message: `${prefix}Finder plan confirmation required: ${event.reason}`,
        command: event.command,
        finderPlanPreview: event.preview
      };
    case "typing":
      return {
        status: "executing",
        message: `${prefix}Typing command in Ghostty.`
      };
    case "submitted":
      return {
        status: "executing",
        message: `${prefix}Submitted command with ${event.key}.`
      };
    case "screenshot_after":
      return {
        status: "observing",
        message: `${prefix}Captured after screenshot: ${event.path}`,
        replayRecord: createObserveAppReplayRecord("after", event.observation)
      };
    case "completed":
      return {
        status: "completed",
        message: event.summary,
        ...("report" in event ? { tmuxSupervisionReport: event.report } : {})
      };
  }

  return {
    status: "failed",
    message: "Unknown task event."
  };
}

function formatFinderSelectionSummary(context: FinderSelectionResult): string {
  const target = context.targetPath ?? "unknown folder";
  const count = context.selection.length;
  return `${count} selected item${count === 1 ? "" : "s"} in ${target}.`;
}

function formatControlChannel(channel: string): string {
  return channel.toLowerCase() === "cdp" ? "CDP" : channel;
}

function createObserveAppReplayRecord(
  stage: "before" | "after",
  observation: DesktopAppState
): ObserveAppReplayRecord {
  return {
    ...observation,
    stage
  };
}

function createDesktopHelper(): DesktopHelperClient {
  return new DesktopHelperClient({
    helperPath: resolveHelperPath()
  });
}

function readMode(value: unknown): ManualMode {
  return value === "quiet" || value === "active" ? value : "active";
}

function readPetWindowMode(value: unknown): PetWindowMode | undefined {
  return value === "compact" || value === "expanded" ? value : undefined;
}

function readTurnReplayTaskEvent(event: TaskEvent): TurnReplayTaskEvent {
  return {
    status: event.status,
    message: event.message,
    command: event.command
  };
}

function readPermissionSettingsTarget(value: unknown): PermissionSettingsTarget | undefined {
  return value === "screen-recording"
    || value === "accessibility"
    ? value
    : undefined;
}

function readAppProcessPermissions(): PermissionSummary {
  return {
    screenRecording: {
      state: readElectronMediaPermissionState(systemPreferences.getMediaAccessStatus("screen"))
    },
    accessibility: {
      state: systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "denied"
    }
  };
}

function readElectronMediaPermissionState(
  state: "not-determined" | "granted" | "denied" | "restricted" | "unknown"
): PermissionState {
  if (state === "restricted") {
    return "denied";
  }

  return state;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readVisiblePetRect(value: unknown): VisiblePetRect | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const rect = value as Partial<VisiblePetRect>;
  const x = readFiniteNumber(rect.x);
  const y = readFiniteNumber(rect.y);
  const width = readFiniteNumber(rect.width);
  const height = readFiniteNumber(rect.height);

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return { x, y, width, height };
}

function clampWindowBoundsToNearestDisplay(bounds: PetWindowBounds): PetWindowBounds {
  const display = screen.getDisplayNearestPoint({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  });
  const displayBounds = display.bounds;

  return {
    ...bounds,
    x: Math.round(clampNumber(bounds.x, displayBounds.x, displayBounds.x + displayBounds.width - bounds.width)),
    y: Math.round(clampNumber(bounds.y, displayBounds.y, displayBounds.y + displayBounds.height - bounds.height))
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

async function readLatestBrowserPageContext(): Promise<BrowserPageContext> {
  try {
    const connection = await readChromeExtensionConnectionStatus({ homeDir: os.homedir() });
    return createBrowserPageContextFromConnection(connection);
  } catch (error) {
    return createBrowserPageContextFromConnection({
      state: "unavailable",
      reason: error instanceof Error
        ? error.message
        : "Chrome extension diagnostics could not be read.",
      nextAction: "Pet chat will continue without Browser Context."
    });
  }
}

async function createAssistantAgentTaskTurn(input: string): Promise<AssistantAgentTurnResult> {
  const browserPageContext = await readLatestBrowserPageContext();
  const personalMemory = personalMemoryStore.read();

  try {
    const turn = await runAssistantAgentTurn(input, {
      settings: assistantAgentSettingsStore.get(),
      browserPageContext,
      personalMemory
    });
    if (turn.status === "completed") {
      schedulePersonalMemoryPostTurnReview(input, turn, browserPageContext);
    }
    return turn;
  } catch (error) {
    if (error instanceof AssistantAgentTurnRuntimeError) {
      return error.turn;
    }

    throw error;
  }
}

function schedulePersonalMemoryPostTurnReview(
  userInput: string,
  turn: AssistantAgentTurnResult,
  browserPageContext: BrowserPageContext
): void {
  try {
    sessionMemoryStore.append({
      turnId: turn.id,
      createdAt: turn.createdAt,
      userInput,
      assistantReply: turn.message,
      providerLabel: turn.providerLabel,
      ...((browserPageContext.url || browserPageContext.title) ? {
        browserContext: {
          ...(browserPageContext.url ? { url: browserPageContext.url } : {}),
          ...(browserPageContext.title ? { title: browserPageContext.title } : {})
        }
      } : {})
    });
  } catch {
    // Personalization is best-effort and must not interrupt the visible reply.
  }

  const existingMemory = personalMemoryStore.read();
  const reviewPrompt = createPersonalMemoryReviewPrompt({
    userInput,
    assistantReply: turn.message,
    existingMemory
  });
  const settings = assistantAgentSettingsStore.get();

  const applyFallbackMemory = () => {
    personalMemoryStore.applyOperations(createFallbackPersonalMemoryOperations({
      userInput,
      assistantReply: turn.message,
      existingMemory
    }));
  };

  void runAssistantAgentTurn(reviewPrompt, {
    settings: {
      ...settings,
      timeoutMs: Math.min(settings.timeoutMs, PERSONAL_MEMORY_REVIEW_TIMEOUT_MS)
    },
    personalMemory: existingMemory
  }).then((reviewTurn) => {
    if (reviewTurn.status !== "completed") {
      applyFallbackMemory();
      return;
    }
    const operations = parsePersonalMemoryReview(reviewTurn.message);
    if (operations.length > 0) {
      personalMemoryStore.applyOperations(operations);
      return;
    }
    applyFallbackMemory();
  }).catch(() => {
    applyFallbackMemory();
    // Memory review is intentionally best-effort.
  });
}

function createAssistantAgentTaskMessage(turn: AssistantAgentTurnResult): string {
  if (turn.status === "completed") {
    return `${turn.providerLabel}: ${turn.message}`;
  }

  return `Assistant agent failed: ${turn.error?.message ?? "unknown error"}`;
}

function emitAssistantToolPlanTaskEvent(
  window: BrowserWindow | null,
  turn: AssistantAgentTurnResult,
  command: string
): void {
  const summary = summarizeAssistantToolPlan(turn);
  if (!summary) {
    return;
  }

  emitTurnReplayTaskEvent(window, {
    status: "observing",
    message: summary.message,
    command
  });
}

function readAssistantComputerUseToolCall(turn: AssistantAgentTurnResult): AssistantAgentPlannedToolCall {
  const toolCall = turn.toolCalls.find((candidate) =>
    candidate.type === "computer-use" && candidate.name === "desktop-control"
  );
  if (!toolCall) {
    throw new Error(`Assistant turn ${turn.id} did not plan a Computer Use tool call.`);
  }

  return toolCall;
}

function createPendingApproval(
  command: string,
  mode: ManualMode,
  identity: AssistantComputerUseToolIdentity,
  route: ComputerUseCommandRoute,
  planApproved = false
): PendingApproval {
  return {
    ...identity,
    command,
    mode,
    route,
    ...(planApproved ? { planApproved } : {})
  };
}

function requireComputerUseApproval({
  command,
  mode,
  route,
  toolIdentity,
  reason,
  planApproved = false
}: {
  command: string;
  mode: ManualMode;
  route: ComputerUseCommandRoute;
  toolIdentity: AssistantComputerUseToolIdentity;
  reason: string;
  planApproved?: boolean;
}): void {
  assistantComputerUseExecutor.requireApproval({
    ...toolIdentity,
    reason
  });
  pendingApproval = createPendingApproval(command, mode, toolIdentity, route, planApproved);
  activeComputerUseToolIdentity = toolIdentity;
}

function completeComputerUseToolCall(
  identity: AssistantComputerUseToolIdentity,
  result: AssistantComputerUseToolResult
): void {
  assistantComputerUseExecutor.completeToolCall({
    ...identity,
    result
  });
  if (isSameComputerUseToolIdentity(activeComputerUseToolIdentity, identity)) {
    activeComputerUseToolIdentity = null;
  }
  if (
    pendingApproval
    && pendingApproval.turnId === identity.turnId
    && pendingApproval.toolCallId === identity.toolCallId
  ) {
    pendingApproval = null;
  }

}

function cancelActiveComputerUseToolCall(reason: string): void {
  const identity = pendingApproval ?? activeComputerUseToolIdentity;
  if (!identity) {
    return;
  }

  assistantComputerUseExecutor.cancelToolCall({
    turnId: identity.turnId,
    toolCallId: identity.toolCallId,
    reason
  });
  pendingApproval = null;
  if (isSameComputerUseToolIdentity(activeComputerUseToolIdentity, identity)) {
    activeComputerUseToolIdentity = null;
  }
}

function isSameComputerUseToolIdentity(
  left: AssistantComputerUseToolIdentity | null,
  right: AssistantComputerUseToolIdentity
): boolean {
  return Boolean(left && left.turnId === right.turnId && left.toolCallId === right.toolCallId);
}

function createToolResultFromTaskEvent(event: ComputerUseTaskEvent): AssistantComputerUseToolResult | undefined {
  if (event.type === "completed") {
    return {
      status: "completed",
      summary: event.summary,
      evidence: {
        summary: "Computer Use route completed with replayed orchestration events."
      }
    };
  }

  if (event.type === "verification_failed") {
    return {
      status: "failed",
      summary: event.reason,
      evidence: {
        summary: `Computer Use route stopped during ${event.stage} verification.`
      }
    };
  }

  return undefined;
}

function createToolResult(
  status: AssistantComputerUseTerminalStatus,
  summary: string
): AssistantComputerUseToolResult {
  return {
    status,
    summary,
    evidence: {
      summary
    }
  };
}

async function resumePendingApprovalTask(
  window: BrowserWindow | null,
  approval: PendingApproval
): Promise<void> {
  pendingApproval = null;
  assistantComputerUseExecutor.resumeApproval({
    turnId: approval.turnId,
    toolCallId: approval.toolCallId,
    decision: "approved",
    reason: "User approved this Computer Use turn."
  });

  await continueComputerUseTask({
    window,
    command: approval.command,
    mode: approval.mode,
    approved: true,
    planApproved: approval.planApproved === true,
    route: approval.route,
    toolIdentity: {
      turnId: approval.turnId,
      toolCallId: approval.toolCallId
    }
  });
}

async function continueComputerUseTask({
  window,
  command,
  mode,
  approved,
  planApproved,
  route,
  toolIdentity
}: {
  window: BrowserWindow | null;
  command: string;
  mode: ManualMode;
  approved: boolean;
  planApproved: boolean;
  route: ComputerUseCommandRoute;
  toolIdentity: AssistantComputerUseToolIdentity;
}): Promise<void> {
  activeComputerUseToolIdentity = toolIdentity;

  if (route.kind === "tmux_supervision") {
    await runTmuxSupervisionCommandTask(window, {
      command,
      mode,
      approved,
      route,
      toolIdentity
    });
    return;
  }

  const appPolicy = decideAppPolicy(appPolicySettingsStore.get(), route.bundleId);

  if (appPolicy.decision === "deny") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    completeComputerUseToolCall(toolIdentity, createToolResult("blocked", appPolicy.reason));
    emitTaskEvent(window, {
      status: "blocked",
      message: appPolicy.reason,
      command
    });
    return;
  }

  if (appPolicy.decision === "ask" && !approved) {
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    requireComputerUseApproval({
      command,
      mode,
      route,
      toolIdentity,
      reason: appPolicy.reason
    });
    emitTaskEvent(window, {
      status: "approval_required",
      message: `Approval required (app policy): ${appPolicy.reason}`,
      command
    });
    return;
  }

  if (approved && route.kind === "chrome") {
    const hostPolicyApproval = await applyApprovedChromeTaskHostPolicy({
      command,
      route,
      homeDir: os.homedir()
    });

    if (hostPolicyApproval.status === "blocked") {
      pendingApproval = null;
      activeTaskController?.abort();
      activeTaskController = null;
      currentTaskId += 1;
      completeComputerUseToolCall(
        toolIdentity,
        createToolResult("blocked", `Chrome host policy blocked this approved task: ${hostPolicyApproval.host}`)
      );
      emitTaskEvent(window, {
        status: "blocked",
        message: `Chrome host policy blocked this approved task: ${hostPolicyApproval.host}`,
        command
      });
      return;
    }

    if (hostPolicyApproval.status === "failed") {
      pendingApproval = null;
      activeTaskController?.abort();
      activeTaskController = null;
      currentTaskId += 1;
      completeComputerUseToolCall(
        toolIdentity,
        createToolResult("failed", `Chrome host policy approval failed: ${hostPolicyApproval.message}`)
      );
      emitTaskEvent(window, {
        status: "failed",
        message: `Chrome host policy approval failed: ${hostPolicyApproval.message}`,
        command
      });
      return;
    }

    if (hostPolicyApproval.status === "updated") {
      emitTurnReplayTaskEvent(window, {
        status: "executing",
        message: `Chrome host policy allowed for current turn: ${hostPolicyApproval.host}`,
        command
      });
    }
  }

  const taskId = currentTaskId + 1;
  currentTaskId = taskId;
  pendingApproval = null;
  activeTaskController?.abort();

  const controller = new AbortController();
  activeTaskController = controller;

  try {
    if (route.kind === "finder") {
      const helper = createDesktopHelper();
      const desktopClient = createFinderDesktopClient(helper);

      for await (const taskEvent of runFinderOrganizationTask(command, {
        approved,
        planApproved,
        desktopClient,
        createScreenshotPath: () => createScreenshotPath("finder-before")
      })) {
        if (controller.signal.aborted || taskId !== currentTaskId) {
          return;
        }

        turnReplayStore.recordComputerUseEvent(taskEvent);

        if (taskEvent.type === "approval_required" && !approved) {
          requireComputerUseApproval({
            command,
            mode,
            route,
            toolIdentity,
            reason: taskEvent.risk.reason
          });
        }

        if (taskEvent.type === "plan_confirmation_required" && !planApproved) {
          requireComputerUseApproval({
            command,
            mode,
            route,
            toolIdentity,
            reason: taskEvent.reason,
            planApproved: true
          });
        }

        const result = createToolResultFromTaskEvent(taskEvent);
        const taskStatus = createTaskEvent(taskEvent, mode);
        if (result) {
          completeComputerUseToolCall(toolIdentity, result);
          emitTaskEvent(window, taskStatus);
        } else {
          emitTurnReplayTaskEvent(window, taskStatus);
        }
      }
      return;
    }

    if (route.kind === "chrome") {
      const chromeClient = chromeCdpEndpoint
        ? createChromeCdpClient({ endpoint: chromeCdpEndpoint })
        : undefined;
      const helper = createDesktopHelper();
      const desktopClient = createChromeDesktopClient(helper);

      for await (const taskEvent of runChromePageTask(command, chromeClient, {
        approved,
        desktopClient,
        createScreenshotPath: () => createScreenshotPath("chrome-fallback")
      })) {
        if (controller.signal.aborted || taskId !== currentTaskId) {
          return;
        }

        turnReplayStore.recordComputerUseEvent(taskEvent);

        if (taskEvent.type === "approval_required" && !approved) {
          requireComputerUseApproval({
            command,
            mode,
            route,
            toolIdentity,
            reason: taskEvent.risk.reason
          });
        }

        const result = createToolResultFromTaskEvent(taskEvent);
        const taskStatus = createTaskEvent(taskEvent, mode);
        if (result) {
          completeComputerUseToolCall(toolIdentity, result);
          emitTaskEvent(window, taskStatus);
        } else {
          emitTurnReplayTaskEvent(window, taskStatus);
        }
      }
      return;
    }

    const plannerRuntime = decidePlannerProviderRuntime(plannerProviderSettingsStore.get());

    if (plannerRuntime.decision === "unavailable") {
      pendingApproval = null;
      activeTaskController?.abort();
      activeTaskController = null;
      currentTaskId += 1;
      completeComputerUseToolCall(toolIdentity, createToolResult("failed", plannerRuntime.message));
      emitTaskEvent(window, {
        status: plannerRuntime.status,
        message: plannerRuntime.message,
        command
      });
      return;
    }

    const plannedCommand = await resolvePlannerCommand({
      input: command,
      runtime: plannerRuntime,
      signal: controller.signal,
      createExternalPlanner: () => createExternalCuaTerminalPlannerFromEnv(process.env)
    });

    if (plannedCommand.providerLabel) {
      turnReplayStore.recordComputerUseEvent({
        type: "planner_resolved",
        providerLabel: plannedCommand.providerLabel,
        input: command,
        command: plannedCommand.command,
        rationale: plannedCommand.rationale
      });
      emitTurnReplayTaskEvent(window, {
        status: "executing",
        message: plannedCommand.rationale
          ? `${plannedCommand.providerLabel} planned: ${plannedCommand.command} (${plannedCommand.rationale})`
          : `${plannedCommand.providerLabel} planned: ${plannedCommand.command}`,
        command
      });
    }

    const helper = createDesktopHelper();
    const desktopClient = createGhosttyDesktopClient(helper);

    for await (const taskEvent of runGhosttyCommandTask(desktopClient, plannedCommand.command, {
      approved,
      createScreenshotPath: (stage) => createScreenshotPath(`ghostty-${stage}`),
      signal: controller.signal
    })) {
      if (controller.signal.aborted || taskId !== currentTaskId) {
        return;
      }

      turnReplayStore.recordComputerUseEvent(taskEvent);

      if (taskEvent.type === "approval_required" && !approved) {
        requireComputerUseApproval({
          command: taskEvent.command,
          mode,
          route,
          toolIdentity,
          reason: taskEvent.risk.reason
        });
      }

      const result = createToolResultFromTaskEvent(taskEvent);
      const taskStatus = createTaskEvent(taskEvent, mode);
      if (result) {
        completeComputerUseToolCall(toolIdentity, result);
        emitTaskEvent(window, taskStatus);
      } else {
        emitTurnReplayTaskEvent(window, taskStatus);
      }
    }
  } catch (error) {
    if (controller.signal.aborted || taskId !== currentTaskId) {
      return;
    }

    const message = error instanceof Error ? error.message : "Task failed.";
    completeComputerUseToolCall(toolIdentity, createToolResult("failed", message));
    emitTaskEvent(window, {
      status: "failed",
      message,
      command
    });
  } finally {
    if (activeTaskController === controller) {
      activeTaskController = null;
    }
  }
}

async function runTmuxSupervisionCommandTask(
  window: BrowserWindow | null,
  {
    command,
    mode,
    approved,
    route,
    toolIdentity
  }: {
    command: string;
    mode: ManualMode;
    approved: boolean;
    route: Extract<ComputerUseCommandRoute, { kind: "tmux_supervision" }>;
    toolIdentity: AssistantComputerUseToolIdentity;
  }
): Promise<void> {
  const taskId = currentTaskId + 1;
  currentTaskId = taskId;
  pendingApproval = null;
  activeTaskController?.abort();

  const controller = new AbortController();
  activeTaskController = controller;

  try {
    for await (const taskEvent of runTmuxSupervisionTask(
      route.sessionName,
      createTmuxSupervisionClient(),
      { approved }
    )) {
      if (controller.signal.aborted || taskId !== currentTaskId) {
        return;
      }

      if (taskEvent.type === "approval_required" && !approved) {
        requireComputerUseApproval({
          command,
          mode,
          route,
          toolIdentity,
          reason: taskEvent.risk.reason
        });
      }

      const result = createToolResultFromTaskEvent(taskEvent);
      const taskStatus = createTaskEvent(taskEvent, mode);
      if (result) {
        completeComputerUseToolCall(toolIdentity, result);
        emitTaskEvent(window, taskStatus);
      } else {
        emitTurnReplayTaskEvent(window, taskStatus);
      }
    }
  } catch (error) {
    if (controller.signal.aborted || taskId !== currentTaskId) {
      return;
    }

    const message = error instanceof Error ? error.message : "tmux supervision failed.";
    completeComputerUseToolCall(toolIdentity, createToolResult("failed", message));
    emitTaskEvent(window, {
      status: "failed",
      message,
      command
    });
  } finally {
    if (activeTaskController === controller) {
      activeTaskController = null;
    }
  }
}

async function runCommandTask(
  window: BrowserWindow | null,
  command: string,
  mode: ManualMode,
  approved: boolean,
  planApproved = false
) {
  if (!approved) {
    turnReplayStore.startTurn();
  }

  const route = selectCommandRoute(command);
  const assistantTurn = await createAssistantAgentTaskTurn(command);

  if (route.kind === "chat") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: assistantTurn.status === "completed" ? "completed" : "failed",
      message: createAssistantAgentTaskMessage(assistantTurn)
    });
    return;
  }

  if (assistantTurn.status !== "completed") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: "failed",
      message: createAssistantAgentTaskMessage(assistantTurn),
      command
    });
    return;
  }

  if (route.kind === "needs_clarification") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: "needs_confirmation",
      message: `${route.reason} 请明确目标应用和动作。`
    });
    return;
  }

  if (route.kind === "denied" || route.kind === "blocked") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: route.kind,
      message: route.reason,
      command
    });
    return;
  }

  const executionRoute = route.kind === "needs_confirmation" ? route.targetRoute : route;
  const plannedToolCall = readAssistantComputerUseToolCall(assistantTurn);
  const toolIdentity: AssistantComputerUseToolIdentity = {
    turnId: assistantTurn.id,
    toolCallId: plannedToolCall.id
  };
  activeComputerUseToolIdentity = toolIdentity;
  assistantComputerUseExecutor.planToolCall({
    ...toolIdentity,
    command: plannedToolCall.input.command,
    route: plannedToolCall.input.route,
    createdAt: plannedToolCall.createdAt
  });

  emitAssistantToolPlanTaskEvent(window, assistantTurn, command);

  if (route.kind === "needs_confirmation" && !approved) {
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    requireComputerUseApproval({
      command,
      mode,
      route: executionRoute,
      toolIdentity,
      reason: route.reason
    });
    emitTaskEvent(window, {
      status: "needs_confirmation",
      message: route.reason,
      command
    });
    return;
  }

  if (approved) {
    assistantComputerUseExecutor.bypassApproval({
      ...toolIdentity,
      reason: "Default approval bypass enabled for this Computer Use turn."
    });
  }

  await continueComputerUseTask({
    window,
    command,
    mode,
    approved,
    planApproved,
    route: executionRoute,
    toolIdentity
  });
}

async function createWindow() {
  const initialBounds = calculatePetWindowBounds({
    cursorPoint: screen.getCursorScreenPoint(),
    displays: screen.getAllDisplays(),
    windowSize: COMPACT_WINDOW_SIZE,
    margin: 28,
    positionOverride: readWindowPositionOverride(process.env)
  });

  mainWindow = new BrowserWindow({
    width: COMPACT_WINDOW_SIZE.width,
    height: COMPACT_WINDOW_SIZE.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: COMPACT_WINDOW_SIZE.width,
    minHeight: COMPACT_WINDOW_SIZE.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "skfiy",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function setPetWindowMode(window: BrowserWindow, mode: PetWindowMode) {
  const nextSize = mode === "expanded" ? EXPANDED_WINDOW_SIZE : COMPACT_WINDOW_SIZE;
  const currentBounds = window.getBounds();

  if (currentBounds.width === nextSize.width && currentBounds.height === nextSize.height) {
    return;
  }

  if (currentPetAnchor && currentPetSize) {
    const nextOffset = calculatePetWindowOffsetForMode({
      mode,
      windowSize: nextSize,
      petSize: currentPetSize
    });
    window.setBounds(resizePetWindowBoundsKeepingPetAnchor({
      anchor: currentPetAnchor,
      nextSize,
      nextOffset,
      displays: screen.getAllDisplays()
    }));
    return;
  }

  window.setBounds(resizePetWindowBoundsKeepingBottom(currentBounds, nextSize));
}

ipcMain.on("skfiy:move-window-by", (event, deltaX: unknown, deltaY: unknown, visibleRectValue: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const x = readFiniteNumber(deltaX);
  const y = readFiniteNumber(deltaY);

  if (!window || window.isDestroyed() || x === undefined || y === undefined) {
    return;
  }

  const bounds = window.getBounds();

  const visibleRect = readVisiblePetRect(visibleRectValue);

  if (visibleRect) {
    const anchor = {
      x: bounds.x + visibleRect.x,
      y: bounds.y + visibleRect.y
    };
    const nextAnchor = movePetAnchorByDelta({
      anchor,
      delta: { x, y },
      petSize: {
        width: visibleRect.width,
        height: visibleRect.height
      },
      displays: screen.getAllDisplays()
    });
    currentPetAnchor = nextAnchor;
    currentPetSize = {
      width: visibleRect.width,
      height: visibleRect.height
    };

    window.setBounds({
      ...bounds,
      x: Math.round(nextAnchor.x - visibleRect.x),
      y: Math.round(nextAnchor.y - visibleRect.y)
    });
    return;
  }

  window.setPosition(Math.round(bounds.x + x), Math.round(bounds.y + y));
});

ipcMain.on("skfiy:set-window-mode", (event, mode: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const nextMode = readPetWindowMode(mode);

  if (!window || window.isDestroyed() || !nextMode) {
    return;
  }

  setPetWindowMode(window, nextMode);
});

ipcMain.handle("skfiy:get-window-bounds", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    return null;
  }

  return window.getBounds();
});

ipcMain.handle(
  "skfiy:run-command",
  async (event, command: unknown, options: { mode?: unknown } = {}) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (typeof command !== "string") {
      emitTaskEvent(window, {
        status: "failed",
        message: "Command must be text."
      });
      return;
    }

    const trimmed = command.trim();
    const mode = readMode(options.mode);

    if (!trimmed) {
      emitTaskEvent(window, {
        status: "failed",
        message: "No command was provided."
      });
      return;
    }

    await runCommandTask(window, trimmed, mode, readDefaultApprovalBypass(process.env));
  }
);

ipcMain.handle("skfiy:approve-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const approval = pendingApproval;

  if (!approval) {
    emitTaskEvent(window, {
      status: "idle",
      message: "No task is waiting for approval."
    });
    return;
  }

  await resumePendingApprovalTask(window, approval);
});

ipcMain.handle("skfiy:deny-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const approval = pendingApproval;

  if (approval) {
    assistantComputerUseExecutor.resumeApproval({
      turnId: approval.turnId,
      toolCallId: approval.toolCallId,
      decision: "denied",
      reason: "User denied this Computer Use turn."
    });
  }

  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  activeComputerUseToolIdentity = null;
  currentTaskId += 1;

  emitTaskEvent(window, {
    status: approval ? "denied" : "idle",
    message: approval ? "Task denied." : "No task is waiting for approval.",
    ...(approval ? { command: approval.command } : {})
  });
});

ipcMain.handle("skfiy:take-screenshot", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const helper = createDesktopHelper();

  emitTaskEvent(window, {
    status: "observing",
    message: "Capturing the desktop."
  });

  try {
    const screenshot = await helper.screenshot(createScreenshotPath("manual"));
    emitTaskEvent(window, {
      status: "completed",
      message: `Screenshot saved: ${screenshot.outputPath}`
    });
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Screenshot failed."
    });
  }
});

ipcMain.handle("skfiy:stop-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  cancelActiveComputerUseToolCall("Task stopped.");
  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  activeComputerUseToolIdentity = null;
  currentTaskId += 1;

  emitTaskEvent(window, {
    status: "cancelled",
    message: "Task stopped."
  });
});

ipcMain.handle("skfiy:get-permissions", async (event) => {
  return readPermissionsForRenderer({ helper: createDesktopHelper() });
});

ipcMain.handle("skfiy:get-permission-diagnostics", async () => {
  const helper = createDesktopHelper();
  const active = await readPermissionsForRenderer({ helper });

  return readPermissionDiagnosticsForRenderer({
    active,
    appProcess: readAppProcessPermissions(),
    helper: {
      getPermissions: async () => active
    },
    identity: {
      appPath: app.getAppPath(),
      executablePath: process.execPath,
      helperPath: resolveHelperPath(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged
    }
  });
});

ipcMain.handle("skfiy:get-desktop-session-diagnostics", async () => {
  return readDesktopSessionDiagnosticsForRenderer({ helper: createDesktopHelper() });
});

ipcMain.handle("skfiy:open-permission-settings", async (event, permission: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const target = readPermissionSettingsTarget(permission);

  if (!target) {
    emitTaskEvent(window, {
      status: "failed",
      message: "Unknown permission settings target."
    });
    return;
  }

  try {
    const result = await createDesktopHelper().openPermissionSettings(target);
    assertDesktopActionResult(result, "open permission settings");
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Permission settings could not be opened."
    });
  }
});

ipcMain.handle("skfiy:get-startup-warnings", () => {
  return readStartupWarnings({
    appPath: app.getAppPath(),
    devServerUrl,
    env: process.env,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  });
});

ipcMain.handle("skfiy:get-app-policy-settings", () => {
  return appPolicySettingsStore.get();
});

ipcMain.handle("skfiy:set-app-policy", (_event, update: unknown) => {
  return appPolicySettingsStore.set(
    update && typeof update === "object" ? update : {}
  );
});

ipcMain.handle("skfiy:get-planner-provider-settings", () => {
  return plannerProviderSettingsStore.get();
});

ipcMain.handle("skfiy:set-planner-provider-settings", (_event, update: unknown) => {
  return plannerProviderSettingsStore.set(
    update && typeof update === "object" ? update : {}
  );
});

ipcMain.handle("skfiy:get-assistant-agent-settings", async () => {
  const settings = assistantAgentSettingsStore.get();

  return {
    settings,
    providers: await readAssistantAgentProviderStates(settings)
  };
});

ipcMain.handle("skfiy:set-assistant-agent-settings", async (_event, update: unknown) => {
  const settings = assistantAgentSettingsStore.set(
    update && typeof update === "object" ? update : {}
  );

  return {
    settings,
    providers: await readAssistantAgentProviderStates(settings)
  };
});

ipcMain.handle("skfiy:get-turn-replay", () => {
  return turnReplayStore.getReplay();
});

ipcMain.handle("skfiy:get-runtime-status", () => {
  return {
    stopTurnHotkey: readStopTurnHotkeyStatus(stopTurnHotkeyRegistered)
  };
});

ipcMain.handle("skfiy:get-pet-skin", async () => {
  return readDefaultLocalOriginPetSkin({ homeDir: os.homedir() });
});

app.whenReady().then(async () => {
  await createWindow();
  if (!stopTurnHotkeyRegistered) {
    stopTurnHotkeyRegistered = registerStopTurnHotkey({
      registry: globalShortcut,
      getWindow: () => mainWindow
    });
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (stopTurnHotkeyRegistered) {
    globalShortcut.unregister(STOP_TURN_ACCELERATOR);
    stopTurnHotkeyRegistered = false;
  }
});
