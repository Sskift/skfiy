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
      "--json-output",
      ".skfiy-dogfood/assignments/abc1234.json",
      "--execute",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc1234-macos-unsigned.json"),
      trackingIssueUrl,
      outputPath: path.resolve(".skfiy-dogfood/assignments/abc1234.md"),
      jsonOutputPath: path.resolve(".skfiy-dogfood/assignments/abc1234.json"),
      dryRun: false,
      requireCurrentHead: true
    });
    expect(createDogfoodAssignmentsHelpText()).toContain("dogfood:assignments");
    expect(createDogfoodAssignmentsHelpText()).toContain("non-mutating");
    expect(createDogfoodAssignmentsHelpText()).toContain("does not create or accept reports");
    expect(createDogfoodAssignmentsHelpText()).toContain("--execute");
    expect(createDogfoodAssignmentsHelpText()).toContain("--json-output");
    expect(createDogfoodAssignmentsHelpText()).toContain("GitHub issue comment");
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
      outputPath: "/repo/.skfiy-dogfood/assignments/abc1234.md",
      dryRun: true,
      commentCommand: {
        command: "gh",
        args: [
          "issue",
          "comment",
          "1",
          "--repo",
          "Sskift/skfiy",
          "--body-file",
          "/repo/.skfiy-dogfood/assignments/abc1234.md"
        ]
      }
    });
    expect(io.commands).toEqual([]);

    const packet = io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.md"];
    expect(packet).toContain("# skfiy dogfood tester assignments");
    expect(packet).toContain("Generated: 2026-06-17T10:00:00.000Z");
    expect(packet).toContain("Alpha: skfiy-alpha-abc1234");
    expect(packet).toContain("Tracking issue: https://github.com/Sskift/skfiy/issues/1");
    expect(packet).toContain("This packet is non-mutating: it does not create reports, add labels, update cohort JSON, or mark dogfood evidence accepted.");
    expect(packet).toContain("## Permission Preflight");
    expect(packet).toContain("Grant Screen Recording and Accessibility to the extracted `skfiy.app` before using `--require-passed` for default external Doubao + Computer Use evidence.");
    expect(packet).toContain("Grant Microphone and Speech Recognition only when intentionally testing the optional `native-macos` voice provider.");
    expect(packet).toContain("If permissions are still blocked, run the normal tester command and file the blocked evidence instead of adding `--require-passed`.");
    expect(packet).toContain("Screen Recording: denied");
    expect(packet).toContain("Accessibility: denied");
    expect(packet).toContain("## Evidence Preview Gate");
    expect(packet).toContain("Before filing, confirm the generated `dogfood:issue -- --check-report` output shows `reportPreviewEligibility.eligible=true`.");
    expect(packet).toContain("The report preview must include UI pet drag evidence from the packaged app: renderer pointer events, before/after bounds, upward movement, and suppressed click-after-drag.");
    expect(packet).toContain("The report preview must include panic stop evidence from `runtimeStatus.stopTurnHotkey` plus product-path behavior evidence: accelerator, label, registered state, source, behaviorResult, behaviorSource, before/after status, and stop message.");
    expect(packet).toContain("If `reportPreviewEligibility.eligible=false`, file the blocked evidence only after preserving the blocking checks for maintainer review.");
    expect(packet).toContain("## tester-1");
    expect(packet).toContain("Workflows: coding-terminal, screenshot-inspection");
    expect(packet).toContain("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234");
    expect(packet).toContain("npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json>");
    expect(packet).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --file-issue");
    expect(packet).toContain("npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json>");
    expect(packet).toContain("tester-2");
    expect(packet).toContain("finder-file");
    expect(packet).toContain("tester-3");
    expect(packet).toContain("browser-fallback");
    expect(packet).toContain("For passed workflow evidence, rerun prepare/tester with `--require-passed` only after the provider-relevant permissions are granted.");
    expect(packet).not.toContain("--add-label dogfood:accepted");
  });

  it("writes machine-readable assignment JSON for automation without scraping Markdown", async () => {
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
      jsonOutputPath: "/repo/.skfiy-dogfood/assignments/abc1234.json",
      now: () => "2026-06-17T10:00:00.000Z"
    }, io)).resolves.toMatchObject({
      jsonOutputPath: "/repo/.skfiy-dogfood/assignments/abc1234.json"
    });

    const json = JSON.parse(io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.json"]);
    expect(json).toMatchObject({
      generatedAt: "2026-06-17T10:00:00.000Z",
      result: "waiting-for-dogfood",
      alphaTag: "skfiy-alpha-abc1234",
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234",
      manifestPath,
      trackingIssueUrl,
      markdownOutputPath: "/repo/.skfiy-dogfood/assignments/abc1234.md",
      jsonOutputPath: "/repo/.skfiy-dogfood/assignments/abc1234.json",
      dryRun: true,
      postedToTrackingIssue: false,
      assignmentCount: 3,
      currentGaps: {
        acceptedRealTesterReports: 0,
        minimumAcceptedRealTesterReports: 3,
        missingWorkflowCoverage: [
          "coding-terminal",
          "screenshot-inspection",
          "finder-file",
          "browser-fallback"
        ],
        missingPassedWorkflowCoverage: [
          "coding-terminal",
          "screenshot-inspection",
          "finder-file",
          "browser-fallback"
        ]
      },
      permissionPreflight: {
        states: {
          screenRecording: "denied",
          accessibility: "denied",
          microphone: "unknown",
          speechRecognition: "unknown"
        },
        requirePassedAllowed: false
      },
      evidencePreviewGate: {
        requiredEligible: true,
        requiredChecks: [
          "reportPreviewEligibility.eligible=true",
          "ui-pet-drag",
          "panic-stop-hotkey"
        ]
      },
      commentCommand: {
        command: "gh",
        args: [
          "issue",
          "comment",
          "1",
          "--repo",
          "Sskift/skfiy",
          "--body-file",
          "/repo/.skfiy-dogfood/assignments/abc1234.md"
        ]
      }
    });
    expect(json.permissionPreflight.blockers).toEqual([
      { permission: "screenRecording", state: "denied" },
      { permission: "accessibility", state: "denied" }
    ]);
    expect(json.assignments).toHaveLength(3);
    expect(json.assignments[0]).toMatchObject({
      testerId: "tester-1",
      purpose: "real-tester-count-and-workflow-coverage",
      workflows: ["coding-terminal", "screenshot-inspection"],
      commands: {
        tester: expect.stringContaining("--file-issue"),
        review: expect.stringContaining("dogfood:review")
      }
    });
    expect(json.nextActions).toEqual([
      "Collect at least 3 accepted real tester report issue URLs in GitHub issue #1."
    ]);
  });

  it("does not reuse a stale tracking issue release URL for the current assignment packet", async () => {
    const { runDogfoodAssignments } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodAssignments: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      trackingIssue: {
        currentAlpha: {
          ok: false,
          fields: {
            release: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-old1234"
          }
        }
      }
    });

    await runDogfoodAssignments({
      rootDir: "/repo",
      manifestPath,
      trackingIssueUrl,
      outputPath: "/repo/.skfiy-dogfood/assignments/abc1234.md",
      jsonOutputPath: "/repo/.skfiy-dogfood/assignments/abc1234.json",
      now: () => "2026-06-17T10:00:00.000Z"
    }, io);

    const packet = io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.md"];
    const json = JSON.parse(io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.json"]);

    expect(packet).toContain("Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234");
    expect(packet).not.toContain("skfiy-alpha-old1234");
    expect(json.releaseUrl).toBe("https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234");
  });

  it("uses complete local smoke permission states for the assignment preflight", async () => {
    const { runDogfoodAssignments } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodAssignments: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      localSmoke: {
        permissionStates: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" },
          microphone: { state: "not-determined" },
          speechRecognition: { state: "not-determined" }
        },
        permissionBlockers: []
      }
    });

    await runDogfoodAssignments({
      rootDir: "/repo",
      manifestPath,
      trackingIssueUrl,
      outputPath: "/repo/.skfiy-dogfood/assignments/abc1234.md",
      jsonOutputPath: "/repo/.skfiy-dogfood/assignments/abc1234.json",
      now: () => "2026-06-17T10:00:00.000Z"
    }, io);

    const packet = io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.md"];
    const json = JSON.parse(io.textFiles["/repo/.skfiy-dogfood/assignments/abc1234.json"]);

    expect(packet).toContain("- Screen Recording: granted");
    expect(packet).toContain("- Accessibility: granted");
    expect(packet).toContain("- Microphone: not-determined");
    expect(packet).toContain("- Speech Recognition: not-determined");
    expect(json.permissionPreflight.states).toEqual({
      screenRecording: "granted",
      accessibility: "granted",
      microphone: "not-determined",
      speechRecognition: "not-determined"
    });
  });

  it("posts the assignment packet to the tracking issue only when execute is explicit", async () => {
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
      dryRun: false,
      now: () => "2026-06-17T10:00:00.000Z"
    }, io)).resolves.toMatchObject({
      dryRun: false,
      postedToTrackingIssue: true
    });

    expect(io.commands).toEqual([
      {
        command: "gh",
        args: [
          "issue",
          "comment",
          "1",
          "--repo",
          "Sskift/skfiy",
          "--body-file",
          "/repo/.skfiy-dogfood/assignments/abc1234.md"
        ]
      }
    ]);
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
      expect(document).toContain("--json-output .skfiy-dogfood/assignments/");
      expect(document).toContain("non-mutating");
      expect(document).toContain("Permission Preflight");
      expect(document).toContain("Evidence Preview Gate");
      expect(document).toContain("reportPreviewEligibility.eligible=true");
      expect(document).toContain("UI pet drag evidence");
      expect(document).toContain("panic stop evidence");
      expect(document).toContain("runtimeStatus.stopTurnHotkey");
      expect(document).toContain("`--require-passed`");
      expect(document).toContain("GitHub issue comment");
      expect(document).toContain("`--execute`");
    }
  });
});

