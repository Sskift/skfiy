import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { TurnReplay } from "./computer-use/turn-replay-store.js";
import type {
  TurnTranscriptAction,
  TurnTranscriptScreenshot
} from "./computer-use/turn-transcript.js";

export const RUNTIME_SNAPSHOT_SCHEMA_VERSION = 1;
const MAX_RUNTIME_SNAPSHOT_ITEMS = 8;
const MAX_RUNTIME_SNAPSHOT_TEXT_LENGTH = 500;

export interface RuntimeSnapshotIo {
  mkdir: (targetPath: string) => Promise<void>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
}

export interface RuntimeSnapshotReadIo {
  exists: (targetPath: string) => boolean;
  readFile: (targetPath: string) => string;
}

export interface RuntimeSnapshotInput {
  replay: TurnReplay | null;
  observedAt?: string;
}

export interface RuntimeSnapshotWriteInput extends RuntimeSnapshotInput {
  homeDir: string;
  io?: RuntimeSnapshotIo;
}

export interface RuntimeSnapshotReadInput {
  homeDir?: string;
  io: RuntimeSnapshotReadIo;
}

export interface RuntimeSnapshot {
  schemaVersion: typeof RUNTIME_SNAPSHOT_SCHEMA_VERSION;
  observedAt: string;
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
}

export function createRuntimeSnapshotStatePath(homeDir: string): string {
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "runtime-snapshot.json"
  );
}

export function createRuntimeSnapshotFromReplay({
  replay,
  observedAt = new Date().toISOString()
}: RuntimeSnapshotInput): RuntimeSnapshot {
  if (!replay) {
    return {
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      observedAt,
      currentTurn: {
        state: "idle",
        source: "runtime-snapshot"
      },
      replay: {
        state: "empty",
        source: "runtime-snapshot"
      }
    };
  }

  const latestTimelineEvent = replay.timeline.at(-1);
  const latestApp = replay.transcript.apps[0];
  const screenshotSummaries = replay.transcript.screenshots
    .slice(-MAX_RUNTIME_SNAPSHOT_ITEMS)
    .map(summarizeScreenshot);
  const actionSummaries = replay.transcript.actions
    .slice(-MAX_RUNTIME_SNAPSHOT_ITEMS)
    .map(summarizeAction);
  const verificationSummaries = replay.transcript.actions
    .filter((action) => action.type === "verify")
    .slice(-MAX_RUNTIME_SNAPSHOT_ITEMS)
    .map(summarizeVerification);
  const timelineTail = replay.timeline
    .slice(-MAX_RUNTIME_SNAPSHOT_ITEMS)
    .map((event) => ({
      status: event.status,
      ...(event.message ? { message: sanitizeRuntimeSnapshotText(event.message) } : {}),
      ...(event.command ? { command: sanitizeRuntimeSnapshotText(event.command) } : {})
    }));
  const verificationCount = replay.transcript.actions
    .filter((action) => action.type === "verify")
    .length;
  const state = latestTimelineEvent?.status ?? readTurnStateFromOutcome(replay.transcript.outcome);
  const latestMessage = latestTimelineEvent?.message
    ? sanitizeRuntimeSnapshotText(latestTimelineEvent.message)
    : undefined;
  const latestAction = actionSummaries.at(-1);
  const latestVerification = verificationSummaries.at(-1);
  const latestScreenshot = screenshotSummaries.at(-1);

  return {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    observedAt,
    currentTurn: {
      state,
      ...(replay.transcript.command ? { command: sanitizeRuntimeSnapshotText(replay.transcript.command) } : {}),
      ...(latestApp?.name ? { targetApp: latestApp.name } : {}),
      ...(latestApp?.bundleId ? { targetBundleId: latestApp.bundleId } : {}),
      ...(replay.transcript.risk?.level ? { risk: replay.transcript.risk.level } : {}),
      ...(replay.transcript.planner?.providerLabel
        ? { plannerProvider: replay.transcript.planner.providerLabel }
        : {}),
      approvalRequired: replay.transcript.approvalRequired || state === "approval_required",
      approvalState: replay.transcript.approvalRequired || state === "approval_required"
        ? "required"
        : "not-required",
      stopState: isActiveTurnState(state) ? "available" : "inactive",
      ...(latestMessage ? { latestMessage } : {}),
      ...(latestAction ? { latestAction } : {}),
      ...(latestVerification ? { latestVerification } : {}),
      ...(latestScreenshot ? { latestScreenshot } : {}),
      source: "runtime-snapshot"
    },
    replay: {
      state: "available",
      outcome: replay.transcript.outcome,
      screenshotCount: replay.transcript.screenshots.length,
      actionCount: replay.transcript.actions.length,
      verificationCount,
      timelineCount: replay.timeline.length,
      ...(latestMessage ? { latestMessage } : {}),
      screenshots: screenshotSummaries,
      actions: actionSummaries,
      verifications: verificationSummaries,
      timelineTail,
      source: "runtime-snapshot"
    }
  };
}

export async function writeRuntimeSnapshot({
  homeDir,
  replay,
  observedAt,
  io = createDefaultRuntimeSnapshotIo()
}: RuntimeSnapshotWriteInput): Promise<RuntimeSnapshot> {
  const snapshot = createRuntimeSnapshotFromReplay({ replay, observedAt });
  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);

  await io.mkdir(path.dirname(snapshotPath));
  await io.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return snapshot;
}

