import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood cohort updater", () => {
  const modulePath = path.join(process.cwd(), "scripts", "update-dogfood-cohort.mjs");
  const cohortPath = "/repo/.skfiy-dogfood/internal-alpha-cohort.json";
  const reportPath = "/repo/.skfiy-dogfood/reports/tester-a.json";
  const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";
  const alphaZipPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip";

  it("is exposed as an npm script for accumulating single-user dogfood reports", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:report": "node scripts/update-dogfood-cohort.mjs"
    });
  });

  it("parses report and cohort paths and documents incremental collection", async () => {
    const {
      createDefaultDogfoodReportOptions,
      createDogfoodReportHelpText,
      parseDogfoodReportArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodReportOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodReportHelpText: () => string;
      parseDogfoodReportArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodReportOptions("/repo");

    expect(parseDogfoodReportArgs([
      "--report",
      ".skfiy-dogfood/reports/tester-a.json",
      "--cohort",
      ".skfiy-dogfood/internal-alpha-cohort.json",
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tester-id",
      "tester-a",
      "--workflows",
      "coding-terminal,screenshot-inspection",
      "--issue-url",
      "https://github.com/Sskift/skfiy/issues/123",
      "--issue-labels",
      "dogfood:accepted,workflow:coding-terminal,workflow:screenshot-inspection"
    ], defaults)).toMatchObject({
      reportPath: path.resolve(".skfiy-dogfood/reports/tester-a.json"),
      cohortPath: path.resolve(".skfiy-dogfood/internal-alpha-cohort.json"),
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      issueLabels: [
        "dogfood:accepted",
        "workflow:coding-terminal",
        "workflow:screenshot-inspection"
      ]
    });
    expect(createDogfoodReportHelpText()).toContain("dogfood:report");
    expect(createDogfoodReportHelpText()).toContain("--manifest");
    expect(createDogfoodReportHelpText()).toContain("--issue-url");
    expect(createDogfoodReportHelpText()).toContain("--issue-labels");
    expect(createDogfoodReportHelpText()).toContain("requires all five issue smoke artifact paths");
    expect(createDogfoodReportHelpText()).toContain("requires the issue alpha manifest, zip, and commit sha to match --manifest");
    expect(createDogfoodReportHelpText()).toContain("3-5 distinct testers");
  });

  it("generates a single-user report from an alpha manifest and referenced smoke artifacts", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/tester-a-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "blocked"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "blocked")
    });

    await expect(updateDogfoodCohort({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      issueLabels: [
        "dogfood:accepted",
        "workflow:coding-terminal",
        "workflow:screenshot-inspection"
      ],
      reportPath,
      cohortPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "updated",
      action: "appended",
      reportPath,
      summary: {
        totalReports: 1,
        distinctTesters: 1,
        cohortReady: false
      }
    });
    expect(io.files[reportPath]).toMatchObject({
      testerId: "tester-a",
      result: "blocked",
      manifestPath,
      commitSha: "abc123",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      workflows: ["coding-terminal", "screenshot-inspection"],
      source: {
        type: "github-issue",
        issueUrl: "https://github.com/Sskift/skfiy/issues/123",
        issueLabels: [
          "dogfood:accepted",
          "workflow:coding-terminal",
          "workflow:screenshot-inspection"
        ],
        collectedAt: "2026-06-16T12:00:00.000Z",
        generatedBy: "dogfood:report",
        artifactSource: "alpha-manifest-smoke-artifacts"
      },
      permissionStates: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" },
        microphone: { state: "not-determined" },
        speechRecognition: { state: "not-determined" }
      },
      artifacts: {
        uiSmokeArtifactPath: uiSmokePath,
        ghosttySmokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      artifactResults: {
        ui: "passed",
        ghostty: "blocked",
        chrome: "passed",
        finder: "blocked",
        voice: "blocked"
      }
    });
    expect(io.files[cohortPath]).toMatchObject({
      manifestPath,
      reports: [
        expect.objectContaining({ testerId: "tester-a", result: "blocked" })
      ]
    });
  });

  it("fetches accepted issue labels from GitHub when issue labels are not passed explicitly", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/tester-a-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    });
    const fetchedIssueLabels = [
      "dogfood:accepted",
      "workflow:coding-terminal",
      "workflow:browser-fallback"
    ];

    await expect(updateDogfoodCohort({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "browser-fallback"],
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      reportPath,
      cohortPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, {
      ...io,
      async readIssueLabels(issueUrl: string) {
        expect(issueUrl).toBe("https://github.com/Sskift/skfiy/issues/123");
        return fetchedIssueLabels;
      }
    })).resolves.toMatchObject({
      result: "updated",
      action: "appended"
    });
    expect(io.files[reportPath]).toMatchObject({
      source: {
        issueLabels: fetchedIssueLabels
      }
    });
  });

  it("derives tester id and workflows from the accepted GitHub issue body", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/tester-a-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    });
    const issueBody = [
      "### alpha manifest",
      "",
      path.basename(manifestPath),
      "",
      "### alpha zip",
      "",
      path.basename(alphaZipPath),
      "",
      "### commit sha",
      "",
      "abc123",
      "",
      "### tester id",
      "",
      "tester-from-issue",
      "",
      "### cohort workflows",
      "",
      "- [x] coding-terminal",
      "- [ ] screenshot-inspection",
      "- [x] finder-file",
      "- [ ] browser-fallback",
      "",
      "### UI smoke artifact",
      "",
      uiSmokePath,
      "",
      "### smoke artifact",
      "",
      ghosttySmokePath,
      "",
      "### Chrome smoke artifact",
      "",
      chromeSmokePath,
      "",
      "### Finder smoke artifact",
      "",
      finderSmokePath,
      "",
      "### voice smoke artifact",
      "",
      voiceSmokePath
    ].join("\n");

    await expect(updateDogfoodCohort({
      manifestPath,
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      reportPath,
      cohortPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, {
      ...io,
      async readIssue(issueUrl: string) {
        expect(issueUrl).toBe("https://github.com/Sskift/skfiy/issues/123");
        return {
          body: issueBody,
          labels: [
            "dogfood:accepted",
            "workflow:coding-terminal",
            "workflow:finder-file"
          ]
        };
      }
    })).resolves.toMatchObject({
      result: "updated",
      action: "appended",
      reportTesterId: "tester-from-issue"
    });
    expect(io.files[reportPath]).toMatchObject({
      testerId: "tester-from-issue",
      workflows: ["coding-terminal", "finder-file"],
      source: {
        issueLabels: [
          "dogfood:accepted",
          "workflow:coding-terminal",
          "workflow:finder-file"
        ]
      }
    });
  });

  it("uses tester smoke artifact paths from the accepted GitHub issue body", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestUiSmokePath = "/repo/.skfiy-smoke/manifest-ui.json";
    const manifestGhosttySmokePath = "/repo/.skfiy-smoke/manifest-ghostty.json";
    const manifestChromeSmokePath = "/repo/.skfiy-smoke/manifest-chrome.json";
    const manifestFinderSmokePath = "/repo/.skfiy-smoke/manifest-finder.json";
    const manifestVoiceSmokePath = "/repo/.skfiy-smoke/manifest-voice.json";
    const testerUiSmokePath = "/repo/.skfiy-smoke/tester-issue-ui.json";
    const testerGhosttySmokePath = "/repo/.skfiy-smoke/tester-issue-ghostty.json";
    const testerChromeSmokePath = "/repo/.skfiy-smoke/tester-issue-chrome.json";
    const testerFinderSmokePath = "/repo/.skfiy-smoke/tester-issue-finder.json";
    const testerVoiceSmokePath = "/repo/.skfiy-smoke/tester-issue-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath },
        uiSmokeArtifactPath: manifestUiSmokePath,
        smokeArtifactPath: manifestGhosttySmokePath,
        chromeSmokeArtifactPath: manifestChromeSmokePath,
        finderSmokeArtifactPath: manifestFinderSmokePath,
        voiceSmokeArtifactPath: manifestVoiceSmokePath
      },
      [testerUiSmokePath]: createSmokeArtifact(testerUiSmokePath, "passed"),
      [testerGhosttySmokePath]: createSmokeArtifact(testerGhosttySmokePath, "passed"),
      [testerChromeSmokePath]: createSmokeArtifact(testerChromeSmokePath, "passed"),
      [testerFinderSmokePath]: createSmokeArtifact(testerFinderSmokePath, "passed"),
      [testerVoiceSmokePath]: createSmokeArtifact(testerVoiceSmokePath, "passed")
    });
    const issueBody = [
      "### alpha manifest",
      "",
      path.basename(manifestPath),
      "",
      "### alpha zip",
      "",
      path.basename(alphaZipPath),
      "",
      "### commit sha",
      "",
      "abc123",
      "",
      "### tester id",
      "",
      "tester-artifact-paths",
      "",
      "### cohort workflows",
      "",
      "- [x] coding-terminal",
      "- [ ] screenshot-inspection",
      "- [x] finder-file",
      "- [ ] browser-fallback",
      "",
      "### UI smoke artifact",
      "",
      testerUiSmokePath,
      "",
      "### smoke artifact",
      "",
      testerGhosttySmokePath,
      "",
      "### Chrome smoke artifact",
      "",
      testerChromeSmokePath,
      "",
      "### Finder smoke artifact",
      "",
      testerFinderSmokePath,
      "",
      "### voice smoke artifact",
      "",
      testerVoiceSmokePath
    ].join("\n");

    await expect(updateDogfoodCohort({
      manifestPath,
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      reportPath,
      cohortPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, {
      ...io,
      async readIssue() {
        return {
          body: issueBody,
          labels: [
            "dogfood:accepted",
            "workflow:coding-terminal",
            "workflow:finder-file"
          ]
        };
      }
    })).resolves.toMatchObject({
      result: "updated",
      action: "appended"
    });
    expect(io.files[reportPath]).toMatchObject({
      testerId: "tester-artifact-paths",
      source: {
        artifactSource: "github-issue-smoke-artifacts"
      },
      artifacts: {
        uiSmokeArtifactPath: testerUiSmokePath,
        ghosttySmokeArtifactPath: testerGhosttySmokePath,
        chromeSmokeArtifactPath: testerChromeSmokePath,
        finderSmokeArtifactPath: testerFinderSmokePath,
        voiceSmokeArtifactPath: testerVoiceSmokePath
      },
      artifactResults: {
        ui: "passed",
        ghostty: "passed",
        chrome: "passed",
        finder: "passed",
        voice: "passed"
      }
    });
  });

  it("rejects accepted issue bodies that do not list every tester smoke artifact path", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/tester-a-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    });
    const incompleteIssueBody = [
      "### alpha manifest",
      "",
      path.basename(manifestPath),
      "",
      "### alpha zip",
      "",
      path.basename(alphaZipPath),
      "",
      "### commit sha",
      "",
      "abc123",
      "",
      "### tester id",
      "",
      "tester-incomplete-artifacts",
      "",
      "### cohort workflows",
      "",
      "- [x] coding-terminal",
      "",
      "### UI smoke artifact",
      "",
      uiSmokePath,
      "",
      "### smoke artifact",
      "",
      ghosttySmokePath,
      "",
      "### Chrome smoke artifact",
      "",
      chromeSmokePath,
      "",
      "### voice smoke artifact",
      "",
      voiceSmokePath
    ].join("\n");

    await expect(updateDogfoodCohort({
      manifestPath,
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      reportPath,
      cohortPath
    }, {
      ...io,
      async readIssue() {
        return {
          body: incompleteIssueBody,
          labels: [
            "dogfood:accepted",
            "workflow:coding-terminal"
          ]
        };
      }
    })).rejects.toThrow("Issue Finder smoke artifact must include an absolute path.");
  });

  it("rejects accepted issue bodies whose alpha identity does not match the manifest", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/tester-a-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    });
    const mismatchedIssueBody = [
      "### alpha manifest",
      "",
      path.basename(manifestPath),
      "",
      "### alpha zip",
      "",
      path.basename(alphaZipPath),
      "",
      "### commit sha",
      "",
      "different-commit",
      "",
      "### tester id",
      "",
      "tester-wrong-alpha",
      "",
      "### cohort workflows",
      "",
      "- [x] coding-terminal",
      "",
      "### UI smoke artifact",
      "",
      uiSmokePath,
      "",
      "### smoke artifact",
      "",
      ghosttySmokePath,
      "",
      "### Chrome smoke artifact",
      "",
      chromeSmokePath,
      "",
      "### Finder smoke artifact",
      "",
      finderSmokePath,
      "",
      "### voice smoke artifact",
      "",
      voiceSmokePath
    ].join("\n");

    await expect(updateDogfoodCohort({
      manifestPath,
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      reportPath,
      cohortPath
    }, {
      ...io,
      async readIssue() {
        return {
          body: mismatchedIssueBody,
          labels: [
            "dogfood:accepted",
            "workflow:coding-terminal"
          ]
        };
      }
    })).rejects.toThrow("Issue commit sha must match manifest commitSha.");
  });

  it("requires a GitHub issue URL when generating a real dogfood report from a manifest", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123"
      }
    });

    await expect(updateDogfoodCohort({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      reportPath,
      cohortPath
    }, io)).rejects.toThrow("Missing --issue-url <url>");
  });

  it("requires accepted GitHub issue labels that match the generated report workflows", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/tester-a-voice.json";
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath
      },
      [uiSmokePath]: createSmokeArtifact(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmokeArtifact(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmokeArtifact(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmokeArtifact(finderSmokePath, "passed"),
      [voiceSmokePath]: createSmokeArtifact(voiceSmokePath, "passed")
    });

    await expect(updateDogfoodCohort({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "browser-fallback"],
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      issueLabels: ["dogfood", "workflow:coding-terminal"],
      reportPath,
      cohortPath
    }, io)).rejects.toThrow("--issue-labels must include dogfood:accepted");

    await expect(updateDogfoodCohort({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "browser-fallback"],
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      issueLabels: ["dogfood:accepted", "workflow:coding-terminal"],
      reportPath,
      cohortPath
    }, io)).rejects.toThrow("--issue-labels must include workflow:browser-fallback");

    await expect(updateDogfoodCohort({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      issueUrl: "https://github.com/Sskift/skfiy/issues/123",
      issueLabels: [
        "dogfood:accepted",
        "workflow:coding-terminal",
        "workflow:browser-fallback"
      ],
      reportPath,
      cohortPath
    }, io)).rejects.toThrow("--issue-labels workflow labels must match --workflows");
  });

  it("creates a cohort file from a single report without pretending the cohort is complete", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [reportPath]: createReport("tester-a", ["coding-terminal", "screenshot-inspection"])
    });

    await expect(updateDogfoodCohort({
      reportPath,
      cohortPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "updated",
      action: "appended",
      cohortPath,
      summary: {
        totalReports: 1,
        distinctTesters: 1,
        cohortReady: false,
        requiredWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": false,
          "browser-fallback": false
        }
      }
    });
    expect(io.files[cohortPath]).toMatchObject({
      schemaVersion: 1,
      cohortName: "internal-alpha",
      generatedAt: "2026-06-16T12:00:00.000Z",
      manifestPath,
      reports: [
        expect.objectContaining({ testerId: "tester-a" })
      ]
    });
  });

  it("replaces an existing tester report instead of duplicating tester ids", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const updatedReport = {
      ...createReport("tester-a", ["coding-terminal", "browser-fallback"], "passed"),
      artifacts: {
        ...createReport("tester-a", ["coding-terminal"]).artifacts,
        chromeSmokeArtifactPath: "/repo/.skfiy-smoke/tester-a-updated-chrome.json"
      }
    };
    const io = createMemoryIo({
      [reportPath]: updatedReport,
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal"]),
        createReport("tester-b", ["finder-file"])
      ])
    });

    await expect(updateDogfoodCohort({
      reportPath,
      cohortPath,
      now: () => "2026-06-16T13:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "updated",
      action: "replaced",
      summary: {
        totalReports: 2,
        distinctTesters: 2,
        requiredWorkflowCoverage: {
          "coding-terminal": true,
          "finder-file": true,
          "browser-fallback": true
        }
      }
    });
    expect(io.files[cohortPath]).toMatchObject({
      reports: [
        expect.objectContaining({
          testerId: "tester-a",
          result: "passed",
          artifacts: expect.objectContaining({
            chromeSmokeArtifactPath: "/repo/.skfiy-smoke/tester-a-updated-chrome.json"
          })
        }),
        expect.objectContaining({ testerId: "tester-b" })
      ]
    });
  });

  it("rejects a report from a different alpha manifest", async () => {
    const { updateDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      updateDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [reportPath]: {
        ...createReport("tester-c", ["browser-fallback"]),
        manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-other-macos-unsigned.json"
      },
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal"]),
        createReport("tester-b", ["finder-file"])
      ])
    });

    await expect(updateDogfoodCohort({
      reportPath,
      cohortPath
    }, io)).rejects.toThrow("Report manifestPath must match cohort manifestPath");
  });

  function createCohort(reports: unknown[]) {
    return {
      schemaVersion: 1,
      cohortName: "internal-alpha",
      generatedAt: "2026-06-16T12:00:00.000Z",
      manifestPath,
      reports
    };
  }

  function createReport(
    testerId: string,
    workflows: string[],
    result: "passed" | "blocked" = "blocked"
  ) {
    return {
      testerId,
      result,
      manifestPath,
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      workflows,
      source: {
        type: "github-issue",
        issueUrl: `https://github.com/Sskift/skfiy/issues/${testerId.replace("tester-", "")}`,
        issueLabels: [
          "dogfood:accepted",
          ...workflows.map((workflow) => `workflow:${workflow}`)
        ],
        collectedAt: "2026-06-16T12:00:00.000Z",
        generatedBy: "dogfood:report",
        artifactSource: "alpha-manifest-smoke-artifacts"
      },
      permissionStates: {
        screenRecording: { state: result === "passed" ? "granted" : "denied" },
        accessibility: { state: result === "passed" ? "granted" : "denied" },
        microphone: { state: result === "passed" ? "granted" : "not-determined" },
        speechRecognition: { state: result === "passed" ? "granted" : "not-determined" }
      },
      artifacts: {
        uiSmokeArtifactPath: `/repo/.skfiy-smoke/${testerId}-ui.json`,
        ghosttySmokeArtifactPath: `/repo/.skfiy-smoke/${testerId}-ghostty.json`,
        chromeSmokeArtifactPath: `/repo/.skfiy-smoke/${testerId}-chrome.json`,
        finderSmokeArtifactPath: `/repo/.skfiy-smoke/${testerId}-finder.json`,
        voiceSmokeArtifactPath: `/repo/.skfiy-smoke/${testerId}-voice.json`
      }
    };
  }

  function createSmokeArtifact(
    artifactPath: string,
    result: "passed" | "blocked" | "no-transcript" | "sensitive-paused"
  ) {
    return {
      result,
      artifactPath,
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      permissions: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" },
        microphone: { state: "not-determined" },
        speechRecognition: { state: "not-determined" }
      }
    };
  }
});

function createMemoryIo(files: Record<string, unknown>) {
  return {
    files,
    async exists(filePath: string) {
      return Object.prototype.hasOwnProperty.call(files, filePath);
    },
    async mkdir() {
      return undefined;
    },
    async readJson(filePath: string) {
      const value = files[filePath];
      if (value === undefined) {
        throw new Error(`Missing JSON: ${filePath}`);
      }

      return value;
    },
    async writeJson(filePath: string, value: unknown) {
      files[filePath] = value;
    }
  };
}
