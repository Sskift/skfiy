import { describe, expect, it } from "vitest";
import {
  DASHBOARD_PANEL_IDS,
  createDashboardDescriptor,
  createDashboardPanels
} from "./dashboard-status";

describe("dashboard status descriptor", () => {
  it("creates a loopback-only dashboard descriptor with no logged token", () => {
    const descriptor = createDashboardDescriptor({
      port: 8787,
      requestedHost: "0.0.0.0"
    });

    expect(descriptor).toMatchObject({
      schemaVersion: 1,
      bind: {
        host: "127.0.0.1",
        port: 8787
      },
      url: "http://127.0.0.1:8787/",
      auth: {
        mode: "optional-token",
        tokenPrinted: false
      },
      updates: {
        transport: "sse",
        scope: "local-http"
      },
      eventStore: {
        mode: "append-only",
        requiredForExecution: false
      }
    });
    expect(JSON.stringify(descriptor)).not.toContain("0.0.0.0");
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  it("lists the planned dashboard panels in operator-plane order", () => {
    const panels = createDashboardPanels();

    expect(DASHBOARD_PANEL_IDS).toEqual([
      "runtime-health",
      "operator-readiness",
      "permissions",
      "current-turn",
      "replay",
      "app-policy",
      "smoke-evidence",
      "long-horizon-supervision",
      "alerts",
      "dogfood-release"
    ]);
    expect(panels.map((panel) => panel.id)).toEqual(DASHBOARD_PANEL_IDS);
    expect(panels.map((panel) => panel.title)).toEqual([
      "Runtime health",
      "Operator readiness",
      "Permission health",
      "Current turn",
      "Replay timeline",
      "App policy",
      "Smoke evidence",
      "Long-horizon supervision",
      "Alerts",
      "Dogfood/release"
    ]);
  });

  it("keeps panel metadata focused on the planned audit signals", () => {
    const panels = createDashboardPanels();

    expect(panels.find((panel) => panel.id === "runtime-health")).toMatchObject({
      signals: [
        "app",
        "helper",
        "dashboard",
        "extension",
        "pid",
        "uptime",
        "version",
        "bundle-id",
        "signing"
      ]
    });
    expect(panels.find((panel) => panel.id === "operator-readiness")).toMatchObject({
      signals: [
        "command-surface",
        "extension-readiness",
        "packaged-binary",
        "recent-smoke-evidence"
      ]
    });
    expect(panels.find((panel) => panel.id === "current-turn")).toMatchObject({
      signals: [
        "voice-provider",
        "transcript",
        "target-app",
        "policy-decision",
        "risk",
        "status"
      ],
      actions: ["stop-current-turn"]
    });
    expect(panels.find((panel) => panel.id === "app-policy")).toMatchObject({
      actions: [
        "show-chrome-host-policy",
        "set-chrome-host-policy",
        "reset-chrome-host-policy"
      ]
    });
    expect(panels.find((panel) => panel.id === "alerts")).toMatchObject({
      signals: [
        "permission-missing",
        "desktop-locked-or-asleep",
        "helper-not-signed",
        "extension-disconnected",
        "smoke-evidence-stale",
        "release-artifact-older-than-head"
      ]
    });
  });

  it("embeds the panel list in the descriptor for a future server or CLI response", () => {
    expect(createDashboardDescriptor({ port: 0 }).panels).toEqual(createDashboardPanels());
  });
});
