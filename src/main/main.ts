import { app, BrowserWindow, globalShortcut, ipcMain, screen, systemPreferences } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import {
  createTurnReplayStore,
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
import { createChromeCdpClient } from "./chrome-cdp-client.js";
import { readChromeCdpEndpoint } from "./chrome-cdp-settings.js";
import { createTmuxSupervisionClient } from "./tmux-supervision-client.js";
import {
  createDictationSettingsStore,
  readInitialDictationSettings,
  resolveDictationVoiceTrigger
} from "./dictation-settings.js";
import {
  createPlannerProviderSettingsStore,
  readInitialPlannerProviderSettings
} from "./planner-provider-settings.js";
import { decidePlannerProviderRuntime } from "./planner-provider-runtime.js";
import { resolvePlannerCommand } from "./planner-command.js";
import { createExternalCuaTerminalPlannerFromEnv } from "./external-cua-planner.js";
import {
  createDoubaoDictationProvider,
  createNativeMacOSDictationProvider,
  type DictationProviderEvent
} from "./dictation-provider.js";
import { readDesktopSessionDiagnosticsForRenderer } from "./desktop-session-diagnostics.js";
import {
  createVoiceTurnSessionStore,
  decideVoiceIntentAdmission,
  type VoiceTurnSession,
  type VoiceTurnProviderId,
  type VoiceIntentAdmissionDecision,
  type VoiceTurnTranscriptCandidateInput
} from "./voice-turn-session.js";
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
import { selectCommandRoute } from "./task-routing.js";
import { readStartupWarnings } from "./startup-guard.js";
import {
  readStopTurnHotkeyStatus,
  registerStopTurnHotkey,
  STOP_TURN_ACCELERATOR
} from "./stop-turn-hotkey.js";
import {
  calculatePetWindowBounds,
  readWindowPositionOverride,
  resizePetWindowBoundsKeepingBottom,
  type Size
} from "./window-position.js";

type ManualMode = "active" | "quiet";
type TaskStatus =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
  | "completed"
  | "failed";
type PetWindowMode = "compact" | "expanded";
type ComputerUseTaskEvent =
  | GhosttyTaskEvent
  | ChromeTaskEvent
  | FinderTaskEvent
  | TmuxSupervisionTaskEvent;

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

interface PendingApproval {
  command: string;
  mode: ManualMode;
  planApproved?: boolean;
}

interface ObserveAppReplayRecord extends DesktopAppState {
  stage: "before" | "after";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.SKFIY_DEV_SERVER_URL;
app.setName("skfiy");
const COMPACT_WINDOW_SIZE: Size = { width: 320, height: 224 };
const EXPANDED_WINDOW_SIZE: Size = { width: 320, height: 500 };
const appPolicySettingsStore = createAppPolicySettingsStore(readInitialAppPolicySettings());
const chromeCdpEndpoint = readChromeCdpEndpoint({
  argv: process.argv,
  env: process.env
});
const plannerProviderSettingsStore = createPlannerProviderSettingsStore(
  readInitialPlannerProviderSettings(process.env)
);
const turnReplayStore = createTurnReplayStore();
const dictationSettingsStore = createDictationSettingsStore(
  readInitialDictationSettings(process.env)
);
const voiceTurnSessionStore = createVoiceTurnSessionStore();

let mainWindow: BrowserWindow | null = null;
let currentTaskId = 0;
let screenshotSerial = 0;
let activeTaskController: AbortController | null = null;
let pendingApproval: PendingApproval | null = null;
let stopTurnHotkeyRegistered = false;
let activeDictationProviderStop: (() => Promise<void>) | null = null;

function emitTaskEvent(window: BrowserWindow | null, event: TaskEvent) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:task-event", event);
}

function emitDictationProviderEvent(window: BrowserWindow | null, event: DictationProviderEvent) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:dictation-provider-event", event);
}

function emitDictationTranscriptEvent(
  window: BrowserWindow | null,
  event: {
    providerId: VoiceTurnProviderId;
    sessionId: string;
    text: string;
    isFinal: boolean;
    confidence?: number;
  }
) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("skfiy:dictation-transcript-event", event);
}

function startVoiceTurnSession(providerId: VoiceTurnProviderId): VoiceTurnSession {
  return voiceTurnSessionStore.start({
    providerId,
    trigger: "pet-click"
  });
}

