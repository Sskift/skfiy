import type { PermissionSummary } from "./computer-use/types.js";

export const UNKNOWN_PERMISSION_SUMMARY: PermissionSummary = {
  screenRecording: { state: "unknown" },
  accessibility: { state: "unknown" },
  microphone: { state: "unknown" },
  speechRecognition: { state: "unknown" }
};

interface PermissionsReader {
  getPermissions: () => Promise<PermissionSummary>;
}

export async function readPermissionsForRenderer({
  helper,
  onError
}: {
  helper: PermissionsReader;
  onError?: (message: string) => void;
}): Promise<PermissionSummary> {
  try {
    return await helper.getPermissions();
  } catch (error) {
    onError?.(error instanceof Error ? error.message : "Permission status could not be read.");
    return UNKNOWN_PERMISSION_SUMMARY;
  }
}
