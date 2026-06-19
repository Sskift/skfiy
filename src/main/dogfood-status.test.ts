import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";
const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";

describe("dogfood status reporter", () => {
  const modulePath = path.join(process.cwd(), "scripts", "dogfood-status.mjs");
  const summaryPath = "/repo/.skfiy-dogfood/status.md";

  it("is exposed as an npm script for non-mutating dogfood readiness status", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:status": "node scripts/dogfood-status.mjs"
    });
  });

  it("parses manifest, tracking issue, summary, and JSON output paths", async () => {
    const {
      createDefaultDogfoodStatusOptions,
      createDogfoodStatusHelpText,
      parseDogfoodStatusArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodStatusOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodStatusHelpText: () => string;
      parseDogfoodStatusArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodStatusOptions("/repo");

    expect(parseDogfoodStatusArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tracking-issue-url",
      trackingIssueUrl,
      "--summary",
      ".skfiy-dogfood/status.md",
      "--json-output",
      ".skfiy-dogfood/status.json",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      trackingIssueUrl,
      summaryPath: path.resolve(".skfiy-dogfood/status.md"),
      jsonOutputPath: path.resolve(".skfiy-dogfood/status.json"),
      requireCurrentHead: true
    });
    expect(createDogfoodStatusHelpText()).toContain("dogfood:status");
    expect(createDogfoodStatusHelpText()).toContain("non-mutating");
    expect(createDogfoodStatusHelpText()).toContain("accepted report URLs");
    expect(createDogfoodStatusHelpText()).toContain("real tester");
    expect(createDogfoodStatusHelpText()).toContain("tester assignments");
    expect(createDogfoodStatusHelpText()).toContain("--json-output");
  });

  it("writes a machine-readable JSON status artifact for automation", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const jsonOutputPath = "/repo/.skfiy-dogfood/status.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed", {
        screenRecording: "denied",
        accessibility: "denied",
        microphone: "not-determined",
        speechRecognition: "not-determined"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      jsonOutputPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(JSON.parse(io.textFiles[jsonOutputPath])).toMatchObject({
      result: "waiting-for-dogfood",
      generatedAt: "2026-06-16T12:00:00.000Z",
      testerAssignments: status.testerAssignments,
      nextActions: status.nextActions
    });
    expect(io.textFiles[jsonOutputPath]).toMatch(/\n$/);
  });

  it("includes long-horizon money-run supervision smoke in local readiness status", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const moneyRunSmokePath = "/repo/.skfiy-smoke/money-run.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath,
        moneyRunSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked"),
      [moneyRunSmokePath]: {
        ...createSmokeArtifact(moneyRunSmokePath, "passed"),
        productPath: "LaunchServices -> renderer -> preload -> main -> tmux supervision -> tmux read-only probes",
        tmuxSupervisionReport: {
          sessionName: "money-run",
          mutatesSession: false,
          status: "observing"
        }
      }
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-19T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      localSmoke: {
        artifactResults: {
          "money-run": "passed"
        }
      }
    });
    expect(io.textFiles[summaryPath]).toContain("- money-run: passed");
  });

  it("parses a local tracking issue file for offline status checks", async () => {
    const {
      createDefaultDogfoodStatusOptions,
      createDogfoodStatusHelpText,
      parseDogfoodStatusArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodStatusOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodStatusHelpText: () => string;
      parseDogfoodStatusArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodStatusOptions("/repo");

    expect(parseDogfoodStatusArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tracking-issue-file",
      ".skfiy-dogfood/tracking-issue-abc123.md",
      "--summary",
      ".skfiy-dogfood/status.md"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      trackingIssueFile: path.resolve(".skfiy-dogfood/tracking-issue-abc123.md"),
      summaryPath: path.resolve(".skfiy-dogfood/status.md")
    });
    expect(createDogfoodStatusHelpText()).toContain("--tracking-issue-file");
  });

  it("reports waiting-for-dogfood from a local tracking issue body without reading GitHub", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const trackingIssueFile = "/repo/.skfiy-dogfood/tracking-issue-abc123.md";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [trackingIssueFile]: createTrackingIssueBody([]),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed", {
        screenRecording: "denied",
        accessibility: "denied",
        microphone: "not-determined",
        speechRecognition: "not-determined"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: {
        ...createSmokeArtifact(voiceSmokePath, "blocked"),
        provider: "native-macos",
        speechStatus: {
          speechRecognition: { state: "not-determined" },
          microphone: { state: "not-determined" }
        }
      }
    }, {});

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueFile,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssueUrl: "local-tracking-issue",
      trackingIssueFile,
      trackingIssue: {
        acceptedReportCount: 0,
        missingRequiredReports: 3
      },
      localSmoke: {
        permissionBlockers: [
          { permission: "screenRecording", state: "denied" },
          { permission: "accessibility", state: "denied" },
          { permission: "microphone", state: "not-determined" },
          { permission: "speechRecognition", state: "not-determined" }
        ]
      },
      nextActions: expect.arrayContaining([
        "Collect at least 3 accepted real tester report issue URLs in local tracking issue file /repo/.skfiy-dogfood/tracking-issue-abc123.md."
      ])
    });
    expect(status.nextActions).not.toContain(
      "Collect at least 3 accepted real tester report issue URLs in GitHub issue #1."
    );
    expect(io.textFiles[summaryPath]).toContain("Result: waiting-for-dogfood");
    expect(io.textFiles[summaryPath]).toContain("Accepted report URLs: 0/3 minimum");
  });

  it("reports missing accepted report URLs and current permission blockers without claiming readiness", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed", {
        screenRecording: "denied",
        accessibility: "denied",
        microphone: "not-determined",
        speechRecognition: "not-determined"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: {
        ...createSmokeArtifact(voiceSmokePath, "blocked"),
        provider: "native-macos",
        speechStatus: {
          speechRecognition: { state: "not-determined" },
          microphone: { state: "not-determined" }
        }
      }
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      manifestPath,
      trackingIssue: {
        acceptedReportIssueUrls: [],
        acceptedReportCount: 0,
        missingRequiredReports: 3
      },
      localSmoke: {
        artifactResults: {
          ui: "passed",
          ghostty: "blocked",
          chrome: "passed",
          finder: "blocked",
          voice: "blocked"
        },
        permissionStates: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" },
          microphone: { state: "not-determined" },
          speechRecognition: { state: "not-determined" }
        },
        permissionBlockers: [
          { permission: "screenRecording", state: "denied" },
          { permission: "accessibility", state: "denied" },
          { permission: "microphone", state: "not-determined" },
          { permission: "speechRecognition", state: "not-determined" }
        ]
      },
      readiness: {
        canRunCollect: false,
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Collect at least 3 accepted real tester report issue URLs in GitHub issue #1.",
        "Grant Screen Recording to dist/skfiy.app or the alpha app bundle before requiring passed Computer Use evidence."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("Result: waiting-for-dogfood");
    expect(io.textFiles[summaryPath]).toContain("Accepted report URLs: 0/3 minimum");
    expect(io.textFiles[summaryPath]).toContain("screenRecording: denied");
  });

  it("reports desktop session blockers separately from permission blockers", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: {
        ...createSmokeArtifact(uiSmokePath, "no-onboarding", {
          screenRecording: "authorized",
          accessibility: "authorized",
          microphone: "authorized",
          speechRecognition: "authorized"
        }),
        desktopSessionDiagnostics: {
          state: "blocked",
          status: {
            controllable: false,
            frontmostBundleId: "com.apple.loginwindow",
            frontmostLocalizedName: "loginwindow",
            frontmostProcessIdentifier: 591
          },
          reason: "Desktop session is locked by loginwindow (pid 591). Unlock the Mac and keep the display awake, then retry."
        }
      },
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      localSmoke: {
        permissionBlockers: [],
        desktopSessionBlocker: {
          state: "blocked",
          frontmostBundleId: "com.apple.loginwindow",
          reason: expect.stringContaining("loginwindow")
        }
      },
      nextActions: expect.arrayContaining([
        "Unlock the Mac and keep the display awake before requiring passed Ghostty/Finder/voice Computer Use evidence.",
        "After unlocking, rerun npm run smoke:desktop-session -- --app dist/skfiy.app --output .skfiy-smoke/desktop-session-current.json before collecting passed Computer Use evidence.",
        "When desktop preflight passes, rerun packaged product smokes with --require-passed for Ghostty, Finder, and voice.",
        "Run npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed --output .skfiy-smoke/ghostty-current.json after desktop preflight passes.",
        "Run npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-current.json after desktop preflight passes.",
        "Run npm run smoke:voice -- --app dist/skfiy.app --provider doubao --require-passed --output .skfiy-smoke/voice-current.json after desktop preflight passes."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("## Desktop Session");
    expect(io.textFiles[summaryPath]).toContain("blocked: Desktop session is locked by loginwindow");
    expect(io.textFiles[summaryPath]).toContain("npm run smoke:desktop-session -- --app dist/skfiy.app --output .skfiy-smoke/desktop-session-current.json");
  });

  it("reports desktop session blockers from Ghostty/Finder/voice smoke preflight artifacts", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const desktopPreflight = {
      result: "blocked",
      frontmost: {
        bundleId: "com.apple.loginwindow",
        localizedName: "loginwindow",
        processIdentifier: 591
      },
      display: {
        mainDisplayAsleep: true
      },
      controllable: false,
      reason: "Main display is asleep before target app launch and frontmostBundleId=com.apple.loginwindow frontmostProcessIdentifier=591. Wake and unlock the Mac, then retry."
    };
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding", {
        screenRecording: "authorized",
        accessibility: "authorized",
        microphone: "authorized",
        speechRecognition: "authorized"
      }),
      [ghosttySmokePath]: {
        ...createSmokeArtifact(ghosttySmokePath, "blocked"),
        desktopPreflight
      },
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-19T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      localSmoke: {
        permissionBlockers: [],
        desktopSessionBlocker: {
          state: "blocked",
          frontmostBundleId: "com.apple.loginwindow",
          frontmostProcessIdentifier: 591,
          reason: expect.stringContaining("Main display is asleep")
        }
      },
      nextActions: expect.arrayContaining([
        "Unlock the Mac and keep the display awake before requiring passed Ghostty/Finder/voice Computer Use evidence.",
        "After unlocking, rerun npm run smoke:desktop-session -- --app dist/skfiy.app --output .skfiy-smoke/desktop-session-current.json before collecting passed Computer Use evidence.",
        "When desktop preflight passes, rerun packaged product smokes with --require-passed for Ghostty, Finder, and voice.",
        "Run npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed --output .skfiy-smoke/ghostty-current.json after desktop preflight passes.",
        "Run npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-current.json after desktop preflight passes.",
        "Run npm run smoke:voice -- --app dist/skfiy.app --provider doubao --require-passed --output .skfiy-smoke/voice-current.json after desktop preflight passes."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("## Desktop Session");
    expect(io.textFiles[summaryPath]).toContain("blocked: Main display is asleep before target app launch");
    expect(io.textFiles[summaryPath]).toContain("npm run smoke:desktop-session -- --app dist/skfiy.app --output .skfiy-smoke/desktop-session-current.json");
  });

  it("reports missing manifest smoke artifacts without aborting status", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io) as {
      localSmoke: {
        artifactResults: Record<string, string>;
      };
      nextActions: string[];
    };

    expect(status.localSmoke.artifactResults.voice).toBe("missing");
    expect(status.nextActions).toContain(
      "Regenerate or attach missing smoke artifacts before relying on local readiness: voice (/repo/.skfiy-smoke/voice.json)."
    );
    expect(io.textFiles[summaryPath]).toContain("- voice: missing");
  });

  it("warns when the selected alpha manifest is older than the current HEAD", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = {
      ...createMemoryIo({
        [manifestPath]: createManifest({
          uiSmokePath,
          ghosttySmokePath,
          chromeSmokePath,
          finderSmokePath,
          voiceSmokePath
        }),
        [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
        [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
        [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
        [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
        [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
      }, {
        [trackingIssueUrl]: {
          body: createTrackingIssueBody([]),
          labels: ["skfiy", "dogfood"]
        }
      }),
      async readCurrentHead() {
        return "newhead";
      }
    };

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      manifest: {
        checks: {
          currentHead: {
            expected: "newhead",
            actual: "abc123",
            ok: false,
            required: false
          }
        }
      },
      nextActions: expect.arrayContaining([
        "Publish a fresh alpha artifact from the current HEAD before assigning new dogfood testers, or intentionally keep testing the older selected alpha."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("Current HEAD: newhead");
    expect(io.textFiles[summaryPath]).toContain("Alpha is current HEAD: no");
  });

  it("does not ask for a fresh alpha when only non-app-build inputs changed after the alpha commit", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = {
      ...createMemoryIo({
        [manifestPath]: createManifest({
          uiSmokePath,
          ghosttySmokePath,
          chromeSmokePath,
          finderSmokePath,
          voiceSmokePath
        }),
        [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
        [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
        [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
        [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
        [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
      }, {
        [trackingIssueUrl]: {
          body: createTrackingIssueBody([]),
          labels: ["skfiy", "dogfood"]
        }
      }),
      async readCurrentHead() {
        return "docshead";
      },
      async readChangedFilesBetween(base: string, head: string) {
        return base === "abc123" && head === "docshead"
          ? [
            "docs/release-evidence/latest-alpha.json",
            "docs/superpowers/plans/2026-06-15-skfiy-mvp.md",
            ".skfiy-dogfood/status-abc123.md",
            "scripts/dogfood-status.mjs",
            "src/main/dogfood-status.test.ts"
          ]
          : [];
      }
    };

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      manifest: {
        checks: {
          currentHead: {
            expected: "docshead",
            actual: "abc123",
            ok: false,
            appCodeOk: true,
            changedFiles: [
              "docs/release-evidence/latest-alpha.json",
              "docs/superpowers/plans/2026-06-15-skfiy-mvp.md",
              ".skfiy-dogfood/status-abc123.md",
              "scripts/dogfood-status.mjs",
              "src/main/dogfood-status.test.ts"
            ],
            appRelevantChangedFiles: [],
            required: false
          }
        }
      }
    });
    expect(status.nextActions).not.toContain(
      "Publish a fresh alpha artifact from the current HEAD before assigning new dogfood testers, or intentionally keep testing the older selected alpha."
    );
    expect(io.textFiles[summaryPath]).toContain("Alpha app code current: yes");
  });

  it("does not ask for a fresh alpha when package.json only adds dogfood coordination scripts", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = {
      ...createMemoryIo({
        [manifestPath]: createManifest({
          uiSmokePath,
          ghosttySmokePath,
          chromeSmokePath,
          finderSmokePath,
          voiceSmokePath
        }),
        [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
        [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
        [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
        [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
        [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
      }, {
        [trackingIssueUrl]: {
          body: createTrackingIssueBody([]),
          labels: ["skfiy", "dogfood"]
        }
      }),
      async readCurrentHead() {
        return "assignmenthead";
      },
      async readChangedFilesBetween(base: string, head: string) {
        return base === "abc123" && head === "assignmenthead"
          ? [
            "package.json",
            "scripts/create-dogfood-assignments.mjs",
            "src/main/dogfood-assignments.test.ts",
            "docs/development-workflow.md"
          ]
          : [];
      },
      async readFileAtCommit(commitSha: string, filePath: string) {
        if (filePath !== "package.json") {
          throw new Error(`Unexpected file at commit: ${commitSha}:${filePath}`);
        }
        const base = {
          name: "skfiy",
          version: "0.1.0",
          type: "module",
          main: "dist/main/main.js",
          scripts: {
            "dogfood:status": "node scripts/dogfood-status.mjs"
          },
          dependencies: {
            electron: "^39.2.7"
          },
          devDependencies: {
            vitest: "^4.0.15"
          }
        };
        const headPackage = {
          ...base,
          scripts: {
            ...base.scripts,
            "dogfood:assignments": "node scripts/create-dogfood-assignments.mjs"
          }
        };
        return JSON.stringify(commitSha === "abc123" ? base : headPackage);
      }
    };

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      manifest: {
        checks: {
          currentHead: {
            ok: false,
            appCodeOk: true,
            appRelevantChangedFiles: []
          }
        }
      }
    });
    expect(status.nextActions).not.toContain(
      "Publish a fresh alpha artifact from the current HEAD before assigning new dogfood testers, or intentionally keep testing the older selected alpha."
    );
    expect(io.textFiles[summaryPath]).toContain("Alpha app code current: yes");
  });

  it("does not ask for a fresh app alpha when only alpha release evidence tooling changed", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = {
      ...createMemoryIo({
        [manifestPath]: createManifest({
          uiSmokePath,
          ghosttySmokePath,
          chromeSmokePath,
          finderSmokePath,
          voiceSmokePath
        }),
        [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
        [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
        [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
        [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
        [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
      }, {
        [trackingIssueUrl]: {
          body: createTrackingIssueBody([]),
          labels: ["skfiy", "dogfood"]
        }
      }),
      async readCurrentHead() {
        return "releasehead";
      },
      async readChangedFilesBetween(base: string, head: string) {
        return base === "abc123" && head === "releasehead"
          ? [
            "scripts/create-alpha-artifact.mjs",
            "scripts/publish-alpha-github-release.mjs",
            "src/main/alpha-artifact.test.ts",
            "src/main/alpha-github-release.test.ts",
            "docs/internal-alpha-build.md"
          ]
          : [];
      }
    };

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-19T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      manifest: {
        checks: {
          currentHead: {
            ok: false,
            appCodeOk: true,
            appRelevantChangedFiles: []
          }
        }
      }
    });
    expect(status.nextActions).not.toContain(
      "Publish a fresh alpha artifact from the current HEAD before assigning new dogfood testers, or intentionally keep testing the older selected alpha."
    );
  });

  it("warns when docs release evidence still points at an older alpha", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      "/repo/docs/release-evidence/latest-alpha.json": {
        tagName: "skfiy-alpha-old9999",
        releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-old9999",
        commitSha: "old9999",
        artifactBaseName: "skfiy-0.1.0-old9999-macos-unsigned",
        manifestPath: ".skfiy-alpha/skfiy-0.1.0-old9999-macos-unsigned.json",
        zipPath: ".skfiy-alpha/skfiy-0.1.0-old9999-macos-unsigned.zip",
        zipSha256: "oldhash"
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      rootDir: "/repo",
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      manifest: {
        checks: {
          releaseEvidence: {
            available: true,
            ok: false,
            path: "/repo/docs/release-evidence/latest-alpha.json",
            reasons: [
              "release evidence tagName does not match manifest commit",
              "release evidence releaseUrl does not match manifest commit",
              "release evidence commitSha does not match manifest commitSha",
              "release evidence artifactBaseName does not match manifest artifactBaseName",
              "release evidence manifestPath does not match selected manifest",
              "release evidence zipPath does not match manifest zip.path",
              "release evidence zipSha256 does not match manifest zip.sha256"
            ]
          }
        }
      },
      nextActions: expect.arrayContaining([
        "Refresh docs/release-evidence/latest-alpha.json so it points at the selected skfiy-alpha-abc123 release before handing off the alpha."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("Release evidence current: no");
    expect(io.textFiles[summaryPath]).toContain(
      "release evidence tagName does not match manifest commit"
    );
  });

  it("warns when docs release evidence omits the money-run smoke artifact from the selected manifest", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui-abc123.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty-abc123.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome-abc123.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder-abc123.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice-abc123.json";
    const moneyRunSmokePath = "/repo/.skfiy-smoke/money-run-supervision-abc123.json";
    const manifest = {
      ...createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath,
        moneyRunSmokePath
      }),
      artifactBaseName: "skfiy-0.1.0-abc123-macos-unsigned"
    };
    const io = createMemoryIo({
      [manifestPath]: manifest,
      "/repo/docs/release-evidence/latest-alpha.json": {
        tagName: "skfiy-alpha-abc123",
        releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123",
        commitSha: "abc123",
        artifactBaseName: "skfiy-0.1.0-abc123-macos-unsigned",
        manifestPath: ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
        zipPath: ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip",
        zipSha256: "feedface",
        smokeArtifacts: {
          ui: ".skfiy-smoke/ui-abc123.json",
          ghostty: ".skfiy-smoke/ghostty-abc123.json",
          chrome: ".skfiy-smoke/chrome-abc123.json",
          finder: ".skfiy-smoke/finder-abc123.json",
          voice: ".skfiy-smoke/voice-abc123.json"
        }
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked"),
      [moneyRunSmokePath]: createSmokeArtifact(moneyRunSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      rootDir: "/repo",
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      manifest: {
        checks: {
          releaseEvidence: {
            available: true,
            ok: false,
            reasons: [
              "release evidence moneyRun smoke artifact does not match manifest moneyRunSmokeArtifactPath"
            ]
          }
        }
      }
    });
    expect(io.textFiles[summaryPath]).toContain(
      "release evidence moneyRun smoke artifact does not match manifest moneyRunSmokeArtifactPath"
    );
  });

  it("recommends concrete tester assignments for missing real reports and workflow coverage", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed", {
        screenRecording: "denied",
        accessibility: "denied",
        microphone: "not-determined",
        speechRecognition: "not-determined"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: {
        ...createSmokeArtifact(voiceSmokePath, "blocked"),
        provider: "native-macos",
        speechStatus: {
          speechRecognition: { state: "not-determined" },
          microphone: { state: "not-determined" }
        }
      }
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io) as {
      testerAssignments: Array<{
        commands: {
          prepareAlpha: string;
          tester: string;
          review: string;
        };
      }>;
    };

    expect(status).toMatchObject({
      testerAssignments: [
        {
          testerId: "tester-1",
          workflows: ["coding-terminal", "screenshot-inspection"],
          purpose: "real-tester-count-and-workflow-coverage",
          commands: {
            prepareAlpha: expect.stringContaining("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123 --tester-id tester-1 --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --execute"),
            tester: expect.stringContaining("npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json> --app <path-to-unzipped-skfiy.app> --tester-id tester-1 --workflows coding-terminal,screenshot-inspection"),
            review: expect.stringContaining("npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json> --issue-url <filed-dogfood-issue-url> --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --summary .skfiy-dogfood/reviews/tester-1.md")
          }
        },
        {
          testerId: "tester-2",
          workflows: ["finder-file"],
          purpose: "real-tester-count-and-workflow-coverage"
        },
        {
          testerId: "tester-3",
          workflows: ["browser-fallback"],
          purpose: "real-tester-count-and-workflow-coverage"
        }
      ]
    });
    expect(status.testerAssignments[0].commands.prepareAlpha).not.toContain("--workflows");
    expect(io.textFiles[summaryPath]).toContain("## Recommended Tester Assignments");
    expect(io.textFiles[summaryPath]).toContain("- tester-1: coding-terminal, screenshot-inspection");
    expect(io.textFiles[summaryPath]).toContain("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123 --tester-id tester-1 --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --execute");
    expect(io.textFiles[summaryPath]).toContain("After Prepare finishes, copy `nextCommands.tester` from the prepare-alpha JSON output.");
    expect(io.textFiles[summaryPath]).toContain("After filing the dogfood issue, copy `nextCommands.review` from the same prepare-alpha JSON output and replace `<filed-dogfood-issue-url>`.");
    expect(io.textFiles[summaryPath]).toContain("npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json> --app <path-to-unzipped-skfiy.app> --tester-id tester-1 --workflows coding-terminal,screenshot-inspection");
    expect(io.textFiles[summaryPath]).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --file-issue");
    expect(io.textFiles[summaryPath]).toContain("--file-issue");
    expect(status.testerAssignments[0].commands.tester).toContain("--file-issue");
    expect(status.testerAssignments[0].commands.tester).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(io.textFiles[summaryPath]).toContain("npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json> --issue-url <filed-dogfood-issue-url> --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --summary .skfiy-dogfood/reviews/tester-1.md");
    expect(status.testerAssignments[0].commands.tester).not.toContain("/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json");
    expect(status.testerAssignments[0].commands.review).not.toContain("/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json");
  });

  it("reports whether the current alpha tester assignment packet is already posted as a tracking issue comment", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"],
        comments: [
          createAssignmentComment("old9999", {
            url: "https://github.com/Sskift/skfiy/issues/1#issuecomment-1",
            createdAt: "2026-06-16T10:00:00Z"
          }),
          createAssignmentComment("abc123", {
            url: "https://github.com/Sskift/skfiy/issues/1#issuecomment-2",
            createdAt: "2026-06-16T11:00:00Z"
          })
        ]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      trackingIssue: {
        assignmentComment: {
          ok: true,
          currentAlphaTag: "skfiy-alpha-abc123",
          commentCount: 2,
          matchingCommentCount: 1,
          latestCommentUrl: "https://github.com/Sskift/skfiy/issues/1#issuecomment-2",
          latestCommentCreatedAt: "2026-06-16T11:00:00Z",
          reasons: []
        }
      }
    });
    expect(status.nextActions).not.toContain(
      "Post the current skfiy-alpha-abc123 tester assignment packet to GitHub issue #1 before asking more testers to run it."
    );
    expect(io.textFiles[summaryPath]).toContain("## Assignment Comment");
    expect(io.textFiles[summaryPath]).toContain("- ok: current skfiy-alpha-abc123 packet is posted");
    expect(io.textFiles[summaryPath]).toContain("https://github.com/Sskift/skfiy/issues/1#issuecomment-2");
  });

  it("recommends posting the current alpha tester assignment packet when GitHub comments do not contain it", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"],
        comments: [
          createAssignmentComment("old9999")
        ]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      trackingIssue: {
        assignmentComment: {
          ok: false,
          currentAlphaTag: "skfiy-alpha-abc123",
          commentCount: 1,
          matchingCommentCount: 0,
          reasons: [
            "tracking issue does not have a current skfiy-alpha-abc123 tester assignment packet comment"
          ]
        }
      },
      nextActions: expect.arrayContaining([
        "Post the current skfiy-alpha-abc123 tester assignment packet to GitHub issue #1 before asking more testers to run it."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("## Assignment Comment");
    expect(io.textFiles[summaryPath]).toContain("- invalid: tracking issue does not have a current skfiy-alpha-abc123 tester assignment packet comment");
  });

  it("recommends reposting the current alpha tester assignment packet when it lacks the evidence preview gate", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"],
        comments: [
          createAssignmentComment("abc123", { includeEvidencePreviewGate: false })
        ]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      trackingIssue: {
        assignmentComment: {
          ok: false,
          currentAlphaTag: "skfiy-alpha-abc123",
          matchingCommentCount: 1,
          reasons: [
            "current skfiy-alpha-abc123 tester assignment packet comment is missing Evidence Preview Gate"
          ]
        }
      },
      nextActions: expect.arrayContaining([
        "Post the current skfiy-alpha-abc123 tester assignment packet to GitHub issue #1 before asking more testers to run it."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("- invalid: current skfiy-alpha-abc123 tester assignment packet comment is missing Evidence Preview Gate");
  });

  it("recommends reposting a current alpha tester assignment packet from an older schema", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"],
        comments: [
          createAssignmentComment("abc123", { includePacketSchema: false })
        ]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      trackingIssue: {
        assignmentComment: {
          ok: false,
          currentAlphaTag: "skfiy-alpha-abc123",
          matchingCommentCount: 1,
          reasons: [
            "current skfiy-alpha-abc123 tester assignment packet comment is from an older schema"
          ]
        }
      },
      nextActions: expect.arrayContaining([
        "Post the current skfiy-alpha-abc123 tester assignment packet to GitHub issue #1 before asking more testers to run it."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("- invalid: current skfiy-alpha-abc123 tester assignment packet comment is from an older schema");
  });

  it("reports when the tracking issue has enough report URLs to try dogfood:collect", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding", {
        screenRecording: "authorized",
        accessibility: "authorized",
        microphone: "authorized",
        speechRecognition: "authorized"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls, {
          testerSectionTitle: "Required Real Tester Count"
        }),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue(
        "tester-1",
        ["coding-terminal", "screenshot-inspection"],
        { result: "passed" }
      ),
      [reportUrls[1]]: createAcceptedReportIssue("tester-2", ["finder-file"], {
        result: "blocked"
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-3", ["browser-fallback"], {
        result: "blocked"
      })
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io) as {
      testerAssignments: Array<{
        testerId: string;
        workflows: string[];
        purpose: string;
        commands: {
          prepareAlpha: string;
          tester: string;
        };
      }>;
    };

    expect(status).toMatchObject({
      result: "ready-to-collect",
      trackingIssue: {
        acceptedReportIssueUrls: reportUrls,
        acceptedReportCount: 3,
        missingRequiredReports: 0,
        verifiedAcceptedReportCount: 3,
        workflowCoverage: {
          covered: [
            "coding-terminal",
            "screenshot-inspection",
            "finder-file",
            "browser-fallback"
          ],
          missing: []
        },
        passedWorkflowCoverage: {
          covered: [
            "coding-terminal",
            "screenshot-inspection"
          ],
          missing: [
            "finder-file",
            "browser-fallback"
          ]
        }
      },
      localSmoke: {
        permissionBlockers: []
      },
      readiness: {
        canRunCollect: true,
        canRunPassedCohort: false,
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Run npm run dogfood:collect with the current manifest and tracking issue.",
        "Do not run npm run dogfood:cohort -- --require-passed until passed workflow coverage is complete.",
        "Collect passed product-path evidence for workflows: finder-file, browser-fallback."
      ])
    });
    expect(status.testerAssignments).toMatchObject([
      {
        testerId: "tester-4",
        workflows: ["finder-file", "browser-fallback"],
        purpose: "passed-workflow-evidence"
      }
    ]);
    expect(status.testerAssignments[0].commands.prepareAlpha).toContain("--require-passed");
    expect(status.testerAssignments[0].commands.tester).toContain("--require-passed");
  });

  it("does not count accepted report issues without app bundle preflight or panic stop evidence", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding", {
        screenRecording: "authorized",
        accessibility: "authorized",
        microphone: "authorized",
        speechRecognition: "authorized"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls, {
          testerSectionTitle: "Required Real Tester Count"
        }),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue(
        "tester-1",
        ["coding-terminal", "screenshot-inspection"],
        { result: "passed", includeAppBundlePreflightEvidence: false }
      ),
      [reportUrls[1]]: createAcceptedReportIssue("tester-2", ["finder-file"], {
        result: "blocked",
        includePanicStopEvidence: false
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-3", ["browser-fallback"], {
        result: "blocked"
      })
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssue: {
        verifiedAcceptedReportCount: 1,
        missingRequiredReports: 2,
        reportIssueValidation: [
          {
            issueUrl: reportUrls[0],
            ok: false,
            reasons: expect.arrayContaining(["missing app bundle preflight evidence"])
          },
          {
            issueUrl: reportUrls[1],
            ok: false,
            reasons: expect.arrayContaining(["missing panic stop evidence"])
          },
          {
            issueUrl: reportUrls[2],
            ok: true
          }
        ]
      },
      readiness: {
        canRunCollect: false
      },
      nextActions: expect.not.arrayContaining([
        "Run npm run dogfood:collect with the current manifest and tracking issue."
      ])
    });
  });

  it("surfaces stale alpha manifests missing product-path panic stop behavior evidence", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath,
        includePanicStopProductPathEvidence: false
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue(
        "tester-1",
        ["coding-terminal", "screenshot-inspection"],
        { result: "passed" }
      ),
      [reportUrls[1]]: createAcceptedReportIssue("tester-2", ["finder-file"], {
        result: "passed"
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-3", ["browser-fallback"], {
        result: "passed"
      })
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-19T12:00:00.000Z"
    }, io);

    expect(status).toMatchObject({
      result: "waiting-for-dogfood",
      manifest: {
        checks: {
          requiredEvidence: {
            ok: false,
            missing: ["Panic stop product-path behavior evidence"]
          }
        }
      },
      readiness: {
        canRunCollect: false,
        canRunPassedCohort: false
      },
      nextActions: expect.arrayContaining([
        "Regenerate the alpha artifact so the manifest requires Panic stop product-path behavior evidence before assigning dogfood testers."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("Required evidence current: no");
    expect(io.textFiles[summaryPath]).toContain("Missing required evidence: Panic stop product-path behavior evidence");
  });

  it("marks the strict passed cohort gate ready only after all required workflows have passed evidence", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding", {
        screenRecording: "authorized",
        accessibility: "authorized",
        microphone: "authorized",
        speechRecognition: "authorized"
      }),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue(
        "tester-1",
        ["coding-terminal", "screenshot-inspection"],
        { result: "passed" }
      ),
      [reportUrls[1]]: createAcceptedReportIssue("tester-2", ["finder-file"], {
        result: "passed"
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-3", ["browser-fallback"], {
        result: "passed"
      })
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "ready-to-collect",
      trackingIssue: {
        passedWorkflowCoverage: {
          covered: [
            "coding-terminal",
            "screenshot-inspection",
            "finder-file",
            "browser-fallback"
          ],
          missing: []
        }
      },
      readiness: {
        canRunCollect: true,
        canRunPassedCohort: true,
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Run npm run dogfood:collect with the current manifest and tracking issue.",
        "After collecting, run npm run dogfood:cohort -- --require-passed on the collected cohort JSON."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("Passed cohort gate ready: yes");
  });

  it("does not mark status ready when the tracking issue current alpha is stale", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls, {
          currentAlpha: {
            release: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-old9999",
            manifest: ".skfiy-alpha/skfiy-0.1.0-old9999-macos-unsigned.json",
            zip: "skfiy-0.1.0-old9999-macos-unsigned.zip",
            zipSha256: "oldhash",
            commit: "old9999",
            bundleId: "com.sskift.skfiy",
            appName: "skfiy"
          }
        }),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue(
        "tester-1",
        ["coding-terminal", "screenshot-inspection"],
        { result: "passed" }
      ),
      [reportUrls[1]]: createAcceptedReportIssue("tester-2", ["finder-file"], {
        result: "passed"
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-3", ["browser-fallback"], {
        result: "passed"
      })
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssue: {
        currentAlpha: {
          ok: false,
          reasons: [
            "tracking issue release does not match manifest commit",
            "tracking issue manifest does not match current manifest",
            "tracking issue zip does not match manifest zip.path",
            "tracking issue zip SHA256 does not match manifest zip.sha256",
            "tracking issue commit does not match manifest commitSha"
          ]
        },
        verifiedRealAcceptedReportCount: 3,
        workflowCoverage: {
          missing: []
        }
      },
      readiness: {
        canRunCollect: false,
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Update GitHub issue #1 Current Alpha section to match the selected manifest before collecting reports."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("## Current Alpha Identity");
    expect(io.textFiles[summaryPath]).toContain("- invalid: tracking issue release does not match manifest commit");
  });

  it("uses the selected manifest alpha release URL in tester assignments when Current Alpha is stale", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([], {
          currentAlpha: {
            release: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-old9999",
            manifest: ".skfiy-alpha/skfiy-0.1.0-old9999-macos-unsigned.json",
            zip: "skfiy-0.1.0-old9999-macos-unsigned.zip",
            zipSha256: "oldhash",
            commit: "old9999",
            bundleId: "com.sskift.skfiy",
            appName: "skfiy"
          }
        }),
        labels: ["skfiy", "dogfood"]
      }
    });

    const status = await createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io) as {
      testerAssignments: Array<{
        commands: {
          prepareAlpha: string;
        };
      }>;
    };

    expect(status.testerAssignments[0].commands.prepareAlpha).toContain(
      "--release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123"
    );
    expect(status.testerAssignments[0].commands.prepareAlpha).not.toContain("skfiy-alpha-old9999");
  });

  it("does not mark status ready when listed report issues are stale or not accepted", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue("tester-a", ["coding-terminal"]),
      [reportUrls[1]]: createAcceptedReportIssue("tester-b", ["finder-file"], {
        commitSha: "oldcommit"
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-c", ["browser-fallback"], {
        labels: ["workflow:browser-fallback"]
      })
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssue: {
        acceptedReportIssueUrls: reportUrls,
        acceptedReportCount: 3,
        verifiedAcceptedReportCount: 1,
        missingRequiredReports: 2,
        reportIssueValidation: [
          {
            issueUrl: reportUrls[0],
            ok: true,
            reasons: []
          },
          {
            issueUrl: reportUrls[1],
            ok: false,
            reasons: ["commit sha does not match manifest commitSha"]
          },
          {
            issueUrl: reportUrls[2],
            ok: false,
            reasons: ["missing dogfood:accepted label"]
          }
        ]
      },
      readiness: {
        canRunCollect: false,
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Review or replace stale/invalid dogfood report issue URLs before collecting the cohort."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("Verified accepted report URLs: 1/3 minimum");
    expect(io.textFiles[summaryPath]).toContain("commit sha does not match manifest commitSha");
    expect(io.textFiles[summaryPath]).toContain("missing dogfood:accepted label");
  });

  it("does not count local or preflight synthetic report issues toward real tester readiness", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103",
      "https://github.com/Sskift/skfiy/issues/104"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue(
        "Local-abc123",
        ["coding-terminal", "screenshot-inspection"],
        { result: "passed" }
      ),
      [reportUrls[1]]: createAcceptedReportIssue(
        "PREflight-abc123",
        ["coding-terminal"],
        { result: "passed" }
      ),
      [reportUrls[2]]: createAcceptedReportIssue("tester-2", ["finder-file"], {
        result: "passed"
      }),
      [reportUrls[3]]: createAcceptedReportIssue("tester-3", ["browser-fallback"], {
        result: "passed"
      })
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssue: {
        acceptedReportCount: 4,
        verifiedAcceptedReportCount: 4,
        verifiedRealAcceptedReportCount: 2,
        missingRequiredReports: 1,
        workflowCoverage: {
          covered: ["finder-file", "browser-fallback"],
          missing: ["coding-terminal", "screenshot-inspection"]
        },
        passedWorkflowCoverage: {
          covered: ["finder-file", "browser-fallback"],
          missing: ["coding-terminal", "screenshot-inspection"]
        },
        reportIssueValidation: [
          {
            issueUrl: reportUrls[0],
            ok: true,
            testerId: "Local-abc123",
            realTester: false,
            realTesterReasons: ["tester id Local-abc123 is reserved for local synthetic runs"]
          },
          {
            issueUrl: reportUrls[1],
            ok: true,
            testerId: "PREflight-abc123",
            realTester: false,
            realTesterReasons: ["tester id PREflight-abc123 is reserved for local synthetic runs"]
          },
          {
            issueUrl: reportUrls[2],
            ok: true,
            testerId: "tester-2",
            realTester: true,
            realTesterReasons: []
          },
          {
            issueUrl: reportUrls[3],
            ok: true,
            testerId: "tester-3",
            realTester: true,
            realTesterReasons: []
          }
        ]
      },
      readiness: {
        canRunCollect: false,
        cohortReady: false
      },
      testerAssignments: [
        {
          testerId: "tester-1",
          purpose: "real-tester-count-and-workflow-coverage"
        }
      ],
      nextActions: expect.arrayContaining([
        "Collect at least 3 accepted real tester report issue URLs in GitHub issue #1.",
        "Collect accepted reports covering missing workflows: coding-terminal, screenshot-inspection.",
        "Collect passed product-path evidence for workflows: coding-terminal, screenshot-inspection."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("- tester-1:");
    expect(io.textFiles[summaryPath]).not.toContain("- tester-3: coding-terminal");
    expect(io.textFiles[summaryPath]).toContain("Verified real accepted report URLs: 2/3 minimum");
    expect(io.textFiles[summaryPath]).toContain("synthetic: tester id Local-abc123 is reserved for local synthetic runs");
    expect(io.textFiles[summaryPath]).toContain("synthetic: tester id PREflight-abc123 is reserved for local synthetic runs");
  });

  it("reports missing workflow coverage from verified accepted report issues", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls, {
          coveredWorkflows: ["coding-terminal", "screenshot-inspection"]
        }),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue("tester-1", ["coding-terminal"]),
      [reportUrls[1]]: createAcceptedReportIssue("tester-2", ["screenshot-inspection"])
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      trackingIssue: {
        workflowCoverage: {
          covered: ["coding-terminal", "screenshot-inspection"],
          missing: ["finder-file", "browser-fallback"]
        }
      },
      nextActions: expect.arrayContaining([
        "Collect accepted reports covering missing workflows: finder-file, browser-fallback."
      ])
    });
    expect(io.textFiles[summaryPath]).toContain("## Workflow Coverage");
    expect(io.textFiles[summaryPath]).toContain("- coding-terminal: covered");
    expect(io.textFiles[summaryPath]).toContain("- finder-file: missing");
    expect(io.textFiles[summaryPath]).toContain("## Passed Workflow Coverage");
    expect(io.textFiles[summaryPath]).toContain("- finder-file: blocked-or-missing");
  });

  it("rejects listed report issues with no checked workflows or extra workflow labels", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls, {
          coveredWorkflows: [
            "coding-terminal",
            "screenshot-inspection",
            "finder-file",
            "browser-fallback"
          ]
        }),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue("tester-a", []),
      [reportUrls[1]]: createAcceptedReportIssue("tester-b", ["finder-file"], {
        labels: ["dogfood:accepted", "workflow:finder-file", "workflow:browser-fallback"]
      }),
      [reportUrls[2]]: createAcceptedReportIssue("tester-c", ["browser-fallback"])
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssue: {
        verifiedAcceptedReportCount: 1,
        missingRequiredReports: 2,
        workflowCoverage: {
          covered: ["browser-fallback"],
          missing: ["coding-terminal", "screenshot-inspection", "finder-file"]
        },
        reportIssueValidation: [
          {
            issueUrl: reportUrls[0],
            ok: false,
            reasons: ["missing checked cohort workflow"]
          },
          {
            issueUrl: reportUrls[1],
            ok: false,
            reasons: ["unexpected workflow:browser-fallback label"]
          },
          {
            issueUrl: reportUrls[2],
            ok: true,
            reasons: []
          }
        ]
      },
      nextActions: expect.arrayContaining([
        "Collect accepted reports covering missing workflows: coding-terminal, screenshot-inspection, finder-file."
      ])
    });
  });

  it("does not count accepted report issues without UI pet drag evidence", async () => {
    const { createDogfoodStatus } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodStatus: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const reportUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const io = createMemoryIo({
      [manifestPath]: createManifest({
        uiSmokePath,
        ghosttySmokePath,
        chromeSmokePath,
        finderSmokePath,
        voiceSmokePath
      }),
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "no-onboarding"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportUrls),
        labels: ["skfiy", "dogfood"]
      },
      [reportUrls[0]]: createAcceptedReportIssue("tester-a", ["coding-terminal"], {
        includeUiPetDragEvidence: false
      }),
      [reportUrls[1]]: createAcceptedReportIssue("tester-b", ["finder-file"]),
      [reportUrls[2]]: createAcceptedReportIssue("tester-c", ["browser-fallback"])
    });

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      trackingIssue: {
        verifiedAcceptedReportCount: 2,
        missingRequiredReports: 1,
        reportIssueValidation: [
          {
            issueUrl: reportUrls[0],
            ok: false,
            reasons: ["missing UI pet drag evidence"]
          },
          {
            issueUrl: reportUrls[1],
            ok: true,
            reasons: []
          },
          {
            issueUrl: reportUrls[2],
            ok: true,
            reasons: []
          }
        ],
        workflowCoverage: {
          covered: ["finder-file", "browser-fallback"],
          missing: ["coding-terminal", "screenshot-inspection"]
        }
      },
      readiness: {
        canRunCollect: false
      }
    });
  });
});