function cancelVoiceTurnSession(sessionId: unknown): void {
  const id = typeof sessionId === "string" ? sessionId : voiceTurnSessionStore.getActive()?.id;

  if (!id) {
    return;
  }

  try {
    voiceTurnSessionStore.cancel(id, "manual-stop");
  } catch {
    // The renderer can send a late stop after a submit already finalized the session.
  }
}

function readVoiceTurnSession(sessionId: unknown): VoiceTurnSession | null {
  const id = typeof sessionId === "string" ? sessionId : voiceTurnSessionStore.getActive()?.id;
  return id ? voiceTurnSessionStore.get(id) : null;
}

function finalizeVoiceTurnSession(sessionId: unknown, transcript: string): void {
  const id = typeof sessionId === "string" ? sessionId : voiceTurnSessionStore.getActive()?.id;

  if (!id) {
    return;
  }

  voiceTurnSessionStore.finalize(id, { text: transcript });
}

function recordVoiceTranscriptCandidate(
  sessionId: unknown,
  update: VoiceTurnTranscriptCandidateInput
): void {
  const id = typeof sessionId === "string" ? sessionId : voiceTurnSessionStore.getActive()?.id;

  if (!id) {
    return;
  }

  voiceTurnSessionStore.recordTranscriptCandidate(id, update);
}

function failVoiceTurnSession(sessionId: string, message: string): void {
  try {
    voiceTurnSessionStore.fail(sessionId, message);
  } catch {
    // The session may already have been stopped by the user.
  }
}

async function stopCurrentDictationProvider(window: BrowserWindow | null): Promise<void> {
  if (activeDictationProviderStop) {
    const stop = activeDictationProviderStop;
    activeDictationProviderStop = null;
    await stop();
    return;
  }

  const dictationSettings = dictationSettingsStore.get();

  if (dictationSettings.provider !== "doubao") {
    return;
  }

  const voiceTrigger = resolveDictationVoiceTrigger(dictationSettings);

  try {
    const provider = createDoubaoDictationProvider({
      helper: createDesktopHelper(),
      voiceTrigger,
      emit: (providerEvent) => emitDictationProviderEvent(window, providerEvent)
    });
    await provider.stop();
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Doubao dictation could not be stopped."
    });
  }
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

function readVoiceTranscriptCandidate(value: unknown): VoiceTurnTranscriptCandidateInput | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<VoiceTurnTranscriptCandidateInput>;

  if (typeof candidate.text !== "string" || !candidate.text.trim()) {
    return undefined;
  }

  if (typeof candidate.isFinal !== "boolean") {
    return undefined;
  }

  return {
    text: candidate.text,
    isFinal: candidate.isFinal,
    confidence: typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : undefined
  };
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
    || value === "microphone"
    || value === "speech-recognition"
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
    },
    microphone: {
      state: readElectronMediaPermissionState(systemPreferences.getMediaAccessStatus("microphone"))
    },
    speechRecognition: {
      state: "unknown"
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

function handleVoiceAdmissionInterruption(
  window: BrowserWindow | null,
  voiceAdmission: Exclude<VoiceIntentAdmissionDecision, { decision: "computer_use" }>
): void {
  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  currentTaskId += 1;
  turnReplayStore.startTurn();

  if (voiceAdmission.decision === "chat") {
    emitTurnReplayTaskEvent(window, {
      status: "completed",
      message: "Voice intent routed to chat: 我是 skfiy，可以帮你把明确的语音意图转成受控的桌面操作。"
    });
    return;
  }

  emitTurnReplayTaskEvent(window, {
    status: "needs_confirmation",
    message: `Voice intent needs clarification: ${voiceAdmission.reason} 请重新说清目标应用和动作。`
  });
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

  if (route.kind === "chat") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: "completed",
      message: "我是 skfiy，可以帮你把明确的语音意图转成受控的桌面操作。"
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

  if (route.kind === "tmux_supervision") {
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
          pendingApproval = { command, mode };
        }

        emitTurnReplayTaskEvent(window, createTaskEvent(taskEvent, mode));
      }
    } catch (error) {
      if (controller.signal.aborted || taskId !== currentTaskId) {
        return;
      }

      emitTurnReplayTaskEvent(window, {
        status: "failed",
        message: error instanceof Error ? error.message : "tmux supervision failed."
      });
    } finally {
      if (activeTaskController === controller) {
        activeTaskController = null;
      }
    }
    return;
  }

  const appPolicy = decideAppPolicy(appPolicySettingsStore.get(), route.bundleId);

  if (appPolicy.decision === "deny") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: "failed",
      message: appPolicy.reason
    });
    return;
  }

  if (appPolicy.decision === "ask" && !approved) {
    pendingApproval = { command, mode };
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, {
      status: "approval_required",
      message: `Approval required (app policy): ${appPolicy.reason}`,
      command
    });
    return;
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
          pendingApproval = { command, mode };
        }

        if (taskEvent.type === "plan_confirmation_required" && !planApproved) {
          pendingApproval = { command, mode, planApproved: true };
        }

        emitTurnReplayTaskEvent(window, createTaskEvent(taskEvent, mode));
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
          pendingApproval = { command, mode };
        }

        emitTurnReplayTaskEvent(window, createTaskEvent(taskEvent, mode));
      }
      return;
    }

    const plannerRuntime = decidePlannerProviderRuntime(plannerProviderSettingsStore.get());

    if (plannerRuntime.decision === "unavailable") {
      pendingApproval = null;
      activeTaskController?.abort();
      activeTaskController = null;
      currentTaskId += 1;
      emitTurnReplayTaskEvent(window, {
        status: plannerRuntime.status,
        message: plannerRuntime.message
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
          : `${plannedCommand.providerLabel} planned: ${plannedCommand.command}`
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
        pendingApproval = { command: taskEvent.command, mode };
      }

      emitTurnReplayTaskEvent(window, createTaskEvent(taskEvent, mode));
    }
  } catch (error) {
    if (controller.signal.aborted || taskId !== currentTaskId) {
      return;
    }

    emitTurnReplayTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Task failed."
    });
  } finally {
    if (activeTaskController === controller) {
      activeTaskController = null;
    }
  }
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

  window.setBounds(resizePetWindowBoundsKeepingBottom(currentBounds, nextSize));
}

