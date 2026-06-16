import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json";
const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";
const releaseUrl = "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1";
const outputPath = "/repo/.skfiy-dogfood/tracking-issue-abcdef1.md";
const uiSmokePath = "/repo/.skfiy-smoke/dogfood/preflight-abcdef1/preflight-abcdef1-ui.json";

describe("dogfood tracking issue sync", () => {
  const modulePath = path.join(process.cwd(), "scripts", "sync-dogfood-tracking-issue.mjs");

  it("is exposed as an npm script for updating the current dogfood tracking issue", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:tracking-issue": "node scripts/sync-dogfood-tracking-issue.mjs"
    });
  });

  it("parses manifest, release, tracking issue, output, and execute flags", async () => {
    const {
      createDefaultDogfoodTrackingIssueOptions,
      createDogfoodTrackingIssueHelpText,
      parseDogfoodTrackingIssueArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodTrackingIssueOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodTrackingIssueHelpText: () => string;
      parseDogfoodTrackingIssueArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodTrackingIssueOptions("/repo");

    expect(parseDogfoodTrackingIssueArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json",
      "--release-url",
      releaseUrl,
      "--tracking-issue-url",
      trackingIssueUrl,
      "--accepted-report-url",
      "https://github.com/Sskift/skfiy/issues/102",
      "--output",
      ".skfiy-dogfood/tracking-issue-abcdef1.md",
      "--execute"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json"),
      releaseUrl,
      trackingIssueUrl,
      acceptedReportIssueUrls: ["https://github.com/Sskift/skfiy/issues/102"],
      outputPath: path.resolve(".skfiy-dogfood/tracking-issue-abcdef1.md"),
      dryRun: false
    });
    expect(defaults).toMatchObject({
      trackingIssueUrl,
      dryRun: true
    });
    expect(createDogfoodTrackingIssueHelpText()).toContain("dogfood:tracking-issue");
    expect(createDogfoodTrackingIssueHelpText()).toContain("--execute");
    expect(createDogfoodTrackingIssueHelpText()).toContain("dry-run");
    expect(createDogfoodTrackingIssueHelpText()).toContain("--accepted-report-url");
    expect(createDogfoodTrackingIssueHelpText()).toContain("preserves existing accepted report issue URLs");
  });

  it("dry-runs by writing a current-alpha tracking issue body without editing GitHub", async () => {
    const { syncDogfoodTrackingIssue } = await import(pathToFileURL(modulePath).href) as {
      syncDogfoodTrackingIssue: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(syncDogfoodTrackingIssue({
      rootDir: "/repo",
      manifestPath,
      releaseUrl,
      trackingIssueUrl,
      outputPath,
      dryRun: true
    }, io)).resolves.toMatchObject({
      result: "planned",
      dryRun: true,
      trackingIssueUrl,
      outputPath,
      releaseUrl,
      manifest: {
        appName: "skfiy",
        commitSha: "abcdef1234567890"
      }
    });

    expect(io.commands).toEqual([]);
    const body = io.textFiles[outputPath];
    expect(body).toContain("## Current Alpha");
    expect(body).toContain(`- Release: ${releaseUrl}`);
    expect(body).toContain("- Manifest: `.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json`");
    expect(body).toContain("- Zip: `skfiy-0.1.0-abcdef1-macos-unsigned.zip`");
    expect(body).toContain("- Zip SHA256: `feedface`");
    expect(body).toContain("- Commit: `abcdef1234567890`");
    expect(body).toContain("- Bundle id: `com.sskift.skfiy`");
    expect(body).toContain("- App name: `skfiy`");
    expect(body).toContain("Real tester gate excludes tester ids beginning with `local-`, `prepare-`, `preflight-`, or `synthetic-`");
    expect(body).toContain("- Required: `coding-terminal`");
    expect(body).not.toContain("- [x] `coding-terminal`");
    expect(body).toContain("Workflow coverage is computed from verified accepted report issue labels by `dogfood:status`, not from this checklist.");
    expect(body).toContain("- Strict permission preflight summary: `.skfiy-dogfood/preflight-abcdef1-summary.md`");
    expect(body).toContain("- UI artifact: `.skfiy-smoke/dogfood/preflight-abcdef1/preflight-abcdef1-ui.json`");
    expect(body).toContain("Screen Recording `denied`, Accessibility `denied`, Microphone `not-determined`, Speech Recognition `not-determined`");
    expect(body).toContain("npm run dogfood:status -- \\");
    expect(body).toContain("--manifest .skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json");
    expect(body).toContain("## Recommended Tester Assignments");
    expect(body).toContain("- `tester-1`: `coding-terminal,screenshot-inspection`");
    expect(body).toContain("- `tester-2`: `finder-file`");
    expect(body).toContain("- `tester-3`: `browser-fallback`");
    expect(body).toContain("--tester-id <stable-real-tester-id> \\\n  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(body).toContain("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1 --tester-id tester-1 --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --execute");
    expect(body).not.toContain("npm run dogfood:prepare-alpha -- --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1 --tester-id tester-1 --workflows coding-terminal,screenshot-inspection --execute");
    expect(body).toContain("npm run dogfood:tester -- --manifest <path-to-downloaded-alpha-manifest.json> --app <path-to-unzipped-skfiy.app> --tester-id tester-1 --workflows coding-terminal,screenshot-inspection");
    expect(body).toContain("--file-issue");
    expect(body).toContain("npm run dogfood:review -- \\");
    expect(body).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(body).toContain("npm run dogfood:review -- --manifest <path-to-downloaded-alpha-manifest.json> --issue-url <filed-dogfood-issue-url> --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --summary .skfiy-dogfood/reviews/tester-1.md");
    expect(body).toContain("Replace `<path-to-downloaded-alpha-manifest.json>` with the manifest path printed by `dogfood:prepare-alpha` on the tester machine.");
    expect(body).toContain("After `dogfood:prepare-alpha --execute` finishes, copy `nextCommands.tester` from its JSON output for the tester run.");
    expect(body).toContain("After the dogfood issue is filed, copy `nextCommands.review` from the same prepare output and replace `<filed-dogfood-issue-url>`.");
    expect(body).not.toContain("--app /Applications/skfiy.app");
    expect(body).not.toContain("--require-current-head");
    expect(body).toContain("--release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1");
    expect(body).toContain("No accepted real tester report is linked yet for this alpha");
  });

  it("preserves existing accepted tester report URLs while refreshing current alpha fields", async () => {
    const { syncDogfoodTrackingIssue } = await import(pathToFileURL(modulePath).href) as {
      syncDogfoodTrackingIssue: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      existingTrackingIssueBody: [
        "## Current Alpha",
        "- Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-old",
        "",
        "## Required Real Tester Count",
        "- [ ] Tester 1 accepted report issue URL: https://github.com/Sskift/skfiy/issues/101",
        "- [ ] Tester 2 accepted report issue URL:",
        "- [ ] Tester 3 accepted report issue URL: https://github.com/Sskift/skfiy/issues/103",
        "- [ ] Optional tester 4 accepted report issue URL:",
        "- [ ] Optional tester 5 accepted report issue URL:"
      ].join("\n")
    });

    await syncDogfoodTrackingIssue({
      rootDir: "/repo",
      manifestPath,
      releaseUrl,
      trackingIssueUrl,
      outputPath,
      dryRun: true
    }, io);

    const body = io.textFiles[outputPath];
    expect(body).toContain("- [ ] Tester 1 accepted report issue URL: https://github.com/Sskift/skfiy/issues/101");
    expect(body).toContain("- [ ] Tester 2 accepted report issue URL: https://github.com/Sskift/skfiy/issues/103");
    expect(body).toContain("- [ ] Tester 3 accepted report issue URL:");
    expect(body).toContain("- Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1");
    expect(body).toContain("The cohort still needs at least 1 more distinct real tester report.");
    expect(body).not.toContain("No accepted real tester report is linked yet for this alpha");
  });

  it("adds a newly accepted report URL to the next tracking issue slot", async () => {
    const { syncDogfoodTrackingIssue } = await import(pathToFileURL(modulePath).href) as {
      syncDogfoodTrackingIssue: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      existingTrackingIssueBody: [
        "## Required Real Tester Count",
        "- [ ] Tester 1 accepted report issue URL: https://github.com/Sskift/skfiy/issues/101",
        "- [ ] Tester 2 accepted report issue URL:",
        "- [ ] Tester 3 accepted report issue URL:",
        "- [ ] Optional tester 4 accepted report issue URL:",
        "- [ ] Optional tester 5 accepted report issue URL:"
      ].join("\n")
    });

    await syncDogfoodTrackingIssue({
      rootDir: "/repo",
      manifestPath,
      releaseUrl,
      trackingIssueUrl,
      acceptedReportIssueUrls: [
        "https://github.com/Sskift/skfiy/issues/102",
        "https://github.com/Sskift/skfiy/issues/101"
      ],
      outputPath,
      dryRun: true
    }, io);

    const body = io.textFiles[outputPath];
    expect(body).toContain("- [ ] Tester 1 accepted report issue URL: https://github.com/Sskift/skfiy/issues/101");
    expect(body).toContain("- [ ] Tester 2 accepted report issue URL: https://github.com/Sskift/skfiy/issues/102");
    expect(body).toContain("- [ ] Tester 3 accepted report issue URL:");
    expect(body.match(/https:\/\/github\.com\/Sskift\/skfiy\/issues\/101/g)).toHaveLength(1);
    expect(io.commands).toEqual([]);
  });

  it("executes by editing the GitHub tracking issue with the generated body", async () => {
    const { syncDogfoodTrackingIssue } = await import(pathToFileURL(modulePath).href) as {
      syncDogfoodTrackingIssue: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(syncDogfoodTrackingIssue({
      rootDir: "/repo",
      manifestPath,
      releaseUrl,
      trackingIssueUrl,
      outputPath,
      dryRun: false
    }, io)).resolves.toMatchObject({
      result: "updated",
      dryRun: false,
      outputPath,
      trackingIssueUrl
    });

    expect(io.commands).toEqual([
      {
        command: "gh",
        args: [
          "issue",
          "edit",
          "1",
          "--repo",
          "Sskift/skfiy",
          "--body-file",
          outputPath
        ]
      }
    ]);
  });
});