export function readRuntimeSnapshotPanels({
  homeDir,
  io
}: RuntimeSnapshotReadInput): {
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
} {
  if (!homeDir) {
    return createMissingRuntimePanels("Home directory is required to locate the runtime snapshot.");
  }

  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  if (!io.exists(snapshotPath)) {
    return createMissingRuntimePanels("Runtime snapshot has not been recorded yet.", snapshotPath);
  }

  try {
    const parsed = JSON.parse(io.readFile(snapshotPath)) as unknown;
    const snapshot = readRecord(parsed);
    const currentTurn = readRecord(snapshot?.currentTurn);
    const replay = readRecord(snapshot?.replay);

    if (snapshot?.schemaVersion !== RUNTIME_SNAPSHOT_SCHEMA_VERSION || !currentTurn || !replay) {
      return createMissingRuntimePanels("Runtime snapshot is not a valid skfiy snapshot.", snapshotPath);
    }

    return {
      currentTurn: { ...currentTurn },
      replay: { ...replay }
    };
  } catch (error) {
    return createMissingRuntimePanels(
      error instanceof Error ? error.message : String(error),
      snapshotPath
    );
  }
}

function createMissingRuntimePanels(
  reason: string,
  pathValue?: string
): {
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
} {
  return {
    currentTurn: {
      state: "idle",
      source: "runtime-snapshot",
      reason,
      ...(pathValue ? { path: pathValue } : {})
    },
    replay: {
      state: "empty",
      source: "runtime-snapshot",
      reason,
      ...(pathValue ? { path: pathValue } : {})
    }
  };
}

function readTurnStateFromOutcome(outcome: string): string {
  switch (outcome) {
    case "approval_required":
      return "approval_required";
    case "verification_failed":
      return "needs_confirmation";
    case "failed":
      return "failed";
    case "completed":
      return "completed";
    default:
      return "executing";
  }
}

function isActiveTurnState(state: string): boolean {
  return state === "observing" || state === "executing" || state === "approval_required";
}

function summarizeScreenshot(screenshot: TurnTranscriptScreenshot): Record<string, unknown> {
  return {
    stage: screenshot.stage,
    path: sanitizeRuntimeSnapshotText(screenshot.path),
    bundleId: screenshot.bundleId,
    ...(screenshot.pid ? { pid: screenshot.pid } : {}),
    ...(screenshot.accessibilityTrusted !== undefined
      ? { accessibilityTrusted: screenshot.accessibilityTrusted }
      : {}),
    recommendation: screenshot.grounding.recommendation,
    sourceCount: screenshot.grounding.sources.length
  };
}

function summarizeAction(action: TurnTranscriptAction): Record<string, unknown> {
  switch (action.type) {
    case "plan":
      return {
        type: action.type,
        providerLabel: action.providerLabel,
        command: sanitizeRuntimeSnapshotText(action.command),
        ...(action.rationale ? { rationale: sanitizeRuntimeSnapshotText(action.rationale) } : {})
      };
    case "open_session":
      return { type: action.type, appName: action.appName, pid: action.pid };
    case "activate_app":
      return {
        type: action.type,
        appName: action.appName,
        bundleId: action.bundleId,
        ...(action.pid ? { pid: action.pid } : {})
      };
    case "type_text":
      return {
        type: action.type,
        textLength: action.text.length
      };
    case "press_key":
      return { type: action.type, key: action.key };
    case "observe_finder_selection":
      return {
        type: action.type,
        source: action.source,
        ...(action.frontmostBundleId ? { frontmostBundleId: action.frontmostBundleId } : {}),
        ...(action.targetPath ? { targetPath: sanitizeRuntimeSnapshotText(action.targetPath) } : {}),
        selectedCount: action.selectedCount
      };
    case "preview_finder_plan":
      return {
        type: action.type,
        rootPath: sanitizeRuntimeSnapshotText(action.rootPath),
        operationCount: action.operationCount,
        destructiveOperationCount: action.destructiveOperationCount,
        createFolderCount: action.createFolderCount,
        moveFileCount: action.moveFileCount
      };
    case "confirm_finder_plan":
      return {
        type: action.type,
        rootPath: sanitizeRuntimeSnapshotText(action.rootPath),
        operationCount: action.operationCount,
        destructiveOperationCount: action.destructiveOperationCount,
        reason: sanitizeRuntimeSnapshotText(action.reason)
      };
    case "recover":
      return {
        type: action.type,
        action: action.action,
        stage: action.stage,
        reason: sanitizeRuntimeSnapshotText(action.reason)
      };
    case "verify":
      return summarizeVerification(action);
    case "switch_control":
      return {
        type: action.type,
        from: action.from,
        to: action.to,
        stage: action.stage,
        reason: sanitizeRuntimeSnapshotText(action.reason)
      };
  }
}

function summarizeVerification(
  action: Extract<TurnTranscriptAction, { type: "verify" }>
): Record<string, unknown> {
  return {
    type: action.type,
    actionType: action.actionType,
    status: action.status,
    ...(action.message ? { message: sanitizeRuntimeSnapshotText(action.message) } : {}),
    ...(action.reason ? { reason: sanitizeRuntimeSnapshotText(action.reason) } : {})
  };
}

function sanitizeRuntimeSnapshotText(value: string): string {
  const redacted = value
    .replace(/\b(token|password|secret|api[_-]?key)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");

  return redacted.length > MAX_RUNTIME_SNAPSHOT_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_RUNTIME_SNAPSHOT_TEXT_LENGTH - 1)}...`
    : redacted;
}

function createDefaultRuntimeSnapshotIo(): RuntimeSnapshotIo {
  return {
    mkdir: async (targetPath) => {
      await mkdir(targetPath, { recursive: true });
    },
    writeFile
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