function createManifest({
  uiSmokePath,
  ghosttySmokePath,
  chromeSmokePath,
  finderSmokePath,
  voiceSmokePath,
  moneyRunSmokePath,
  includePanicStopProductPathEvidence = true
}: {
  uiSmokePath: string;
  ghosttySmokePath: string;
  chromeSmokePath: string;
  finderSmokePath: string;
  voiceSmokePath: string;
  moneyRunSmokePath?: string;
  includePanicStopProductPathEvidence?: boolean;
}) {
  const requiredEvidence = [
    "Long-horizon money-run supervision evidence"
  ];

  if (includePanicStopProductPathEvidence) {
    requiredEvidence.push("Panic stop product-path behavior evidence");
  }

  return {
    schemaVersion: 1,
    appName: "skfiy",
    commitSha: "abc123",
    bundleIdentifier: "com.sskift.skfiy",
    zip: {
      path: "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip",
      sha256: "feedface"
    },
    uiSmokeArtifactPath: uiSmokePath,
    smokeArtifactPath: ghosttySmokePath,
    chromeSmokeArtifactPath: chromeSmokePath,
    finderSmokeArtifactPath: finderSmokePath,
    voiceSmokeArtifactPath: voiceSmokePath,
    moneyRunSmokeArtifactPath: moneyRunSmokePath,
    requiredDogfoodEvidence: requiredEvidence
  };
}

