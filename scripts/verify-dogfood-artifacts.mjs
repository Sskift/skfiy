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
const CHROME_PRODUCT_PATH = "renderer -> preload -> main -> CDP -> Chrome";
const FINDER_PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder";
const VOICE_PRODUCT_PATH = "renderer -> preload -> main -> helper -> native macOS Speech";
const ACCEPTED_UI_RESULTS = new Set(["passed", "no-onboarding"]);
const ACCEPTED_GHOSTTY_RESULTS = new Set(["passed", "blocked"]);
const ACCEPTED_CHROME_RESULTS = new Set(["passed", "blocked", "sensitive-paused"]);
const ACCEPTED_FINDER_RESULTS = new Set(["passed", "blocked"]);
const ACCEPTED_VOICE_RESULTS = new Set(["passed", "blocked", "no-transcript"]);
const REQUIRED_UI_PERMISSION_LABELS = ["屏幕录制", "辅助功能", "麦克风", "语音识别"];
const REQUIRED_UI_PERMISSION_SETTING_TARGETS = [
  { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
  { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" },
  { label: "麦克风", target: "microphone", buttonLabel: "打开麦克风设置" },
  { label: "语音识别", target: "speech-recognition", buttonLabel: "打开语音识别设置" }
];
const REQUIRED_CHROME_TEXT = "skfiy chrome smoke ready";
const REQUIRED_CHROME_FORM_TEXT = "skfiy agent@skfiy.test operator form submitted";
const REQUIRED_CHROME_FORM_SELECTORS = ["#name", "#email", "#role"];
const REQUIRED_FINDER_AFTER_TREE = ["Code/script.ts", "Documents/notes.pdf", "Images/photo.png"];
const CLIPBOARD_APPROVAL_RUNS = [
  { id: "clipboard-read-approval", command: "pbpaste" },
  { id: "clipboard-write-approval", command: "echo skfiy | pbcopy" }
];
const CLIPBOARD_RISK_MESSAGE = "Command can read or overwrite clipboard contents.";

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
  const chromeSmokeArtifactPath = readString(manifest?.chromeSmokeArtifactPath);
  const finderSmokeArtifactPath = readString(manifest?.finderSmokeArtifactPath);
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
    "manifest.chromeSmokeArtifactPath",
    typeof chromeSmokeArtifactPath === "string",
    "manifest chromeSmokeArtifactPath is required"
  );
  check(
    checks,
    "manifest.finderSmokeArtifactPath",
    typeof finderSmokeArtifactPath === "string",
    "manifest finderSmokeArtifactPath is required"
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
    "manifest.requiredDogfoodEvidence.permissionSettings",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Permission settings direct links"),
    "manifest must require permission settings direct-link evidence"
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
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chrome",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("npm run smoke:chrome -- --output <path>"),
    "manifest must require Chrome smoke evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finder",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("npm run smoke:finder -- --output <path>"),
    "manifest must require Finder smoke evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.actionVerification",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("action verification events when Computer Use passes"),
    "manifest must require Computer Use action verification evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.appPolicy",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Ghostty app policy settings"),
    "manifest must require Ghostty app policy evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.clipboardApproval",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("clipboard read/write approval runs"),
    "manifest must require clipboard read/write approval evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chromeAppPolicy",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome app policy settings"),
    "manifest must require Chrome app policy evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chromeExtraction",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome test-page extraction evidence"),
    "manifest must require Chrome extraction evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chromeSensitivePause",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome sensitive-page pause evidence"),
    "manifest must require Chrome sensitive-page pause evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chromeFormAction",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome form action evidence"),
    "manifest must require Chrome form action evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chromeFallback",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome screenshot fallback evidence"),
    "manifest must require Chrome screenshot fallback evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.chromeFallbackSwitch",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome fallback switching evidence"),
    "manifest must require Chrome fallback switching evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finderAppPolicy",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder app policy settings"),
    "manifest must require Finder app policy evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finderObservation",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder observe_app screenshot or permission-blocked evidence"),
    "manifest must require Finder observe_app evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finderSemanticObservation",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder semantic selection evidence"),
    "manifest must require Finder semantic selection evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finderOrganization",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder test-folder organization evidence"),
    "manifest must require Finder organization evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finderItemDragDrop",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder item drag/drop evidence"),
    "manifest must require Finder item drag/drop evidence"
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
  const chrome = chromeSmokeArtifactPath
    ? await readArtifactJson(chromeSmokeArtifactPath, "chrome", io, checks)
    : undefined;
  const finder = finderSmokeArtifactPath
    ? await readArtifactJson(finderSmokeArtifactPath, "finder", io, checks)
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

  if (chrome) {
    verifyChromeSmoke(chrome, chromeSmokeArtifactPath, options, checks);
  }

  if (finder) {
    verifyFinderSmoke(finder, finderSmokeArtifactPath, options, checks);
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
      && (!chromeSmokeArtifactPath || path.isAbsolute(chromeSmokeArtifactPath))
      && (!finderSmokeArtifactPath || path.isAbsolute(finderSmokeArtifactPath))
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
    check(
      checks,
      "ui.permissionSettings",
      hasRequiredPermissionSettingTargets(artifact.permissionSettingTargets),
      "UI smoke must include direct System Settings targets for Screen Recording, Accessibility, Microphone, and Speech Recognition"
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
    "ghostty.appPolicySettings",
    hasGhosttyAppPolicyEvidence(artifact.appPolicySettings),
    "Ghostty smoke must include Ghostty app policy settings evidence"
  );
  check(
    checks,
    "ghostty.clipboardApprovalRuns",
    hasRequiredGhosttyClipboardApprovalRuns(artifact.runs),
    "Ghostty matrix smoke must include pbpaste and pbcopy high-risk approval runs"
  );
  check(
    checks,
    "ghostty.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "Ghostty smoke must clean up skfiy app processes"
  );

  if (artifact.result === "passed") {
    check(
      checks,
      "ghostty.actionVerification",
      hasRequiredGhosttyActionVerification(artifact.events),
      "passed Ghostty smoke must include type_text and press_key action verification events"
    );
  }
}

function verifyChromeSmoke(artifact, expectedPath, options, checks) {
  check(
    checks,
    "chrome.artifactPath",
    samePath(artifact.artifactPath, expectedPath),
    "Chrome artifactPath must match manifest chromeSmokeArtifactPath"
  );
  check(
    checks,
    "chrome.result",
    ACCEPTED_CHROME_RESULTS.has(artifact.result),
    "Chrome smoke result must be passed, blocked, or sensitive-paused"
  );
  check(
    checks,
    "chrome.requirePassed",
    !options.requirePassed || artifact.result === "passed",
    "Chrome smoke must be passed when --require-passed is used"
  );
  check(
    checks,
    "chrome.appLaunchViaOpen",
    artifact.appLaunchViaOpen === true,
    "Chrome smoke must launch skfiy through open/LaunchServices"
  );
  check(
    checks,
    "chrome.chromeLaunchViaOpen",
    artifact.chromeLaunchViaOpen === true,
    "Chrome smoke must launch Chrome through open/LaunchServices"
  );
  check(
    checks,
    "chrome.runnerHasTmux",
    artifact.runnerHasTmux === false,
    "Chrome smoke must not run under tmux"
  );
  check(
    checks,
    "chrome.productPath",
    artifact.productPath === CHROME_PRODUCT_PATH,
    `Chrome smoke productPath must be ${CHROME_PRODUCT_PATH}`
  );
  check(
    checks,
    "chrome.appPolicySettings",
    hasChromeAppPolicyEvidence(artifact.appPolicySettings),
    "Chrome smoke must include Chrome app policy settings evidence"
  );
  check(
    checks,
    "chrome.approval",
    hasChromeApprovalEvidence(artifact.events),
    "Chrome smoke must include app policy approval evidence"
  );
  check(
    checks,
    "chrome.actionVerification",
    hasChromeActionVerification(artifact.events),
    "Chrome smoke must include navigate and extract_text verification events"
  );
  check(
    checks,
    "chrome.extractedText",
    typeof artifact.extractedText === "string" && artifact.extractedText.includes(REQUIRED_CHROME_TEXT),
    "Chrome smoke must include extracted test-page text"
  );
  check(
    checks,
    "chrome.sensitivePause",
    hasChromeSensitivePauseEvidence(artifact.sensitiveRun),
    "Chrome smoke must include a sensitive-page run that pauses before completion"
  );
  check(
    checks,
    "chrome.formAction",
    hasChromeFormActionEvidence(artifact.formRun),
    "Chrome smoke must include a form fill/click run with action verification"
  );
  check(
    checks,
    "chrome.fallback",
    hasChromeFallbackEvidence(artifact.fallbackRun),
    "Chrome smoke must include screenshot fallback evidence for no-CDP mode"
  );
  check(
    checks,
    "chrome.fallbackSwitch",
    hasChromeFallbackSwitchEvidence(artifact.fallbackSwitchRun),
    "Chrome smoke must include configured-CDP failure switching evidence for screenshot fallback mode"
  );
  check(
    checks,
    "chrome.chromeProcessesAfterCleanup",
    isEmptyArray(artifact.chromeProcessesAfterCleanup),
    "Chrome smoke must clean up its temporary Chrome process"
  );
  check(
    checks,
    "chrome.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "Chrome smoke must clean up skfiy app processes"
  );
}

function verifyFinderSmoke(artifact, expectedPath, options, checks) {
  check(
    checks,
    "finder.artifactPath",
    samePath(artifact.artifactPath, expectedPath),
    "Finder artifactPath must match manifest finderSmokeArtifactPath"
  );
  check(
    checks,
    "finder.result",
    ACCEPTED_FINDER_RESULTS.has(artifact.result),
    "Finder smoke result must be passed or blocked"
  );
  check(
    checks,
    "finder.requirePassed",
    !options.requirePassed || artifact.result === "passed",
    "Finder smoke must be passed when --require-passed is used"
  );
  check(
    checks,
    "finder.appLaunchViaOpen",
    artifact.appLaunchViaOpen === true,
    "Finder smoke must launch skfiy through open/LaunchServices"
  );
  check(
    checks,
    "finder.runnerHasTmux",
    artifact.runnerHasTmux === false,
    "Finder smoke must not run under tmux"
  );
  check(
    checks,
    "finder.productPath",
    artifact.productPath === FINDER_PRODUCT_PATH,
    `Finder smoke productPath must be ${FINDER_PRODUCT_PATH}`
  );
  check(
    checks,
    "finder.appPolicySettings",
    hasFinderAppPolicyEvidence(artifact.appPolicySettings),
    "Finder smoke must include Finder app policy settings evidence"
  );
  check(
    checks,
    "finder.approval",
    hasFinderApprovalEvidence(artifact.events),
    "Finder smoke must include app policy approval evidence"
  );
  check(
    checks,
    "finder.observation",
    hasFinderObservationEvidence(artifact.finderObservation, artifact.result),
    "Finder smoke must include observe_app screenshot evidence or a permission-blocked observation"
  );
  check(
    checks,
    "finder.semanticObservation",
    hasFinderSemanticObservationEvidence(artifact.finderSemanticObservation, artifact.result),
    "Finder smoke must include Finder semantic selection evidence or a permission-blocked semantic observation"
  );
  check(
    checks,
    "finder.currentFolderTarget",
    hasCurrentFinderFolderTargetEvidence(artifact),
    "Finder current-folder smoke must prove semantic targetPath matches the prepared fixture root"
  );
  check(
    checks,
    "finder.selectedFolderTarget",
    hasSelectedFinderFolderTargetEvidence(artifact),
    "Finder selected-folder smoke must prove semantic selectedItems contains the prepared fixture root"
  );
  check(
    checks,
    "finder.actionVerification",
    hasFinderOrganizationActionVerification(artifact.events),
    "Finder smoke must include create_folder and move_file verification events"
  );
  check(
    checks,
    "finder.itemDragDrop",
    hasFinderItemDragDropEvidence(artifact.finderItemDragDrop, artifact.result)
      && (
        artifact.finderItemDragDrop?.result === "blocked"
        || hasFinderItemDragDropActionEvidence(artifact.events, artifact.result)
      ),
    "Finder smoke must include item drag/drop evidence or a permission-blocked layout/drag reason"
  );
  check(
    checks,
    "finder.beforeTree",
    hasFinderBeforeTree(artifact.beforeTree),
    "Finder smoke must include the unorganized test-folder before tree"
  );
  check(
    checks,
    "finder.afterTree",
    hasFinderAfterTree(artifact.afterTree),
    "Finder smoke must include the organized test-folder after tree"
  );
  check(
    checks,
    "finder.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "Finder smoke must clean up skfiy app processes"
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

function hasRequiredPermissionSettingTargets(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  return REQUIRED_UI_PERMISSION_SETTING_TARGETS.every((required) =>
    value.some((target) =>
      target?.label === required.label
      && target?.target === required.target
      && target?.buttonLabel === required.buttonLabel
    )
  );
}

function hasBlockingPermission(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return true;
  }

  return Object.values(permissions).some((status) =>
    status?.state === "denied" || status?.state === "not-determined"
  );
}

function hasRequiredGhosttyActionVerification(events) {
  return hasVerifiedGhosttyAction(events, "type_text")
    && hasVerifiedGhosttyAction(events, "press_key");
}

function hasGhosttyAppPolicyEvidence(value) {
  if (!value || !Array.isArray(value.apps)) {
    return false;
  }

  return value.apps.some((app) =>
    app
      && app.bundleId === "com.mitchellh.ghostty"
      && typeof app.name === "string"
      && (app.policy === "allow" || app.policy === "ask" || app.policy === "deny")
  );
}

function hasChromeAppPolicyEvidence(value) {
  if (!value || !Array.isArray(value.apps)) {
    return false;
  }

  return value.apps.some((app) =>
    app
      && app.bundleId === "com.google.Chrome"
      && typeof app.name === "string"
      && (app.policy === "allow" || app.policy === "ask" || app.policy === "deny")
  );
}

function hasChromeApprovalEvidence(events) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) =>
    event?.status === "approval_required"
      && typeof event.message === "string"
      && event.message.includes("Chrome requires approval by app policy")
  );
}

