import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const releaseUrl = "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234";

describe("alpha dogfood preparation", () => {
  const modulePath = path.join(process.cwd(), "scripts", "prepare-alpha-dogfood.mjs");

  it("is exposed as an npm script for tester-side alpha setup", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:prepare-alpha": "node scripts/prepare-alpha-dogfood.mjs"
    });
  });

  it("parses release, tester, app, and execution arguments", async () => {
    const {
      createDefaultPrepareAlphaDogfoodOptions,
      createPrepareAlphaDogfoodHelpText,
      parsePrepareAlphaDogfoodArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultPrepareAlphaDogfoodOptions: (rootDir: string) => Record<string, unknown>;
      createPrepareAlphaDogfoodHelpText: () => string;
      parsePrepareAlphaDogfoodArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultPrepareAlphaDogfoodOptions("/repo");

    expect(parsePrepareAlphaDogfoodArgs([
      "--release-url",
      releaseUrl,
      "--tester-id",
      "tester-a",
      "--workflows",
      "coding-terminal,screenshot-inspection",
      "--tracking-issue-url",
      "https://github.com/Sskift/skfiy/issues/1",
      "--app",
      "~/Applications/skfiy.app",
      "--download-dir",
      ".skfiy-dogfood/downloads/tester-a",
      "--handoff-output",
      ".skfiy-dogfood/handoffs/tester-a.md",
      "--require-passed",
      "--allow-synthetic-tester-id",
      "--replace-existing",
      "--execute"
    ], defaults)).toMatchObject({
      releaseUrl,
      repo: "Sskift/skfiy",
      tagName: "skfiy-alpha-abc1234",
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      appPath: path.join(process.env.HOME ?? "", "Applications/skfiy.app"),
      downloadDir: path.resolve(".skfiy-dogfood/downloads/tester-a"),
      handoffOutputPath: path.resolve(".skfiy-dogfood/handoffs/tester-a.md"),
      requirePassed: true,
      allowSyntheticTesterId: true,
      replaceExisting: true,
      dryRun: false
    });
    expect(createPrepareAlphaDogfoodHelpText()).toContain("dogfood:prepare-alpha");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("dry-run");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("--execute");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("--workflows");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("--tracking-issue-url");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("assignment packet comments");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("--require-passed");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("--allow-synthetic-tester-id");
  });

  it("passes strict passed evidence mode into handoff and next tester command", async () => {
    const { createPrepareAlphaDogfoodPlan } = await import(pathToFileURL(modulePath).href) as {
      createPrepareAlphaDogfoodPlan: (input: Record<string, unknown>) => Record<string, unknown>;
    };
    const plan = createPrepareAlphaDogfoodPlan({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      workflows: ["finder-file", "browser-fallback"],
      requirePassed: true
    }) as {
      commands: Array<{ id: string; command: string; args: string[] }>;
      nextCommands: {
        tester: string;
      };
    };

    expect(plan.commands.find((command) => command.id === "handoff:create")?.args).toEqual(
      expect.arrayContaining(["--require-passed"])
    );
    expect(plan.nextCommands.tester).toContain("--require-passed");
  });

  it("dry-runs a release download, checksum verification, app extraction, and handoff command", async () => {
    const { createPrepareAlphaDogfoodPlan } = await import(pathToFileURL(modulePath).href) as {
      createPrepareAlphaDogfoodPlan: (input: Record<string, unknown>) => Record<string, unknown>;
    };
    const plan = createPrepareAlphaDogfoodPlan({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a"
    }) as {
      appPath: string;
      downloadDir: string;
      extractDir: string;
      handoffOutputPath: string;
      commands: Array<{ id: string; command: string; args: string[] }>;
    };

    expect(plan.appPath).toBe("/repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app");
    expect(plan.downloadDir).toBe("/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234");
    expect(plan.extractDir).toBe("/repo/.skfiy-dogfood/extracted/skfiy-alpha-abc1234");
    expect(plan.handoffOutputPath).toBe("/repo/.skfiy-dogfood/handoffs/tester-a.md");
    expect(plan.commands).toEqual([
      {
        id: "release:download",
        command: "gh",
        args: [
          "release",
          "download",
          "skfiy-alpha-abc1234",
          "--repo",
          "Sskift/skfiy",
          "--dir",
          "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234",
          "--pattern",
          "skfiy-*-macos-unsigned.zip",
          "--pattern",
          "skfiy-*-macos-unsigned.json",
          "--clobber"
        ]
      },
      {
        id: "zip:extract",
        command: "ditto",
        args: [
          "-x",
          "-k",
          "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/<downloaded-alpha.zip>",
          "/repo/.skfiy-dogfood/extracted/skfiy-alpha-abc1234"
        ]
      },
      {
        id: "app:install",
        command: "ditto",
        args: [
          "/repo/.skfiy-dogfood/extracted/skfiy-alpha-abc1234/skfiy.app",
          "/repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app"
        ]
      },
      {
        id: "handoff:create",
        command: "npm",
        args: [
          "run",
          "dogfood:handoff",
          "--",
          "--manifest",
          "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/<downloaded-alpha.json>",
          "--release-url",
          releaseUrl,
          "--app",
          "/repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app",
          "--tester-id",
          "tester-a",
          "--output",
          "/repo/.skfiy-dogfood/handoffs/tester-a.md"
        ]
      }
    ]);
  });

  it("passes assigned workflows through to the generated handoff command", async () => {
    const { createPrepareAlphaDogfoodPlan } = await import(pathToFileURL(modulePath).href) as {
      createPrepareAlphaDogfoodPlan: (input: Record<string, unknown>) => Record<string, unknown>;
    };
    const plan = createPrepareAlphaDogfoodPlan({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"]
    }) as {
      commands: Array<{ id: string; command: string; args: string[] }>;
    };

    expect(plan.commands.find((command) => command.id === "handoff:create")?.args).toEqual(
      expect.arrayContaining([
        "--workflows",
        "coding-terminal,screenshot-inspection"
      ])
    );
  });

  it("infers assigned workflows from the tracking issue when workflows are omitted", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      trackingIssueBody: [
        "## Recommended Tester Assignments",
        "- `tester-a`: `finder-file,browser-fallback`",
        "  - Prepare: `npm run dogfood:prepare-alpha -- --tester-id tester-a --workflows finder-file,browser-fallback --execute`"
      ].join("\n")
    });

    const result = await runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      dryRun: true
    }, io) as {
      plan: {
        commands: Array<{ id: string; command: string; args: string[] }>;
        nextCommands: {
          tester: string;
          review: string;
        };
      };
    };

    expect(result.plan.commands.find((command) => command.id === "handoff:create")?.args).toEqual(
      expect.arrayContaining([
        "--workflows",
        "finder-file,browser-fallback"
      ])
    );
    expect(result.plan.nextCommands.tester).toContain("--manifest /repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/<downloaded-alpha.json>");
    expect(result.plan.nextCommands.tester).toContain("--app /repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app");
    expect(result.plan.nextCommands.tester).toContain("--workflows finder-file,browser-fallback");
    expect(result.plan.nextCommands.tester).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(result.plan.nextCommands.tester).toContain("--file-issue");
    expect(result.plan.nextCommands.review).toContain("--manifest /repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/<downloaded-alpha.json>");
  });

  it("infers assigned workflows from the current alpha assignment comment when workflows are omitted", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      trackingIssueBody: "## Required Real Tester Count\n\n- [ ] tester-a",
      trackingIssueComments: [
        [
          "# skfiy dogfood tester assignments",
          "",
          "Generated: 2026-06-17T10:00:00.000Z",
          "Status: waiting-for-dogfood",
          "Alpha: skfiy-alpha-abc1234",
          "Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234",
          "",
          "## Permission Preflight",
          "",
          "## Evidence Preview Gate",
          "",
          "## Tester Packets",
          "",
          "## tester-a",
          "",
          "Purpose: real-tester-count-and-workflow-coverage",
          "Workflows: finder-file, browser-fallback"
        ].join("\n")
      ]
    });

    const result = await runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      dryRun: true
    }, io) as {
      plan: {
        commands: Array<{ id: string; command: string; args: string[] }>;
        nextCommands: {
          tester: string;
          review?: string;
        };
      };
    };

    expect(result.plan.commands.find((command) => command.id === "handoff:create")?.args).toEqual(
      expect.arrayContaining([
        "--workflows",
        "finder-file,browser-fallback"
      ])
    );
    expect(result.plan.nextCommands.tester).toContain("--workflows finder-file,browser-fallback");
  });

  it("prefers the latest current alpha assignment comment when workflow assignments change", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      trackingIssueComments: [
        createAssignmentPacketComment("tester-a", "finder-file"),
        createAssignmentPacketComment("tester-a", "coding-terminal,screenshot-inspection")
      ]
    });

    const result = await runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      dryRun: true
    }, io) as {
      plan: {
        nextCommands: {
          tester: string;
        };
      };
    };

    expect(result.plan.nextCommands.tester).toContain("--workflows coding-terminal,screenshot-inspection");
    expect(result.plan.nextCommands.tester).not.toContain("--workflows finder-file");
  });

  it("reads GitHub tracking issue comments in the default CLI issue query", async () => {
    const {
      createGitHubIssueViewCommand,
      normalizeGitHubIssueViewPayload
    } = await import(pathToFileURL(modulePath).href) as {
      createGitHubIssueViewCommand: (issueUrl: string) => { command: string; args: string[] };
      normalizeGitHubIssueViewPayload: (payload: Record<string, unknown>) => {
        body: string;
        comments: Array<{ body: string }>;
      };
    };

    expect(createGitHubIssueViewCommand("https://github.com/Sskift/skfiy/issues/1")).toEqual({
      command: "gh",
      args: [
        "issue",
        "view",
        "1",
        "--repo",
        "Sskift/skfiy",
        "--json",
        "body,comments"
      ]
    });
    expect(normalizeGitHubIssueViewPayload({
      body: "issue body",
      comments: [
        { body: "first assignment packet" },
        { body: "" },
        { note: "ignored" }
      ]
    })).toEqual({
      body: "issue body",
      comments: [
        { body: "first assignment packet" }
      ]
    });
  });

  it("allows synthetic prepare tester ids only for the generated maintainer handoff command", async () => {
    const { createPrepareAlphaDogfoodPlan } = await import(pathToFileURL(modulePath).href) as {
      createPrepareAlphaDogfoodPlan: (input: Record<string, unknown>) => Record<string, unknown>;
    };
    const plan = createPrepareAlphaDogfoodPlan({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "prepare-abc1234"
    }) as {
      commands: Array<{ id: string; command: string; args: string[] }>;
    };

    expect(plan.commands.find((command) => command.id === "handoff:create")?.args).toEqual(
      expect.arrayContaining(["--allow-synthetic-tester-id"])
    );
  });

  it("allows explicit synthetic preflight prepare runs without a tracking assignment", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      trackingIssueBody: [
        "## Recommended Tester Assignments",
        "- `tester-a`: `finder-file,browser-fallback`"
      ].join("\n")
    });

    const result = await runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "preflight-abc1234",
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      allowSyntheticTesterId: true,
      dryRun: true
    }, io) as {
      plan: {
        commands: Array<{ id: string; command: string; args: string[] }>;
        nextCommands: {
          tester: string;
        };
      };
    };

    expect(result.plan.commands.find((command) => command.id === "handoff:create")?.args).toEqual(
      expect.arrayContaining([
        "--workflows",
        "coding-terminal,screenshot-inspection,finder-file,browser-fallback",
        "--allow-synthetic-tester-id"
      ])
    );
    expect(result.plan.nextCommands.tester).toContain("--tester-id preflight-abc1234");
    expect(result.plan.nextCommands.tester).toContain("--workflows coding-terminal,screenshot-inspection,finder-file,browser-fallback");
    expect(result.plan.nextCommands.tester).toContain("--allow-synthetic-tester-id");
    expect(result.plan.nextCommands.tester).not.toContain("--file-issue");
    expect(result.plan.nextCommands).not.toHaveProperty("review");
  });

  it("executes with checksum validation before installing the app bundle", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      dryRun: false
    }, io)).resolves.toMatchObject({
      status: "prepared",
      dryRun: false,
      manifestPath: "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.json",
      zipPath: "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.zip",
      appPath: "/repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app",
      handoffOutputPath: "/repo/.skfiy-dogfood/handoffs/tester-a.md",
      nextCommands: {
        tester: "npm run dogfood:tester -- --manifest /repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.json --app /repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app --tester-id tester-a --workflows coding-terminal,screenshot-inspection --artifacts-dir .skfiy-smoke/dogfood/tester-a --issue-output .skfiy-dogfood/issues/tester-a.md --summary .skfiy-dogfood/tester-a-summary.md --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --file-issue",
        review: "npm run dogfood:review -- --manifest /repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.json --issue-url <filed-dogfood-issue-url> --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --summary .skfiy-dogfood/reviews/tester-a.md"
      }
    });
    expect(io.commands.map((entry) => entry.id)).toEqual([
      "release:download",
      "zip:extract",
      "app:install",
      "handoff:create"
    ]);
    expect(io.sha256Inputs).toEqual([
      "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.zip"
    ]);
    expect(io.commands.at(-1)?.args).toContain("/repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app");
  });

  it("rejects downloaded alpha manifests missing long-horizon money-run evidence", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const staleManifest = createDownloadedManifest();
    delete (staleManifest as { moneyRunSmokeArtifactPath?: unknown }).moneyRunSmokeArtifactPath;
    staleManifest.requiredDogfoodEvidence = staleManifest.requiredDogfoodEvidence.filter(
      (entry) => !entry.includes("money-run") && !entry.includes("Long-horizon")
    );

    await expect(runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      dryRun: false
    }, createMemoryIo({
      manifest: staleManifest
    }))).rejects.toThrow(
      "alpha manifest must include moneyRunSmokeArtifactPath and long-horizon money-run evidence."
    );
  });

  it("rejects downloaded alpha manifests missing panic stop behavior evidence", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const staleManifest = createDownloadedManifest();
    staleManifest.requiredDogfoodEvidence = staleManifest.requiredDogfoodEvidence.filter(
      (entry) => entry !== "Panic stop product-path behavior evidence"
    );

    await expect(runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      dryRun: false
    }, createMemoryIo({
      manifest: staleManifest
    }))).rejects.toThrow(
      "alpha manifest must include panic stop product-path behavior evidence."
    );
  });

  it("rejects downloaded alpha zips whose app bundle identity is not lowercase skfiy", async () => {
    const { runPrepareAlphaDogfood } = await import(pathToFileURL(modulePath).href) as {
      runPrepareAlphaDogfood: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(runPrepareAlphaDogfood({
      rootDir: "/repo",
      releaseUrl,
      tagName: "skfiy-alpha-abc1234",
      repo: "Sskift/skfiy",
      testerId: "tester-a",
      dryRun: false
    }, createMemoryIo({
      extractedInfoPlist: createInfoPlist({
        bundleIdentifier: "com.sskift.skfiy",
        bundleName: "skfiy-alpha",
        displayName: "skfiy-alpha",
        executable: "skfiy-alpha"
      })
    }))).rejects.toThrow("Downloaded alpha app CFBundleName must be skfiy.");
  });

  it("treats app bundle directories as existing filesystem paths", async () => {
    const { pathExists } = await import(pathToFileURL(modulePath).href) as {
      pathExists: (filePath: string) => Promise<boolean>;
    };
    const appDir = mkdtempSync(path.join(os.tmpdir(), "skfiy-alpha-app-"));

    try {
      expect(await pathExists(appDir)).toBe(true);
      expect(await pathExists(path.join(appDir, "missing.app"))).toBe(false);
    } finally {
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});

function createMemoryIo(options: {
  extractedInfoPlist?: string;
  manifest?: ReturnType<typeof createDownloadedManifest>;
  trackingIssueBody?: string;
  trackingIssueComments?: string[];
} = {}) {
  const commands: Array<{ id: string; command: string; args: string[] }> = [];
  const sha256Inputs: string[] = [];
  const manifestPath = "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.json";
  const zipPath = "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.zip";

  return {
    commands,
    sha256Inputs,
    async mkdir() {},
    async rm() {},
    async readJson(filePath: string) {
      if (filePath !== manifestPath) {
        throw new Error(`Unexpected manifest path: ${filePath}`);
      }
      return options.manifest ?? createDownloadedManifest();
    },
    async listFiles(dirPath: string) {
      if (dirPath !== "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234") {
        throw new Error(`Unexpected list path: ${dirPath}`);
      }
      return [
        "skfiy-0.1.0-abc1234-macos-unsigned.zip",
        "skfiy-0.1.0-abc1234-macos-unsigned.json"
      ];
    },
    async exists(filePath: string) {
      return filePath === zipPath
        || filePath === manifestPath
        || filePath === "/repo/.skfiy-dogfood/extracted/skfiy-alpha-abc1234/skfiy.app";
    },
    async readText(filePath: string) {
      if (filePath !== "/repo/.skfiy-dogfood/extracted/skfiy-alpha-abc1234/skfiy.app/Contents/Info.plist") {
        throw new Error(`Unexpected text path: ${filePath}`);
      }
      return options.extractedInfoPlist ?? createInfoPlist({
        bundleIdentifier: "com.sskift.skfiy",
        bundleName: "skfiy",
        displayName: "skfiy",
        executable: "skfiy"
      });
    },
    async readIssue(issueUrl: string) {
      if (issueUrl !== "https://github.com/Sskift/skfiy/issues/1") {
        throw new Error(`Unexpected issue URL: ${issueUrl}`);
      }
      return {
        body: options.trackingIssueBody ?? "",
        labels: ["skfiy", "dogfood"],
        comments: options.trackingIssueComments?.map((body) => ({ body })) ?? []
      };
    },
    async sha256File(filePath: string) {
      sha256Inputs.push(filePath);
      return "feedface";
    },
    async execPlanCommand(command: { id: string; command: string; args: string[] }) {
      commands.push(command);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}

function createDownloadedManifest() {
  return {
    schemaVersion: 1,
    appName: "skfiy",
    version: "0.1.0",
    commitSha: "abc1234",
    bundleIdentifier: "com.sskift.skfiy",
    zip: {
      path: "/build/.skfiy-alpha/skfiy-0.1.0-abc1234-macos-unsigned.zip",
      bytes: 1234,
      sha256: "feedface"
    },
    uiSmokeArtifactPath: "/build/.skfiy-smoke/ui-abc1234.json",
    smokeArtifactPath: "/build/.skfiy-smoke/ghostty-abc1234.json",
    chromeSmokeArtifactPath: "/build/.skfiy-smoke/chrome-abc1234.json",
    finderSmokeArtifactPath: "/build/.skfiy-smoke/finder-abc1234.json",
    voiceSmokeArtifactPath: "/build/.skfiy-smoke/voice-abc1234.json",
    moneyRunSmokeArtifactPath: "/build/.skfiy-smoke/money-run-supervision-abc1234.json",
    requiredDogfoodEvidence: [
      "npm run smoke:ui -- --output <path>",
      "npm run smoke:ghostty -- --output <path>",
      "npm run smoke:chrome -- --output <path>",
      "npm run smoke:finder -- --output <path>",
      "npm run smoke:voice -- --output <path>",
      "npm run smoke:money-run -- --json-output <path>",
      "Panic stop product-path behavior evidence",
      "Long-horizon money-run supervision evidence"
    ]
  };
}

function createAssignmentPacketComment(testerId: string, workflowList: string) {
  return [
    "# skfiy dogfood tester assignments",
    "",
    "Generated: 2026-06-17T10:00:00.000Z",
    "Status: waiting-for-dogfood",
    "Alpha: skfiy-alpha-abc1234",
    "Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc1234",
    "",
    "## Permission Preflight",
    "",
    "## Evidence Preview Gate",
    "",
    "## Tester Packets",
    "",
    `## ${testerId}`,
    "",
    "Purpose: real-tester-count-and-workflow-coverage",
    `Workflows: ${workflowList}`
  ].join("\n");
}

function createInfoPlist({
  bundleIdentifier,
  bundleName,
  displayName,
  executable
}: {
  bundleIdentifier: string;
  bundleName: string;
  displayName: string;
  executable: string;
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleIdentifier</key>
\t<string>${bundleIdentifier}</string>
\t<key>CFBundleName</key>
\t<string>${bundleName}</string>
\t<key>CFBundleDisplayName</key>
\t<string>${displayName}</string>
\t<key>CFBundleExecutable</key>
\t<string>${executable}</string>
</dict>
</plist>
`;
}
