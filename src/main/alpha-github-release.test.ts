import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json";
const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";
const empty1234ByteZipSha256 = "ad47fd9e87159d651a53b3dfba3ef200684a9ed88c2528b62e18f3881fe203b0";

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

  it("plans a pre-release with zip, manifest, checksum, and dogfood collection instructions", async () => {
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
    expect(notes).toContain(`Zip SHA256: \`${empty1234ByteZipSha256}\``);
    expect(notes).toContain(trackingIssueUrl);
    expect(notes).toContain("npm run dogfood:prepare-alpha");
    expect(notes).toContain("npm run dogfood:handoff");
    expect(notes).toContain("npm run dogfood:status");
    expect(notes).toContain("npm run dogfood:collect");
    expect(notes).toContain("npm run dogfood:cohort");
    expect(notes).toContain("--release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1");
    expect(notes).toContain("--app <path-to-unzipped-skfiy.app>");
    expect(notes).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(notes).toContain("--reports-dir .skfiy-dogfood/reports");
    expect(notes).toContain("--cohort .skfiy-dogfood/internal-alpha-cohort.json");
    expect(notes).toContain("--summary .skfiy-dogfood/internal-alpha-summary.md");
    expect(notes).toContain("--summary .skfiy-dogfood/internal-alpha-summary-strict.md");
    expect(notes).toContain("--require-passed");
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
    expect(io.textFiles["/repo/.skfiy-alpha/skfiy-alpha-abcdef1-notes.md"]).toContain(
      `Zip SHA256: \`${empty1234ByteZipSha256}\``
    );
    expect(io.textFiles["/repo/docs/release-evidence/latest-alpha.json"]).toBeUndefined();
  });

  it("writes latest alpha release evidence after an executed publish succeeds", async () => {
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
      dryRun: false,
      now: () => "2026-06-16T19:20:23.000Z"
    }, io)).resolves.toMatchObject({
      status: "published",
      dryRun: false,
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1"
    });

    expect(io.commands).toHaveLength(1);
    expect(JSON.parse(io.textFiles["/repo/docs/release-evidence/latest-alpha.json"])).toEqual({
      schemaVersion: 1,
      appName: "skfiy",
      tagName: "skfiy-alpha-abcdef1",
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1",
      commitSha: "abcdef1234567890",
      artifactBaseName: "skfiy-0.1.0-abcdef1-macos-unsigned",
      manifestPath: ".skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json",
      zipPath: ".skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
      zipSha256: empty1234ByteZipSha256,
      smokeArtifacts: {
        ui: ".skfiy-smoke/ui-abcdef1.json",
        ghostty: ".skfiy-smoke/ghostty-abcdef1.json",
        chrome: ".skfiy-smoke/chrome-abcdef1.json",
        finder: ".skfiy-smoke/finder-abcdef1.json",
        voice: ".skfiy-smoke/voice-abcdef1.json"
      },
      dogfoodStatus: "waiting-for-dogfood",
      publishedAt: "2026-06-16T19:20:23.000Z"
    });
  });

  it("refreshes latest alpha evidence when the GitHub release already exists with matching assets", async () => {
    const { runGitHubAlphaRelease } = await import(pathToFileURL(modulePath).href) as {
      runGitHubAlphaRelease: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({ releaseAlreadyExists: true });

    await expect(runGitHubAlphaRelease({
      rootDir: "/repo",
      manifestPath,
      repo: "Sskift/skfiy",
      trackingIssueUrl,
      dryRun: false,
      now: () => "2026-06-17T08:20:00.000Z"
    }, io)).resolves.toMatchObject({
      status: "published",
      dryRun: false,
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1"
    });

    expect(io.commands).toEqual([
      expect.objectContaining({
        command: "gh",
        args: expect.arrayContaining(["release", "create", "skfiy-alpha-abcdef1"])
      }),
      expect.objectContaining({
        command: "gh",
        args: [
          "release",
          "view",
          "skfiy-alpha-abcdef1",
          "--repo",
          "Sskift/skfiy",
          "--json",
          "tagName,url,isPrerelease,isDraft,targetCommitish,assets"
        ]
      })
    ]);
    expect(JSON.parse(io.textFiles["/repo/docs/release-evidence/latest-alpha.json"])).toMatchObject({
      tagName: "skfiy-alpha-abcdef1",
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1",
      commitSha: "abcdef1234567890",
      zipSha256: empty1234ByteZipSha256,
      publishedAt: "2026-06-17T08:20:00.000Z"
    });
  });

  it("rejects release evidence when smoke artifacts belong to a different alpha", async () => {
    const { runGitHubAlphaRelease } = await import(pathToFileURL(modulePath).href) as {
      runGitHubAlphaRelease: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      manifest: {
        ...createManifest(),
        uiSmokeArtifactPath: "/repo/.skfiy-smoke/ui-72b7895.json"
      }
    });

    await expect(runGitHubAlphaRelease({
      rootDir: "/repo",
      manifestPath,
      repo: "Sskift/skfiy",
      trackingIssueUrl,
      dryRun: false
    }, io)).rejects.toThrow(
      "alpha manifest uiSmokeArtifactPath must reference current alpha abcdef1; got /repo/.skfiy-smoke/ui-72b7895.json."
    );
    expect(io.commands).toEqual([]);
  });

  it("rejects a dry-run release when the zip bytes match but the SHA256 differs", async () => {
    const { runGitHubAlphaRelease } = await import(pathToFileURL(modulePath).href) as {
      runGitHubAlphaRelease: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      manifest: {
        ...createManifest(),
        zip: {
          path: createManifest().zip.path,
          bytes: 1234,
          sha256: "b".repeat(64)
        }
      }
    });

    await expect(runGitHubAlphaRelease({
      rootDir: "/repo",
      manifestPath,
      repo: "Sskift/skfiy",
      trackingIssueUrl,
      dryRun: true
    }, io)).rejects.toThrow(
      `alpha zip SHA256 mismatch: expected ${"b".repeat(64)}, got ${empty1234ByteZipSha256}.`
    );
    expect(io.commands).toEqual([]);
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
    uiSmokeArtifactPath: "/repo/.skfiy-smoke/ui-abcdef1.json",
    smokeArtifactPath: "/repo/.skfiy-smoke/ghostty-abcdef1.json",
    chromeSmokeArtifactPath: "/repo/.skfiy-smoke/chrome-abcdef1.json",
    finderSmokeArtifactPath: "/repo/.skfiy-smoke/finder-abcdef1.json",
    voiceSmokeArtifactPath: "/repo/.skfiy-smoke/voice-abcdef1.json",
    zip: {
      path: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
      bytes: 1234,
      sha256: empty1234ByteZipSha256
    }
  };
}

