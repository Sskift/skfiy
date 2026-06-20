#!/usr/bin/env node
import { createHash } from "node:crypto";
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
const CHROME_NATIVE_HOST_BRIDGE_PRODUCT_PATH = "dist/skfiy -> Chrome Native Messaging heartbeat";
const FINDER_PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> fs -> Finder";
const FINDER_ITEM_DRAG_DROP_PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder";
const FINDER_DRAG_PROBE_PRODUCT_PATH = "renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder";
const DOUBAO_EXTERNAL_VOICE_PRODUCT_PATH = "renderer -> preload -> main -> external Doubao Input Method -> text bridge -> Computer Use";
const NATIVE_MACOS_VOICE_PRODUCT_PATH = "renderer -> preload -> main -> helper -> native macOS Speech";
const MONEY_RUN_PRODUCT_PATH = "LaunchServices -> renderer -> preload -> main -> tmux supervision -> tmux read-only probes";
const ACCEPTED_UI_RESULTS = new Set(["passed", "no-onboarding"]);
const ACCEPTED_GHOSTTY_RESULTS = new Set(["passed", "blocked"]);
const ACCEPTED_CHROME_RESULTS = new Set(["passed", "blocked", "sensitive-paused"]);
const ACCEPTED_FINDER_RESULTS = new Set(["passed", "blocked"]);
const ACCEPTED_VOICE_RESULTS = new Set(["passed", "blocked", "no-transcript"]);
const REQUIRED_COMPUTER_USE_PERMISSION_KEYS = ["screenRecording", "accessibility"];
const REQUIRED_UI_PERMISSION_LABELS = ["屏幕录制", "辅助功能", "麦克风", "语音识别"];
const REQUIRED_UI_PERMISSION_SETTING_TARGETS = [
  { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
  { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" },
  { label: "麦克风", target: "microphone", buttonLabel: "打开麦克风设置" },
  { label: "语音识别", target: "speech-recognition", buttonLabel: "打开语音识别设置" }
];
const REQUIRED_STOP_TURN_HOTKEY = {
  accelerator: "Control+Alt+Shift+Esc",
  label: "Ctrl Opt Shift Esc"
};
const REQUIRED_CHROME_TEXT = "skfiy chrome smoke ready";
const REQUIRED_CHROME_FORM_TEXT = "skfiy agent@skfiy.test operator form submitted";
const REQUIRED_CHROME_FORM_SELECTORS = ["#name", "#email", "#role"];
const REQUIRED_FINDER_AFTER_TREE = ["Code/script.ts", "Documents/notes.pdf", "Images/photo.png"];
const CLIPBOARD_APPROVAL_RUNS = [
  { id: "clipboard-read-approval", command: "pbpaste" },
  { id: "clipboard-write-approval", command: "echo skfiy | pbcopy" }
];
const CLIPBOARD_RISK_MESSAGE = "Command can read or overwrite clipboard contents.";
const NON_COMPUTER_USE_ROUTE_GUARD_RUNS = [
  {
    id: "chat-question-route-guard",
    result: "answered-without-computer-use",
    eventStatus: "completed",
    messageIncludes: "skfiy"
  },
  {
    id: "unsupported-desktop-route-guard",
    result: "needs-user-confirmation",
    eventStatus: "needs_confirmation",
    messageIncludes: "No supported desktop control route matched"
  }
];

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
  const moneyRunSmokeArtifactPath = readString(manifest?.moneyRunSmokeArtifactPath);

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
    "manifest.requiredDogfoodEvidence.stopTurnHotkey",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Panic stop runtime hotkey evidence"),
    "manifest must require panic stop runtime hotkey evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.stopTurnBehavior",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Panic stop product-path behavior evidence"),
    "manifest must require panic stop product-path behavior evidence"
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
    "manifest must require voice smoke evidence"
  );
  if (moneyRunSmokeArtifactPath) {
    check(
      checks,
      "manifest.requiredDogfoodEvidence.moneyRun",
      Array.isArray(manifest?.requiredDogfoodEvidence)
        && manifest.requiredDogfoodEvidence.includes("npm run smoke:money-run -- --json-output <path>"),
      "manifest must require money-run supervision smoke evidence"
    );
    check(
      checks,
      "manifest.requiredDogfoodEvidence.moneyRunSupervision",
      Array.isArray(manifest?.requiredDogfoodEvidence)
        && manifest.requiredDogfoodEvidence.includes("Long-horizon money-run supervision evidence"),
      "manifest must require long-horizon money-run supervision evidence"
    );
  }
  check(
    checks,
    "manifest.requiredDogfoodEvidence.voiceTranscriptTask",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("External Doubao voice transcript-to-task evidence"),
    "manifest must require external Doubao voice transcript-to-task evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.voiceTurnReplay",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("External Doubao voice Ghostty turn replay evidence"),
    "manifest must require external Doubao voice Ghostty turn replay evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.voiceNoTranscriptCancellation",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("External Doubao voice no-transcript/cancellation evidence"),
    "manifest must require external Doubao voice no-transcript/cancellation evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.issueSource",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Accepted GitHub dogfood issue source"),
    "manifest must require accepted GitHub dogfood issue source evidence"
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
    "manifest.requiredDogfoodEvidence.chromeNativeHostBridge",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome Native Messaging heartbeat evidence"),
    "manifest must require Chrome Native Messaging heartbeat evidence"
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
    "manifest.requiredDogfoodEvidence.nonComputerUseRouteGuards",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("non-terminal voice route guard runs"),
    "manifest must require non-terminal voice route guard evidence"
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
    "manifest.requiredDogfoodEvidence.chromeCurrentPage",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Chrome current-page observation evidence"),
    "manifest must require Chrome current-page observation evidence"
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
    "manifest.requiredDogfoodEvidence.finderPlanPreview",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder plan preview evidence"),
    "manifest must require Finder plan preview evidence"
  );
  check(
    checks,
    "manifest.requiredDogfoodEvidence.finderPlanConfirmation",
    Array.isArray(manifest?.requiredDogfoodEvidence)
      && manifest.requiredDogfoodEvidence.includes("Finder plan confirmation evidence"),
    "manifest must require Finder plan confirmation evidence"
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
  verifyCurrentAlphaSmokeArtifactPaths({
    manifest,
    uiSmokeArtifactPath,
    smokeArtifactPath,
    chromeSmokeArtifactPath,
    finderSmokeArtifactPath,
    voiceSmokeArtifactPath,
    moneyRunSmokeArtifactPath
  }, checks);

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
  const moneyRun = moneyRunSmokeArtifactPath
    ? await readArtifactJson(moneyRunSmokeArtifactPath, "moneyRun", io, checks)
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

  if (moneyRun) {
    verifyMoneyRunSmoke(moneyRun, moneyRunSmokeArtifactPath, checks);
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
      && (!voiceSmokeArtifactPath || path.isAbsolute(voiceSmokeArtifactPath))
      && (!moneyRunSmokeArtifactPath || path.isAbsolute(moneyRunSmokeArtifactPath)),
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
  check(
    checks,
    "ui.petDrag",
    hasPetDragEvidence(artifact.petDrag),
    "UI smoke must drag the real desktop pet upward and suppress the click after drag"
  );
  check(
    checks,
    "ui.stopTurnHotkey",
    hasStopTurnHotkeyEvidence(artifact.runtimeStatus?.stopTurnHotkey),
    "UI smoke must record the registered panic stop hotkey from runtimeStatus.stopTurnHotkey"
  );
  check(
    checks,
    "ui.stopTurnBehavior",
    hasStopTurnBehaviorEvidence(artifact.stopTurnBehavior),
    "UI smoke must prove stop-turn behavior by returning an approval_required task to idle"
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
      "UI smoke must include Screen Recording and Accessibility rows for the default external Doubao path"
    );
    check(
      checks,
      "ui.permissionSettings",
      hasRequiredPermissionSettingTargets(artifact.permissionSettingTargets),
      "UI smoke must include direct System Settings targets for Screen Recording and Accessibility"
    );
  } else {
    check(
      checks,
      "ui.noOnboardingPermissions",
      !hasBlockingPermission(artifact.permissions),
      "UI smoke no-onboarding result requires Screen Recording and Accessibility to be non-blocking"
    );
    check(
      checks,
      "ui.desktopSessionDiagnostics",
      hasDesktopSessionDiagnostics(artifact.desktopSessionDiagnostics),
      "UI smoke no-onboarding result must include structured desktop-session diagnostics"
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
  const desktopPreflightBlocked = hasDesktopPreflightBlockedEvidence(artifact);

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
    desktopPreflightBlocked || hasGhosttyAppPolicyEvidence(artifact.appPolicySettings),
    "Ghostty smoke must include Ghostty app policy settings evidence"
  );
  check(
    checks,
    "ghostty.clipboardApprovalRuns",
    desktopPreflightBlocked || hasRequiredGhosttyClipboardApprovalRuns(artifact.runs),
    "Ghostty matrix smoke must include pbpaste and pbcopy high-risk approval runs"
  );
  check(
    checks,
    "ghostty.nonComputerUseRouteGuards",
    desktopPreflightBlocked || hasRequiredGhosttyNonComputerUseRouteGuardRuns(artifact.runs),
    "Ghostty matrix smoke must include non-terminal voice route guard runs"
  );
  check(
    checks,
    "ghostty.desktopPreflight",
    !artifact.desktopPreflight || desktopPreflightBlocked,
    "Ghostty blocked desktop preflight must prove loginwindow/frontmost session is not controllable"
  );
  check(
    checks,
    "ghostty.processesAfterCleanup",
    desktopPreflightBlocked || isEmptyArray(artifact.processesAfterCleanup),
    "Ghostty smoke must clean up skfiy app processes"
  );

  if (artifact.result === "passed") {
    check(
      checks,
      "ghostty.screenshots",
      hasRequiredGhosttyScreenshots(artifact.screenshots),
      "passed Ghostty smoke must include non-empty before and after screenshot evidence"
    );
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
    "chrome.nativeHostBridge",
    hasChromeNativeHostBridgeEvidence(artifact.nativeHostBridgeRun),
    "Chrome smoke must include packaged Native Messaging heartbeat evidence"
  );
  check(
    checks,
    "chrome.extractedText",
    typeof artifact.extractedText === "string" && artifact.extractedText.includes(REQUIRED_CHROME_TEXT),
    "Chrome smoke must include extracted test-page text"
  );
  check(
    checks,
    "chrome.currentPage",
    hasChromeCurrentPageEvidence(artifact.currentPageRun),
    "Chrome smoke must include a current-page observation run without navigation"
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
  const desktopPreflightBlocked = hasDesktopPreflightBlockedEvidence(artifact);
  const permissionBlocked = desktopPreflightBlocked || hasPermissionBlockedFinderSmoke(artifact);

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
    artifact.productPath === readExpectedFinderProductPath(artifact.targetMode),
    `Finder smoke productPath must be ${readExpectedFinderProductPath(artifact.targetMode)}`
  );
  check(
    checks,
    "finder.appPolicySettings",
    desktopPreflightBlocked || hasFinderAppPolicyEvidence(artifact.appPolicySettings),
    "Finder smoke must include Finder app policy settings evidence"
  );
  check(
    checks,
    "finder.approval",
    desktopPreflightBlocked || hasFinderApprovalEvidence(artifact.events),
    "Finder smoke must include app policy approval evidence"
  );
  check(
    checks,
    "finder.observation",
    desktopPreflightBlocked || hasFinderObservationEvidence(artifact.finderObservation, artifact.result),
    "Finder smoke must include observe_app screenshot evidence or a permission-blocked observation"
  );
  check(
    checks,
    "finder.semanticObservation",
    desktopPreflightBlocked || hasFinderSemanticObservationEvidence(artifact.finderSemanticObservation, artifact.result),
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
    "finder.planPreview",
    hasFinderPlanPreviewEvidence(
      artifact.finderPlanPreview,
      artifact.result,
      artifact.fixtureRoot,
      artifact.targetMode,
      permissionBlocked
    ),
    "Finder smoke must include a pre-execution plan preview with no destructive operations"
  );
  check(
    checks,
    "finder.planConfirmation",
    hasFinderPlanConfirmationEvidence(artifact.finderPlanConfirmation, artifact.result, artifact.targetMode),
    "Finder current/selected folder smoke must include second-stage plan confirmation evidence"
  );
  check(
    checks,
    "finder.actionVerification",
    permissionBlocked || hasFinderOrganizationActionVerification(artifact.events),
    "Finder smoke must include create_folder and move_file verification events"
  );
  check(
    checks,
    "finder.itemDragDrop",
    desktopPreflightBlocked || (
      hasFinderItemDragDropEvidence(artifact.finderItemDragDrop, artifact.result)
      && (
        artifact.finderItemDragDrop?.result === "blocked"
        || hasFinderItemDragDropActionEvidence(artifact.events, artifact.result)
      )
    ),
    "Finder smoke must include item drag/drop evidence or a permission-blocked layout/drag reason"
  );
  check(
    checks,
    "finder.beforeTree",
    desktopPreflightBlocked || hasFinderBeforeTree(artifact.beforeTree),
    "Finder smoke must include the unorganized test-folder before tree"
  );
  check(
    checks,
    "finder.afterTree",
    permissionBlocked || hasFinderAfterTree(artifact.afterTree),
    "Finder smoke must include the organized test-folder after tree"
  );
  check(
    checks,
    "finder.processesAfterCleanup",
    desktopPreflightBlocked || isEmptyArray(artifact.processesAfterCleanup),
    "Finder smoke must clean up skfiy app processes"
  );
  check(
    checks,
    "finder.desktopPreflight",
    !artifact.desktopPreflight || desktopPreflightBlocked,
    "Finder blocked desktop preflight must prove loginwindow/frontmost session is not controllable"
  );
}

function verifyVoiceSmoke(artifact, expectedPath, options, checks) {
  const provider = readVoiceProvider(artifact);
  const expectedProductPath = readExpectedVoiceProductPath(provider);
  const desktopPreflightBlocked = hasDesktopPreflightBlockedEvidence(artifact);

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
    artifact.productPath === expectedProductPath,
    `voice smoke productPath must be ${expectedProductPath}`
  );
  check(
    checks,
    "voice.provider",
    provider === "doubao" || provider === "native-macos",
    "voice smoke must use doubao or native-macos provider"
  );
  if (provider === "native-macos") {
    check(
      checks,
      "voice.speechStatus",
      desktopPreflightBlocked || isNativeSpeechStatus(artifact.speechStatus),
      "native macOS voice smoke must include structured speech status"
    );
  } else {
    check(
      checks,
      "voice.externalInput",
      desktopPreflightBlocked || hasExternalDoubaoInputEvidence(artifact.externalInput),
      "external Doubao voice smoke must prove the input method stayed external and reached the renderer text bridge"
    );
  }
  if (artifact.result === "passed") {
    check(
      checks,
      "voice.providerLifecycle",
      hasVoiceProviderLifecycleEvidence(artifact.providerEvents, provider),
      "passed voice smoke must include listening and stopped provider events"
    );
    check(
      checks,
      "voice.transcript",
      hasFinalVoiceTranscriptEvidence(artifact.transcriptEvents, provider),
      "passed voice smoke must include a final non-empty transcript event"
    );
    if (provider === "native-macos") {
      check(
        checks,
        "voice.nativeTranscriptProvenance",
        hasNativeTranscriptProvenance(artifact.transcriptEvents),
        "passed native macOS voice smoke must include native helper transcript provenance with source, locale, duration, silence timeout, and configured limits"
      );
    }
    if (provider === "doubao") {
      check(
        checks,
        "voice.doubaoTranscript",
        hasConsistentExternalDoubaoTranscript(artifact),
        "passed external Doubao voice smoke must bind external input transcript to the final submitted transcript"
      );
    }
    check(
      checks,
      "voice.downstreamTask",
      hasVoiceDownstreamTaskEvidence(artifact.taskEvents),
      "passed voice smoke must include downstream Computer Use task events"
    );
    check(
      checks,
      "voice.turnReplay",
      hasPassedGhosttyTurnReplayEvidence(artifact.turnReplay),
      "passed voice smoke must include Ghostty turn replay evidence with completed timeline, verified type_text/press_key actions, and non-empty before/after screenshots"
    );
  }
  if (artifact.result === "no-transcript") {
    check(
      checks,
      "voice.noTranscriptLifecycle",
      hasNoTranscriptVoiceLifecycleEvidence(
        artifact.providerEvents,
        artifact.transcriptEvents,
        artifact.taskEvents,
        provider
      ),
      "no-transcript voice smoke must include listening plus no_transcript or cancelled provider state without final transcript or downstream task events"
    );
  }
  check(
    checks,
    "voice.processesAfterCleanup",
    desktopPreflightBlocked || isEmptyArray(artifact.processesAfterCleanup),
    "voice smoke must clean up skfiy app processes"
  );
  check(
    checks,
    "voice.desktopPreflight",
    !artifact.desktopPreflight || desktopPreflightBlocked,
    "voice blocked desktop preflight must prove loginwindow/frontmost session is not controllable"
  );
}

function verifyMoneyRunSmoke(artifact, expectedPath, checks) {
  check(
    checks,
    "moneyRun.artifactPath",
    samePath(artifact.artifactPath, expectedPath),
    "money-run artifactPath must match manifest moneyRunSmokeArtifactPath"
  );
  check(
    checks,
    "moneyRun.result",
    artifact.result === "passed",
    "money-run supervision smoke must pass before it can count as long-horizon evidence"
  );
  check(
    checks,
    "moneyRun.appLaunchViaOpen",
    artifact.appLaunchViaOpen === true,
    "money-run smoke must launch skfiy through open/LaunchServices"
  );
  check(
    checks,
    "moneyRun.runnerHasTmux",
    artifact.runnerHasTmux === false,
    "money-run smoke runner must not be inside tmux"
  );
  check(
    checks,
    "moneyRun.productPath",
    artifact.productPath === MONEY_RUN_PRODUCT_PATH,
    `money-run smoke productPath must be ${MONEY_RUN_PRODUCT_PATH}`
  );
  check(
    checks,
    "moneyRun.readOnly",
    artifact.mutatesSession === false
      && artifact.tmuxSupervisionReport?.mutatesSession === false,
    "money-run supervision evidence must prove it is read-only and does not mutate the tmux session"
  );
  check(
    checks,
    "moneyRun.approval",
    artifact.approvalRequired === true
      || hasTaskEventStatus(artifact.taskEvents, "approval_required")
      || hasTaskEventStatus(artifact.events, "approval_required"),
    "money-run supervision evidence must include approval before reading the tmux session"
  );
  check(
    checks,
    "moneyRun.report",
    artifact.tmuxSupervisionReport?.sessionName === "money-run"
      && typeof artifact.tmuxSupervisionReport?.status === "string"
      && typeof artifact.tmuxSupervisionReport?.summary === "object",
    "money-run supervision evidence must include a tmuxSupervisionReport for the money-run session"
  );
  check(
    checks,
    "moneyRun.processesAfterCleanup",
    isEmptyArray(artifact.processesAfterCleanup),
    "money-run smoke must clean up skfiy app processes"
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
    const expectedSha256 = readString(manifest?.zip?.sha256);
    if (expectedSha256) {
      const actualSha256 = await sha256File(zipPath, io);
      check(
        checks,
        "zip.sha256",
        actualSha256 === expectedSha256,
        `zip sha256 must match manifest zip.sha256 (${actualSha256})`
      );
    }
  } catch (error) {
    check(
      checks,
      "zip.exists",
      false,
      error instanceof Error ? error.message : `zip does not exist: ${zipPath}`
    );
  }
}

async function sha256File(filePath, io) {
  const bytes = typeof io.readFile === "function"
    ? await io.readFile(filePath)
    : await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
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
    readFile,
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

function verifyCurrentAlphaSmokeArtifactPaths({
  manifest,
  uiSmokeArtifactPath,
  smokeArtifactPath,
  chromeSmokeArtifactPath,
  finderSmokeArtifactPath,
  voiceSmokeArtifactPath,
  moneyRunSmokeArtifactPath
}, checks) {
  const commitSha = readString(manifest?.commitSha);
  const shortSha = commitSha ? commitSha.slice(0, 7) : "";
  const mismatched = [];

  if (shortSha.length === 0) {
    check(
      checks,
      "manifest.currentAlphaSmokeArtifactPaths",
      false,
      "manifest smoke artifact paths cannot be matched without commitSha"
    );
    return;
  }

  for (const [key, artifactPath] of Object.entries({
    uiSmokeArtifactPath,
    smokeArtifactPath,
    chromeSmokeArtifactPath,
    finderSmokeArtifactPath,
    voiceSmokeArtifactPath,
    moneyRunSmokeArtifactPath
  })) {
    if (!artifactPathHasAlphaSuffix(artifactPath)) {
      continue;
    }
    if (!path.basename(artifactPath).includes(`-${shortSha}`)) {
      mismatched.push(`${key}=${artifactPath}`);
    }
  }

  check(
    checks,
    "manifest.currentAlphaSmokeArtifactPaths",
    mismatched.length === 0,
    mismatched.length === 0
      ? `manifest smoke artifact paths with alpha suffixes reference current alpha ${shortSha}`
      : `manifest smoke artifact paths with alpha suffixes must reference current alpha ${shortSha}; mismatched ${mismatched.join(", ")}`
  );
}

function artifactPathHasAlphaSuffix(artifactPath) {
  return typeof artifactPath === "string"
    && /-[0-9a-f]{7}(?=[^/]*\.json$)/i.test(path.basename(artifactPath));
}

function readString(value) {
  return typeof value === "string" ? value : undefined;
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function hasDesktopPreflightBlockedEvidence(artifact) {
  const preflight = artifact?.desktopPreflight;
  if (
    artifact?.result !== "blocked"
    || !preflight
    || typeof preflight !== "object"
    || preflight.result !== "blocked"
    || preflight.controllable !== false
    || preflight.productPath !== "packaged helper -> desktop-session-status"
    || preflight.frontmost?.bundleId !== "com.apple.loginwindow"
    || typeof preflight.frontmost?.processIdentifier !== "number"
    || typeof preflight.appPath !== "string"
    || typeof preflight.helperPath !== "string"
    || typeof preflight.reason !== "string"
    || !isDesktopPreflightBlockedReason(preflight)
  ) {
    return false;
  }

  const events = [
    ...(Array.isArray(artifact.events) ? artifact.events : []),
    ...(Array.isArray(artifact.taskEvents) ? artifact.taskEvents : [])
  ];

  return events.some((event) =>
    event?.status === "failed"
      && (
        event.desktopPreflight?.result === "blocked"
        || (
          typeof event.message === "string"
          && event.message.includes(preflight.reason)
        )
      )
  );
}

function isDesktopPreflightBlockedReason(preflight) {
  if (preflight.reason.includes("Desktop session is not controllable")) {
    return true;
  }

  return preflight.display?.mainDisplayAsleep === true
    && preflight.reason.includes("Main display is asleep");
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

function hasPetDragEvidence(petDrag) {
  if (!petDrag || petDrag.result !== "passed") {
    return false;
  }

  return petDrag.source === "renderer-pointer-events-window-bounds"
    && hasWindowBounds(petDrag.beforeBounds)
    && hasWindowBounds(petDrag.afterBounds)
    && Array.isArray(petDrag.moveEvents)
    && petDrag.moveEvents.length > 0
    && Number.isFinite(petDrag.totalDeltaX)
    && Number.isFinite(petDrag.totalDeltaY)
    && petDrag.totalDeltaY < 0
    && petDrag.upwardMovement === true
    && petDrag.suppressedClickAfterDrag === true;
}

function hasStopTurnHotkeyEvidence(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return value.accelerator === REQUIRED_STOP_TURN_HOTKEY.accelerator
    && value.label === REQUIRED_STOP_TURN_HOTKEY.label
    && value.registered === true;
}

function hasStopTurnBehaviorEvidence(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return value.result === "passed"
    && value.source === "renderer-escape-key-product-path"
    && typeof value.command === "string"
    && value.command.trim().length > 0
    && value.beforeStatus === "approval_required"
    && value.afterStatus === "idle"
    && typeof value.afterMessage === "string"
    && value.afterMessage.includes("Task stopped");
}

function hasWindowBounds(bounds) {
  return bounds
    && typeof bounds === "object"
    && Number.isFinite(bounds.x)
    && Number.isFinite(bounds.y)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height);
}

function hasBlockingPermission(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return true;
  }

  return REQUIRED_COMPUTER_USE_PERMISSION_KEYS.some((permission) => {
    const status = permissions?.[permission];
    return !status
      || status.state === "denied"
      || status.state === "not-determined";
  });
}

function hasDesktopSessionDiagnostics(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!["controllable", "blocked", "unknown"].includes(value.state)) {
    return false;
  }

  if (typeof value.reason !== "string" || value.reason.length === 0) {
    return false;
  }

  if (value.status === null) {
    return value.state === "unknown";
  }

  return Boolean(value.status)
    && typeof value.status === "object"
    && typeof value.status.controllable === "boolean";
}

function hasRequiredGhosttyActionVerification(events) {
  return hasVerifiedGhosttyAction(events, "type_text")
    && hasVerifiedGhosttyAction(events, "press_key");
}

function hasRequiredGhosttyScreenshots(screenshots) {
  return hasNonEmptyScreenshotStage(screenshots, "before")
    && hasNonEmptyScreenshotStage(screenshots, "after");
}

function hasNonEmptyScreenshotStage(screenshots, stage) {
  if (!Array.isArray(screenshots)) {
    return false;
  }

  return screenshots.some((screenshot) =>
    screenshot?.stage === stage
      && screenshot.exists === true
      && screenshot.nonEmpty === true
      && Number.isFinite(screenshot.bytes)
      && screenshot.bytes > 0
  );
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

function hasChromeNativeHostBridgeEvidence(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const command = Array.isArray(value.command) ? value.command : [];
  return value.result === "passed"
    && value.productPath === CHROME_NATIVE_HOST_BRIDGE_PRODUCT_PATH
    && typeof command[0] === "string"
    && path.basename(command[0]) === "skfiy"
    && command[1] === "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
    && value.response?.type === "skfiy.native.response"
    && value.response?.requestId === "chrome-smoke-native-host"
    && value.response?.result === "accepted"
    && typeof value.heartbeatPath === "string"
    && value.heartbeatPath.includes("Application Support/skfiy/chrome-extension-connection.json")
    && value.heartbeat?.hostName === "com.sskift.skfiy"
    && value.heartbeat?.launchOrigin === "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
    && value.heartbeat?.messageType === "skfiy.page.observe"
    && value.heartbeat?.requestId === "chrome-smoke-native-host";
}

function hasChromeCurrentPageEvidence(value) {
  return Boolean(value)
    && value.result === "passed"
    && value.command === "观察 Chrome 当前页面并提取正文"
    && typeof value.extractedText === "string"
    && value.extractedText.includes(REQUIRED_CHROME_TEXT)
    && typeof value.pageSnapshot?.url === "string"
    && value.pageSnapshot.url.length > 0
    && typeof value.pageSnapshot?.title === "string"
    && value.pageSnapshot.title.length > 0
    && typeof value.pageSnapshot?.text === "string"
    && value.pageSnapshot.text.includes(REQUIRED_CHROME_TEXT)
    && Array.isArray(value.events)
    && hasTaskEventMessage(value.events, "Verified current_page_snapshot:")
    && hasTaskEventMessage(value.events, "Chrome current page extracted:")
    && !hasTaskEventMessage(value.events, "Verified navigate:");
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

function readExpectedFinderProductPath(targetMode) {
  if (targetMode === "item-drag-drop") {
    return FINDER_ITEM_DRAG_DROP_PRODUCT_PATH;
  }

  if (targetMode === "drag-probe") {
    return FINDER_DRAG_PROBE_PRODUCT_PATH;
  }

  return FINDER_PRODUCT_PATH;
}

function hasFinderPlanPreviewEvidence(value, result, fixtureRoot, targetMode, permissionBlocked = false) {
  if (permissionBlocked) {
    return !value || value.result === "missing" || hasPassedFinderPlanPreviewEvidence(value, fixtureRoot);
  }

  if (!value || typeof value !== "object") {
    return result === "blocked" && isSemanticFinderTargetMode(targetMode);
  }

  if (result === "blocked" && value.result === "missing") {
    return isSemanticFinderTargetMode(targetMode);
  }

  if (!hasPassedFinderPlanPreviewEvidence(value, fixtureRoot)) {
    return false;
  }

  return true;
}

function hasPassedFinderPlanPreviewEvidence(value, fixtureRoot) {
  if (
    !value
    || value.result !== "passed"
    || typeof value.rootPath !== "string"
    || !Number.isFinite(value.operationCount)
    || value.operationCount <= 0
    || value.destructiveOperationCount !== 0
    || !Array.isArray(value.createFolders)
    || !Array.isArray(value.moveFiles)
    || value.moveFiles.length === 0
  ) {
    return false;
  }

  if (typeof fixtureRoot === "string" && path.resolve(value.rootPath) !== path.resolve(fixtureRoot)) {
    return false;
  }

  return ["photo.png", "notes.pdf", "script.ts"].every((fileName) =>
    value.moveFiles.some((move) =>
      typeof move?.from === "string"
        && typeof move?.to === "string"
        && path.basename(move.from) === fileName
        && path.resolve(move.from) !== path.resolve(move.to)
    )
  );
}

function hasFinderPlanConfirmationEvidence(value, result, targetMode) {
  if (!isSemanticFinderTargetMode(targetMode)) {
    return true;
  }

  if (result !== "passed") {
    return true;
  }

  return Boolean(value)
    && value.result === "passed"
    && value.confirmedAfterPreview === true
    && typeof value.reason === "string"
    && value.reason.includes("confirmation after plan preview");
}

function isSemanticFinderTargetMode(targetMode) {
  return targetMode === "current-finder-folder" || targetMode === "selected-finder-folder";
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
  return (
    normalized.includes("desktop session is not controllable")
    || normalized.includes("main display is asleep")
    || normalized.includes("loginwindow is frontmost")
    || (
      normalized.includes("permission")
      && (
        normalized.includes("accessibility")
        || normalized.includes("screen recording")
        || normalized.includes("automation")
      )
    )
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

function hasPermissionBlockedFinderSmoke(artifact) {
  return artifact?.result === "blocked"
    && (
      hasPermissionBlockedFinderObservation(artifact.finderObservation)
      || hasPermissionBlockedFinderSemanticObservation(artifact.finderSemanticObservation)
      || hasPermissionBlockedFinderItemDragDrop(artifact.finderItemDragDrop)
      || hasDeniedFinderPermission(artifact.permissions)
    );
}

function hasDeniedFinderPermission(permissions) {
  return permissions?.screenRecording?.state === "denied"
    || permissions?.accessibility?.state === "denied";
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

function hasTaskEventStatus(events, status) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) => event?.status === status);
}

function readVoiceProvider(artifact) {
  if (artifact?.provider === "native-macos") {
    return "native-macos";
  }

  return "doubao";
}

function readExpectedVoiceProductPath(provider) {
  return provider === "native-macos"
    ? NATIVE_MACOS_VOICE_PRODUCT_PATH
    : DOUBAO_EXTERNAL_VOICE_PRODUCT_PATH;
}

function hasExternalDoubaoInputEvidence(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.source === "doubao-input-method"
    && value.embedded === false
    && typeof value.textBridge === "string"
    && value.textBridge.trim().length > 0
  );
}

function hasConsistentExternalDoubaoTranscript(artifact) {
  const externalTranscript = readTrimmedString(artifact?.externalInput?.transcript);
  const finalTranscript = readFinalVoiceTranscriptText(artifact?.transcriptEvents, "doubao");

  return Boolean(
    externalTranscript
    && finalTranscript
    && externalTranscript === finalTranscript
  );
}

function hasVoiceProviderLifecycleEvidence(events, provider) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) =>
    event?.providerId === provider && event.state === "listening"
  ) && events.some((event) =>
    event?.providerId === provider && event.state === "stopped"
  );
}