function hasChromeActionVerification(events) {
  return hasTaskEventMessage(events, "Verified navigate:")
    && hasTaskEventMessage(events, "Verified extract_text:");
}

function hasChromeSensitivePauseEvidence(value) {
  return Boolean(value)
    && value.result === "sensitive-paused"
    && Array.isArray(value.events)
    && hasTaskEventMessage(value.events, "Verified navigate:")
    && hasTaskEventMessage(value.events, "Verification failed (sensitive): Sensitive UI text is visible.");
}

function hasChromeFormActionEvidence(value) {
  return Boolean(value)
    && value.result === "passed"
    && typeof value.extractedText === "string"
    && value.extractedText.includes(REQUIRED_CHROME_FORM_TEXT)
    && hasChromeFormFieldEvidence(value)
    && Array.isArray(value.events)
    && hasTaskEventMessage(value.events, "Verified navigate:")
    && REQUIRED_CHROME_FORM_SELECTORS.every((selector) =>
      hasTaskEventMessage(value.events, `Verified fill_selector: Filled ${selector}.`)
    )
    && hasTaskEventMessage(value.events, "Verified click_selector:")
    && hasTaskEventMessage(value.events, "Verified extract_text:");
}

function hasChromeFallbackEvidence(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (
    value.productPath !== "renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback"
    || value.appLaunchViaOpen !== true
    || value.runnerHasTmux !== false
    || !Array.isArray(value.events)
  ) {
    return false;
  }

  if (value.result === "fallback-observed") {
    return value.events.some((event) =>
      event?.status === "observing"
        && event?.replayRecord?.stage === "before"
        && event.replayRecord.bundleId === "com.google.Chrome"
        && typeof event.replayRecord.screenshotPath === "string"
        && event.replayRecord.screenshotPath.length > 0
    ) && value.events.some((event) =>
      event?.status === "needs_confirmation"
        && typeof event.message === "string"
        && event.message.includes("screenshot fallback observation captured")
    );
  }

  if (value.result === "fallback-blocked") {
    return value.events.some((event) =>
      (event?.status === "needs_confirmation" || event?.status === "failed")
        && typeof event.message === "string"
        && (
          event.message.includes("screenshot fallback failed")
          || event.message.includes("screenshot fallback activation failed")
          || event.message.includes("screenshot fallback did not return app state")
          || event.message.includes("screenshot fallback is unavailable")
          || event.message.includes("Screen Recording permission is required")
          || event.message.includes("Accessibility permission is required")
        )
    );
  }

  return false;
}