function createMemoryIo(options: { existingTrackingIssueBody?: string } = {}) {
  const commands: Array<{ command: string; args: string[] }> = [];
  const textFiles: Record<string, string> = {};

  return {
    commands,
    textFiles,
    async readJson(filePath: string) {
      if (filePath === manifestPath) {
        return {
          schemaVersion: 1,
          appName: "skfiy",
          version: "0.1.0",
          commitSha: "abcdef1234567890",
          bundleIdentifier: "com.sskift.skfiy",
          signed: false,
          notarized: false,
          artifactBaseName: "skfiy-0.1.0-abcdef1-macos-unsigned",
          zip: {
            path: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
            bytes: 1234,
            sha256: "feedface"
          },
          uiSmokeArtifactPath: uiSmokePath
        };
      }
      if (filePath === uiSmokePath) {
        return {
          artifactPath: uiSmokePath,
          result: "passed",
          permissions: {
            screenRecording: { state: "denied" },
            accessibility: { state: "denied" },
            microphone: { state: "not-determined" },
            speechRecognition: { state: "not-determined" }
          }
        };
      }
      throw new Error(`Unexpected JSON path: ${filePath}`);
    },
    async mkdir() {},
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
    },
    async readIssue(issueUrl: string) {
      if (issueUrl !== trackingIssueUrl) {
        throw new Error(`Unexpected issue URL: ${issueUrl}`);
      }

      return {
        body: options.existingTrackingIssueBody ?? "",
        labels: ["skfiy", "dogfood"]
      };
    },
    async execFile(command: string, args: string[]) {
      commands.push({ command, args });
      return { stdout: "", stderr: "" };
    }
  };
}
