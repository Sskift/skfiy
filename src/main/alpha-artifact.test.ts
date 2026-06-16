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
      createAlphaManifest,
      parseAlphaArtifactArgs
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
        uiSmokeArtifactPath?: string;
        smokeArtifactPath?: string;
        chromeSmokeArtifactPath?: string;
        finderSmokeArtifactPath?: string;
        voiceSmokeArtifactPath?: string;
      }) => Record<string, unknown>;
      parseAlphaArtifactArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };

    expect(parseAlphaArtifactArgs([
      "--ui-smoke-artifact",
      ".skfiy-smoke/ui-permission-onboarding.json",
      "--smoke-artifact",
      ".skfiy-smoke/ghostty-matrix.json",
      "--chrome-smoke-artifact",
      ".skfiy-smoke/chrome-page.json",
      "--finder-smoke-artifact",
      ".skfiy-smoke/finder-item-drag-drop.json",
      "--voice-smoke-artifact",
      ".skfiy-smoke/voice-native.json"
    ], {
      appPath: "/repo/dist/skfiy.app",
      outputDir: "/repo/.skfiy-alpha",
      uiSmokeArtifactPath: undefined,
      smokeArtifactPath: undefined,
      chromeSmokeArtifactPath: undefined,
      finderSmokeArtifactPath: undefined,
      voiceSmokeArtifactPath: undefined,
      help: false
    })).toMatchObject({
      uiSmokeArtifactPath: path.resolve(".skfiy-smoke/ui-permission-onboarding.json"),
      smokeArtifactPath: path.resolve(".skfiy-smoke/ghostty-matrix.json"),
      chromeSmokeArtifactPath: path.resolve(".skfiy-smoke/chrome-page.json"),
      finderSmokeArtifactPath: path.resolve(".skfiy-smoke/finder-item-drag-drop.json"),
      voiceSmokeArtifactPath: path.resolve(".skfiy-smoke/voice-native.json")
    });

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
      uiSmokeArtifactPath: "/repo/.skfiy-smoke/ui-permission-onboarding.json",
      smokeArtifactPath: "/repo/.skfiy-smoke/ghostty-matrix.json",
      chromeSmokeArtifactPath: "/repo/.skfiy-smoke/chrome-page.json",
      finderSmokeArtifactPath: "/repo/.skfiy-smoke/finder-item-drag-drop.json",
      voiceSmokeArtifactPath: "/repo/.skfiy-smoke/voice-native.json"
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
      uiSmokeArtifactPath: "/repo/.skfiy-smoke/ui-permission-onboarding.json",
      smokeArtifactPath: "/repo/.skfiy-smoke/ghostty-matrix.json",
      chromeSmokeArtifactPath: "/repo/.skfiy-smoke/chrome-page.json",
      finderSmokeArtifactPath: "/repo/.skfiy-smoke/finder-item-drag-drop.json",
      voiceSmokeArtifactPath: "/repo/.skfiy-smoke/voice-native.json",
      requiredDogfoodEvidence: [
        "npm run smoke:ui -- --output <path>",
        "npm run smoke:ghostty -- --output <path>",
        "npm run smoke:chrome -- --output <path>",
        "npm run smoke:finder -- --output <path>",
        "npm run smoke:voice -- --output <path>",
        "Permission settings direct links",
        "Screen Recording permission state",
        "Accessibility permission state",
        "Microphone or ASR provider state",
        "before/after screenshot paths when Computer Use passes",
        "action verification events when Computer Use passes",
        "Ghostty app policy settings",
        "clipboard read/write approval runs",
        "Chrome app policy settings",
        "Chrome test-page extraction evidence",
        "Chrome sensitive-page pause evidence",
        "Chrome form action evidence",
        "Chrome screenshot fallback evidence",
        "Chrome fallback switching evidence",
        "Finder app policy settings",
        "Finder observe_app screenshot or permission-blocked evidence",
        "Finder semantic selection evidence",
        "Finder test-folder organization evidence",
        "Finder item drag/drop evidence"
      ]
    });
  });
});
