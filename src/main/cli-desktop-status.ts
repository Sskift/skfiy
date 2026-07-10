import type {
  DesktopSessionStatus,
  PermissionSummary
} from "./computer-use/types.js";
import { readErrorMessage } from "./cli-record-utils.js";

export interface PermissionStatusReader {
  getPermissions: () => Promise<PermissionSummary>;
}

export interface DesktopSessionStatusReader {
  getDesktopSessionStatus: () => Promise<DesktopSessionStatus>;
}

export async function readPermissionStatesForStatus(
  helper: PermissionStatusReader
): Promise<Record<string, unknown>> {
  try {
    const permissions = await helper.getPermissions();

    return createPermissionStates(permissions);
  } catch (error) {
    return {
      ...createUnknownPermissionStates(),
      reason: readErrorMessage(error)
    };
  }
}

export function createPermissionStates(permissions: PermissionSummary): Record<string, unknown> {
  return {
    screenRecording: permissions.screenRecording.state,
    accessibility: permissions.accessibility.state,
    finderAutomation: "unknown"
  };
}

export function createUnknownPermissionStates(): Record<string, "unknown"> {
  return {
    screenRecording: "unknown",
    accessibility: "unknown",
    finderAutomation: "unknown"
  };
}

export async function readDesktopSessionForStatus(
  helper: DesktopSessionStatusReader
): Promise<Record<string, unknown>> {
  try {
    const status = await helper.getDesktopSessionStatus();

    return {
      state: status.controllable ? "controllable" : "blocked",
      ...status
    };
  } catch (error) {
    return {
      state: "unknown",
      reason: readErrorMessage(error)
    };
  }
}