function hasChromeFallbackSwitchEvidence(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (
    value.productPath !== "renderer -> preload -> main -> CDP failure -> helper observe_app -> Chrome screenshot fallback"
    || value.appLaunchViaOpen !== true
    || value.runnerHasTmux !== false
    || typeof value.configuredEndpoint !== "string"
    || value.configuredEndpoint.length === 0
    || !Array.isArray(value.events)
    || !value.events.some((event) =>
      event?.status === "executing"
        && typeof event.message === "string"
        && /Switching Chrome control from cdp to screenshot_fallback/i.test(event.message)
    )
  ) {
    return false;
  }

  if (value.result === "fallback-switched-observed") {
    return value.events.some((event) =>
      event?.status === "observing"
        && event?.replayRecord?.stage === "before"
        && event.replayRecord.bundleId === "com.google.Chrome"
        && typeof event.replayRecord.screenshotPath === "string"
        && event.replayRecord.screenshotPath.length > 0
    ) && value.events.some((event) =>
      event?.status === "needs_confirmation"
        && typeof event.message === "string"
        && event.message.includes("screenshot fallback observation captured")
    );
  }

  if (value.result === "fallback-switched-blocked") {
    return value.events.some((event) =>
      (event?.status === "needs_confirmation" || event?.status === "failed")
        && typeof event.message === "string"
        && (
          event.message.includes("screenshot fallback failed")
          || event.message.includes("screenshot fallback activation failed")
          || event.message.includes("screenshot fallback did not return app state")
          || event.message.includes("screenshot fallback is unavailable")
          || event.message.includes("Screen Recording permission is required")
          || event.message.includes("Accessibility permission is required")
        )
    );
  }

  return false;
}