function createMemoryIo(statusOverride: Record<string, unknown> = {}) {
  const commands: Array<{ command: string; args: string[] }> = [];
  const textFiles: Record<string, string> = {};
  const status = mergeStatus({
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
  }, statusOverride);

  return {
    commands,
    textFiles,
    async createDogfoodStatus() {
      return status;
    },
    async mkdir() {},
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
    },
    async execFile(command: string, args: string[]) {
      commands.push({ command, args });
      return { stdout: "", stderr: "" };
    }
  };
}

function mergeStatus(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isPlainRecord(current) && isPlainRecord(value)
      ? mergeStatus(current, value)
      : value;
  }

  return merged;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createAssignment(testerId: string, workflows: string[]) {
  return {
    testerId,
    workflows,
    purpose: "real-tester-count-and-workflow-coverage",
    commands: {
      prepareAlpha: `npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234 --tester-id ${testerId} --tracking-issue-url ${trackingIssueUrl} --execute`,
      tester: `npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json> --app <path-to-unzipped-skfiy.app> --tester-id ${testerId} --workflows ${workflows.join(",")} --artifacts-dir .skfiy-smoke/dogfood/${testerId} --issue-output .skfiy-dogfood/issues/${testerId}.md --summary .skfiy-dogfood/${testerId}-summary.md --tracking-issue-url ${trackingIssueUrl} --file-issue`,
      review: `npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json> --issue-url <filed-dogfood-issue-url> --tracking-issue-url ${trackingIssueUrl} --summary .skfiy-dogfood/reviews/${testerId}.md`
    }
  };
}