function createMemoryIo(options: {
  manifest?: ReturnType<typeof createManifest>;
  releaseAlreadyExists?: boolean;
} = {}) {
  const commands: Array<{ command: string; args: string[] }> = [];
  const textFiles: Record<string, string> = {};
  const manifest = options.manifest ?? createManifest();

  return {
    commands,
    textFiles,
    async readJson(filePath: string) {
      if (filePath !== manifestPath) {
        throw new Error(`Unexpected JSON path: ${filePath}`);
      }
      return manifest;
    },
    async statFile(filePath: string) {
      if (filePath !== manifestPath && filePath !== manifest.zip.path) {
        throw new Error(`Unexpected stat path: ${filePath}`);
      }
      return { size: filePath === manifestPath ? 512 : 1234 };
    },
    async readFile(filePath: string) {
      if (filePath !== manifest.zip.path) {
        throw new Error(`Unexpected file read path: ${filePath}`);
      }
      return Buffer.alloc(1234);
    },
    async mkdir() {},
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
    },
    async execFile(command: string, args: string[]) {
      commands.push({ command, args });
      if (options.releaseAlreadyExists && args[0] === "release" && args[1] === "create") {
        throw new Error("release already exists");
      }
      if (options.releaseAlreadyExists && args[0] === "release" && args[1] === "view") {
        return {
          stdout: JSON.stringify({
            tagName: "skfiy-alpha-abcdef1",
            url: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abcdef1",
            isPrerelease: true,
            isDraft: false,
            targetCommitish: "abcdef1234567890",
            assets: [
              {
                name: "skfiy-0.1.0-abcdef1-macos-unsigned.zip",
                size: 1234,
                digest: `sha256:${empty1234ByteZipSha256}`,
                state: "uploaded"
              },
              {
                name: "skfiy-0.1.0-abcdef1-macos-unsigned.json",
                size: 512,
                state: "uploaded"
              }
            ]
          }),
          stderr: ""
        };
      }
      return { stdout: "", stderr: "" };
    }
  };
}