function createSmokeArtifact(
  artifactPath: string,
  result: string,
  permissions = {
    screenRecording: "authorized",
    accessibility: "authorized",
    microphone: "authorized",
    speechRecognition: "authorized"
  }
) {
  return {
    artifactPath,
    result,
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    permissions: Object.fromEntries(
      Object.entries(permissions).map(([key, state]) => [key, { state }])
    )
  };
}

function createTrackingIssueBody(
  issueUrls: string[],
  options: {
    coveredWorkflows?: string[];
    testerSectionTitle?: string;
    currentAlpha?: {
      release?: string;
      manifest?: string;
      zip?: string;
      zipSha256?: string;
      commit?: string;
      bundleId?: string;
      appName?: string;
    };
  } = {}
) {
  const currentAlpha = options.currentAlpha ?? {
    release: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123",
    manifest: ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
    zip: "skfiy-0.1.0-abc123-macos-unsigned.zip",
    zipSha256: "feedface",
    commit: "abc123",
    bundleId: "com.sskift.skfiy",
    appName: "skfiy"
  };
  const testerLines = issueUrls.length > 0
    ? issueUrls.map((url, index) => `- [ ] Tester ${index + 1} accepted report issue URL: ${url}`)
    : [
      "- [ ] Tester 1 accepted report issue URL:",
      "- [ ] Tester 2 accepted report issue URL:",
      "- [ ] Tester 3 accepted report issue URL:"
    ];
  const covered = new Set(options.coveredWorkflows ?? [
    "coding-terminal",
    "screenshot-inspection",
    "finder-file",
    "browser-fallback"
  ]);
  const workflowLines = [
    "coding-terminal",
    "screenshot-inspection",
    "finder-file",
    "browser-fallback"
  ].map((workflow) => `- [${covered.has(workflow) ? "x" : " "}] \`${workflow}\``);

  return [
    "## Goal",
    "Collect real packaged-app dogfood reports.",
    "",
    "## Current Alpha",
    `- Release: ${currentAlpha.release ?? ""}`,
    `- Manifest: \`${currentAlpha.manifest ?? ""}\``,
    `- Zip: \`${currentAlpha.zip ?? ""}\``,
    `- Zip SHA256: \`${currentAlpha.zipSha256 ?? ""}\``,
    `- Commit: \`${currentAlpha.commit ?? ""}\``,
    `- Bundle id: \`${currentAlpha.bundleId ?? ""}\``,
    `- App name: \`${currentAlpha.appName ?? ""}\``,
    "",
    "## Required Workflow Coverage",
    ...workflowLines,
    "",
    `## ${options.testerSectionTitle ?? "Required Tester Count"}`,
    ...testerLines,
    "",
    "## Cohort Gate",
    "Run dogfood:cohort after collecting reports."
  ].join("\n");
}