ipcMain.on("skfiy:move-window-by", (event, deltaX: unknown, deltaY: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const x = readFiniteNumber(deltaX);
  const y = readFiniteNumber(deltaY);

  if (!window || window.isDestroyed() || x === undefined || y === undefined) {
    return;
  }

  const bounds = window.getBounds();
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

    await runCommandTask(window, trimmed, mode, false);
  }
);

ipcMain.handle("skfiy:prepare-dictation", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const dictationSettings = dictationSettingsStore.get();
  const voiceTrigger = resolveDictationVoiceTrigger(dictationSettings);
  const voiceTurnSession = startVoiceTurnSession(dictationSettings.provider);
  let lastProviderState: DictationProviderEvent["state"] | undefined;

  if (window && !window.isDestroyed()) {
    window.setFocusable(true);
    window.show();
    window.focus();
  }

  if (dictationSettings.provider === "browser") {
    activeDictationProviderStop = null;
    return {
      providerId: "browser",
      sessionId: voiceTurnSession.id,
      voiceTrigger: "none",
      nativeDictationActive: false
    };
  }

  if (dictationSettings.provider === "native-macos") {
    const provider = createNativeMacOSDictationProvider({
      helper: createDesktopHelper(),
      locale: dictationSettings.nativeSpeechLocale,
      maxDurationMs: dictationSettings.nativeSpeechMaxDurationMs,
      silenceTimeoutMs: dictationSettings.nativeSpeechSilenceTimeoutMs,
      emit: (providerEvent) => {
        lastProviderState = providerEvent.state;
        emitDictationProviderEvent(window, providerEvent);
      },
      emitTranscript: (transcript) => {
        const update = {
          text: transcript.text,
          isFinal: transcript.isFinal,
          confidence: transcript.confidence
        };

        try {
          recordVoiceTranscriptCandidate(voiceTurnSession.id, update);
        } catch {
          // The user may have stopped the voice turn before native ASR returned.
        }

        emitDictationTranscriptEvent(window, {
          providerId: "native-macos",
          sessionId: voiceTurnSession.id,
          ...update
        });
      }
    });

    try {
      const preparation = await provider.prepare();
      activeDictationProviderStop = provider.stop;
      return {
        ...preparation,
        sessionId: voiceTurnSession.id
      };
    } catch (error) {
      activeDictationProviderStop = null;
      failVoiceTurnSession(
        voiceTurnSession.id,
        error instanceof Error ? error.message : "macOS speech could not be prepared."
      );
      emitTaskEvent(window, {
        status: "failed",
        message: error instanceof Error ? error.message : "macOS speech could not be prepared."
      });
    }

    return {
      providerId: "native-macos",
      sessionId: voiceTurnSession.id,
      voiceTrigger: "none",
      nativeDictationActive: false,
      providerState: lastProviderState ?? "failed"
    };
  }

  try {
    const provider = createDoubaoDictationProvider({
      helper: createDesktopHelper(),
      voiceTrigger,
      emit: (providerEvent) => {
        lastProviderState = providerEvent.state;
        emitDictationProviderEvent(window, providerEvent);
      }
    });
    const preparation = await provider.prepare();
    activeDictationProviderStop = provider.stop;
    return {
      ...preparation,
      sessionId: voiceTurnSession.id
    };
  } catch (error) {
    failVoiceTurnSession(
      voiceTurnSession.id,
      error instanceof Error ? error.message : "Doubao dictation could not be prepared."
    );
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Doubao dictation could not be prepared."
    });
  }

  return {
    providerId: "doubao",
    sessionId: voiceTurnSession.id,
    voiceTrigger,
    nativeDictationActive: false,
    providerState: lastProviderState ?? "failed"
  };
});

