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
      microphone: { state: "unknown" },
      speechRecognition: { state: "unknown" }
    });
    expect(onErrorMessages).toEqual(["helper missing"]);
  });

  it("passes Speech Recognition permission through to the renderer summary", async () => {
    await expect(
      readPermissionsForRenderer({
        helper: {
          getPermissions: async (): Promise<PermissionSummary> => ({
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" },
            microphone: { state: "granted" },
            speechRecognition: { state: "not-determined" }
          })
        }
      })
    ).resolves.toEqual({
      screenRecording: { state: "granted" },
      accessibility: { state: "granted" },
      microphone: { state: "granted" },
      speechRecognition: { state: "not-determined" }
    });
  });
});