function createAcceptedReportIssue(
  testerId: string,
  workflows: string[],
  options: {
    commitSha?: string;
    labels?: string[];
    result?: string;
    includeUiPetDragEvidence?: boolean;
    includeAppBundlePreflightEvidence?: boolean;
    includePanicStopEvidence?: boolean;
  } = {}
) {
  const body = [
      "### alpha manifest",
      "",
      path.basename(manifestPath),
      "",
      "### alpha zip",
      "",
      path.basename("/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip"),
      "",
      "### commit sha",
      "",
      options.commitSha ?? "abc123",
      "",
      "### tester id",
      "",
      testerId,
      "",
      "### cohort workflows",
      "",
      `- [${workflows.includes("coding-terminal") ? "x" : " "}] coding-terminal`,
      `- [${workflows.includes("screenshot-inspection") ? "x" : " "}] screenshot-inspection`,
      `- [${workflows.includes("finder-file") ? "x" : " "}] finder-file`,
      `- [${workflows.includes("browser-fallback") ? "x" : " "}] browser-fallback`,
      ""
    ];

  if (options.includeAppBundlePreflightEvidence !== false) {
    body.push(
      "### app bundle preflight",
      "",
      "appPath: /Applications/skfiy.app",
      "launch: open -na /Applications/skfiy.app --args --remote-debugging-port=9310",
      "appLaunchViaOpen: true",
      "runnerHasTmux: false",
      "productPath: LaunchServices -> renderer DOM -> React permission onboarding",
      ""
    );
  }

  if (options.includeUiPetDragEvidence !== false) {
    body.push(
      "### UI pet drag evidence",
      "",
      "result: passed",
      "source: renderer-pointer-events-window-bounds",
      "beforeBounds: {\"x\":1200,\"y\":820,\"width\":320,\"height\":224}",
      "afterBounds: {\"x\":1200,\"y\":732,\"width\":320,\"height\":224}",
      "moveEvents: 1",
      "totalDeltaX: 0",
      "totalDeltaY: -88",
      "upwardMovement: true",
      "suppressedClickAfterDrag: true",
      ""
    );
  }

  if (options.includePanicStopEvidence !== false) {
    body.push(
      "### panic stop",
      "",
      "accelerator: Control+Alt+Shift+Esc",
      "label: Ctrl Opt Shift Esc",
      "registered: true",
      "source: runtimeStatus.stopTurnHotkey",
      "behaviorResult: passed",
      "behaviorSource: renderer-escape-key-product-path",
      "behaviorCommand: mkdir skfiy-stop-smoke",
      "behaviorBeforeStatus: approval_required",
      "behaviorAfterStatus: idle",
      "behaviorAfterMessage: Task stopped.",
      ""
    );
  }

  body.push(
      "### Computer Use result",
      "",
      options.result ?? "blocked"
  );

  return {
    body: body.join("\n"),
    labels: options.labels ?? [
      "dogfood:accepted",
      ...workflows.map((workflow) => `workflow:${workflow}`)
    ]
  };
}

