#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const execFileAsync = promisify(execFile);
const UI_PRODUCT_PATH = "LaunchServices -> renderer DOM -> React permission onboarding";
const GHOSTTY_PRODUCT_PATH = "renderer -> preload -> main -> helper -> Ghostty";
const VOICE_PRODUCT_PATH = "renderer -> preload -> main -> helper -> native macOS Speech";
const ACCEPTED_UI_RESULTS = new Set(["passed", "no-onboarding"]);
const ACCEPTED_GHOSTTY_RESULTS = new Set(["passed", "blocked"]);
const ACCEPTED_VOICE_RESULTS = new Set(["passed", "blocked", "no-transcript"]);
const REQUIRED_UI_PERMISSION_LABELS = ["屏幕录制", "辅助功能", "麦克风", "语音识别"];

export function createDefaultDogfoodVerifyOptions(rootDir) {
  return {
    manifestPath: undefined,
    rootDir,
    requirePassed: false,
    requireCurrentHead: false,
    currentHeadSha: undefined,
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
      case "--require-current-head":
        options.requireCurrentHead = true;
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
  const uiSmokeArtifactPath = readString(manifest?.uiSmokeArtifactPath);
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
    "manifest.uiSmokeArtifactPath",
    typeof uiSmokeArtifactPath === "string",
    "manifest uiSmokeArtifactPath is required"
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
    "manifest.requiredDogfoodEvidence.ui",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("npm run smoke:ui -- --output <path>"),
    "manifest must require UI smoke evidence"
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
  await verifyCurrentHead(manifest, options, io, checks);

  if (zipPath) {
    await verifyZip(zipPath, manifest, io, checks);
  }

  const ui = uiSmokeArtifactPath
    ? await readArtifactJson(uiSmokeArtifactPath, "ui", io, checks)
    : undefined;
  const ghostty = smokeArtifactPath
    ? await readArtifactJson(smokeArtifactPath, "ghostty", io, checks)
    : undefined;
  const voice = voiceSmokeArtifactPath
    ? await readArtifactJson(voiceSmokeArtifactPath, "voice", io, checks)
    : undefined;

  if (ui) {
    verifyUiSmoke(ui, uiSmokeArtifactPath, options, checks);
  }

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
      && (!uiSmokeArtifactPath || path.isAbsolute(uiSmokeArtifactPath))
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

function verifyUiSmoke(artifact, expectedPath, options, checks) {
  check(
    checks,
    "ui.artifactPath",
    samePath(artifact.artifactPath, expectedPath),
    "UI artifactPath must match manifest uiSmokeArtifactPath"
  );
  check(
    checks,
    "ui.result",
    ACCEPTED_UI_RESULTS.has(artifact.result),
    "UI smoke result must be passed or no-onboarding"
  );
  check(
    checks,
    "ui.requirePassed",
    !options.requirePassed || ACCEPTED_UI_RESULTS.has(artifact.result),
    "UI smoke must be passed or no-onboarding when --require-passed is used"
  );
  check(
    checks,
    "ui.appLaunchViaOpen",
    artifact.appLaunchViaOpen === true,
    "UI smoke must launch skfiy through open/LaunchServices"
  );
  check(
    checks,
    "ui.runnerHasTmux",
    artifact.runnerHasTmux === false,
    "UI smoke must not run under tmux"
  );
  check(
    checks,
    "ui.productPath",
    artifact.productPath === UI_PRODUCT_PATH,
    `UI smoke productPath must be ${UI_PRODUCT_PATH}`
  );
  check(
    checks,
    "ui.petClicked",
    artifact.petClicked === true,
    "UI smoke must click the real desktop pet"
  );

  if (artifact.result === "passed") {
    check(
      checks,
      "ui.onboardingVisible",
      artifact.onboardingVisible === true,
      "UI smoke passed result must show permission onboarding"
    );
    check(
      checks,
      "ui.permissionRows",
      hasRequiredPermissionRows(artifact.permissionRows),
      "UI smoke must include Screen Recording, Accessibility, Microphone, and Speech Recognition rows"
    );
  } else {
    check(
      checks,
      "ui.noOnboardingPermissions",
      !hasBlockingPermission(artifact.permissions),
      "UI smoke no-onboarding result requires all permission states to be non-blocking"
    );
  }

  check(
    checks,
    "ui.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "UI smoke must clean up skfiy app processes"
  );
}

async function verifyCurrentHead(manifest, options, io, checks) {
  if (!options.requireCurrentHead) {
    return;
  }

  const currentHeadSha = typeof options.currentHeadSha === "string"
    ? options.currentHeadSha
    : await io.readCurrentHead(options.rootDir ?? DEFAULT_ROOT_DIR);

  check(
    checks,
    "manifest.currentHead",
    typeof manifest?.commitSha === "string" && manifest.commitSha === currentHeadSha,
    `manifest commitSha must match current HEAD ${currentHeadSha}`
  );
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
    "voice.speechStatus",
    isNativeSpeechStatus(artifact.speechStatus),
    "voice smoke must include structured native speech status"
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
    async readCurrentHead(rootDir) {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootDir });
      return String(stdout).trim();
    },
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

function isNativeSpeechStatus(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.locale === "string"
    && typeof value.recognizerAvailable === "boolean"
    && isPermissionStatus(value.speechRecognition)
    && isPermissionStatus(value.microphone);
}

function hasRequiredPermissionRows(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  const labels = new Set(value.map((row) => row?.label).filter(Boolean));
  return REQUIRED_UI_PERMISSION_LABELS.every((label) => labels.has(label));
}

function hasBlockingPermission(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return true;
  }

  return Object.values(permissions).some((status) =>
    status?.state === "denied" || status?.state === "not-determined"
  );
}

function isPermissionStatus(value) {
  return Boolean(value)
    && typeof value === "object"
    && (
      value.state === "granted"
      || value.state === "denied"
      || value.state === "not-determined"
      || value.state === "unknown"
    );
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
  --require-current-head
                       Fail unless manifest commitSha matches the current git HEAD.
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
