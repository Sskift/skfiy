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

  it("parses manifest, issue URL, summary, tracking issue, execute, and current-head arguments", async () => {
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
      "--tracking-issue-url",
      "https://github.com/Sskift/skfiy/issues/1",
      "--summary",
      ".skfiy-dogfood/reviews/tester-a.md",
      "--execute",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      issueUrl,
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      summaryPath: path.resolve(".skfiy-dogfood/reviews/tester-a.md"),
      execute: true,
      requireCurrentHead: true
    });
    expect(createDogfoodReviewHelpText()).toContain("dogfood:review");
    expect(createDogfoodReviewHelpText()).toContain("non-mutating");
    expect(createDogfoodReviewHelpText()).toContain("suggested labels");
    expect(createDogfoodReviewHelpText()).toContain("--tracking-issue-url");
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
      acceptanceCommand: "gh issue edit 123 --repo Sskift/skfiy --add-label dogfood:accepted --add-label workflow:coding-terminal --add-label workflow:screenshot-inspection",
      trackingIssueCommand: "npm run dogfood:tracking-issue -- --manifest /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --accepted-report-url https://github.com/Sskift/skfiy/issues/123 --output .skfiy-dogfood/tracking-issue-abc123.md",
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
    expect(io.textFiles[summaryPath]).toContain("gh issue edit 123 --repo Sskift/skfiy --add-label dogfood:accepted --add-label workflow:coding-terminal --add-label workflow:screenshot-inspection");
    expect(io.textFiles[summaryPath]).toContain("npm run dogfood:tracking-issue -- --manifest /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --accepted-report-url https://github.com/Sskift/skfiy/issues/123 --output .skfiy-dogfood/tracking-issue-abc123.md");
    expect(io.mutations).toEqual([]);
  });

  it("executes maintainer acceptance labels and tracking issue sync when explicitly requested", async () => {
    const { reviewDogfoodReport } = await import(pathToFileURL(modulePath).href) as {
      reviewDogfoodReport: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const paths = createSmokePaths("tester-a");
    const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";
    const io = createMemoryIo({
      files: {
        [manifestPath]: createManifest("abc1234"),
        [paths.ui]: createSmokeArtifact(paths.ui, "passed"),
        [paths.ghostty]: createSmokeArtifact(paths.ghostty, "blocked"),
        [paths.chrome]: createSmokeArtifact(paths.chrome, "passed"),
        [paths.finder]: createSmokeArtifact(paths.finder, "blocked"),
      },
      issues: {
        [issueUrl]: {
          body: createIssueBody("tester-a", ["coding-terminal", "screenshot-inspection"], paths, {
            commitSha: "abc1234"
          }),
          labels: ["skfiy"]
        },
        [trackingIssueUrl]: {
          body: "",
          labels: []
        }
      }
    });

    await expect(reviewDogfoodReport({
      rootDir: "/repo",
      manifestPath,
      issueUrl,
      trackingIssueUrl,
      summaryPath,
      execute: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "accepted",
      eligibleForAcceptance: true,
      execution: {
        labelsAdded: [
          "dogfood:accepted",
          "workflow:coding-terminal",
          "workflow:screenshot-inspection"
        ],
        trackingIssue: {
          result: "updated",
          dryRun: false,
          trackingIssueUrl
        }
      }
    });
    expect(io.mutations).toEqual([
      {
        command: "gh",
        args: [
          "issue",
          "edit",
          "123",
          "--repo",
          "Sskift/skfiy",
          "--add-label",
          "dogfood:accepted",
          "--add-label",
          "workflow:coding-terminal",
          "--add-label",
          "workflow:screenshot-inspection"
        ]
      },
      {
        command: "gh",
        args: [
          "issue",
          "edit",
          "1",
          "--repo",
          "Sskift/skfiy",
          "--body-file",
          "/repo/.skfiy-dogfood/tracking-issue-abc1234.md"
        ]
      }
    ]);
    expect(io.textFiles[summaryPath]).toContain("Result: accepted");
    expect(io.textFiles[summaryPath]).toContain("This review added missing labels and refreshed the tracking issue.");
    expect(io.textFiles["/repo/.skfiy-dogfood/tracking-issue-abc1234.md"]).toContain(issueUrl);
  });

  it("allows local synthetic reports to be accepted as local evidence without making them real testers", async () => {
    const { reviewDogfoodReport } = await import(pathToFileURL(modulePath).href) as {
      reviewDogfoodReport: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const paths = createSmokePaths("local-abc123");
    const io = createMemoryIo({
      files: {
        [manifestPath]: createManifest("abc123"),
        [paths.ui]: createSmokeArtifact(paths.ui, "passed"),
        [paths.ghostty]: createSmokeArtifact(paths.ghostty, "blocked"),
        [paths.chrome]: createSmokeArtifact(paths.chrome, "passed"),
        [paths.finder]: createSmokeArtifact(paths.finder, "blocked"),
      },
      issues: {
        [issueUrl]: {
          body: createIssueBody("local-abc123", [
            "coding-terminal",
            "screenshot-inspection",
            "finder-file",
            "browser-fallback"
          ], paths),
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
      testerId: "local-abc123",
      reportPreviewEligibility: {
        eligible: true,
        blockingChecks: []
      }
    });
    expect(io.textFiles[summaryPath]).toContain("Eligible for acceptance: yes");
    expect(io.textFiles[summaryPath]).toContain("gh issue edit 123 --repo Sskift/skfiy");
    expect(io.textFiles[summaryPath]).not.toContain("dogfood:tracking-issue");
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
    expect(io.textFiles[summaryPath]).toContain("Result: rejected");
    expect(io.textFiles[summaryPath]).toContain("Eligible for acceptance: no");
    expect(io.textFiles[summaryPath]).toContain("Tester: tester-a");
    expect(io.textFiles[summaryPath]).toContain("Workflows: coding-terminal");
    expect(io.textFiles[summaryPath]).toContain("Issue commit sha must match manifest commitSha.");
    expect(io.textFiles[summaryPath]).toContain("- unavailable until blocking checks are resolved");
    expect(io.textFiles[summaryPath]).not.toContain("gh issue edit");
    expect(io.textFiles[summaryPath]).not.toContain("dogfood:tracking-issue");
    expect(io.mutations).toEqual([]);
  });

  function createSmokePaths(testerId: string) {
    return {
      ui: `/repo/.skfiy-smoke/${testerId}-ui.json`,
      ghostty: `/repo/.skfiy-smoke/${testerId}-ghostty.json`,
      chrome: `/repo/.skfiy-smoke/${testerId}-chrome.json`,
      finder: `/repo/.skfiy-smoke/${testerId}-finder.json`,
    };
  }

  function createManifest(commitSha: string) {
    return {
      schemaVersion: 1,
      appName: "skfiy",
      commitSha,
      bundleIdentifier: "com.sskift.skfiy",
      artifactBaseName: `skfiy-0.1.0-${commitSha}-macos-unsigned`,
      uiSmokeArtifactPath: "/repo/.skfiy-smoke/ui.json",
      zip: {
        path: alphaZipPath,
        sha256: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd"
      }
    };
  }

  function createSmokeArtifact(artifactPath: string, result: string) {
    return {
      artifactPath,
      result,
      appPath: "/repo/dist/skfiy.app",
      launch: "open -na /repo/dist/skfiy.app --args --remote-debugging-port=9310",
      productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      petDrag: {
        result: "passed",
        source: "renderer-pointer-events-window-bounds",
        beforeBounds: { x: 1200, y: 820, width: 320, height: 224 },
        afterBounds: { x: 1200, y: 732, width: 320, height: 224 },
        moveEvents: [{ type: "pointermove", clientX: 1260, clientY: 760 }],
        totalDeltaX: 0,
        totalDeltaY: -88,
        upwardMovement: true,
        suppressedClickAfterDrag: true
      },
      permissions: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" },
      },
      runtimeStatus: {
        stopTurnHotkey: {
          accelerator: "Control+Alt+Shift+Esc",
          label: "Ctrl Opt Shift Esc",
          registered: true
        }
      },
      stopTurnBehavior: {
        result: "passed",
        source: "renderer-escape-key-product-path",
        command: "mkdir skfiy-stop-smoke",
        beforeStatus: "approval_required",
        afterStatus: "idle",
        afterMessage: "Task stopped."
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
      "",
      "### app bundle preflight",
      "",
      "appPath: /repo/dist/skfiy.app",
      "launch: open -na /repo/dist/skfiy.app --args --remote-debugging-port=9310",
      "appLaunchViaOpen: true",
      "runnerHasTmux: false",
      "productPath: LaunchServices -> renderer DOM -> React permission onboarding",
      "",
      ...createUiPetDragEvidenceLines(),
      "",
      ...createPanicStopEvidenceLines()
    ].join("\n");
  }

  function createUiPetDragEvidenceLines() {
    return [
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
      "suppressedClickAfterDrag: true"
    ];
  }

  function createPanicStopEvidenceLines() {
    return [
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
      "behaviorAfterMessage: Task stopped."
    ];
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
      },
      async execFile(command: string, args: string[]) {
        mutations.push({ command, args });
        return { stdout: "", stderr: "" };
      }
    };
  }
});
