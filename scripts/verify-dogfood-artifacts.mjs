#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GHOSTTY_PRODUCT_PATH = "renderer -> preload -> main -> helper -> Ghostty";
const VOICE_PRODUCT_PATH = "renderer -> preload -> main -> helper -> native macOS Speech";
const ACCEPTED_GHOSTTY_RESULTS = new Set(["passed", "blocked"]);
const ACCEPTED_VOICE_RESULTS = new Set(["passed", "blocked", "no-transcript"]);

export function createDefaultDogfoodVerifyOptions(rootDir) {
  return {
    manifestPath: undefined,
    rootDir,
    requirePassed: false,
    help: false
  };
}

export function parseDogfoodVerifyArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function verifyDogfoodArtifacts(options, io = createDefaultIo()) {
  const manifestPath = await resolveManifestPath(options, io);
  const checks = [];
  const manifest = await readArtifactJson(manifestPath, "manifest", io, checks);
  const manifestDir = path.dirname(manifestPath);

  const zipPath = readString(manifest?.zip?.path);
  const smokeArtifactPath = readString(manifest?.smokeArtifactPath);
  const voiceSmokeArtifactPath = readString(manifest?.voiceSmokeArtifactPath);

  check(checks, "manifest.appName", manifest?.appName === "skfiy", "manifest appName must be skfiy");
  check(
    checks,
    "manifest.bundleIdentifier",
    manifest?.bundleIdentifier === "com.sskift.skfiy",
    "manifest bundleIdentifier must be com.sskift.skfiy"
  );
  check(
    checks,
    "manifest.zip.path",
    typeof zipPath === "string",
    "manifest zip.path is required"
  );
  check(
    checks,
    "manifest.smokeArtifactPath",
    typeof smokeArtifactPath === "string",
    "manifest smokeArtifactPath is required"
  );
  check(
    checks,
    "manifest.voiceSmokeArtifactPath",
    typeof voiceSmokeArtifactPath === "string",
    "manifest voiceSmokeArtifactPath is required"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.ghostty",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("npm run smoke:ghostty -- --output <path>"),
    "manifest must require Ghostty smoke evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.voice",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("npm run smoke:voice -- --output <path>"),
    "manifest must require native voice smoke evidence"
  );

  if (zipPath) {
    await verifyZip(zipPath, manifest, io, checks);
  }

  const ghostty = smokeArtifactPath
    ? await readArtifactJson(smokeArtifactPath, "ghostty", io, checks)
    : undefined;
  const voice = voiceSmokeArtifactPath
    ? await readArtifactJson(voiceSmokeArtifactPath, "voice", io, checks)
    : undefined;

  if (ghostty) {
    verifyGhosttySmoke(ghostty, smokeArtifactPath, options, checks);
  }

  if (voice) {
    verifyVoiceSmoke(voice, voiceSmokeArtifactPath, options, checks);
  }

  check(
    checks,
    "manifest.paths.absolute",
    path.isAbsolute(manifestPath)
      && (!zipPath || path.isAbsolute(zipPath))
      && (!smokeArtifactPath || path.isAbsolute(smokeArtifactPath))
      && (!voiceSmokeArtifactPath || path.isAbsolute(voiceSmokeArtifactPath)),
    `manifest and artifact paths should be absolute; manifest is in ${manifestDir}`
  );

  const errors = checks
    .filter((item) => !item.ok)
    .map((item) => `${item.id}: ${item.message}`);

  return {
    result: errors.length === 0 ? "passed" : "failed",
    manifestPath,
    errors,
    checks
  };
}

function verifyGhosttySmoke(artifact, expectedPath, options, checks) {
  check(
    checks,
    "ghostty.artifactPath",
    samePath(artifact.artifactPath, expectedPath),
    "Ghostty artifactPath must match manifest smokeArtifactPath"
  );
  check(
    checks,
    "ghostty.result",
    ACCEPTED_GHOSTTY_RESULTS.has(artifact.result),
    "Ghostty smoke result must be passed or blocked"
  );
  check(
    checks,
    "ghostty.requirePassed",
    !options.requirePassed || artifact.result === "passed",
    "Ghostty smoke must be passed when --require-passed is used"
  );
  check(
    checks,
    "ghostty.appLaunchViaOpen",
    artifact.appLaunchViaOpen === true,
    "Ghostty smoke must launch skfiy through open/LaunchServices"
  );
  check(
    checks,
    "ghostty.runnerHasTmux",
    artifact.runnerHasTmux === false,
    "Ghostty smoke must not run under tmux"
  );
  check(
    checks,
    "ghostty.productPath",
    artifact.productPath === GHOSTTY_PRODUCT_PATH,
    `Ghostty smoke productPath must be ${GHOSTTY_PRODUCT_PATH}`
  );
  check(
    checks,
    "ghostty.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "Ghostty smoke must clean up skfiy app processes"
  );
}