function createAssignmentComment(
  shortSha: string,
  options: {
    url?: string;
    createdAt?: string;
    includePermissionPreflight?: boolean;
    includeEvidencePreviewGate?: boolean;
    includePacketSchema?: boolean;
  } = {}
) {
  return {
    body: [
      "# skfiy dogfood tester assignments",
      "",
      "Generated: 2026-06-16T12:00:00.000Z",
      "Status: waiting-for-dogfood",
      `Alpha: skfiy-alpha-${shortSha}`,
      options.includePacketSchema === false ? "" : "Packet schema: dogfood-assignments-v2",
      "Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123",
      "Manifest: /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "Tracking issue: https://github.com/Sskift/skfiy/issues/1",
      "",
      options.includePermissionPreflight === false ? "" : "## Permission Preflight",
      "",
      options.includeEvidencePreviewGate === false ? "" : "## Evidence Preview Gate"
    ].filter((line) => line !== "").join("\n"),
    url: options.url,
    createdAt: options.createdAt
  };
}

function createMemoryIo(
  initialFiles: Record<string, unknown>,
  issues: Record<string, { body: string; labels: string[]; comments?: Array<Record<string, unknown>> }>
) {
  const files: Record<string, unknown> = { ...initialFiles };
  const textFiles: Record<string, string> = {};

  return {
    files,
    textFiles,
    async readJson(filePath: string) {
      const file = files[filePath];
      if (file === undefined) {
        throw new Error(`Missing JSON fixture: ${filePath}`);
      }

      return file;
    },
    async readText(filePath: string) {
      const file = files[filePath];
      if (typeof file !== "string") {
        throw new Error(`Missing text fixture: ${filePath}`);
      }

      return file;
    },
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
    },
    async statFile(filePath: string) {
      if (files[filePath] === undefined) {
        throw new Error(`Missing file fixture: ${filePath}`);
      }

      return { size: 1024 };
    },
    async readIssue(issueUrl: string) {
      const issue = issues[issueUrl];
      if (!issue) {
        throw new Error(`Unexpected issue URL: ${issueUrl}`);
      }

      return issue;
    }
  };
}
