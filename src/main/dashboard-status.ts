export const DASHBOARD_PANEL_IDS = [
  "runtime-health",
  "permissions",
  "current-turn",
  "replay",
  "app-policy",
  "smoke-evidence",
  "long-horizon-supervision",
  "alerts",
  "dogfood-release"
] as const;

export type DashboardPanelId = typeof DASHBOARD_PANEL_IDS[number];

export interface DashboardPanel {
  id: DashboardPanelId;
  title: string;
  signals: string[];
  actions: string[];
}

export interface DashboardDescriptorInput {
  port?: number;
  requestedHost?: string;
}

export interface DashboardDescriptor {
  schemaVersion: 1;
  bind: {
    host: "127.0.0.1";
    port: number;
  };
  url: string;
  auth: {
    mode: "optional-token";
    tokenPrinted: false;
  };
  updates: {
    transport: "sse";
    scope: "local-http";
  };
  eventStore: {
    mode: "append-only";
    requiredForExecution: false;
  };
  panels: DashboardPanel[];
}

const DASHBOARD_PANELS: DashboardPanel[] = [
  {
    id: "runtime-health",
    title: "Runtime health",
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
    ],
    actions: []
  },
  {
    id: "permissions",
    title: "Permission health",
    signals: [
      "screen-recording",
      "accessibility",
      "microphone",
      "speech-recognition",
      "finder-automation",
      "chrome-extension-connection"
    ],
    actions: []
  },
  {
    id: "current-turn",
    title: "Current turn",
    signals: [
      "voice-provider",
      "transcript",
      "target-app",
      "policy-decision",
      "risk",
      "status"
    ],
    actions: ["stop-current-turn"]
  },
  {
    id: "replay",
    title: "Replay timeline",
    signals: [
      "screenshots",
      "ocr-labels",
      "accessibility-coverage",
      "actions",
      "verification-decisions",
      "approval-decisions"
    ],
    actions: []
  },
  {
    id: "app-policy",
    title: "App policy",
    signals: [
      "app-allow-ask-deny",
      "chrome-host-allow-ask-deny"
    ],
    actions: []
  },
  {
    id: "smoke-evidence",
    title: "Smoke evidence",
    signals: [
      "ui",
      "ghostty",
      "chrome",
      "finder",
      "voice",
      "money-run",
      "pass-or-block-reasons"
    ],
    actions: []
  },
  {
    id: "long-horizon-supervision",
    title: "Long-horizon supervision",
    signals: [
      "tmux-money-run-status",
      "active-pane-summary",
      "recent-risk-markers",
      "read-only-probe-evidence"
    ],
    actions: []
  },
  {
    id: "alerts",
    title: "Alerts",
    signals: [
      "permission-missing",
      "desktop-locked-or-asleep",
      "helper-not-signed",
      "extension-disconnected",
      "smoke-evidence-stale",
      "release-artifact-older-than-head"
    ],
    actions: []
  },
  {
    id: "dogfood-release",
    title: "Dogfood/release",
    signals: [
      "current-alpha",
      "manifest",
      "zip-checksum",
      "accepted-reports",
      "cohort-coverage"
    ],
    actions: []
  }
];

export function createDashboardPanels(): DashboardPanel[] {
  return DASHBOARD_PANELS.map((panel) => ({
    ...panel,
    signals: [...panel.signals],
    actions: [...panel.actions]
  }));
}

export function createDashboardDescriptor(
  input: DashboardDescriptorInput = {}
): DashboardDescriptor {
  const port = normalizeDashboardPort(input.port);

  return {
    schemaVersion: 1,
    bind: {
      host: "127.0.0.1",
      port
    },
    url: `http://127.0.0.1:${port}/`,
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
    },
    panels: createDashboardPanels()
  };
}

function normalizeDashboardPort(port = 0): number {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid dashboard port: ${String(port)}`);
  }

  return port;
}