function verifyVoiceSmoke(artifact, expectedPath, options, checks) {
  check(
    checks,
    "voice.artifactPath",
    samePath(artifact.artifactPath, expectedPath),
    "voice artifactPath must match manifest voiceSmokeArtifactPath"
  );
  check(
    checks,
    "voice.result",
    ACCEPTED_VOICE_RESULTS.has(artifact.result),
    "voice smoke result must be passed, blocked, or no-transcript"
  );
  check(
    checks,
    "voice.requirePassed",
    !options.requirePassed || artifact.result === "passed",
    "voice smoke must be passed when --require-passed is used"
  );
  check(
    checks,
    "voice.appLaunchViaOpen",
    artifact.appLaunchViaOpen === true,
    "voice smoke must launch skfiy through open/LaunchServices"
  );
  check(
    checks,
    "voice.runnerHasTmux",
    artifact.runnerHasTmux === false,
    "voice smoke must not run under tmux"
  );
  check(
    checks,
    "voice.productPath",
    artifact.productPath === VOICE_PRODUCT_PATH,
    `voice smoke productPath must be ${VOICE_PRODUCT_PATH}`
  );
  check(
    checks,
    "voice.provider",
    artifact.provider === "native-macos",
    "voice smoke must use native-macos provider"
  );
  check(
    checks,
    "voice.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "voice smoke must clean up skfiy app processes"
  );
}

async function verifyZip(zipPath, manifest, io, checks) {
  try {
    const stats = await io.stat(zipPath);
    check(
      checks,
      "zip.bytes",
      Number.isFinite(manifest?.zip?.bytes) && stats.size === manifest.zip.bytes,
      "zip file size must match manifest zip.bytes"
    );
  } catch (error) {
    check(
      checks,
      "zip.exists",
      false,
      error instanceof Error ? error.message : `zip does not exist: ${zipPath}`
    );
  }
}

async function readArtifactJson(filePath, label, io, checks) {
  try {
    return await io.readJson(filePath);
  } catch (error) {
    check(
      checks,
      `${label}.readJson`,
      false,
      error instanceof Error ? error.message : `could not read ${label} artifact`
    );
    return undefined;
  }
}

async function resolveManifestPath(options, io) {
  if (typeof options.manifestPath === "string") {
    return options.manifestPath;
  }

  if (typeof io.findLatestManifest === "function") {
    const found = await io.findLatestManifest(options.rootDir ?? DEFAULT_ROOT_DIR);
    if (found) {
      return found;
    }
  }

  throw new Error("Missing --manifest <path>.");
}

function createDefaultIo() {
  return {
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    stat,
    async findLatestManifest(rootDir) {
      const alphaDir = path.join(rootDir, ".skfiy-alpha");
      if (!existsSync(alphaDir)) {
        return undefined;
      }

      throw new Error("Missing --manifest <path>.");
    }
  };
}

function check(checks, id, ok, message) {
  checks.push({ id, ok: Boolean(ok), message });
}

function samePath(actual, expected) {
  return typeof actual === "string"
    && typeof expected === "string"
    && path.resolve(actual) === path.resolve(expected);
}

function readString(value) {
  return typeof value === "string" ? value : undefined;
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

export function createDogfoodVerifyHelpText() {
  return `Usage: npm run dogfood:verify -- --manifest <path> [options]

Validates that an alpha manifest references a coherent packaged-app dogfood evidence chain.

Options:
  --manifest <path>     Alpha manifest JSON from npm run alpha:artifact.
  --require-passed      Fail unless both Ghostty and native voice smoke results are passed.
  -h, --help            Show this help.
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const defaults = createDefaultDogfoodVerifyOptions(DEFAULT_ROOT_DIR);
    const options = parseDogfoodVerifyArgs(process.argv.slice(2), defaults);

    if (options.help) {
      process.stdout.write(createDogfoodVerifyHelpText(defaults));
    } else {
      const report = await verifyDogfoodArtifacts(options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (report.result !== "passed") {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