function hasChromeFormFieldEvidence(value) {
  if (!Array.isArray(value?.fields)) {
    return false;
  }

  const selectors = new Set(value.fields
    .map((field) => field?.selector)
    .filter((selector) => typeof selector === "string"));
  return REQUIRED_CHROME_FORM_SELECTORS.every((selector) => selectors.has(selector));
}

function hasFinderAppPolicyEvidence(value) {
  if (!value || !Array.isArray(value.apps)) {
    return false;
  }

  return value.apps.some((app) =>
    app
      && app.bundleId === "com.apple.finder"
      && typeof app.name === "string"
      && (app.policy === "allow" || app.policy === "ask" || app.policy === "deny")
  );
}

function hasFinderApprovalEvidence(events) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) =>
    event?.status === "approval_required"
      && typeof event.message === "string"
      && event.message.includes("Finder requires approval by app policy")
  );
}

function hasFinderObservationEvidence(value, result) {
  if (result === "passed") {
    return hasPassedFinderObservation(value);
  }

  if (result === "blocked") {
    return hasPassedFinderObservation(value) || hasPermissionBlockedFinderObservation(value);
  }

  return false;
}

function hasFinderSemanticObservationEvidence(value, result) {
  if (result === "passed") {
    return hasPassedFinderSemanticObservation(value);
  }

  if (result === "blocked") {
    return hasPassedFinderSemanticObservation(value) || hasPermissionBlockedFinderSemanticObservation(value);
  }

  return false;
}

