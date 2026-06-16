import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc1234-macos-unsigned.json";
const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";

describe("dogfood tester assignment packet", () => {
  const modulePath = path.join(process.cwd(), "scripts", "create-dogfood-assignments.mjs");

  it("is exposed as an npm script for non-mutating tester coordination", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:assignments": "node scripts/create-dogfood-assignments.mjs"
    });
  });

  it("parses manifest, tracking issue, output, and strict-head arguments", async () => {
    const {
      createDefaultDogfoodAssignmentsOptions,
      createDogfoodAssignmentsHelpText,
      parseDogfoodAssignmentsArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodAssignmentsOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodAssignmentsHelpText: () => string;
      parseDogfoodAssignmentsArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodAssignmentsOptions("/repo");

    expect(parseDogfoodAssignmentsArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc1234-macos-unsigned.json",
      "--tracking-issue-url",
      trackingIssueUrl,
      "--output",
      ".skfiy-dogfood/assignments/abc1234.md",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc1234-macos-unsigned.json"),
      trackingIssueUrl,
      outputPath: path.resolve(".skfiy-dogfood/assignments/abc1234.md"),
      requireCurrentHead: true
    });
    expect(createDogfoodAssignmentsHelpText()).toContain("dogfood:assignments");
    expect(createDogfoodAssignmentsHelpText()).toContain("non-mutating");
    expect(createDogfoodAssignmentsHelpText()).toContain("does not create or accept reports");
  });

  it("writes a copy-safe assignment packet from dogfood status without accepting evidence", async () => {
    const { runDogfoodAssignments } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodAssignments: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(runDogfoodAssignments({
      rootDir: "/repo",
      manifestPath,
      trackingIssueUrl,
      outputPath: "/repo/.skfiy-dogfood/assignments/abc1234.md",
      now: () => "2026-06-17T10:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "waiting-for-dogfood",
      assignmentCount: 3,
      outputPath: "/repo/.skfiy-dogfood/assignments/abc1234.md"
    });

    const packet = io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.md"];
    expect(packet).toContain("# skfiy dogfood tester assignments");
    expect(packet).toContain("Generated: 2026-06-17T10:00:00.000Z");
    expect(packet).toContain("Alpha: skfiy-alpha-abc1234");
    expect(packet).toContain("Tracking issue: https://github.com/Sskift/skfiy/issues/1");
    expect(packet).toContain("This packet is non-mutating: it does not create reports, add labels, update cohort JSON, or mark dogfood evidence accepted.");
    expect(packet).toContain("## tester-1");
    expect(packet).toContain("Workflows: coding-terminal, screenshot-inspection");
    expect(packet).toContain("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234");
    expect(packet).toContain("npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json>");
    expect(packet).toContain("npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json>");
    expect(packet).toContain("tester-2");
    expect(packet).toContain("finder-file");
    expect(packet).toContain("tester-3");
    expect(packet).toContain("browser-fallback");
    expect(packet).not.toContain("--add-label dogfood:accepted");
  });

  it("documents assignment packets in the user workflow", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const workflow = readFileSync(
      path.join(process.cwd(), "docs", "development-workflow.md"),
      "utf8"
    );
    const longPlan = readFileSync(
      path.join(
        process.cwd(),
        "docs",
        "research",
        "2026-06-16-voice-computer-control-long-plan.md"
      ),
      "utf8"
    );

    for (const document of [readme, workflow, longPlan]) {
      expect(document).toContain("npm run dogfood:assignments -- \\");
      expect(document).toContain("--output .skfiy-dogfood/assignments/");
      expect(document).toContain("non-mutating");
    }
  });
});

function createMemoryIo() {
  const textFiles: Record<string, string> = {};
  const status = {
    result: "waiting-for-dogfood",
    generatedAt: "2026-06-17T09:59:00.000Z",
    manifestPath,
    trackingIssueUrl,
    manifest: {
      commitSha: "abc1234567890",
      artifactBaseName: "skfiy-0.1.0-abc1234-macos-unsigned"
    },
    trackingIssue: {
      acceptedReportCount: 0,
      verifiedRealAcceptedReportCount: 0,
      workflowCoverage: {
        missing: ["coding-terminal", "screenshot-inspection", "finder-file", "browser-fallback"]
      },
      passedWorkflowCoverage: {
        missing: ["coding-terminal", "screenshot-inspection", "finder-file", "browser-fallback"]
      }
    },
    localSmoke: {
      permissionBlockers: [
        { permission: "screenRecording", state: "denied" },
        { permission: "accessibility", state: "denied" }
      ]
    },
    testerAssignments: [
      createAssignment("tester-1", ["coding-terminal", "screenshot-inspection"]),
      createAssignment("tester-2", ["finder-file"]),
      createAssignment("tester-3", ["browser-fallback"])
    ],
    nextActions: [
      "Collect at least 3 accepted real tester report issue URLs in GitHub issue #1."
    ]
  };

  return {
    textFiles,
    async createDogfoodStatus() {
      return status;
    },
    async mkdir() {},
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
    }
  };
}

function createAssignment(testerId: string, workflows: string[]) {
  return {
    testerId,
    workflows,
    purpose: "real-tester-count-and-workflow-coverage",
    commands: {
      prepareAlpha: `npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234 --tester-id ${testerId} --tracking-issue-url ${trackingIssueUrl} --execute`,
      tester: `npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json> --app <path-to-unzipped-skfiy.app> --tester-id ${testerId} --workflows ${workflows.join(",")} --artifacts-dir .skfiy-smoke/dogfood/${testerId} --issue-output .skfiy-dogfood/issues/${testerId}.md --summary .skfiy-dogfood/${testerId}-summary.md --file-issue`,
      review: `npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json> --issue-url <filed-dogfood-issue-url> --tracking-issue-url ${trackingIssueUrl} --summary .skfiy-dogfood/reviews/${testerId}.md`
    }
  };
}
