import { describe, expect, it } from "vitest";
import { readPermissionsForRenderer } from "./permissions";
import type { PermissionSummary } from "./computer-use/types";

describe("readPermissionsForRenderer", () => {
  it("returns unknown permission states without escalating to a task failure", async () => {
    const onErrorMessages: string[] = [];

    await expect(
      readPermissionsForRenderer({
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => {
            throw new Error("helper missing");
          }
        },
        onError: (message) => onErrorMessages.push(message)
      })
    ).resolves.toEqual({
      screenRecording: { state: "unknown" },
      accessibility: { state: "unknown" },
      microphone: { state: "unknown" }
    });
    expect(onErrorMessages).toEqual(["helper missing"]);
  });
});