function hasPassedFinderObservation(value) {
  return Boolean(value)
    && value.result === "passed"
    && typeof value.screenshotPath === "string"
    && value.screenshotPath.length > 0
    && value.frontmostBundleId === "com.apple.finder";
}

function hasPassedFinderSemanticObservation(value) {
  return Boolean(value)
    && value.result === "passed"
    && value.source === "finder-applescript"
    && value.frontmostBundleId === "com.apple.finder"
    && Number.isFinite(value.selectedCount);
}

function hasCurrentFinderFolderTargetEvidence(artifact) {
  if (artifact?.targetMode !== "current-finder-folder") {
    return true;
  }

  if (artifact.result === "blocked") {
    return true;
  }

  return typeof artifact.fixtureRoot === "string"
    && typeof artifact.finderSemanticObservation?.targetPath === "string"
    && path.resolve(artifact.finderSemanticObservation.targetPath) === path.resolve(artifact.fixtureRoot);
}

function hasSelectedFinderFolderTargetEvidence(artifact) {
  if (artifact?.targetMode !== "selected-finder-folder") {
    return true;
  }

  if (artifact.result === "blocked") {
    return true;
  }

  return typeof artifact.fixtureRoot === "string"
    && Array.isArray(artifact.finderSemanticObservation?.selectedItems)
    && artifact.finderSemanticObservation.selectedItems.some((item) => (
      item?.kind === "directory"
      && typeof item.path === "string"
      && path.resolve(item.path) === path.resolve(artifact.fixtureRoot)
    ));
}

function hasPermissionBlockedFinderObservation(value) {
  return Boolean(value)
    && value.result === "blocked"
    && typeof value.reason === "string"
    && isPermissionBlockedMessage(value.reason);
}

function hasPermissionBlockedFinderSemanticObservation(value) {
  return Boolean(value)
    && value.result === "blocked"
    && typeof value.reason === "string"
    && isPermissionBlockedMessage(value.reason);
}