function hasFinalVoiceTranscriptEvidence(events, provider) {
  return Boolean(readFinalVoiceTranscriptEvent(events, provider));
}

function readFinalVoiceTranscriptText(events, provider) {
  return readTrimmedString(readFinalVoiceTranscriptEvent(events, provider)?.text);
}

function readFinalVoiceTranscriptEvent(events, provider) {
  if (!Array.isArray(events)) {
    return undefined;
  }

  return events.find((event) =>
    event?.providerId === provider
      && event.isFinal === true
      && typeof event.text === "string"
      && event.text.trim().length > 0
  );
}

function hasNativeTranscriptProvenance(events) {
  const provenance = readFinalVoiceTranscriptEvent(events, "native-macos")?.provenance;

  return Boolean(
    provenance
      && typeof provenance === "object"
      && provenance.source === "native-macos-speech-helper"
      && typeof provenance.locale === "string"
      && provenance.locale.trim().length > 0
      && readOptionalPositiveNumber(provenance.durationMs) > 0
      && typeof provenance.silenceTimedOut === "boolean"
      && readOptionalPositiveNumber(provenance.maxDurationMs) > 0
      && readOptionalPositiveNumber(provenance.silenceTimeoutMs) > 0
  );
}

function readTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasVoiceDownstreamTaskEvidence(events) {
  if (!Array.isArray(events)) {
    return false;
  }

  return events.some((event) =>
    typeof event?.status === "string"
      && [
        "approval_required",
        "observing",
        "executing",
        "needs_confirmation",
        "completed",
        "failed"
      ].includes(event.status)
  );
}

