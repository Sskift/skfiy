import { describe, expect, it } from "vitest";
import http from "node:http";
import { waitFor } from "@testing-library/react";
import { createDashboardDescriptor } from "./dashboard-status";
import {
  createDashboardHttpResponse,
  startDashboardServer
} from "./dashboard-server";

function readUrl(url: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body
        });
      });
    }).on("error", reject);
  });
}

function requestUrl(
  url: string,
  {
    method = "GET",
    body
  }: {
    method?: string;
    body?: string;
  } = {}
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method,
      headers: body ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      } : undefined
    }, (response) => {
      let responseBody = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: responseBody
        });
      });
    });

    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function readFirstSseEvent(url: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  event: string;
}> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let event = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        event += chunk;

        if (event.includes("\n\n")) {
          request.destroy();
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            event: event.slice(0, event.indexOf("\n\n") + 2)
          });
        }
      });
      response.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "ECONNRESET") {
          reject(error);
        }
      });
      response.on("end", () => {
        reject(new Error(`SSE response ended before an event: ${event}`));
      });
    });

    request.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") {
        reject(error);
      }
    });
    request.setTimeout(1_000, () => {
      request.destroy(new Error("Timed out waiting for first SSE event."));
    });
  });
}

async function renderDashboardHtmlWithSnapshot(
  snapshot: Record<string, unknown>
): Promise<() => void> {
  const response = createDashboardHttpResponse({
    method: "GET",
    url: "http://127.0.0.1:8787/"
  });
  const scriptMatch = response.body.match(/<script>([\s\S]*)<\/script>/);
  const previousFetch = window.fetch;
  const previousEventSource = window.EventSource;

  Object.defineProperty(window, "EventSource", {
    configurable: true,
    writable: true,
    value: undefined
  });
  window.fetch = async () => ({
    ok: true,
    json: async () => snapshot
  } as Response);

  document.open();
  document.write(response.body.replace(/<script>[\s\S]*<\/script>/, ""));
  document.close();
  window.eval(scriptMatch?.[1] ?? "");

  await waitFor(() => {
    expect(document.querySelector("[data-snapshot-state]")?.textContent)
      .toContain("Snapshot");
  });

  return () => {
    window.fetch = previousFetch;
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: previousEventSource
    });
    document.body.innerHTML = "";
  };
}