function isPermissionBlockedMessage(message) {
  const normalized = message.toLowerCase();
  return normalized.includes("permission")
    && (
      normalized.includes("accessibility")
      || normalized.includes("screen recording")
      || normalized.includes("automation")
    );
}

function hasFinderOrganizationActionVerification(events) {
  return hasTaskEventMessage(events, "Verified create_folder:")
    && hasTaskEventMessage(events, "Verified move_file:");
}

function hasFinderDragProbeEvidence(value, result) {
  if (result === "passed") {
    return hasPassedFinderDragProbe(value);
  }

  if (result === "blocked") {
    return hasPassedFinderDragProbe(value) || hasPermissionBlockedFinderDragProbe(value);
  }

  return false;
}

function hasPassedFinderDragProbe(value) {
  return Boolean(value)
    && value.result === "passed"
    && value.source === "finder-hid-drag"
    && value.frontmostBundleId === "com.apple.finder";
}

function hasPermissionBlockedFinderDragProbe(value) {
  return Boolean(value)
    && value.result === "blocked"
    && typeof value.reason === "string"
    && isPermissionBlockedMessage(value.reason);
}

function hasFinderItemDragDropEvidence(value, result) {
  if (result === "passed") {
    return hasPassedFinderItemDragDrop(value);
  }

  if (result === "blocked") {
    return hasPassedFinderItemDragDrop(value) || hasPermissionBlockedFinderItemDragDrop(value);
  }

  return false;
}

function hasPassedFinderItemDragDrop(value) {
  return Boolean(value)
    && value.result === "passed"
    && value.source === "finder-applescript-layout+hid-drag"
    && value.frontmostBundleId === "com.apple.finder"
    && value.movedItem === "photo.png"
    && value.targetItem === "Images";
}

function hasPermissionBlockedFinderItemDragDrop(value) {
  return Boolean(value)
    && value.result === "blocked"
    && typeof value.reason === "string"
    && isPermissionBlockedMessage(value.reason);
}

function hasFinderDragProbeActionEvidence(events, result) {
  if (hasTaskEventMessage(events, "Verified drag:")) {
    return true;
  }

  return result === "blocked"
    && Array.isArray(events)
    && events.some((event) => (
      typeof event?.message === "string"
      && event.message.includes("Verification failed (drag):")
      && isPermissionBlockedMessage(event.message)
    ));
}

function hasFinderItemDragDropActionEvidence(events, result) {
  if (hasTaskEventMessage(events, "Verified item_drag_drop:")) {
    return true;
  }

  return result === "blocked"
    && Array.isArray(events)
    && events.some((event) => (
      typeof event?.message === "string"
      && (
        event.message.includes("Verification failed (layout):")
        || event.message.includes("Verification failed (drag):")
      )
      && isPermissionBlockedMessage(event.message)
    ));
}

function hasFinderBeforeTree(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  const entries = new Set(value);
  return entries.has("photo.png")
    && entries.has("notes.pdf")
    && entries.has("script.ts");
}

function hasFinderAfterTree(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  const entries = new Set(value);
  return REQUIRED_FINDER_AFTER_TREE.every((entry) => entries.has(entry))
    && !entries.has("photo.png")
    && !entries.has("notes.pdf")
    && !entries.has("script.ts");
}

function hasTaskEventMessage(events, text) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) =>
    typeof event?.message === "string" && event.message.includes(text)
  );
}

function hasRequiredGhosttyClipboardApprovalRuns(runs) {
  if (!Array.isArray(runs)) {
    return false;
  }

  return CLIPBOARD_APPROVAL_RUNS.every((requiredRun) =>
    runs.some((run) => isClipboardApprovalRun(run, requiredRun))
  );
}

function isClipboardApprovalRun(run, requiredRun) {
  return run?.id === requiredRun.id
    && run.result === "needs-user-confirmation"
    && Array.isArray(run.events)
    && run.events.some((event) =>
      event?.status === "approval_required"
      && event.command === requiredRun.command
      && typeof event.message === "string"
      && event.message.includes(CLIPBOARD_RISK_MESSAGE)
    )
    && run.events.some((event) =>
      event?.status === "executing"
      && typeof event.message === "string"
      && event.message.includes(`Risk high: ${CLIPBOARD_RISK_MESSAGE}`)
    );
}

function hasVerifiedGhosttyAction(events, actionType) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) => {
    const message = typeof event?.message === "string" ? event.message : "";
    return event?.status === "executing"
      && message.includes(`Verified ${actionType}:`)
      && message.toLowerCase().includes("accepted");
  });
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
