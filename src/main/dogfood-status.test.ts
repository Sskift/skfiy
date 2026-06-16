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

  it("parses manifest, tracking issue, and summary paths", async () => {
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
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      trackingIssueUrl,
      summaryPath: path.resolve(".skfiy-dogfood/status.md"),
      requireCurrentHead: true
    });
    expect(createDogfoodStatusHelpText()).toContain("dogfood:status");
    expect(createDogfoodStatusHelpText()).toContain("non-mutating");
    expect(createDogfoodStatusHelpText()).toContain("accepted report URLs");
    expect(createDogfoodStatusHelpText()).toContain("real tester");
    expect(createDogfoodStatusHelpText()).toContain("tester assignments");
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
    }, io);

    expect(status).toMatchObject({
      testerAssignments: [
        {
          testerId: "tester-1",
          workflows: ["coding-terminal", "screenshot-inspection"],
          purpose: "real-tester-count-and-workflow-coverage",
          commands: {
            prepareAlpha: expect.stringContaining("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123 --tester-id tester-1 --workflows coding-terminal,screenshot-inspection --execute"),
            tester: expect.stringContaining("npm run dogfood:tester -- --manifest /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json --app <path-to-unzipped-skfiy.app> --tester-id tester-1 --workflows coding-terminal,screenshot-inspection"),
            review: expect.stringContaining("npm run dogfood:review -- --manifest /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json --issue-url <filed-dogfood-issue-url> --summary .skfiy-dogfood/reviews/tester-1.md")
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
    expect(io.textFiles[summaryPath]).toContain("## Recommended Tester Assignments");
    expect(io.textFiles[summaryPath]).toContain("- tester-1: coding-terminal, screenshot-inspection");
    expect(io.textFiles[summaryPath]).toContain("npm run dogfood:tester -- --manifest /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json --app <path-to-unzipped-skfiy.app> --tester-id tester-1 --workflows coding-terminal,screenshot-inspection");
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

    await expect(createDogfoodStatus({
      manifestPath,
      trackingIssueUrl,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
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
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Run npm run dogfood:collect with the current manifest and tracking issue.",
        "Collect passed product-path evidence for workflows: finder-file, browser-fallback."
      ])
    });
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
      nextActions: expect.arrayContaining([
        "Collect at least 3 accepted real tester report issue URLs in GitHub issue #1."
      ])
    });
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
});

function createManifest({
  uiSmokePath,
  ghosttySmokePath,
  chromeSmokePath,
  finderSmokePath,
  voiceSmokePath
}: {
  uiSmokePath: string;
  ghosttySmokePath: string;
  chromeSmokePath: string;
  finderSmokePath: string;
  voiceSmokePath: string;
}) {
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
    voiceSmokeArtifactPath: voiceSmokePath
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
  options: { commitSha?: string; labels?: string[]; result?: string } = {}
) {
  return {
    body: [
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
      "",
      "### Computer Use result",
      "",
      options.result ?? "blocked"
    ].join("\n"),
    labels: options.labels ?? [
      "dogfood:accepted",
      ...workflows.map((workflow) => `workflow:${workflow}`)
    ]
  };
}

function createMemoryIo(
  initialFiles: Record<string, unknown>,
  issues: Record<string, { body: string; labels: string[] }>
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
