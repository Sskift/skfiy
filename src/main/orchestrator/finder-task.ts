import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { createFinderOrganizationPlan } from "../computer-use/finder-organizer.js";
import type { RiskDecision } from "../../shared/types.js";

const FINDER_APP_NAME = "Finder";
const FINDER_ORGANIZE_PREFIX = "整理 Finder 测试文件夹 ";

const FINDER_ORGANIZATION_RISK: RiskDecision = {
  level: "medium",
  reason: "Finder organization moves files inside a local test folder.",
  requiresApproval: true
};

export type FinderTaskEvent =
  | {
      type: "started";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "approval_required";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "locating_app";
      appName: string;
    }
  | {
      type: "action_verified";
      actionType: "create_folder" | "move_file";
      status: "passed";
      message: string;
    }
  | {
      type: "verification_failed";
      stage: "input" | "file_operation";
      reason: string;
    }
  | {
      type: "completed";
      command: string;
      summary: string;
    };

export interface FinderTaskOptions {
  approved?: boolean;
}

export async function* runFinderOrganizationTask(
  input: string,
  options: FinderTaskOptions = {}
): AsyncGenerator<FinderTaskEvent> {
  const parsed = parseFinderOrganizationIntent(input);
  const command = parsed.ok ? parsed.rootPath : input.trim();

  yield {
    type: "started",
    command,
    risk: parsed.ok ? FINDER_ORGANIZATION_RISK : blockedDecision(parsed.reason)
  };

  if (!parsed.ok) {
    yield {
      type: "verification_failed",
      stage: "input",
      reason: parsed.reason
    };
    return;
  }

  yield {
    type: "approval_required",
    command: parsed.rootPath,
    risk: FINDER_ORGANIZATION_RISK
  };

  if (!options.approved) {
    return;
  }

  const rootPath = parsed.rootPath;
  const rootStatus = await readDirectoryStatus(rootPath);
  if (!rootStatus.ok) {
    yield {
      type: "verification_failed",
      stage: "file_operation",
      reason: rootStatus.reason
    };
    return;
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const plan = createFinderOrganizationPlan({
    rootPath,
    entries: entries.map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file"
    }))
  });

  yield {
    type: "locating_app",
    appName: FINDER_APP_NAME
  };

  for (const operation of plan.operations) {
    if (operation.type === "create_folder") {
      await mkdir(operation.path, { recursive: true });
      yield {
        type: "action_verified",
        actionType: "create_folder",
        status: "passed",
        message: `Created folder: ${operation.path}`
      };
      continue;
    }

    if (await pathExists(operation.to)) {
      yield {
        type: "verification_failed",
        stage: "file_operation",
        reason: `Destination already exists: ${operation.to}`
      };
      return;
    }

    await rename(operation.from, operation.to);
    yield {
      type: "action_verified",
      actionType: "move_file",
      status: "passed",
      message: `Moved file: ${operation.from} -> ${operation.to}`
    };
  }

  yield {
    type: "completed",
    command: rootPath,
    summary: "Finder test folder organized."
  };
}

export function parseFinderOrganizationIntent(input: string):
  | { ok: true; rootPath: string }
  | { ok: false; reason: string } {
  const trimmed = input.trim();

  if (!trimmed.startsWith(FINDER_ORGANIZE_PREFIX)) {
    return {
      ok: false,
      reason: "Finder organization requires: 整理 Finder 测试文件夹 <absolute-path>"
    };
  }

  const rootPath = trimmed.slice(FINDER_ORGANIZE_PREFIX.length).trim();
  if (!path.isAbsolute(rootPath)) {
    return {
      ok: false,
      reason: "Finder organization requires an absolute folder path."
    };
  }

  return {
    ok: true,
    rootPath: path.resolve(rootPath)
  };
}

function blockedDecision(reason: string): RiskDecision {
  return {
    level: "blocked",
    reason,
    requiresApproval: true
  };
}

async function readDirectoryStatus(rootPath: string): Promise<
  | { ok: true }
  | { ok: false; reason: string }
> {
  try {
    const root = await stat(rootPath);
    return root.isDirectory()
      ? { ok: true }
      : { ok: false, reason: `Finder organization root is not a directory: ${rootPath}` };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error
        ? error.message
        : `Finder organization root is unavailable: ${rootPath}`
    };
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}