function hasPassedGhosttyTurnReplayEvidence(turnReplay) {
  if (!turnReplay || typeof turnReplay !== "object") {
    return false;
  }

  const transcript = turnReplay.transcript;
  const timeline = Array.isArray(turnReplay.timeline) ? turnReplay.timeline : [];

  return Boolean(transcript)
    && typeof transcript === "object"
    && transcript.outcome === "completed"
    && timeline.some((event) => event?.status === "completed")
    && hasGhosttyTurnReplayApp(transcript.apps)
    && hasGhosttyTurnReplayScreenshots(transcript.screenshots)
    && hasGhosttyTurnReplayActions(transcript.actions);
}

function hasGhosttyTurnReplayApp(apps) {
  return Array.isArray(apps)
    && apps.some((app) => app?.bundleId === "com.mitchellh.ghostty");
}

function hasGhosttyTurnReplayScreenshots(screenshots) {
  if (!Array.isArray(screenshots)) {
    return false;
  }

  const before = screenshots.find((screenshot) =>
    screenshot?.stage === "before"
      && screenshot.bundleId === "com.mitchellh.ghostty"
      && typeof screenshot.path === "string"
      && screenshot.path.trim().length > 0
      && readOptionalPositiveNumber(screenshot.bytes) > 0
  );
  const after = screenshots.find((screenshot) =>
    screenshot?.stage === "after"
      && screenshot.bundleId === "com.mitchellh.ghostty"
      && typeof screenshot.path === "string"
      && screenshot.path.trim().length > 0
      && readOptionalPositiveNumber(screenshot.bytes) > 0
  );

  return Boolean(before && after);
}

