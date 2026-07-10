import { describe, expect, it } from "vitest";
import {
  createChromeExtensionAdapterStatus,
  createChromePageControlCapability,
  createChromePageSafetyCapability,
  readConnectionState
} from "./cli-chrome-capabilities";

describe("CLI Chrome capabilities", () => {
  it("marks page-safety ready only with native messaging, ask policy, and page observe heartbeat", () => {
    expect(createChromePageSafetyCapability({
      extensionState: "connected",
      nativeHostState: "installed",
      liveConnection: "connected",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      cliShimPath: "/repo/dist/skfiy",
      hostPolicy: {
        schemaVersion: 1,
        state: "default",
        path: "/policy.json",
        policy: {
          defaultMode: "ask",
          allowedHosts: ["allowed.example"],
          currentTurnAllowedHosts: ["turn.example"],
          blockedHosts: ["blocked.example"]
        }
      },
      connection: {
        state: "connected",
        liveConnection: "connected",
        messageType: "skfiy.page.observe",
        path: "/connection.json",
        ageSeconds: 1,
        observedAt: "2026-07-07T00:00:00.000Z",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        requestId: "req-1"
      }
    })).toEqual({
      schemaVersion: 1,
      capability: "chrome-extension-page-safety",
      capable: true,
      state: "ready",
      nextAction: "Chrome extension page safety is evidenced by a fresh page observation heartbeat and ask-by-default host policy.",
      evidence: {
        nativeMessaging: true,
        nativeHostState: "installed",
        hostPolicy: {
          state: "default",
          defaultMode: "ask",
          failClosed: true,
          path: "/policy.json",
          entryCount: 3
        },
        liveConnection: {
          state: "connected",
          liveConnection: "connected",
          messageType: "skfiy.page.observe",
          pageObservationHeartbeat: true,
          path: "/connection.json",
          ageSeconds: 1,
          observedAt: "2026-07-07T00:00:00.000Z",
          launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
          requestId: "req-1"
        },
        extensionState: "connected",
        extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
        cliShimPath: "/repo/dist/skfiy"
      }
    });
  });

  it("turns page-control machine next actions into operator-readable commands", () => {
    const capability = createChromePageControlCapability({
      reported: {
        state: "blocked_by_host_policy",
        nextAction: "allow_host",
        activeTab: {
          host: "example.com"
        },
        blockers: [{
          code: "blocked_by_host_policy"
        }],
        capabilities: {
          observe: true
        }
      },
      source: "extension.connection.pageControl",
      extensionState: "connected",
      nativeHostState: "installed",
      liveConnection: "connected",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
    });

    expect(capability).toEqual(expect.objectContaining({
      schemaVersion: 1,
      capability: "chrome-extension-page-control",
      state: "blocked_by_host_policy",
      source: "extension.connection.pageControl",
      capabilities: {
        observe: true
      },
      nextAction: "Run `skfiy chrome policy set --host example.com --action allow-current-turn` or approve the host in Dashboard Chrome policy."
    }));
  });

  it("adds derived page capabilities to adapter status without reading Chrome state", () => {
    const status = createChromeExtensionAdapterStatus({
      state: "installed",
      cliShimPath: "/repo/dist/skfiy",
      manifestPath: "/manifest.json",
      extensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
      allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
      expectedAllowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
    }, undefined, {
      schemaVersion: 1,
      state: "default",
      path: "/policy.json",
      policy: {
        defaultMode: "ask",
        allowedHosts: [],
        currentTurnAllowedHosts: [],
        blockedHosts: []
      }
    });

    expect(readConnectionState({
      state: "connected",
      liveConnection: "connected",
      path: "/connection.json"
    })).toBe("connected");
    expect(status).toEqual(expect.objectContaining({
      state: "native-host-installed",
      bridge: "native-messaging",
      liveConnection: "unknown",
      nativeHostState: "installed",
      manifestPath: "/manifest.json",
      capabilities: {
        pageSafety: false,
        pageControl: false
      },
      pageSafety: expect.objectContaining({
        state: "needs-action",
        capable: false
      }),
      pageControl: expect.objectContaining({
        state: "needs-action",
        source: "cli-status-derived"
      })
    }));
  });
});
