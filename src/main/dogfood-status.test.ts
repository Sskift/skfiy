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
        body: createTrackingIssueBody(reportUrls),
        labels: ["skfiy", "dogfood"]
      }
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
        missingRequiredReports: 0
      },
      localSmoke: {
        permissionBlockers: []
      },
      readiness: {
        canRunCollect: true,
        cohortReady: false
      },
      nextActions: expect.arrayContaining([
        "Run npm run dogfood:collect with the current manifest and tracking issue."
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
      path: "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip"
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

function createTrackingIssueBody(issueUrls: string[]) {
  const testerLines = issueUrls.length > 0
    ? issueUrls.map((url, index) => `- [ ] Tester ${index + 1} accepted report issue URL: ${url}`)
    : [
      "- [ ] Tester 1 accepted report issue URL:",
      "- [ ] Tester 2 accepted report issue URL:",
      "- [ ] Tester 3 accepted report issue URL:"
    ];

  return [
    "## Goal",
    "Collect real packaged-app dogfood reports.",
    "",
    "## Required Tester Count",
    ...testerLines,
    "",
    "## Cohort Gate",
    "Run dogfood:cohort after collecting reports."
  ].join("\n");
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
