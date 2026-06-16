import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";
const outputPath = "/repo/.skfiy-dogfood/handoffs/tester-b.md";
const trackingIssueUrl = "https://github.com/Sskift/skfiy/issues/1";

describe("dogfood handoff generator", () => {
  const modulePath = path.join(process.cwd(), "scripts", "create-dogfood-handoff.mjs");

  it("is exposed as an npm script for real tester handoff instructions", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:handoff": "node scripts/create-dogfood-handoff.mjs"
    });
  });

  it("parses manifest, tester id, workflows, tracking issue, and output paths", async () => {
    const {
      createDefaultDogfoodHandoffOptions,
      createDogfoodHandoffHelpText,
      parseDogfoodHandoffArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodHandoffOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodHandoffHelpText: () => string;
      parseDogfoodHandoffArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodHandoffOptions("/repo");

    expect(parseDogfoodHandoffArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tester-id",
      "tester-b",
      "--workflows",
      "coding-terminal,browser-fallback",
      "--tracking-issue-url",
      trackingIssueUrl,
      "--release-url",
      "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123",
      "--app",
      "~/Applications/skfiy.app",
      "--output",
      ".skfiy-dogfood/handoffs/tester-b.md",
      "--finder-target-dir",
      "~/Desktop/skfiy-finder-dogfood",
      "--chrome-current-page-endpoint",
      "http://127.0.0.1:9222",
      "--require-passed",
      "--allow-synthetic-tester-id"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      testerId: "tester-b",
      workflows: ["coding-terminal", "browser-fallback"],
      trackingIssueUrl,
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123",
      appPath: path.join(process.env.HOME ?? "", "Applications/skfiy.app"),
      outputPath: path.resolve(".skfiy-dogfood/handoffs/tester-b.md"),
      finderTargetDir: path.join(process.env.HOME ?? "", "Desktop/skfiy-finder-dogfood"),
      chromeCurrentPageEndpoint: "http://127.0.0.1:9222",
      requirePassed: true,
      allowSyntheticTesterId: true
    });
    expect(createDogfoodHandoffHelpText()).toContain("dogfood:handoff");
    expect(createDogfoodHandoffHelpText()).toContain("does not create or accept GitHub reports");
    expect(createDogfoodHandoffHelpText()).toContain("--tester-id");
    expect(createDogfoodHandoffHelpText()).toContain("Reserved tester id prefixes");
  });

  it("writes a copyable tester handoff with alpha identity, no-tmux warning, and review steps", async () => {
    const { createDogfoodHandoff } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodHandoff: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(createDogfoodHandoff({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-b",
      workflows: [
        "coding-terminal",
        "screenshot-inspection",
        "finder-file",
        "browser-fallback"
      ],
      trackingIssueUrl,
      releaseUrl: "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123",
      appPath: "/Applications/skfiy.app",
      outputPath,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "created",
      testerId: "tester-b",
      outputPath,
      manifest: {
        appName: "skfiy",
        commitSha: "abc123"
      }
    });

    const handoff = io.textFiles[outputPath];
    expect(handoff).toContain("# skfiy dogfood handoff: tester-b");
    expect(handoff).toContain("skfiy-0.1.0-abc123-macos-unsigned.json");
    expect(handoff).toContain("skfiy-0.1.0-abc123-macos-unsigned.zip");
    expect(handoff).toContain("Zip SHA256: `feedface`");
    expect(handoff).toContain("Release: https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-abc123");
    expect(handoff).toContain("App bundle to test: `/Applications/skfiy.app`");
    expect(handoff).toContain("Commit: `abc123`");
    expect(handoff).toContain("Do not run this from tmux");
    expect(handoff).toContain("Screen Recording");
    expect(handoff).toContain("Accessibility");
    expect(handoff).toContain("Microphone");
    expect(handoff).toContain("Speech Recognition");
    expect(handoff).toContain("npm run dogfood:tester -- \\");
    expect(handoff).toContain("--app /Applications/skfiy.app");
    expect(handoff).toContain("--tester-id tester-b");
    expect(handoff).toContain("--workflows coding-terminal,screenshot-inspection,finder-file,browser-fallback");
    expect(handoff).toContain("--artifacts-dir .skfiy-smoke/dogfood/tester-b");
    expect(handoff).toContain("--issue-output .skfiy-dogfood/issues/tester-b.md");
    expect(handoff).toContain("File a `skfiy dogfood report` issue");
    expect(handoff).toContain("gh issue create -- \\");
    expect(handoff).toContain("--repo Sskift/skfiy");
    expect(handoff).toContain("--title \"skfiy dogfood report: tester-b\"");
    expect(handoff).toContain("--body-file .skfiy-dogfood/issues/tester-b.md");
    expect(handoff).toContain("Do not add `dogfood:accepted` or `workflow:*` labels yourself.");
    expect(handoff).toContain("npm run dogfood:review -- \\");
    expect(handoff).toContain("--tracking-issue-url https://github.com/Sskift/skfiy/issues/1");
    expect(handoff).not.toContain("--require-current-head");
    expect(handoff).toContain("dogfood:accepted");
    expect(handoff).toContain(trackingIssueUrl);
    expect(handoff).toContain("Blocked evidence is acceptable when it records the real permission state");
  });

  it("rejects reserved synthetic tester id prefixes that cannot count as real dogfood users", async () => {
    const { createDogfoodHandoff } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodHandoff: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(createDogfoodHandoff({
      rootDir: "/repo",
      manifestPath,
      testerId: "PREflight-abc123",
      workflows: ["coding-terminal"],
      outputPath
    }, createMemoryIo())).rejects.toThrow(
      "Reserved dogfood tester id prefix"
    );
  });

  it("allows reserved tester id prefixes only for explicit maintainer handoff generation", async () => {
    const { createDogfoodHandoff } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodHandoff: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(createDogfoodHandoff({
      rootDir: "/repo",
      manifestPath,
      testerId: "prepare-abc123",
      workflows: ["coding-terminal"],
      outputPath,
      allowSyntheticTesterId: true
    }, createMemoryIo())).resolves.toMatchObject({
      result: "created",
      testerId: "prepare-abc123"
    });
  });
});

function createMemoryIo() {
  const textFiles: Record<string, string> = {};

  return {
    textFiles,
    async readJson(filePath: string) {
      if (filePath !== manifestPath) {
        throw new Error(`Unexpected manifest path: ${filePath}`);
      }

      return {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        artifactBaseName: "skfiy-0.1.0-abc123-macos-unsigned",
        manifestPath,
        zip: {
          path: "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip",
          bytes: 1234,
          sha256: "feedface"
        }
      };
    },
    async mkdir() {},
    async writeText(filePath: string, value: string) {
      textFiles[filePath] = value;
    }
  };
}
