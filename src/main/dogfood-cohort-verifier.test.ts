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
      ".skfiy-dogfood/internal-alpha-cohort.json"
    ], defaults)).toMatchObject({
      cohortPath: path.resolve(".skfiy-dogfood/internal-alpha-cohort.json")
    });
    expect(createDogfoodCohortHelpText()).toContain("coding-terminal");
    expect(createDogfoodCohortHelpText()).toContain("browser-fallback");
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
        expect.objectContaining({ id: "report.tester-a.runnerHasTmux", ok: true })
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
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      workflows,
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
    async readJson(filePath: string) {
      const value = files[filePath];
      if (value === undefined) {
        throw new Error(`Missing JSON: ${filePath}`);
      }

      return value;
    }
  };
}
