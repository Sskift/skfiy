import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";
const alphaZipPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip";

describe("dogfood cohort collector", () => {
  const modulePath = path.join(process.cwd(), "scripts", "collect-dogfood-cohort.mjs");
  const cohortPath = "/repo/.skfiy-dogfood/internal-alpha-cohort.json";
  const reportsDir = "/repo/.skfiy-dogfood/reports";
  const summaryPath = "/repo/.skfiy-dogfood/internal-alpha-summary.md";
  const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";

  it("is exposed as an npm script for collecting accepted report issue URLs from the tracking issue", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:collect": "node scripts/collect-dogfood-cohort.mjs"
    });
  });

  it("parses manifest, tracking issue, report dir, cohort, and summary paths", async () => {
    const {
      createDefaultDogfoodCollectOptions,
      createDogfoodCollectHelpText,
      parseDogfoodCollectArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodCollectOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodCollectHelpText: () => string;
      parseDogfoodCollectArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodCollectOptions("/repo");

    expect(parseDogfoodCollectArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tracking-issue-url",
      trackingIssueUrl,
      "--reports-dir",
      ".skfiy-dogfood/reports",
      "--cohort",
      ".skfiy-dogfood/internal-alpha-cohort.json",
      "--summary",
      ".skfiy-dogfood/internal-alpha-summary.md"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      trackingIssueUrl,
      reportsDir: path.resolve(".skfiy-dogfood/reports"),
      cohortPath: path.resolve(".skfiy-dogfood/internal-alpha-cohort.json"),
      summaryPath: path.resolve(".skfiy-dogfood/internal-alpha-summary.md")
    });
    expect(createDogfoodCollectHelpText()).toContain("dogfood:collect");
    expect(createDogfoodCollectHelpText()).toContain("--tracking-issue-url");
    expect(createDogfoodCollectHelpText()).toContain("accepted report issue URLs");
    expect(createDogfoodCollectHelpText()).toContain("dogfood:cohort");
  });

  it("collects accepted report URLs from the tracking issue into reports and a verified cohort", async () => {
    const { collectDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      collectDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const reportIssueUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103"
    ];
    const trackingBody = createTrackingIssueBody(reportIssueUrls, {
      testerSectionTitle: "Required Real Tester Count"
    });
    const testerDefinitions = [
      {
        testerId: "tester-a",
        issueUrl: reportIssueUrls[0],
        workflows: ["coding-terminal", "screenshot-inspection"],
        smokePrefix: "tester-a"
      },
      {
        testerId: "tester-b",
        issueUrl: reportIssueUrls[1],
        workflows: ["finder-file"],
        smokePrefix: "tester-b"
      },
      {
        testerId: "tester-c",
        issueUrl: reportIssueUrls[2],
        workflows: ["browser-fallback"],
        smokePrefix: "tester-c"
      }
    ];
    const files: Record<string, unknown> = {
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath }
      }
    };
    const acceptedIssues = new Map<string, { body: string; labels: string[] }>();
    for (const definition of testerDefinitions) {
      const smokePaths = createSmokePaths(definition.smokePrefix);
      for (const smokePath of Object.values(smokePaths)) {
        files[smokePath] = createSmokeArtifact(smokePath, "passed");
      }
      acceptedIssues.set(definition.issueUrl, {
        body: createIssueBody(definition.testerId, definition.workflows, smokePaths),
        labels: [
          "dogfood:accepted",
          ...definition.workflows.map((workflow) => `workflow:${workflow}`)
        ]
      });
    }
    const io = createMemoryIo(files, {
      [trackingIssueUrl]: { body: trackingBody, labels: ["skfiy", "dogfood"] },
      ...Object.fromEntries(acceptedIssues)
    });

    await expect(collectDogfoodCohort({
      manifestPath,
      trackingIssueUrl,
      reportsDir,
      cohortPath,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "collected",
      trackingIssueUrl,
      reportIssueUrls,
      reports: [
        {
          testerId: "tester-a",
          issueUrl: reportIssueUrls[0],
          reportPath: path.join(reportsDir, "tester-a.json")
        },
        {
          testerId: "tester-b",
          issueUrl: reportIssueUrls[1],
          reportPath: path.join(reportsDir, "tester-b.json")
        },
        {
          testerId: "tester-c",
          issueUrl: reportIssueUrls[2],
          reportPath: path.join(reportsDir, "tester-c.json")
        }
      ],
      verification: {
        result: "passed",
        summary: {
          totalReports: 3,
          distinctTesters: 3,
          requiredWorkflowCoverage: {
            "coding-terminal": true,
            "screenshot-inspection": true,
            "finder-file": true,
            "browser-fallback": true
          }
        }
      }
    });
    expect(io.files[path.join(reportsDir, "tester-a.json")]).toMatchObject({
      testerId: "tester-a",
      source: {
        issueUrl: reportIssueUrls[0],
        issueLabels: ["dogfood:accepted", "workflow:coding-terminal", "workflow:screenshot-inspection"]
      }
    });
    expect(io.files[cohortPath]).toMatchObject({
      schemaVersion: 1,
      cohortName: "internal-alpha",
      manifestPath,
      reports: [
        expect.objectContaining({ testerId: "tester-a" }),
        expect.objectContaining({ testerId: "tester-b" }),
        expect.objectContaining({ testerId: "tester-c" })
      ]
    });
    expect(io.textFiles[summaryPath]).toContain("Result: passed");
  });

  it("rejects a tracking issue without accepted report issue URLs", async () => {
    const { collectDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      collectDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath }
      }
    }, {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody([]),
        labels: ["skfiy", "dogfood"]
      }
    });

    await expect(collectDogfoodCohort({
      manifestPath,
      trackingIssueUrl,
      reportsDir,
      cohortPath
    }, io)).rejects.toThrow("Tracking issue does not list any accepted dogfood report issue URLs.");
  });

  it("replaces duplicate tester reports discovered from multiple accepted issue URLs", async () => {
    const { collectDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      collectDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const reportIssueUrls = [
      "https://github.com/Sskift/skfiy/issues/101",
      "https://github.com/Sskift/skfiy/issues/102",
      "https://github.com/Sskift/skfiy/issues/103",
      "https://github.com/Sskift/skfiy/issues/104"
    ];
    const testerDefinitions = [
      {
        testerId: "tester-a",
        issueUrl: reportIssueUrls[0],
        workflows: ["coding-terminal"],
        smokePrefix: "tester-a-old"
      },
      {
        testerId: "tester-b",
        issueUrl: reportIssueUrls[1],
        workflows: ["finder-file"],
        smokePrefix: "tester-b"
      },
      {
        testerId: "tester-c",
        issueUrl: reportIssueUrls[2],
        workflows: ["browser-fallback"],
        smokePrefix: "tester-c"
      },
      {
        testerId: "tester-a",
        issueUrl: reportIssueUrls[3],
        workflows: ["coding-terminal", "screenshot-inspection"],
        smokePrefix: "tester-a-new"
      }
    ];
    const files: Record<string, unknown> = {
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath }
      }
    };
    const issues: Record<string, { body: string; labels: string[] }> = {
      [trackingIssueUrl]: {
        body: createTrackingIssueBody(reportIssueUrls),
        labels: ["skfiy", "dogfood"]
      }
    };
    for (const definition of testerDefinitions) {
      const smokePaths = createSmokePaths(definition.smokePrefix);
      for (const smokePath of Object.values(smokePaths)) {
        files[smokePath] = createSmokeArtifact(smokePath, "passed");
      }
      issues[definition.issueUrl] = {
        body: createIssueBody(definition.testerId, definition.workflows, smokePaths),
        labels: [
          "dogfood:accepted",
          ...definition.workflows.map((workflow) => `workflow:${workflow}`)
        ]
      };
    }
    const io = createMemoryIo(files, issues);

    await expect(collectDogfoodCohort({
      manifestPath,
      trackingIssueUrl,
      reportsDir,
      cohortPath,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "collected",
      reports: [
        {
          testerId: "tester-a",
          issueUrl: reportIssueUrls[3],
          reportPath: path.join(reportsDir, "tester-a.json")
        },
        {
          testerId: "tester-b",
          issueUrl: reportIssueUrls[1],
          reportPath: path.join(reportsDir, "tester-b.json")
        },
        {
          testerId: "tester-c",
          issueUrl: reportIssueUrls[2],
          reportPath: path.join(reportsDir, "tester-c.json")
        }
      ],
      verification: {
        result: "passed",
        summary: {
          totalReports: 3,
          distinctTesters: 3
        }
      }
    });
    expect(io.files[path.join(reportsDir, "tester-a.json")]).toMatchObject({
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      source: {
        issueUrl: reportIssueUrls[3]
      }
    });
  });

  it("does not collect report URLs from outside the real tester count section", async () => {
    const { collectDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      collectDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath }
      }
    }, {
      [trackingIssueUrl]: {
        body: [
          "## Goal",
          "This references https://github.com/Sskift/skfiy/issues/999 for context.",
          "",
          "## Cohort Gate",
          "Run dogfood:cohort after collecting reports."
        ].join("\n"),
        labels: ["skfiy", "dogfood"]
      }
    });

    await expect(collectDogfoodCohort({
      manifestPath,
      trackingIssueUrl,
      reportsDir,
      cohortPath
    }, io)).rejects.toThrow("Tracking issue must include a Required Real Tester Count or Required Tester Count section.");
  });

  it("rejects malformed non-numeric GitHub issue URLs before calling gh", async () => {
    const {
      parseDogfoodCollectArgs,
      collectDogfoodCohort
    } = await import(pathToFileURL(modulePath).href) as {
      parseDogfoodCollectArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
      collectDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const options = parseDogfoodCollectArgs([
      "--manifest",
      manifestPath,
      "--tracking-issue-url",
      "https://github.com/Sskift/skfiy/issues/not-a-number"
    ], {
      manifestPath: undefined,
      trackingIssueUrl: undefined,
      reportsDir,
      cohortPath
    });

    await expect(collectDogfoodCohort(options, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        zip: { path: alphaZipPath }
      }
    }, {}))).rejects.toThrow("--tracking-issue-url must be a GitHub issue URL.");
  });
});

