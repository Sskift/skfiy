import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("alpha artifact packaging", () => {
  it("plans a versioned unsigned macOS zip and manifest from version and commit", async () => {
    const modulePath = path.join(process.cwd(), "scripts/create-alpha-artifact.mjs");
    const {
      createAlphaArtifactPlan
    } = await import(pathToFileURL(modulePath).href) as {
      createAlphaArtifactPlan: (input: {
        rootDir: string;
        version: string;
        commitSha: string;
      }) => {
        appPath: string;
        outputDir: string;
        artifactBaseName: string;
        zipPath: string;
        manifestPath: string;
        bundleIdentifier: string;
      };
    };

    expect(createAlphaArtifactPlan({
      rootDir: "/repo",
      version: "0.1.0",
      commitSha: "abcdef1234567890"
    })).toEqual({
      appPath: "/repo/dist/skfiy.app",
      outputDir: "/repo/.skfiy-alpha",
      artifactBaseName: "skfiy-0.1.0-abcdef1-macos-unsigned",
      zipPath: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
      manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json",
      bundleIdentifier: "com.sskift.skfiy"
    });
  });

  it("builds the ditto command without flattening the app bundle", async () => {
    const modulePath = path.join(process.cwd(), "scripts/create-alpha-artifact.mjs");
    const {
      createZipCommand
    } = await import(pathToFileURL(modulePath).href) as {
      createZipCommand: (input: { appPath: string; zipPath: string }) => {
        command: string;
        args: string[];
      };
    };

    expect(createZipCommand({
      appPath: "/repo/dist/skfiy.app",
      zipPath: "/repo/.skfiy-alpha/skfiy.zip"
    })).toEqual({
      command: "ditto",
      args: ["-c", "-k", "--keepParent", "/repo/dist/skfiy.app", "/repo/.skfiy-alpha/skfiy.zip"]
    });
  });

  it("creates a dogfood manifest with checksum and required smoke evidence fields", async () => {
    const modulePath = path.join(process.cwd(), "scripts/create-alpha-artifact.mjs");
    const {
      createAlphaManifest
    } = await import(pathToFileURL(modulePath).href) as {
      createAlphaManifest: (input: {
        plan: {
          appPath: string;
          artifactBaseName: string;
          bundleIdentifier: string;
          manifestPath: string;
          zipPath: string;
        };
        version: string;
        commitSha: string;
        createdAt: string;
        sha256: string;
        zipBytes: number;
        smokeArtifactPath?: string;
      }) => Record<string, unknown>;
    };

    expect(createAlphaManifest({
      plan: {
        appPath: "/repo/dist/skfiy.app",
        artifactBaseName: "skfiy-0.1.0-abcdef1-macos-unsigned",
        bundleIdentifier: "com.sskift.skfiy",
        manifestPath: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.json",
        zipPath: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip"
      },
      version: "0.1.0",
      commitSha: "abcdef1234567890",
      createdAt: "2026-06-16T00:00:00.000Z",
      sha256: "f".repeat(64),
      zipBytes: 4096,
      smokeArtifactPath: "/repo/.skfiy-smoke/ghostty-matrix.json"
    })).toMatchObject({
      schemaVersion: 1,
      appName: "skfiy",
      version: "0.1.0",
      commitSha: "abcdef1234567890",
      bundleIdentifier: "com.sskift.skfiy",
      signed: false,
      notarized: false,
      zip: {
        path: "/repo/.skfiy-alpha/skfiy-0.1.0-abcdef1-macos-unsigned.zip",
        bytes: 4096,
        sha256: "f".repeat(64)
      },
      smokeArtifactPath: "/repo/.skfiy-smoke/ghostty-matrix.json",
      requiredDogfoodEvidence: [
        "npm run smoke:ghostty -- --output <path>",
        "Screen Recording permission state",
        "Accessibility permission state",
        "Microphone or ASR provider state",
        "before/after screenshot paths when Computer Use passes"
      ]
    });
  });
});
