import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { TurnReplay } from "./computer-use/turn-replay-store.js";

export const RUNTIME_SNAPSHOT_SCHEMA_VERSION = 1;

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
  const verificationCount = replay.transcript.actions
    .filter((action) => action.type === "verify")
    .length;
  const state = latestTimelineEvent?.status ?? readTurnStateFromOutcome(replay.transcript.outcome);
  const latestMessage = latestTimelineEvent?.message;

  return {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    observedAt,
    currentTurn: {
      state,
      ...(replay.transcript.command ? { command: replay.transcript.command } : {}),
      ...(latestApp?.name ? { targetApp: latestApp.name } : {}),
      ...(latestApp?.bundleId ? { targetBundleId: latestApp.bundleId } : {}),
      ...(replay.transcript.risk?.level ? { risk: replay.transcript.risk.level } : {}),
      ...(replay.transcript.planner?.providerLabel
        ? { plannerProvider: replay.transcript.planner.providerLabel }
        : {}),
      approvalRequired: replay.transcript.approvalRequired || state === "approval_required",
      ...(latestMessage ? { latestMessage } : {}),
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
