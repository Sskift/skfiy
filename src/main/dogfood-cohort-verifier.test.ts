import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood cohort verifier", () => {
  const modulePath = path.join(process.cwd(), "scripts", "verify-dogfood-cohort.mjs");
  const cohortPath = "/repo/.skfiy-dogfood/internal-alpha-cohort.json";
  const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";

  it("is exposed as an npm script for internal dogfood cohort checks", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:cohort": "node scripts/verify-dogfood-cohort.mjs"
    });
  });

  it("parses an explicit cohort path and documents required workflows", async () => {
    const {
      createDefaultDogfoodCohortOptions,
      createDogfoodCohortHelpText,
      parseDogfoodCohortArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodCohortOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodCohortHelpText: () => string;
      parseDogfoodCohortArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodCohortOptions("/repo");

    expect(parseDogfoodCohortArgs([
      "--cohort",
      ".skfiy-dogfood/internal-alpha-cohort.json",
      "--summary",
      ".skfiy-dogfood/internal-alpha-summary.md",
      "--require-passed"
    ], defaults)).toMatchObject({
      cohortPath: path.resolve(".skfiy-dogfood/internal-alpha-cohort.json"),
      summaryPath: path.resolve(".skfiy-dogfood/internal-alpha-summary.md"),
      requirePassed: true
    });
    expect(createDogfoodCohortHelpText()).toContain("coding-terminal");
    expect(createDogfoodCohortHelpText()).toContain("--summary");
    expect(createDogfoodCohortHelpText()).toContain("browser-fallback");
    expect(createDogfoodCohortHelpText()).toContain("artifactSource=github-issue-smoke-artifacts");
    expect(createDogfoodCohortHelpText()).toContain("issue alpha manifest/zip/commit identity");
    expect(createDogfoodCohortHelpText()).toContain("Workflow coverage counts only reports");
    expect(createDogfoodCohortHelpText()).toContain("--require-passed");
  });

  it("accepts a 3-person cohort that covers all required dogfood workflows", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"], "passed"),
        createReport("tester-b", ["finder-file"], "blocked"),
        createReport("tester-c", ["browser-fallback"], "blocked")
      ])
    }))).resolves.toMatchObject({
      result: "passed",
      cohortPath,
      summary: {
        totalReports: 3,
        distinctTesters: 3,
        passedReports: 1,
        blockedReports: 2,
        permissionBlockedReports: 2,
        requiredWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": true,
          "browser-fallback": true
        },
        passedWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": false,
          "browser-fallback": false
        }
      },
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "cohort.distinctTesters", ok: true }),
        expect.objectContaining({ id: "cohort.workflowCoverage.coding-terminal", ok: true }),
        expect.objectContaining({ id: "cohort.workflowCoverage.screenshot-inspection", ok: true }),
        expect.objectContaining({ id: "cohort.workflowCoverage.finder-file", ok: true }),
        expect.objectContaining({ id: "cohort.workflowCoverage.browser-fallback", ok: true }),
        expect.objectContaining({ id: "report.tester-a.manifestPath", ok: true }),
        expect.objectContaining({ id: "report.tester-a.artifacts", ok: true }),
        expect.objectContaining({ id: "report.tester-a.permissionStates", ok: true }),
        expect.objectContaining({ id: "report.tester-a.runnerHasTmux", ok: true }),
        expect.objectContaining({ id: "report.tester-a.source", ok: true })
      ])
    });
  });

  it("fails when the cohort has fewer than three distinct testers", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"]),
        createReport("tester-a", ["finder-file", "browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("cohort.distinctTesters")
      ])
    });
  });

  it("fails when a required workflow is missing from the cohort", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"]),
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["coding-terminal"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("cohort.workflowCoverage.browser-fallback")
      ])
    });
  });

  it("fails in strict passed mode when a required workflow only has blocked evidence", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(verifyDogfoodCohort({
      cohortPath,
      requirePassed: true
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"], "passed"),
        createReport("tester-b", ["finder-file"], "blocked"),
        createReport("tester-c", ["browser-fallback"], "blocked")
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("cohort.passedWorkflowCoverage.finder-file"),
        expect.stringContaining("cohort.passedWorkflowCoverage.browser-fallback")
      ]),
      summary: {
        passedWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": false,
          "browser-fallback": false
        }
      },
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "cohort.workflowCoverage.finder-file", ok: true }),
        expect.objectContaining({ id: "cohort.passedWorkflowCoverage.finder-file", ok: false }),
        expect.objectContaining({ id: "cohort.passedWorkflowCoverage.browser-fallback", ok: false })
      ])
    });
  });

  it("passes in strict passed mode when every required workflow has passed product evidence", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(verifyDogfoodCohort({
      cohortPath,
      requirePassed: true
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"], "passed"),
        createReport("tester-b", ["finder-file"], "passed"),
        createReport("tester-c", ["browser-fallback"], "passed")
      ])
    }))).resolves.toMatchObject({
      result: "passed",
      errors: [],
      summary: {
        passedWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": true,
          "browser-fallback": true
        }
      },
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "cohort.passedWorkflowCoverage.coding-terminal", ok: true }),
        expect.objectContaining({ id: "cohort.passedWorkflowCoverage.screenshot-inspection", ok: true }),
        expect.objectContaining({ id: "cohort.passedWorkflowCoverage.finder-file", ok: true }),
        expect.objectContaining({ id: "cohort.passedWorkflowCoverage.browser-fallback", ok: true })
      ])
    });
  });

  it("fails reports without accepted GitHub issue source metadata", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const noSourceReport = createReport("tester-a", ["coding-terminal", "screenshot-inspection"]);
    delete (noSourceReport as { source?: unknown }).source;

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        noSourceReport,
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("report.tester-a.source")
      ])
    });
  });

  it("fails reports whose GitHub issue source lacks accepted or matching workflow labels", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const badSourceReport = createReport("tester-a", [
      "coding-terminal",
      "screenshot-inspection"
    ]);
    badSourceReport.source.issueLabels = [
      "dogfood",
      "workflow:coding-terminal"
    ];

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        badSourceReport,
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("report.tester-a.source")
      ])
    });
  });

  it("fails reports whose source lacks issue alpha identity or issue artifact source metadata", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const badSourceReport = createReport("tester-a", [
      "coding-terminal",
      "screenshot-inspection"
    ]);
    delete (badSourceReport.source as { issueAlphaManifest?: unknown }).issueAlphaManifest;
    badSourceReport.source.artifactSource = "alpha-manifest-smoke-artifacts";

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        badSourceReport,
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("report.tester-a.source")
      ])
    });
  });

  it("fails reports whose commitSha does not match the accepted issue source commit", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const badSourceReport = createReport("tester-a", [
      "coding-terminal",
      "screenshot-inspection"
    ]);
    badSourceReport.source.issueCommitSha = "different-commit";

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        badSourceReport,
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("report.tester-a.source")
      ])
    });
  });

  it("fails reports whose issue alpha manifest does not match the report manifestPath", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const badSourceReport = createReport("tester-a", [
      "coding-terminal",
      "screenshot-inspection"
    ]);
    badSourceReport.source.issueAlphaManifest = "skfiy-0.1.0-other-macos-unsigned.json";

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        badSourceReport,
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("report.tester-a.source")
      ])
    });
  });

  it("does not count source-ineligible reports toward required workflow coverage", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const badBrowserReport = createReport("tester-c", ["browser-fallback"]);
    badBrowserReport.source.artifactSource = "alpha-manifest-smoke-artifacts";
    delete (badBrowserReport.source as { issueAlphaManifest?: unknown }).issueAlphaManifest;

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"]),
        createReport("tester-b", ["finder-file"]),
        badBrowserReport
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      summary: {
        eligibleWorkflowCoverage: {
          "coding-terminal": true,
          "screenshot-inspection": true,
          "finder-file": true,
          "browser-fallback": false
        }
      },
      errors: expect.arrayContaining([
        expect.stringContaining("cohort.workflowCoverage.browser-fallback"),
        expect.stringContaining("report.tester-c.source")
      ])
    });
  });

  it("fails reports that were captured through tmux or lack product evidence", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const badReport = {
      ...createReport("tester-a", ["coding-terminal", "screenshot-inspection"]),
      runnerHasTmux: true,
      artifacts: {
        uiSmokeArtifactPath: "/repo/.skfiy-smoke/a-ui.json"
      },
      permissionStates: {
        screenRecording: { state: "granted" }
      }
    };

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        badReport,
        createReport("tester-b", ["finder-file"]),
        createReport("tester-c", ["browser-fallback"])
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("report.tester-a.runnerHasTmux"),
        expect.stringContaining("report.tester-a.artifacts"),
        expect.stringContaining("report.tester-a.permissionStates")
      ])
    });
  });

  it("fails when reports point at different alpha manifests", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const mixedManifestReport = {
      ...createReport("tester-c", ["browser-fallback"]),
      manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-other-macos-unsigned.json"
    };

    await expect(verifyDogfoodCohort({
      cohortPath
    }, createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"]),
        createReport("tester-b", ["finder-file"]),
        mixedManifestReport
      ])
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("cohort.manifestPath"),
        expect.stringContaining("report.tester-c.manifestPath")
      ])
    });
  });

  it("writes a concise markdown summary for incomplete cohorts", async () => {
    const { verifyDogfoodCohort } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodCohort: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const summaryPath = "/repo/.skfiy-dogfood/internal-alpha-summary.md";
    const io = createMemoryIo({
      [cohortPath]: createCohort([
        createReport("tester-a", ["coding-terminal", "screenshot-inspection"]),
        createReport("tester-b", ["finder-file"])
      ])
    });

    await expect(verifyDogfoodCohort({
      cohortPath,
      summaryPath
    }, io)).resolves.toMatchObject({
      result: "failed",
      summaryPath,
      errors: expect.arrayContaining([
        expect.stringContaining("cohort.distinctTesters"),
        expect.stringContaining("cohort.workflowCoverage.browser-fallback")
      ])
    });
    expect(io.files[summaryPath]).toContain("# skfiy dogfood cohort summary");
    expect(io.files[summaryPath]).toContain("Result: failed");
    expect(io.files[summaryPath]).toContain("Distinct testers: 2/3-5");
    expect(io.files[summaryPath]).toContain("## Passed Workflow Coverage");
    expect(io.files[summaryPath]).toContain("- coding-terminal: blocked-or-missing");
    expect(io.files[summaryPath]).toContain("- browser-fallback");
    expect(io.files[summaryPath]).toContain("| tester-a | blocked | coding-terminal, screenshot-inspection | yes | https://github.com/Sskift/skfiy/issues/a |");
    expect(io.files[summaryPath]).toContain("| tester-b | blocked | finder-file | yes | https://github.com/Sskift/skfiy/issues/b |");
  });

  function createCohort(reports: unknown[]) {
    return {
      schemaVersion: 1,
      cohortName: "internal-alpha",
      generatedAt: "2026-06-16T12:00:00+08:00",
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
      commitSha: "abc123",
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
        artifactSource: "github-issue-smoke-artifacts",
        issueAlphaManifest: path.basename(manifestPath),
        issueAlphaZip: "skfiy-0.1.0-abc123-macos-unsigned.zip",
        issueCommitSha: "abc123"
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
});

function createMemoryIo(files: Record<string, unknown>) {
  return {
    files,
    async readJson(filePath: string) {
      const value = files[filePath];
      if (value === undefined) {
        throw new Error(`Missing JSON: ${filePath}`);
      }

      return value;
    },
    async writeText(filePath: string, value: string) {
      files[filePath] = value;
    }
  };
}