describe("dashboard loopback HTTP response helper", () => {
  it("serves the descriptor JSON without echoing requested host or tokens", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://0.0.0.0:9999/descriptor.json"
      },
      {
        port: 8787,
        requestedHost: "0.0.0.0"
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");

    const descriptor = JSON.parse(response.body);
    expect(descriptor).toEqual(createDashboardDescriptor({ port: 8787 }));
    expect(descriptor.bind.host).toBe("127.0.0.1");
    expect(response.body).not.toContain("0.0.0.0");
    expect(response.body).not.toContain("token=");
  });

  it("serves a dashboard HTML shell that renders snapshot-backed operator panels", () => {
    const response = createDashboardHttpResponse({
      method: "GET",
      url: "http://127.0.0.1:8787/"
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<!doctype html>");
    expect(response.body).toContain("skfiy Dashboard");
    expect(response.body).toContain("/descriptor.json");
    expect(response.body).toContain("/snapshot.json");
    expect(response.body).toContain("/api/evidence-summary");
    expect(response.body).toContain('aria-label="skfiy user dashboard"');
    expect(response.body).toContain('data-user-panel="home"');
    expect(response.body).toContain('data-user-panel="approvals"');
    expect(response.body).toContain('data-user-panel="activity"');
    expect(response.body).toContain('data-user-panel="apps-sites"');
    expect(response.body).toContain('data-user-panel="permissions"');
    expect(response.body).toContain('data-user-panel="agents"');
    expect(response.body).toContain("renderUserDashboard(snapshot)");
    expect(response.body).toContain("readUserNextAction(snapshot)");
    expect(response.body).toContain("Advanced Diagnostics");
    expect(response.body).toContain("runtime-health");
    expect(response.body).toContain("operator-readiness");
    expect(response.body).toContain("/api/operator-evidence");
    expect(response.body).toContain("data-evidence-summary-panel");
    expect(response.body).toContain("data-evidence-summary-status");
    expect(response.body).toContain("data-evidence-summary-body");
    expect(response.body).toContain("data-operator-evidence-panel");
    expect(response.body).toContain("data-operator-evidence-status");
    expect(response.body).toContain("data-operator-evidence-body");
    expect(response.body).toContain("data-dashboard-root");
    expect(response.body).toContain("data-snapshot-state");
    expect(response.body).toContain("Loading snapshot");
    expect(response.body).toContain('data-panel-body="runtime-health"');
    expect(response.body).toContain('data-panel-body="operator-readiness"');
    expect(response.body).toContain('data-panel-body="long-horizon-supervision"');
    expect(response.body).toContain('data-panel-body="dogfood-release"');
    expect(response.body).toContain('new EventSource("/events")');
    expect(response.body).toContain('fetch("/snapshot.json", { cache: "no-store" })');
    expect(response.body).toContain("/api/chrome-host-policy");
    expect(response.body).toContain("renderEvidenceSummaryPanel(snapshot)");
    expect(response.body).toContain("createEvidenceSummaryLanes(snapshot)");
    expect(response.body).toContain("createChromeSetupGuide(extension, nativeHost, chromeArtifact)");
    expect(response.body).toContain("pageSafetyEvidenceState(pageSafety.state)");
    expect(response.body).toContain("data-evidence-lanes");
    expect(response.body).toContain("data-evidence-lane");
    expect(response.body).toContain("data-evidence-next-actions");
    expect(response.body).toContain("data-evidence-commands");
    expect(response.body).toContain("skfiy chrome install-host --extension-id");
    expect(response.body).toContain("renderAppPolicyPanel(snapshot)");
    expect(response.body).toContain("createChromePageSafetyRows(chromeArtifact)");
    expect(response.body).toContain("createChromePageControlRows(snapshot, chromeArtifact)");
    expect(response.body).toContain("chrome page safety");
    expect(response.body).toContain("chrome pageControl");
    expect(response.body).toContain("pageControl capable");
    expect(response.body).toContain("active tab");
    expect(response.body).toContain("content script");
    expect(response.body).toContain("DOM actions");
    expect(response.body).toContain("click/fill/submit/scroll");
    expect(response.body).toContain("pageControl reason");
    expect(response.body).toContain("pageControl next");
    expect(response.body).toContain("pageControlEvidenceState(pageControl.state)");
    expect(response.body).toContain("sensitive-form-prefill");
    expect(response.body).toContain("createFinderSmokeRows(finderArtifact)");
    expect(response.body).toContain("desktop preflight");
    expect(response.body).toContain("frontmost bundle");
    expect(response.body).toContain("finder observation");
    expect(response.body).toContain("data-chrome-policy-host-input");
    expect(response.body).toContain("data-chrome-policy-feedback");
    expect(response.body).toContain('createChromePolicyButton("refresh", "Refresh")');
    expect(response.body).toContain('createChromePolicyButton("always-allow", "Always")');
    expect(response.body).toContain('createChromePolicyButton("block", "Block")');
    expect(response.body).toContain('createChromePolicyButton("ask", "Ask")');
    expect(response.body).toContain('createChromePolicyButton("reset", "Reset")');
    expect(response.body).toContain("formatChromePolicyEntries(hostPolicy, policy)");
    expect(response.body).toContain("renderLongHorizonPanel");
    expect(response.body).toContain("renderOperatorEvidencePanel(snapshot)");
    expect(response.body).toContain("renderOperatorReadinessPanel(snapshot)");
    expect(response.body).toContain("groupAlerts(alerts)");
    expect(response.body).toContain("createAlertBand(group)");
    expect(response.body).toContain("data-alert-groups");
    expect(response.body).toContain("data-alert-group");
    expect(response.body).toContain("Desktop session");
    expect(response.body).toContain("Chrome bridge");
    expect(response.body).toContain("RUNTIME_SNAPSHOT_STALE_SECONDS");
    expect(response.body).toContain("readRuntimeSnapshotFreshness(snapshot, turn)");
    expect(response.body).toContain("formatRuntimeAction(turn.latestAction)");
    expect(response.body).toContain("formatRuntimeVerification(turn.latestVerification)");
    expect(response.body).toContain("formatRuntimeScreenshot(turn.latestScreenshot)");
    expect(response.body).toContain("formatRuntimeTimelineTail(replay.timelineTail)");
    expect(response.body).toContain("snapshot freshness");
    expect(response.body).toContain("snapshot age");
    expect(response.body).toContain('row("approval", turn.approvalState)');
    expect(response.body).toContain('row("stop", turn.stopState)');
    expect(response.body).toContain('row("latest verify", formatRuntimeVerification(turn.latestVerification))');
    expect(response.body).toContain('row("timeline tail", formatRuntimeTimelineTail(replay.timelineTail))');
    expect(response.body).not.toContain("token=");
  });

  it("renders live runtime snapshot freshness and latest turn summaries in the dashboard shell", async () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const cleanup = await renderDashboardHtmlWithSnapshot({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:01:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        runtimeSnapshot: {
          state: "available",
          observedAt: "2026-06-20T00:00:20.000Z"
        }
      },
      operatorReadiness: { state: "ready" },
      permissions: {},
      currentTurn: {
        state: "executing",
        source: "runtime-snapshot",
        command: "pwd",
        targetApp: "Ghostty",
        latestAction: {
          type: "type_text",
          textLength: 3
        },
        latestVerification: {
          type: "verify",
          actionType: "press_key",
          status: "passed",
          message: "enter accepted"
        },
        latestScreenshot: {
          stage: "after",
          path: "/tmp/after.png",
          recommendation: "structured_first",
          sourceCount: 2
        }
      },
      replay: {
        state: "available",
        source: "runtime-snapshot",
        screenshotCount: 2,
        actionCount: 3,
        verificationCount: 1,
        screenshots: [
          { stage: "before", path: "/tmp/before.png" },
          {
            stage: "after",
            path: "/tmp/after.png",
            recommendation: "structured_first",
            sourceCount: 2
          }
        ],
        actions: [
          { type: "plan", providerLabel: "External CUA", command: "pwd" },
          { type: "type_text", textLength: 3 }
        ],
        verifications: [
          {
            type: "verify",
            actionType: "press_key",
            status: "passed",
            message: "enter accepted"
          }
        ],
        timelineTail: [
          { status: "executing", message: "Typing command." },
          { status: "completed", command: "pwd" }
        ]
      },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "unknown" },
      alerts: []
    });

    const currentTurnPanel = document.querySelector('[data-panel-id="current-turn"]');
    const replayPanel = document.querySelector('[data-panel-id="replay"]');

    expect(currentTurnPanel?.textContent).toContain("Stale");
    expect(currentTurnPanel?.textContent).toContain("snapshot freshness");
    expect(currentTurnPanel?.textContent).toContain("stale");
    expect(currentTurnPanel?.textContent).toContain("40s old (2026-06-20T00:00:20.000Z)");
    expect(currentTurnPanel?.textContent).toContain("runtime-snapshot");
    expect(currentTurnPanel?.textContent).toContain("type_text: 3 chars");
    expect(currentTurnPanel?.textContent).toContain("press_key: passed - enter accepted");
    expect(currentTurnPanel?.textContent).toContain("after: /tmp/after.png (structured_first 2 sources)");
    expect(replayPanel?.textContent).toContain("Stale");
    expect(replayPanel?.textContent).toContain("type_text: 3 chars");
    expect(replayPanel?.textContent).toContain("completed: pwd");

    cleanup();
  });

  it("renders runtime snapshot empty state without treating fresh installs as stale", async () => {
    const descriptor = createDashboardDescriptor({ port: 8787 });
    const cleanup = await renderDashboardHtmlWithSnapshot({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:01:00.000Z",
      descriptor,
      runtimeHealth: {
        dashboard: { state: "running", url: descriptor.url },
        runtimeSnapshot: {
          state: "missing",
          reason: "Runtime snapshot has not been recorded yet.",
          emptyReasonCode: "runtime-snapshot-missing",
          freshInstall: true
        }
      },
      operatorReadiness: { state: "needs-evidence" },
      permissions: {},
      currentTurn: {
        state: "idle",
        source: "runtime-snapshot",
        reason: "Runtime snapshot has not been recorded yet.",
        emptyReasonCode: "runtime-snapshot-missing",
        freshInstall: true
      },
      replay: {
        state: "empty",
        source: "runtime-snapshot",
        reason: "Runtime snapshot has not been recorded yet.",
        emptyReasonCode: "runtime-snapshot-missing",
        freshInstall: true
      },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { state: "unknown" },
      alerts: []
    });

    const currentTurnPanel = document.querySelector('[data-panel-id="current-turn"]');
    const replayPanel = document.querySelector('[data-panel-id="replay"]');

    expect(currentTurnPanel?.textContent).toContain("Empty");
    expect(currentTurnPanel?.textContent).toContain("snapshot freshnessempty");
    expect(currentTurnPanel?.textContent).toContain("snapshot reasonRuntime snapshot has not been recorded yet.");
    expect(replayPanel?.textContent).toContain("Empty");
    expect(replayPanel?.textContent).toContain("snapshot freshnessempty");
    expect(replayPanel?.textContent).toContain("snapshot reasonRuntime snapshot has not been recorded yet.");

    cleanup();
  });

  it("serves a token-free initial snapshot event for local live refresh", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/events"
      },
      {
        port: 8787,
        createSnapshot: () => ({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor: createDashboardDescriptor({ port: 8787 }),
          runtimeHealth: {
            dashboard: { state: "running" }
          },
          operatorReadiness: { state: "unknown" },
          permissions: {},
          currentTurn: { state: "idle" },
          replay: { state: "empty" },
          smokeEvidence: { artifacts: [] },
          dogfoodRelease: { state: "unknown" },
          longHorizon: { state: "unknown" },
          alerts: []
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store, no-transform");
    expect(response.body).toContain("event: snapshot\n");
    expect(response.body).toContain("data: ");
    expect(response.body).toContain('"generatedAt":"2026-06-20T00:00:00.000Z"');
    expect(response.body).not.toContain("token=");
  });

  it("serves snapshot JSON from an injected read-only provider without caching or tokens", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/snapshot.json"
      },
      {
        port: 8787,
        createSnapshot: () => ({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor: createDashboardDescriptor({ port: 8787 }),
          runtimeHealth: {
            app: { state: "installed" },
            helper: { state: "installed" },
            dashboard: { state: "running" },
            extension: { state: "unknown" }
          },
          operatorReadiness: { state: "unknown" },
          permissions: {
            screenRecording: "granted",
            accessibility: "granted",
            microphone: "granted",
            speechRecognition: "not-determined",
            finderAutomation: "unknown"
          },
          currentTurn: { state: "idle" },
          replay: { state: "empty" },
          smokeEvidence: { artifacts: [] },
          dogfoodRelease: { state: "unknown" },
          longHorizon: { state: "unknown", session: "money-run" },
          alerts: []
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");

    const snapshot = JSON.parse(response.body);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      runtimeHealth: {
        app: { state: "installed" },
        dashboard: { state: "running" }
      },
      operatorReadiness: { state: "unknown" },
      permissions: {
        screenRecording: "granted",
        finderAutomation: "unknown"
      },
      currentTurn: { state: "idle" },
      replay: { state: "empty" },
      smokeEvidence: { artifacts: [] },
      dogfoodRelease: { state: "unknown" },
      longHorizon: { session: "money-run" }
    });
    expect(response.body).not.toContain("token=");
  });

  it("serves a token-free operator evidence summary for CLI and plugin consumers", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/api/operator-evidence?token=ignored"
      },
      {
        port: 8787,
        createSnapshot: ({ descriptor }) => ({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor,
          runtimeHealth: {
            dashboard: { state: "running", url: descriptor.url },
            extension: {
              state: "native-host-installed",
              bridge: "native-messaging",
              liveConnection: "stale",
              nativeHostState: "installed",
              connection: {
                state: "stale",
                liveConnection: "stale",
                ageSeconds: 120,
                observedAt: "2026-06-19T23:58:00.000Z",
                launchOrigin: "https://example.test/?token=secret-token",
                messageType: "skfiy.page.observe"
              },
              hostPolicy: {
                state: "configured",
                source: "chrome-host-policy-file",
                policy: {
                  defaultMode: "ask",
                  allowedHosts: ["example.test"],
                  currentTurnAllowedHosts: ["turn.test"],
                  blockedHosts: ["blocked.test"]
                },
                entries: [
                  { decision: "allow", scope: "always", host: "example.test" },
                  { decision: "allow", scope: "current-turn", host: "turn.test" },
                  { decision: "block", scope: "host", host: "blocked.test" }
                ]
              }
            },
            nativeHost: {
              state: "installed",
              hostName: "com.sskift.skfiy",
              manifestPath: "/tmp/token=secret-token/native-host.json",
              allowedOrigins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
            }
          },
          operatorReadiness: {
            state: "needs-evidence",
            commandSurface: {
              state: "ready",
              path: "/tmp/token=secret-token/skfiy"
            },
            extensionReadiness: {
              state: "needs-evidence",
              nativeHostState: "installed",
              reason: "token=secret-token"
            },
            packagedBinary: {
              state: "ready",
              signingState: "valid"
            },
            recentSmokeEvidence: {
              state: "needs-evidence",
              missingTargets: ["cli"],
              recentPassedTargets: ["chrome"]
            }
          },
          permissions: {},
          currentTurn: {
            state: "approval_required",
            source: "runtime-snapshot",
            targetApp: "Chrome token=secret-token",
            risk: "medium",
            approvalState: "pending",
            command: "open https://example.test/?token=secret-token"
          },
          replay: {
            state: "available",
            source: "runtime-snapshot",
            screenshotCount: 2,
            actionCount: 3,
            verificationCount: 1,
            timelineTail: ["token=secret-token"]
          },
          smokeEvidence: {
            artifacts: [
              {
                target: "chrome",
                result: "passed",
                path: "/tmp/token=secret-token/chrome.json",
                ageSeconds: 60
              },
              {
                target: "cli",
                result: "failed",
                blocker: "token=secret-token",
                stale: true,
                ageSeconds: 90_000
              }
            ]
          },
          dogfoodRelease: { state: "unknown" },
          longHorizon: { state: "unknown" },
          alerts: [
            {
              code: "chrome-extension-heartbeat-stale",
              severity: "warning",
              message: "token=secret-token"
            }
          ]
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");

    const evidence = JSON.parse(response.body);
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      descriptor: {
        schemaVersion: 1,
        url: "http://127.0.0.1:8787/",
        bind: {
          host: "127.0.0.1",
          port: 8787
        },
        auth: {
          mode: "optional-token",
          tokenPrinted: false
        },
        panelCount: expect.any(Number)
      },
      snapshot: {
        schemaVersion: 1,
        generatedAt: "2026-06-20T00:00:00.000Z",
        currentTurn: {
          state: "approval_required",
          source: "runtime-snapshot",
          targetApp: "Chrome redacted-secret",
          risk: "medium",
          approvalState: "pending"
        },
        replay: {
          state: "available",
          source: "runtime-snapshot",
          screenshotCount: 2,
          actionCount: 3,
          verificationCount: 1
        },
        readiness: {
          state: "needs-evidence",
          stateCounts: {
            ready: 2,
            "needs-evidence": 2
          },
          smokeMissingTargets: ["cli"]
        },
        alerts: {
          total: 1,
          bySeverity: {
            error: 0,
            warning: 1,
            info: 0
          },
          codes: ["chrome-extension-heartbeat-stale"]
        },
        extension: {
          state: "native-host-installed",
          bridge: "native-messaging",
          liveConnection: "stale",
          nativeHostState: "installed",
          connection: {
            state: "stale",
            liveConnection: "stale",
            ageSeconds: 120,
            observedAt: "2026-06-19T23:58:00.000Z",
            messageType: "skfiy.page.observe"
          },
          hostPolicy: {
            state: "configured",
            source: "chrome-host-policy-file",
            defaultMode: "ask",
            entryCount: 3,
            allowedHostCount: 1,
            currentTurnAllowedHostCount: 1,
            blockedHostCount: 1
          }
        },
        nativeHost: {
          state: "installed",
          hostName: "com.sskift.skfiy",
          allowedOriginCount: 1
        },
        smokeEvidence: {
          total: 2,
          passed: 1,
          failed: 1,
          stale: 1,
          targets: ["chrome", "cli"],
          staleTargets: ["cli"],
          newestAgeSeconds: 60,
          oldestAgeSeconds: 90_000
        }
      },
      status: {
        state: "needs-attention",
        dashboardUrl: "http://127.0.0.1:8787/",
        bind: {
          host: "127.0.0.1",
          port: 8787
        },
        currentTurnState: "approval_required",
        replayState: "available",
        readinessState: "needs-evidence",
        alertCount: 1,
        errorAlertCount: 0,
        warningAlertCount: 1,
        extensionState: "native-host-installed",
        nativeHostState: "installed",
        smokeArtifactCount: 2
      },
      outputPolicy: {
        tokenFree: true,
        source: "allowlisted-dashboard-summary"
      }
    });
    expect(evidence.snapshot.currentTurn).not.toHaveProperty("command");
    expect(evidence.snapshot.replay).not.toHaveProperty("timelineTail");
    expect(response.body).not.toContain("ignored");
    expect(response.body).not.toContain("secret-token");
    expect(response.body).not.toContain("token=secret-token");
    expect(response.body).not.toContain("/tmp/token=secret-token");
  });

  it("serves operator evidence HEAD without a body", () => {
    const response = createDashboardHttpResponse(
      {
        method: "HEAD",
        url: "http://127.0.0.1:8787/api/operator-evidence"
      },
      {
        port: 8787
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toBe("");
  });

  it("serves a dashboard evidence summary for operator, Codex plugin, and Chrome extension supervision", () => {
    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/api/evidence-summary?token=ignored"
      },
      {
        port: 8787,
        createSnapshot: ({ descriptor }) => ({
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          descriptor,
          runtimeHealth: {
            dashboard: { state: "running", url: descriptor.url },
            extension: {
              state: "native-host-installed",
              liveConnection: "stale",
              setupGuide: {
                nextActions: [
                  "Refresh the extension native-host heartbeat."
                ],
                commands: [
                  {
                    id: "status",
                    label: "Status",
                    command: "skfiy chrome status --json --extension-id abcdefghijklmnopabcdefghijklmnop"
                  },
                  {
                    id: "smoke",
                    label: "Smoke",
                    command: "npm run smoke:chrome -- --output .skfiy-smoke/chrome-page.json"
                  }
                ]
              }
            },
            nativeHost: {
              state: "installed",
              hostName: "com.sskift.skfiy"
            }
          },
          operatorReadiness: {
            state: "needs-evidence"
          },
          permissions: {},
          currentTurn: {
            state: "idle",
            command: "open https://example.test/?token=secret-token"
          },
          replay: {
            state: "available",
            screenshotCount: 2
          },
          smokeEvidence: {
            artifacts: [
              {
                target: "codex-plugin",
                result: "passed",
                productPath: "codex plugin marketplace add -> installed skfiy CLI -> MCP stdio",
                ageSeconds: 30
              },
              {
                target: "chrome",
                result: "passed",
                productPath: "renderer -> preload -> main -> CDP -> Chrome",
                ageSeconds: 45,
                nativeHostBridge: {
                  result: "passed"
                },
                installedExtension: {
                  result: "blocked",
                  blockedReason: "branded_chrome_load_extension_removed"
                }
              }
            ]
          },
          dogfoodRelease: { state: "unknown" },
          longHorizon: {
            state: "observing",
            session: "money-run",
            mutatesSession: false
          },
          alerts: [
            {
              code: "chrome-extension-heartbeat-stale",
              severity: "warning",
              message: "token=secret-token"
            }
          ]
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");

    const summary = JSON.parse(response.body);
    expect(summary).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      dashboard: {
        url: "http://127.0.0.1:8787/",
        endpoint: "/api/evidence-summary"
      },
      status: {
        state: "needs-evidence",
        laneCount: 3,
        readyLaneCount: 1,
        blockedLaneCount: 0,
        attentionLaneCount: 2
      },
      outputPolicy: {
        tokenFree: true,
        source: "dashboard-evidence-summary"
      }
    });
    expect(summary.lanes.map((lane: { id: string; state: string }) => [lane.id, lane.state])).toEqual([
      ["computer-use-operator", "needs-evidence"],
      ["codex-plugin", "ready"],
      ["chrome-extension", "needs-evidence"]
    ]);
    expect(summary.lanes.find((lane: { id: string }) => lane.id === "chrome-extension")).toMatchObject({
      setupGuide: {
        source: "runtime",
        nativeHostState: "installed",
        liveConnectionState: "stale",
        nextActions: [
          "Refresh the extension native-host heartbeat."
        ],
        commands: [
          {
            id: "status",
            label: "Status",
            command: "skfiy chrome status --json --extension-id abcdefghijklmnopabcdefghijklmnop"
          },
          {
            id: "smoke",
            label: "Smoke",
            command: "npm run smoke:chrome -- --output .skfiy-smoke/chrome-page.json"
          }
        ]
      }
    });
    expect(response.body).not.toContain("ignored");
    expect(response.body).not.toContain("secret-token");
    expect(response.body).not.toContain("token=secret-token");
  });

  it("serves evidence summary HEAD without a body", () => {
    const response = createDashboardHttpResponse(
      {
        method: "HEAD",
        url: "http://127.0.0.1:8787/api/evidence-summary"
      },
      {
        port: 8787
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toBe("");
  });

  it("rejects mutating operator evidence requests", () => {
    const response = createDashboardHttpResponse({
      method: "POST",
      url: "http://127.0.0.1:8787/api/operator-evidence"
    });

    expect(response).toMatchObject({
      status: 405,
      body: "Method Not Allowed\n"
    });
    expect(response.headers["allow"]).toBe("GET, HEAD");
  });

  it("serves a workspace-backed snapshot when a root directory is provided", () => {
    const files: Record<string, string> = {
      "/repo/package.json": JSON.stringify({
        name: "skfiy",
        version: "0.1.0"
      }),
      "/repo/.skfiy-smoke/ui-current.json": JSON.stringify({
        result: "passed",
        productPath: "dist/skfiy.app"
      })
    };

    const response = createDashboardHttpResponse(
      {
        method: "GET",
        url: "http://127.0.0.1:8787/snapshot.json"
      },
      {
        port: 8787,
        rootDir: "/repo",
        workspaceIo: {
          exists: (targetPath) =>
            Object.hasOwn(files, targetPath)
            || targetPath === "/repo/.skfiy-smoke"
            || targetPath === "/repo/dist/skfiy",
          readFile: (targetPath) => files[targetPath],
          readdir: (targetPath) =>
            targetPath === "/repo/.skfiy-smoke" ? ["ui-current.json"] : [],
          stat: () => ({ mtimeMs: 42 })
        }
      }
    );

    expect(response.status).toBe(200);
    const snapshot = JSON.parse(response.body);

    expect(snapshot.runtimeHealth).toMatchObject({
      package: {
        name: "skfiy",
        version: "0.1.0"
      },
      cli: {
        state: "installed",
        path: "/repo/dist/skfiy"
      }
    });
    expect(snapshot.operatorReadiness).toMatchObject({
      commandSurface: {
        state: "ready",
        path: "/repo/dist/skfiy"
      },
      recentSmokeEvidence: {
        requiredTargets: ["chrome", "cli"],
        recentPassedTargets: [],
        missingTargets: ["chrome", "cli"]
      }
    });
    expect(snapshot.smokeEvidence.artifacts).toEqual([
      {
        target: "ui",
        result: "passed",
        path: "/repo/.skfiy-smoke/ui-current.json",
        productPath: "dist/skfiy.app",
        mtimeMs: 42,
        ageSeconds: expect.any(Number),
        stale: true
      }
    ]);
    expect(snapshot.smokeEvidence.artifacts[0].ageSeconds).toBeGreaterThan(86_400);
  });

  it("keeps the response helper read-only and minimal for unsupported routes", () => {
    const response = createDashboardHttpResponse({
      method: "POST",
      url: "http://127.0.0.1:8787/descriptor.json"
    });

    expect(response).toMatchObject({
      status: 405,
      body: "Method Not Allowed\n"
    });
    expect(response.headers["allow"]).toBe("GET, HEAD");
  });

  it("starts a loopback-only dashboard server and serves descriptor JSON", async () => {
    const dashboard = await startDashboardServer({
      port: 0,
      requestedHost: "0.0.0.0"
    });

    try {
      expect(dashboard.bind.host).toBe("127.0.0.1");
      expect(dashboard.url).toBe(`http://127.0.0.1:${dashboard.bind.port}/`);

      const response = await readUrl(`${dashboard.url}descriptor.json`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");

      const descriptor = JSON.parse(response.body);
      expect(descriptor.bind).toEqual(dashboard.bind);
      expect(response.body).not.toContain("0.0.0.0");
      expect(response.body).not.toContain("token=");
    } finally {
      await dashboard.close();
    }
  });

  it("streams an initial snapshot event from the loopback dashboard server", async () => {
    const dashboard = await startDashboardServer({
      port: 0,
      requestedHost: "0.0.0.0",
      createSnapshot: ({ descriptor }) => ({
        schemaVersion: 1,
        generatedAt: "2026-06-20T00:00:00.000Z",
        descriptor,
        runtimeHealth: {
          dashboard: { state: "running" }
        },
        operatorReadiness: { state: "unknown" },
        permissions: {},
        currentTurn: { state: "idle" },
        replay: { state: "empty" },
        smokeEvidence: { artifacts: [] },
        dogfoodRelease: { state: "unknown" },
        longHorizon: { state: "unknown" },
        alerts: []
      })
    });

    try {
      const response = await readFirstSseEvent(`${dashboard.url}events`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("no-store, no-transform");
      expect(response.event).toContain("event: snapshot\n");
      expect(response.event).toContain('"generatedAt":"2026-06-20T00:00:00.000Z"');
      expect(response.event).not.toContain("token=");
    } finally {
      await dashboard.close();
    }
  });

  it("serves local Chrome host policy show, set, and reset through the loopback server", async () => {
    const files: Record<string, string> = {};
    const chromeHostPolicyIo = {
      exists: async (targetPath: string) => Object.hasOwn(files, targetPath),
      mkdir: async () => undefined,
      readFile: async (targetPath: string) => files[targetPath],
      writeFile: async (targetPath: string, content: string) => {
        files[targetPath] = content;
      },
      rm: async (targetPath: string) => {
        delete files[targetPath];
      }
    };
    const policyPath = "/Users/tester/Library/Application Support/skfiy/chrome-host-policy.json";
    const dashboard = await startDashboardServer({
      port: 0,
      homeDir: "/Users/tester",
      chromeHostPolicyIo
    });

    try {
      const showDefault = await readUrl(`${dashboard.url}api/chrome-host-policy`);

      expect(showDefault.status).toBe(200);
      expect(showDefault.headers["cache-control"]).toBe("no-store");
      expect(JSON.parse(showDefault.body)).toMatchObject({
        command: "dashboard chrome policy show",
        executesSystemMutation: false,
        hostPolicy: {
          state: "default",
          path: policyPath,
          policy: {
            defaultMode: "ask",
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      });

      const setResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "always-allow",
          host: "https://Example.com/docs"
        })
      });

      expect(setResponse.status).toBe(200);
      expect(JSON.parse(setResponse.body)).toMatchObject({
        command: "dashboard chrome policy set",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "configured",
        action: "always_allow",
        host: "example.com",
        hostPolicy: {
          state: "configured",
          path: policyPath,
          policy: {
            allowedHosts: ["example.com"],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      });
      expect(JSON.parse(files[policyPath])).toMatchObject({
        schemaVersion: 1,
        policy: {
          allowedHosts: ["example.com"]
        }
      });

      const blockResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "block",
          host: "Example.com"
        })
      });

      expect(blockResponse.status).toBe(200);
      expect(JSON.parse(blockResponse.body)).toMatchObject({
        command: "dashboard chrome policy set",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "configured",
        action: "block_host",
        host: "example.com",
        hostPolicy: {
          state: "configured",
          policy: {
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: ["example.com"]
          }
        }
      });

      const askResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "ask",
          host: "Example.com"
        })
      });

      expect(askResponse.status).toBe(200);
      expect(JSON.parse(askResponse.body)).toMatchObject({
        command: "dashboard chrome policy set",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "configured",
        action: "ask_host",
        host: "example.com",
        hostPolicy: {
          state: "configured",
          policy: {
            allowedHosts: [],
            currentTurnAllowedHosts: [],
            blockedHosts: []
          }
        }
      });

      const resetResponse = await requestUrl(`${dashboard.url}api/chrome-host-policy`, {
        method: "POST",
        body: JSON.stringify({
          action: "reset"
        })
      });

      expect(resetResponse.status).toBe(200);
      expect(JSON.parse(resetResponse.body)).toMatchObject({
        command: "dashboard chrome policy reset",
        source: "dashboard",
        plannedMutation: true,
        executesSystemMutation: true,
        result: "reset",
        hostPolicy: {
          state: "default",
          path: policyPath
        }
      });
      expect(files[policyPath]).toBeUndefined();
      expect(setResponse.body).not.toContain("token=");
      expect(blockResponse.body).not.toContain("token=");
      expect(askResponse.body).not.toContain("token=");
      expect(resetResponse.body).not.toContain("token=");
    } finally {
      await dashboard.close();
    }
  });
});
