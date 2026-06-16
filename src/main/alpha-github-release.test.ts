import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json";
const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";

describe("GitHub alpha release publisher", () => {
  const modulePath = path.join(process.cwd(), "scripts", "publish-alpha-github-release.mjs");

  it("is exposed as an npm script for distributing alpha zip artifacts", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "alpha:github-release": "node scripts/publish-alpha-github-release.mjs"
    });
  });

  it("parses release arguments without executing by default", async () => {
    const {
      createDefaultGitHubAlphaReleaseOptions,
      createGitHubAlphaReleaseHelpText,
      parseGitHubAlphaReleaseArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultGitHubAlphaReleaseOptions: (rootDir: string) => Record<string, unknown>;
      createGitHubAlphaReleaseHelpText: () => string;
      parseGitHubAlphaReleaseArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultGitHubAlphaReleaseOptions("/repo");

    expect(parseGitHubAlphaReleaseArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json",
      "--repo",
      "Sskift/skfiy",
      "--tracking-issue-url",
      trackingIssueUrl,
      "--notes",
      ".skfiy-alpha/release-notes.md",
      "--execute"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json"),
      repo: "Sskift/skfiy",
      trackingIssueUrl,
      notesPath: path.resolve(".skfiy-alpha/release-notes.md"),
      dryRun: false
    });
    expect(defaults).toMatchObject({
      dryRun: true,
      repo: "Sskift/skfiy"
    });
    expect(createGitHubAlphaReleaseHelpText()).toContain("alpha:github-release");
    expect(createGitHubAlphaReleaseHelpText()).toContain("--execute");
    expect(createGitHubAlphaReleaseHelpText()).toContain("dry-run");
  });

  it("plans a pre-release with zip, manifest, checksum, and tester handoff instructions", async () => {
    const {
      createGitHubAlphaReleasePlan,
      createGitHubAlphaReleaseNotes
    } = await import(pathToFileURL(modulePath).href) as {
      createGitHubAlphaReleasePlan: (input: Record<string, unknown>) => Record<string, unknown>;
      createGitHubAlphaReleaseNotes: (input: Record<string, unknown>) => string;
    };
    const manifest = createManifest();
    const plan = createGitHubAlphaReleasePlan({
      manifest,
      manifestPath,
      repo: "Sskift/skfiy",
      trackingIssueUrl,
      notesPath: "/repo/.skfiy-alpha/skfiy-alpha-abcdef1-notes.md"
    });

    expect(plan).toMatchObject({
      tagName: "skfiy-alpha-abcdef1",
      title: "skfiy alpha 0.1.0 abcdef1",
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1",
      uploadAssets: [
        "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
        manifestPath
      ],
      command: {
        command: "gh",
        args: expect.arrayContaining([
          "release",
          "create",
          "skfiy-alpha-abcdef1",
          "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
          manifestPath,
          "--repo",
          "Sskift/skfiy",
          "--target",
          "abcdef1234567890",
          "--title",
          "skfiy alpha 0.1.0 abcdef1",
          "--notes-file",
          "/repo/.skfiy-alpha/skfiy-alpha-abcdef1-notes.md",
          "--prerelease"
        ])
      }
    });

    const notes = createGitHubAlphaReleaseNotes({
      manifest,
      manifestPath,
      trackingIssueUrl,
      releaseUrl: plan.releaseUrl
    });
    expect(notes).toContain("# skfiy alpha 0.1.0 abcdef1");
    expect(notes).toContain("Unsigned internal dogfood build.");
    expect(notes).toContain("Zip SHA256: `feedface`");
    expect(notes).toContain(trackingIssueUrl);
    expect(notes).toContain("npm run dogfood:prepare-alpha");
    expect(notes).toContain("npm run dogfood:handoff");
    expect(notes).toContain("--release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1");
    expect(notes).toContain("--app <path-to-unzipped-skfiy.app>");
    expect(notes).toContain("Do not run dogfood from tmux");
  });

  it("dry-runs without executing gh and writes release notes for review", async () => {
    const { runGitHubAlphaRelease } = await import(pathToFileURL(modulePath).href) as {
      runGitHubAlphaRelease: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(runGitHubAlphaRelease({
      rootDir: "/repo",
      manifestPath,
      repo: "Sskift/skfiy",
      trackingIssueUrl,
      dryRun: true
    }, io)).resolves.toMatchObject({
      status: "planned",
      dryRun: true,
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1"
    });
    expect(io.commands).toEqual([]);
    expect(io.textFiles["/repo/.skfiy-alpha/skfiy-alpha-abcdef1-notes.md"]).toContain("Zip SHA256: `feedface`");
  });
});

function createManifest() {
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
    }
  };
}

function createMemoryIo() {
  const commands: Array<{ command: string; args: string[] }> = [];
  const textFiles: Record<string, string> = {};

  return {
    commands,
    textFiles,
    async readJson(filePath: string) {
      if (filePath !== manifestPath) {
        throw new Error(`Unexpected JSON path: ${filePath}`);
      }
      return createManifest();
    },
    async statFile(filePath: string) {
      if (filePath !== manifestPath && filePath !== createManifest().zip.path) {
        throw new Error(`Unexpected stat path: ${filePath}`);
      }
      return { size: 1234 };
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