ipcMain.handle("skfiy:stop-dictation", async (event, sessionId: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  cancelVoiceTurnSession(sessionId);
  await stopCurrentDictationProvider(window);
});

ipcMain.handle("skfiy:update-dictation-transcript", (event, sessionId: unknown, update: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const transcriptUpdate = readVoiceTranscriptCandidate(update);

  if (!transcriptUpdate) {
    return;
  }

  try {
    const voiceTurnSession = readVoiceTurnSession(sessionId);
    if (!voiceTurnSession) {
      return;
    }
    recordVoiceTranscriptCandidate(sessionId, transcriptUpdate);
    emitDictationTranscriptEvent(window, {
      providerId: voiceTurnSession.providerId,
      sessionId: voiceTurnSession.id,
      ...transcriptUpdate
    });
  } catch (error) {
    emitTaskEvent(window, {
      status: "failed",
      message: error instanceof Error ? error.message : "Voice transcript could not be recorded."
    });
  }
});

ipcMain.handle(
  "skfiy:submit-dictation",
  async (
    event,
    sessionId: unknown,
    command: unknown,
    options: { stopNativeDictation?: unknown } = {}
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (typeof command !== "string") {
      emitTaskEvent(window, {
        status: "failed",
        message: "Voice command must be text."
      });
      return;
    }

    const trimmed = command.trim();

    if (!trimmed) {
      emitTaskEvent(window, {
        status: "failed",
        message: "No voice command was provided."
      });
      return;
    }

    const voiceTurnSession = readVoiceTurnSession(sessionId);
    if (!voiceTurnSession) {
      emitTaskEvent(window, {
        status: "failed",
        message: "Voice turn session is missing."
      });
      return;
    }

    const route = selectCommandRoute(trimmed);
    const voiceAdmission = decideVoiceIntentAdmission({
      session: voiceTurnSession,
      submittedText: trimmed,
      route
    });

    try {
      finalizeVoiceTurnSession(sessionId, trimmed);
    } catch (error) {
      emitTaskEvent(window, {
        status: "failed",
        message: error instanceof Error ? error.message : "Voice turn could not be finalized."
      });
      return;
    }

    if (options.stopNativeDictation === true) {
      await stopCurrentDictationProvider(window);
    }

    if (voiceAdmission.decision === "computer_use") {
      await runCommandTask(window, trimmed, "active", false);
      return;
    }

    handleVoiceAdmissionInterruption(window, voiceAdmission);
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

  await runCommandTask(window, approval.command, approval.mode, true, approval.planApproved === true);
});

ipcMain.handle("skfiy:deny-task", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  currentTaskId += 1;

  emitTaskEvent(window, {
    status: "idle",
    message: "Task denied."
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
  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  currentTaskId += 1;

  emitTaskEvent(window, {
    status: "idle",
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

ipcMain.handle("skfiy:get-native-speech-status", async (_event, locale: unknown) => {
  const requestedLocale = typeof locale === "string" && locale.trim()
    ? locale.trim()
    : dictationSettingsStore.get().nativeSpeechLocale;

  return createDesktopHelper().getSpeechStatus(requestedLocale);
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

ipcMain.handle("skfiy:get-dictation-settings", () => {
  return dictationSettingsStore.get();
});

ipcMain.handle("skfiy:set-dictation-settings", (_event, update: unknown) => {
  return dictationSettingsStore.set(
    update && typeof update === "object" ? update : {}
  );
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

ipcMain.handle("skfiy:get-turn-replay", () => {
  return turnReplayStore.getReplay();
});

ipcMain.handle("skfiy:get-runtime-status", () => {
  return {
    stopTurnHotkey: readStopTurnHotkeyStatus(stopTurnHotkeyRegistered)
  };
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
