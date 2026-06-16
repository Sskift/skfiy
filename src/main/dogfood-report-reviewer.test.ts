import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood report reviewer", () => {
  const modulePath = path.join(process.cwd(), "scripts", "review-dogfood-report.mjs");
  const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";
  const alphaZipPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip";
  const issueUrl = "https://github.com/Sskift/skfiy/issues/123";
  const summaryPath = "/repo/.skfiy-dogfood/reviews/tester-a.md";

  it("is exposed as an npm script for non-mutating maintainer review", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:review": "node scripts/review-dogfood-report.mjs"
    });
  });

  it("parses manifest, issue URL, summary, and current-head arguments", async () => {
    const {
      createDefaultDogfoodReviewOptions,
      createDogfoodReviewHelpText,
      parseDogfoodReviewArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodReviewOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodReviewHelpText: () => string;
      parseDogfoodReviewArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodReviewOptions("/repo");

    expect(parseDogfoodReviewArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--issue-url",
      issueUrl,
      "--summary",
      ".skfiy-dogfood/reviews/tester-a.md",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      issueUrl,
      summaryPath: path.resolve(".skfiy-dogfood/reviews/tester-a.md"),
      requireCurrentHead: true
    });
    expect(createDogfoodReviewHelpText()).toContain("dogfood:review");
    expect(createDogfoodReviewHelpText()).toContain("non-mutating");
    expect(createDogfoodReviewHelpText()).toContain("suggested labels");
  });

  it("reviews an unaccepted filed issue with synthetic acceptance labels without mutating GitHub", async () => {
    const { reviewDogfoodReport } = await import(pathToFileURL(modulePath).href) as {
      reviewDogfoodReport: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const paths = createSmokePaths("tester-a");
    const io = createMemoryIo({
      files: {
        [manifestPath]: createManifest("abc123"),
        [paths.ui]: createSmokeArtifact(paths.ui, "passed"),
        [paths.ghostty]: createSmokeArtifact(paths.ghostty, "blocked"),
        [paths.chrome]: createSmokeArtifact(paths.chrome, "passed"),
        [paths.finder]: createSmokeArtifact(paths.finder, "blocked"),
        [paths.voice]: createSmokeArtifact(paths.voice, "blocked")
      },
      issues: {
        [issueUrl]: {
          body: createIssueBody("tester-a", ["coding-terminal", "screenshot-inspection"], paths),
          labels: ["skfiy"]
        }
      }
    });

    await expect(reviewDogfoodReport({
      manifestPath,
      issueUrl,
      summaryPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "reviewed",
      eligibleForAcceptance: true,
      issueUrl,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      suggestedLabels: [
        "dogfood:accepted",
        "workflow:coding-terminal",
        "workflow:screenshot-inspection"
      ],
      currentLabels: ["skfiy"],
      missingSuggestedLabels: [
        "dogfood:accepted",
        "workflow:coding-terminal",
        "workflow:screenshot-inspection"
      ],
      reportPreview: {
        testerId: "tester-a",
        result: "blocked",
        source: {
          issueUrl,
          issueLabels: [
            "dogfood:accepted",
            "workflow:coding-terminal",
            "workflow:screenshot-inspection"
          ],
          generatedBy: "dogfood:report",
          artifactSource: "github-issue-smoke-artifacts"
        }
      },
      reportPreviewEligibility: {
        eligible: true,
        blockingChecks: []
      }
    });
    expect(io.textFiles[summaryPath]).toContain("Result: reviewed");
    expect(io.textFiles[summaryPath]).toContain("Eligible for acceptance: yes");
    expect(io.textFiles[summaryPath]).toContain("dogfood:accepted");
    expect(io.mutations).toEqual([]);
  });

  it("rejects a filed report whose alpha identity does not match the selected manifest", async () => {
    const { reviewDogfoodReport } = await import(pathToFileURL(modulePath).href) as {
      reviewDogfoodReport: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const paths = createSmokePaths("tester-a");
    const io = createMemoryIo({
      files: {
        [manifestPath]: createManifest("abc123"),
        [paths.ui]: createSmokeArtifact(paths.ui, "passed"),
        [paths.ghostty]: createSmokeArtifact(paths.ghostty, "passed"),
        [paths.chrome]: createSmokeArtifact(paths.chrome, "passed"),
        [paths.finder]: createSmokeArtifact(paths.finder, "passed"),
        [paths.voice]: createSmokeArtifact(paths.voice, "passed")
      },
      issues: {
        [issueUrl]: {
          body: createIssueBody("tester-a", ["coding-terminal"], paths, { commitSha: "wrong-sha" }),
          labels: []
        }
      }
    });

    await expect(reviewDogfoodReport({
      manifestPath,
      issueUrl,
      summaryPath
    }, io)).rejects.toThrow("Issue commit sha must match manifest commitSha.");
    expect(io.mutations).toEqual([]);
  });

  function createSmokePaths(testerId: string) {
    return {
      ui: `/repo/.skfiy-smoke/${testerId}-ui.json`,
      ghostty: `/repo/.skfiy-smoke/${testerId}-ghostty.json`,
      chrome: `/repo/.skfiy-smoke/${testerId}-chrome.json`,
      finder: `/repo/.skfiy-smoke/${testerId}-finder.json`,
      voice: `/repo/.skfiy-smoke/${testerId}-voice.json`
    };
  }

  function createManifest(commitSha: string) {
    return {
      schemaVersion: 1,
      appName: "skfiy",
      commitSha,
      zip: { path: alphaZipPath }
    };
  }

  function createSmokeArtifact(artifactPath: string, result: string) {
    return {
      artifactPath,
      result,
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

  function createIssueBody(
    testerId: string,
    workflows: string[],
    paths: ReturnType<typeof createSmokePaths>,
    overrides: { commitSha?: string } = {}
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
      overrides.commitSha ?? "abc123",
      "",
      "### tester id",
      "",
      testerId,
      "",
      "### cohort workflows",
      "",
      ...["coding-terminal", "screenshot-inspection", "finder-file", "browser-fallback"]
        .map((workflow) => `- [${workflows.includes(workflow) ? "x" : " "}] ${workflow}`),
      "",
      "### UI smoke artifact",
      "",
      paths.ui,
      "",
      "### smoke artifact",
      "",
      paths.ghostty,
      "",
      "### Chrome smoke artifact",
      "",
      paths.chrome,
      "",
      "### Finder smoke artifact",
      "",
      paths.finder,
      "",
      "### voice smoke artifact",
      "",
      paths.voice
    ].join("\n");
  }

  function createMemoryIo({
    files,
    issues
  }: {
    files: Record<string, unknown>;
    issues: Record<string, { body: string; labels: string[] }>;
  }) {
    const textFiles: Record<string, string> = {};
    const mutations: unknown[] = [];

    return {
      textFiles,
      mutations,
      async readJson(filePath: string) {
        if (!(filePath in files)) {
          throw new Error(`Missing JSON fixture: ${filePath}`);
        }

        return files[filePath];
      },
      async readIssue(url: string) {
        if (!(url in issues)) {
          throw new Error(`Missing issue fixture: ${url}`);
        }

        return issues[url];
      },
      async readCurrentHead() {
        return "abc123";
      },
      async mkdir() {},
      async writeText(filePath: string, text: string) {
        textFiles[filePath] = text;
      }
    };
  }
});
