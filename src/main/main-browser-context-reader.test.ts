import { describe, expect, it } from "vitest";

import {
  createBrowserPageContextReadFailure,
  readLatestBrowserPageContext
} from "./main-browser-context-reader";
import type { ChromeExtensionConnectionStatus } from "./chrome-native-host";

describe("main Browser Context reader", () => {
  it("reads Chrome extension connection status into Browser Context", async () => {
    const connection: ChromeExtensionConnectionStatus = {
      state: "connected",
      liveConnection: "connected",
      path: "/tmp/skfiy/chrome-connection.json",
      observedAt: "2026-07-07T00:00:00.000Z",
      pageControl: {
        state: "ready"
      },
      pageObservation: {
        url: "https://example.test/current",
        title: "Current tab",
        visibleText: "Visible page text",
        observedAt: "2026-07-07T00:00:01.000Z"
      }
    };
    const calls: string[] = [];

    await expect(readLatestBrowserPageContext({
      homeDir: "/Users/tester",
      readConnectionStatus: async ({ homeDir }) => {
        calls.push(homeDir);
        return connection;
      }
    })).resolves.toEqual({
      state: "ready",
      url: "https://example.test/current",
      title: "Current tab",
      visibleText: "Visible page text",
      observedAt: "2026-07-07T00:00:01.000Z"
    });
    expect(calls).toEqual(["/Users/tester"]);
  });

  it("maps Browser Context read failures to the unavailable fallback", async () => {
    await expect(readLatestBrowserPageContext({
      homeDir: "/Users/tester",
      readConnectionStatus: async () => {
        throw new Error("native host missing");
      }
    })).resolves.toEqual({
      state: "unavailable",
      reason: "native host missing",
      nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
    });

    expect(createBrowserPageContextReadFailure("boom")).toEqual({
      state: "unavailable",
      reason: "Chrome extension diagnostics could not be read.",
      nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
    });
  });
});
