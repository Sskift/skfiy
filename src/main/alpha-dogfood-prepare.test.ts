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
      "--app",
      "~/Applications/skfiy.app",
      "--download-dir",
      ".skfiy-dogfood/downloads/tester-a",
      "--handoff-output",
      ".skfiy-dogfood/handoffs/tester-a.md",
      "--replace-existing",
      "--execute"
    ], defaults)).toMatchObject({
      releaseUrl,
      repo: "Sskift/skfiy",
      tagName: "skfiy-alpha-abc1234",
      testerId: "tester-a",
      appPath: path.join(process.env.HOME ?? "", "Applications/skfiy.app"),
      downloadDir: path.resolve(".skfiy-dogfood/downloads/tester-a"),
      handoffOutputPath: path.resolve(".skfiy-dogfood/handoffs/tester-a.md"),
      replaceExisting: true,
      dryRun: false
    });
    expect(createPrepareAlphaDogfoodHelpText()).toContain("dogfood:prepare-alpha");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("dry-run");
    expect(createPrepareAlphaDogfoodHelpText()).toContain("--execute");
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
      dryRun: false
    }, io)).resolves.toMatchObject({
      status: "prepared",
      dryRun: false,
      manifestPath: "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.json",
      zipPath: "/repo/.skfiy-dogfood/downloads/skfiy-alpha-abc1234/skfiy-0.1.0-abc1234-macos-unsigned.zip",
      appPath: "/repo/.skfiy-dogfood/apps/skfiy-alpha-abc1234/skfiy.app",
      handoffOutputPath: "/repo/.skfiy-dogfood/handoffs/tester-a.md"
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

function createMemoryIo() {
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
        }
      };
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
