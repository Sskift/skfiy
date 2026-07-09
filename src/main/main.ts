import { app, BrowserWindow, globalShortcut, ipcMain, screen, systemPreferences } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesktopHelperClient } from "./computer-use/desktop-helper.js";
import {
  createTurnReplayStore,
  type TurnReplay
} from "./computer-use/turn-replay-store.js";
import type {
  PermissionSummary
} from "./computer-use/types.js";
import {
  createAppPolicySettingsStore,
  decideAppPolicy,
  readInitialAppPolicySettings
} from "./app-policy-settings.js";
import {
  AssistantAgentTurnRuntimeError,
  runAssistantAgentTurn,
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
import { createPersonalMemoryJournalStore } from "./personal-memory-journal.js";
import { createPendingPersonalMemoryStore } from "./personal-memory-pending.js";
import { createPersonalSkillSettingsStore } from "./personal-skills.js";
import {
  recordCompletedAssistantTurnForPersonalization
} from "./personalization-learning-loop.js";
import {
  createSessionMemoryStore,
  searchSessionMemory
} from "./session-memory.js";
import { summarizeAssistantToolPlan } from "./assistant-tools.js";
import type { BrowserPageContext } from "./browser-page-context.js";
import { readLatestBrowserPageContext } from "./main-browser-context-reader.js";
import {
  createAssistantComputerUseExecutor,
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
import { runChromePageTask } from "./orchestrator/chrome-task.js";
import { runFinderOrganizationTask } from "./orchestrator/finder-task.js";
import { runGhosttyCommandTask } from "./orchestrator/ghostty-task.js";
import {
  assertDesktopActionResult,
  createChromeDesktopClient,
  createFinderDesktopClient,
  createGhosttyDesktopClient
} from "./main-desktop-clients.js";
import { runTmuxSupervisionTask } from "./orchestrator/tmux-supervision-task.js";
import {
  readPermissionDiagnosticsForRenderer,
  readPermissionsForRenderer
} from "./permissions.js";
import { selectCommandRoute, type CommandRoute } from "./task-routing.js";
import { readStartupWarnings } from "./startup-guard.js";
import {
  registerStopTurnHotkey,
  STOP_TURN_ACCELERATOR
} from "./stop-turn-hotkey.js";
import {
  calculatePetWindowOffsetForMode,
  calculatePetWindowBounds,
  calculatePetWindowDragMove,
  readWindowPositionOverride,
  resizePetWindowBoundsKeepingBottom,
  resizePetWindowBoundsKeepingPetAnchor,
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
import {
  isEnabledEnvFlag,
  readElectronMediaPermissionState,
  readFiniteNumber,
  readMode,
  readPermissionSettingsTarget,
  readPetWindowMode,
  readVisiblePetRect,
  type PetWindowMode
} from "./main-ipc-payload.js";
import {
  createToolResult,
  createToolResultFromTaskEvent,
  isSameComputerUseToolIdentity
} from "./main-computer-use-tool-result.js";
import {
  createAssistantAgentTaskMessage,
  createRuntimeStatusResponse,
  readAssistantComputerUseToolCall
} from "./main-renderer-payload.js";
import {
  readAssistantAgentSettingsResponse,
  updateAssistantAgentSettingsResponse
} from "./main-assistant-agent-settings-response.js";
import { createRuntimeSnapshotCurrentTurnFromTaskEvent } from "./main-runtime-snapshot-payload.js";
import {
  createPendingApproval,
  createPendingApprovalDeniedTaskEvent,
  USER_DENIED_COMPUTER_USE_REASON,
  type ComputerUseCommandRoute,
  type PendingApproval
} from "./main-pending-approval.js";
import {
  createAppPolicyApprovalRequiredTaskEvent,
  createAppPolicyBlockedTaskEvent,
  createAssistantChatRouteTaskEvent,
  createAssistantTurnFailedRouteTaskEvent,
  createChromeHostPolicyAllowedTaskEvent,
  createChromeHostPolicyApprovalFailedTaskEvent,
  createChromeHostPolicyBlockedTaskEvent,
  createComputerUseFailureTaskEvent,
  createNeedsClarificationRouteTaskEvent,
  createNeedsConfirmationRouteTaskEvent,
  createPlannerUnavailableTaskEvent,
  createStopTurnTaskEvent,
  createTerminalRouteTaskEvent
} from "./main-route-task-events.js";
import {
  createTaskEvent,
  readTurnReplayTaskEvent,
  withRouteTaskEventMetadata,
  type ComputerUseTaskEvent,
  type ManualMode,
  type TaskEvent
} from "./task-event-view.js";

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
const personalMemoryJournalStore = createPersonalMemoryJournalStore({
  baseDir: skfiyAppSupportDir
});
const pendingPersonalMemoryStore = createPendingPersonalMemoryStore({
  baseDir: skfiyAppSupportDir
});
const personalMemoryWriteApprovalEnabled = isEnabledEnvFlag(process.env.SKFIY_PERSONAL_MEMORY_WRITE_APPROVAL);
const personalSkillSettingsStore = createPersonalSkillSettingsStore({
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
  currentTurnEvent?: TaskEvent
): void {
  const homeDir = os.homedir();
  const currentTurn: RuntimeSnapshotCurrentTurnInput | undefined = currentTurnEvent
    ? createRuntimeSnapshotCurrentTurnFromTaskEvent(currentTurnEvent)
    : undefined;

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

function createDesktopHelper(): DesktopHelperClient {
  return new DesktopHelperClient({
    helperPath: resolveHelperPath()
  });
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

async function createAssistantAgentTaskTurn(input: string): Promise<AssistantAgentTurnResult> {
  const browserPageContext = await readLatestBrowserPageContext({
    homeDir: os.homedir(),
    readConnectionStatus: readChromeExtensionConnectionStatus
  });
  const personalMemory = personalMemoryStore.read();
  const personalSkillSettings = personalSkillSettingsStore.read();
  const recalledSessions = searchSessionMemory(sessionMemoryStore.readAll(), input, 3);

  try {
    const turn = await runAssistantAgentTurn(input, {
      settings: assistantAgentSettingsStore.get(),
      browserPageContext,
      personalMemory,
      personalSkillSettings,
      recalledSessions
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
  const settings = assistantAgentSettingsStore.get();
  void recordCompletedAssistantTurnForPersonalization({
    userInput,
    turn,
    browserPageContext,
    memoryStore: personalMemoryStore,
    memoryJournalStore: personalMemoryJournalStore,
    pendingMemoryStore: pendingPersonalMemoryStore,
    sessionMemoryStore,
    memoryWriteApprovalEnabled: personalMemoryWriteApprovalEnabled,
    runReviewTurn: (reviewPrompt, { personalMemory }) => runAssistantAgentTurn(reviewPrompt, {
      settings: {
        ...settings,
        timeoutMs: Math.min(settings.timeoutMs, PERSONAL_MEMORY_REVIEW_TIMEOUT_MS)
      },
      personalMemory
    })
  });
}

function emitAssistantToolPlanTaskEvent(
  window: BrowserWindow | null,
  turn: AssistantAgentTurnResult,
  command: string,
  route: CommandRoute
): void {
  const summary = summarizeAssistantToolPlan(turn);
  if (!summary) {
    return;
  }

  emitTurnReplayTaskEvent(window, withRouteTaskEventMetadata({
    status: "observing",
    message: summary.message,
    command
  }, route));
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
    const taskEvent = createAppPolicyBlockedTaskEvent({
      command,
      reason: appPolicy.reason,
      route
    });
    completeComputerUseToolCall(toolIdentity, createToolResult("blocked", appPolicy.reason));
    emitTaskEvent(window, taskEvent);
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
    emitTaskEvent(window, createAppPolicyApprovalRequiredTaskEvent({
      command,
      reason: appPolicy.reason,
      route
    }));
    return;
  }

  if (approved && route.kind === "chrome") {
    const hostPolicyApproval = await applyApprovedChromeTaskHostPolicy({
      command,
      route,
      homeDir: os.homedir()
    });

    if (hostPolicyApproval.status === "blocked") {
      const taskEvent = createChromeHostPolicyBlockedTaskEvent({
        command,
        host: hostPolicyApproval.host,
        route
      });
      pendingApproval = null;
      activeTaskController?.abort();
      activeTaskController = null;
      currentTaskId += 1;
      completeComputerUseToolCall(
        toolIdentity,
        createToolResult("blocked", taskEvent.message ?? `Chrome host policy blocked this approved task: ${hostPolicyApproval.host}`)
      );
      emitTaskEvent(window, taskEvent);
      return;
    }

    if (hostPolicyApproval.status === "failed") {
      const taskEvent = createChromeHostPolicyApprovalFailedTaskEvent({
        command,
        message: hostPolicyApproval.message,
        route
      });
      pendingApproval = null;
      activeTaskController?.abort();
      activeTaskController = null;
      currentTaskId += 1;
      completeComputerUseToolCall(
        toolIdentity,
        createToolResult("failed", taskEvent.message ?? `Chrome host policy approval failed: ${hostPolicyApproval.message}`)
      );
      emitTaskEvent(window, taskEvent);
      return;
    }

    if (hostPolicyApproval.status === "updated") {
      emitTurnReplayTaskEvent(window, createChromeHostPolicyAllowedTaskEvent({
        command,
        host: hostPolicyApproval.host,
        route
      }));
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
        const taskStatus = withRouteTaskEventMetadata(createTaskEvent(taskEvent, mode), route);
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
        const taskStatus = withRouteTaskEventMetadata(createTaskEvent(taskEvent, mode), route);
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
      emitTaskEvent(window, createPlannerUnavailableTaskEvent({
        command,
        message: plannerRuntime.message,
        route,
        status: plannerRuntime.status
      }));
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
      emitTurnReplayTaskEvent(window, withRouteTaskEventMetadata({
        status: "executing",
        message: plannedCommand.rationale
          ? `${plannedCommand.providerLabel} planned: ${plannedCommand.command} (${plannedCommand.rationale})`
          : `${plannedCommand.providerLabel} planned: ${plannedCommand.command}`,
        command
      }, route));
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
      const taskStatus = withRouteTaskEventMetadata(createTaskEvent(taskEvent, mode), route);
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
    emitTaskEvent(window, createComputerUseFailureTaskEvent({
      command,
      message,
      route
    }));
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
      const taskStatus = withRouteTaskEventMetadata(createTaskEvent(taskEvent, mode), route);
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
    emitTaskEvent(window, createComputerUseFailureTaskEvent({
      command,
      message,
      route
    }));
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
    emitTurnReplayTaskEvent(window, createAssistantChatRouteTaskEvent({
      status: assistantTurn.status,
      message: createAssistantAgentTaskMessage(assistantTurn)
    }));
    return;
  }

  if (assistantTurn.status !== "completed") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, createAssistantTurnFailedRouteTaskEvent({
      command,
      message: createAssistantAgentTaskMessage(assistantTurn),
      route
    }));
    return;
  }

  if (route.kind === "needs_clarification") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, createNeedsClarificationRouteTaskEvent(route));
    return;
  }

  if (route.kind === "denied" || route.kind === "blocked") {
    pendingApproval = null;
    activeTaskController?.abort();
    activeTaskController = null;
    currentTaskId += 1;
    emitTurnReplayTaskEvent(window, createTerminalRouteTaskEvent({
      command,
      route
    }));
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

  emitAssistantToolPlanTaskEvent(window, assistantTurn, command, route);

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
    emitTaskEvent(window, createNeedsConfirmationRouteTaskEvent({
      command,
      route
    }));
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
  const move = calculatePetWindowDragMove({
    currentBounds: bounds,
    delta: { x, y },
    ...(visibleRect ? { visiblePetRect: visibleRect } : {}),
    displays: screen.getAllDisplays()
  });

  if (move.kind === "visible-pet-bounds") {
    currentPetAnchor = move.petAnchor;
    currentPetSize = move.petSize;
    window.setBounds(move.bounds);
    return;
  }

  window.setPosition(move.position.x, move.position.y);
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
      reason: USER_DENIED_COMPUTER_USE_REASON
    });
  }

  pendingApproval = null;
  activeTaskController?.abort();
  activeTaskController = null;
  activeComputerUseToolIdentity = null;
  currentTaskId += 1;

  emitTaskEvent(window, createPendingApprovalDeniedTaskEvent(approval));
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

  emitTaskEvent(window, createStopTurnTaskEvent());
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
  return readAssistantAgentSettingsResponse({
    store: assistantAgentSettingsStore
  });
});

ipcMain.handle("skfiy:set-assistant-agent-settings", async (_event, update: unknown) => {
  return updateAssistantAgentSettingsResponse({
    store: assistantAgentSettingsStore,
    update
  });
});

ipcMain.handle("skfiy:get-turn-replay", () => {
  return turnReplayStore.getReplay();
});

ipcMain.handle("skfiy:get-runtime-status", () => {
  return createRuntimeStatusResponse(stopTurnHotkeyRegistered);
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