function hasGhosttyTurnReplayActions(actions) {
  if (!Array.isArray(actions)) {
    return false;
  }

  return actions.some((action) => action?.type === "type_text")
    && actions.some((action) => action?.type === "press_key")
    && actions.some((action) =>
      action?.type === "verify"
        && action.actionType === "type_text"
        && action.status === "passed"
    )
    && actions.some((action) =>
      action?.type === "verify"
        && action.actionType === "press_key"
        && action.status === "passed"
    );
}

function readOptionalPositiveNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function hasNoTranscriptVoiceLifecycleEvidence(providerEvents, transcriptEvents, taskEvents, provider) {
  if (!Array.isArray(providerEvents)) {
    return false;
  }

  const listened = providerEvents.some((event) =>
    event?.providerId === provider && event.state === "listening"
  );
  const endedWithoutTranscript = providerEvents.some((event) =>
    event?.providerId === provider
      && (event.state === "no_transcript" || event.state === "cancelled")
  );

  return listened
    && endedWithoutTranscript
    && !hasFinalVoiceTranscriptEvidence(transcriptEvents, provider)
    && !hasVoiceDownstreamTaskEvidence(taskEvents);
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

function hasRequiredGhosttyNonComputerUseRouteGuardRuns(runs) {
  if (!Array.isArray(runs)) {
    return false;
  }

  return NON_COMPUTER_USE_ROUTE_GUARD_RUNS.every((requiredRun) =>
    runs.some((run) => isNonComputerUseRouteGuardRun(run, requiredRun))
  );
}

function isNonComputerUseRouteGuardRun(run, requiredRun) {
  return run?.id === requiredRun.id
    && run.result === requiredRun.result
    && Array.isArray(run.events)
    && run.events.some((event) =>
      event?.status === requiredRun.eventStatus
      && typeof event.message === "string"
      && event.message.includes(requiredRun.messageIncludes)
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
  --require-passed      Fail unless UI, Ghostty, Chrome, Finder, and selected voice smoke results are passed, including panic stop runtime hotkey and stopTurnBehavior evidence, Chrome Native Messaging heartbeat evidence, Chrome current-page observation evidence, external Doubao voice transcript-to-task evidence, and external Doubao voice Ghostty turn replay evidence.
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