function createTrackingIssueBody(
  issueUrls: string[],
  options: { testerSectionTitle?: string } = {}
) {
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
    `## ${options.testerSectionTitle ?? "Required Tester Count"}`,
    ...testerLines,
    "",
    "## Cohort Gate",
    "Run dogfood:cohort after collecting reports."
  ].join("\n");
}

function createSmokePaths(prefix: string) {
  return {
    uiSmokePath: `/repo/.skfiy-smoke/${prefix}-ui.json`,
    ghosttySmokePath: `/repo/.skfiy-smoke/${prefix}-ghostty.json`,
    chromeSmokePath: `/repo/.skfiy-smoke/${prefix}-chrome.json`,
    finderSmokePath: `/repo/.skfiy-smoke/${prefix}-finder.json`,
    voiceSmokePath: `/repo/.skfiy-smoke/${prefix}-voice.json`
  };
}

function createIssueBody(
  testerId: string,
  workflows: string[],
  smokePaths: ReturnType<typeof createSmokePaths>
) {
  return [
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
    testerId,
    "",
    "### cohort workflows",
    "",
    ...["coding-terminal", "screenshot-inspection", "finder-file", "browser-fallback"].map((workflow) =>
      `- [${workflows.includes(workflow) ? "x" : " "}] ${workflow}`
    ),
    "",
    "### UI smoke artifact",
    "",
    smokePaths.uiSmokePath,
    "",
    "### smoke artifact",
    "",
    smokePaths.ghosttySmokePath,
    "",
    "### Chrome smoke artifact",
    "",
    smokePaths.chromeSmokePath,
    "",
    "### Finder smoke artifact",
    "",
    smokePaths.finderSmokePath,
    "",
    "### voice smoke artifact",
    "",
    smokePaths.voiceSmokePath
  ].join("\n");
}

function createSmokeArtifact(artifactPath: string, result: string) {
  return {
    artifactPath,
    result,
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    permissions: {
      screenRecording: { state: "authorized" },
      accessibility: { state: "authorized" },
      microphone: { state: "authorized" },
      speechRecognition: { state: "authorized" }
    }
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
    async mkdir() {},
    async readJson(filePath: string) {
      const file = files[filePath];
      if (file === undefined) {
        throw new Error(`Missing JSON fixture: ${filePath}`);
      }

      return file;
    },
    async writeJson(filePath: string, value: unknown) {
      files[filePath] = value;
    },
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
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
