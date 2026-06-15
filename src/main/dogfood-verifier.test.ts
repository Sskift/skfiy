import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood artifact verifier", () => {
  const modulePath = path.join(process.cwd(), "scripts", "verify-dogfood-artifacts.mjs");

  it("is exposed as an npm script for dogfood evidence checks", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:verify": "node scripts/verify-dogfood-artifacts.mjs"
    });
  });

  it("parses an explicit manifest path and require-passed gate", async () => {
    const {
      createDefaultDogfoodVerifyOptions,
      parseDogfoodVerifyArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodVerifyOptions: (rootDir: string) => Record<string, unknown>;
      parseDogfoodVerifyArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodVerifyOptions("/repo");

    expect(parseDogfoodVerifyArgs([
      "--manifest",
      ".skfiy-alpha/skfiy.json",
      "--require-passed",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy.json"),
      requirePassed: true,
      requireCurrentHead: true
    });
  });

  it("accepts a complete blocked dogfood evidence chain from the packaged app", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        smokeArtifactPath: ghosttySmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: [
          "npm run smoke:ghostty -- --output <path>",
          "npm run smoke:voice -- --output <path>"
        ]
      },
      [zipPath]: Buffer.alloc(42),
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        permissions: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" }
        },
        processesAfterCleanup: []
      },
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        speechStatus: {
          locale: "zh-CN",
          recognizerAvailable: true,
          speechRecognition: { state: "not-determined" },
          microphone: { state: "granted" }
        },
        providerEvents: [
          { providerId: "native-macos", state: "unavailable" }
        ],
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "passed",
      manifestPath,
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "manifest.smokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "manifest.voiceSmokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "ghostty.productPath", ok: true }),
        expect.objectContaining({ id: "voice.productPath", ok: true })
      ])
    });
  });

  it("fails when artifacts were captured through tmux or with missing product paths", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        smokeArtifactPath: ghosttySmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: []
      },
      [zipPath]: Buffer.alloc(42),
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: true,
        productPath: "helper-only",
        artifactPath: ghosttySmokePath,
        processesAfterCleanup: ["123 skfiy.app"]
      },
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "helper-only",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.runnerHasTmux"),
        expect.stringContaining("ghostty.productPath"),
        expect.stringContaining("ghostty.processesAfterCleanup"),
        expect.stringContaining("voice.productPath")
      ])
    });
  });

  it("fails when current-head evidence is required but the manifest commit is stale", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false,
      requireCurrentHead: true,
      currentHeadSha: "fresh-head"
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "stale-head",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        smokeArtifactPath: ghosttySmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: [
          "npm run smoke:ghostty -- --output <path>",
          "npm run smoke:voice -- --output <path>"
        ]
      },
      [zipPath]: Buffer.alloc(42),
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        processesAfterCleanup: []
      },
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        speechStatus: {
          locale: "zh-CN",
          recognizerAvailable: true,
          speechRecognition: { state: "not-determined" },
          microphone: { state: "granted" }
        },
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("manifest.currentHead")
      ])
    });
  });

  it("fails when native voice smoke does not include structured speech permission status", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        smokeArtifactPath: ghosttySmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: [
          "npm run smoke:ghostty -- --output <path>",
          "npm run smoke:voice -- --output <path>"
        ]
      },
      [zipPath]: Buffer.alloc(42),
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        processesAfterCleanup: []
      },
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("voice.speechStatus")
      ])
    });
  });
});

function createMemoryIo(files: Record<string, unknown>) {
  return {
    async readJson(filePath: string) {
      const value = files[filePath];
      if (value === undefined || Buffer.isBuffer(value)) {
        throw new Error(`Missing JSON: ${filePath}`);
      }

      return value;
    },
    async stat(filePath: string) {
      const value = files[filePath];
      if (!Buffer.isBuffer(value)) {
        throw new Error(`Missing file: ${filePath}`);
      }

      return { size: value.byteLength };
    }
  };
}
